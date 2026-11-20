(function(root) {
  const { calendarDays, timelineLayout } = typeof module !== "undefined" ? require("./entry-domain.cjs") : root.TavriEntries;
  function createActivityViews({ document: doc, dateLabel, selectTimeline, selectDay, t = text => text }) {
    const $ = id => doc.getElementById(id);
    function el(tag, className, text) {
      const node = doc.createElement(tag); node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }
    const key = entry => `${entry.date}|${entry.id}`;
    function timeline(entries, selectedKey) {
      const container = $("timelineCanvas"); container.replaceChildren();
      const layout = timelineLayout(entries);
      if (!layout.count) { container.append(el("p", "empty-state", t("No activities match this selection. Add an activity or clear your filters."))); return; }
      const summary = el("div", "timeline-range");
      const startLabel = dateLabel(layout.start, { day: "numeric", month: "short", year: "numeric" });
      const endLabel = dateLabel(layout.end, { day: "numeric", month: "short", year: "numeric" });
      summary.append(el("span", "timeline-range-dates", layout.start === layout.end ? startLabel : `${startLabel} → ${endLabel}`), el("span", "muted", `${layout.count} ${t(layout.count === 1 ? "activity" : "activities")}`));
      container.append(summary);
      const scroll = el("div", "timeline-scroll"); scroll.tabIndex = 0; scroll.setAttribute("aria-label", t("Activity timeline, scroll horizontally to see all dates"));
      const stage = el("div", "timeline-stage"); stage.style.setProperty("--timeline-days", String(layout.days.length));
      const dayWidth = Math.max(152, ...layout.days.map(day => day.events.length * 22 + 24));
      stage.style.setProperty("--timeline-min-width", `${layout.days.length * dayWidth}px`);
      const upper = el("div", "timeline-upper"), center = el("div", "timeline-center"), lower = el("div", "timeline-lower");
      for (const day of layout.days) {
        const topSlot = el("div", "timeline-slot timeline-slot--above"), bottomSlot = el("div", "timeline-slot timeline-slot--below");
        const axis = el("div", "timeline-date-cell"); axis.dataset.date = day.date;
        if (day.events.length > 1) axis.classList.add("is-cluster");
        const dotRow = el("div", "timeline-dot-row");
        for (const event of day.events) {
          const { entry } = event, selected = key(entry) === selectedKey;
          const full = `${day.date}${entry.time ? ` ${entry.time}` : ` · ${t("no recorded time")}`} · ${event.description}`;
          const bubble = el("div", `timeline-bubble timeline-bubble--${event.side}`); bubble.dataset.entryKey = key(entry); bubble.dataset.side = event.side;
          bubble.setAttribute("aria-hidden", "true"); bubble.setAttribute("aria-pressed", String(selected)); bubble.title = full;
          bubble.append(el("span", "timeline-bubble-time", entry.time || t("No time")), el("span", "timeline-bubble-text", event.snippet || t("Untitled activity")));
          bubble.addEventListener("click", () => selectTimeline(entry));
          (event.side === "above" ? topSlot : bottomSlot).append(bubble);
          const dot = el("button", "timeline-dot"); dot.type = "button"; dot.dataset.entryKey = key(entry); dot.dataset.side = event.side;
          dot.setAttribute("aria-label", full); dot.setAttribute("aria-pressed", String(selected)); dot.title = full;
          dot.addEventListener("click", () => selectTimeline(entry)); dotRow.append(dot);
        }
        axis.append(dotRow, el("span", "timeline-date-label", dateLabel(day.date, { weekday: "short", day: "numeric", month: "short" })));
        upper.append(topSlot); center.append(axis); lower.append(bottomSlot);
      }
      stage.append(upper, center, lower); scroll.append(stage); container.append(scroll);
    }
    function calendar(year, entries, selectedDate) {
      const days = calendarDays(year, entries);
      const offset = (new Date(days[0].date + "T12:00:00Z").getUTCDay() + 6) % 7;
      const grid = el("div", "contributions-grid");
      const weeks = Math.ceil((offset + days.length) / 7);
      grid.style.setProperty("--calendar-weeks", weeks);
      const months = el("div", "contribution-months");
      let lastColumn = -5;
      for (let index = 0; index < days.length; index++) {
        if (days[index].date.endsWith("-01")) {
          const column = Math.floor((offset + index) / 7);
          if (column - lastColumn < 3) continue;
          const label = el("span", "", dateLabel(days[index].date, { month: "short" }));
          label.style.gridColumn = String(column + 1); months.append(label); lastColumn = column;
        }
      }
      const labels = el("div", "contribution-weekdays");
      for (const name of ["Mon", "", "Wed", "", "Fri", "", "Sun"]) labels.append(el("span", "", t(name)));
      const cells = el("div", "contribution-cells");
      const buttons = [];
      days.forEach((day, index) => {
        const node = el("button", "contribution-cell"); node.type = "button";
        node.dataset.date = day.date; node.dataset.level = String(day.level); node.dataset.count = String(day.count);
        node.style.gridColumn = String(Math.floor((index + offset) / 7) + 1);
        node.style.gridRow = String((index + offset) % 7 + 1);
        const description = `${dateLabel(day.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${day.count} ${t(day.count === 1 ? "activity" : "activities")}`;
        node.title = description; node.setAttribute("aria-label", description); node.setAttribute("aria-pressed", String(day.date === selectedDate));
        node.tabIndex = day.date === selectedDate ? 0 : -1;
        node.addEventListener("mouseenter", () => { $("calendarDayHint").textContent = description; });
        node.addEventListener("focus", () => { $("calendarDayHint").textContent = description; });
        node.addEventListener("click", () => selectDay(day.date));
        node.addEventListener("keydown", event => {
          const shifts = { ArrowRight: 7, ArrowLeft: -7, ArrowDown: 1, ArrowUp: -1 };
          let next = Object.hasOwn(shifts, event.key) ? index + shifts[event.key] : event.key === "Home" ? 0 : event.key === "End" ? days.length - 1 : null;
          if (next === null) return;
          event.preventDefault(); next = Math.min(days.length - 1, Math.max(0, next));
          buttons.forEach(button => { button.tabIndex = -1; }); buttons[next].tabIndex = 0; buttons[next].focus();
        });
        buttons.push(node); cells.append(node);
      });
      grid.append(months, labels, cells); $("contributionsGrid").replaceChildren(grid);
      const count = entries.length, active = days.filter(day => day.count).length;
      $("calendarSummary").textContent = `${count} ${t(count === 1 ? "activity" : "activities")} ${t("across")} ${active} ${t("active days in")} ${year} · ${t("current filters")}`;
      $("calendarYearLabel").textContent = String(year);
      $("calendarDayHint").textContent = t("Arrow keys to explore · Enter to select a day");
    }
    return { timeline, calendar, key };
  }
  if (typeof module !== "undefined") module.exports = { createActivityViews };
  else root.TavriActivityViews = { createActivityViews };
})(globalThis);
