#!/usr/bin/env node
// The References tab's supply line. push-references turns the scout's board.md into one board
// document per reference plus the per-site outcome on the scraper item; push writes them; land
// reads the choices the person made on the board (refsel) into references/selected.json, the
// only place the scriptwriter takes its references from.
//   node scripts/test/references.e2e.js
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'od-refs-'));
try {
  assert.strictEqual(run('scaffold-client.js', ['htf', 'HTF'], tmp).status, 0);
  const made = run('scaffold-job.js', ['htf', 'night-shift', 'HTF Night Shift'], tmp);
  const jobId = (made.stdout.match(/^job-id:\s*(\S+)$/m) || [])[1];
  const dir = path.join(tmp, 'workspaces', 'htf', 'jobs', jobId);
  const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  fs.writeFileSync(path.join(tmp, 'workspaces', 'htf', 'client', 'sites.md'),
    '# Sites\n\n| Site | URL | Notes |\n|---|---|---|\n| Film-Grab | https://film-grab.com | stills |\n| Vimeo Staff Picks | https://vimeo.com/channels/staffpicks | craft |\n| Shotdeck | https://shotdeck.com | login |\n');

  let r = run('push-references.js', ['htf', jobId], tmp);
  assert.strictEqual(r.status, 3, 'no board.md is a 3: ' + r.stdout + r.stderr);

  write('references/board.md', [
    '---', 'job: ' + jobId, 'client: htf', 'version: 1', 'status: draft', 'sites_searched: [Film-Grab, Vimeo Staff Picks, Shotdeck]', 'created: 2026-09-21', '---', '',
    '# References', '', '| # | Title | URL | Retrieved | Source site | Why it fits (brief line) | Selected |', '|---|---|---|---|---|---|---|',
    '| 1 | Ambulance | https://film-grab.com/ambulance/ | 2026-09-21 | Film-Grab | continuous aerial follow | |',
    '| 2 | Blade Runner | https://film-grab.com/blade-runner/ | 2026-09-21 | Film-Grab | wet-street practical light | |',
    '| 3 | A New Inferno | https://vimeo.com/1 | 2026-09-21 | Vimeo Staff Picks | real paramedics, procedural | |', '',
    '# Gaps', '', '| Site | What was tried | When | Reason |', '|---|---|---|---|', '| Shotdeck | search page | 2026-09-21 | needs a login |', '',
    '# Searches', '', '- Film-Grab: "night rain"', ''].join('\n'));

  // --print: the documents, nothing queued.
  r = run('push-references.js', ['htf', jobId, '--print'], tmp);
  assert.strictEqual(r.status, 0, r.stderr);
  const printed = JSON.parse(r.stdout);
  assert.strictEqual(printed.documents.length, 3);
  assert.strictEqual(printed.queued, 0);
  const bySite = Object.fromEntries(printed.sites.map(s => [s.name, s]));
  assert.strictEqual(bySite['Film-Grab'].status, 'found'); assert.strictEqual(bySite['Film-Grab'].count, 2);
  assert.strictEqual(bySite['Vimeo Staff Picks'].count, 1);
  assert.strictEqual(bySite['Shotdeck'].status, 'gap'); assert.match(bySite['Shotdeck'].note, /login/);
  assert.ok(!fs.existsSync(path.join(tmp, '.board', 'outbox.jsonl')) || !fs.readFileSync(path.join(tmp, '.board', 'outbox.jsonl'), 'utf8').includes('reference'), '--print queues nothing');

  // Queued, then pushed: three set writes to /references and one update on the scraper item.
  r = run('push-references.js', ['htf', jobId, '--json'], tmp);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(JSON.parse(r.stdout.trim().split('\n').pop()).queued, 3);
  r = run('board-sync.js', ['push', 'htf', jobId, '--json'], tmp);
  assert.strictEqual(r.status, 0, 'push --json: ' + r.stderr);
  const out = JSON.parse(r.stdout);
  const all = [].concat(...out.batches);
  const refs = all.filter(w => /\/references$/.test(w.collection));
  assert.strictEqual(refs.length, 3, 'three reference writes');
  assert.ok(refs.every(w => w.op === 'set'), 'references are set');
  assert.strictEqual(refs[0].doc_id, 'r01'); assert.strictEqual(refs[0].data.title, 'Ambulance'); assert.strictEqual(refs[0].data.site, 'Film-Grab');
  const item = all.find(w => /\/items$/.test(w.collection) && w.doc_id === 'scraper');
  assert.ok(item && item.op === 'update', 'the scraper item is updated, never replaced');
  assert.strictEqual(item.data.refCount, 3);
  assert.strictEqual(item.data.sites.find(s => s.name === 'Shotdeck').status, 'gap');
  assert.strictEqual(run('board-sync.js', ['push', 'htf', jobId, '--ack'], tmp).status, 0);
  console.log('ok   push-references queues one document per row and the site outcome on the scraper card');

  // The board: two chosen, one unchosen. land writes references/selected.json.
  const landedFile = path.join(tmp, 'landed.json');
  fs.writeFileSync(landedFile, JSON.stringify([{ collection: 'projects/' + jobId + '/refsel', documents: [
    { id: 'r01', data: { selected: true, by: 'creative-director', at: '2026-09-21T12:00:00Z' } },
    { id: 'r02', data: { selected: false, by: 'creative-director', at: '2026-09-21T12:01:00Z' } },
    { id: 'r03', data: { selected: true, by: 'creative-director', at: '2026-09-21T12:02:00Z' } }] }]));
  r = run('board-sync.js', ['land', 'htf', jobId, landedFile], tmp);
  assert.strictEqual(r.status, 0, 'land: ' + r.stdout + r.stderr);
  assert.match(r.stdout, /references: 2 chosen/);
  const sel = JSON.parse(fs.readFileSync(path.join(dir, 'references', 'selected.json'), 'utf8'));
  assert.deepStrictEqual(sel.ids, ['r01', 'r03']);
  assert.deepStrictEqual(sel.numbers, [1, 3]);
  assert.strictEqual(sel.rows[1].by, 'creative-director');
  console.log('ok   land writes the chosen references to references/selected.json');
  console.log('references verification passed');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}