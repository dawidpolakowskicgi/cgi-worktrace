#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseEntries, weekStartForDate, weekStartForIsoWeek, normalizeLogText } = require('../desktop/tavri-core.cjs');
const source = path.resolve(process.argv[2] || path.join(os.homedir(), 'Documents', 'worktrace'));
const destination = path.resolve(process.argv[3] || path.join(os.homedir(), 'Documents', 'tavri'));
const apply = process.argv.includes('--apply');
const validName = /^(?:\d{4}-\d{2}-\d{2}|\d{4}-W\d{2})\.log$/;

if (source === destination) throw new Error('Source and destination must be different folders.');
const names = (await fs.readdir(source)).filter(name => validName.test(name)).sort((a, b) => {
  const canonical = name => /^\d{4}-\d{2}-\d{2}\.log$/.test(name) ? 0 : 1;
  return canonical(a) - canonical(b) || a.localeCompare(b);
});
if (!names.length) throw new Error(`No weekly logs found in ${source}`);

const groups = new Map();
let sourceEntries = 0;
let movedEntries = 0;
for (const name of names) {
  const contents = await fs.readFile(path.join(source, name), 'utf8');
  const entries = parseEntries(contents);
  const expected = name.includes('-W') ? weekStartForIsoWeek(name.slice(0, -4)) : name.slice(0, -4);
  for (const entry of entries) {
    if (!entry.valid) throw new Error(`Unrecognized line in ${name}: ${entry.line}`);
    const week = weekStartForDate(entry.date);
    if (week !== expected) movedEntries += 1;
    const group = groups.get(week) || [];
    group.push({ line: entry.line, date: entry.date, time: entry.time, source: name });
    groups.set(week, group);
    sourceEntries += 1;
  }
}

const output = new Map();
let duplicates = 0;
for (const [week, rows] of groups) {
  const seen = new Map();
  const unique = [];
  for (const row of rows) {
    const old = seen.get(row.line);
    // Preserve repeated activities within one file; remove copies from a second file.
    if (old && old !== row.source) { duplicates += 1; continue; }
    if (!old) seen.set(row.line, row.source);
    unique.push(row);
  }
  unique.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  output.set(`${week}.log`, normalizeLogText(unique.map(row => row.line).join('\n')));
}

const existing = await fs.readdir(destination).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error));
const collisions = existing.filter(name => output.has(name));
if (collisions.length) throw new Error(`Destination already has these weeks: ${collisions.join(', ')}. No files were changed.`);

const result = { source, destination, sourceFiles: names.length, sourceEntries, duplicateCopies: duplicates, movedEntries, destinationFiles: output.size, destinationEntries: sourceEntries - duplicates, applied: apply };
if (apply) {
  await fs.mkdir(destination, { recursive: true });
  const manifest = { version: 1, migratedAt: new Date().toISOString(), ...result, sourceSha256: {} };
  for (const name of names) manifest.sourceSha256[name] = crypto.createHash('sha256').update(await fs.readFile(path.join(source, name))).digest('hex');
  for (const [name, contents] of output) {
    const handle = await fs.open(path.join(destination, name), 'wx', 0o600);
    try { await handle.writeFile(contents, 'utf8'); } finally { await handle.close(); }
  }
  await fs.writeFile(path.join(destination, '.tavri-migration.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
console.log(JSON.stringify(result, null, 2));
