#!/usr/bin/env node
// The Storyboard tab's supply line. push-panels queues one board document per manifest panel,
// with a thumbnail only when the image is on disk; board-sync push turns them into writes
// (set for a placeholder, update for a delivery); land recognises a sample approval and a
// generate request from the board; pull --gate sample writes the sample approval that the
// generation preflight and the spend guard read, carrying the batch ceiling.
//   node scripts/test/panels.e2e.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const S = n => path.join(ROOT, 'scripts', n);
const env = { ...process.env };
delete env.CREATIVE_STUDIO_ROOT;
const run = (script, args, cwd) => spawnSync(process.execPath, [S(script), ...args], { cwd, encoding: 'utf8', env, maxBuffer: 16 * 1024 * 1024 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'od-panels-'));
try {
  assert.strictEqual(run('scaffold-client.js', ['htf', 'HTF'], tmp).status, 0);
  const made = run('scaffold-job.js', ['htf', 'night-shift', 'HTF Night Shift'], tmp);
  const jobId = (made.stdout.match(/^job-id:\s*(\S+)$/m) || [])[1];
  const dir = path.join(tmp, 'workspaces', 'htf', 'jobs', jobId);
  const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };

  // No manifest: refuses.
  let r = run('push-panels.js', ['htf', jobId], tmp);
  assert.strictEqual(r.status, 3, 'no manifest is a 3: ' + r.stdout + r.stderr);

  write('storyboard/v1/panels.md', '| Panel | Scene | Frame |\n|---|---|---|\n| P01 | 1 | wide |\n| P02 | 1 | insert |\n');
  const manifest = { schemaVersion: '1.0', style: 'sketches', sample: 'P01', items: [
    { panel: 'P01', scene: 'E01-S1', storyOrder: 1, kind: 'image', sample: true, status: 'pending', file: 'storyboard/v1/P01.png', credits: 1, prompt: 'Style preamble. Panel P01 (E01-S1): Subject: a queue outside the outlet, Ezra at the back. Motion: still.' },
    { panel: 'P02', scene: 'E01-S1', storyOrder: 2, kind: 'image', status: 'pending', file: 'storyboard/v1/P02.png', credits: 1, prompt: 'Subject: four phones raised. Motion: none.' }] };
  write('storyboard/v1/generation-manifest.json', JSON.stringify(manifest));

  // Placeholders first: two set writes, no thumbnails, captions from the Subject sentence.
  r = run('push-panels.js', ['htf', jobId, '--json'], tmp);
  assert.strictEqual(r.status, 0, 'push-panels queues: ' + r.stderr);
  assert.deepStrictEqual(JSON.parse(r.stdout.trim().split('\n').pop()).withThumb, 0);
  r = run('board-sync.js', ['push', 'htf', jobId, '--json'], tmp);
  assert.strictEqual(r.status, 0, 'push --json: ' + r.stderr);
  let out = JSON.parse(r.stdout);
  let writes = [].concat(...out.batches).filter(w => /\/panels$/.test(w.collection));
  assert.strictEqual(writes.length, 2, 'two panel writes');
  assert.ok(writes.every(w => w.op === 'set'), 'placeholders are set');
  assert.strictEqual(writes[0].doc_id, 'P01');
  assert.strictEqual(writes[0].data.sample, true);
  assert.strictEqual(writes[0].data.caption, 'a queue outside the outlet, Ezra at the back.');
  assert.ok(!writes[0].data.thumb, 'no thumbnail without a file');
  assert.strictEqual(run('board-sync.js', ['push', 'htf', jobId, '--ack'], tmp).status, 0);
  console.log('ok   push-panels queues a placeholder per manifest panel and push sets them');

  // A delivery: a real image lands, the panel is re-pushed as an update with a JPEG data URI.
  const py = spawnSync('python', ['-c', 'from PIL import Image; Image.new("RGB",(540,960),(200,200,200)).save(r"' + path.join(dir, 'storyboard', 'v1', 'P01.png').replace(/\\/g, '\\\\') + '")'], { encoding: 'utf8' });
  assert.strictEqual(py.status, 0, 'fixture image: ' + py.stderr);
  r = run('push-panels.js', ['htf', jobId, '--only', 'P01', '--json'], tmp);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(JSON.parse(r.stdout.trim().split('\n').pop()).withThumb, 1);
  r = run('board-sync.js', ['push', 'htf', jobId, '--json'], tmp);
  out = JSON.parse(r.stdout);
  writes = [].concat(...out.batches).filter(w => /\/panels$/.test(w.collection));
  assert.strictEqual(writes.length, 1);
  assert.strictEqual(writes[0].op, 'update', 'a delivery updates so approvedBy survives');
  assert.match(writes[0].data.thumb, /^data:image\/jpeg;base64,/);
  assert.ok(writes[0].data.thumb.length < 120000, 'thumbnail stays small: ' + writes[0].data.thumb.length);
  assert.ok(out.pins.some(p => p.doc_id === 'P01'), 'the update is pinned');
  assert.strictEqual(run('board-sync.js', ['push', 'htf', jobId, '--ack'], tmp).status, 0);
  // A tiny file is refused by the thumbnail rule and pushed without a thumbnail, with a warning.
  spawnSync('python', ['-c', 'from PIL import Image; Image.new("RGB",(100,180)).save(r"' + path.join(dir, 'storyboard', 'v1', 'P02.png').replace(/\\/g, '\\\\') + '")'], { encoding: 'utf8' });
  r = run('push-panels.js', ['htf', jobId, '--only', 'P02'], tmp);
  assert.match(r.stderr, /too small/);
  assert.strictEqual(run('board-sync.js', ['push', 'htf', jobId, '--ack'], tmp).status, 0);
  console.log('ok   a landed image travels as a small JPEG data URI and a bad file is refused');

  // The board: sample approved and the batch requested. pull --gate sample binds the approval.
  r = run('board-sync.js', ['pull', 'htf', jobId, '--gate', 'sample'], tmp);
  assert.strictEqual(r.status, 3, 'nothing landed yet is a 3');
  const landing = path.join(tmp, 'landing.json');
  fs.writeFileSync(landing, JSON.stringify([
    { id: 'P01', collection: 'projects/' + jobId + '/panels', data: { sample: true, file: 'storyboard/v1/P01.png', thumb: 'data:image/jpeg;base64,xx', approvedBy: 'creative-director', approvedAt: '2026-09-15T04:00:00Z' } },
    { id: 'g-1', collection: 'projects/' + jobId + '/inbox', data: { type: 'generate', item: 'storyboard', scope: 'batch', panels: ['P02'], credits: 1, status: 'open', from: 'creative-director', createdAt: '2026-09-15T04:01:00Z' } },
  ]));
  r = run('board-sync.js', ['land', 'htf', jobId, landing], tmp);
  assert.strictEqual(r.status, 0, 'land: ' + r.stderr);
  assert.match(r.stdout, /panel P01 approved by creative-director/);
  assert.match(r.stdout, /generate g-1 open/);
  const inbox = JSON.parse(fs.readFileSync(path.join(tmp, '.board', 'inbox.json'), 'utf8'))[jobId];
  assert.ok(!('thumb' in inbox.panels.P01), 'the thumbnail is not copied into the inbox');
  assert.strictEqual(inbox.generate[0].scope, 'batch');
  r = run('board-sync.js', ['pull', 'htf', jobId, '--gate', 'sample'], tmp);
  assert.strictEqual(r.status, 0, 'pull sample: ' + r.stdout + r.stderr);
  assert.match(r.stdout, /Sample P01 landed as an approval; the batch may spend up to 1 credits/);
  const ap = JSON.parse(fs.readFileSync(path.join(dir, 'approvals', 'sample-1.json'), 'utf8'));
  assert.strictEqual(ap.decision, 'approved');
  assert.strictEqual(ap.scope.maxSpendCredits, 1);
  assert.strictEqual(ap.decidedBy, 'creative-director');
  assert.ok(ap.artifacts.some(a => a.path === 'storyboard/v1/P01.png'), 'bound to the sample file');
  r = run('preflight-generation.js', ['htf', jobId, '--json'], tmp);
  assert.strictEqual(JSON.parse(r.stdout).allowed, 'batch', 'the preflight now allows the batch');
  console.log('ok   a sample approval and a generate request land, and pull --gate sample writes the approval the preflight reads');

  console.log('panels verification passed');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
