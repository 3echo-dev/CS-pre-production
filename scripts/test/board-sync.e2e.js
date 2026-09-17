#!/usr/bin/env node
// The bridge to the board. A delivery becomes a version on disk and an item on the board; the
// board's gate record becomes an approval bound to the hashes on disk; and a gate the board
// passed on a version that is not the one on disk is refused, because that is exactly how an
// approved file drifts from the record that approved it.
//   node scripts/test/board-sync.e2e.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
// No board is baked into the plugin any more: a test root names one the way a workspace would.
process.env.CREATIVE_STUDIO_BOARD_URL = process.env.CREATIVE_STUDIO_BOARD_URL || 'https://claude.ai/code/artifact/00000000-0000-4000-8000-000000000000';

const ROOT = path.resolve(__dirname, '..', '..');
const S = n => path.join(ROOT, 'scripts', n);
const env = { ...process.env };
delete env.CREATIVE_STUDIO_ROOT;
const run = (script, args, cwd) => spawnSync(process.execPath, [S(script), ...args], { cwd, encoding: 'utf8', env });
const { hashFile } = require('../hash-artifact.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'od-board-'));
try {
  assert.strictEqual(run('scaffold-client.js', ['htf', 'HTF'], tmp).status, 0);
  const made = run('scaffold-job.js', ['htf', 'night-shift', 'HTF Night Shift'], tmp);
  const jobId = (made.stdout.match(/^job-id:\s*(\S+)$/m) || [])[1];
  const dir = path.join(tmp, 'workspaces', 'htf', 'jobs', jobId);
  const outbox = path.join(tmp, '.board', 'outbox.jsonl');
  const drain = () => fs.existsSync(outbox) ? fs.readFileSync(outbox, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l)) : [];

  // 1. Opening a project queues it and its thirteen items.
  let r = run('board-sync.js', ['open', 'htf', jobId], tmp);
  assert.strictEqual(r.status, 0, r.stderr);
  let q = drain();
  assert.strictEqual(q.filter(x => x.kind === 'project').length, 1);
  assert.strictEqual(q.filter(x => x.kind === 'item').length, 13);
  console.log('ok   open queues the project and thirteen items');

  // 2. A delivery: a version line with a sha256, and an item at draft.
  fs.writeFileSync(path.join(dir, 'script', 'v1.md'), '# NIGHT SHIFT v1\n\n**1. INT. WARD**\nHandover.\n');
  r = run('record-version.js', ['htf', jobId, '--item', 'script', '--n', '1', '--note', 'First draft', '--file', 'script/v1.md', '--seat', 'script-director'], tmp);
  assert.strictEqual(r.status, 0, r.stderr);
  const versions = fs.readFileSync(path.join(dir, 'versions.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.strictEqual(versions.length, 1);
  assert.strictEqual(versions[0].hash, hashFile(path.join(dir, 'script', 'v1.md')).sha256, 'the version carries the file hash');
  q = drain();
  assert.ok(q.some(x => x.kind === 'version' && x.payload.item === 'script' && x.payload.n === 1));
  assert.ok(q.some(x => x.kind === 'item' && x.payload.item === 'script' && x.payload.status === 'draft' && x.payload.version === 1));
  const dup = run('record-version.js', ['htf', jobId, '--item', 'script', '--n', '1', '--file', 'script/v1.md'], tmp);
  assert.strictEqual(dup.status, 1, 'the same version twice is refused');
  console.log('ok   record-version writes the hash and queues the item as a draft, once');

  // A run record, for the board's Output and Prompt tabs.
  fs.writeFileSync(path.join(tmp, 'prompt.txt'), 'You are the Scriptwriter for job ' + jobId + '.');
  r = run('record-run.js', ['htf', jobId, '--item', 'script', '--n', '1', '--seat', 'script-director', '--prompt-file', path.join(tmp, 'prompt.txt'), '--output-file', 'script/v1.md', '--model', 'opus', '--turns', '9'], tmp);
  assert.strictEqual(r.status, 0, r.stderr);
  const runRec = JSON.parse(fs.readFileSync(path.join(dir, 'runs', 'script-v1.json'), 'utf8'));
  assert.ok(runRec.prompt.includes('Scriptwriter') && runRec.output.includes('NIGHT SHIFT'), 'the run keeps the prompt and the output');
  console.log('ok   record-run keeps the spawn prompt and the output for the board');

  // 3. push --json folds the outbox into batches with the right collections and no approval.
  // An outbox line that tries to approve is dropped with a warning, never sent.
  fs.appendFileSync(outbox, JSON.stringify({ kind: 'item', payload: { key: jobId, item: 'script', status: 'approved' }, at: new Date().toISOString() }) + '\n');
  r = run('board-sync.js', ['push', 'htf', jobId, '--json'], tmp);
  assert.strictEqual(r.status, 0, r.stderr);
  const pushed = JSON.parse(r.stdout);
  assert.ok(pushed.url.startsWith('https://claude.ai/code/artifact/'), 'the batch names the board');
  const writes = pushed.batches.flat();
  assert.ok(writes.every(w => w.collection === 'projects' || w.collection.startsWith('projects/' + jobId + '/')), 'every write is under this project');
  assert.ok(writes.some(w => w.collection.endsWith('/items') && w.doc_id === 'script' && w.data.status === 'draft' && w.data.version === 1));
  assert.ok(writes.some(w => w.collection.endsWith('/versions') && w.doc_id === 'v-script-1'));
  assert.ok(writes.some(w => w.collection.endsWith('/runs') && w.doc_id === 'script-v1' && w.data.prompt));
  assert.ok(!writes.some(w => w.data && (w.data.status === 'approved' || w.data.status === 'na')), 'the pipeline never sends approved or na');
  assert.ok(pushed.warnings.some(w => /approved/.test(w)), 'and says that it dropped the attempt');
  assert.ok(pushed.batches.every(b => b.length <= 50));
  r = run('board-sync.js', ['push', 'htf', jobId, '--ack'], tmp);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(drain().length, 0, 'ack clears the delivered records');
  console.log('ok   push folds the outbox into batches under the project and never sends an approval');

  // 4. A gate record from the board, matching the versions on disk, lands as an approval.
  const rest = { storyboard: 'storyboard', shot_list: 'shot-list.csv', budget_sheet: 'budget.xlsx', timeline: 'timeline.xlsx', scraper: 'references/board.md' };
  fs.mkdirSync(path.join(dir, 'storyboard', 'v1'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'storyboard', 'v1', 'panels.md'), '| Panel | Scene |\n|---|---|\n| P01 | 1 |\n');
  fs.writeFileSync(path.join(dir, 'shot-list.csv'), 'shot_id,label,scene,panel\nS001,1,1,P01\n');
  fs.writeFileSync(path.join(dir, 'budget.xlsx'), 'xlsx bytes');
  fs.writeFileSync(path.join(dir, 'timeline.xlsx'), 'xlsx bytes');
  fs.writeFileSync(path.join(dir, 'references', 'board.md'), '| # | url |\n|---|---|\n| 1 | https://vimeo.com/1 |\n');
  for (const [item, file] of Object.entries(rest)) {
    const rr = run('record-version.js', ['htf', jobId, '--item', item, '--n', '1', '--file', item === 'storyboard' ? 'storyboard/v1' : file], tmp);
    assert.strictEqual(rr.status, 0, item + ': ' + rr.stderr);
  }
  const record = { collection: 'projects/' + jobId + '/gates', id: 'A', data: { status: 'passed', decidedBy: 'creative-director', decidedAt: '2026-09-13 18:00 +08:00',
    items: { script: { status: 'approved', version: 1 }, storyboard: { status: 'approved', version: 1 }, shot_list: { status: 'approved', version: 1 },
      budget_sheet: { status: 'approved', version: 1 }, timeline: { status: 'approved', version: 1 }, scraper: { status: 'approved', version: 1 } } } };
  fs.writeFileSync(path.join(tmp, 'gate-a.json'), JSON.stringify(record));
  // Move the job to the gate first, so the approval's state move is legal.
  for (const st of ['PLANNED', 'BRIEF_READY', 'REFERENCES_READY', 'SCRIPT_DRAFTED', 'STORYBOARD_DRAFTED', 'SHOT_LIST_DRAFTED', 'PLANNING_DRAFTED', 'AWAITING_GATE_A']) {
    const m = run('set-state.js', ['htf', jobId, st, '--by', 'test'], tmp);
    assert.strictEqual(m.status, 0, st + ': ' + m.stderr);
  }
  r = run('board-sync.js', ['land', 'htf', jobId, path.join(tmp, 'gate-a.json')], tmp);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /gate A passed/);
  r = run('board-sync.js', ['pull', 'htf', jobId, '--gate', 'A'], tmp);
  assert.strictEqual(r.status, 0, 'pull lands the approval: ' + r.stdout + r.stderr);
  const ap = JSON.parse(fs.readFileSync(path.join(dir, 'approvals', 'A-1.json'), 'utf8'));
  assert.strictEqual(ap.decision, 'approved');
  assert.strictEqual(ap.decidedBy, 'creative-director');
  assert.strictEqual(ap.channel, 'board');
  assert.strictEqual(ap.decidedAt, '2026-09-13 18:00 +08:00', 'the board\'s own time is kept');
  const byPath = Object.fromEntries(ap.artifacts.map(a => [a.path, a.sha256]));
  assert.strictEqual(byPath['script/v1.md'], hashFile(path.join(dir, 'script', 'v1.md')).sha256, 'the approval binds the file hash');
  assert.strictEqual(ap.artifacts.length, 6, 'one artifact per item the gate covers');
  const status = fs.readFileSync(path.join(dir, 'status.md'), 'utf8');
  assert.match(status, /\*\*Current state:\*\* `GATE_A_PASSED`/, 'the approval moves the state');
  const chk = run('check-approval.js', ['htf', jobId, 'A'], tmp);
  assert.strictEqual(chk.status, 0, 'check-approval agrees: ' + chk.stderr);
  console.log('ok   a landed gate record becomes an approval bound to the hashes on disk');

  // 5. The board approved a version that is not the one on disk: refused.
  fs.writeFileSync(path.join(dir, 'script', 'v2.md'), '# NIGHT SHIFT v2\n');
  assert.strictEqual(run('record-version.js', ['htf', jobId, '--item', 'script', '--n', '2', '--file', 'script/v2.md'], tmp).status, 0);
  r = run('board-sync.js', ['pull', 'htf', jobId, '--gate', 'A'], tmp);
  assert.strictEqual(r.status, 1, 'a stale version is refused: ' + r.stdout);
  assert.match(r.stderr, /STALE: script: the board approved v1, disk is at v2/);
  assert.ok(!fs.existsSync(path.join(dir, 'approvals', 'A-2.json')), 'and nothing is recorded');
  console.log('ok   a gate passed on a stale version is refused and records nothing');

  // 6. Registers land on disk from a board read; the registrar never types them.
  const regs = { collection: 'projects/' + jobId + '/talents', documents: [{ id: 't1', data: { name: 'Nurse', picture: 'x', age: '34', availability: 'weekdays', cost: '', loading: '' } }] };
  fs.writeFileSync(path.join(tmp, 'talents.json'), JSON.stringify(regs));
  r = run('board-sync.js', ['land', 'htf', jobId, path.join(tmp, 'talents.json')], tmp);
  assert.strictEqual(r.status, 0, r.stderr);
  const landed = JSON.parse(fs.readFileSync(path.join(dir, 'registers', 'talents.json'), 'utf8'));
  assert.strictEqual(landed.rows.length, 1);
  assert.strictEqual(landed.rows[0].name, 'Nurse');
  console.log('ok   a register read from the board lands as registers/talents.json');

  console.log('board-sync verification passed');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
