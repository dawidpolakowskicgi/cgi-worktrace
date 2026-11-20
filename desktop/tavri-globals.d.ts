export {};

declare global { interface Window { tavri: TavriDesktopApi; tavriWidget: { command(action: "open" | "hide" | "pause" | "resume" | "finish"): Promise<boolean>; onState(callback: (state: WidgetState) => void): void }; } }
interface EntryTarget { id: string; line: string; }
interface Entry extends EntryTarget { date: string; time: string; message: string; valid: boolean; }
interface HistoryEntry extends Entry { sourceWeek: string; sourceRevision: string; }
interface ActivityYear { year: number; revision: string; revisions: Record<string, string>; entries: HistoryEntry[]; }
interface ActivityRange { start: string; end: string; revision: string; entries: HistoryEntry[]; }
interface Week { weekStart: string; filePath: string; revision: string; text: string; entries: Entry[]; }
interface DesktopState { config: { logDir: string; currentFile: string }; availableWeeks: string[]; today: { date: string; weekStart: string; revision: string; entries: Entry[] }; week: Week; undoToken?: string; }
interface EntryFilters { query?: string; project?: string; start?: string; end?: string; }
interface ExportOptions { year?: number; yearRevision?: string; ref?: string; revision?: string; rangeStart?: string; rangeEnd?: string; rangeRevision?: string; filters: EntryFilters; }
interface ExportResult { canceled: boolean; format: string; filePath?: string; mimeType?: string; }
interface ChangeEvent { id: string; at: string; kind: string; week?: string; before?: string; after?: string; weeks?: number; }
interface TeamMember { id: string; name: string; importedAt: string; weeks: number; weekRefs: string[]; activities: number; minutes: number; timed: number; }
interface TeamState { members: TeamMember[]; history: { at: string; kind: string; name?: string; weeks?: number }[]; canUndo: boolean; activities: number; minutes: number; }
interface ReportOptions { start: string; end: string; source: "personal" | "team"; personId: string; metric: "activities" | "minutes"; charts: { trend: boolean; projects: boolean; people: boolean }; compare?: boolean; }
interface ReportRow { label: string; activities: number; minutes: number; }
interface ReportSummary { activities: number; minutes: number; timed: number; people: number; projects: number; activeDays: number; }
interface ReportPreview { options: ReportOptions; revision: string; interval: string; scope: string; summary: ReportSummary; trend: ReportRow[]; projects: ReportRow[]; people: ReportRow[]; comparison: { start: string; end: string; summary: ReportSummary } | null; }
interface FocusTask { id: string; title: string; project: string; reference: string; nextStep: string; plannedFor: string; status: "open" | "done"; createdAt: string; updatedAt: string; }
interface FocusState { version: 1; tasks: FocusTask[]; revision: string; }
interface WidgetState { title: string; project: string; elapsedMs: number; runningSince: number | null; active: boolean; }
interface TavriDesktopApi {
  getFocus(): Promise<FocusState>;
  createFocusTask(input: Pick<FocusTask, "title" | "plannedFor"> & Partial<Pick<FocusTask, "project" | "reference" | "nextStep">>, revision: string): Promise<FocusState>;
  updateFocusTask(id: string, input: Partial<Pick<FocusTask, "title" | "project" | "reference" | "nextStep" | "plannedFor" | "status">>, revision: string): Promise<FocusState>;
  showWidget(): Promise<boolean>;
  updateWidget(state: WidgetState): Promise<boolean>;
  onWidgetCommand(callback: (command: "pause" | "resume" | "finish") => void): void;
  getTeamState(): Promise<TeamState>;
  importTeamFiles(name: string, kind: "files" | "folder" | "zip"): Promise<{ canceled: boolean; token?: string; preview?: Record<string, unknown> }>;
  commitTeamImport(token: string): Promise<TeamState>;
  removeTeamMember(id: string): Promise<TeamState>;
  removeTeamWeek(id: string, ref: string): Promise<TeamState>;
  undoTeamChange(): Promise<TeamState>;
  getReportPreview(options: ReportOptions): Promise<ReportPreview>;
  exportReport(options: ReportOptions, revision: string, format: "pdf" | "csv"): Promise<{ canceled: boolean; filePath?: string }>;
  searchArchive(options: EntryFilters): Promise<{ total: number; limit: number; entries: HistoryEntry[] }>;
  getRecentChanges(): Promise<ChangeEvent[]>;
  createBackup(): Promise<{ canceled: boolean; filePath?: string; weeks?: number }>;
  chooseBackup(): Promise<{ canceled: boolean; token?: string; filePath?: string; preview?: { weeks: number; activities: number; changed: number; added: number; focusTasks: number | null; createdAt: string } }>;
  restoreBackup(token: string): Promise<{ weeks: number; recoveryFile: string; state: DesktopState }>;
  checkForUpdates(): Promise<{ current: string; latest: string; updateAvailable: boolean; releaseUrl: string }>;
  openUpdatePage(): Promise<boolean>;
  addEntry(message: string, time?: string, date?: string): Promise<DesktopState>;
  cloneEntry(ref: string, target: EntryTarget, revision: string): Promise<DesktopState>;
  closeWindow(): Promise<void>;
  copyText(text: string): Promise<boolean>;
  copyRange(options: ExportOptions): Promise<number>;
  deleteEntry(ref: string, target: EntryTarget, revision: string): Promise<DesktopState>;
  undoDelete(token: string): Promise<DesktopState>;
  editEntry(ref: string, target: EntryTarget, date: string, time: string, message: string, revision: string): Promise<DesktopState>;
  exportWeek(format: "txt" | "csv" | "pdf", options: ExportOptions): Promise<ExportResult>;
  getYear(year: number): Promise<ActivityYear>;
  getRange(start: string, end: string): Promise<ActivityRange>;
  getState(ref?: string): Promise<DesktopState>;
  maximizeWindow(): Promise<void>;
  minimizeWindow(): Promise<void>;
  openLogDir(): Promise<string>;
  saveWeek(ref: string, text: string, revision: string): Promise<DesktopState>;
}
