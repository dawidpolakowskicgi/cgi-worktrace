/* The renderer owns presentation state; entry parsing is shared with exports. */
const entryDomain = typeof module !== "undefined" ? require("./entry-domain.cjs") : globalThis.TavriEntries;
const { parseEntryMessage, buildEntryMessage, parseSpentToMinutes, formatSpentMinutes, buildDiagramData, buildTaskTimeData, filterEntries, validateEntryFields, isDateLiteral } = entryDomain;
const { createActivityViews } = typeof module !== "undefined" ? require("./activity-views.cjs") : globalThis.TavriActivityViews;
const { createTeamReportsUi } = typeof module !== "undefined" ? require("./team-reports-ui.cjs") : globalThis.TavriTeamReportsUi;
const { createThemeSymbol } = typeof module !== "undefined" ? require("./theme-symbols.cjs") : globalThis.TavriThemeSymbols;
const { activityTemplates, buildTemplateDescription } = typeof module !== "undefined" ? require("./activity-templates.cjs") : globalThis.TavriActivityTemplates;
const viewTitles = { week: "Activity", today: "Today", archive: "Search archive", changes: "Change history", diagram: "Insights", reports: "Reports", team: "Team", edit: "Settings" };

const { appearanceThemes } = typeof module !== "undefined" ? require("./appearance-themes.cjs") : globalThis.TavriAppearance;
const i18n = typeof module !== "undefined" ? require("./i18n.cjs") : globalThis.TavriI18n;

