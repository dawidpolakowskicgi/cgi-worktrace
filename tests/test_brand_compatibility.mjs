import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { test } from "node:test";
import { TavriStore, defaultLogDir } from "../desktop/tavri-core.cjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exec = promisify(execFile);
const require = createRequire(import.meta.url);

test("Tavri selects existing logs without moving or rewriting them", async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "tavri-compat-"));
  try {
    const fresh = path.join(homeDir, "Documents", "tavri");
    const legacy = path.join(homeDir, "Documents", "worktrace");
    assert.equal(defaultLogDir(homeDir), fresh);
    await fs.mkdir(legacy, { recursive: true });
    const log = path.join(legacy, "2026-10-26.log");
    const content = "2026-10-29 preserved legacy entry\n";
    await fs.writeFile(log, content);
    const store = new TavriStore({ homeDir, env: {}, today: "2026-10-29" });
    assert.equal(store.logDir, legacy);
    assert.equal((await store.readToday()).entries[0].message, "preserved legacy entry");
    assert.equal(await fs.readFile(log, "utf8"), content);
    await fs.mkdir(fresh);
    assert.equal(defaultLogDir(homeDir), legacy, "an empty new folder must not hide existing legacy logs");
    await fs.writeFile(path.join(fresh, "2026-11-02.log"), "2026-11-03 current location\n");
    assert.equal(defaultLogDir(homeDir), fresh);
    assert.equal(await fs.readFile(log, "utf8"), content);
  } finally {
    await fs.rm(homeDir, { recursive: true, force: true });
  }
});

test("CLI keeps the populated legacy folder when a new Tavri folder is empty", async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "tavri-cli-folder-"));
  try {
    const documents = path.join(homeDir, "Documents");
    await fs.mkdir(path.join(documents, "worktrace"), { recursive: true });
    await fs.mkdir(path.join(documents, "tavri"));
    await fs.writeFile(path.join(documents, "worktrace", "2026-10-26.log"), "2026-10-29 legacy entry\n");
    const env = { ...process.env, HOME: homeDir, TAVRI_LOGDIR: "", WORKTRACE_LOGDIR: "" };
    const first = await exec(path.join(root, "tavri.sh"), ["config"], { env });
    assert(first.stdout.includes(`log_dir=${path.join(documents, "worktrace")}`));
    await fs.writeFile(path.join(documents, "tavri", "2026-11-02.log"), "2026-11-03 current entry\n");
    const second = await exec(path.join(root, "tavri.sh"), ["config"], { env });
    assert(second.stdout.includes(`log_dir=${path.join(documents, "tavri")}`));
  } finally { await fs.rm(homeDir, { recursive: true, force: true }); }
});

test("explicit and new configuration takes precedence over legacy configuration", () => {
  const env = { TAVRI_LOGDIR: "/new", WORKTRACE_LOGDIR: "/old", TAVRI_TODAY: "2026-10-29", WORKTRACE_TODAY: "2026-10-28" };
  assert.equal(new TavriStore({ env }).logDir, "/new");
  assert.equal(new TavriStore({ env }).todayDate(), "2026-10-29");
  assert.equal(new TavriStore({ env, logDir: "/explicit" }).logDir, "/explicit");
  const legacy = new TavriStore({ env: { WORKTRACE_LOGDIR: "/old", WORKTRACE_TODAY: "2026-10-28" } });
  assert.equal(legacy.logDir, "/old");
  assert.equal(legacy.todayDate(), "2026-10-28");
});

test("legacy CLI environment and launcher still write compatible logs", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tavri-cli-compat-"));
  try {
    const env = { ...process.env, TAVRI_LOGDIR: "", TAVRI_TODAY: "", WORKTRACE_LOGDIR: dir, WORKTRACE_TODAY: "2026-10-29" };
    await exec(path.join(root, "worktrace.sh"), ["add", "legacy launcher"], { env });
    assert.equal(await fs.readFile(path.join(dir, "2026-10-26.log"), "utf8"), "2026-10-29 legacy launcher\n");
    const preferred = path.join(dir, "new");
    const result = await exec(path.join(root, "tavri.sh"), ["config"], { env: { ...env, TAVRI_LOGDIR: preferred } });
    assert(result.stdout.includes(`log_dir=${preferred}`));
    const explicit = await exec(path.join(root, "tavri.sh"), ["--log-dir", dir, "config"], { env: { ...env, TAVRI_LOGDIR: preferred } });
    assert(explicit.stdout.includes(`log_dir=${dir}`));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("old core module names resolve to the Tavri implementation", () => {
  assert.equal(require("../desktop/worktrace-core.cjs").WorktraceStore, TavriStore);
});
