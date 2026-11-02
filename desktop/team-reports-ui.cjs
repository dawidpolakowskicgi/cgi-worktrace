(function (root) {
"use strict";
function createTeamReportsUi({ document: doc, api, perform, confirm, setStatus, getToday, t = text => text, locale = 'en' }) {
  const $ = id => doc.getElementById(id);
  const node = (tag, className, value) => { const item = doc.createElement(tag); if (className) item.className = className; if (value !== undefined) item.textContent = value; return item; };
  let teamState = { members: [], activities: 0, minutes: 0 }, preview = null, previewOptions = null, reportPresets = [];
  const formatMinutes = minutes => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  const options = () => ({ start: $("reportStart").value, end: $("reportEnd").value, source: $("reportSource").value, personId: $("reportPerson").value, metric: $("reportMetric").value, charts: { trend: $("reportChartTrend").checked, projects: $("reportChartProjects").checked, people: $("reportChartPeople").checked }, compare: $("reportCompare").checked });
  function invalidate() { preview = null; previewOptions = null; for (const id of ["reportExportButton", "reportExportCsvButton", "reportCopySummaryButton"]) $(id).disabled = true; $("reportStatus").textContent = "Options changed. Update the preview to export."; }
  function savePresets() { try { doc.defaultView.localStorage.setItem("tavri-report-presets", JSON.stringify(reportPresets)); } catch { /* Keep working without profile storage. */ } }
  function renderPresetOptions() {
    const select = $("reportSavedPreset"), selected = select.value;
    select.replaceChildren(node("option", "", "Choose a saved template"), ...reportPresets.map(item => { const option = node("option", "", item.name); option.value = item.name; return option; }));
    select.value = reportPresets.some(item => item.name === selected) ? selected : "";
  }
  function applyQuickPeriod() {
    const today = getToday() || new Date().toISOString().slice(0, 10);
    const date = new Date(`${today}T12:00:00Z`);
    const start = new Date(date);
    switch ($("reportQuickPeriod").value) {
      case "week": start.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7); break;
      case "last14": start.setUTCDate(date.getUTCDate() - 13); break;
      case "month": start.setUTCDate(1); break;
      case "quarter": start.setUTCMonth(Math.floor(date.getUTCMonth() / 3) * 3, 1); break;
    }
    $("reportStart").value = start.toISOString().slice(0, 10); $("reportEnd").value = today;
    invalidate(); setStatus("Report period updated. Refresh the preview to see the result.");
  }
  function renderMembers() {
    $("teamSummary").textContent = `${teamState.members.length} ${t("people")} · ${teamState.activities} ${t("activities")}`;
    const list = $("teamMembers"); list.replaceChildren();
    if (!teamState.members.length) { list.append(node("p", "empty-state", "No team files imported yet.")); return; }
    for (const member of teamState.members) {
      const card = node("div", "team-member");
      const main = node("div"); main.append(node("strong", "", member.name), node("p", "field-help", `${member.weeks} ${t("weeks")} · ${member.activities} ${t("activities")} · ${formatMinutes(member.minutes)} ${t("recorded")} · ${member.timed} ${t("with duration")} · ${t("imported")} ${member.importedAt ? new Date(member.importedAt).toLocaleString(locale) : t("earlier")}`));
      const remove = node("button", "text-button", "Remove"); remove.type = "button"; remove.setAttribute("aria-label", `Remove ${member.name} from team`);
      remove.addEventListener("click", async () => {
        if (!await confirm("Remove imported person?", `Remove ${member.name}'s local snapshots from the team workspace? Your own journal and their original files will stay intact.`, "Remove")) return;
        await perform(async () => { teamState = await api.removeTeamMember(member.id); renderMembers(); renderHistory(); renderPeopleOptions(); invalidate(); setStatus(`${member.name} removed from team workspace.`); });
      });
      card.append(main, remove);
      if (member.weekRefs?.length) {
        const weeks = node("details", "team-weeks");
        weeks.append(node("summary", "", `Manage ${member.weekRefs.length} imported weeks`));
        const rows = node("div", "team-week-list");
        for (const ref of member.weekRefs) {
          const row = node("div", "team-week-row");
          const removeWeek = node("button", "text-button", "Remove week"); removeWeek.type = "button";
          removeWeek.setAttribute("aria-label", `Remove ${ref} for ${member.name}`);
          removeWeek.addEventListener("click", async () => {
            if (!await confirm("Remove imported week?", `Remove ${member.name}'s snapshot for ${ref}? Their original .log file will not be changed.`, "Remove week")) return;
            await perform(async () => { teamState = await api.removeTeamWeek(member.id, ref); renderMembers(); renderHistory(); renderPeopleOptions(); invalidate(); setStatus(`Removed ${ref} for ${member.name}.`); });
          });
          row.append(node("span", "", ref), removeWeek); rows.append(row);
        }
        weeks.append(rows); card.append(weeks);
      }
      list.append(card);
    }
  }
  function renderHistory() {
    const container = $("teamHistory"); container.replaceChildren();
    $("undoTeamChangeButton").hidden = !teamState.canUndo;
    for (const item of (teamState.history || []).slice(0, 8)) {
      const text = item.action === "import" ? `Imported ${item.weeks} weeks for ${item.person} · ${item.added} new, ${item.changed} changed` : item.action === "remove-week" ? `Removed ${item.week} for ${item.person}` : `${item.action} · ${item.person || "team"}`;
      container.append(node("p", "field-help", `${new Date(item.at).toLocaleString()} · ${text}`));
    }
    if (!container.childNodes.length) container.append(node("p", "field-help", "No team changes recorded yet."));
  }
  function renderPeopleOptions() {
    const select = $("reportPerson"), selected = select.value;
    const base = [["all", "Everyone, including me"], ["me", "Only me"], ...teamState.members.map(member => [member.id, member.name])];
    select.replaceChildren(...base.map(([id, name]) => { const option = node("option", "", name); option.value = id; return option; }));
    select.value = base.some(([id]) => id === selected) ? selected : "all";
  }
  async function refreshTeam() { teamState = await api.getTeamState(); renderMembers(); renderHistory(); renderPeopleOptions(); }
  function chart(title, rows, metric) {
    const section = node("section", "report-chart"); section.append(node("h4", "", title));
    if (!rows.length) { section.append(node("p", "field-help", "No activities in this period.")); return section; }
    const max = Math.max(1, ...rows.map(row => row[metric]));
    for (const row of rows) {
      const wrap = node("div", "report-chart-row"), label = node("div", "report-chart-label"), track = node("div", "report-chart-track"), fill = node("div", "report-chart-fill");
      label.append(node("span", "", row.label), node("strong", "", metric === "minutes" ? formatMinutes(row.minutes) : String(row.activities)));
      fill.style.width = `${row[metric] / max * 100}%`; track.append(fill); wrap.append(label, track); section.append(wrap);
    }
    return section;
  }
  function renderPreview(report) {
    const container = $("reportPreview"), { summary, options: selected } = report; container.replaceChildren();
    const metrics = node("div", "report-metrics");
    for (const [label, value] of [["Activities", summary.activities], ["Recorded time", formatMinutes(summary.minutes)], ["Projects", summary.projects], ["Active days", summary.activeDays]]) {
      const item = node("div", "report-metric"); item.append(node("span", "", label), node("strong", "", String(value))); metrics.append(item);
    }
    container.append(metrics, node("p", "field-help", `${summary.timed} ${t("of")} ${summary.activities} ${t("activities have a duration")}. ${t("Recorded time excludes activities without one.")}`));
    if (report.comparison) container.append(node("p", "report-comparison", `${t("Previous period")} ${report.comparison.start} ${t("to")} ${report.comparison.end}: ${report.comparison.summary.activities} ${t("activities and")} ${formatMinutes(report.comparison.summary.minutes)} ${t("recorded")}. ${t("Compare totals alongside duration coverage; they do not rate people's productivity.")}`));
    if (selected.charts.trend) container.append(chart(`${t("Over time")} · ${report.interval}`, report.trend, selected.metric));
    if (selected.charts.projects) container.append(chart("Projects", report.projects, selected.metric));
    if (selected.source === "team" && selected.charts.people) container.append(chart("People", report.people, selected.metric));
    const section = node("section", "report-data-table"); section.append(node("h4", "", "Data behind the charts"));
    const table = node("table"), head = node("thead"), headRow = node("tr");
    for (const title of ["Group", "Period or name", "Activities", "Recorded time"]) headRow.append(node("th", "", title));
    head.append(headRow); table.append(head);
    const body = node("tbody");
    for (const [group, rows] of [["Period", report.trend], ["Project", report.projects], ...(selected.source === "team" ? [["Person", report.people]] : [])]) {
      for (const row of rows) { const line = node("tr"); for (const value of [group, row.label, row.activities, formatMinutes(row.minutes)]) line.append(node("td", "", String(value))); body.append(line); }
    }
    table.append(body); section.append(table); container.append(section);
    $("reportStatus").textContent = `${t(selected.source === "team" ? "Team" : "Personal")} ${t("report")} · ${t(report.scope || (selected.source === "team" ? "Everyone, including me" : "My activities"))} · ${selected.start} ${t("to")} ${selected.end} · ${summary.activities} ${t("activities")}`;
    for (const id of ["reportExportButton", "reportExportCsvButton", "reportCopySummaryButton"]) $(id).disabled = false;
  }
  async function updatePreview() {
    const input = options();
    await perform(async () => { preview = await api.getReportPreview(input); previewOptions = input; renderPreview(preview); });
  }
  function setMode(mode) {
    $("reportSource").value = mode === "team" ? "team" : "personal";
    $("reportSource").querySelector('option[value="team"]').disabled = mode !== "team";
    $("reportPersonField").hidden = mode !== "team";
    $("reportChartPeople").disabled = mode !== "team";
    invalidate();
  }
  function setPeriod(start, end) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return;
    $("reportStart").value = start;
    $("reportEnd").value = end;
    invalidate();
  }
  function start() {
    try { const saved = JSON.parse(doc.defaultView.localStorage.getItem("tavri-report-presets") || "[]"); if (Array.isArray(saved)) reportPresets = saved.filter(item => item && typeof item.name === "string" && item.options).slice(0, 20); } catch { /* Ignore invalid local preferences. */ }
    renderPresetOptions();
    const today = getToday() || new Date().toISOString().slice(0, 10);
    const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - 29);
    $("reportStart").value = date.toISOString().slice(0, 10); $("reportEnd").value = today;
    for (const id of ["reportStart", "reportEnd", "reportMetric", "reportPerson", "reportChartTrend", "reportChartProjects", "reportChartPeople", "reportCompare"]) $(id).addEventListener("change", invalidate);
    $("reportApplyPeriod").addEventListener("click", applyQuickPeriod);
    $("reportUseActivityRange").addEventListener("click", () => {
      const range = doc.defaultView.tavriRenderer?.getSelectedRange?.();
      if (!range) { setStatus("Select a From/To date range in Activity first.", "error"); return; }
      setPeriod(range.start, range.end);
      void updatePreview();
    });
    $("reportSavePreset").addEventListener("click", async () => {
      const name = $("reportPresetName").value.trim();
      if (!name || name.length > 60) { setStatus("Enter a template name of 1–60 characters.", "error"); return; }
      if (reportPresets.some(item => item.name.toLocaleLowerCase() === name.toLocaleLowerCase()) && !await confirm("Replace saved report template?", `Replace the settings saved as “${name}”?`, "Replace template")) return;
      reportPresets = reportPresets.filter(item => item.name.toLocaleLowerCase() !== name.toLocaleLowerCase());
      reportPresets.unshift({ name, options: options() }); reportPresets = reportPresets.slice(0, 20);
      savePresets(); renderPresetOptions(); $("reportSavedPreset").value = name;
      setStatus(`Saved report template “${name}” on this device.`);
    });
    $("reportLoadPreset").addEventListener("click", () => {
      const preset = reportPresets.find(item => item.name === $("reportSavedPreset").value);
      if (!preset) { setStatus("Choose a saved report template first.", "error"); return; }
      const selected = preset.options;
      for (const [id, value] of [["reportStart", selected.start], ["reportEnd", selected.end], ["reportMetric", selected.metric]]) $(id).value = value;
      $("reportSource").value = selected.source === "team" && !$("reportSource").querySelector('option[value="team"]').disabled ? "team" : "personal";
      $("reportPersonField").hidden = $("reportSource").value !== "team";
      $("reportChartPeople").disabled = $("reportSource").value !== "team";
      $("reportPerson").value = [...$("reportPerson").options].some(option => option.value === selected.personId) ? selected.personId : "all";
      for (const [id, value] of [["reportChartTrend", selected.charts?.trend], ["reportChartProjects", selected.charts?.projects], ["reportChartPeople", selected.charts?.people], ["reportCompare", selected.compare]]) $(id).checked = Boolean(value);
      invalidate(); setStatus(`Loaded report template “${preset.name}”. Update the preview to see current data.`);
    });
    $("reportDeletePreset").addEventListener("click", async () => {
      const name = $("reportSavedPreset").value;
      if (!name || !await confirm("Delete saved report template?", `Remove “${name}” from this device?`, "Delete template")) return;
      reportPresets = reportPresets.filter(item => item.name !== name); savePresets(); renderPresetOptions(); setStatus(`Deleted report template “${name}”.`);
    });
    $("reportSource").addEventListener("change", () => { $("reportPersonField").hidden = $("reportSource").value !== "team"; $("reportChartPeople").disabled = $("reportSource").value !== "team"; invalidate(); });
    $("reportPreviewButton").addEventListener("click", updatePreview);
    $("reportExportButton").addEventListener("click", () => perform(async () => {
      if (!preview || !previewOptions) return;
      const result = await api.exportReport(previewOptions, preview.revision);
      setStatus(result.canceled ? "Report export cancelled." : `PDF report saved to ${result.filePath}.`);
    }));
    $("reportExportCsvButton").addEventListener("click", () => perform(async () => {
      if (!preview || !previewOptions) return;
      const result = await api.exportReport(previewOptions, preview.revision, "csv");
      setStatus(result.canceled ? "Report export cancelled." : `CSV report saved to ${result.filePath}.`);
    }));
    $("reportCopySummaryButton").addEventListener("click", () => perform(async () => {
      if (!preview) return;
      const fresh = await api.getReportPreview(previewOptions);
      if (fresh.revision !== preview.revision) throw new Error("Report data changed. Update the preview before copying.");
      const lines = [`Tavri report · ${preview.options.start} to ${preview.options.end}`, `${preview.scope}: ${preview.summary.activities} activities, ${formatMinutes(preview.summary.minutes)} recorded, ${preview.summary.timed} with duration`, ...preview.projects.map(row => `${row.label}: ${row.activities} activities, ${formatMinutes(row.minutes)} recorded`)];
      if (preview.comparison) lines.push(`Previous period ${preview.comparison.start} to ${preview.comparison.end}: ${preview.comparison.summary.activities} activities, ${formatMinutes(preview.comparison.summary.minutes)} recorded`);
      await api.copyText(lines.join("\n") + "\n"); setStatus("Report summary copied to clipboard.");
    }));
    doc.querySelectorAll("[data-team-import-kind]").forEach(button => button.addEventListener("click", async () => {
      const name = $("teamPersonName").value.trim();
      if (!name) { setStatus("Enter the person's name before choosing files.", "error"); $("teamPersonName").focus(); return; }
      let selection;
      if (!await perform(async () => { selection = await api.importTeamFiles(name, button.dataset.teamImportKind); })) return;
      if (selection.canceled) { setStatus("Import cancelled."); return; }
      const { preview } = selection;
      const person = preview.existingName ? `Update ${preview.existingName}` : `Add ${preview.name}`;
      if (!await confirm("Import team snapshots?", `${person}: ${preview.weeks} weeks, ${preview.activities} activities (${preview.first} to ${preview.last}). ${preview.newWeeks} new weeks, ${preview.changedWeeks} changed, ${preview.unchangedWeeks} unchanged. Original files will stay untouched.`, "Import snapshots")) return;
      await perform(async () => {
        teamState = await api.commitTeamImport(selection.token);
        renderMembers(); renderHistory(); renderPeopleOptions(); invalidate(); $("teamPersonName").value = "";
        setStatus(`Imported ${preview.weeks} weeks for ${name}. Open Reports to explore the team.`);
      });
    }));
    $("undoTeamChangeButton").addEventListener("click", async () => {
      if (!await confirm("Undo last team change?", "Restore the previous team workspace state? Your own journal and colleagues' original files will stay untouched.", "Undo change")) return;
      await perform(async () => { teamState = await api.undoTeamChange(); renderMembers(); renderHistory(); renderPeopleOptions(); invalidate(); setStatus("Previous team workspace state restored."); });
    });
  }
  function show(view) {
    if (view === "team") void perform(refreshTeam);
    if (view === "reports") void perform(async () => { await refreshTeam(); const input = options(); preview = await api.getReportPreview(input); previewOptions = input; renderPreview(preview); });
  }
  return { start, show, setMode, setPeriod, refreshTeam };
}
if (typeof module !== "undefined") module.exports = { createTeamReportsUi };
root.TavriTeamReportsUi = { createTeamReportsUi };
})(globalThis);
