import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { FocusStore } = require("../desktop/focus-store.cjs");
const { TavriStore } = require("../desktop/tavri-core.cjs");
const { buildEntryMessage, parseEntryMessage, buildTaskTimeData } = require("../desktop/entry-domain.cjs");

test("focus plan keeps stable task IDs, a three outcome limit and conflict protection", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tavri-focus-"));
  try {
    const focus = new FocusStore(dir);
    let state = await focus.read();
    for (const title of ["Ship UI", "Review data", "Write notes"]) state = await focus.create({ title, plannedFor: "2026-10-31" }, state.revision);
    assert.equal(state.tasks.length, 3);
    assert.equal(new Set(state.tasks.map(task => task.id)).size, 3);
    await assert.rejects(focus.create({ title: "Fourth", plannedFor: "2026-10-31" }, state.revision), /three open outcomes/);
    const stale = state.revision;
    const stableId = state.tasks[0].id;
    state = await focus.update(stableId, { title: "Ship polished UI", status: "done", nextStep: "Check release" }, state.revision);
    await assert.rejects(focus.update(state.tasks[1].id, { status: "done" }, stale), /changed/);
    state = await focus.create({ title: "Fourth", plannedFor: "2026-10-31" }, state.revision);
    assert.equal(state.tasks.filter(task => task.status === "open").length, 3);
    assert.equal(state.tasks[0].nextStep, "Check release");
    assert.equal(state.tasks[0].id, stableId);
    const previous = JSON.parse(await fs.readFile(path.join(dir, ".backups", "tavri-focus-previous.json"), "utf8"));
    assert.equal(previous.tasks.length, 3);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("linked sessions group by task ID while old logs remain readable", () => {
  const id = "a53f463d-2d28-4a6e-b6b7-52ebd3188b0c";
  const first = buildEntryMessage("Built layout", "20m", "Tavri", "APP-1", id);
  const second = buildEntryMessage("Fixed keyboard focus", "35m", "Tavri", "APP-1", id);
  assert.equal(parseEntryMessage(first).taskId, id);
  assert.equal(parseEntryMessage(second).message, "Fixed keyboard focus");
  const result = buildTaskTimeData([{ date: "2026-10-31", message: first }, { date: "2026-10-31", message: second }, { date: "2026-10-31", message: "Old activity [spent: 10m]" }]);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows.find(row => row.taskId === id).loggedMinutes, 55);
  assert.equal(parseEntryMessage("Old activity [spent: 10m]").taskId, "");
});

test("personal backup includes focus plan and restores it with weekly logs", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tavri-focus-backup-"));
  try {
    const focus = new FocusStore(dir), journal = new TavriStore({ logDir: dir, today: "2026-10-31" });
    let plan = await focus.read();
    plan = await focus.create({ title: "Original outcome", plannedFor: "2026-10-31" }, plan.revision);
    await journal.addEntry("Original activity", "09:00", "2026-10-31");
    const backup = await journal.createBackup();
    assert.equal(backup.version, 2);
    assert.equal(JSON.parse(backup.focus).tasks[0].title, "Original outcome");
    plan = await focus.update(plan.tasks[0].id, { nextStep: "Changed" }, plan.revision);
    await journal.addEntry("Later activity", "10:00", "2026-10-31");
    const preview = await journal.previewRestore(backup);
    assert.equal(preview.focusTasks, 1);
    await journal.restoreBackup(backup, preview.expected);
    assert.equal((await focus.read()).tasks[0].nextStep, "");
    assert.equal((await journal.readWeek()).entries.length, 1);
    assert.equal((await journal.previewRestore(journal.makeBackup(backup.files))).focusTasks, null);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("an interrupted focus and log restore completes from the transaction journal", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tavri-focus-recover-"));
  try {
    const journal = new TavriStore({ logDir: dir, today: "2026-10-31" });
    const focus = new FocusStore(dir);
    let plan = await focus.read();
    plan = await focus.create({ title: "Recover this task", plannedFor: "2026-10-31" }, plan.revision);
    const focusText = await fs.readFile(path.join(dir, ".tavri-focus.json"), "utf8");
    const log = "2026-10-31 09:00 Recovered activity\n";
    await fs.writeFile(path.join(dir, ".tavri-transaction.json"), JSON.stringify({ version: 2, files: { "2026-10-26": log }, focus: focusText, event: null }) + "\n");
    await fs.writeFile(path.join(dir, "2026-10-26.log"), "2026-10-31 09:00 Partial old content\n");
    await fs.writeFile(path.join(dir, ".tavri-focus.json"), JSON.stringify({ version: 1, tasks: [] }) + "\n");
    assert.equal((await journal.readWeek()).text, log);
    assert.equal((await focus.read()).tasks[0].id, plan.tasks[0].id);
    await assert.rejects(fs.access(path.join(dir, ".tavri-transaction.json")), /ENOENT/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
