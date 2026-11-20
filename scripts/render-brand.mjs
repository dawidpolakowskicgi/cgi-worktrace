import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromeBinaryPath } from "./chrome.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "tavri-brand-"));
try {
  await promisify(execFile)(await chromeBinaryPath(), [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--hide-scrollbars", "--force-device-scale-factor=1", "--window-size=1024,1024",
    "--default-background-color=00000000", `--user-data-dir=${temp}`,
    `--screenshot=${path.join(root, "assets", "tavri-icon.png")}`,
    pathToFileURL(path.join(root, "assets", "tavri-icon.svg")).href,
  ], { timeout: 30000 });
  console.log("Rendered assets/tavri-icon.png from the Tavri vector mark.");
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
