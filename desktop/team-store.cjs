const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { TavriCoreError, normalizeLogText, parseEntries, weekStartForDate } = require("./tavri-core.cjs");
const { parseEntryMessage, parseSpentToMinutes, isDateLiteral } = require("./entry-domain.cjs");
const { atomicWrite, revision, withWriteLock } = require("./storage.cjs");
const { unzipSync } = require("fflate");

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_WORKSPACE_BYTES = 30 * 1024 * 1024;
const MAX_IMPORT_FILES = 250;

function cleanPersonName(value) {
  const raw = String(value || "");
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80 || /[\x00-\x1f\x7f]/.test(raw)) {
    throw new TavriCoreError("Enter a person name of 1–80 characters.");
  }
  return name;
}

function validateRange(start, end) {
  if (!isDateLiteral(start) || !isDateLiteral(end) || start < "1900-01-01" || end > "9998-12-31" || start > end) {
    throw new TavriCoreError("Choose valid From and To dates (1900–9998), with From before To.");
  }
}
const personKey = name => String(name).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]/g, "");

class TeamWorkspace {
  constructor({ logDir }) {
    this.root = path.join(logDir, ".tavri-team");
    this.file = path.join(this.root, "team.json");
  }

  async readManifest() {
    let text;
    try { text = await fs.readFile(this.file, "utf8"); }
    catch (error) {
      if (error.code === "ENOENT") return { version: 1, members: [] };
      throw error;
    }
    try {
      const data = JSON.parse(text);
      if (data.version !== 1 || !Array.isArray(data.members) || data.members.some(member =>
        typeof member.id !== "string" || typeof member.name !== "string" || !member.files || typeof member.files !== "object" || Array.isArray(member.files) ||
        Object.entries(member.files).some(([week, content]) => !isDateLiteral(week) || weekStartForDate(week) !== week || typeof content !== "string"))) throw new Error("Invalid team manifest");
      return data;
    } catch { throw new TavriCoreError("The team workspace could not be read. Restore .tavri-team/team.previous.json or check the file manually."); }
  }

