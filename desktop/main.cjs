const path = require("node:path");
const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, shell, Tray } = require("electron");
const { formatEntriesAsCsv, formatWeekAsPlainText, TavriCoreError, TavriStore } = require("./tavri-core.cjs");

const { filterEntries, parseEntryMessage, formatSpentMinutes, parseSpentToMinutes } = require("./entry-domain.cjs");
const { TeamWorkspace } = require("./team-store.cjs");
const { reportOptions, buildReport, buildReportCsv, buildReportPdfHtml } = require("./report-domain.cjs");
const { revision } = require("./storage.cjs");
const { checkForUpdates } = require("./update-check.cjs");
const { FocusStore } = require("./focus-store.cjs");
const { createWidgetWindow } = require("./widget-window.cjs");

const defaultProfile = path.join(app.getPath("appData"), app.getName());
const usesDefaultProfile = app.getPath("userData") === defaultProfile;
app.setName("Tavri");
if (usesDefaultProfile) {
  const tavriProfile = path.join(app.getPath("appData"), "Tavri");
  const legacyProfile = path.join(app.getPath("appData"), "cgi-worktrace");
  app.setPath("userData", !fs.existsSync(tavriProfile) && fs.existsSync(legacyProfile) ? legacyProfile : tavriProfile);
}

let mainWindow = null;
let store = null;
let teamWorkspace = null;
let focusStore = null;
let tray = null;
let widget = null;
let isQuitting = false;
let pendingRestore = null;
let pendingTeamImport = null;
let checkedReleaseUrl = "";

const DEFAULT_WINDOW_WIDTH = 1080;
const DEFAULT_WINDOW_HEIGHT = 760;
const MIN_WINDOW_WIDTH = 900;
const MIN_WINDOW_HEIGHT = 620;

const exportFormats = {
  csv: {
    extension: "csv",
    label: "CSV",
    mimeType: "text/csv",
  },
  pdf: {
    extension: "pdf",
    label: "PDF",
    mimeType: "application/pdf",
  },
  txt: {
    extension: "txt",
    label: "Plain Text",
    mimeType: "text/plain",
  },
};

function assetPath(fileName) {
  return path.join(__dirname, "..", "assets", fileName);
}

