const { contextBridge, ipcRenderer } = require("electron");

async function invoke(channel, ...args) {
  const response = await ipcRenderer.invoke(channel, ...args);

  if (!response.ok) {
    const error = new Error(response.error.message);
    error.expected = response.error.expected;
    throw error;
  }

  return response.data;
}

contextBridge.exposeInMainWorld("tavri", {
  getFocus: () => invoke("tavri:focus-get"),
  createFocusTask: (input, revision) => invoke("tavri:focus-create", input, revision),
  updateFocusTask: (id, input, revision) => invoke("tavri:focus-update", id, input, revision),
  showWidget: () => invoke("tavri:widget-show"),
  updateWidget: state => invoke("tavri:widget-state-update", state),
  onWidgetCommand: callback => ipcRenderer.on("tavri:widget-command", (_event, command) => callback(command)),
  addEntry: (message, time, date) => invoke("tavri:add-entry", message, time, date),
  cloneEntry: (ref, target, revision) => invoke("tavri:clone-entry", ref, target, revision),
  exportWeek: (format, options) => invoke("tavri:export-week", format, options),
  getRange: (start, end) => invoke("tavri:get-range", start, end),
  searchArchive: (options) => invoke("tavri:archive-search", options),
  getRecentChanges: () => invoke("tavri:recent-changes"),
  checkForUpdates: () => invoke("tavri:check-updates"),
  openUpdatePage: () => invoke("tavri:open-update-page"),
  getState: (ref) => invoke("tavri:get-state", ref),
  getYear: (year) => invoke("tavri:get-year", year),
  createBackup: () => invoke("tavri:backup-create"),
  chooseBackup: () => invoke("tavri:backup-choose"),
  restoreBackup: (token) => invoke("tavri:backup-restore", token),
  getTeamState: () => invoke("tavri:team-state"),
  importTeamFiles: (name, kind) => invoke("tavri:team-import", name, kind),
  commitTeamImport: (token) => invoke("tavri:team-import-commit", token),
  removeTeamMember: (id) => invoke("tavri:team-remove", id),
  removeTeamWeek: (id, ref) => invoke("tavri:team-remove-week", id, ref),
  undoTeamChange: () => invoke("tavri:team-undo"),
  getReportPreview: (options) => invoke("tavri:report-preview", options),
  exportReport: (options, revision, format) => invoke("tavri:report-export", options, revision, format),
  maximizeWindow: () => invoke("tavri:maximize-window"),
  openLogDir: () => invoke("tavri:open-log-dir"),
  minimizeWindow: () => invoke("tavri:minimize-window"),
  deleteEntry: (ref, target, revision) => invoke("tavri:delete-entry", ref, target, revision),
  undoDelete: (token) => invoke("tavri:undo-delete", token),
  editEntry: (ref, target, date, time, message, revision) => invoke("tavri:edit-entry", ref, target, date, time, message, revision),
  copyText: (text) => invoke("tavri:copy-text", text),
  copyRange: (options) => invoke("tavri:copy-range", options),
  saveWeek: (ref, text, revision) => invoke("tavri:save-week", ref, text, revision),
  closeWindow: () => invoke("tavri:close-window"),
  reloadWindow: () => invoke("tavri:reload-window"),
});
