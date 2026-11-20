const fs = require("node:fs/promises");
const { readdirSync, statSync } = require("node:fs");
const { revision, withWriteLock, atomicWrite } = require("./storage.cjs");
const { randomUUID } = require("node:crypto");
const { parseEntryMessage, parseSpentToMinutes, isDateLiteral, filterEntries, buildEntryMessage } = require("./entry-domain.cjs");
const os = require("node:os");
const path = require("node:path");

const DATE_PATTERN = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
const ISO_WEEK_PATTERN = /^([0-9]{4})-W([0-9]{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_BACKUP_BYTES = 100 * 1024 * 1024;

class TavriCoreError extends Error {
  constructor(message) {
    super(message);
    this.name = "TavriCoreError";
  }
}

function defaultLogDir(homeDir = os.homedir()) {
  const current = path.join(homeDir, "Documents", "tavri");
  const legacy = path.join(homeDir, "Documents", "worktrace");
  const isDirectory = (dir) => statSync(dir, { throwIfNoEntry: false })?.isDirectory() || false;
  const hasLogs = (dir) => {
    try { return readdirSync(dir, { withFileTypes: true }).some(entry => entry.isFile() && /^\d{4}-(?:\d{2}-\d{2}|W\d{2})\.log$/.test(entry.name)); }
    catch { return false; }
  };
  return isDirectory(legacy) && (!isDirectory(current) || !hasLogs(current) && hasLogs(legacy)) ? legacy : current;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatUtcDate(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function formatLocalDate(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatLocalDateTime(date = new Date()) {
  return `${formatLocalDate(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function parseDateLiteral(value) {
  const match = DATE_PATTERN.exec(value || "");
  if (!match) {
    throw new TavriCoreError(`invalid date: ${value}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new TavriCoreError(`invalid date: ${value}`);
  }

  return date;
}

function weekStartForDate(value) {
  const date = parseDateLiteral(value);
  const isoDay = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  const weekStart = new Date(date.getTime() - (isoDay - 1) * DAY_MS);
  return formatUtcDate(weekStart);
}

function isoWeekForDate(value) {
  const date = parseDateLiteral(value);
  const isoDay = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  const thursday = new Date(date.getTime() + (4 - isoDay) * DAY_MS);
  const isoYear = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4IsoDay = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const firstMonday = new Date(jan4.getTime() - (jan4IsoDay - 1) * DAY_MS);
  const currentMonday = new Date(parseDateLiteral(weekStartForDate(value)).getTime());
  const weekNumber = Math.floor((currentMonday.getTime() - firstMonday.getTime()) / (7 * DAY_MS)) + 1;
  return `${isoYear}-W${pad2(weekNumber)}`;
}

function weekStartForIsoWeek(value) {
  const match = ISO_WEEK_PATTERN.exec(value || "");
  if (!match) {
    throw new TavriCoreError(`invalid ISO week: ${value}`);
  }

  const isoYear = Number(match[1]);
  const isoWeek = Number(match[2]);

  if (isoWeek < 1 || isoWeek > 53) {
    throw new TavriCoreError(`invalid ISO week: ${value}`);
  }

  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4IsoDay = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const firstMonday = new Date(jan4.getTime() - (jan4IsoDay - 1) * DAY_MS);
  const weekStart = new Date(firstMonday.getTime() + (isoWeek - 1) * 7 * DAY_MS);
  const weekStartText = formatUtcDate(weekStart);

  if (isoWeekForDate(weekStartText) !== value) {
    throw new TavriCoreError(`invalid ISO week: ${value}`);
  }

  return weekStartText;
}

function weekStartFromRef(ref, today = formatLocalDate()) {
  const value = ref || today;

  if (DATE_PATTERN.test(value)) {
    return weekStartForDate(value);
  }

  if (ISO_WEEK_PATTERN.test(value)) {
    return weekStartForIsoWeek(value);
  }

  throw new TavriCoreError(`invalid week reference: ${value}`);
}

function normalizeLogText(text) {
  const normalized = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n+$/, "");
  return normalized ? `${normalized}\n` : "";
}

function parseEntryLine(line, index) {
  const date = line.slice(0, 10);
  const hasTimestamp = line.slice(10, 11) === " " && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} /.test(line);
  const hasDateOnlySeparator = line.slice(10, 11) === " ";
  const time = hasTimestamp ? line.slice(11, 16) : "";
  const message = hasTimestamp ? line.slice(17) : hasDateOnlySeparator ? line.slice(11) : line;

  return {
    id: `${index}-${line}`,
    date,
    time,
    message,
    line,
    valid: isDateLiteral(date) && (!time || /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) && (hasTimestamp || hasDateOnlySeparator),
  };
}

function parseEntries(text) {
  return normalizeLogText(text)
    .split("\n")
    .map(parseEntryLine)
    .filter(entry => entry.line);
}

function formatWeekAsPlainText(week) {
  return normalizeLogText(week && week.text ? week.text : "");
}

function sortWeekStartsDescending(left, right) {
  return String(right).localeCompare(String(left));
}

function escapeCsvCell(value) {
  const raw = String(value ?? "");
  const text = /^[\s]*[=+@-]/.test(raw) ? `'${raw}` : raw;

  if (!/[",\n\r]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function formatEntriesAsCsv(entries) {
  const rows = [["date", "time", "message", "status", "duration_minutes", "project", "reference"]];
  for (const entry of entries || []) {
    const meta = parseEntryMessage(entry.message);
    rows.push([entry.date || "", entry.time || "", meta.message, meta.status, meta.timeSpent ? parseSpentToMinutes(meta.timeSpent) || "" : "", meta.project, meta.reference]);
  }

  return `${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n")}\n`;
}

class TavriStore {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.logDir = options.logDir || this.env.TAVRI_LOGDIR || this.env.WORKTRACE_LOGDIR || defaultLogDir(options.homeDir);
    this.todayOverride = options.today || this.env.TAVRI_TODAY || this.env.WORKTRACE_TODAY || "";
    this.undoTokens = new Map();
    this.now = typeof options.now === "function" ? options.now : () => new Date();
  }

  todayDate() {
    if (!this.todayOverride) {
      return formatLocalDate();
    }

    parseDateLiteral(this.todayOverride);
    return this.todayOverride;
  }

  weekStart(ref = "") {
    return weekStartFromRef(ref, this.todayDate());
  }

  weekPath(ref = "") {
    return path.join(this.logDir, `${this.weekStart(ref)}.log`);
  }

  transactionPath() { return path.join(this.logDir, ".tavri-transaction.json"); }
  focusPath() { return path.join(this.logDir, ".tavri-focus.json"); }
  emptyFocus() { return JSON.stringify({ version: 1, tasks: [] }, null, 2) + "\n"; }
  validateFocus(text) {
    if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > 1024 * 1024) throw new TavriCoreError("The focus plan in this backup is too large.");
    let data;
    try { data = JSON.parse(text); } catch { throw new TavriCoreError("The focus plan in this backup is invalid."); }
    const { validateTask } = require("./focus-store.cjs");
    if (data?.version !== 1 || !Array.isArray(data.tasks) || data.tasks.length > 500 || !data.tasks.every(validateTask)) throw new TavriCoreError("The focus plan in this backup is invalid.");
    return text;
  }

  eventDir() { return path.join(this.logDir, ".tavri-events"); }

  async recoverTransactionUnlocked() {
    const text = await this.readTextIfExists(this.transactionPath());
    if (!text) return false;
    let transaction;
    try { transaction = JSON.parse(text); } catch { throw new TavriCoreError("An interrupted log operation needs manual recovery. The transaction file is invalid."); }
    const files = transaction?.files;
    if (![1, 2].includes(transaction.version) || !files || typeof files !== "object" || Array.isArray(files) ||
        (!Object.keys(files).length && transaction.version === 1) || Object.keys(files).length > 2000 ||
        Object.entries(files).some(([ref, content]) => !isDateLiteral(ref) || this.weekStart(ref) !== ref || typeof content !== "string")) {
      throw new TavriCoreError("An interrupted log operation needs manual recovery. The transaction file is invalid.");
    }
    if (transaction.version === 2) this.validateFocus(transaction.focus);
    if (transaction.event) {
      const event = transaction.event;
      if (typeof event.id !== "string" || !/^[a-f0-9-]{36}$/.test(event.id) || typeof event.at !== "string" || typeof event.kind !== "string") {
        throw new TavriCoreError("An interrupted log operation has an invalid change record.");
      }
    }
    for (const [ref, content] of Object.entries(files)) await atomicWrite(this.weekPath(ref), content);
    if (transaction.version === 2) await atomicWrite(this.focusPath(), transaction.focus);
    if (transaction.event) {
      const event = transaction.event;
      await fs.mkdir(this.eventDir(), { recursive: true });
      await atomicWrite(path.join(this.eventDir(), `${event.at.replace(/[:.]/g, "-")}-${event.id}.json`), JSON.stringify(event) + "\n");
    }
    await fs.unlink(this.transactionPath());
    return true;
  }

  async recoverPendingTransaction() {
    if (!await this.readTextIfExists(this.transactionPath())) return false;
    return withWriteLock(this.logDir, () => this.recoverTransactionUnlocked());
  }

  async commitTransactionUnlocked(files, event = null, focus = null) {
    const record = event ? { id: randomUUID(), at: this.now().toISOString(), ...event } : null;
    const previous = {};
    for (const ref of Object.keys(files)) {
      const filePath = this.weekPath(ref);
      try { previous[ref] = { exists: (await fs.stat(filePath)).isFile(), text: await fs.readFile(filePath, "utf8") }; }
      catch (error) { if (error.code === "ENOENT") previous[ref] = { exists: false, text: "" }; else throw error; }
    }
    const previousFocus = focus === null ? null : await this.readTextIfExists(this.focusPath());
    if (focus !== null) this.validateFocus(focus);
    await atomicWrite(this.transactionPath(), JSON.stringify({ version: focus === null ? 1 : 2, files, focus, event: record }) + "\n");
    try { await this.recoverTransactionUnlocked(); }
    catch (error) {
      try {
        for (const [ref, old] of Object.entries(previous)) {
          const filePath = this.weekPath(ref);
          const current = await this.readTextIfExists(filePath);
          if (current !== old.text) {
            if (old.exists) await atomicWrite(filePath, old.text);
            else await fs.rm(filePath, { force: true });
          }
        }
        if (previousFocus !== null) {
          if (previousFocus) await atomicWrite(this.focusPath(), previousFocus);
          else await fs.rm(this.focusPath(), { force: true });
        }
        await fs.rm(this.transactionPath(), { force: true });
      } catch { /* Keep the journal for automatic recovery if rollback failed. */ }
      throw error;
    }
  }

  async readRecentChanges(limit = 100) {
    await this.recoverPendingTransaction();
    let names;
    try { names = await fs.readdir(this.eventDir()); }
    catch (error) { if (error.code === "ENOENT") return []; throw error; }
    const selected = names.filter(name => /^[0-9TZ-]+-[a-f0-9-]{36}\.json$/.test(name)).sort().reverse().slice(0, Math.min(200, Math.max(1, limit)));
    const events = [];
    for (const name of selected) {
      try { events.push(JSON.parse(await fs.readFile(path.join(this.eventDir(), name), "utf8"))); }
      catch { /* A damaged record does not hide the remaining history. */ }
    }
    return events;
  }

  async ensureLogDir() {
    await fs.mkdir(this.logDir, { recursive: true });
  }

  async readTextIfExists(filePath) {
    try {
      return await fs.readFile(filePath, "utf8");
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return "";
      }
      throw error;
    }
  }

  async listAvailableWeeks() {
    try {
      const entries = await fs.readdir(this.logDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && /^([0-9]{4}-[0-9]{2}-[0-9]{2})\.log$/.test(entry.name))
        .map((entry) => entry.name.slice(0, -4))
        .sort(sortWeekStartsDescending);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  makeBackup(files, focus = null) {
    return focus === null
      ? { format: "tavri-personal-backup", version: 1, createdAt: this.now().toISOString(), files, checksum: revision(JSON.stringify(files)) }
      : { format: "tavri-personal-backup", version: 2, createdAt: this.now().toISOString(), files, focus, checksum: revision(JSON.stringify([files, focus])) };
  }

  validateBackup(backup) {
    const files = backup?.files;
    if (backup?.format !== "tavri-personal-backup" || ![1, 2].includes(backup.version) || !files || typeof files !== "object" || Array.isArray(files) ||
        Object.keys(files).length > 2000 || Object.entries(files).some(([ref, content]) => !isDateLiteral(ref) || this.weekStart(ref) !== ref || typeof content !== "string") ||
        Buffer.byteLength(JSON.stringify(files), "utf8") > MAX_BACKUP_BYTES || backup.checksum !== revision(backup.version === 2 ? JSON.stringify([files, backup.focus]) : JSON.stringify(files))) {
      throw new TavriCoreError("This is not a valid Tavri personal backup, or its contents changed.");
    }
    if (backup.version === 2) this.validateFocus(backup.focus);
    return files;
  }

  async createBackup() {
    await this.recoverPendingTransaction();
    const refs = await this.listAvailableWeeks();
    if (refs.length > 2000) throw new TavriCoreError("The journal has too many weekly files for one backup.");
    const files = {};
    for (const ref of refs) files[ref] = await this.readTextIfExists(this.weekPath(ref));
    const backup = this.makeBackup(files, (await this.readTextIfExists(this.focusPath())) || this.emptyFocus());
    this.validateBackup(backup);
    return backup;
  }

  async previewRestore(backup) {
    const files = this.validateBackup(backup);
    await this.recoverPendingTransaction();
    const expected = {};
    let changed = 0, added = 0, activities = 0;
    for (const [ref, content] of Object.entries(files)) {
      const current = await this.readTextIfExists(this.weekPath(ref));
      expected[ref] = revision(current);
      if (!current) added += 1;
      else if (current !== content) changed += 1;
      activities += parseEntries(content).filter(entry => entry.valid).length;
    }
    if (backup.version === 2) expected.focusRevision = revision(await this.readTextIfExists(this.focusPath()));
    return { weeks: Object.keys(files).length, activities, changed, added, focusTasks: backup.version === 2 ? JSON.parse(backup.focus).tasks.length : null, expected, createdAt: backup.createdAt };
  }

  async restoreBackup(backup, expected) {
    const files = this.validateBackup(backup);
    if (!expected || typeof expected !== "object" || Object.keys(expected).length !== Object.keys(files).length + (backup.version === 2 ? 1 : 0)) {
      throw new TavriCoreError("Preview the backup again before restoring it.");
    }
    return withWriteLock(this.logDir, async () => {
      await this.recoverTransactionUnlocked();
      const previous = {};
      for (const ref of Object.keys(files)) {
        previous[ref] = await this.readTextIfExists(this.weekPath(ref));
        if (revision(previous[ref]) !== expected[ref]) throw new TavriCoreError("The journal changed after the preview. Preview the backup again.");
      }
      const previousFocus = backup.version === 2 ? await this.readTextIfExists(this.focusPath()) : null;
      if (backup.version === 2 && revision(previousFocus) !== expected.focusRevision) throw new TavriCoreError("The focus plan changed after preview. Preview the backup again.");
      const recoveryDir = path.join(this.logDir, ".tavri-recovery");
      await fs.mkdir(recoveryDir, { recursive: true });
      const recoveryFile = path.join(recoveryDir, `${this.now().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.tavri-backup.json`);
      await atomicWrite(recoveryFile, JSON.stringify(this.makeBackup(previous, previousFocus === null ? null : previousFocus || this.emptyFocus()), null, 2) + "\n");
      if (Object.keys(files).length || backup.version === 2) await this.commitTransactionUnlocked(files, { kind: "backup-restored", weeks: Object.keys(files).length }, backup.version === 2 ? backup.focus : null);
      return { weeks: Object.keys(files).length, recoveryFile };
    });
  }

  async addEntry(message, time = "", date = "") {
    const cleanMessage = String(message || "").trim();
    const cleanTime = String(time || "").trim();
    const cleanDate = String(date || "").trim();

    if (!cleanMessage) {
      throw new TavriCoreError("missing entry message");
    }

    if (cleanMessage.includes("\n") || cleanMessage.includes("\r")) {
      throw new TavriCoreError("entry message must be a single line");
    }

    if (cleanTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(cleanTime)) throw new TavriCoreError("Use a valid time (HH:MM).");
    const today = this.todayDate();
    const entryDate = cleanDate || today;
    if (cleanDate && !DATE_PATTERN.test(cleanDate)) {
      throw new TavriCoreError(`invalid date: ${cleanDate}`);
    }
    const filePath = this.weekPath(entryDate);
    const timestamp = cleanTime ? `${entryDate} ${cleanTime}` : formatLocalDateTime(this.now()).replace(/^([0-9]{4}-[0-9]{2}-[0-9]{2})/, entryDate);
    const line = `${timestamp} ${cleanMessage}`;

    await withWriteLock(this.logDir, async () => {
      await this.recoverTransactionUnlocked();
      const existing = await this.readTextIfExists(filePath);
      await this.commitTransactionUnlocked({ [this.weekStart(entryDate)]: normalizeLogText(existing) + `${line}\n` }, { kind: "added", week: this.weekStart(entryDate), after: line });
    });

    return {
      date: entryDate,
      time: timestamp.slice(11, 16),
      message: cleanMessage,
      line,
      filePath,
    };
  }

  async recordTaskStatus(task, status, date = "") {
    const entryDate = String(date || this.todayDate()).trim();
    if (!isDateLiteral(entryDate)) throw new TavriCoreError("Choose a valid status date.");
    if (!task || !/^[a-f0-9-]{36}$/.test(task.id || "") || !String(task.title || "").trim()) throw new TavriCoreError("Choose a valid focus task.");
    if (!["in-progress", "done"].includes(status)) throw new TavriCoreError("Choose a valid activity status.");
    const message = buildEntryMessage(task.title, "", task.project, task.reference, task.id, status);
    const weekRef = this.weekStart(entryDate);
    await withWriteLock(this.logDir, async () => {
      await this.recoverTransactionUnlocked();
      const week = await this.readWeekUnlocked(weekRef);
      const existing = week.entries.find(entry => entry.date === entryDate && (() => {
        const meta = parseEntryMessage(entry.message);
        return meta.taskId === task.id && Boolean(meta.status);
      })());
      const now = this.now();
      const time = existing?.time || `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
      const nextLine = `${entryDate} ${time} ${message}`;
      if (existing?.line === nextLine) return;
      const lines = week.text.split("\n");
      if (existing) lines[Number(existing.id.split("-")[0])] = nextLine;
      else lines.splice(lines.length - 1, 0, nextLine);
      const nextText = normalizeLogText(lines.join("\n"));
      const backupDir = path.join(this.logDir, ".backups");
      await fs.mkdir(backupDir, { recursive: true });
      await atomicWrite(path.join(backupDir, `${week.weekStart}.log`), week.text);
      await this.commitTransactionUnlocked({ [week.weekStart]: nextText }, {
        kind: existing ? "task-status-updated" : "task-status-added",
        week: week.weekStart,
        before: existing?.line || "",
        after: nextLine,
      });
    });
    return this.getState(entryDate);
  }

  async readWeekUnlocked(ref = "") {
    const weekStart = this.weekStart(ref);
    const filePath = this.weekPath(weekStart);
    const text = await this.readTextIfExists(filePath);

    return {
      weekStart,
      filePath,
      revision: revision(text),
      text: normalizeLogText(text),
      entries: parseEntries(text),
    };
  }

  async readWeek(ref = "") {
    await this.recoverPendingTransaction();
    return this.readWeekUnlocked(ref);
  }

  async readToday() {
    const today = this.todayDate();
    const week = await this.readWeek(today);

    return {
      date: today,
      weekStart: week.weekStart,
      revision: week.revision,
      entries: week.entries.filter((entry) => entry.date === today),
    };
  }

  async mutateWeek(ref, expectedRevision, change, eventBuilder = null) {
    return withWriteLock(this.logDir, async () => {
      await this.recoverTransactionUnlocked();
      const week = await this.readWeekUnlocked(ref);
      if (expectedRevision && expectedRevision !== week.revision) {
        throw new TavriCoreError("This week changed elsewhere. Refresh before saving. Your draft is still here.");
      }
      const nextText = normalizeLogText(await change(week));
      // Preserve the previous version before every destructive operation.
      const backupDir = path.join(this.logDir, ".backups");
      await fs.mkdir(backupDir, { recursive: true });
      await atomicWrite(path.join(backupDir, `${week.weekStart}.log`), week.text);
      await this.commitTransactionUnlocked({ [week.weekStart]: nextText }, eventBuilder ? eventBuilder(week, nextText) : { kind: "weekly-file-edited", week: week.weekStart });
      return this.readWeekUnlocked(ref);
    });
  }

  async saveWeek(ref, text, expectedRevision, kind = "weekly-file-edited") {
    return this.mutateWeek(ref, expectedRevision, () => String(text || ""), week => ({ kind, week: week.weekStart }));
  }

  findEntry(week, target) {
    const matches = week.entries.filter(entry => typeof target === "object" && target
      ? entry.id === target.id && entry.line === target.line
      : entry.line === target);
    if (matches.length !== 1) throw new TavriCoreError("The entry changed or is ambiguous. Refresh and try again.");
    return matches[0];
  }

  async deleteEntry(ref, target, expectedRevision) {
    let previous, removed;
    const week = await this.mutateWeek(ref, expectedRevision, current => {
      const entry = this.findEntry(current, target);
      removed = entry.line;
      previous = current.text;
      const lines = current.text.split("\n");
      lines.splice(Number(entry.id.split("-")[0]), 1);
      return lines.join("\n");
    }, current => ({ kind: "deleted", week: current.weekStart, before: removed }));
    const token = randomUUID();
    this.undoTokens.set(token, { ref: week.weekStart, revision: week.revision, text: previous });
    if (this.undoTokens.size > 20) this.undoTokens.delete(this.undoTokens.keys().next().value);
    return { ...week, undoToken: token };
  }

  async undoDelete(token) {
    const undo = this.undoTokens.get(token);
    if (!undo) throw new TavriCoreError("This undo is no longer available.");
    const week = await this.saveWeek(undo.ref, undo.text, undo.revision, "deletion-undone");
    this.undoTokens.delete(token);
    return week;
  }

  async cloneEntry(ref, target, expectedRevision) {
    let cloned;
    return this.mutateWeek(ref, expectedRevision, week => {
      const entry = this.findEntry(week, target);
      cloned = entry.line;
      return week.text + entry.line + "\n";
    }, week => ({ kind: "duplicated", week: week.weekStart, after: cloned }));
  }

  async editEntry(ref, target, date, time, message, expectedRevision) {
    const cleanMessage = String(message || "").trim();
    const cleanTime = String(time || "").trim();
    if (!cleanMessage) throw new TavriCoreError("missing entry message");
    if (/[\n\r]/.test(cleanMessage)) throw new TavriCoreError("entry message must be a single line");
    if (cleanTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(cleanTime)) throw new TavriCoreError("Use a valid time (HH:MM).");
    const nextDate = String(date || "").trim();
    if (nextDate && !isDateLiteral(nextDate)) throw new TavriCoreError("Choose a valid date.");
    if (nextDate && this.weekStart(nextDate) !== this.weekStart(ref)) {
      return withWriteLock(this.logDir, async () => {
        await this.recoverTransactionUnlocked();
        const source = await this.readWeekUnlocked(ref);
        if (expectedRevision !== source.revision) throw new TavriCoreError("This week changed elsewhere. Refresh before saving. Your draft is still here.");
        const entry = this.findEntry(source, target);
        const destination = await this.readWeekUnlocked(nextDate);
        const sourceLines = source.text.split("\n");
        sourceLines.splice(Number(entry.id.split("-")[0]), 1);
        const nextSource = normalizeLogText(sourceLines.join("\n"));
        const nextDestination = normalizeLogText(destination.text) + `${nextDate}${cleanTime ? ` ${cleanTime}` : ""} ${cleanMessage}\n`;
        const backupDir = path.join(this.logDir, ".backups");
        await fs.mkdir(backupDir, { recursive: true });
        await atomicWrite(path.join(backupDir, `${source.weekStart}.log`), source.text);
        await atomicWrite(path.join(backupDir, `${destination.weekStart}.log`), destination.text);
        await this.commitTransactionUnlocked({ [destination.weekStart]: nextDestination, [source.weekStart]: nextSource }, { kind: "moved", fromWeek: source.weekStart, week: destination.weekStart, before: entry.line, after: `${nextDate}${cleanTime ? ` ${cleanTime}` : ""} ${cleanMessage}` });
        return this.readWeekUnlocked(destination.weekStart);
      });
    }
    let oldLine, newLine;
    return this.mutateWeek(ref, expectedRevision, week => {
      const entry = this.findEntry(week, target);
      oldLine = entry.line;
      const chosenDate = nextDate || entry.date;
      const lines = week.text.split("\n");
      newLine = `${chosenDate}${cleanTime ? ` ${cleanTime}` : ""} ${cleanMessage}`;
      lines[Number(entry.id.split("-")[0])] = newLine;
      return lines.join("\n");
    }, week => ({ kind: "edited", week: week.weekStart, before: oldLine, after: newLine }));
  }

  async readYear(year) {
    if (!Number.isInteger(year) || year < 1900 || year > 9998) throw new TavriCoreError("Choose a valid year (1900–9998).");
    const start = `${String(year).padStart(4, "0")}-01-01`;
    const end = `${String(year).padStart(4, "0")}-12-31`;
    const first = parseDateLiteral(weekStartForDate(start));
    const refs = [];
    for (let date = first; formatUtcDate(date) <= end; date = new Date(date.getTime() + 7 * DAY_MS)) refs.push(formatUtcDate(date));
    const weeks = [];
    // Bound I/O and retain revisions for empty weeks as well as existing files.
    for (let index = 0; index < refs.length; index += 8) weeks.push(...await Promise.all(refs.slice(index, index + 8).map(ref => this.readWeek(ref))));
    return {
      year,
      revision: revision(JSON.stringify(weeks.map(week => [week.weekStart, week.revision]))),
      revisions: Object.fromEntries(weeks.map(week => [week.weekStart, week.revision])),
      entries: weeks.flatMap(week => week.entries.filter(entry => isDateLiteral(entry.date) && entry.date >= start && entry.date <= end)
        .map(entry => ({ ...entry, sourceWeek: week.weekStart, sourceRevision: week.revision }))),
    };
  }

  async readRange(start, end) {
    if (!isDateLiteral(start) || !isDateLiteral(end) || start < "1900-01-01" || end > "9998-12-31" || start > end) {
      throw new TavriCoreError("Choose valid From and To dates (1900–9998), with From before To.");
    }
    await this.recoverPendingTransaction();
    const firstWeek = this.weekStart(start);
    const lastWeek = this.weekStart(end);
    const refs = (await this.listAvailableWeeks())
      .filter(ref => ref >= firstWeek && ref <= lastWeek && isDateLiteral(ref) && this.weekStart(ref) === ref)
      .sort();
    const weeks = [];
    for (let index = 0; index < refs.length; index += 8) {
      weeks.push(...await Promise.all(refs.slice(index, index + 8).map(ref => this.readWeek(ref))));
    }
    return {
      start,
      end,
      revision: revision(JSON.stringify([start, end, weeks.map(week => [week.weekStart, week.revision])])),
      entries: weeks.flatMap(week => week.entries
        .filter(entry => isDateLiteral(entry.date) && entry.date >= start && entry.date <= end)
        .map(entry => ({ ...entry, sourceWeek: week.weekStart, sourceRevision: week.revision }))),
    };
  }

  async searchArchive(raw = {}) {
    const query = String(raw.query || "").trim().slice(0, 200);
    const project = String(raw.project || "").trim().slice(0, 120);
    const start = String(raw.start || "");
    const end = String(raw.end || "");
    if ((start && !isDateLiteral(start)) || (end && !isDateLiteral(end)) || (start && end && start > end)) {
      throw new TavriCoreError("Choose valid From and To dates, with From before To.");
    }
    await this.recoverPendingTransaction();
    const refs = await this.listAvailableWeeks();
    const firstWeek = start ? this.weekStart(start) : "";
    const lastWeek = end ? this.weekStart(end) : "";
    const entries = [];
    let total = 0;
    for (const ref of refs) {
      if (firstWeek && ref < firstWeek || lastWeek && ref > lastWeek) continue;
      const week = await this.readWeekUnlocked(ref);
      const matches = filterEntries(week.entries, { query, project, start, end });
      total += matches.length;
      for (const entry of matches) entries.push({ ...entry, sourceWeek: ref, sourceRevision: week.revision });
    }
    entries.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
    return { total, entries: entries.slice(0, 200), limit: 200 };
  }

  async getState(ref = "") {
    const week = await this.readWeek(ref);
    const today = await this.readToday();
    const availableWeeks = await this.listAvailableWeeks();

    return {
      config: {
        logDir: this.logDir,
        currentFile: this.weekPath(this.todayDate()),
      },
      availableWeeks,
      today,
      week,
    };
  }
}

module.exports = {
  TavriCoreError,
  TavriStore,
  defaultLogDir,
  escapeCsvCell,
  formatEntriesAsCsv,
  formatLocalDate,
  formatLocalDateTime,
  formatUtcDate,
  formatWeekAsPlainText,
  normalizeLogText,
  parseDateLiteral,
  parseEntries,
  sortWeekStartsDescending,
  weekStartForDate,
  weekStartForIsoWeek,
  weekStartFromRef,
};
