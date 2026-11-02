import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  TavriCoreError,
  TavriStore,
  defaultLogDir,
  escapeCsvCell,
  formatEntriesAsCsv,
  formatWeekAsPlainText,
  formatLocalDateTime,
  normalizeLogText,
  parseEntries,
  weekStartForDate,
  weekStartForIsoWeek,
  sortWeekStartsDescending,
} = require("../desktop/tavri-core.cjs");

let passCount = 0;
let failCount = 0;

async function withTempDir(fn) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tavri-electron-test-"));

  try {
    await fn(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function runTest(name, fn) {
  process.stdout.write(`test ${name.padEnd(48, " ")}`);

  try {
    await fn();
    passCount += 1;
    process.stdout.write("ok\n");
  } catch (error) {
    failCount += 1;
    process.stdout.write("FAIL\n");
    process.stderr.write(`${error.stack || error.message}\n`);
  }
}

function assertThrowsTavriError(fn, expectedMessage) {
  assert.throws(fn, (error) => error instanceof TavriCoreError && error.message.includes(expectedMessage));
}

await runTest("desktop week date helpers", () => {
  assert.equal(weekStartForDate("2026-04-30"), "2026-04-27");
  assert.equal(weekStartForIsoWeek("2026-W18"), "2026-04-27");
  assert.equal(weekStartForIsoWeek("2020-W53"), "2020-12-28");
  assertThrowsTavriError(() => weekStartForDate("2026-02-30"), "invalid date");
  assertThrowsTavriError(() => weekStartForIsoWeek("2021-W53"), "invalid ISO week");
});

await runTest("desktop log text helpers", () => {
  assert.equal(normalizeLogText("a\r\nb\n\n"), "a\nb\n");
  assert.equal(normalizeLogText("\n\n"), "");
  assert.deepEqual(parseEntries("2026-04-30 shipped UI\n")[0], {
    id: "0-2026-04-30 shipped UI",
    date: "2026-04-30",
    time: "",
    message: "shipped UI",
    line: "2026-04-30 shipped UI",
    valid: true,
  });
  assert.deepEqual(parseEntries("2026-04-30 09:15 shipped UI\n")[0], {
    id: "0-2026-04-30 09:15 shipped UI",
    date: "2026-04-30",
    time: "09:15",
    message: "shipped UI",
    line: "2026-04-30 09:15 shipped UI",
    valid: true,
  });
  assert.equal(formatLocalDateTime(new Date(2026, 3, 30, 9, 15)), "2026-04-30 09:15");
});

await runTest("desktop export format helpers", () => {
  assert.equal(formatWeekAsPlainText({ text: "2026-04-30 shipped\r\n\n" }), "2026-04-30 shipped\n");
  assert.equal(escapeCsvCell('fixed "reports", export'), '"fixed ""reports"", export"');
  assert.equal(formatEntriesAsCsv([
    { date: "2026-04-29", message: "previous day" },
    { date: "2026-04-30", message: "fixed csv, pdf and txt" },
    { date: "2026-05-01", message: 'quoted "value"' },
  ]), 'date,time,message,duration_minutes,project,reference\n2026-04-29,,previous day,,,\n2026-04-30,,"fixed csv, pdf and txt",,,\n2026-05-01,,"quoted ""value""",,,\n');
});

await runTest("desktop sorts week starts descending", () => {
  assert.deepEqual(["2026-04-27", "2026-05-04", "2026-04-20"].sort(sortWeekStartsDescending), [
    "2026-05-04",
    "2026-04-27",
    "2026-04-20",
  ]);
});

await runTest("desktop default log directory", () => {
  assert.equal(defaultLogDir("/Users/example"), path.join("/Users/example", "Documents", "tavri"));
});

await runTest("desktop store adds and reads entries", async () => {
  await withTempDir(async (tempDir) => {
    const store = new TavriStore({
      logDir: tempDir,
      now: () => new Date(2026, 3, 30, 9, 15),
      today: "2026-04-30",
    });
    const result = await store.addEntry("implemented electron desktop");

    assert.equal(result.line, "2026-04-30 09:15 implemented electron desktop");
    assert.equal(result.filePath, path.join(tempDir, "2026-04-27.log"));
    assert.equal(result.time, "09:15");

    const week = await store.readWeek();
    assert.equal(week.weekStart, "2026-04-27");
    assert.equal(week.entries.length, 1);
    assert.equal(week.entries[0].message, "implemented electron desktop");
    assert.equal(week.entries[0].time, "09:15");

    const today = await store.readToday();
    assert.equal(today.entries.length, 1);
  });
});

await runTest("desktop store lists available weeks", async () => {
  await withTempDir(async (tempDir) => {
    const store = new TavriStore({ logDir: tempDir, today: "2026-04-30" });
    await fs.writeFile(path.join(tempDir, "2026-04-27.log"), "2026-04-29 previous\n");
    await fs.writeFile(path.join(tempDir, "2026-04-20.log"), "2026-04-20 older\n");
    await fs.writeFile(path.join(tempDir, "notes.txt"), "ignore me\n");

    assert.deepEqual(await store.listAvailableWeeks(), ["2026-04-27", "2026-04-20"]);
  });
});

await runTest("desktop store saves raw weekly text", async () => {
  await withTempDir(async (tempDir) => {
    const store = new TavriStore({
      logDir: tempDir,
      now: () => new Date(2026, 3, 30, 9, 15),
      today: "2026-04-30",
    });
    await store.saveWeek("", "2026-04-29 previous\r\n2026-04-30 current\n\n");

    const week = await store.readWeek();
    assert.equal(week.text, "2026-04-29 previous\n2026-04-30 current\n");
    assert.equal(week.entries.length, 2);
  });
});

await runTest("desktop store rejects bad entries", async () => {
  await withTempDir(async (tempDir) => {
    const store = new TavriStore({ logDir: tempDir, today: "2026-04-30" });

    await assert.rejects(() => store.addEntry(""), /missing entry message/);
    await assert.rejects(() => store.addEntry("first\nsecond"), /single line/);
  });
});

await runTest("duplicate rows mutate one occurrence only", async () => withTempDir(async logDir => {
  const store = new TavriStore({ logDir, today: "2026-04-30" });
  const line = "2026-04-30 09:00 same";
  let week = await store.saveWeek("", `${line}\n\n${line}\n`);
  assert.equal(week.entries[1].id, `2-${line}`);
  const edited = await store.editEntry("", week.entries[1], "2026-04-30", "09:15", "changed", week.revision);
  assert.equal(edited.text, `${line}\n\n2026-04-30 09:15 changed\n`);
  const deleted = await store.deleteEntry("", edited.entries[0], edited.revision);
  assert.equal(deleted.entries.length, 1);
  const restored = await store.undoDelete(deleted.undoToken);
  assert.equal(restored.text, edited.text);
}));

await runTest("stale writes preserve external edits and drafts", async () => withTempDir(async logDir => {
  const store = new TavriStore({ logDir, today: "2026-04-30" });
  const week = await store.saveWeek("", "2026-04-30 original\n");
  await fs.appendFile(week.filePath, "2026-04-30 external\n");
  await assert.rejects(() => store.saveWeek("", "overwrite", week.revision), /changed elsewhere/);
  await assert.rejects(() => store.deleteEntry("", week.entries[0], week.revision), /changed elsewhere/);
  assert.equal((await store.readWeek()).entries.length, 2);
}));

await runTest("archive saves and backups keep current week intact", async () => withTempDir(async logDir => {
  const store = new TavriStore({ logDir, today: "2026-04-30" });
  await store.addEntry("current");
  let archive = await store.saveWeek("2026-04-20", "2026-04-20 previous\n");
  await store.saveWeek(archive.weekStart, "2026-04-20 revised\n", archive.revision);
  assert.equal((await store.readWeek()).entries[0].message, "current");
  assert.equal(await fs.readFile(path.join(logDir, ".backups", "2026-04-20.log"), "utf8"), archive.text);
}));

await runTest("undo refuses to overwrite subsequent activity", async () => withTempDir(async logDir => {
  const store = new TavriStore({ logDir, today: "2026-04-30" });
  await store.addEntry("first");
  let week = await store.readWeek();
  const result = await store.deleteEntry("", week.entries[0], week.revision);
  await store.addEntry("second");
  await assert.rejects(() => store.undoDelete(result.undoToken), /changed elsewhere/);
  assert.equal((await store.readWeek()).entries[0].message, "second");
}));

await runTest("edit validates fields and moves between weeks safely", async () => withTempDir(async logDir => {
  const store = new TavriStore({ logDir, today: "2026-04-30" });
  await store.addEntry("first");
  const week = await store.readWeek();
  const target = week.entries[0];
  for (const [date, time, message, pattern] of [["2026-04-31", "09:00", "A", /valid date/], ["2026-04-30", "25:00", "A", /valid time/], ["2026-04-30", "09:00", "A\nB", /single line/]]) {
    await assert.rejects(() => store.editEntry("", target, date, time, message, week.revision), pattern);
  }
  await assert.rejects(() => store.addEntry("A", "-1h"), /valid time/);
  assert.equal((await store.readWeek()).text, week.text);
  const moved = await store.editEntry("", target, "2026-05-04", "09:00", "moved", week.revision);
  assert.equal(moved.weekStart, "2026-05-04");
  assert.equal((await store.readWeek()).entries.length, 0);
  assert.equal((await store.readWeek("2026-05-04")).entries[0].message, "moved");
  assert.equal(await fs.readFile(path.join(logDir, ".backups", "2026-04-27.log"), "utf8"), week.text);
  assert.equal(await fs.readFile(path.join(logDir, ".backups", "2026-05-04.log"), "utf8"), "");
}));

await runTest("interrupted cross-week move completes before the next read", async () => withTempDir(async logDir => {
  const store = new TavriStore({ logDir, today: "2026-04-30" });
  await store.addEntry("original", "09:00", "2026-04-30");
  const source = await store.readWeek("2026-04-27");
  const target = "2026-05-04 10:00 moved\n";
  await fs.writeFile(path.join(logDir, ".tavri-transaction.json"), JSON.stringify({ version: 1, files: { "2026-05-04": target, "2026-04-27": "" } }));
  await fs.writeFile(path.join(logDir, "2026-05-04.log"), target);
  assert.equal((await store.readWeek("2026-04-27")).entries.length, 0);
  assert.equal((await store.readWeek("2026-05-04")).entries[0].message, "moved");
  await assert.rejects(() => fs.stat(path.join(logDir, ".tavri-transaction.json")), { code: "ENOENT" });
  assert(source.text.includes("original"));
}));

await runTest("backup preview and restore preserve the previous journal", async () => withTempDir(async logDir => {
  const store = new TavriStore({ logDir, today: "2026-04-30" });
  await store.addEntry("original", "09:00", "2026-04-30");
  const backup = await store.createBackup();
  await store.addEntry("new work", "10:00", "2026-04-30");
  const preview = await store.previewRestore(backup);
  assert.equal(preview.changed, 1);
  assert.equal(preview.activities, 1);
  const result = await store.restoreBackup(backup, preview.expected);
  assert.equal((await store.readWeek()).entries.length, 1);
  assert((await fs.readFile(result.recoveryFile, "utf8")).includes("new work"));
  await assert.rejects(() => store.previewRestore({ ...backup, checksum: "bad" }), /valid Tavri personal backup/);
}));

await runTest("archive search filters every week and keeps source revisions", async () => withTempDir(async logDir => {
  const store = new TavriStore({ logDir, today: "2026-04-30" });
  await store.addEntry("Release review [project: Tavri] [ref: APP-10]", "09:00", "2026-04-30");
  await store.addEntry("Older release note [project: Tavri]", "10:00", "2026-03-02");
  await store.addEntry("Unrelated work [project: Other]", "11:00", "2026-03-02");
  const result = await store.searchArchive({ query: "release", project: "Tavri" });
  assert.equal(result.total, 2);
  assert.deepEqual(result.entries.map(entry => entry.sourceWeek), ["2026-04-27", "2026-03-02"]);
  assert(result.entries.every(entry => /^[a-f0-9]{64}$/.test(entry.sourceRevision)));
  assert.equal((await store.searchArchive({ query: "APP-10", start: "2026-04-01" })).total, 1);
}));

await runTest("desktop change events survive edits and moves", async () => withTempDir(async logDir => {
  const store = new TavriStore({ logDir, today: "2026-04-30" });
  await store.addEntry("Initial work", "09:00", "2026-04-30");
  const original = await store.readWeek();
  await store.editEntry("", original.entries[0], "2026-05-04", "10:00", "Moved work", original.revision);
  const events = await store.readRecentChanges();
  assert.equal(events.length, 2);
  assert.equal(events[0].kind, "moved");
  assert(events[0].before.includes("Initial work"));
  assert(events[0].after.includes("Moved work"));
  assert(!Number.isNaN(Date.parse(events[0].at)));
}));

await runTest("concurrent store instances do not lose entries", async () => withTempDir(async logDir => {
  const stores = Array.from({ length: 12 }, () => new TavriStore({ logDir, today: "2026-04-30" }));
  await Promise.all(stores.map((store, index) => store.addEntry(`entry-${index}`)));
  const week = await stores[0].readWeek();
  assert.equal(week.entries.length, stores.length);
  assert.equal(new Set(week.entries.map(entry => entry.message)).size, stores.length);
}));

await runTest("CSV includes structured fields and safe formulas", () => {
  assert.equal(formatEntriesAsCsv([{ date: "2026-04-30", time: "09:00", message: "=SUM(A1:A2) [spent: 1h 30m] [project: Tavri] [ref: APP-1]" }]), "date,time,message,duration_minutes,project,reference\n2026-04-30,09:00,'=SUM(A1:A2),90,Tavri,APP-1\n");
});

await runTest("CLI and desktop writers share the same lock", async () => withTempDir(async logDir => {
  const store = new TavriStore({ logDir, today: "2026-04-30" });
  const cli = fileURLToPath(new URL("../tavri.sh", import.meta.url));
  await Promise.all(Array.from({ length: 8 }, (_, index) => index % 2
    ? store.addEntry(`desktop-${index}`)
    : promisify(execFile)("bash", [cli, "add", `cli-${index}`], { env: { ...process.env, TAVRI_LOGDIR: logDir, TAVRI_TODAY: "2026-04-30" } })));
  assert.equal((await store.readWeek()).entries.length, 8);
}));

await runTest("failed atomic replacement keeps the original and unlocks", async () => withTempDir(async logDir => {
  const store = new TavriStore({ logDir, today: "2026-04-30" });
  const original = await store.saveWeek("", "2026-04-30 original\n");
  const rename = fs.rename;
  fs.rename = async (from, to) => {
    if (to === original.filePath) throw Object.assign(new Error("simulated write failure"), { code: "EIO" });
    return rename(from, to);
  };
  try {
    await assert.rejects(() => store.saveWeek("", "2026-04-30 changed", original.revision), /simulated write failure/);
  } finally { fs.rename = rename; }
  assert.equal((await store.readWeek()).text, original.text);
  assert(!(await fs.readdir(logDir)).some(name => name.endsWith(".tmp") || name === ".tavri-write-lock"));
  await store.addEntry("next operation succeeds");
}));

await runTest("year history spans archives, boundary weeks and empty revisions", async () => withTempDir(async logDir => {
  const store = new TavriStore({ logDir, today: "2026-10-30" });
  await store.addEntry("new year", "09:00", "2026-01-01");
  await store.addEntry("prior year", "10:00", "2025-12-31");
  await store.addEntry("archive", "10:00", "2026-03-02");
  await store.addEntry("year end", "11:00", "2026-12-31");
  await store.addEntry("next year", "12:00", "2027-01-01");
  const year = await store.readYear(2026);
  assert.equal(year.entries.length, 3);
  assert.match(year.revision, /^[a-f0-9]{64}$/);
  assert.equal(year.entries[0].sourceWeek, "2025-12-29");
  assert.match(year.entries[0].sourceRevision, /^[a-f0-9]{64}$/);
  assert.match(year.revisions["2026-06-01"], /^[a-f0-9]{64}$/);
  const archive = year.entries.find(entry => entry.message === "archive");
  await store.editEntry(archive.sourceWeek, archive, archive.date, archive.time, "edited archive", archive.sourceRevision);
  const updatedYear = await store.readYear(2026);
  assert(updatedYear.entries.some(entry => entry.message === "edited archive"));
  assert.notEqual(updatedYear.revision, year.revision);
  await assert.rejects(() => store.readYear("2026"), /valid year/);
  await assert.rejects(() => store.readYear(10000), /valid year/);
}));

await runTest("arbitrary date ranges include archives, boundaries and new files", async () => withTempDir(async logDir => {
  const store = new TavriStore({ logDir, today: "2026-10-30" });
  await store.addEntry("before range", "08:00", "2025-12-30");
  await store.addEntry("first day", "09:00", "2025-12-31");
  await store.addEntry("new year", "10:00", "2026-01-01");
  await store.addEntry("next week", "11:00", "2026-01-05");
  await store.addEntry("after range", "12:00", "2026-01-06");
  const range = await store.readRange("2025-12-31", "2026-01-05");
  assert.deepEqual(range.entries.map(entry => entry.message), ["first day", "new year", "next week"]);
  assert.deepEqual(range.entries.map(entry => entry.sourceWeek), ["2025-12-29", "2025-12-29", "2026-01-05"]);
  assert.match(range.revision, /^[a-f0-9]{64}$/);
  const empty = await store.readRange("2026-02-01", "2026-02-28");
  assert.deepEqual(empty.entries, []);
  await store.addEntry("new weekly file", "12:00", "2026-02-10");
  const noLongerEmpty = await store.readRange("2026-02-01", "2026-02-28");
  assert.notEqual(noLongerEmpty.revision, empty.revision);
  assert.deepEqual(noLongerEmpty.entries.map(entry => entry.message), ["new weekly file"]);
  await store.addEntry("appeared later", "12:00", "2026-01-04");
  const updated = await store.readRange("2025-12-31", "2026-01-05");
  assert.notEqual(updated.revision, range.revision);
  assert.equal(updated.entries.length, 4);
  await assert.rejects(() => store.readRange("2026-01-05", "2026-01-01"), /From before To/);
  await assert.rejects(() => store.readRange("2026-02-30", "2026-03-01"), /valid From/);
  await assert.rejects(() => store.readRange("", "2026-03-01"), /valid From/);
}));

process.stdout.write(`\n${passCount} desktop tests passed, ${failCount} failed\n`);

if (failCount > 0) {
  process.exitCode = 1;
}
