const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { atomicWrite, withWriteLock, revision } = require("./storage.cjs");
const { isDateLiteral } = require("./entry-domain.cjs");

const MAX_TASKS = 500;
const empty = () => ({ version: 1, tasks: [] });
const clean = (value, max) => String(value || "").trim().slice(0, max);

function validateTask(task) {
  return task && typeof task.id === "string" && /^[a-f0-9-]{36}$/.test(task.id)
    && typeof task.title === "string" && task.title.length > 0 && task.title.length <= 200
    && typeof task.project === "string" && task.project.length <= 120
    && typeof task.reference === "string" && task.reference.length <= 240
    && typeof task.nextStep === "string" && task.nextStep.length <= 500
    && isDateLiteral(task.plannedFor) && ["open", "done"].includes(task.status);
}

class FocusStore {
  constructor(logDir) {
    this.logDir = logDir;
    this.filePath = path.join(logDir, ".tavri-focus.json");
  }

  async read() {
    let raw;
    try { raw = await fs.readFile(this.filePath, "utf8"); }
    catch (error) { if (error.code === "ENOENT") return { ...empty(), revision: revision("") }; throw error; }
    let data;
    try { data = JSON.parse(raw); } catch { throw new Error("The focus plan is damaged. Restore .tavri-focus.json from a backup before editing it."); }
    if (data.version !== 1 || !Array.isArray(data.tasks) || data.tasks.length > MAX_TASKS || !data.tasks.every(validateTask)) {
      throw new Error("The focus plan has an unsupported format. Restore .tavri-focus.json from a backup before editing it.");
    }
    return { ...data, revision: revision(raw) };
  }

  async change(expectedRevision, update) {
    if (typeof expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(expectedRevision)) throw new Error("Refresh the focus plan before changing it.");
    return withWriteLock(this.logDir, async () => {
      const current = await this.read();
      if (current.revision !== expectedRevision) throw new Error("The focus plan changed. Refresh and try again.");
      const data = { version: 1, tasks: current.tasks.map(task => ({ ...task })) };
      update(data.tasks);
      if (data.tasks.length > MAX_TASKS) throw new Error("The focus plan is full. Complete or remove old tasks first.");
      await fs.mkdir(path.join(this.logDir, ".backups"), { recursive: true });
      if (current.revision !== revision("")) {
        const old = await fs.readFile(this.filePath, "utf8");
        await atomicWrite(path.join(this.logDir, ".backups", "tavri-focus-previous.json"), old);
      }
      await atomicWrite(this.filePath, JSON.stringify(data, null, 2) + "\n");
      return this.read();
    });
  }

  async create(input, expectedRevision) {
    const title = clean(input?.title, 200);
    const plannedFor = clean(input?.plannedFor, 10);
    if (!title || /[\r\n]/.test(title)) throw new Error("Write one clear outcome for the task.");
    if (!isDateLiteral(plannedFor)) throw new Error("Choose a valid planning date.");
    const project = clean(input?.project, 120), reference = clean(input?.reference, 240), nextStep = clean(input?.nextStep, 500);
    if ([project, reference, nextStep].some(value => /[\r\n]/.test(value)) || [project, reference].some(value => /[\[\]]/.test(value))) throw new Error("Task details must stay on one line and cannot contain square brackets.");
    const id = randomUUID(), now = new Date().toISOString();
    return this.change(expectedRevision, tasks => {
      if (tasks.filter(task => task.plannedFor === plannedFor && task.status === "open").length >= 3) throw new Error("Keep up to three open outcomes per day. Finish or move one first.");
      tasks.push({ id, title, project, reference, nextStep, plannedFor, status: "open", createdAt: now, updatedAt: now });
    });
  }

  async update(id, input, expectedRevision) {
    return this.change(expectedRevision, tasks => {
      const task = tasks.find(item => item.id === id);
      if (!task) throw new Error("This task no longer exists. Refresh the focus plan.");
      const plannedFor = input?.plannedFor === undefined ? task.plannedFor : clean(input.plannedFor, 10);
      if (!isDateLiteral(plannedFor)) throw new Error("Choose a valid planning date.");
      const status = input?.status === undefined ? task.status : input.status;
      if (!["open", "done"].includes(status)) throw new Error("Choose an open or completed task.");
      if (status === "open" && tasks.some(item => item.id !== id && item.plannedFor === plannedFor && item.status === "open") &&
          tasks.filter(item => item.id !== id && item.plannedFor === plannedFor && item.status === "open").length >= 3) throw new Error("Keep up to three open outcomes per day.");
      const nextStep = input?.nextStep === undefined ? task.nextStep : clean(input.nextStep, 500);
      const title = input?.title === undefined ? task.title : clean(input.title, 200);
      const project = input?.project === undefined ? task.project : clean(input.project, 120);
      const reference = input?.reference === undefined ? task.reference : clean(input.reference, 240);
      if (!title || [title, project, reference, nextStep].some(value => /[\r\n]/.test(value)) || [project, reference].some(value => /[\[\]]/.test(value))) throw new Error("Task details must stay on one line; project and reference cannot contain square brackets.");
      Object.assign(task, { title, project, reference, plannedFor, status, nextStep, updatedAt: new Date().toISOString() });
    });
  }
}

module.exports = { FocusStore, validateTask };
