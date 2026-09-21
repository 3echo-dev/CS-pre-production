#!/usr/bin/env node
// A person opens a project on the slate: the card has a board id and no folder. Once the job is
// scaffolded from its fields, `adopt` points that card at the job and hides it, so the person
// sees one project, not two.
//   node scripts/test/adopt.smoke.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
process.env.CREATIVE_STUDIO_BOARD_URL = process.env.CREATIVE_STUDIO_BOARD_URL || 'https://claude.ai/code/artifact/00000000-0000-4000-8000-000000000000';
const ROOT = path.resolve(__dirname, '..', '..');
const S = n => path.join(ROOT, 'scripts', n);
const env = { ...process.env }; delete env.CREATIVE_STUDIO_ROOT;
const run = (script, args, cwd) => spawnSync(process.execPath, [S(script), ...args], { cwd, encoding: 'utf8', env });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'od-adopt-'));
try {
  assert.strictEqual(run('scaffold-client.js', ['htf', 'HTF'], tmp).status, 0);
  const made = run('scaffold-job.js', ['htf', 'night-shift', 'HTF Night Shift'], tmp);
  const jobId = (made.stdout.match(/^job-id:\s*(\S+)$/m) || [])[1];
  assert.ok(jobId, made.stdout + made.stderr);
  assert.strictEqual(run('board-sync.js', ['open', 'htf', jobId], tmp).status, 0);
  let r = run('board-sync.js', ['adopt', 'htf', jobId], tmp);
  assert.strictEqual(r.status, 2, 'adopt without --from is a usage error: ' + r.stdout + r.stderr);
  r = run('board-sync.js', ['adopt', 'htf', jobId, '--from', 'htf-26-ab12'], tmp);
  assert.strictEqual(r.status, 0, r.stderr);
  r = run('board-sync.js', ['push', 'htf', jobId, '--json'], tmp);
  assert.strictEqual(r.status, 0, r.stderr);
  const writes = JSON.parse(r.stdout).batches.flat();
  const moved = writes.find(w => w.collection === 'projects' && w.doc_id === 'htf-26-ab12');
  assert.ok(moved, 'the slate card is written');
  assert.strictEqual(moved.op, 'update', 'as an update, so the person\'s fields survive');
  assert.strictEqual(moved.data.status, 'moved');
  assert.strictEqual(moved.data.movedTo, jobId);
  assert.ok(writes.some(w => w.collection === 'projects' && w.doc_id === jobId && w.data.status === 'intake'), 'and the job has its own page');
  console.log('ok   adopt points the slate card a person opened at the scaffolded job, and push carries it');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}