function firstExistingAsset(fileNames) {
  for (const fileName of fileNames) {
    const candidate = assetPath(fileName);

    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return assetPath("tavri-icon.png");
}

function appIconPath() {
  if (process.platform === "darwin") {
    return firstExistingAsset(["tavri-icon.icns", "tavri-icon.png"]);
  }

  if (process.platform === "win32") {
    return firstExistingAsset(["tavri-icon.ico", "tavri-icon.png"]);
  }

  return firstExistingAsset(["tavri-icon.png"]);
}

function trayIcon() {
  const size = process.platform === "darwin" ? 24 : 20;
  return nativeImage.createFromPath(assetPath("tavri-icon.png")).resize({
    height: size,
    width: size,
  });
}

function setDockIcon() {
  if (process.platform === "darwin" && app.dock) {
    try {
      app.dock.setIcon(nativeImage.createFromPath(assetPath("tavri-icon.png")));
    } catch (_error) {
      app.dock.setIcon(nativeImage.createFromPath(appIconPath()));
    }
  }
}

function createStore() {
  store = new TavriStore();
  teamWorkspace = new TeamWorkspace({ logDir: store.logDir });
  focusStore = new FocusStore(store.logDir);
}

function showDockIcon() {
  if (process.platform === "darwin" && app.dock) {
    app.dock.show();
  }
}

function hideDockIcon() {
  if (process.platform === "darwin" && app.dock) {
    app.dock.hide();
  }
}

function showMainWindow() {
  showDockIcon();

  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.setSkipTaskbar(false);
  mainWindow.show();
  mainWindow.focus();
}

function hideMainWindowToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.setSkipTaskbar(true);
  mainWindow.hide();
  hideDockIcon();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    title: "Tavri",
    backgroundColor: "#202524",
    icon: appIconPath(),
    frame: false,
    show: false,
    useContentSize: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("minimize", (event) => {
    event.preventDefault();
    hideMainWindowToTray();
  });

  mainWindow.on("close", (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    hideMainWindowToTray();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", event => event.preventDefault());
  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

function showWidget(hideMain = false) {
  return widget.show(hideMain);
}

function createTray() {
  if (tray) {
    return;
  }

  tray = new Tray(trayIcon());
  tray.setToolTip("Tavri");
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: "Show Tavri",
      click: showMainWindow,
    },
    {
      label: "Show focus widget",
      click: () => showWidget(false),
    },
    {
      label: "Open log directory",
      click: () => {
        handleDesktopAction(openLogDirectory).then((result) => {
          if (!result.ok) {
            console.error(result.error.message);
          }
        });
      },
    },
    { type: "separator" },
    {
      label: "Quit Tavri",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]));

  tray.on("click", showMainWindow);
  tray.on("double-click", showMainWindow);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeExportFormat(format) {
  const key = String(format || "").toLowerCase();

  if (!Object.hasOwn(exportFormats, key)) {
    throw new TavriCoreError(`unsupported export format: ${format}`);
  }

  return key;
}

function defaultExportPath(week, format) {
  const options = exportFormats[format];
  const name = week.rangeStart ? `${week.rangeStart}_to_${week.rangeEnd}` : week.weekStart;
  return path.join(app.getPath("documents"), `tavri-${name}.${options.extension}`);
}

function buildWeekPdfHtml(week) {
  const entries = week.entries || [];
  const rows = entries.length
    ? entries.map((entry) => `
      <tr>
        <td>${escapeHtml(entry.date)}<br>${escapeHtml(entry.time)}</td>
        <td>${escapeHtml(parseEntryMessage(entry.message).message)}<br><small>${escapeHtml([parseEntryMessage(entry.message).project, parseEntryMessage(entry.message).reference, parseEntryMessage(entry.message).timeSpent].filter(Boolean).join(" · "))}</small></td>
      </tr>
    `).join("")
    : `
      <tr>
        <td colspan="2" class="empty">No entries in this selection</td>
      </tr>
    `;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>tavri ${escapeHtml(week.rangeStart ? `${week.rangeStart} to ${week.rangeEnd}` : `week ${week.weekStart}`)}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 34px;
        background: #ffffff;
        color: #17201d;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      header {
        border-bottom: 2px solid #C65343;
        margin-bottom: 22px;
        padding-bottom: 16px;
      }
      h1 {
        margin: 0;
        font-size: 26px;
        line-height: 1.2;
      }
      p {
        margin: 8px 0 0;
        color: #65716d;
        font-size: 13px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th {
        background: #FFF1EB;
        color: #A34235;
        font-size: 12px;
        text-align: left;
        text-transform: uppercase;
      }
      th,
      td {
        border: 1px solid #d9ded8;
        padding: 10px 12px;
        vertical-align: top;
      }
      td:first-child {
        width: 112px;
        color: #A34235;
        font-weight: 700;
        white-space: nowrap;
      }
      .empty {
        color: #65716d;
        font-style: italic;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Tavri ${week.rangeStart ? "activity" : "weekly"} export</h1>
      <p>${escapeHtml(week.rangeStart ? `${week.rangeStart} – ${week.rangeEnd}` : `Week of ${week.weekStart}`)} · ${entries.length} activities · ${escapeHtml(formatSpentMinutes(entries.reduce((sum, entry) => sum + (parseSpentToMinutes(parseEntryMessage(entry.message).timeSpent) || 0), 0)))} recorded</p>
      <p>${escapeHtml(week.scope || "All entries")}</p>
    </header>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Message</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </body>
</html>`;
}

async function createPdf(html) {
  const exportWindow = new BrowserWindow({
    height: 900,
    show: false,
    width: 720,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  try {
    await exportWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await exportWindow.webContents.printToPDF({
      landscape: false,
      margins: {
        marginType: "default",
      },
      pageSize: "A4",
      printBackground: true,
    });
  } finally {
    exportWindow.destroy();
  }
}
async function createWeekPdf(week) { return createPdf(buildWeekPdfHtml(week)); }

async function reportSourceData(options) {
  let own = { entries: [], revision: "" }, imported = { entries: [], revision: "" };
  if (options.source === "personal" || options.personId === "all" || options.personId === "me") own = await store.readRange(options.start, options.end);
  if (options.source === "team" && options.personId !== "me") imported = await teamWorkspace.readRange(options.start, options.end, options.personId);
  const entries = [...own.entries.map(entry => ({ ...entry, person: "You", personId: "me" })), ...imported.entries];
  const scope = options.source === "personal" ? "My activities" : options.personId === "all" ? "Everyone, including me" : options.personId === "me" ? "Only me" : (await teamWorkspace.getState()).members.find(member => member.id === options.personId)?.name || "Selected person";
  return { entries, scope, sourceRevision: revision(JSON.stringify([own.revision, imported.revision])) };
}

async function getReportPreview(input) {
  const options = reportOptions(input);
  const current = await reportSourceData(options);
  let comparison = null, comparisonRevision = "";
  if (options.compare) {
    const day = 86400000;
    const length = Math.round((Date.parse(`${options.end}T12:00:00Z`) - Date.parse(`${options.start}T12:00:00Z`)) / day) + 1;
    const previousEnd = new Date(Date.parse(`${options.start}T12:00:00Z`) - day).toISOString().slice(0, 10);
    const previousStart = new Date(Date.parse(`${options.start}T12:00:00Z`) - length * day).toISOString().slice(0, 10);
    if (previousStart >= "1900-01-01") {
      const priorOptions = { ...options, start: previousStart, end: previousEnd, compare: false };
      const prior = await reportSourceData(priorOptions);
      comparison = { start: previousStart, end: previousEnd, summary: buildReport(prior.entries, priorOptions).summary };
      comparisonRevision = prior.sourceRevision;
    }
  }
  return { ...buildReport(current.entries, options), scope: current.scope, comparison, revision: revision(JSON.stringify([options, current.sourceRevision, comparisonRevision])) };
}

async function exportReport(input, expectedRevision, format = "pdf") {
  const report = await getReportPreview(input);
  if (report.revision !== expectedRevision) throw new TavriCoreError("This report changed. Refresh the preview before exporting.");
  if (!["pdf", "csv"].includes(format)) throw new TavriCoreError("Choose PDF or CSV for this report.");
  const result = await dialog.showSaveDialog(mainWindow, {
    title: `Export work report as ${format.toUpperCase()}`, buttonLabel: "Export report",
    defaultPath: `tavri-${report.options.source}-report-${report.options.start}-to-${report.options.end}.${format}`,
    filters: [{ name: `${format.toUpperCase()} report`, extensions: [format] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  await fsPromises.writeFile(result.filePath, format === "pdf" ? await createPdf(buildReportPdfHtml(report)) : "\ufeff" + buildReportCsv(report));
  return { canceled: false, filePath: result.filePath };
}

async function resolveExportSelection(options = {}) {
  let week;
  if (options.rangeStart !== undefined || options.rangeEnd !== undefined) {
    const history = await store.readRange(options.rangeStart, options.rangeEnd);
    if (!options.rangeRevision || history.revision !== options.rangeRevision) {
      throw new TavriCoreError("This date range changed. Refresh the preview and try again.");
    }
    week = { weekStart: history.start, rangeStart: history.start, rangeEnd: history.end, entries: history.entries };
    options = { ...options, filters: { ...options.filters, start: history.start, end: history.end } };
  } else {
    week = await store.readWeek(options.ref);
    if (options.revision && options.revision !== week.revision) throw new TavriCoreError("This week changed. Refresh before exporting.");
    if (options.year !== undefined) {
      const history = await store.readYear(options.year);
      if (history.revision !== options.yearRevision) throw new TavriCoreError("The activity year changed. Refresh the calendar before exporting.");
      week.entries = history.entries;
    }
  }
  week.entries = filterEntries(week.entries, options.filters);
  week.text = week.entries.map(entry => entry.line).join("\n");
  week.scope = [options.filters?.query && `Search: ${options.filters.query}`, options.filters?.project && `Project: ${options.filters.project}`, options.filters?.start && `From: ${options.filters.start}`, options.filters?.end && `To: ${options.filters.end}`].filter(Boolean).join(" · ") || "All entries";
  return week;
}

async function exportWeek(formatValue, options = {}) {
  const format = normalizeExportFormat(formatValue);
  const formatOptions = exportFormats[format];
  const week = await resolveExportSelection(options);
  const result = await dialog.showSaveDialog(mainWindow, {
    buttonLabel: "Export",
    defaultPath: defaultExportPath(week, format),
    filters: [
      {
        extensions: [formatOptions.extension],
        name: formatOptions.label,
      },
    ],
    title: `Export activities as ${formatOptions.label}`,
  });

  if (result.canceled || !result.filePath) {
    return {
      canceled: true,
      format,
    };
  }

  if (format === "pdf") {
    await fsPromises.writeFile(result.filePath, await createWeekPdf(week));
  } else if (format === "csv") {
    await fsPromises.writeFile(result.filePath, formatEntriesAsCsv(week.entries), "utf8");
  } else {
    await fsPromises.writeFile(result.filePath, formatWeekAsPlainText(week), "utf8");
  }

  return {
    canceled: false,
    filePath: result.filePath,
    format,
    mimeType: formatOptions.mimeType,
  };
}

function serializeError(error) {
  if (error instanceof TavriCoreError) {
    return { message: error.message, expected: true };
  }

  return {
    message: error && error.message ? error.message : "Unexpected desktop error",
    expected: false,
  };
}

async function handleDesktopAction(action) {
  try {
    return { ok: true, data: await action() };
  } catch (error) {
    return { ok: false, error: serializeError(error) };
  }
}

async function openLogDirectory() {
  await store.ensureLogDir();
  const result = await shell.openPath(store.logDir);

  if (result) {
    throw new TavriCoreError(result);
  }

  return store.logDir;
}

app.whenReady().then(() => {
  if (process.platform === "win32") {
    app.setAppUserModelId("com.tavri.desktop");
  }

  setDockIcon();
  createStore();
  widget = createWidgetWindow({ icon: appIconPath(), directory: __dirname, hideMain: hideMainWindowToTray, showMain: showMainWindow, sendToMain: command => mainWindow?.webContents.send("tavri:widget-command", command) });
  createTray();
  createWindow();

  app.on("activate", () => {
    showMainWindow();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (isQuitting) {
    app.quit();
  }
});

function registerIpc(channel, action) {
  ipcMain.handle(channel, (event, ...args) => {
    const valid = channel === "tavri:widget-command" ? widget?.isSender(event.sender) : event.sender === mainWindow?.webContents;
    if (!valid) return { ok: false, error: { message: "This action is not available from this window.", expected: true } };
    return action(event, ...args);
  });
}

registerIpc("tavri:get-state", (_event, ref) => handleDesktopAction(() => store.getState(ref)));
registerIpc("tavri:focus-get", event => handleDesktopAction(() => {
  if (event.sender !== mainWindow?.webContents) throw new TavriCoreError("Invalid window.");
  return focusStore.read();
}));
registerIpc("tavri:focus-create", (event, input, expectedRevision) => handleDesktopAction(() => {
  if (event.sender !== mainWindow?.webContents) throw new TavriCoreError("Invalid window.");
  return focusStore.create(input, expectedRevision);
}));
registerIpc("tavri:focus-update", (event, id, input, expectedRevision) => handleDesktopAction(() => {
  if (event.sender !== mainWindow?.webContents) throw new TavriCoreError("Invalid window.");
  return focusStore.update(id, input, expectedRevision);
}));
registerIpc("tavri:widget-show", event => handleDesktopAction(() => {
  if (event.sender !== mainWindow?.webContents) throw new TavriCoreError("Invalid window.");
  return showWidget(true);
}));
registerIpc("tavri:widget-state-update", (event, input) => handleDesktopAction(() => {
  if (event.sender !== mainWindow?.webContents) throw new TavriCoreError("Invalid window.");
  const title = String(input?.title || "No active task").trim().slice(0, 200);
  const project = String(input?.project || "").trim().slice(0, 120);
  const locale = ["en", "pl", "de", "es", "fr", "pt"].includes(input?.locale) ? input.locale : "en";
  const elapsedMs = Number(input?.elapsedMs);
  const runningSince = input?.runningSince;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 365 * 86400000 ||
      !(runningSince === null || Number.isSafeInteger(runningSince) && runningSince <= Date.now() + 60000)) throw new TavriCoreError("Invalid timer state.");
  widget.update({ title, project, elapsedMs, runningSince, active: Boolean(input?.active), locale });
  return true;
}));
registerIpc("tavri:widget-command", (event, command) => handleDesktopAction(() => {
  if (!widget.isSender(event.sender)) throw new TavriCoreError("Invalid widget window.");
  return widget.command(command);
}));
registerIpc("tavri:get-year", (_event, year) => handleDesktopAction(() => store.readYear(year)));
registerIpc("tavri:get-range", (_event, start, end) => handleDesktopAction(() => store.readRange(start, end)));
registerIpc("tavri:archive-search", (_event, options) => handleDesktopAction(() => store.searchArchive(options)));
registerIpc("tavri:recent-changes", () => handleDesktopAction(() => store.readRecentChanges()));
registerIpc("tavri:check-updates", () => handleDesktopAction(async () => {
  const result = await checkForUpdates(app.getVersion());
  checkedReleaseUrl = result.releaseUrl;
  return result;
}));
registerIpc("tavri:open-update-page", () => handleDesktopAction(async () => {
  if (!checkedReleaseUrl) throw new TavriCoreError("Check for updates first.");
  await shell.openExternal(checkedReleaseUrl);
  return true;
}));
registerIpc("tavri:backup-create", () => handleDesktopAction(async () => {
  const backup = await store.createBackup();
  const result = await dialog.showSaveDialog(mainWindow, { title: "Save personal journal backup", buttonLabel: "Save backup", defaultPath: `tavri-backup-${store.todayDate()}.tavri-backup.json`, filters: [{ name: "Tavri backup", extensions: ["json"] }] });
  if (result.canceled || !result.filePath) return { canceled: true };
  await fsPromises.writeFile(result.filePath, JSON.stringify(backup, null, 2) + "\n");
  return { canceled: false, filePath: result.filePath, weeks: Object.keys(backup.files).length };
}));
registerIpc("tavri:backup-choose", () => handleDesktopAction(async () => {
  const result = await dialog.showOpenDialog(mainWindow, { title: "Choose Tavri personal backup", buttonLabel: "Preview backup", properties: ["openFile"], filters: [{ name: "Tavri backup", extensions: ["json"] }] });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  const filePath = result.filePaths[0];
  const stat = await fsPromises.lstat(filePath);
  if (!stat.isFile() || stat.size > 110 * 1024 * 1024) throw new TavriCoreError("Choose a Tavri backup smaller than 110 MB.");
  const text = await fsPromises.readFile(filePath, "utf8");
  let backup;
  try { backup = JSON.parse(text); } catch { throw new TavriCoreError("This backup file is not valid JSON."); }
  const preview = await store.previewRestore(backup);
  const token = randomUUID();
  pendingRestore = { token, filePath, fileRevision: revision(text), expected: preview.expected };
  const { expected, ...summary } = preview;
  return { canceled: false, token, filePath, preview: summary };
}));
registerIpc("tavri:backup-restore", (_event, token) => handleDesktopAction(async () => {
  if (!pendingRestore || token !== pendingRestore.token) throw new TavriCoreError("Choose and preview the backup again.");
  const selected = pendingRestore;
  const text = await fsPromises.readFile(selected.filePath, "utf8");
  if (revision(text) !== selected.fileRevision) throw new TavriCoreError("The backup file changed after preview. Choose it again.");
  const result = await store.restoreBackup(JSON.parse(text), selected.expected);
  pendingRestore = null;
  return { ...result, state: await store.getState() };
}));
registerIpc("tavri:team-state", () => handleDesktopAction(() => teamWorkspace.getState()));
registerIpc("tavri:team-import", (_event, name, kind = "files") => handleDesktopAction(async () => {
  if (!["files", "folder", "zip"].includes(kind)) throw new TavriCoreError("Choose files, a folder or a ZIP archive.");
  const dialogOptions = kind === "folder"
    ? { title: "Choose folder with Tavri weekly files", buttonLabel: "Preview folder", properties: ["openDirectory"] }
    : kind === "zip"
      ? { title: "Choose ZIP with Tavri weekly files", buttonLabel: "Preview ZIP", properties: ["openFile"], filters: [{ name: "ZIP archive", extensions: ["zip"] }] }
      : { title: "Import Tavri weekly files", buttonLabel: "Preview files", properties: ["openFile", "multiSelections"], filters: [{ name: "Tavri weekly logs", extensions: ["log"] }] };
  const result = await dialog.showOpenDialog(mainWindow, dialogOptions);
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  const prepared = await teamWorkspace.prepareImport(name, result.filePaths, kind);
  const token = randomUUID();
  pendingTeamImport = { token, prepared };
  return { canceled: false, token, preview: prepared.preview };
}));
registerIpc("tavri:team-import-commit", (_event, token) => handleDesktopAction(async () => {
  if (!pendingTeamImport || pendingTeamImport.token !== token) throw new TavriCoreError("Preview the team files again before importing.");
  const state = await teamWorkspace.importPrepared(pendingTeamImport.prepared);
  pendingTeamImport = null;
  return state;
}));
registerIpc("tavri:team-remove", (_event, id) => handleDesktopAction(() => teamWorkspace.removeMember(id)));
registerIpc("tavri:team-remove-week", (_event, id, ref) => handleDesktopAction(() => teamWorkspace.removeWeek(id, ref)));
registerIpc("tavri:team-undo", () => handleDesktopAction(() => teamWorkspace.undoLastChange()));
registerIpc("tavri:report-preview", (_event, options) => handleDesktopAction(() => getReportPreview(options)));
registerIpc("tavri:report-export", (_event, options, reportRevision, format) => handleDesktopAction(() => exportReport(options, reportRevision, format)));
function requireRevision(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new TavriCoreError("Refresh this week before changing it.");
  return value;
}

registerIpc("tavri:add-entry", (_event, message, time, date) => handleDesktopAction(() => store.addEntry(message, time, date).then(() => store.getState(date))));
registerIpc("tavri:clone-entry", (_event, ref, target, revision) => handleDesktopAction(() => store.cloneEntry(ref, target, requireRevision(revision)).then(() => store.getState(ref))));
registerIpc("tavri:delete-entry", (_event, ref, target, revision) => handleDesktopAction(async () => {
  const result = await store.deleteEntry(ref, target, requireRevision(revision));
  return { ...await store.getState(ref), undoToken: result.undoToken };
}));
registerIpc("tavri:undo-delete", (_event, token) => handleDesktopAction(async () => {
  const week = await store.undoDelete(token);
  return store.getState(week.weekStart);
}));
registerIpc("tavri:edit-entry", (_event, ref, target, date, time, message, revision) => handleDesktopAction(() => store.editEntry(ref, target, date, time, message, requireRevision(revision)).then(week => store.getState(week.weekStart))));
registerIpc("tavri:copy-text", (_event, text) => handleDesktopAction(() => {
  clipboard.writeText(String(text || ""));
  return true;
}));
registerIpc("tavri:copy-range", (_event, options) => handleDesktopAction(async () => {
  if (options?.rangeStart === undefined || options?.rangeEnd === undefined) throw new TavriCoreError("Choose a date range to copy.");
  const selection = await resolveExportSelection(options);
  clipboard.writeText(selection.text ? `${selection.text}\n` : "");
  return selection.entries.length;
}));
registerIpc("tavri:save-week", (_event, ref, text, revision) => handleDesktopAction(() => store.saveWeek(ref, text, requireRevision(revision)).then(() => store.getState(ref))));
registerIpc("tavri:open-log-dir", () => handleDesktopAction(openLogDirectory));
registerIpc("tavri:export-week", (_event, format, options) => handleDesktopAction(() => exportWeek(format, options)));
registerIpc("tavri:minimize-window", () => handleDesktopAction(() => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
}));
registerIpc("tavri:maximize-window", () => handleDesktopAction(() => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
}));
registerIpc("tavri:close-window", () => handleDesktopAction(() => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
}));
registerIpc("tavri:reload-window", () => handleDesktopAction(() => {
  if (mainWindow && !mainWindow.isDestroyed()) setImmediate(() => mainWindow?.webContents.reload());
  return true;
}));
