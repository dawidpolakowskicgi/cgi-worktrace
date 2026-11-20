import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const run = promisify(execFile);
const script = path.resolve('scripts/migrate-personal-logs.mjs');

test('migration joins legacy week aliases, preserves repeated real entries, and leaves source intact', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tavri-migration-'));
  const source = path.join(root, 'old'), destination = path.join(root, 'new');
  await fs.mkdir(source);
  const monday = '2026-03-23 Work\n2026-03-23 Work\n2026-03-26 11:20 Review [spent: 30m]\n';
  await fs.writeFile(path.join(source, '2026-03-23.log'), monday);
  await fs.writeFile(path.join(source, '2026-W13.log'), monday);
  await fs.writeFile(path.join(source, '2026-04-20.log'), '2026-04-21 Release\n2026-04-27 09:00 Next week\n');
  try {
    const dry = JSON.parse((await run(process.execPath, [script, source, destination])).stdout);
    assert.equal(dry.applied, false);
    assert.equal(dry.destinationEntries, 5);
    assert.equal(dry.movedEntries, 1);
    await assert.rejects(fs.stat(destination), { code: 'ENOENT' });
    const applied = JSON.parse((await run(process.execPath, [script, source, destination, '--apply'])).stdout);
    assert.equal(applied.destinationFiles, 3);
    assert.equal((await fs.readFile(path.join(destination, '2026-03-23.log'), 'utf8')).match(/2026-03-23 Work/g).length, 2);
    assert.equal(await fs.readFile(path.join(destination, '2026-04-27.log'), 'utf8'), '2026-04-27 09:00 Next week\n');
    assert.equal(await fs.readFile(path.join(source, '2026-W13.log'), 'utf8'), monday);
    await assert.rejects(run(process.execPath, [script, source, destination, '--apply']), /Destination already has these weeks/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
