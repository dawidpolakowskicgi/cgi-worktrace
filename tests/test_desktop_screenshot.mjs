import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TavriStore } from "../desktop/tavri-core.cjs";
import { buildReport } from "../desktop/report-domain.cjs";
import { chromeBinaryPath } from "../scripts/chrome.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "tavri-screenshot-"));
const logDir = path.join(temp, "logs");
const exec = promisify(execFile);

try {
  await fs.mkdir(logDir);
  const store = new TavriStore({ logDir, today: "2026-10-29" });
  await fs.copyFile(path.join(root, "tests/fixtures/desktop-screenshot-week.log"), store.weekPath());
  const state = await store.getState();
  assert.equal(state.week.entries.length, 4, "Screenshot fixture must load four entries");
  state.config.logDir = "~/Documents/tavri";
  state.week.filePath = "2026-10-26.log";
  state.config.currentFile = "2026-10-26.log";
  // Additional deterministic archive samples for the annual visualization only.
  for (let month = 1; month <= 10; month++) {
    for (let day = 1; day <= 24; day++) {
      if ((day + month) % 3 === 0) continue;
      const date = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const count = (day * month) % 8 + 1;
      for (let index = 0; index < count; index++) await store.addEntry(`Project progress ${index + 1} [spent: 30m] [project: Tavri]`, "09:00", date);
    }
  }
  const year = await store.readYear(2026);
  const encodedYear = JSON.stringify(year).replace(/</g, "\\u003c");
  const encodedState = JSON.stringify(state).replace(/</g, "\\u003c");
  const teamMember = { id: "alex", name: "Alex Morgan", importedAt: "2026-10-29T10:00:00Z", weeks: 2, activities: 2, minutes: 105, timed: 2 };
  const personalReport = buildReport(state.week.entries.map(entry => ({ ...entry, person: "You" })), { start: "2026-10-01", end: "2026-10-29", source: "personal", personId: "all", metric: "activities", charts: { trend: true, projects: true, people: true } });
  const teamReport = buildReport([...state.week.entries.map(entry => ({ ...entry, person: "You" })), { date: "2026-10-27", message: "Sprint planning [spent: 1h 45m] [project: Launch]", person: "Alex Morgan" }, { date: "2026-10-28", message: "Review [project: Launch]", person: "Alex Morgan" }], { start: "2026-10-01", end: "2026-10-29", source: "team", personId: "all", metric: "activities", charts: { trend: true, projects: true, people: true } });
  const encodedPersonalReport = JSON.stringify(personalReport).replace(/</g, "\\u003c");
  const encodedTeamReport = JSON.stringify(teamReport).replace(/</g, "\\u003c");
  const encodedFocus = JSON.stringify({ version: 1, revision: "fixture-focus", tasks: [{ id: "a53f463d-2d28-4a6e-b6b7-52ebd3188b0c", title: "Finish the Tavri focus workflow", project: "Tavri", reference: "TV-58", nextStep: "Review keyboard flow", plannedFor: "2026-10-29", status: "open", createdAt: "2026-10-29T08:00:00Z", updatedAt: "2026-10-29T08:00:00Z" }] }).replace(/</g, "\\u003c");
  // Capture the production HTML, CSS and renderer. Only the native IPC bridge is stubbed.
  // Main/preload behavior is covered separately; this is a renderer visual smoke check.
  const fixtureBridge = `<script>
    const fixture = ${encodedState};
    localStorage.setItem('tavri-theme', new URL(location.href).searchParams.get('theme') || 'light');
    localStorage.setItem('tavri-accent', new URL(location.href).searchParams.get('accent') || 'red');
    localStorage.setItem('tavri-activity-mode', new URL(location.href).searchParams.get('mode') || 'list');
    if (!['welcome', 'guide', 'flow'].includes(new URL(location.href).searchParams.get('view'))) localStorage.setItem('tavri-hide-welcome', 'true');
    if (['timer', 'tasktime'].includes(new URL(location.href).searchParams.get('view'))) {
      const now = Date.now();
      localStorage.setItem('tavri-activity-timer', JSON.stringify({ version: 1, startedAt: now - 735000, runningSince: now - 735000, elapsedMs: 0 }));
      localStorage.setItem('tavri-entry-draft', JSON.stringify(new URL(location.href).searchParams.get('view') === 'tasktime'
        ? { entryInput: 'Refined the Tavri activity journal', entryDateInput: '2026-10-29', entryTimeInput: '09:00', timeSpentInput: '', projectInput: 'Tavri', referenceInput: 'TV-42' }
        : { entryInput: 'Preparing the weekly release', entryDateInput: '2026-10-29', entryTimeInput: '09:00', timeSpentInput: '', projectInput: 'Tavri', referenceInput: 'TV-51' }));
    }
    if (['reports', 'team'].includes(new URL(location.href).searchParams.get('view'))) localStorage.setItem('tavri-workspace-mode', 'team');
    const annual = ${encodedYear};
    const focusData = ${encodedFocus};
    const personalReport = ${encodedPersonalReport}, teamReport = ${encodedTeamReport};
    window.tavri = { getState: async () => fixture, getYear: async () => annual, getFocus: async () => focusData,
      getRange: async (start, end) => ({ start, end, revision: 'fixture-range', entries: annual.entries.filter(entry => entry.date >= start && entry.date <= end) }),
      searchArchive: async () => ({ total: 2, limit: 200, entries: fixture.week.entries.slice(0, 2).map(entry => ({ ...entry, sourceWeek: fixture.week.weekStart, sourceRevision: fixture.week.revision })) }),
      getRecentChanges: async () => [{ id: 'fixture-change', at: '2026-10-29T09:00:00Z', kind: 'edited', week: '2026-10-26', before: '2026-10-29 08:45 Reviewed the release plan', after: '2026-10-29 09:00 Reviewed and shared the release plan' }],
      getTeamState: async () => ({ members: [${JSON.stringify(teamMember)}], history: [], canUndo: false, activities: 2, minutes: 105 }),
      getReportPreview: async options => ({ ...(options.source === 'team' ? teamReport : personalReport), options, revision: 'fixture-report' }) };
  </script>`;
  const assertions = `<script>
    window.addEventListener('load', () => setTimeout(() => {
      document.querySelector('#entryDateInput').value = '2026-10-29';
      document.querySelector('#entryTimeInput').value = '09:00';
      const input = document.querySelector('#entryInput').getBoundingClientRect();
      const workspace = document.querySelector('.workspace');
      document.body.dataset.captureReady = String(document.querySelectorAll('#weekEntries .entry').length);
      const mode = new URL(location.href).searchParams.get('mode') || 'list';
      const view = new URL(location.href).searchParams.get('view') || 'week';
      if (view === 'edit') window.tavriRenderer.showView('edit');
      const category = new URL(location.href).searchParams.get('category') || 'all';
      if (view === 'edit' && category !== 'all') { const filter = document.querySelector('#themeFamilyFilter'); filter.value = category; filter.dispatchEvent(new Event('change', { bubbles: true })); }
      if (view === 'guide' || view === 'flow') document.querySelector('#helpGuideTab').click();
      if (view === 'template') {
        const guide = document.querySelector('#templateGuide'); guide.open = true;
        const select = document.querySelector('#templateSelect'); select.value = 'bugfix'; select.dispatchEvent(new Event('change', { bubbles: true }));
        ['saving an archived week', 'pass the selected week to the writer', 'integration and manual checks'].forEach((value, index) => {
          const field = document.querySelectorAll('#templateFields input')[index]; field.value = value; field.dispatchEvent(new Event('input', { bubbles: true }));
        });
      }
      if (view === 'reports') { document.querySelector('#reportStart').value = '2026-10-01'; document.querySelector('#reportEnd').value = '2026-10-29'; }
      if (['reports', 'team', 'archive', 'changes', 'diagram', 'today'].includes(view)) window.tavriRenderer.showView(view);
      if (view === 'tasktime') window.tavriRenderer.showView('diagram');
      if (view === 'archive') document.querySelector('#archiveSearchForm button[type="submit"]').click();
      if (view === 'export') {
        document.querySelector('#exportMenu').open = true;
        const scope = document.querySelector('#exportScope'); scope.value = 'range'; scope.dispatchEvent(new Event('change', { bubbles: true }));
        const start = document.querySelector('#exportRangeStart'); start.value = '2026-10-26'; start.dispatchEvent(new Event('change', { bubbles: true }));
        const end = document.querySelector('#exportRangeEnd'); end.value = '2026-10-29'; end.dispatchEvent(new Event('change', { bubbles: true }));
      }
      setTimeout(() => {
      if (view === 'tasktime') document.querySelector('#taskTimeSection').scrollIntoView({ block: 'start' });
      if (view === 'diagram') document.querySelector('.weekly-review').scrollIntoView({ block: 'start' });
      if (view === 'flow') document.querySelector('#helpWorkflowTitle').scrollIntoView({ block: 'start' });
      const popup = document.querySelector('.export-popover').getBoundingClientRect();
      const help = document.querySelector('#helpDialog'), helpBox = help.getBoundingClientRect();
      const helpFits = help.open && helpBox.left >= 0 && helpBox.right <= innerWidth && helpBox.top >= 0 && helpBox.bottom <= innerHeight;
      const modeValid = view === 'welcome' ? helpFits && !document.querySelector('#helpWelcomePanel').hidden && document.querySelector('#helpTipText').textContent.length > 0 : view === 'guide' ? helpFits && !document.querySelector('#helpGuidePanel').hidden && document.querySelectorAll('#helpGuidePanel article').length === 6 : view === 'template' ? document.querySelector('#templateGuide').open && document.querySelectorAll('#templateSelect option').length === 12 && document.querySelector('#templatePreview').textContent.startsWith('Fixed saving an archived week') && document.querySelector('#templateGuide').getBoundingClientRect().right <= innerWidth : view === 'edit' ? document.querySelectorAll('[data-theme-choice]').length === 38 && document.querySelectorAll('.theme-preview-symbol').length === 20 && document.querySelectorAll('.theme-choice:not([hidden])').length === (category === 'all' ? 38 : 5) : view === 'today' ? !document.querySelector('#focusSection').hidden && document.querySelectorAll('#focusTasks .focus-task').length === 1 : view === 'team' ? document.querySelectorAll('.team-member').length === 1 : view === 'reports' ? document.querySelectorAll('.report-chart').length === 3 : view === 'archive' ? document.querySelectorAll('#archiveResults .entry').length === 2 : view === 'changes' ? document.querySelectorAll('#changeEvents .change-event').length === 1 : view === 'diagram' ? document.querySelectorAll('#weeklyReviewDays .review-day').length === 7 : view === 'export' ? document.querySelector('#exportMenu').open && !document.querySelector('#exportRangeFields').hidden && popup.left >= 0 && popup.right <= innerWidth : mode === 'calendar' ? document.querySelectorAll('.contribution-cell').length === 365 : mode === 'timeline' ? document.querySelectorAll('.timeline-dot').length === 4 && document.querySelectorAll('.timeline-bubble').length === 4 && document.querySelector('.timeline-bubble--below') && document.querySelector('#timelineFullscreenButton').getBoundingClientRect().right <= innerWidth : input.width > 250 && input.right <= innerWidth;
      const timerValid = view !== 'timer' || (!document.querySelector('#timerTopbarButton').hidden && document.querySelector('#timerElapsed').textContent.startsWith('00:12:') && document.querySelector('#entryInput').value.includes('Preparing the weekly release'));
      const taskTimeValid = view !== 'tasktime' || (document.querySelectorAll('#taskTimeRows .task-time-row').length === 4 && document.querySelectorAll('#taskTimeOverview .task-time-bar--live:not([hidden])').length === 1);
      const flowValid = view !== 'flow' || (helpFits && document.querySelector('#helpWorkflowTitle').textContent === 'A practical focus loop');
      document.body.dataset.layoutValid = String(modeValid && timerValid && taskTimeValid && flowValid && workspace.scrollWidth <= workspace.clientWidth + 1);
      }, 100);
    }, 100));
  </script>`;
  const html = (await fs.readFile(path.join(root, "desktop/index.html"), "utf8"))
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
    .replace('<head>', `<head><base href="${pathToFileURL(path.join(root, "desktop/")).href}">`)
    .replace('</head>', '<style>*, *::before, *::after { transition: none !important; animation: none !important; }</style></head>')
    .replace('<script src="./renderer.cjs"></script>', fixtureBridge + '<script src="./renderer.cjs"></script>' + assertions);
  const htmlPath = path.join(temp, "screenshot.html");
  await fs.writeFile(htmlPath, html);
  const chrome = await chromeBinaryPath();
  for (const [width, height, name, theme, mode, view = "week", accent = "red", category = "all"] of [[1440, 1000, "Screenshot.png", "light", "list"], [900, 620, "Screenshot-compact.png", "light", "list"], [1080, 760, "Screenshot-dark.png", "dark", "list"], [1080, 900, "Screenshot-today-focus.png", "light", "list", "today"], [1080, 900, "Screenshot-guided-template.png", "light", "list", "template"], [1080, 800, "Screenshot-timer.png", "dark", "list", "timer"], [1080, 1000, "Screenshot-timeline.png", "dark", "timeline"], [1440, 1000, "Screenshot-contributions.png", "light", "calendar"], [900, 620, "Screenshot-contributions-compact.png", "dark", "calendar"],
    [1080, 900, "Screenshot-star-trek.png", "star-trek", "list"],
    [1080, 1000, "Screenshot-star-wars.png", "star-wars", "timeline"],
    [1080, 900, "Screenshot-rebel.png", "rebel", "list"],
    [1080, 900, "Screenshot-mandalorian.png", "mandalorian", "list"],
    [1080, 900, "Screenshot-shire.png", "shire", "list"],
    [1080, 900, "Screenshot-mordor.png", "mordor", "list"],
    [1080, 900, "Screenshot-hogwarts.png", "hogwarts", "list"],
    [1080, 900, "Screenshot-slytherin.png", "slytherin", "list"],
    [1080, 900, "Screenshot-arrakis.png", "arrakis", "list"],
    [1080, 900, "Screenshot-winterfell.png", "winterfell", "list"],
    [1080, 900, "Screenshot-pipboy.png", "pipboy", "list"],
    [1080, 900, "Screenshot-nightcity.png", "nightcity", "list"],
    [1080, 900, "Screenshot-blade-runner.png", "blade-runner", "list"],
    [1080, 900, "Screenshot-tron.png", "tron", "list"],
    [1080, 900, "Screenshot-matrix.png", "matrix", "list"],
    [1080, 900, "Screenshot-alien.png", "alien", "list"],
    [1080, 900, "Screenshot-grand-budapest.png", "grand-budapest", "list"],
    [1080, 900, "Screenshot-foundation.png", "foundation", "list"],
    [1080, 900, "Screenshot-discworld.png", "discworld", "list"],
    [1080, 900, "Screenshot-witcher.png", "witcher", "list"],
    [1080, 900, "Screenshot-hunger-games.png", "hunger-games", "list"],
    [1080, 900, "Screenshot-narnia.png", "narnia", "list"],
    [1080, 900, "Screenshot-severance.png", "severance", "list"],
    [1080, 900, "Screenshot-stranger-things.png", "stranger-things", "list"],
    [1080, 900, "Screenshot-x-files.png", "x-files", "list"],
    [1080, 900, "Screenshot-doctor-who.png", "doctor-who", "list"],
    [1080, 900, "Screenshot-last-of-us.png", "last-of-us", "list"],
    [1080, 900, "Screenshot-daft-punk.png", "daft-punk", "list"],
    [1080, 900, "Screenshot-pink-floyd.png", "pink-floyd", "list"],
    [1080, 900, "Screenshot-bowie.png", "bowie", "list"],
    [1080, 900, "Screenshot-kraftwerk.png", "kraftwerk", "list"],
    [1080, 900, "Screenshot-radiohead.png", "radiohead", "list"],
    [900, 650, "Screenshot-welcome.png", "dark", "list", "welcome"],
    [900, 700, "Screenshot-guide.png", "light", "list", "guide"],
    [900, 700, "Screenshot-focus-flow.png", "light", "list", "flow"],
    [1080, 850, "Screenshot-contrast-dark.png", "contrast-dark", "calendar"],
    [900, 620, "Screenshot-contrast-light.png", "contrast-light", "list"],
    [900, 620, "Screenshot-contrast-amber.png", "contrast-amber", "list"],
    [1440, 2600, "Screenshot-themes.png", "dark", "list", "edit"],
    [1440, 1300, "Screenshot-themes-films.png", "dark", "list", "edit", "red", "films"],
    [1440, 1300, "Screenshot-themes-books.png", "dark", "list", "edit", "red", "books"],
    [1440, 1300, "Screenshot-themes-series.png", "dark", "list", "edit", "red", "series"],
    [1440, 1300, "Screenshot-themes-music.png", "dark", "list", "edit", "red", "music"],
    [900, 620, "Screenshot-export-range.png", "dark", "list", "export"],
    [900, 620, "Screenshot-dark-yellow.png", "dark", "list", "week", "gold"],
    [1080, 760, "Screenshot-light-yellow.png", "light", "list", "week", "gold"],
    [900, 620, "Screenshot-dark-white.png", "dark", "list", "week", "white"],
    [1080, 760, "Screenshot-light-white.png", "light", "list", "week", "white"],
    [1080, 1100, "Screenshot-weekly-review.png", "light", "list", "diagram"],
    [1080, 1000, "Screenshot-time-on-tasks.png", "dark", "list", "tasktime"],
    [1080, 900, "Screenshot-archive-search.png", "light", "list", "archive"],
    [1080, 900, "Screenshot-change-history.png", "dark", "list", "changes"],
    [1080, 900, "Screenshot-team.png", "dark", "list", "team"],
    [1080, 1250, "Screenshot-team-report.png", "light", "list", "reports"]]) {
    const target = path.join(temp, name);
    const { stdout } = await exec(chrome, [
      "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
      "--force-device-scale-factor=1", "--allow-file-access-from-files", "--virtual-time-budget=2500",
      `--user-data-dir=${path.join(temp, `profile-${name}`)}`, `--window-size=${width},${height}`,
      `--screenshot=${target}`, "--dump-dom", `${pathToFileURL(htmlPath).href}?theme=${theme}&mode=${mode}&view=${view}&accent=${accent}&category=${category}`,
    ], { timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
    assert(stdout.includes(`data-theme="${theme}"`), `Requested theme ${theme} must be applied`);
    assert(stdout.includes(`data-accent="${accent}"`), `Requested accent ${accent} must be applied`);
    assert(stdout.includes('data-capture-ready="4"'), "Production renderer must paint all entries");
    assert(stdout.includes('data-layout-valid="true"'), `Layout must fit at width ${width}`);
    assert((await fs.stat(target)).size > 0, "Screenshot must not be empty");
    await fs.copyFile(target, path.join(root, "src", name));
    console.log(`Verified ${width}×${height} production UI; wrote src/${name}`);
  }
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
