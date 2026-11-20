const path = require("node:path");
const fs = require("node:fs");
const { app, BrowserWindow, screen } = require("electron");

function createWidgetWindow({ icon, directory, hideMain, showMain, sendToMain }) {
  let window = null;
  let state = { title: "No active task", project: "", elapsedMs: 0, runningSince: null, active: false };
  const boundsFile = path.join(app.getPath("userData"), "focus-widget-bounds.json");
  let saveBoundsTimer = null;
  const sendState = () => { if (window && !window.isDestroyed()) window.webContents.send("tavri:widget-state", state); };

  function initialBounds() {
    const display = screen.getPrimaryDisplay().workArea;
    const fallback = { x: display.x + Math.max(0, display.width - 350), y: display.y + 24, width: 326, height: 164 };
    try {
      const saved = JSON.parse(fs.readFileSync(boundsFile, "utf8"));
      if (![saved.x, saved.y, saved.width, saved.height].every(Number.isInteger) || saved.width < 326 || saved.width > 420 || saved.height < 164 || saved.height > 220) return fallback;
      if (!screen.getAllDisplays().some(item => {
        const area = item.workArea;
        return saved.x + saved.width > area.x + 60 && saved.x < area.x + area.width - 60 && saved.y + saved.height > area.y + 40 && saved.y < area.y + area.height - 40;
      })) return fallback;
      return saved;
    } catch { return fallback; }
  }

  function persistBounds(bounds) {
    try {
      fs.mkdirSync(path.dirname(boundsFile), { recursive: true });
      const temporary = `${boundsFile}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(bounds) + "\n");
      fs.renameSync(temporary, boundsFile);
    } catch { /* A locked profile should not interrupt the widget. */ }
  }

  function scheduleBoundsSave() {
    if (!window || window.isDestroyed()) return;
    if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
    const bounds = window.getBounds();
    saveBoundsTimer = setTimeout(() => { saveBoundsTimer = null; persistBounds(bounds); }, 250);
  }

  function create() {
    if (window && !window.isDestroyed()) return window;
    window = new BrowserWindow({
      ...initialBounds(), minWidth: 326, minHeight: 164, maxWidth: 420, maxHeight: 220,
      title: "Tavri focus widget", frame: false, show: false, resizable: true,
      alwaysOnTop: true, skipTaskbar: true, backgroundColor: "#202524", icon,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(directory, "widget-preload.cjs") },
    });
    window.setAlwaysOnTop(true, "floating");
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", event => event.preventDefault());
    window.webContents.on("did-finish-load", sendState);
    window.on("move", scheduleBoundsSave);
    window.on("resize", scheduleBoundsSave);
    window.on("close", () => persistBounds(window.getBounds()));
    window.on("closed", () => { if (saveBoundsTimer) clearTimeout(saveBoundsTimer); saveBoundsTimer = null; window = null; });
    window.loadFile(path.join(directory, "widget.html"));
    return window;
  }

  return {
    isSender(sender) { return sender === window?.webContents; },
    show(minimizeMain = false) {
      const widget = create();
      widget.show(); widget.focus(); sendState();
      if (minimizeMain) hideMain();
      return true;
    },
    update(next) { state = next; sendState(); },
    command(action) {
      if (action === "open") { showMain(); return true; }
      if (action === "hide") { window?.hide(); return true; }
      if (!["pause", "resume", "finish"].includes(action)) throw new Error("Unsupported widget action.");
      sendToMain(action);
      return true;
    },
  };
}

module.exports = { createWidgetWindow };
