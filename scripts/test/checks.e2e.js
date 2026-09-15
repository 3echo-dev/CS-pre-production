#!/usr/bin/env node
// The five checks that stand between a director's file and a gate. Each is proven against
// a fixture that passes before it is trusted to refuse: an absence check that never saw a
// positive control is not a check.
//   node scripts/test/checks.e2e.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const S = n => path.join(ROOT, 'scripts', n);
const env = { ...process.env };
delete env.CREATIVE_STUDIO_ROOT;
const run = (script, args, cwd) => spawnSync(process.execPath, [S(script), ...args], { cwd, encoding: 'utf8', env });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'od-checks-'));
try {
  assert.strictEqual(run('scaffold-client.js', ['htf', 'HTF'], tmp).status, 0);
  const made = run('scaffold-job.js', ['htf', 'night-shift', 'HTF Night Shift'], tmp);
  const jobId = (made.stdout.match(/^job-id:\s*(\S+)$/m) || [])[1];
  const dir = path.join(tmp, 'workspaces', 'htf', 'jobs', jobId);
  const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };

  // --- shot-list-check ---------------------------------------------------------------
  write('script/v3.md', '# NIGHT SHIFT v3\n\n**1. INT. WARD STATION**\nHandover.\n\n**2. INT. CORRIDOR**\nHum.\n\n**4. INT. SERVICE CORRIDOR**\nPorter.\n');
  write('storyboard/v2/panels.md', '| Panel | Scene | Frame |\n|---|---|---|\n| P01 | 1 | wide |\n| P02 | 1 | insert |\n| P03 | 2 | track |\n| P06 | 4 | porter |\n| P07 | 4 | two-shot |\n');
  write('shot-list.csv', 'shot_id,label,scene,panel,description\nS001,1,1,P01,Handover wide\nS002,2,1,P02,Clipboard\nS003,3,2,P03,Corridor\nS007,7/8,4,P06,Porter\nS008,7/8,4,P07,Reverse\n');
  let r = run('shot-list-check.js', ['htf', jobId], tmp);
  assert.strictEqual(r.status, 0, 'a good shot list passes: ' + r.stdout + r.stderr);
  assert.match(r.stdout, /5 shots, 0 orphans, 2 grouped labels preserved/);
  assert.ok(fs.existsSync(path.join(dir, 'validation', 'shot-list-check.md')));
  write('shot-list.csv', 'shot_id,label,scene,panel,description\nS001,1,1,P01,Handover wide\nS009,9,7,P99,Nowhere\nS001,1b,1,P02,Dup id\n');
  r = run('shot-list-check.js', ['htf', jobId], tmp);
  assert.strictEqual(r.status, 1, 'an orphan row is refused');
  assert.match(r.stderr, /scene "7" is not in the script/);
  assert.match(r.stderr, /panel "P99" is not on the storyboard/);
  assert.match(r.stderr, /shot_id S001 is used twice/);
  console.log('ok   shot-list-check passes a traced list and refuses orphans and reused ids');

  // --- gate-b-check ------------------------------------------------------------------
  write('audio.md', '# Audio v1\n');
  const talents = rows => write('registers/talents.json', JSON.stringify({ rows }));
  write('registers/props.json', JSON.stringify({ rows: [{ name: 'Clipboard', scene: '1', source: 'ward', have: 'yes' }] }));
  write('registers/locations.json', JSON.stringify({ rows: [{ name: 'Studio B', address: 'Tuas', availability: '22 to 24 Sep', contact: 'manager' }] }));
  talents([{ name: 'Nurse', picture: 'p', age: '34', availability: 'weekdays', cost: '800', loading: '10%' }]);
  r = run('gate-b-check.js', ['htf', jobId], tmp);
  assert.strictEqual(r.status, 0, 'complete registers pass: ' + r.stdout + r.stderr);
  talents([{ name: 'Nurse', picture: 'p', age: '34', availability: 'weekdays', cost: '', loading: '' }]);
  r = run('gate-b-check.js', ['htf', jobId], tmp);
  assert.strictEqual(r.status, 1, 'a blank not marked as a decision is refused');
  assert.match(r.stderr, /talents row Nurse: cost, loading blank and not marked unknown by decision/);
  talents([{ name: 'Nurse', picture: 'p', age: '34', availability: 'weekdays', cost: '', loading: '', unknownByDecision: true }]);
  r = run('gate-b-check.js', ['htf', jobId], tmp);
  assert.strictEqual(r.status, 0, 'a blank left unknown by decision passes: ' + r.stderr);
  write('registers/props.json', JSON.stringify({ na: true, by: 'assistant', at: '2026-09-13' }));
  r = run('gate-b-check.js', ['htf', jobId], tmp);
  assert.strictEqual(r.status, 0, 'a register marked not applicable passes: ' + r.stderr);
  assert.match(r.stdout, /props: not applicable, decided by assistant/);
  write('registers/props.json', JSON.stringify({ na: true }));
  r = run('gate-b-check.js', ['htf', jobId], tmp);
  assert.strictEqual(r.status, 1, 'not applicable with nobody named is refused');
  console.log('ok   gate-b-check tells unknown from not applicable and names who decided');

  // --- gate-a-check ------------------------------------------------------------------
  const manifest = (extra) => write('storyboard/v2/generation-manifest.json', JSON.stringify({ schemaVersion: '1.0', sample: 'P01', items: [
    { panel: 'P01', kind: 'image', sample: true, status: 'pending', file: 'storyboard/v2/P01.png' },
    { panel: 'P02', kind: 'image', status: 'pending', file: 'storyboard/v2/P02.png' },
    { panel: 'P03', kind: 'image', status: 'pending', file: 'storyboard/v2/P03.png' }], ...extra }));
  manifest({});
  r = run('gate-a-check.js', ['htf', jobId], tmp);
  assert.strictEqual(r.status, 1, 'a panel table with no images is refused');
  assert.match(r.stderr, /3 of 3 panels have no image on disk \(P01, P02, P03\)/);
  assert.ok(fs.existsSync(path.join(dir, 'validation', 'gate-a-check.md')));
  manifest({ imagesDeferred: { by: 'creative-director', at: '2026-09-15', reason: 'animatic comes from the agency' } });
  r = run('gate-a-check.js', ['htf', jobId], tmp);
  assert.strictEqual(r.status, 0, 'a recorded decision to lock without images passes: ' + r.stderr);
  assert.match(r.stdout, /images deferred by creative-director/);
  manifest({ imagesDeferred: { reason: 'nobody said who' } });
  r = run('gate-a-check.js', ['htf', jobId], tmp);
  assert.strictEqual(r.status, 1, 'a deferral with nobody named is refused');
  write('storyboard/v2/generation-manifest.json', JSON.stringify({ sample: 'P01', items: [
    { panel: 'P01', kind: 'image', sample: true, status: 'validated', file: 'storyboard/v2/P01.png' },
    { panel: 'P02', kind: 'image', status: 'validated', file: 'storyboard/v2/P02.png' },
    { panel: 'P03', kind: 'image', status: 'validated', file: 'storyboard/v2/P03.png' }] }));
  for (const p of ['P01', 'P02', 'P03']) write('storyboard/v2/' + p + '.png', 'png');
  r = run('gate-a-check.js', ['htf', jobId], tmp);
  assert.strictEqual(r.status, 0, 'every panel on disk passes: ' + r.stderr);
  assert.match(r.stdout, /3 image panels, 3 on disk/);
  fs.unlinkSync(path.join(dir, 'storyboard/v2/P02.png'));
  r = run('gate-a-check.js', ['htf', jobId], tmp);
  assert.strictEqual(r.status, 1, 'one missing file is refused');
  assert.match(r.stderr, /1 of 3 panels have no image on disk \(P02\)/);
  console.log('ok   gate-a-check refuses a storyboard without images unless a person recorded the deferral');

  // --- sites-check -------------------------------------------------------------------
  r = run('sites-check.js', ['htf'], tmp);
  assert.strictEqual(r.status, 1, 'an empty site list refuses the scout: ' + r.stdout);
  assert.match(r.stderr, /No sites yet. Ask the person where the scout should research/);
  r = run('sites-check.js', ['htf', '--add', 'Vimeo Staff Picks', '--url', 'https://vimeo.com/channels/staffpicks', '--note', 'motion first'], tmp);
  assert.strictEqual(r.status, 0, 'a site the person named is added: ' + r.stderr);
  r = run('sites-check.js', ['htf', '--add', 'Ads of the World'], tmp);
  assert.strictEqual(r.status, 0);
  r = run('sites-check.js', ['htf', '--add', 'ads of the world'], tmp);
  assert.match(r.stdout, /already on the list/);
  r = run('sites-check.js', ['htf', '--json'], tmp);
  assert.strictEqual(r.status, 0, 'two sites pass: ' + r.stderr);
  const sites = JSON.parse(r.stdout).sites;
  assert.deepStrictEqual(sites.map(s => s.site), ['Vimeo Staff Picks', 'Ads of the World']);
  assert.strictEqual(sites[0].url, 'https://vimeo.com/channels/staffpicks');
  assert.match(fs.readFileSync(path.join(tmp, 'workspaces', 'htf', 'client', 'sites.md'), 'utf8'), /\| Vimeo Staff Picks \| https:\/\/vimeo.com\/channels\/staffpicks \| motion first \|/);
  console.log('ok   sites-check refuses an empty roster and lands the sites the person typed');

  // --- call-sheet-check --------------------------------------------------------------
  write('registers/props.json', JSON.stringify({ rows: [] , na: true, by: 'assistant' }));
  talents([{ name: 'Nurse', picture: 'p', age: '34', availability: 'weekdays', cost: '800', loading: '10%' },
    { name: 'Porter', picture: 'p', age: '50', availability: '', cost: '400', loading: '0', unknownByDecision: true }]);
  write('breakdown.csv', 'S/s,Visuals,Location,Talent,Client input,Client input\nS001,Handover,Studio B,Nurse,,\nS003,Corridor,Studio B,Nurse,,\nS007,Porter,Studio B,"Nurse, Porter",,\n');
  write('call-sheets/day-1.csv', 'shot_id,unit,call,wrap,talent,location\nS001,1,19:00,23:00,Nurse,Studio B\nS003,1,23:00,02:00,Nurse,Studio B\n');
  r = run('call-sheet-check.js', ['htf', jobId], tmp);
  assert.strictEqual(r.status, 0, 'a sheet of known people passes: ' + r.stdout + r.stderr);
  assert.match(r.stdout, /overnight block/);
  write('call-sheets/day-2.csv', 'shot_id,unit,call,wrap,talent,location\nS007,1,08:00,12:00,"Nurse, Porter",Studio B\nS001,2,09:00,11:00,Nurse,Ward\n');
  r = run('call-sheet-check.js', ['htf', jobId], tmp);
  assert.strictEqual(r.status, 1, 'an unknown talent is refused');
  assert.match(r.stderr, /talent "Porter" availability is unknown/);
  assert.match(r.stderr, /location "Ward" not in the register/);
  assert.match(r.stderr, /"Nurse" is on unit 2 and unit 1 at 09:00/);
  console.log('ok   call-sheet-check refuses an unknown talent, an unknown location and a shared-resource clash');

  // --- breakdown-check ---------------------------------------------------------------
  fs.rmSync(path.join(dir, 'call-sheets', 'day-2.csv'));
  write('shot-list.csv', 'shot_id,label,scene,panel\nS001,1,1,P01\nS003,3,2,P03\nS007,7/8,4,P06\n');
  talents([{ name: 'Nurse', picture: 'p', age: '34', availability: 'weekdays', cost: '800', loading: '10%' }]);
  r = run('breakdown-check.js', ['htf', jobId, '--sample', '3'], tmp);
  assert.strictEqual(r.status, 1, 'a talent missing from the register is caught: ' + r.stdout);
  assert.match(r.stderr, /talent "Porter" is not in the talents register/);
  write('breakdown.csv', 'S/s,Visuals,Location,Talent,Client input,Client input\nS001,Handover,Studio B,Nurse,,\nS003,Corridor,Studio B,Nurse,,\nS003,Corridor cont.,Studio B,Nurse,,\n');
  r = run('breakdown-check.js', ['htf', jobId], tmp);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /shot S003 appears twice/);
  write('breakdown.csv', 'S/s,Visuals,Location,Talent,Client input,Client input\nS001,Handover,Studio B,Nurse,,\nS003,Corridor,Studio B,Nurse,,\n');
  r = run('breakdown-check.js', ['htf', jobId], tmp);
  assert.strictEqual(r.status, 0, 'a breakdown that traces passes: ' + r.stdout + r.stderr);
  write('breakdown.csv', 'S/s,Visuals,Location,Talent,Client input\nS001,Handover,Studio B,Nurse,\n');
  r = run('breakdown-check.js', ['htf', jobId], tmp);
  assert.strictEqual(r.status, 1, 'a merged client-input column is refused');
  assert.match(r.stderr, /client-input columns are not both present/);
  console.log('ok   breakdown-check traces a sample, keeps both client columns and refuses a continued row');

  // --- build-release ------------------------------------------------------------------
  r = run('build-release.js', ['htf', jobId], tmp);
  assert.strictEqual(r.status, 3, 'no Gate C approval, no release');
  console.log('ok   build-release refuses without an approved Gate C record');

  console.log('checks verification passed');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
