import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { TeamWorkspace } from "../desktop/team-store.cjs";
import { reportOptions, buildReport, buildReportCsv, buildReportPdfHtml } from "../desktop/report-domain.cjs";
import { selectTavriRelease } from "../desktop/update-check.cjs";
import { zipSync, strToU8 } from "fflate";

test("team imports weekly snapshots, replaces a week and keeps original files untouched", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tavri-team-test-"));
  try {
    const team = new TeamWorkspace({ logDir: path.join(root, "logs") });
    const file = path.join(root, "2026-10-26.log");
    const original = "2026-10-27 09:00 Planning [spent: 30m] [project: Launch]\n";
    await fs.writeFile(file, original);
    await team.importFiles("Alex", [file]);
    assert.equal((await team.getState()).members[0].activities, 1);
    const before = await team.readRange("2026-10-26", "2026-10-29");
    await fs.writeFile(file, "2026-10-28 10:00 New version [spent: 1h]\n");
    assert.equal((await team.readRange("2026-10-26", "2026-10-29")).revision, before.revision);
    await team.importFiles("alex", [file]);
    const after = await team.readRange("2026-10-26", "2026-10-29");
    assert.equal((await team.getState()).members.length, 1);
    assert.notEqual(after.revision, before.revision);
    assert.equal(after.entries[0].message, "New version [spent: 1h]");
    assert.equal(await fs.readFile(file, "utf8"), "2026-10-28 10:00 New version [spent: 1h]\n");
    await team.removeMember((await team.getState()).members[0].id);
    assert.equal((await team.getState()).members.length, 0);
    assert.equal(await fs.readFile(file, "utf8"), "2026-10-28 10:00 New version [spent: 1h]\n");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("team rejects invalid and misplaced weekly entries without changing the workspace", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tavri-team-invalid-"));
  try {
    const team = new TeamWorkspace({ logDir: root });
    const file = path.join(root, "2026-10-26.log");
    await fs.writeFile(file, "2026-11-02 10:00 Wrong week\n");
    await assert.rejects(team.importFiles("Alex", [file]), /outside its week/);
    await fs.writeFile(file, "2026-10-27 99:00 Invalid time\n");
    await assert.rejects(team.importFiles("Alex", [file]), /invalid activity/);
    assert.deepEqual((await team.getState()).members, []);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("team previews folder and ZIP imports, resolves name variants and can undo a removed week", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tavri-team-bundle-"));
  try {
    const folder = path.join(root, "shared"); await fs.mkdir(folder);
    const monday = "2026-10-26.log";
    await fs.writeFile(path.join(folder, monday), "2026-10-27 09:00 Folder work\n");
    const team = new TeamWorkspace({ logDir: path.join(root, "logs") });
    const first = await team.prepareImport("Alex Morgan", [folder], "folder");
    assert.equal(first.preview.newWeeks, 1);
    await team.importPrepared(first);
    const zipPath = path.join(root, "shared.zip");
    await fs.writeFile(zipPath, zipSync({ [`archive/${monday}`]: strToU8("2026-10-28 10:00 ZIP update\n") }));
    const second = await team.prepareImport("alex-morgan", [zipPath], "zip");
    assert.equal(second.preview.existingName, "Alex Morgan");
    assert.equal(second.preview.changedWeeks, 1);
    await team.importPrepared(second);
    assert.equal((await team.getState()).members.length, 1);
    const member = (await team.getState()).members[0];
    await team.removeWeek(member.id, "2026-10-26");
    assert.equal((await team.getState()).members[0].weeks, 0);
    await team.undoLastChange();
    assert.equal((await team.getState()).members[0].weekRefs[0], "2026-10-26");
    assert((await team.readRange("2026-10-26", "2026-10-29")).entries[0].message.includes("ZIP update"));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("reports aggregate projects, people, durations and escape PDF labels", () => {
  const options = reportOptions({ start: "2026-10-01", end: "2026-10-31", source: "team", personId: "all", metric: "minutes", charts: { trend: true, projects: true, people: true } });
  const report = buildReport([
    { date: "2026-10-27", message: "Planning [spent: 45m] [project: Launch]", person: "Alex <script>" },
    { date: "2026-10-28", message: "Review [project: Launch]", person: "Alex <script>" },
    { date: "2026-10-28", message: "Implementation [spent: 1h] [project: App]", person: "You" },
  ], options);
  assert.deepEqual(report.summary, { activities: 3, minutes: 105, timed: 2, people: 2, projects: 2, activeDays: 2 });
  assert.equal(report.interval, "week");
  assert.equal(report.trend.length, 5);
  assert.equal(report.trend[0].activities, 0);
  assert.equal(report.people.find(row => row.label === "Alex <script>").minutes, 45);
  assert.equal(report.projects.find(row => row.label === "Launch").activities, 2);
  const html = buildReportPdfHtml(report);
  assert(html.includes("Alex &lt;script&gt;"));
  assert(!html.includes("Alex <script>"));
  assert(html.includes("2 of 3 activities have a duration"));
  const annual = buildReport([], reportOptions({ ...options, start: "2026-01-01", end: "2026-12-31" }));
  assert.equal(annual.interval, "month");
  assert.equal(annual.trend.length, 12);
  assert(annual.trend.every(row => row.activities === 0));
});

test("report CSV escapes spreadsheet formulas and includes prior-period totals", () => {
  const options = reportOptions({ start: "2026-10-01", end: "2026-10-31", source: "personal", personId: "all", metric: "activities", compare: true });
  const report = buildReport([{ date: "2026-10-27", message: "Release [project: =HYPERLINK(\"x\")]", person: "You" }], options);
  report.comparison = { start: "2026-09-01", end: "2026-09-30", summary: { activities: 2, minutes: 60 } };
  const csv = buildReportCsv(report);
  assert(csv.includes("'=HYPERLINK"));
  assert(csv.includes('"previous-period","2026-09-01 to 2026-09-30","2","60"'));
});

test("update checker accepts only a newer Tavri release from the configured repository", () => {
  const release = (tag, name, url = `https://github.com/dawidpolakowskicgi/CGITART/releases/tag/${tag}`) =>
    ({ tag_name: tag, draft: false, prerelease: false, html_url: url, assets: [{ name }] });
  const result = selectTavriRelease([
    release("v0.4.0", "Tavri-0.4.0-arm64.dmg", "https://example.com/redirect"),
    release("v0.3.0", "Worktrace-old.dmg"),
    release("v0.3.1", "Tavri-0.3.1-arm64.dmg"),
  ], "0.3.0");
  assert.equal(result.latest, "v0.3.1");
  assert.equal(result.updateAvailable, true);
});
