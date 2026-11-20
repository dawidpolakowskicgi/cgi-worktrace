# Changelog

All notable changes to `Tavri` will be documented in this file.

## Unreleased

## 0.5.0 - 2026-11-20

- Give Today and Activity clearly different visual contexts: Today is the live plan and focus workspace, while Activity is the durable weekly record used for Friday timesheets, reports and exports
- Add an explicit Planned → In progress → Done focus flow; starting work automatically creates one linked In progress journal entry and completing the outcome updates that same entry to Done without duplicates
- Show In progress and Done status chips in Activity, keep automatic status markers out of the linked-session count, and preserve compatibility with existing focus plans and readable weekly log files
- Add localized workflow labels and explanations in English, Polish, German, Spanish, French and Portuguese
- Cover status round-tripping, idempotent log updates and the complete native Electron workflow with automated tests

## 0.4.0 - 2026-11-02

- Add six interface languages (English, Polish, German, Spanish, French and Portuguese), a flag switcher in the top bar, a Settings selector, localized dates and widget controls, and a small CGI mark
- Add a safe legacy-log migration command that consolidates ISO-week aliases into Monday-named files, preserves source files, records hashes and keeps entries without a time unchanged; migrate the owner's 53 unique entries into the Tavri folder

- Add a three-outcome day plan, stable task IDs across sessions, next steps and carry-forward actions; include the focus plan in personal backups
- Add a compact always-on-top focus widget with timer controls and a return-to-app action
- Apply a selected multiweek date range to the activity list, Insights, clipboard, current-view exports and report dates
- Verify the packaged app's key files, icon and license; require the correct sender for every IPC channel and support opt-in Developer ID signing and Keychain-based macOS notarization

- Add a Time on tasks view in Insights with grouped task bars for saved durations and the current timer, including untimed entries
- Refresh the welcome tips and add an actionable four-step focus workflow to the in-app guide

- Add a persistent activity timer with start, pause, resume, use-time and discard controls; save measured time directly with an activity and show timer status across views

- Add checksum-verified personal journal backups, restore previews and automatic pre-restore recovery copies
- Move activities across weekly files through a recoverable transaction shared with the CLI write lock
- Add a seven-day review, archive-wide search and searchable desktop change history with real operation timestamps
- Preview team imports from files, folders or ZIP archives; normalize duplicates, remove individual imported weeks and undo the last team change
- Add report presets, quick periods, prior-period comparisons, tabular data, clipboard summaries and CSV exports
- Add an opt-in release check and local standalone macOS app/DMG packaging; audit main views with axe-core

- Add 12 guided activity templates with distinct prompts and live descriptions for delivery, collaboration, product work and operations; preserve the current draft and metadata when applying one

- Add twenty original appearances inspired by films, books, series and music, each with a distinct line symbol in the gallery and app header; expand the picker to 38 styles with category and text filters

- Let the date timeline fill the screen, with an in-view exit control and Escape to return to the same selected activity

- Add a startup welcome with rotating tips, a persistent "Don't show this on startup" choice and a reusable in-app guide covering activities, views, filters, reports, exports, team imports, data safety and shortcuts

- Add ten original CSS appearances inspired by Rebel and Mandalorian command decks, Middle-earth, Hogwarts, Dune, Winterfell, Fallout and cyberpunk interfaces; organize 18 choices in five families
- Verify every themed palette, navigation labels, 125% layouts and saved selection in production Electron

- Keep using populated legacy log folders when the new Tavri folder exists but is empty, and show the latest logged week when the current week has no activities

- Redesign Timeline as a continuous date axis with automatic first/last dates, one circle per log and short notes alternating above and below the line

- Add a local Admin / PO team workspace that imports colleagues' weekly Tavri logs as isolated snapshots, with replacement by week and person removal
- Add configurable personal/team reports by date, person, metric and chart; preview activity, project and people breakdowns and export a visual PDF
- Show duration coverage and empty time periods in reports; check source revisions before exporting and validate imported weekly files

- Replace the default orange accent with red and offer persistent dark-yellow and white choices for System, Light and Dark; recolor the native icon and header mark

- Add custom date range export and clipboard copy across archived weeks and years, with a matching count preview, search/project filters and revision checks

- Refresh visible activity and annual history after external log changes, preserving active drafts and warning about stale edits

- Refine LCARS with connected rails and colored navigation; refine Holoterminal with restrained frames and clearer panel hierarchy
- Unify navigation icons, group theme previews by family and show Settings week controls only with the advanced editor
- Prevent transient low contrast during theme changes and check rendered navigation contrast
- Document primary interface references and design decisions

- Add three high-contrast palettes (Dark, Light, Amber), with strong focus indicators and patterned contribution levels
- Add Star Trek · LCARS and Star Wars · Holoterminal appearances, an eight-choice preview gallery and persistent theme selection
- Validate representative palette contrast, all display modes at 125% zoom and theme recovery after restart

- Add persistent List / Timeline / Contributions display tabs with keyboard navigation
- Add a GitHub-style annual activity calendar with per-day history
- Load archived years on demand with source-file revisions; retain filtered day exports and safe row actions across weekly files

- Redesign the desktop around Today, Activity, Insights and Settings, with a compact quick-entry form, grouped timeline and structured metadata
- Add search, project/date filters, week navigation, project suggestions, keyboard shortcuts, System appearance and timeline density
- Preserve new-entry and raw-file drafts; add Save/Cancel, deletion confirmation and revision-checked Undo
- Correct archive saves, Today row actions, duplicate-row targeting and filtered exports; include time and structured columns in CSV/PDF
- Coordinate desktop and CLI writes with a shared lock; add revision conflict checks, atomic replacement and a previous-version backup
- Validate calendar dates, clock times and durations; protect cross-week edits with a recoverable transaction
- Extract shared entry/filter logic and file-write primitives; type the preload API and restrict renderer navigation and content sources
- Add production Electron integration tests and pull-request CI coverage

- Rebrand the local project, CLI, Electron app, starter and packaging as Tavri
- Add a coral/graphite vector identity and light/dark desktop themes with a wider activity field and stable scrolling
- Retain legacy log-directory, environment and local launcher compatibility
- Replace the separate screenshot mockup with the production renderer and deterministic fixtures
- Fix parsing of entry metadata used by edit fields and activity summaries
- Add a development audit, roadmap and brand guide


## 0.3.0 - 2026-07-24

- Renamed the public project to `CGI Worktrace` and updated repo, install, and release links
- Refined the Electron desktop UI and refreshed the README screenshot
- Added row actions for clone, edit, delete, and copy to clipboard
- Added date, time, task project, and reference fields for desktop log entries
- Added open-source project docs and improved release packaging

## 0.2.0

- Initial public open-source setup
- MIT licensing
- Desktop app scaffold and weekly log workflow