function createTavriRenderer({ document: doc, api, initialView = "week" }) {
  const win = doc.defaultView;
  const t = i18n.translate;
  const $ = id => doc.getElementById(id);
  const fields = ["entryInput", "entryDateInput", "entryTimeInput", "timeSpentInput", "projectInput", "referenceInput", "taskSelect"];
  let state, view = initialView, busy = false, checkingExternal = false, editing = null, undoToken = null;
  let filters = { query: "", project: "", start: "", end: "" };
  let editor = { ref: "", revision: "", dirty: false };
  let newDraft = null;
  let theme = "system", accent = "red";
  let activityMode = "list", calendarYear = null, calendarState = null, calendarDirty = true, calendarError = "";
  let selectedDate = "", timelineKey = "";
  let rangePreview = null, rangePreviewRequest = 0;
  let workspaceMode = "personal";
  let changeHistory = [];
  let timerState = null;
  let taskTimeKey = "";
  let focusState = { tasks: [], revision: "" };
  let widgetKey = "";
  let selectedRange = null;
  let reportRangeKey = "";
  const calendarActive = () => view === "week" && activityMode === "calendar";
  const calendarReady = () => calendarState?.year === calendarYear && !calendarError;
  const activityViews = createActivityViews({ document: doc, dateLabel, t,
    selectTimeline(entry) {
      timelineKey = activityViews.key(entry); renderModes();
      const target = [...$("timelineCanvas").querySelectorAll(".timeline-dot[data-entry-key]")].find(node => node.dataset.entryKey === timelineKey);
      target?.focus({ preventScroll: true });
      $("timelineSelection").scrollIntoView({ block: "nearest" });
    },
    selectDay(date) { selectedDate = date; renderVisible(); $("contributionsGrid").querySelector(`[data-date="${date}"]`)?.focus({ preventScroll: true }); },
  });
  const media = win.matchMedia("(prefers-color-scheme: dark)");
  const storage = {
    get(key) { try { return win.localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { win.localStorage.setItem(key, value); } catch { /* Private/locked profile: retain in memory. */ } },
    remove(key) { try { win.localStorage.removeItem(key); } catch { /* Keep UI usable. */ } },
  };
  const helpTips = [
    "Plan up to three clear outcomes in Today. Choose what you want to finish, not just how long to work.",
    "Start a session from the planned task. The focus widget can keep its timer visible above other windows.",
    "Pause the timer for breaks; use its time and save what changed at the end of a session.",
    "Link later sessions to the same task. Their time stays together even when activity wording changes.",
    "In Insights, the striped timer segment is unsaved. Reports use recorded durations only.",
    "A long task bar shows time spent, not progress. Record a blocker or next step in the activity text.",
    "Review Today's open outcomes once a day. Record a next step, then finish or move each one.",
    "Copy the weekly summary or build a report when you need to share work with others.",
  ];
  let helpSection = "welcome";
  let helpTipIndex = Math.floor(Date.now() / 86400000) % helpTips.length;
  function renderHelpTip() {
    $("helpTipNumber").textContent = String(helpTipIndex + 1);
    $("helpTipTotal").textContent = String(helpTips.length);
    $("helpTipText").textContent = helpTips[helpTipIndex];
  }
  function selectHelpSection(section) {
    helpSection = section === "guide" ? "guide" : "welcome";
    $("helpTitle").textContent = helpSection === "guide" ? "Tavri guide & tips" : "Welcome to Tavri";
    $("helpDialog").querySelector(".help-intro").textContent = helpSection === "guide" ? "A practical guide to your journal, reports and local data." : "Capture what you did, find it later and turn it into a useful summary.";
    $("helpWelcomePanel").hidden = helpSection !== "welcome";
    $("helpGuidePanel").hidden = helpSection !== "guide";
    $("helpWelcomeTab").setAttribute("aria-pressed", String(helpSection === "welcome"));
    $("helpGuideTab").setAttribute("aria-pressed", String(helpSection === "guide"));
    $("helpDoneButton").textContent = helpSection === "welcome" ? "Start using Tavri" : "Back to Tavri";
    $("helpDialog").querySelector(".help-scroll").scrollTop = 0;
  }
  function openHelp(section = "guide") {
    selectHelpSection(section);
    $("skipWelcomeCheckbox").checked = storage.get("tavri-hide-welcome") === "true";
    renderHelpTip();
    if (!$("helpDialog").open) $("helpDialog").showModal();
  }
  function closeHelp(start = false) {
    $("helpDialog").close();
    if (start && helpSection === "welcome") { showView("week"); $("entryInput").focus(); }
  }
  function el(tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, action, className = "text-button") {
    const node = el("button", className, text);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  }
  function setStatus(text = "", tone = "ok") {
    $("status").textContent = text;
    $("status").dataset.tone = tone;
    $("status").setAttribute("role", tone === "error" ? "alert" : "status");
  }
  function setBusy(value) {
    busy = value;
    $("workspace").setAttribute("aria-busy", String(value));
    doc.querySelectorAll("main button, main input, main select, main textarea, .tab").forEach(node => { node.disabled = value; });
    if (!value && $("templateSelect").options.length) updateTemplatePreview();
    renderTimer();
    if (state) renderFocus();
  }
  async function perform(action) {
    if (busy) return false;
    setBusy(true);
    try { await action(); return true; }
    catch (error) { setStatus(error.message || "Something went wrong. Try again.", "error"); return false; }
    finally {
      if (calendarActive() && calendarDirty && state) await refreshCalendar();
      setBusy(false);
    }
  }
  async function confirm(title, message, accept) {
    const dialog = $("confirmDialog");
    if (dialog.open) return false;
    $("confirmTitle").textContent = title;
    $("confirmMessage").textContent = message;
    $("confirmAccept").textContent = accept;
    dialog.returnValue = "cancel";
    return new Promise(resolve => {
      dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
      dialog.showModal();
    });
  }
  const teamReports = createTeamReportsUi({ document: doc, api, perform, confirm, setStatus, getToday: () => state?.today.date, t, locale: i18n.getLocale() });
  function setWorkspaceMode(mode) {
    workspaceMode = mode === "team" ? "team" : "personal";
    storage.set("tavri-workspace-mode", workspaceMode);
    $("workspaceModeSelect").value = workspaceMode;
    $("workspaceModeLabel").textContent = workspaceMode === "team" ? "Admin / PO · Local team" : "Personal workspace";
    doc.querySelector('[data-view="team"]').hidden = workspaceMode !== "team";
    teamReports.setMode(workspaceMode);
    if (workspaceMode !== "team" && view === "team") showView("reports");
  }
  function dateLabel(value, options = { month: "short", day: "numeric" }) {
    return isDateLiteral(value) ? new Intl.DateTimeFormat(({ en: "en-GB", pl: "pl-PL", de: "de-DE", es: "es-ES", fr: "fr-FR", pt: "pt-PT" })[i18n.getLocale()] || "en-GB", { timeZone: "UTC", ...options }).format(new Date(value + "T12:00:00Z")) : value;
  }
  function shiftedDate(value, days) {
    const date = new Date(value + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }
  function weekLabel(value) { return `${dateLabel(value)} – ${dateLabel(shiftedDate(value, 6), { day: "numeric", month: "short", year: "numeric" })}`; }
  async function refreshCalendar() {
    calendarYear ||= Number(state.today.date.slice(0, 4));
    calendarDirty = false; calendarError = "";
    try {
      calendarState = await api.getYear(calendarYear);
      if (!selectedDate.startsWith(`${calendarYear}-`)) selectedDate = calendarYear === Number(state.today.date.slice(0,4)) ? state.today.date : `${calendarYear}-12-31`;
    } catch (error) { calendarError = error.message || "Could not load the year. Refresh to try again."; }
    renderProjectOptions(); renderVisible();
  }
  async function setActivityMode(mode) {
    if (busy || !["list", "timeline", "calendar"].includes(mode)) return;
    if (mode !== "timeline" && doc.fullscreenElement === $("timelinePanel")) await doc.exitFullscreen();
    activityMode = mode; storage.set("tavri-activity-mode", mode);
    syncModes(); renderProjectOptions(); renderVisible();
    if (calendarActive() && (calendarDirty || !calendarReady())) await perform(async () => { calendarDirty = true; });
    doc.querySelector(`[data-activity-mode="${activityMode}"]`)?.focus({ preventScroll: true });
  }
  function syncModes() {
    $("focusSection").hidden = view !== "today";
    $("modeToolbar").hidden = view !== "week";
    $("modeAddButton").hidden = view !== "week" || activityMode === "list" || Boolean(editing);
    $("composer").hidden = !["week", "today"].includes(view) || (view === "week" && activityMode !== "list" && !editing);
    $("metrics").hidden = ["edit", "reports", "team", "archive", "changes"].includes(view) || calendarActive();
    $("weekView").hidden = view !== "week" || activityMode !== "list";
    $("timelinePanel").hidden = view !== "week" || activityMode !== "timeline";
    $("calendarPanel").hidden = !calendarActive();
    $("periodToolbar").hidden = ["today", "reports", "team", "archive", "changes"].includes(view) || calendarActive() || (view === "edit" && !$("advancedSettings").open);
    doc.querySelectorAll("[data-activity-mode]").forEach(tab => {
      const active = tab.dataset.activityMode === activityMode;
      tab.setAttribute("aria-selected", String(active)); tab.tabIndex = active ? 0 : -1;
    });
  }
  function renderModes() {
    syncModes();
    if (view !== "week" || !state) return;
    if (activityMode === "timeline") {
      const entries = visibleEntries();
      const selected = entries.find(entry => activityViews.key(entry) === timelineKey) || [...entries].sort((a,b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))[0];
      timelineKey = selected ? activityViews.key(selected) : "";
      activityViews.timeline(entries, timelineKey);
      $("timelineSelection").replaceChildren();
      if (selected) renderEntries($("timelineSelection"), [selected], sourceContext(false));
    }
    if (calendarActive()) {
      $("calendarYearLabel").textContent = calendarYear || "…";
      if (!calendarReady()) {
        $("calendarSummary").textContent = calendarError || "Loading your activity year…";
        $("contributionsGrid").replaceChildren(); $("contributionEntries").replaceChildren();
        $("contributionDateLabel").textContent = ""; $("contributionCount").textContent = "";
        return;
      }
      activityViews.calendar(calendarYear, filterEntries(calendarState.entries, filters), selectedDate);
      const entries = visibleEntries();
      $("contributionDateLabel").textContent = dateLabel(selectedDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      $("contributionCount").textContent = `${entries.length} ${entries.length === 1 ? "activity" : "activities"}`;
      renderEntries($("contributionEntries"), entries, sourceContext());
    }
  }
  function visibleEntries() {
    if (calendarActive()) return calendarReady() ? filterEntries(calendarState.entries, filters).filter(entry => entry.date === selectedDate) : [];
    if (view !== "today" && selectedRange) return filterEntries(selectedRange.entries, filters);
    return filterEntries(view === "today" ? state?.today.entries || [] : state?.week.entries || [], filters);
  }
  function sourceContext(today = view === "today") {
    if (calendarActive()) {
      if (!calendarReady() || !selectedDate) return { ref: "", revision: "" };
      const day = new Date(selectedDate + "T12:00:00Z").getUTCDay();
      const ref = shiftedDate(selectedDate, -((day + 6) % 7));
      return { ref, revision: calendarState.revisions[ref] };
    }
    return today ? { ref: state.today.weekStart, revision: state.today.revision } : { ref: state.week.weekStart, revision: state.week.revision };
  }
  function readDraft() { return Object.fromEntries(fields.map(id => [id, $(id).value])); }
  function fillDraft(draft) {
    const taskId = draft?.taskSelect || "";
    if (taskId && ![...$("taskSelect").options].some(option => option.value === taskId)) {
      const option = el("option", "", "Linked task from older data"); option.value = taskId; $("taskSelect").append(option);
    }
    fields.forEach(id => { $(id).value = draft?.[id] || ""; });
  }
  function defaultDateTime() {
    const now = new Date();
    $("entryDateInput").value = state?.today.date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    $("entryTimeInput").value = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }
  function persistDraft() {
    if (!editing) storage.set("tavri-entry-draft", JSON.stringify(readDraft()));
    $("draftHint").textContent = $("entryInput").value.trim() ? (editing ? "Unsaved changes" : "Draft saved on this device") : "Small updates. A clearer picture.";
    updateWidgetState();
  }
  function updateWidgetState() {
    const draft = timerDraft();
    const task = focusState.tasks.find(item => item.id === draft.taskSelect);
    const snapshot = { title: draft.entryInput?.trim() || task?.title || "No active task", project: draft.projectInput?.trim() || task?.project || "", elapsedMs: timerState?.elapsedMs || 0, runningSince: timerState?.runningSince ?? null, active: Boolean(timerState), locale: i18n.getLocale() };
    const key = JSON.stringify(snapshot);
    if (key !== widgetKey) { widgetKey = key; void api.updateWidget?.(snapshot)?.catch(() => {}); }
  }
  function timerElapsedMs(now = Date.now()) {
    if (!timerState) return 0;
    return timerState.elapsedMs + (timerState.runningSince === null ? 0 : Math.max(0, now - timerState.runningSince));
  }
  function timerClock(ms) {
    const seconds = Math.floor(Math.max(0, ms) / 1000);
    return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }
  function saveTimer() {
    if (timerState) storage.set("tavri-activity-timer", JSON.stringify(timerState));
    else storage.remove("tavri-activity-timer");
  }
  function renderTimer() {
    const active = Boolean(timerState), running = active && timerState.runningSince !== null;
    const value = timerClock(timerElapsedMs());
    $("activityTimer").hidden = !active || Boolean(editing);
    $("activityTimer").dataset.state = running ? "running" : active ? "paused" : "idle";
    $("timerElapsed").textContent = value;
    $("timerStateLabel").textContent = running ? "Running" : active ? "Paused" : "Track time as you work";
    $("timerStartButton").hidden = active || Boolean(editing);
    $("timerPauseButton").hidden = !running;
    $("timerResumeButton").hidden = !active || running;
    $("timerFinishButton").hidden = !active;
    $("timerDiscardButton").hidden = !active;
    $("timerStartButton").disabled = busy || Boolean(editing);
    $("timerTopbarButton").hidden = !active;
    $("timerTopbarButton").disabled = busy;
    $("timerTopbarButton").dataset.state = running ? "running" : "paused";
    $("timerTopbarButton").setAttribute("aria-label", `${running ? "Running" : "Paused"} activity timer, ${value}. Return to activity`);
    $("timerTopbarLabel").textContent = running ? value : `Paused · ${value}`;
    $("timerHelp").textContent = active ? "Breaks are excluded when paused. Saving adds the measured time, rounded up to a minute, to any duration already entered. The timer keeps running while Tavri is closed." : "Start sets the activity date and time. Pause for breaks; use the measured time or save the activity directly.";
    updateWidgetState();
    if (view === "diagram" && state && taskTimeKey !== taskTimeStateKey()) renderTaskTime();
  }
  function startTimer() {
    if (busy || editing || timerState) return;
    const now = new Date(), stamp = Date.now();
    timerState = { version: 1, startedAt: stamp, runningSince: stamp, elapsedMs: 0 };
    $("entryDateInput").value = state?.today.date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    $("entryTimeInput").value = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    persistDraft(); saveTimer(); renderTimer(); setStatus("Timer started. Pause it for breaks or save the activity when you finish.");
  }
  function pauseTimer() {
    if (!timerState || timerState.runningSince === null) return;
    timerState.elapsedMs = timerElapsedMs(); timerState.runningSince = null;
    saveTimer(); renderTimer(); setStatus("Timer paused. Paused time will not be added to the activity.");
  }
  function resumeTimer() {
    if (!timerState || timerState.runningSince !== null) return;
    timerState.runningSince = Date.now(); saveTimer(); renderTimer(); setStatus("Timer resumed.");
  }
  function durationWithTimer(existing) {
    if (!timerState) return existing;
    const currentMinutes = parseSpentToMinutes(existing);
    if (!Number.isFinite(currentMinutes)) throw new Error("Correct the duration before using the timer time.");
    return formatSpentMinutes(currentMinutes + Math.max(1, Math.ceil(timerElapsedMs() / 60000)));
  }
  function finishTimer() {
    if (!timerState || editing) return;
    try { $("timeSpentInput").value = durationWithTimer($("timeSpentInput").value); }
    catch (error) { $("entryDetails").open = true; setStatus(error.message, "error"); return; }
    timerState = null; saveTimer(); persistDraft(); renderTimer();
    $("entryDetails").open = true;
    setStatus("Measured time added to Duration. Review the activity, then save it.");
  }
  async function discardTimer() {
    if (!timerState || editing) return;
    if (timerElapsedMs() > 0 && !await confirm("Discard measured time?", "The timer time will be lost. Your activity draft and any manually entered duration will stay.", "Discard timer")) return;
    timerState = null; saveTimer(); renderTimer(); setStatus("Timer discarded. Your activity draft is still here.");
  }
  function restoreTimer() {
    try {
      const saved = JSON.parse(storage.get("tavri-activity-timer") || "null");
      const now = Date.now();
      if (saved?.version === 1 && Number.isSafeInteger(saved.startedAt) && saved.startedAt > 0 && saved.startedAt <= now + 60000 &&
          Number.isSafeInteger(saved.elapsedMs) && saved.elapsedMs >= 0 && saved.elapsedMs <= 365 * 86400000 &&
          (saved.runningSince === null || Number.isSafeInteger(saved.runningSince) && saved.runningSince >= saved.startedAt && saved.runningSince <= now + 60000)) timerState = saved;
    } catch { /* Ignore a damaged local timer record. */ }
    if (!timerState) storage.remove("tavri-activity-timer");
    renderTimer();
  }
  function selectedTemplate() { return activityTemplates.find(item => item.id === $("templateSelect").value) || activityTemplates[0]; }
  function templateValues() { return [...$("templateFields").querySelectorAll("input")].map(input => input.value); }
  function saveTemplateDraft() {
    storage.set("tavri-template-draft", JSON.stringify({ id: selectedTemplate().id, values: templateValues(), open: $("templateGuide").open }));
  }
  function updateTemplatePreview() {
    const values = templateValues();
    const description = values[0]?.trim() ? buildTemplateDescription(selectedTemplate(), values) : "";
    $("templatePreview").textContent = description || "Answer the first question to see a preview.";
    $("templateApplyButton").disabled = !description || Boolean(editing);
    saveTemplateDraft();
  }
  function renderTemplateFields(values = []) {
    const template = selectedTemplate();
    $("templatePurpose").textContent = template.purpose;
    $("templateFields").replaceChildren(...template.fields.map((field, index) => {
      const label = el("label", "field", `${field.label}${index ? " · optional" : ""}`);
      const input = el("input");
      input.type = "text";
      input.maxLength = 240;
      input.placeholder = `e.g. ${field.example}`;
      input.value = typeof values[index] === "string" ? values[index] : "";
      input.addEventListener("input", updateTemplatePreview);
      input.addEventListener("keydown", event => { if (event.key === "Enter") event.preventDefault(); });
      label.append(input);
      return label;
    }));
    updateTemplatePreview();
  }
  function setupTemplates() {
    const groups = new Map();
    for (const template of activityTemplates) {
      if (!groups.has(template.category)) {
        const group = el("optgroup"); group.label = template.category;
        groups.set(template.category, group);
        $("templateSelect").append(group);
      }
      const option = el("option", "", template.label); option.value = template.id;
      groups.get(template.category).append(option);
    }
    let saved = null;
    try { saved = JSON.parse(storage.get("tavri-template-draft") || "null"); } catch { /* Ignore invalid local preference. */ }
    if (saved && activityTemplates.some(item => item.id === saved.id)) $("templateSelect").value = saved.id;
    $("templateGuide").open = Boolean(saved?.open);
    renderTemplateFields(Array.isArray(saved?.values) ? saved.values : []);
    $("templateSelect").addEventListener("change", () => renderTemplateFields());
    $("templateGuide").addEventListener("toggle", saveTemplateDraft);
    $("templateApplyButton").addEventListener("click", async () => {
      if (editing) return;
      const values = templateValues();
      if (!values[0]?.trim()) { $("templateFields").querySelector("input")?.focus(); return; }
      const description = buildTemplateDescription(selectedTemplate(), values);
      if ($("entryInput").value.trim() && $("entryInput").value !== description &&
          !(await confirm("Replace your activity description?", "Your current description will be replaced. Date, time, duration, project and reference will stay as they are.", "Use template"))) return;
      $("entryInput").value = description;
      persistDraft();
      $("templateGuide").open = false;
      $("entryInput").focus();
      setStatus("Template description added. Review it, then save the activity.");
    });
  }
  function endEditing(restore = true) {
    editing = null;
    $("composerTitle").textContent = "Log an activity";
    $("entrySubmitButton").textContent = "+ Add activity";
    $("composerFooter").hidden = true;
    $("templateGuide").hidden = false;
    fillDraft(restore && newDraft ? newDraft : {});
    if (!$("entryDateInput").value) defaultDateTime();
    newDraft = null;
    persistDraft(); syncModes(); renderTimer();
  }
  async function editEntry(entry, context) {
    if (busy) return;
    if (editing && !(await confirm("Replace this edit?", "Your current changes have not been saved.", "Edit selected activity"))) return;
    if (!editing) newDraft = readDraft();
    editing = { entry, ...context };
    const meta = parseEntryMessage(entry.message);
    fillDraft({ entryInput: meta.message, entryDateInput: entry.date, entryTimeInput: entry.time, timeSpentInput: meta.timeSpent, projectInput: meta.project, referenceInput: meta.reference, taskSelect: meta.taskId });
    $("composerTitle").textContent = "Edit activity";
    $("entrySubmitButton").textContent = "Save changes";
    $("composerFooter").hidden = false;
    $("templateGuide").hidden = true;
    $("entryDetails").open = true;
    syncModes(); renderTimer();
    $("entryInput").focus();
    $("composer").scrollIntoView({ block: "nearest" });
    persistDraft();
  }
  function renderEntries(container, entries, context) {
    container.replaceChildren();
    if (!entries.length) {
      const empty = el("div", "empty-state");
      const filtered = Object.values(filters).some(Boolean);
      empty.append(el("strong", "", filtered ? "No matching activities" : "Make room for a little progress"), el("p", "", filtered ? "Try a different search or clear your filters." : "Log your first activity above. A short description is enough."));
      empty.append(button(filtered ? "Clear filters" : "Log an activity", () => { if (filtered) clearWeekFilter(); else void setActivityMode("list").then(() => $("entryInput").focus()); }, "ghost-button"));
      container.append(empty);
      return;
    }
    let date = "";
    const sorted = entries.map((entry, index) => ({ entry, index })).sort((a,b) => b.entry.date.localeCompare(a.entry.date) || (b.entry.time || "").localeCompare(a.entry.time || "") || b.index - a.index);
    for (const { entry } of sorted) {
      const rowContext = entry.sourceWeek ? { ref: entry.sourceWeek, revision: entry.sourceRevision } : context;
      if (entry.date !== date) {
        date = entry.date;
        const day = entries.filter(item => item.date === date);
        const total = day.reduce((sum, item) => sum + (parseSpentToMinutes(parseEntryMessage(item.message).timeSpent) || 0), 0);
        const heading = el("div", "day-heading");
        heading.append(el("strong", "", date === state.today.date ? "Today" : dateLabel(date, { weekday: "long", day: "numeric", month: "short" })), el("span", "", `${day.length} ${day.length === 1 ? "activity" : "activities"}${total ? " · " + formatSpentMinutes(total) : ""}`));
        container.append(heading);
      }
      const meta = parseEntryMessage(entry.message);
      const article = el("article", "entry");
      article.dataset.entryId = entry.id;
      const content = el("div", "entry-content");
      content.append(el("p", "entry-message", meta.message));
      const details = el("div", "entry-meta");
      if (meta.timeSpent) details.append(el("span", "chip chip--duration", `◷ ${meta.timeSpent}`));
      if (meta.project) details.append(el("span", "chip chip--project", meta.project));
      if (meta.reference) details.append(el("span", "chip", meta.reference));
      if (!entry.valid) details.append(el("span", "chip", "Unrecognised format · edit in Settings"));
      if (details.childNodes.length) content.append(details);
      const actions = el("div", "entry-actions");
      const edit = button("Edit", () => editEntry(entry, rowContext));
      edit.dataset.action = "edit";
      edit.setAttribute("aria-label", `Edit ${meta.message}`);
      const clone = button("Duplicate", () => perform(async () => {
        renderState(await api.cloneEntry(rowContext.ref, { id: entry.id, line: entry.line }, rowContext.revision));
        setStatus("Activity duplicated.");
      }));
      clone.dataset.action = "clone";
      clone.setAttribute("aria-label", `Duplicate ${meta.message}`);
      const remove = button("Delete", async () => {
        if (!(await confirm("Delete this activity?", `“${meta.message}” will be removed. You can undo it immediately afterwards.`, "Delete activity"))) return;
        const removed = await perform(async () => {
          const result = await api.deleteEntry(rowContext.ref, { id: entry.id, line: entry.line }, rowContext.revision);
          undoToken = result.undoToken;
          renderState(result);
          $("undoButton").hidden = false;
          setStatus("Activity deleted. Undo is available until the week changes again.");
        });
        if (removed) $("undoButton").focus();
      });
      remove.dataset.action = "delete";
      remove.setAttribute("aria-label", `Delete ${meta.message}`);
      if (entry.valid) actions.append(edit, clone);
      actions.append(remove);
      article.append(el("time", "entry-time", entry.time || "—"), content, actions);
      container.append(article);
    }
  }
  function renderDiagram(entries) {
    const data = buildDiagramData(entries);
    const panel = $("diagramPanel");
    panel.replaceChildren();
    const timed = entries.some(entry => parseSpentToMinutes(parseEntryMessage(entry.message).timeSpent) > 0);
    const unit = timed ? "Recorded time" : "Activity count";
    $("diagramSummary").textContent = unit;
    for (const [title, rows, label] of [["By day", data.byDay, row => dateLabel(row.date, { weekday: "short", day: "numeric", month: "short" })], ["By project", data.byProject, row => row.name]]) {
      const card = el("section", "chart-card");
      card.append(el("h4", "", title));
      const max = Math.max(1, ...rows.map(row => timed ? row.spentMinutes : row.count));
      for (const row of rows) {
        const item = el("div", "chart-row");
        const labels = el("div", "chart-label");
        labels.append(el("span", "", label(row)), el("span", "", timed ? formatSpentMinutes(row.spentMinutes) : `${row.count} activities`));
        const track = el("div", "chart-track");
        const fill = el("div", "chart-fill");
        fill.style.width = `${(timed ? row.spentMinutes : row.count) / max * 100}%`;
        track.append(fill); item.append(labels, track); card.append(item);
      }
      card.append(el("p", "", rows.length ? (timed ? "Totals include activities with a valid duration." : "Add durations to see a breakdown of recorded time.") : "No data in this selection yet."));
      panel.append(card);
    }
  }
  function timerDraft() { return editing ? newDraft || {} : readDraft(); }
  function taskTimeStateKey() {
    if (!timerState) return "none";
    const draft = timerDraft();
    return JSON.stringify([timerState.runningSince === null, Math.floor(timerElapsedMs() / 5000), draft.entryInput, draft.entryDateInput, draft.entryTimeInput, draft.projectInput, draft.referenceInput]);
  }
  function renderTaskTime() {
    if (!state) return;
    const entries = filterEntries(selectedRange?.entries || state.week.entries, filters);
    const draft = timerDraft(), weekStart = selectedRange?.start || state.week.weekStart, weekEnd = selectedRange?.end || shiftedDate(weekStart, 6);
    const timerMatchesWeek = Boolean(timerState && draft.entryDateInput >= weekStart && draft.entryDateInput <= weekEnd);
    const timerEntry = { date: draft.entryDateInput, time: draft.entryTimeInput, message: buildEntryMessage(draft.entryInput || "Current activity", "", draft.projectInput, draft.referenceInput, draft.taskSelect) };
    const timerIncluded = timerMatchesWeek && filterEntries([timerEntry], filters).length > 0;
    const timer = timerIncluded ? { message: draft.entryInput || "Current activity", project: draft.projectInput, reference: draft.referenceInput, taskId: draft.taskSelect, minutes: timerElapsedMs() / 60000 } : null;
    const data = buildTaskTimeData(entries, timer);
    const total = data.loggedMinutes + data.liveMinutes;
    const overview = el("div", "task-time-overview");
    const totals = el("div", "task-time-totals");
    for (const [label, value, kind] of [["Logged", data.loggedMinutes, "logged"], [timerState?.runningSince === null ? "Paused timer" : "Current timer", data.liveMinutes, "live"]]) {
      const item = el("div", "task-time-total");
      item.append(el("span", `task-time-swatch task-time-swatch--${kind}`), el("span", "", label), el("strong", "", kind === "live" && timerIncluded ? timerClock(timerElapsedMs()) : formatSpentMinutes(value)));
      totals.append(item);
    }
    const overallBar = el("div", "task-time-bar task-time-overall-bar");
    overallBar.setAttribute("role", "img");
    overallBar.setAttribute("aria-label", `${formatSpentMinutes(data.loggedMinutes)} logged, ${timerIncluded ? timerClock(timerElapsedMs()) : "0m"} in the current timer`);
    const loggedFill = el("span", "task-time-bar--logged"), liveFill = el("span", "task-time-bar--live");
    loggedFill.hidden = !data.loggedMinutes; liveFill.hidden = !data.liveMinutes;
    loggedFill.style.width = `${total ? data.loggedMinutes / total * 100 : 0}%`;
    liveFill.style.width = `${total ? data.liveMinutes / total * 100 : 0}%`;
    overallBar.append(loggedFill, liveFill); overview.append(totals, overallBar);
    overview.append(el("p", "field-help", `${data.timedEntries} of ${data.totalEntries} logged activities have a duration. The current timer is not in reports until saved.`));
    $("taskTimeOverview").replaceChildren(overview);
    const rows = [], max = Math.max(1, ...data.rows.map(row => row.loggedMinutes + row.liveMinutes));
    for (const task of data.rows) {
      const row = el("article", "task-time-row");
      const heading = el("div", "task-time-row-heading");
      const displayTitle = focusState.tasks.find(item => item.id === task.taskId)?.title || task.title;
      const title = el("strong", "", displayTitle);
      const detail = [task.project, task.reference, task.activities ? `${task.activities} ${task.activities === 1 ? "entry" : "entries"}` : "Current session"].filter(Boolean).join(" · ");
      const amount = task.loggedMinutes || task.hasTimer ? `${formatSpentMinutes(task.loggedMinutes)} logged${task.hasTimer ? ` · ${timerClock(timerElapsedMs())} timer` : ""}` : "No duration recorded";
      heading.append(title, el("span", "", amount));
      const bar = el("div", "task-time-bar");
      bar.setAttribute("role", "img");
      bar.setAttribute("aria-label", `${displayTitle}: ${amount}`);
      const saved = el("span", "task-time-bar--logged"), current = el("span", "task-time-bar--live");
      saved.hidden = !task.loggedMinutes; current.hidden = !task.liveMinutes;
      saved.style.width = `${task.loggedMinutes / max * 100}%`;
      current.style.width = `${task.liveMinutes / max * 100}%`;
      bar.append(saved, current);
      row.append(heading, el("p", "task-time-row-detail", detail), bar);
      rows.push(row);
    }
    const rowScroll = $("taskTimeRows").scrollTop;
    $("taskTimeRows").replaceChildren(...rows);
    $("taskTimeRows").scrollTop = rowScroll;
    $("taskTimeHint").textContent = !data.rows.length ? "No tasks in this selection yet. Add a duration or start a timer to see time here." : timerState && !timerMatchesWeek ? "Your current timer is for another period. Select its dates to include it in these bars." : timerState && !timerIncluded ? "The current timer is outside the active filters. Clear filters to include it." : !total ? "These tasks have no recorded duration yet. Start a timer or add a duration to see their bars." : "Task bars are relative to the longest task in this selection; striped time is still being measured.";
    taskTimeKey = taskTimeStateKey();
  }
  function weeklyReviewData() {
    if (!state) return { days: [], entries: [], minutes: 0, projects: [] };
    const start = state.week.weekStart;
    const days = Array.from({ length: 7 }, (_, offset) => shiftedDate(start, offset));
    const entries = state.week.entries.filter(entry => days.includes(entry.date));
    const minutes = entries.reduce((sum, entry) => sum + (parseSpentToMinutes(parseEntryMessage(entry.message).timeSpent) || 0), 0);
    const projects = [...new Set(entries.map(entry => parseEntryMessage(entry.message).project).filter(Boolean))];
    return { days, entries, minutes, projects };
  }
  function renderWeeklyReview() {
    if (!state) return;
    $("weeklyReviewDays").parentElement.hidden = Boolean(selectedRange);
    if (selectedRange) return;
    const { days, entries, minutes, projects } = weeklyReviewData();
    $("weeklyReviewSummary").textContent = `${dateLabel(days[0], { day: "numeric", month: "short" })} – ${dateLabel(days[6], { day: "numeric", month: "short", year: "numeric" })} · ${entries.length} activities · ${formatSpentMinutes(minutes)} recorded · ${projects.length} projects`;
    $("weeklyReviewDays").replaceChildren(...days.map(date => {
      const dayEntries = entries.filter(entry => entry.date === date);
      const card = el("div", "review-day");
      const heading = el("strong", "", dateLabel(date, { weekday: "short", day: "numeric", month: "short" }));
      const count = el("span", "", dayEntries.length ? `${dayEntries.length} ${dayEntries.length === 1 ? "activity" : "activities"}` : "No entries recorded");
      const open = button("Open day", () => {
        filters = { query: "", project: "", start: date, end: date }; syncFilterInputs();
        showView("week"); void setActivityMode("list");
      });
      open.setAttribute("aria-label", `Open activities for ${date}`);
      card.append(heading, count, open);
      return card;
    }));
  }
  async function copyWeeklyReview() {
    if (!state) return;
    const { days, entries, minutes, projects } = weeklyReviewData();
    const lines = [`Week ${days[0]} to ${days[6]}`, `${entries.length} activities · ${formatSpentMinutes(minutes)} recorded · ${projects.length} projects`];
    for (const date of days) {
      const day = entries.filter(entry => entry.date === date);
      lines.push(`${date}: ${day.length ? `${day.length} ${day.length === 1 ? "activity" : "activities"}` : "no entries recorded"}`);
      for (const entry of day.slice(0, 3)) lines.push(`  • ${parseEntryMessage(entry.message).message}`);
      if (day.length > 3) lines.push(`  • …and ${day.length - 3} more`);
    }
    await perform(async () => { await api.copyText(lines.join("\n") + "\n"); setStatus("Week summary copied to clipboard."); });
  }
  async function searchArchive(event) {
    event?.preventDefault();
    const options = { query: $("archiveQuery").value, project: $("archiveProject").value, start: $("archiveStart").value, end: $("archiveEnd").value };
    await perform(async () => {
      $("archiveStatus").textContent = "Searching local weekly files…";
      const result = await api.searchArchive(options);
      const container = $("archiveResults"); container.replaceChildren();
      $("archiveStatus").textContent = result.total ? `Showing ${result.entries.length} of ${result.total} matching activities${result.total > result.limit ? " · narrow the search for more" : ""}.` : "No activities match these filters.";
      const groups = new Map();
      for (const entry of result.entries) {
        if (!groups.has(entry.sourceWeek)) groups.set(entry.sourceWeek, []);
        groups.get(entry.sourceWeek).push(entry);
      }
      for (const [ref, entries] of groups) {
        const section = el("section", "archive-result-week");
        const heading = el("div", "section-heading");
        heading.append(el("h4", "", `Week of ${dateLabel(ref, { day: "numeric", month: "short", year: "numeric" })}`));
        const open = button("Open week", async () => { if (await loadState(ref)) showView("week"); });
        heading.append(open);
        const rows = el("div", "entries");
        renderEntries(rows, entries, { ref, revision: entries[0].sourceRevision });
        section.append(heading, rows); container.append(section);
      }
    });
  }
  function renderChangeEvents() {
    const query = $("changeQuery").value.trim().toLocaleLowerCase();
    const matches = changeHistory.filter(event => `${event.kind} ${event.before || ""} ${event.after || ""} ${event.week || ""}`.toLocaleLowerCase().includes(query));
    $("changesStatus").textContent = matches.length ? `${matches.length} of ${changeHistory.length} recent changes${changeHistory.length === 100 ? " · showing the latest 100" : ""}.` : "No recorded changes match this search.";
    $("changeEvents").replaceChildren(...matches.map(event => {
      const card = el("article", "change-event");
      const heading = el("div", "change-event-heading");
      heading.append(el("strong", "", event.kind.replace(/-/g, " ")), el("time", "", new Date(event.at).toLocaleString()));
      if (event.week) {
        const open = button(`Week ${event.week}`, async () => { if (await loadState(event.week)) showView("week"); });
        heading.append(open);
      }
      card.append(heading);
      if (event.before) card.append(el("p", "change-before", `Before: ${event.before}`));
      if (event.after) card.append(el("p", "change-after", `After: ${event.after}`));
      if (event.kind === "backup-restored") card.append(el("p", "", `${event.weeks} weekly files restored.`));
      return card;
    }));
  }
  async function loadChangeEvents() {
    await perform(async () => { changeHistory = await api.getRecentChanges(); renderChangeEvents(); });
  }
  function renderTaskOptions() {
    const selected = $("taskSelect").value;
    const options = [Object.assign(el("option", "", "No task"), { value: "" })];
    for (const task of focusState.tasks.filter(item => item.status === "open" || item.id === selected).sort((a, b) => b.plannedFor.localeCompare(a.plannedFor))) {
      const option = el("option", "", `${task.title}${task.status === "done" ? " · done" : ""}`);
      option.value = task.id; options.push(option);
    }
    if (selected && !options.some(item => item.value === selected)) { const option = el("option", "", "Linked task from older data"); option.value = selected; options.push(option); }
    $("taskSelect").replaceChildren(...options);
    $("taskSelect").value = selected;
  }
  function useFocusTask(task) {
    if (editing) { setStatus("Finish editing the current activity before choosing a focus task.", "error"); return; }
    if (timerState && $("taskSelect").value !== task.id) { setStatus("Use or discard the current timer before switching tasks.", "error"); return; }
    $("taskSelect").value = task.id;
    if (!$("entryInput").value.trim()) $("entryInput").value = task.title;
    if (!$("projectInput").value.trim()) $("projectInput").value = task.project;
    if (!$("referenceInput").value.trim()) $("referenceInput").value = task.reference;
    if (!timerState) startTimer();
    else if (timerState.runningSince === null) resumeTimer();
    persistDraft(); renderFocus();
    $("entryInput").focus();
    $("composer").scrollIntoView({ block: "nearest" });
  }
  async function updateFocusTask(task, patch) {
    if (!api.updateFocusTask) return;
    await perform(async () => {
      focusState = await api.updateFocusTask(task.id, patch, focusState.revision);
      renderFocus(); renderTaskOptions(); updateWidgetState();
      setStatus("Focus plan updated.");
    });
  }
  function renderFocus() {
    if (!state) return;
    renderTaskOptions();
    const today = state.today.date;
    const todayTasks = focusState.tasks.filter(task => task.plannedFor === today);
    const open = todayTasks.filter(task => task.status === "open");
    const done = todayTasks.filter(task => task.status === "done");
    $("focusSummary").textContent = `${done.length} ${t("done")} · ${open.length} ${t("open")}`;
    $("focusForm").querySelector("button").disabled = busy || open.length >= 3;
    $("focusStatus").textContent = t(open.length >= 3 ? "Three open outcomes are enough for today. Finish one or move it before adding another." :
      !todayTasks.length ? "Start with one result you want to achieve today." : "At the end of the day, save your activity and choose the next step for unfinished work.");
    const todayEntries = state.today.entries;
    $("focusTasks").replaceChildren(...todayTasks.map(task => {
      const card = el("article", `focus-task${task.status === "done" ? " is-done" : ""}`);
      card.dataset.taskId = task.id;
      const heading = el("div", "focus-task-heading");
      heading.append(el("strong", "", task.title), el("span", "", task.status === "done" ? "Done" : "Open"));
      const metadata = [task.project, task.reference].filter(Boolean).join(" · ");
      if (metadata) card.append(heading, el("p", "focus-task-meta", metadata)); else card.append(heading);
      const related = todayEntries.filter(entry => parseEntryMessage(entry.message).taskId === task.id);
      const logged = related.reduce((sum, entry) => sum + (parseSpentToMinutes(parseEntryMessage(entry.message).timeSpent) || 0), 0);
      card.append(el("p", "focus-task-time", `${related.length} ${t(related.length === 1 ? "session" : "sessions")} · ${formatSpentMinutes(logged)} ${t("logged")}${timerState && $("taskSelect").value === task.id ? ` · ${timerClock(timerElapsedMs())} ${t("current timer")}` : ""}`));
      const next = el("div", "focus-next-step");
      const nextInput = el("input"); nextInput.type = "text"; nextInput.maxLength = 500; nextInput.placeholder = "Next step or blocker"; nextInput.value = task.nextStep;
      nextInput.setAttribute("aria-label", `Next step for ${task.title}`);
      next.append(nextInput, button("Save step", () => updateFocusTask(task, { nextStep: nextInput.value }), "text-button"));
      card.append(next);
      const actions = el("div", "focus-task-actions");
      if (task.status === "open") actions.append(button(timerState && $("taskSelect").value === task.id && timerState.runningSince !== null ? "Continue session" : "Start session", () => useFocusTask(task), "primary-button"));
      actions.append(button("Edit outcome", () => {
        if (card.querySelector(".focus-task-editor")) { card.querySelector(".focus-task-editor input")?.focus(); return; }
        const editor = el("div", "focus-task-editor");
        const inputs = {};
        for (const [key, label, max] of [["title", "Outcome", 200], ["project", "Project", 120], ["reference", "Reference", 240]]) {
          const field = el("label", "field", label), input = el("input"); input.value = task[key]; input.maxLength = max; inputs[key] = input; field.append(input); editor.append(field);
        }
        const buttons = el("div", "focus-task-actions");
        buttons.append(button("Save outcome", () => updateFocusTask(task, { title: inputs.title.value, project: inputs.project.value, reference: inputs.reference.value }), "primary-button"), button("Cancel", () => editor.remove(), "ghost-button"));
        editor.append(buttons); card.append(editor); inputs.title.focus();
      }, "text-button"));
      actions.append(button(task.status === "done" ? "Reopen" : "Mark done", () => updateFocusTask(task, { status: task.status === "done" ? "open" : "done" }), "ghost-button"));
      if (task.status === "open") actions.append(button("Move to tomorrow", () => updateFocusTask(task, { plannedFor: shiftedDate(today, 1) }), "text-button"));
      card.append(actions);
      return card;
    }));
    const carryovers = focusState.tasks.filter(task => task.status === "open" && task.plannedFor < today);
    $("focusCarryovers").replaceChildren();
    if (carryovers.length) {
      $("focusCarryovers").append(el("h4", "", "Unfinished from earlier days"));
      for (const task of carryovers) {
        const row = el("div", "focus-carryover");
        row.append(el("span", "", `${task.title} · ${task.plannedFor}`), button("Bring to today", () => updateFocusTask(task, { plannedFor: today }), "text-button"));
        $("focusCarryovers").append(row);
      }
    }
  }
  async function loadFocus() {
    if (!api.getFocus) return;
    try { focusState = await api.getFocus(); renderFocus(); updateWidgetState(); }
    catch (error) { $("focusStatus").textContent = error.message || "Could not load the focus plan."; }
  }
  async function createFocusTask(event) {
    event.preventDefault();
    if (!state || !api.createFocusTask) return;
    await perform(async () => {
      focusState = await api.createFocusTask({ title: $("focusTitleInput").value, project: $("focusProjectInput").value, reference: $("focusReferenceInput").value, plannedFor: state.today.date }, focusState.revision);
      $("focusTitleInput").value = ""; $("focusProjectInput").value = ""; $("focusReferenceInput").value = "";
      renderFocus(); setStatus("Outcome added to today's plan.");
    });
  }
  function renderVisible() {
    if (!state) return;
    const entries = visibleEntries();
    const total = entries.reduce((sum, entry) => sum + (parseSpentToMinutes(parseEntryMessage(entry.message).timeSpent) || 0), 0);
    const timed = entries.filter(entry => parseSpentToMinutes(parseEntryMessage(entry.message).timeSpent) > 0).length;
    $("totalTime").textContent = formatSpentMinutes(total);
    $("timeCoverage").textContent = `${timed} ${t("of")} ${entries.length} ${t("activities have a duration")}`;
    $("totalActivities").textContent = String(entries.length);
    $("totalProjects").textContent = String(new Set(entries.map(entry => parseEntryMessage(entry.message).project).filter(Boolean)).size);
    const activeDayCount = new Set(entries.map(entry => entry.date)).size;
    $("activeDays").textContent = `${activeDayCount} ${t(activeDayCount === 1 ? "active day" : "active days")}`;
    $("activityScope").textContent = calendarActive() ? `${t("Selected day")} · ${selectedDate || t("loading")}` : view === "today" ? t("Today, with current filters") : selectedRange ? `${selectedRange.start} – ${selectedRange.end}, ${t("with current filters")}` : t("Selected week, with current filters");
    const filtering = Object.values(filters).some(Boolean);
    $("clearWeekFilterButton").hidden = !filtering;
    const available = calendarActive() ? (calendarReady() ? calendarState.entries.filter(entry => entry.date === selectedDate).length : 0) : view === "today" ? state.today.entries.length : selectedRange ? selectedRange.entries.length : state.week.entries.length;
    $("filterSummary").textContent = `${entries.length} ${t("of")} ${available} ${t("activities")}${filters.start || filters.end ? ` · ${filters.start || t("Start")} → ${filters.end || t("End")}` : ""}${filtering ? ` · ${t("Filters applied to totals and export")}` : ""}`;
    renderEntries($("weekEntries"), filterEntries(selectedRange?.entries || state.week.entries, filters), sourceContext(false));
    renderEntries($("todayEntries"), filterEntries(state.today.entries, filters), sourceContext(true));
    renderDiagram(entries);
    if (view === "diagram") renderTaskTime();
    renderWeeklyReview();
    renderFocus();
    renderModes();
    updateExportScopeSummary();
  }
  function renderProjectOptions() {
    if (!state) return;
    const projects = [...new Set((calendarActive() && calendarReady() ? calendarState.entries : [...(selectedRange?.entries || state.week.entries), ...state.today.entries]).map(entry => parseEntryMessage(entry.message).project).filter(Boolean))].sort();
    const options = projects.map(project => { const option = el("option", "", project); option.value = project; return option; });
    $("projectSuggestions").replaceChildren(...options.map(node => node.cloneNode(true)));
    if (filters.project && !projects.includes(filters.project)) { const option = el("option", "", filters.project); option.value = filters.project; options.push(option); }
    const all = el("option", "", "All projects"); all.value = "";
    $("projectFilter").replaceChildren(all, ...options);
    $("projectFilter").value = filters.project;
  }
  function renderState(next) {
    state = next; calendarDirty = true;
    $("logDir").textContent = state.config.logDir;
    $("weekCount").textContent = state.week.entries.length;
    $("todayCount").textContent = state.today.entries.length;
    syncPeriodLabel();
    $("weekFile").textContent = `${state.week.weekStart}.log`;
    $("weekFile").title = state.week.filePath;
    $("todayDate").textContent = dateLabel(state.today.date, { weekday: "long", day: "numeric", month: "long" });
    const weeks = [...new Set([...state.availableWeeks, state.week.weekStart, state.today.weekStart])].sort().reverse();
    $("weekRefInput").replaceChildren(...weeks.map(ref => { const option = el("option", "", weekLabel(ref)); option.value = ref; return option; }));
    $("weekRefInput").value = state.week.weekStart;
    renderProjectOptions();
    if (!editor.dirty) {
      editor = { ref: state.week.weekStart, revision: state.week.revision, dirty: false };
      $("weekEditor").value = state.week.text;
      $("editorDirty").textContent = "Saved";
    }
    $("editorWeekLabel").textContent = `Week of ${editor.ref}`;
    if (!editing && !$("entryDateInput").value) defaultDateTime();
    renderVisible();
  }
  function syncPeriodLabel() {
    if (state) $("weekLabel").textContent = selectedRange ? `${selectedRange.start} – ${selectedRange.end}` : t("Week of") + " " + dateLabel(state.week.weekStart);
  }
  function showView(next) {
    if (!viewTitles[next] || (next === "team" && workspaceMode !== "team")) return;
    if (next !== "week" && doc.fullscreenElement === $("timelinePanel")) void doc.exitFullscreen().catch(() => {});
    view = next;
    if (next === "reports" && selectedRange) {
      const key = `${selectedRange.start}/${selectedRange.end}`;
      if (reportRangeKey !== key) { teamReports.setPeriod(selectedRange.start, selectedRange.end); reportRangeKey = key; }
    }
    doc.querySelectorAll(".tab").forEach(tab => { tab.classList.toggle("is-active", tab.dataset.view === view); if (tab.dataset.view === view) tab.setAttribute("aria-current", "page"); else tab.removeAttribute("aria-current"); });
    doc.querySelectorAll(".view").forEach(section => section.classList.toggle("is-active", section.id === `${view}View`));
    $("viewTitle").textContent = viewTitles[view];
    $("viewSubtitle").textContent = { week: "A clear record of what moved forward.", today: "Capture progress while it is fresh.", archive: "Find work across every local week.", changes: "See when entries were added, edited and moved.", diagram: "Understand and review your week.", reports: "Turn activities into a clear, configurable overview.", team: "See your team's shared weekly records in one place.", edit: "A workspace that fits the way you work." }[view];
    $("composer").hidden = !["week", "today"].includes(view);
    $("focusSection").hidden = view !== "today";
    $("metrics").hidden = ["edit", "reports", "team", "archive", "changes"].includes(view);
    $("periodToolbar").hidden = ["today", "reports", "team", "archive", "changes"].includes(view);
    $("filterToolbar").hidden = ["edit", "reports", "team", "archive", "changes"].includes(view);
    $("filterSummary").hidden = ["edit", "reports", "team", "archive", "changes"].includes(view);
    $("exportMenu").hidden = ["edit", "reports", "team", "archive", "changes"].includes(view);
    renderProjectOptions(); renderVisible();
    if (state) teamReports.show(view);
    if (view === "changes" && state) void loadChangeEvents();
    if (calendarActive() && calendarDirty && !busy && state) void perform(async () => {});
  }
  async function loadState(ref = state?.week.weekStart || "") {
    if (busy) return false;
    if (editor.dirty && ref && ref !== editor.ref) {
      setStatus("Save or discard the weekly file draft in Settings before changing weeks.", "error");
      $("weekRefInput").value = state.week.weekStart;
      return false;
    }
    return perform(async () => {
      setStatus("Loading activities…");
      if (state && ref && ref !== state.week.weekStart) { selectedRange = null; reportRangeKey = ""; filters.start = ""; filters.end = ""; syncFilterInputs(); }
      const next = await api.getState(ref);
      if (selectedRange) selectedRange = await api.getRange(selectedRange.start, selectedRange.end);
      renderState(next); setStatus(editor.dirty ? "Entries refreshed. Your weekly file draft was kept; discard it to load the latest file." : "");
    });
  }
  async function checkForExternalChanges() {
    if (busy || checkingExternal || !state || $("confirmDialog").open) return false;
    checkingExternal = true;
    const ref = state.week.weekStart;
    const year = calendarActive() ? calendarYear : null;
    const rangeKey = selectedRange ? `${selectedRange.start}/${selectedRange.end}` : "";
    try {
      const [latest, annual, range, focus] = await Promise.all([api.getState(ref), year === null ? null : api.getYear(year), selectedRange ? api.getRange(selectedRange.start, selectedRange.end) : null, api.getFocus?.() || null]);
      // A user action may have changed the selection while these reads were in flight.
      if (busy || ref !== state.week.weekStart || year !== (calendarActive() ? calendarYear : null) || rangeKey !== (selectedRange ? `${selectedRange.start}/${selectedRange.end}` : "")) return false;
      const changed = latest.week.revision !== state.week.revision || latest.today.revision !== state.today.revision || latest.today.date !== state.today.date || latest.config.logDir !== state.config.logDir || latest.availableWeeks.join("\0") !== state.availableWeeks.join("\0");
      const yearChanged = annual && (annual.revision !== calendarState?.revision || calendarDirty || Boolean(calendarError));
      const rangeChanged = range && range.revision !== selectedRange?.revision;
      const focusChanged = focus && focus.revision !== focusState.revision;
      if (!changed && !yearChanged && !rangeChanged && !focusChanged) return false;

      const focused = doc.activeElement;
      const focusedDate = focused?.classList?.contains("contribution-cell") ? focused.dataset.date : "";
      const focusedKey = focused?.dataset?.entryKey || "";
      const focusedEntry = focused?.closest?.(".entry")?.dataset.entryId;
      const focusedAction = focused?.dataset?.action;
      if (rangeChanged) { selectedRange = range; syncPeriodLabel(); }
      if (focusChanged) focusState = focus;
      if (changed) renderState(latest);
      if (annual) {
        calendarState = annual; calendarDirty = false; calendarError = "";
        renderProjectOptions(); renderVisible();
      }
      if ((rangeChanged || focusChanged) && !changed && !annual) { renderProjectOptions(); renderVisible(); }
      if (focused && !focused.isConnected) {
        let replacement = focusedDate ? [...doc.querySelectorAll(".contribution-cell")].find(node => node.dataset.date === focusedDate) : null;
        replacement ||= focusedKey ? [...doc.querySelectorAll("[data-entry-key]")].find(node => node.dataset.entryKey === focusedKey) : null;
        replacement ||= focusedEntry ? [...doc.querySelectorAll(".entry")].find(node => node.dataset.entryId === focusedEntry)?.querySelector(`[data-action="${focusedAction}"]`) : null;
        replacement?.focus({ preventScroll: true });
      }
      if (editor.dirty && latest.week.weekStart === editor.ref && latest.week.revision !== editor.revision) {
        setStatus("The weekly file changed outside Tavri. Your draft is safe; discard it to load the latest version.", "error");
      } else if (editing && [latest.week, latest.today].some(week => week.weekStart === editing.ref && week.revision !== editing.revision)) {
        setStatus("This activity changed outside Tavri. Your edit is safe; cancel and reopen it before saving.", "error");
      } else setStatus("Activities updated from your log folder.");
      return true;
    } catch (error) {
      setStatus(`Could not check for new activities. ${error.message || "Use Refresh to try again."}`, "error");
      return false;
    } finally { checkingExternal = false; }
  }
  async function addEntry(event) {
    event?.preventDefault();
    if (busy) return;
    const draft = readDraft();
    try {
      validateEntryFields(draft.entryInput, draft.timeSpentInput, draft.projectInput, draft.referenceInput);
      if (!isDateLiteral(draft.entryDateInput)) throw new Error("Choose a valid date.");
      if (timerState && !editing) draft.timeSpentInput = durationWithTimer(draft.timeSpentInput);
    } catch (error) { setStatus(error.message, "error"); $("entryDetails").open = true; return; }
    await perform(async () => {
      const message = buildEntryMessage(draft.entryInput, draft.timeSpentInput, draft.projectInput, draft.referenceInput, draft.taskSelect);
      const wasEditing = Boolean(editing);
      const result = editing
        ? await api.editEntry(editing.ref, { id: editing.entry.id, line: editing.entry.line }, draft.entryDateInput, draft.entryTimeInput, message, editing.revision)
        : await api.addEntry(message, draft.entryTimeInput, draft.entryDateInput);
      if (!wasEditing && timerState) { timerState = null; saveTimer(); renderTimer(); }
      filters = { query: "", project: "", start: "", end: "" }; selectedRange = null; reportRangeKey = ""; syncFilterInputs();
      if (calendarActive()) { selectedDate = draft.entryDateInput; calendarYear = Number(selectedDate.slice(0,4)); }
      renderState(result);
      endEditing(wasEditing);
      $("entryDetails").open = false;
      showView("week");
      setStatus(wasEditing ? "Activity updated." : "Activity added.");
    });
    $("entryInput").focus();
  }
  function syncFilterInputs() {
    $("searchInput").value = filters.query; $("projectFilter").value = filters.project;
    $("rangeStartInput").value = filters.start; $("rangeEndInput").value = filters.end;
  }
  function clearWeekFilter() { filters = { query: "", project: "", start: "", end: "" }; selectedRange = null; reportRangeKey = ""; syncPeriodLabel(); syncFilterInputs(); renderProjectOptions(); renderVisible(); }
  async function applyWeekFilter(event) {
    event?.preventDefault();
    const start = $("rangeStartInput").value, end = $("rangeEndInput").value;
    if ((start && !isDateLiteral(start)) || (end && !isDateLiteral(end)) || (start && end && start > end)) { setStatus("Choose a valid date range, with the start before the end.", "error"); return; }
    await perform(async () => {
      const range = start && end ? await api.getRange(start, end) : null;
      selectedRange = range;
      reportRangeKey = "";
      filters = { ...filters, start, end };
      syncPeriodLabel(); renderProjectOptions(); renderVisible(); setStatus(range ? `Showing ${range.entries.length} activities from ${start} to ${end} across all weeks.` : "");
      doc.querySelector(".range-menu").open = false;
    });
  }
  async function saveWeek() {
    if (!editor.dirty) { setStatus("No changes to save."); return; }
    if (!(await confirm("Save the complete weekly file?", `This replaces the file for the week of ${editor.ref}. The previous version will be saved in .backups.`, "Save weekly file"))) return;
    await perform(async () => {
      const result = await api.saveWeek(editor.ref, $("weekEditor").value, editor.revision);
      editor.dirty = false; storage.remove("tavri-week-draft"); renderState(result); setStatus("Weekly file saved. Previous version kept in .backups.");
    });
  }
  function exportRangeDates() {
    const start = $("exportRangeStart").value, end = $("exportRangeEnd").value;
    if (!isDateLiteral(start) || !isDateLiteral(end) || start < "1900-01-01" || end > "9998-12-31" || start > end) {
      throw new Error("Choose valid From and To dates (1900–9998), with From before To.");
    }
    return { start, end };
  }
  function updateExportScopeSummary() {
    if (!state) return;
    if ($("exportScope").value !== "range") {
      const count = visibleEntries().length;
      $("exportScopeSummary").textContent = `Current view · ${count} ${count === 1 ? "activity" : "activities"}`;
      return;
    }
    if (!rangePreview || rangePreview.start !== $("exportRangeStart").value || rangePreview.end !== $("exportRangeEnd").value) return;
    const count = filterEntries(rangePreview.entries, { query: filters.query, project: filters.project }).length;
    $("exportScopeSummary").textContent = `${count} ${count === 1 ? "activity" : "activities"} · search and project filters apply`;
  }
  async function previewExportRange() {
    const request = ++rangePreviewRequest;
    rangePreview = null;
    if ($("exportScope").value !== "range") { updateExportScopeSummary(); return; }
    let dates;
    try { dates = exportRangeDates(); }
    catch (error) { $("exportScopeSummary").textContent = error.message; return; }
    $("exportScopeSummary").textContent = "Checking activities in this range…";
    try {
      const result = await api.getRange(dates.start, dates.end);
      if (request !== rangePreviewRequest || $("exportScope").value !== "range") return;
      rangePreview = result; updateExportScopeSummary();
    } catch (error) {
      if (request === rangePreviewRequest) $("exportScopeSummary").textContent = error.message || "Could not read this range.";
    }
  }
  async function selectedExportOptions() {
    if ($("exportScope").value === "range") {
      const { start, end } = exportRangeDates();
      rangePreviewRequest += 1;
      const range = await api.getRange(start, end);
      rangePreview = range; updateExportScopeSummary();
      return { rangeStart: start, rangeEnd: end, rangeRevision: range.revision, filters: { query: filters.query, project: filters.project, start, end } };
    }
    if (calendarActive() && !calendarReady()) throw new Error("Refresh the calendar before exporting.");
    if (selectedRange && view !== "today" && !calendarActive()) return { rangeStart: selectedRange.start, rangeEnd: selectedRange.end, rangeRevision: selectedRange.revision, filters: { ...filters } };
    const context = sourceContext();
    const scopeDate = calendarActive() ? selectedDate : view === "today" ? state.today.date : "";
    return { ...context, ...(calendarActive() ? { year: calendarYear, yearRevision: calendarState.revision } : {}), filters: scopeDate ? { ...filters, start: filters.start > scopeDate ? filters.start : scopeDate, end: filters.end && filters.end < scopeDate ? filters.end : scopeDate } : { ...filters } };
  }
  async function exportWeek(format) {
    if (!state) return;
    await perform(async () => {
      const result = await api.exportWeek(format, await selectedExportOptions());
      if (!result?.canceled) setStatus(`Exported ${format.toUpperCase()} to ${result.filePath}.`);
      $("exportMenu").open = false;
    });
  }
  async function copyExportSelection() {
    if (!state) return;
    await perform(async () => {
      if ($("exportScope").value === "range") {
        const count = await api.copyRange(await selectedExportOptions());
        setStatus(`${count} ${count === 1 ? "activity" : "activities"} copied to clipboard.`);
      } else {
        if (calendarActive() && !calendarReady()) throw new Error("Refresh the calendar before copying.");
        const text = visibleEntries().map(entry => entry.line).join("\n");
        await api.copyText(text ? text + "\n" : "");
        setStatus("Visible activities copied to clipboard.");
      }
      $("exportMenu").open = false;
    });
  }
  function applyTheme(value) {
    doc.body.classList.add("is-switching-theme");
    theme = appearanceThemes.some(item => item.id === value) ? value : "system";
    doc.body.dataset.theme = theme === "system" ? (media.matches ? "dark" : "light") : theme;
    $("themeSelect").value = theme;
    doc.body.dataset.contrast = theme.startsWith("contrast-") ? "high" : "normal";
    $("themeDescription").textContent = appearanceThemes.find(item => item.id === theme).description;
    const symbol = createThemeSymbol(doc, theme);
    $("activeThemeSymbol").replaceChildren(...(symbol ? [symbol] : []));
    $("activeThemeSymbol").hidden = !symbol;
    doc.querySelectorAll("[data-theme-choice]").forEach(node => node.setAttribute("aria-pressed", String(node.dataset.themeChoice === theme)));
    doc.querySelectorAll("[data-accent-choice]").forEach(node => { node.disabled = !["system", "light", "dark"].includes(theme); });
    updateAccentPreviews();
    storage.set("tavri-theme", theme);
    // Resolve the whole palette before restoring hover transitions. Interpolating
    // only backgrounds can briefly put light-theme text on a dark-theme surface.
    doc.body.getBoundingClientRect();
    doc.body.classList.remove("is-switching-theme");
  }
  function updateAccentPreviews() {
    for (const item of appearanceThemes.filter(item => ["system", "light", "dark"].includes(item.id))) {
      const color = accent === "gold" ? (item.id === "light" || (item.id === "system" && !media.matches) ? "#765A00" : "#E0BE46") : accent === "white" ? "#FFFFFF" : item.colors[2];
      doc.querySelector(`[data-theme-choice="${item.id}"] .theme-preview`)?.style.setProperty("--preview-accent", color);
    }
  }
  function applyAccent(value) {
    doc.body.classList.add("is-switching-theme");
    accent = ["gold", "white"].includes(value) ? value : "red";
    doc.body.dataset.accent = accent;
    doc.querySelectorAll("[data-accent-choice]").forEach(node => node.setAttribute("aria-pressed", String(node.dataset.accentChoice === accent)));
    updateAccentPreviews();
    storage.set("tavri-accent", accent);
    doc.body.getBoundingClientRect();
    doc.body.classList.remove("is-switching-theme");
  }
  function filterThemeGallery() {
    const category = $("themeFamilyFilter").value;
    const query = $("themeSearch").value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const group of $("themeGallery").querySelectorAll(".theme-family")) {
      let groupCount = 0;
      for (const choice of group.querySelectorAll("[data-theme-choice]")) {
        const item = appearanceThemes.find(entry => entry.id === choice.dataset.themeChoice);
        const match = (category === "all" || category === group.dataset.family) && `${item.label} ${item.description}`.toLocaleLowerCase().includes(query);
        choice.hidden = !match;
        if (match) groupCount += 1;
      }
      group.hidden = groupCount === 0;
      visible += groupCount;
    }
    $("themeMatchCount").textContent = `${visible} of ${appearanceThemes.length} appearances`;
    $("themeNoResults").hidden = visible !== 0;
  }
  async function start() {
    setupTemplates();
    $("themeSelect").replaceChildren(); $("themeGallery").replaceChildren();
    const themeFamilies = [
      { id: "everyday", label: "Everyday", description: "Quiet surfaces for daily work.", ids: ["system", "light", "dark"] },
      { id: "contrast", label: "High contrast", description: "Clear boundaries, stronger focus and patterned activity levels.", ids: ["contrast-dark", "contrast-light", "contrast-amber"] },
      { id: "flight", label: "Flight decks", description: "Distinct command decks with familiar controls.", ids: ["star-trek", "star-wars", "rebel", "mandalorian"] },
      { id: "fantasy", label: "Fantasy worlds", description: "Parchment, dark stone and emerald ink.", ids: ["shire", "mordor", "hogwarts", "slytherin"] },
      { id: "worlds", label: "Other worlds", description: "Desert, winter, phosphor and neon.", ids: ["arrakis", "winterfell", "pipboy", "nightcity"] },
      { id: "films", label: "Films", description: "Noir, circuits, analog consoles and an elegant hotel ledger.", ids: ["blade-runner", "tron", "matrix", "alien", "grand-budapest"] },
      { id: "books", label: "Books", description: "Archives, chronicles, bestiaries and winter tales.", ids: ["foundation", "discworld", "witcher", "hunger-games", "narnia"] },
      { id: "series", label: "Series", description: "Office systems, case files, signals and field journals.", ids: ["severance", "stranger-things", "x-files", "doctor-who", "last-of-us"] },
      { id: "music", label: "Music", description: "Studio chrome, spectral light, glam and geometric rhythm.", ids: ["daft-punk", "pink-floyd", "bowie", "kraftwerk", "radiohead"] },
    ];
    for (const family of themeFamilies) {
      const filterOption = el("option", "", `${family.label} (${family.ids.length})`);
      filterOption.value = family.id; $("themeFamilyFilter").append(filterOption);
      const group = el("fieldset", "theme-family");
      group.dataset.family = family.id;
      group.append(el("legend", "", family.label), el("p", "theme-family-description", family.description));
      const choices = el("div", "theme-family-choices");
      for (const id of family.ids) {
        const item = appearanceThemes.find(theme => theme.id === id);
        const option = el("option", "", item.label); option.value = item.id; $("themeSelect").append(option);
        const choice = button("", () => applyTheme(item.id), "theme-choice");
        choice.dataset.themeChoice = item.id; choice.setAttribute("aria-label", item.label);
        const preview = el("span", "theme-preview"); preview.setAttribute("aria-hidden", "true");
        ["background", "panel", "accent"].forEach((key, index) => preview.style.setProperty(`--preview-${key}`, item.colors[index]));
        for (const part of ["header", "sidebar", "title", "metric", "row", "row-second"]) preview.append(el("i", `preview-${part}`));
        const symbol = createThemeSymbol(doc, item.id);
        if (symbol) { const badge = el("span", "theme-preview-symbol"); badge.append(symbol); preview.append(badge); }
        choice.append(preview, el("strong", "", item.label), el("span", "theme-choice-description", item.description));
        choices.append(choice);
      }
      group.append(choices); $("themeGallery").append(group);
    }
    $("themeFamilyFilter").addEventListener("change", filterThemeGallery);
    $("themeSearch").addEventListener("input", filterThemeGallery);
    filterThemeGallery();
    const storedMode = storage.get("tavri-activity-mode");
    activityMode = ["list", "timeline", "calendar"].includes(storedMode) ? storedMode : "list";
    const modeTabs = [...doc.querySelectorAll("[data-activity-mode]")];
    modeTabs.forEach((tab, index) => {
      tab.addEventListener("click", () => setActivityMode(tab.dataset.activityMode));
      tab.addEventListener("keydown", event => {
        if (busy) return;
        const next = event.key === "ArrowRight" ? (index + 1) % 3 : event.key === "ArrowLeft" ? (index + 2) % 3 : event.key === "Home" ? 0 : event.key === "End" ? 2 : null;
        if (next === null) return;
        event.preventDefault(); modeTabs[next].focus(); void setActivityMode(modeTabs[next].dataset.activityMode);
      });
    });
    for (const [id, delta] of [["previousYearButton", -1], ["nextYearButton", 1]]) $(id).addEventListener("click", () => {
      if (busy || calendarYear + delta < 1900 || calendarYear + delta > 9998) return;
      void perform(async () => { calendarYear += delta; calendarDirty = true; renderModes(); });
    });
    applyAccent(storage.get("tavri-accent") || "red");
    applyTheme(storage.get("tavri-theme") || storage.get("worktrace-theme") || "system");
    media.addEventListener("change", () => { if (theme === "system") applyTheme("system"); });
    const density = storage.get("tavri-density") === "compact" ? "compact" : "comfortable";
    doc.body.dataset.density = density; $("densitySelect").value = density;
    teamReports.start();
    setWorkspaceMode(storage.get("tavri-workspace-mode") || "personal");
    $("workspaceModeSelect").addEventListener("change", () => setWorkspaceMode($("workspaceModeSelect").value));
    doc.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => showView(tab.dataset.view)));
    doc.querySelectorAll(".export-button").forEach(node => node.addEventListener("click", () => exportWeek(node.dataset.format)));
    $("exportMenu").addEventListener("toggle", () => { if ($("exportMenu").open && $("exportScope").value === "range") void previewExportRange(); });
    $("exportScope").addEventListener("change", () => {
      const custom = $("exportScope").value === "range";
      $("exportRangeFields").hidden = !custom;
      if (custom && !$("exportRangeStart").value && state) $("exportRangeStart").value = state.week.weekStart;
      if (custom && !$("exportRangeEnd").value && state) $("exportRangeEnd").value = shiftedDate(state.week.weekStart, 6);
      void previewExportRange();
    });
    for (const id of ["exportRangeStart", "exportRangeEnd"]) $(id).addEventListener("change", () => { void previewExportRange(); });
    doc.querySelectorAll("[data-window-action]").forEach(node => node.addEventListener("click", async () => { try { await api[`${node.dataset.windowAction}Window`](); } catch (error) { setStatus(error.message, "error"); } }));
    $("modeAddButton").addEventListener("click", () => { void setActivityMode("list").then(() => $("entryInput").focus()); });
    $("timelineFullscreenButton").addEventListener("click", async () => {
      try {
        if (doc.fullscreenElement === $("timelinePanel")) await doc.exitFullscreen();
        else if (view === "week" && activityMode === "timeline") await $("timelinePanel").requestFullscreen();
      } catch (error) { setStatus(error.message || "Could not switch timeline full screen.", "error"); }
    });
    doc.addEventListener("fullscreenchange", () => {
      const active = doc.fullscreenElement === $("timelinePanel");
      $("timelineFullscreenButton").setAttribute("aria-pressed", String(active));
      $("timelineFullscreenButton").title = active ? "Exit timeline full screen (Esc)" : "Show timeline on full screen";
      $("timelineFullscreenLabel").textContent = active ? "Exit full screen" : "Full screen";
    });
    $("advancedSettings").addEventListener("toggle", syncModes);
    $("entryForm").addEventListener("submit", addEntry);
    $("focusForm").addEventListener("submit", createFocusTask);
    $("showWidgetButton").addEventListener("click", async () => {
      try { updateWidgetState(); await api.showWidget?.(); }
      catch (error) { setStatus(error.message || "Could not open the widget.", "error"); }
    });
    api.onWidgetCommand?.(command => {
      if (command === "pause") pauseTimer();
      else if (command === "resume") resumeTimer();
      else if (command === "finish") finishTimer();
    });
    $("timerStartButton").addEventListener("click", startTimer);
    $("timerPauseButton").addEventListener("click", pauseTimer);
    $("timerResumeButton").addEventListener("click", resumeTimer);
    $("timerFinishButton").addEventListener("click", finishTimer);
    $("timerDiscardButton").addEventListener("click", discardTimer);
    $("timerTopbarButton").addEventListener("click", async () => {
      if (busy) return;
      if (editing) {
        if (!await confirm("Return to your timer?", "The activity edit in progress will be discarded. Your new activity draft and timer will stay.", "Return to timer")) return;
        endEditing();
      }
      showView("week"); await setActivityMode("list"); $("entryInput").focus();
    });
    $("archiveSearchForm").addEventListener("submit", searchArchive);
    $("changeQuery").addEventListener("input", renderChangeEvents);
    $("copyWeeklyReviewButton").addEventListener("click", copyWeeklyReview);
    fields.forEach(id => $(id).addEventListener("input", persistDraft));
    $("cancelEditButton").addEventListener("click", () => { endEditing(); $("entryInput").focus(); setStatus("Editing cancelled. Your new activity draft has been restored."); });
    $("refreshButton").addEventListener("click", async () => { if (await loadState()) { await loadFocus(); teamReports.show(view); if (view === "archive") await searchArchive(); else if (view === "changes") await loadChangeEvents(); else setStatus(editor.dirty ? "Refreshed. Your unsaved weekly file draft was kept." : "Up to date."); } });
    $("weekRefInput").addEventListener("change", () => loadState($("weekRefInput").value));
    $("previousWeekButton").addEventListener("click", () => state && loadState(shiftedDate(state.week.weekStart, -7)));
    $("nextWeekButton").addEventListener("click", () => state && loadState(shiftedDate(state.week.weekStart, 7)));
    $("currentWeekButton").addEventListener("click", () => state && loadState(state.today.weekStart));
    $("searchInput").addEventListener("input", () => { filters.query = $("searchInput").value; renderVisible(); });
    $("projectFilter").addEventListener("change", () => { filters.project = $("projectFilter").value; renderVisible(); });
    $("weekFilterForm").addEventListener("submit", applyWeekFilter);
    $("clearWeekFilterButton").addEventListener("click", clearWeekFilter);
    $("openLogDirButton").addEventListener("click", () => perform(() => api.openLogDir()));
    $("createBackupButton").addEventListener("click", () => perform(async () => {
      const result = await api.createBackup();
      setStatus(result.canceled ? "Backup cancelled." : `Saved ${result.weeks} weekly files to ${result.filePath}.`);
    }));
    $("restoreBackupButton").addEventListener("click", async () => {
      let selected;
      if (!await perform(async () => { selected = await api.chooseBackup(); })) return;
      if (selected.canceled) { setStatus("Restore cancelled."); return; }
      const { weeks, activities, changed, added, focusTasks } = selected.preview;
      if (!await confirm("Restore personal backup?", `${weeks} weeks and ${activities} valid activities were found.${focusTasks === null ? " This older backup does not contain a focus plan." : ` ${focusTasks} focus tasks will be restored.`} ${added} weeks will be added; ${changed} existing weeks will be replaced. Weeks not in this backup stay as they are. Tavri saves the current versions in .tavri-recovery before restoring. Continue?`, "Restore backup")) return;
      await perform(async () => {
        const result = await api.restoreBackup(selected.token);
        renderState(result.state);
        await loadFocus();
        setStatus(`Restored ${result.weeks} weeks. Previous versions are in ${result.recoveryFile}.`);
      });
    });
    $("checkUpdatesButton").addEventListener("click", async () => {
      $("updateStatus").textContent = "Checking published Tavri releases…";
      const ok = await perform(async () => {
        const result = await api.checkForUpdates();
        $("openUpdatePageButton").hidden = !result.releaseUrl;
        $("updateStatus").textContent = !result.latest ? "No packaged Tavri release is published yet." : result.updateAvailable ? `Version ${result.latest} is available. Your version is ${result.current}.` : `You are using the newest published Tavri version (${result.current}).`;
      });
      if (!ok) $("updateStatus").textContent = $("status").textContent;
    });
    $("openUpdatePageButton").addEventListener("click", () => perform(() => api.openUpdatePage()));
    $("openHelpButton").addEventListener("click", () => openHelp());
    $("helpCloseButton").addEventListener("click", () => closeHelp());
    $("helpDoneButton").addEventListener("click", () => closeHelp(true));
    $("helpWelcomeTab").addEventListener("click", () => selectHelpSection("welcome"));
    $("helpGuideTab").addEventListener("click", () => selectHelpSection("guide"));
    $("helpFlowStartButton").addEventListener("click", () => { closeHelp(); showView("today"); $("focusTitleInput").focus(); });
    $("helpFlowReviewButton").addEventListener("click", () => { closeHelp(); showView("diagram"); $("taskTimeSection").scrollIntoView({ block: "start" }); });
    $("nextHelpTipButton").addEventListener("click", () => { helpTipIndex = (helpTipIndex + 1) % helpTips.length; renderHelpTip(); });
    $("skipWelcomeCheckbox").addEventListener("change", () => { if ($("skipWelcomeCheckbox").checked) storage.set("tavri-hide-welcome", "true"); else storage.remove("tavri-hide-welcome"); });
    $("copyWeekButton").addEventListener("click", copyExportSelection);
    $("undoButton").addEventListener("click", () => perform(async () => { renderState(await api.undoDelete(undoToken)); undoToken = null; $("undoButton").hidden = true; setStatus("Activity restored."); }));
    $("themeSelect").addEventListener("change", () => {
      $("themeFamilyFilter").value = themeFamilies.find(family => family.ids.includes($("themeSelect").value))?.id || "all";
      $("themeSearch").value = "";
      filterThemeGallery();
      applyTheme($("themeSelect").value);
    });
    doc.querySelectorAll("[data-accent-choice]").forEach(node => node.addEventListener("click", () => applyAccent(node.dataset.accentChoice)));
    $("densitySelect").addEventListener("change", () => { doc.body.dataset.density = $("densitySelect").value; storage.set("tavri-density", $("densitySelect").value); });
    $("weekEditor").addEventListener("input", () => { editor.dirty = true; $("editorDirty").textContent = "Unsaved draft"; storage.set("tavri-week-draft", JSON.stringify({ ...editor, text: $("weekEditor").value })); });
    $("saveWeekButton").addEventListener("click", saveWeek);
    $("discardEditorButton").addEventListener("click", async () => { if (!editor.dirty || await confirm("Discard this file draft?", "Your unsaved changes to the weekly file will be discarded.", "Discard draft")) { editor.dirty = false; storage.remove("tavri-week-draft"); if (state) renderState(state); setStatus("Weekly file draft discarded."); } });
    doc.addEventListener("keydown", event => {
      if (event.key === "Escape" && doc.fullscreenElement === $("timelinePanel")) { event.preventDefault(); void doc.exitFullscreen(); return; }
      if (busy || $("confirmDialog").open || $("helpDialog").open) return;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") { event.preventDefault(); if (!editing) { showView("week"); void setActivityMode("list").then(() => $("entryInput").focus()); } }
      else if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !$("composer").hidden) { event.preventDefault(); $("entryForm").requestSubmit(); }
      else if (event.key === "/" && !typing) { event.preventDefault(); if (view === "edit") showView("week"); $(view === "archive" ? "archiveQuery" : view === "changes" ? "changeQuery" : "searchInput").focus(); }
      else if (event.key === "Escape" && editing) { event.preventDefault(); endEditing(); setStatus("Editing cancelled."); }
    });
    doc.addEventListener("click", event => { for (const selector of [".export-menu", ".range-menu"]) { const menu = doc.querySelector(selector); if (!menu.contains(event.target)) menu.open = false; } });
    showView(view);
    const loaded = await loadState();
    if (loaded && !state.week.entries.length) {
      const previousWeeks = state.availableWeeks.filter(ref => ref < state.today.weekStart);
      try {
        for (const ref of previousWeeks) {
          const found = await api.getState(ref);
          if (!found.week.entries.length) continue;
          renderState(found);
          setStatus(`Showing your latest logged week (${weekLabel(ref)}). Choose This week to return to the current week.`);
          break;
        }
      } catch (error) { setStatus(error.message || "Could not load archived activities.", "error"); }
    }
    if (loaded) { teamReports.show(view); await loadFocus(); }
    try { const draft = JSON.parse(storage.get("tavri-entry-draft") || "null"); if (draft && typeof draft === "object") fillDraft(draft); } catch { /* Ignore invalid local preferences. */ }
    if (!$("entryDateInput").value) defaultDateTime();
    restoreTimer();
    try {
      const draft = JSON.parse(storage.get("tavri-week-draft") || "null");
      if (draft && isDateLiteral(draft.ref) && typeof draft.text === "string" && typeof draft.revision === "string") {
        editor = { ref: draft.ref, revision: draft.revision, dirty: true };
        $("weekEditor").value = draft.text; $("editorWeekLabel").textContent = `Week of ${draft.ref}`; $("editorDirty").textContent = "Restored draft";
        if (loaded) setStatus("An unsaved weekly file draft was restored in Settings.");
      }
    } catch { /* Ignore invalid local draft. */ }
    persistDraft();
    doc.body.dataset.ready = "true";
    if (storage.get("tavri-hide-welcome") !== "true") openHelp("welcome");
    win.setInterval(() => { if (!doc.hidden) void checkForExternalChanges(); }, 15000);
    win.setInterval(renderTimer, 1000);
    win.addEventListener("focus", () => { if (!doc.hidden) void checkForExternalChanges(); });
    doc.addEventListener("visibilitychange", () => { if (!doc.hidden) void checkForExternalChanges(); });
    return loaded;
  }
  return { start, setActivityMode, loadState, checkForExternalChanges, showView, renderState, addEntry, saveWeek, exportWeek, applyTheme, applyAccent, getCurrentState: () => state, getCurrentView: () => view, getSelectedRange: () => selectedRange };
}
if (typeof module !== "undefined") module.exports = { appearanceThemes, ...entryDomain, createTavriRenderer, viewTitles };
if (typeof window !== "undefined" && window.document && window.tavri) {
  i18n.init(window.document);
  window.tavriRenderer = createTavriRenderer({ document: window.document, api: window.tavri });
  window.tavriRenderer.start();
}