  async writeManifest(data) {
    try { await atomicWrite(path.join(this.root, "team.previous.json"), await fs.readFile(this.file, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    await atomicWrite(this.file, JSON.stringify(data, null, 2) + "\n");
  }

  validateWeekText(fileName, raw) {
    const match = /^(\d{4}-\d{2}-\d{2})\.log$/.exec(fileName);
    if (!match || !isDateLiteral(match[1]) || weekStartForDate(match[1]) !== match[1]) {
      throw new TavriCoreError("Each file must be named after its Monday, such as 2026-10-26.log.");
    }
    const text = normalizeLogText(raw);
    if (Buffer.byteLength(text, "utf8") > MAX_FILE_BYTES) throw new TavriCoreError("Choose weekly .log files smaller than 5 MB each.");
    if (parseEntries(text).some(entry => !entry.valid || weekStartForDate(entry.date) !== match[1])) {
      throw new TavriCoreError(`${fileName} contains an invalid activity or a date outside its week.`);
    }
    return [match[1], text];
  }

  async readImportFiles(filePaths, kind = "files") {
    if (!Array.isArray(filePaths) || !filePaths.length) throw new TavriCoreError("Choose weekly log files, a folder or a ZIP archive.");
    const files = {};
    const add = (name, raw) => {
      const [ref, text] = this.validateWeekText(name, raw);
      if (Object.hasOwn(files, ref)) throw new TavriCoreError(`The week ${ref} was selected more than once.`);
      files[ref] = text;
      if (Object.keys(files).length > MAX_IMPORT_FILES || Buffer.byteLength(JSON.stringify(files), "utf8") > MAX_WORKSPACE_BYTES) {
        throw new TavriCoreError("Choose at most 250 weeks and 30 MB of logs per import.");
      }
    };
    if (kind === "zip") {
      if (filePaths.length !== 1) throw new TavriCoreError("Choose one ZIP archive.");
      const stat = await fs.lstat(filePaths[0]);
      if (!stat.isFile() || stat.size > 35 * 1024 * 1024) throw new TavriCoreError("Choose a ZIP archive smaller than 35 MB.");
      let total = 0, count = 0, contents;
      try {
        contents = unzipSync(await fs.readFile(filePaths[0]), { filter(info) {
          if (info.name.endsWith("/")) return false;
          const parts = info.name.split("/");
          if (parts.some(part => !part || part === "." || part === "..") || info.name.includes("\\") || parts.length > 3) throw new TavriCoreError("ZIP paths must contain simple folders and weekly logs.");
          if (!info.name.endsWith(".log")) return false;
          if (++count > MAX_IMPORT_FILES || info.originalSize > MAX_FILE_BYTES || (total += info.originalSize) > MAX_WORKSPACE_BYTES || ![0, 8].includes(info.compression)) {
            throw new TavriCoreError("ZIP contains too many files, an oversized log or an unsupported compression format.");
          }
          return true;
        } });
      } catch (error) { if (error instanceof TavriCoreError) throw error; throw new TavriCoreError(`Could not read the ZIP archive: ${error.message}`); }
      const decoder = new TextDecoder("utf-8", { fatal: true });
      for (const [name, bytes] of Object.entries(contents)) {
        let raw;
        try { raw = decoder.decode(bytes); } catch { throw new TavriCoreError(`${name} is not valid UTF-8 text.`); }
        add(path.posix.basename(name), raw);
      }
    } else {
      let selected = filePaths;
      if (kind === "folder") {
        if (filePaths.length !== 1) throw new TavriCoreError("Choose one folder.");
        const items = await fs.readdir(filePaths[0], { withFileTypes: true });
        selected = items.filter(item => item.name.endsWith(".log") && item.isFile()).map(item => path.join(filePaths[0], item.name));
      }
      if (!selected.length || selected.length > MAX_IMPORT_FILES) throw new TavriCoreError(`Choose 1–${MAX_IMPORT_FILES} weekly .log files from one person.`);
      for (const filePath of selected) {
        if (typeof filePath !== "string") throw new TavriCoreError("Choose valid weekly .log files.");
        const stat = await fs.lstat(filePath);
        if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new TavriCoreError("Choose regular .log files smaller than 5 MB each.");
        add(path.basename(filePath), await fs.readFile(filePath, "utf8"));
      }
    }
    if (!Object.keys(files).length) throw new TavriCoreError("No weekly Tavri .log files were found.");
    return files;
  }

  async prepareImport(personName, filePaths, kind = "files") {
    const name = cleanPersonName(personName);
    const files = await this.readImportFiles(filePaths, kind);
    const data = await this.readManifest();
    const currentRevision = revision(JSON.stringify(data));
    const existing = data.members.find(item => personKey(item.name) === personKey(name));
    const weeks = Object.keys(files).sort();
    const preview = {
      name, weeks: weeks.length, first: weeks[0], last: weeks.at(-1),
      activities: Object.values(files).reduce((sum, text) => sum + parseEntries(text).length, 0),
      newWeeks: weeks.filter(ref => !Object.hasOwn(existing?.files || {}, ref)).length,
      changedWeeks: weeks.filter(ref => Object.hasOwn(existing?.files || {}, ref) && existing.files[ref] !== files[ref]).length,
      unchangedWeeks: weeks.filter(ref => Object.hasOwn(existing?.files || {}, ref) && existing.files[ref] === files[ref]).length,
      existingName: existing?.name || "",
    };
    return { name, files, currentRevision, preview };
  }

  async importPrepared({ name, files, currentRevision, preview }) {
    await withWriteLock(this.root, async () => {
      const data = await this.readManifest();
      if (revision(JSON.stringify(data)) !== currentRevision) throw new TavriCoreError("Team data changed after the import preview. Preview the files again.");
      let member = data.members.find(item => personKey(item.name) === personKey(name));
      if (!member) { member = { id: randomUUID(), name, importedAt: "", files: {} }; data.members.push(member); }
      member.name = name;
      member.importedAt = new Date().toISOString();
      Object.assign(member.files, files);
      data.history ||= [];
      data.history.unshift({ at: member.importedAt, action: "import", person: name, weeks: preview.weeks, changed: preview.changedWeeks, added: preview.newWeeks });
      data.history = data.history.slice(0, 100);
      if (Buffer.byteLength(JSON.stringify(data), "utf8") > MAX_WORKSPACE_BYTES) throw new TavriCoreError("The team workspace exceeds 30 MB. Import smaller batches or remove an old member.");
      await this.writeManifest(data);
    });
    return this.getState();
  }

  async importFiles(personName, filePaths) {
    return this.importPrepared(await this.prepareImport(personName, filePaths));
  }

  async removeWeek(id, ref) {
    await withWriteLock(this.root, async () => {
      const data = await this.readManifest();
      const member = data.members.find(item => item.id === id);
      if (!member || !Object.hasOwn(member.files, ref)) throw new TavriCoreError("That imported week is no longer available.");
      delete member.files[ref];
      data.history ||= [];
      data.history.unshift({ at: new Date().toISOString(), action: "remove-week", person: member.name, week: ref });
      data.history = data.history.slice(0, 100);
      await this.writeManifest(data);
    });
    return this.getState();
  }

  async undoLastChange() {
    await withWriteLock(this.root, async () => {
      let previous;
      try { previous = JSON.parse(await fs.readFile(path.join(this.root, "team.previous.json"), "utf8")); }
      catch { throw new TavriCoreError("There is no previous team state to restore."); }
      if (previous.version !== 1 || !Array.isArray(previous.members)) throw new TavriCoreError("The previous team state is invalid.");
      await this.writeManifest(previous);
    });
    return this.getState();
  }

  async removeMember(id) {
    await withWriteLock(this.root, async () => {
      const data = await this.readManifest();
      const next = data.members.filter(member => member.id !== id);
      if (next.length === data.members.length) throw new TavriCoreError("That person is no longer in the team workspace.");
      data.members = next;
      await this.writeManifest(data);
    });
    return this.getState();
  }

  async getState() {
    const data = await this.readManifest();
    const members = data.members.map(member => {
      const entries = Object.values(member.files).flatMap(parseEntries).filter(entry => entry.valid);
      const minutes = entries.reduce((total, entry) => total + (parseSpentToMinutes(parseEntryMessage(entry.message).timeSpent) || 0), 0);
      const timed = entries.filter(entry => parseSpentToMinutes(parseEntryMessage(entry.message).timeSpent) > 0).length;
      return { id: member.id, name: member.name, importedAt: member.importedAt, weeks: Object.keys(member.files).length, weekRefs: Object.keys(member.files).sort().reverse(), activities: entries.length, minutes, timed };
    }).sort((a, b) => a.name.localeCompare(b.name));
    return { members, history: data.history || [], canUndo: await fs.access(path.join(this.root, "team.previous.json")).then(() => true, () => false), activities: members.reduce((sum, member) => sum + member.activities, 0), minutes: members.reduce((sum, member) => sum + member.minutes, 0) };
  }

  async readRange(start, end, personId = "all") {
    validateRange(start, end);
    const data = await this.readManifest();
    if (personId !== "all" && !data.members.some(member => member.id === personId)) {
      throw new TavriCoreError("Choose a person from the imported team.");
    }
    const firstWeek = weekStartForDate(start), lastWeek = weekStartForDate(end);
    const selected = data.members.filter(member => personId === "all" || member.id === personId);
    const sources = selected.flatMap(member => Object.entries(member.files)
      .filter(([ref]) => ref >= firstWeek && ref <= lastWeek)
      .map(([ref, text]) => [member.id, member.name, ref, revision(text)]));
    const entries = selected.flatMap(member => Object.entries(member.files)
      .filter(([ref]) => ref >= firstWeek && ref <= lastWeek)
      .flatMap(([ref, text]) => parseEntries(text).filter(entry => entry.valid && entry.date >= start && entry.date <= end)
        .map(entry => ({ ...entry, personId: member.id, person: member.name, sourceWeek: ref }))));
    return { start, end, revision: revision(JSON.stringify([start, end, sources])), entries };
  }
}

module.exports = { TeamWorkspace, cleanPersonName, validateRange };
