import assert from "node:assert/strict";
import { test } from "node:test";
import domain from "../desktop/entry-domain.cjs";
const { parseEntryMessage, buildEntryMessage, parseSpentToMinutes, formatSpentMinutes, filterEntries, validateEntryFields, isDateLiteral, buildDiagramData } = domain;

test("metadata round-trips without leaking into the activity description", () => {
  const text = buildEntryMessage("Shipped UI", "1h 30m", "Tavri", "APP-42");
  assert.deepEqual(parseEntryMessage(text), { message: "Shipped UI", timeSpent: "1h 30m", project: "Tavri", reference: "APP-42", taskId: "" });
  assert.equal(parseEntryMessage("Discuss [project: example] in documentation").message, "Discuss [project: example] in documentation");
});
test("durations reject partial, negative and nonnumeric input", () => {
  for (const [value, minutes] of [["30m",30],["1.5",90],["1h 30m",90],["2 hours",120],["1h30m",90],["",0]]) assert.equal(parseSpentToMinutes(value), minutes);
  for (const value of ["-1h", "1h garbage", "tomorrow", "Infinity", "1h -30m"]) assert(Number.isNaN(parseSpentToMinutes(value)), value);
  assert.equal(formatSpentMinutes(90), "1h 30m");
});
test("structured entry fields protect the log format", () => {
  assert.throws(() => validateEntryFields(""), /Describe/);
  assert.throws(() => validateEntryFields("A\nB"), /single line/);
  assert.throws(() => validateEntryFields("A", "-30m"), /duration/);
  assert.throws(() => validateEntryFields("A", "0m"), /duration/);
  assert.throws(() => validateEntryFields("A", "1h", "[project]"), /brackets/);
  validateEntryFields("Work [notes]", "1h 20m", "Tavri", "APP-1");
});
test("date validation rejects impossible calendar dates", () => {
  assert(isDateLiteral("2024-02-29"));
  for (const value of ["2026-02-29", "2026-02-30", "2026-13-01", "not a date"]) assert(!isDateLiteral(value));
});
const entries = [
  { date: "2026-10-26", time: "09:30", message: "Design review [spent: 1h] [project: Tavri] [ref: APP-42]" },
  { date: "2026-10-27", time: "10:00", message: "Export [spent: 30m] [project: Other]" },
  { date: "2026-10-28", time: "11:00", message: "Documentation [project: Tavri]" },
];
test("search, project and date filters compose identically for UI and export", () => {
  assert.deepEqual(filterEntries(entries, { query: "app-42" }), [entries[0]]);
  assert.deepEqual(filterEntries(entries, { query: "TAVRI", start: "2026-10-27" }), [entries[2]]);
  assert.deepEqual(filterEntries(entries, { project: "Tavri", end: "2026-10-27" }), [entries[0]]);
  assert.equal(filterEntries(entries, { query: "nothing" }).length, 0);
  assert.equal(entries.length, 3);
});
test("summaries count activities without inventing unrecorded durations", () => {
  const data = buildDiagramData(entries);
  assert.equal(data.byDay.reduce((sum, row) => sum + row.spentMinutes, 0), 90);
  assert.equal(data.byProject.find(row => row.name === "Tavri").spentMinutes, 60);
  assert.equal(data.byProject.find(row => row.name === "Tavri").count, 2);
});

test("task-time bars keep saved time separate from the current timer", () => {
  const rows = [
    { date: "2026-10-26", message: "Review release [spent: 30m] [project: Tavri] [ref: TV-1]" },
    { date: "2026-10-27", message: "Review release [spent: 45m] [project: Tavri] [ref: TV-1]" },
    { date: "2026-10-27", message: "Planning [project: Tavri]" },
  ];
  const result = domain.buildTaskTimeData(rows, { message: "Review release", project: "Tavri", reference: "TV-1", minutes: 12 });
  assert.equal(result.loggedMinutes, 75);
  assert.equal(result.liveMinutes, 12);
  assert.equal(result.timedEntries, 2);
  assert.equal(result.totalEntries, 3);
  assert.equal(result.rows[0].activities, 2);
  assert.equal(result.rows[0].loggedMinutes, 75);
  assert.equal(result.rows[0].liveMinutes, 12);
  assert.equal(result.rows[1].loggedMinutes, 0);
});

test("calendar handles leap years, Monday layout data and fixed intensity levels", () => {
  const days = domain.calendarDays(2024, [
    {date:"2024-02-29"}, {date:"2024-02-29"}, {date:"2023-02-28"}, {date:"invalid"},
    ...Array.from({length:7}, () => ({date:"2024-01-01"})),
  ]);
  assert.equal(days.length, 366);
  assert.equal(days.find(day => day.date === "2024-02-29").count, 2);
  assert.equal(days.find(day => day.date === "2024-02-29").level, 2);
  assert.equal(days[0].level, 4);
  assert.equal(days[1].count, 0);
  assert.equal(domain.calendarDays(2025, []).length, 365);
});
test("timeline keeps duplicate events and never invents times for old CLI entries", () => {
  const input = [
    {id:"a", date:"2026-10-29", time:"11:00"},
    {id:"b", date:"2026-10-29", time:"09:00"},
    {id:"c", date:"2026-10-29", time:"09:00"},
    {id:"d", date:"2026-10-29", time:""},
    {id:"e", date:"2026-10-28", time:"25:00"},
  ];
  const groups = domain.timelineGroups(input);
  assert.deepEqual(groups[0].timed.map(entry => entry.id), ["b", "c", "a"]);
  assert.deepEqual(groups[0].untimed.map(entry => entry.id), ["d"]);
  assert.equal(groups[1].untimed.length, 1);
  assert.equal(input[0].id, "a");
});
test("date timeline spans the first and last visible log, preserves duplicates and alternates notes", () => {
  const input = [
    { id: "a", date: "2026-10-29", time: "09:00", message: "First activity [project: Tavri]" },
    { id: "b", date: "2026-10-27", time: "", message: "Older activity" },
    { id: "c", date: "2026-10-29", time: "09:00", message: "First activity [project: Tavri]" },
    { id: "d", date: "2026-10-29", time: "", message: "Untimed follow-up" },
  ];
  const layout = domain.timelineLayout(input);
  assert.equal(layout.start, "2026-10-27");
  assert.equal(layout.end, "2026-10-29");
  assert.deepEqual(layout.days.map(day => day.date), ["2026-10-27", "2026-10-28", "2026-10-29"]);
  assert.equal(layout.days[1].events.length, 0);
  assert.deepEqual(layout.days[2].events.map(event => event.entry.id), ["a", "c", "d"]);
  assert.deepEqual(layout.days[2].events.map(event => event.side), ["above", "below", "above"]);
  assert.equal(layout.days[2].events[0].snippet, "First activity");
  assert.equal(layout.days[2].events[2].entry.time, "");
  assert.equal(domain.timelineLayout([]).count, 0);
});
