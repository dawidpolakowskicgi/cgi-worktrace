(function (root) {
"use strict";
function isDateLiteral(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") && !Number.isNaN(Date.parse(value + "T12:00:00Z")) && new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value;
}

function compareDates(left, right) {
  return String(left || "").localeCompare(String(right || ""));
}

function hasLineBreak(value) {
  return /[\n\r]/.test(String(value || ""));
}

function formatEntryLine(entry) {
  if (entry && entry.line) {
    return entry.line;
  }

  const date = entry && entry.date ? entry.date : "";
  const time = entry && entry.time ? ` ${entry.time}` : "";
  const message = entry && entry.message ? entry.message : "";
  return `${date}${time} ${message}`.trim();
}

function formatSpentMinutes(totalMinutes) {
  const safeMinutes = Math.max(0, Number(totalMinutes) || 0);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  if (hours && minutes) {
    return `${hours}h ${minutes}m`;
  }

  if (hours) {
    return `${hours}h`;
  }

  return `${minutes}m`;
}

function parseSpentToMinutes(value) {
  const input = String(value || "").trim().toLowerCase();
  if (!input) return 0;
  if (/^\d+(?:\.\d+)?$/.test(input)) return Math.round(Number(input) * 60);
  const pattern = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)(?=\s|\d|$)/g;
  let total = 0;
  const remaining = input.replace(pattern, (_match, amount, unit) => {
    total += Number(amount) * (unit.startsWith("h") ? 60 : 1);
    return "";
  });
  return remaining.trim() || !Number.isFinite(total) ? NaN : Math.round(total);
}

function parseEntryMessage(message) {
  const result = {
    message: String(message || "").trim(),
    project: "",
    reference: "",
    timeSpent: "",
    taskId: "",
    status: "",
  };

  while (true) {
    const match = /\s+\[(spent|project|ref|task|status): ([^\]]+)\]$/.exec(result.message);

    if (!match) {
      return result;
    }

    if (match[1] === "spent" && !result.timeSpent) {
      result.timeSpent = match[2].trim();
    } else if (match[1] === "project" && !result.project) {
      result.project = match[2].trim();
    } else if (match[1] === "ref" && !result.reference) {
      result.reference = match[2].trim();
    } else if (match[1] === "task" && !result.taskId && /^[a-f0-9-]{36}$/.test(match[2].trim())) {
      result.taskId = match[2].trim();
    } else if (match[1] === "status" && !result.status && ["in-progress", "done"].includes(match[2].trim())) {
      result.status = match[2].trim();
    } else {
      return result;
    }

    result.message = result.message.slice(0, match.index).trimEnd();
  }
}

function buildEntryMessage(message, timeSpent, project, reference, taskId = "", status = "") {
  const cleanMessage = String(message || "").trim();
  const cleanTimeSpent = String(timeSpent || "").trim();
  const cleanProject = String(project || "").trim();
  const cleanReference = String(reference || "").trim();
  const segments = [cleanMessage];

  if (cleanTimeSpent) {
    segments.push(`[spent: ${cleanTimeSpent}]`);
  }

  if (cleanProject) {
    segments.push(`[project: ${cleanProject}]`);
  }

  if (cleanReference) {
    segments.push(`[ref: ${cleanReference}]`);
  }

  if (/^[a-f0-9-]{36}$/.test(taskId)) segments.push(`[task: ${taskId}]`);
  if (["in-progress", "done"].includes(status)) segments.push(`[status: ${status}]`);

  return segments.join(" ");
}

function buildDiagramData(entries) {
  const dayMap = new Map();
  const projectMap = new Map();

  for (const entry of entries || []) {
    const parsed = parseEntryMessage(entry.message);
    const spentMinutes = parseSpentToMinutes(parsed.timeSpent) || 0;
    const dayRecord = dayMap.get(entry.date) || { date: entry.date, count: 0, spentMinutes: 0 };
    dayRecord.count += 1;
    dayRecord.spentMinutes += spentMinutes;
    dayMap.set(entry.date, dayRecord);

    {
      const projectName = parsed.project || "No project";
      const projectRecord = projectMap.get(projectName) || { name: projectName, count: 0, spentMinutes: 0 };
      projectRecord.count += 1;
      projectRecord.spentMinutes += spentMinutes;
      projectMap.set(projectName, projectRecord);
    }
  }

  return {
    byDay: Array.from(dayMap.values()).sort((left, right) => compareDates(left.date, right.date)),
    byProject: Array.from(projectMap.values()).sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.name.localeCompare(right.name);
    }),
  };
}

