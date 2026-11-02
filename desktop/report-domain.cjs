const { TavriCoreError, weekStartForDate } = require("./tavri-core.cjs");
const { isDateLiteral, parseEntryMessage, parseSpentToMinutes } = require("./entry-domain.cjs");

function reportOptions(raw = {}) {
  const input = raw && typeof raw === "object" ? raw : {};
  const start = input.start, end = input.end;
  if (!isDateLiteral(start) || !isDateLiteral(end) || start < "1900-01-01" || end > "9998-12-31" || start > end) {
    throw new TavriCoreError("Choose valid report dates, with From before To.");
  }
  const source = input.source === "team" ? "team" : input.source === "personal" ? "personal" : null;
  const metric = input.metric === "minutes" ? "minutes" : input.metric === "activities" ? "activities" : null;
  if (!source || !metric) throw new TavriCoreError("Choose a valid report source and metric.");
  const personId = source === "team" && typeof input.personId === "string" && input.personId.length < 100 ? input.personId : "all";
  const charts = { trend: input.charts?.trend !== false, projects: input.charts?.projects !== false, people: input.charts?.people !== false };
  return { start, end, source, personId, metric, charts, compare: input.compare === true };
}

function trendLabels(start, end, interval) {
  const labels = [];
  if (interval === "day" || interval === "week") {
    const first = interval === "week" ? weekStartForDate(start) : start;
    for (let time = Date.parse(`${first}T12:00:00Z`), last = Date.parse(`${end}T12:00:00Z`); time <= last; time += (interval === "week" ? 7 : 1) * 86400000) labels.push(new Date(time).toISOString().slice(0, 10));
  } else if (interval === "month") {
    let [year, month] = start.slice(0, 7).split("-").map(Number);
    const [lastYear, lastMonth] = end.slice(0, 7).split("-").map(Number);
    while (year < lastYear || year === lastYear && month <= lastMonth) {
      labels.push(`${year}-${String(month).padStart(2, "0")}`);
      if (++month === 13) { month = 1; year++; }
    }
  } else {
    const size = interval === "century" ? 100 : 1;
    for (let year = Math.floor(Number(start.slice(0, 4)) / size) * size; year <= Number(end.slice(0, 4)); year += size) labels.push(interval === "century" ? `${year}–${year + 99}` : String(year));
  }
  return labels;
}

function buildReport(entries, options) {
  const list = entries || [];
  const dayCount = Math.round((Date.parse(options.end + "T12:00:00Z") - Date.parse(options.start + "T12:00:00Z")) / 86400000) + 1;
  const interval = dayCount <= 14 ? "day" : dayCount <= 90 ? "week" : dayCount <= 730 ? "month" : dayCount <= 36525 ? "year" : "century";
  const projects = new Map(), people = new Map(), trend = new Map(), activeDays = new Set();
  let minutes = 0, timed = 0;
  for (const entry of list) {
    const parsed = parseEntryMessage(entry.message);
    const duration = parseSpentToMinutes(parsed.timeSpent);
    const spent = Number.isFinite(duration) && duration > 0 ? duration : 0;
    if (spent) timed++;
    minutes += spent;
    activeDays.add(entry.date);
    const year = Number(entry.date.slice(0, 4));
    const key = interval === "day" ? entry.date : interval === "week" ? weekStartForDate(entry.date) : interval === "month" ? entry.date.slice(0, 7) : interval === "year" ? String(year) : `${Math.floor(year / 100) * 100}–${Math.floor(year / 100) * 100 + 99}`;
    for (const [map, label] of [[projects, parsed.project || "Unassigned"], [people, entry.person || "You"], [trend, key]]) {
      const row = map.get(label) || { label, activities: 0, minutes: 0 };
      row.activities++; row.minutes += spent; map.set(label, row);
    }
  }
  const sorted = map => [...map.values()].sort((a, b) => (b[options.metric] - a[options.metric]) || a.label.localeCompare(b.label));
  return {
    options, interval,
    summary: { activities: list.length, minutes, timed, people: people.size, projects: [...projects.keys()].filter(name => name !== "Unassigned").length, activeDays: activeDays.size },
    trend: trendLabels(options.start, options.end, interval).map(label => trend.get(label) || { label, activities: 0, minutes: 0 }),
    projects: sorted(projects), people: sorted(people),
  };
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }

