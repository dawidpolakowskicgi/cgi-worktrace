const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");

const revision = text => createHash("sha256").update(text).digest("hex");

// Shared with tavri.sh. A crashed writer leaves a lock for manual recovery;
// never steal a lock from a slow writer on a network or external drive.
async function withWriteLock(logDir, action) {
  await fs.mkdir(logDir, { recursive: true });
  const lock = path.join(logDir, ".tavri-write-lock");
  const deadline = Date.now() + 5000;
  while (true) {
    try { await fs.mkdir(lock); break; }
    catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (Date.now() >= deadline) throw new Error("The log folder is busy. Retry shortly. If Tavri or the CLI crashed, close both and remove .tavri-write-lock from the log folder.");
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  try { return await action(); }
  finally { await fs.rmdir(lock); }
}

async function atomicWrite(filePath, text) {
  const temp = `${filePath}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(temp, "wx", 0o600);
    await handle.writeFile(text, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temp, filePath);
  } finally {
    if (handle) await handle.close();
    await fs.rm(temp, { force: true });
  }
}

module.exports = { revision, withWriteLock, atomicWrite };