function buildTaskTimeData(entries, timer = null) {
  const tasks = new Map();
  let loggedMinutes = 0, timedEntries = 0;
  const record = (message, project, reference, taskId = "") => {
    const title = String(message || "").trim() || "Untitled activity";
    const cleanProject = String(project || "").trim();
    const cleanReference = String(reference || "").trim();
    const key = taskId ? `task:${taskId}` : JSON.stringify([title.toLocaleLowerCase(), cleanProject.toLocaleLowerCase(), cleanReference.toLocaleLowerCase()]);
    if (!tasks.has(key)) tasks.set(key, { title, project: cleanProject, reference: cleanReference, taskId, loggedMinutes: 0, liveMinutes: 0, hasTimer: false, activities: 0, timedEntries: 0, latestDate: "" });
    return tasks.get(key);
  };
  for (const entry of entries || []) {
    const detail = parseEntryMessage(entry.message);
    const task = record(detail.message, detail.project, detail.reference, detail.taskId);
    const minutes = parseSpentToMinutes(detail.timeSpent);
    // Automatic task-state markers belong in the journal, but they are not work sessions.
    if (!detail.status) task.activities += 1;
    if (Number.isFinite(minutes) && minutes > 0) {
      task.loggedMinutes += minutes; task.timedEntries += 1;
      loggedMinutes += minutes; timedEntries += 1;
    }
    if (entry.date > task.latestDate) task.latestDate = entry.date;
  }
  let liveMinutes = 0;
  if (timer && Number.isFinite(timer.minutes) && timer.minutes >= 0) {
    const task = record(timer.message, timer.project, timer.reference, timer.taskId);
    task.liveMinutes = timer.minutes;
    task.hasTimer = true;
    liveMinutes = task.liveMinutes;
  }
  const rows = [...tasks.values()].sort((a, b) => (b.loggedMinutes + b.liveMinutes) - (a.loggedMinutes + a.liveMinutes) || b.latestDate.localeCompare(a.latestDate) || a.title.localeCompare(b.title));
  return { rows, loggedMinutes, liveMinutes, timedEntries, totalEntries: (entries || []).length };
}

function filterEntries(entries, filters = {}) {
  const query = String(filters.query || "").trim().toLocaleLowerCase();
  return entries.filter(entry => {
    const meta = parseEntryMessage(entry.message);
    return (!filters.start || entry.date >= filters.start)
      && (!filters.end || entry.date <= filters.end)
      && (!filters.project || meta.project === filters.project)
      && (!query || [meta.message, meta.project, meta.reference, meta.status, entry.date, entry.time].join(" ").toLocaleLowerCase().includes(query));
  });
}

function validateEntryFields(message, timeSpent = "", project = "", reference = "") {
  if (!String(message || "").trim()) throw new Error("Describe the activity before saving.");
  if ([message, timeSpent, project, reference].some(hasLineBreak)) throw new Error("Each field must stay on a single line.");
  if ([timeSpent, project, reference].some(value => /[\[\]]/.test(value))) throw new Error("Details cannot contain square brackets.");
  if (timeSpent && (!Number.isFinite(parseSpentToMinutes(timeSpent)) || parseSpentToMinutes(timeSpent) <= 0)) {
    throw new Error("Use a duration such as 30m, 1h 15m or 1.5 (hours).");
  }
}

function calendarDays(year, entries) {
  if (!Number.isInteger(year) || year < 100 || year > 9998) throw new Error("Invalid calendar year");
  const counts = new Map();
  for (const entry of entries) if (isDateLiteral(entry.date)) counts.set(entry.date, (counts.get(entry.date) || 0) + 1);
  const days = [];
  const date = new Date(Date.UTC(year, 0, 1, 12));
  while (date.getUTCFullYear() === year) {
    const value = date.toISOString().slice(0, 10);
    const count = counts.get(value) || 0;
    days.push({ date: value, count, level: count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 6 ? 3 : 4 });
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return days;
}

function timelineGroups(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const group = groups.get(entry.date) || { date: entry.date, timed: [], untimed: [] };
    (/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.time || "") ? group.timed : group.untimed).push(entry);
    groups.set(entry.date, group);
  }
  return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date)).map(group => ({ ...group, timed: group.timed.sort((a,b) => a.time.localeCompare(b.time)) }));
}

function timelineLayout(entries) {
  const valid = (entries || []).filter(entry => isDateLiteral(entry.date));
  if (!valid.length) return { start: "", end: "", days: [], count: 0 };
  const sorted = valid.map((entry, index) => ({ entry, index })).sort((a, b) =>
    a.entry.date.localeCompare(b.entry.date) ||
    (a.entry.time || "99:99").localeCompare(b.entry.time || "99:99") || a.index - b.index);
  const start = sorted[0].entry.date, end = sorted[sorted.length - 1].entry.date;
  const groups = new Map();
  for (const { entry } of sorted) {
    const events = groups.get(entry.date) || [];
    const description = parseEntryMessage(entry.message).message;
    const chars = Array.from(description);
    events.push({ entry, side: events.length % 2 === 0 ? "above" : "below", snippet: chars.length > 72 ? chars.slice(0, 72).join("").trimEnd() + "…" : description, description });
    groups.set(entry.date, events);
  }
  const days = [];
  const first = Date.parse(start + "T12:00:00Z"), last = Date.parse(end + "T12:00:00Z");
  if ((last - first) / 86400000 <= 31) {
    for (let stamp = first; stamp <= last; stamp += 86400000) {
      const date = new Date(stamp).toISOString().slice(0, 10);
      days.push({ date, events: groups.get(date) || [] });
    }
  } else {
    for (const [date, events] of groups) days.push({ date, events });
  }
  return { start, end, days, count: valid.length };
}

const api = { calendarDays, timelineGroups, timelineLayout, isDateLiteral, compareDates, hasLineBreak, formatEntryLine, formatSpentMinutes, parseSpentToMinutes, parseEntryMessage, buildEntryMessage, buildDiagramData, buildTaskTimeData, filterEntries, validateEntryFields };
if (typeof module !== "undefined") module.exports = api;
else root.TavriEntries = api;
})(globalThis);