function buildReportCsv(report) {
  const safe = value => {
    let text = String(value ?? "");
    if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows = [["group", "label", "activities", "recorded_minutes"],
    ...report.trend.map(row => ["period", row.label, row.activities, row.minutes]),
    ...report.projects.map(row => ["project", row.label, row.activities, row.minutes]),
    ...(report.options.source === "team" ? report.people.map(row => ["person", row.label, row.activities, row.minutes]) : [])];
  if (report.comparison) rows.push(["previous-period", `${report.comparison.start} to ${report.comparison.end}`, report.comparison.summary.activities, report.comparison.summary.minutes]);
  return rows.map(row => row.map(safe).join(",")).join("\r\n") + "\r\n";
}

function buildReportPdfHtml(report) {
  const { options, summary } = report;
  const value = row => options.metric === "minutes" ? `${Math.floor(row.minutes / 60)}h ${row.minutes % 60}m` : String(row.activities);
  const section = (title, rows) => {
    const max = Math.max(1, ...rows.map(row => row[options.metric]));
    return `<section><h2>${escapeHtml(title)}</h2>${rows.length ? rows.map(row => `<div class="row"><div class="label"><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(value(row))}</strong></div><div class="track"><div class="fill" style="width:${Math.round(row[options.metric] / max * 100)}%"></div></div></div>`).join("") : "<p>No activities in this period.</p>"}</section>`;
  };
  const charts = [options.charts.trend && section(`Over time · ${report.interval}`, report.trend), options.charts.projects && section("Projects", report.projects), options.source === "team" && options.charts.people && section("People", report.people)].filter(Boolean).join("");
  const comparison = report.comparison ? `<p>Previous period ${escapeHtml(report.comparison.start)} – ${escapeHtml(report.comparison.end)}: ${report.comparison.summary.activities} activities, ${Math.floor(report.comparison.summary.minutes / 60)}h ${report.comparison.summary.minutes % 60}m recorded. Compare activity and time totals only with the same data coverage.</p>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>body{font:13px -apple-system,BlinkMacSystemFont,Arial,sans-serif;color:#1c2526;margin:38px}h1{font-size:30px;margin:0 0 8px}h2{font-size:18px;margin:28px 0 12px}header{border-bottom:3px solid #a9293b;padding-bottom:18px}p{color:#596669}.eyebrow{text-transform:uppercase;letter-spacing:2px;color:#a9293b;font-size:10px}.summary{display:flex;gap:12px;margin:20px 0}.metric{background:#f4f3ef;padding:13px;min-width:95px;flex:1}.metric strong{display:block;font-size:19px;margin-top:6px}.row{margin:10px 0;break-inside:avoid}.label{display:flex;justify-content:space-between;gap:20px;margin-bottom:5px}.track{height:9px;background:#e8e6e1}.fill{height:100%;background:#a9293b}section{break-inside:avoid}footer{border-top:1px solid #ddd;margin-top:30px;padding-top:12px;font-size:11px;color:#596669}</style></head><body><header><div class="eyebrow">Tavri · ${options.source === "team" ? "Team" : "Personal"} report</div><h1>Work overview</h1><div>${escapeHtml(options.start)} – ${escapeHtml(options.end)} · ${escapeHtml(report.scope || (options.source === "team" ? "Everyone, including me" : "My activities"))}</div></header><div class="summary"><div class="metric">Activities<strong>${summary.activities}</strong></div><div class="metric">Recorded time<strong>${Math.floor(summary.minutes / 60)}h ${summary.minutes % 60}m</strong></div><div class="metric">Projects<strong>${summary.projects}</strong></div><div class="metric">Active days<strong>${summary.activeDays}</strong></div></div><p>${summary.timed} of ${summary.activities} activities have a duration. Recorded time excludes activities without one.</p>${comparison}${charts}<footer>Generated locally with Tavri. Imported team files are snapshots; refresh imports to include later changes.</footer></body></html>`;
}

module.exports = { reportOptions, buildReport, buildReportCsv, buildReportPdfHtml };
