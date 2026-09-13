#!/usr/bin/env node
// The router is a script so the same folder routes the same way every time. Three answers it
// must give: a complete project routes to 1-22 with every director in support and three
// gates; a project whose Brief never landed is BLOCKED, not researched; a kind nobody built
// is UNSUPPORTED. And the plan it produces carries every row of the workflow table, because
// 1-22 has no conditional stage a real job would drop.
//   node scripts/test/route-job.smoke.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const S = n => path.join(ROOT, 'scripts', n);
const env = { ...process.env };
delete env.ONEDASH_ROOT;
const run = (script, args, cwd) => spawnSync(process.execPath, [S(script), ...args], { cwd, encoding: 'utf8', env });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'od-route-'));
try {
  assert.strictEqual(run('scaffold-client.js', ['htf', 'HTF'], tmp).status, 0, 'client scaffold');
  const made = run('scaffold-job.js', ['htf', 'night-shift', 'HTF Night Shift'], tmp);
  assert.strictEqual(made.status, 0, made.stderr);
  const jobId = (made.stdout.match(/^job-id:\s*(\S+)$/m) || [])[1];
  assert.ok(jobId, 'the scaffold names the job');
  const dir = path.join(tmp, 'workspaces', 'htf', 'jobs', jobId);
  const jobFile = path.join(dir, 'job.json');
  const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));

  // 1. Complete, with the brief on disk.
  const inputs = path.join(tmp, 'inputs', 'htf', jobId, 'Brief');
  fs.mkdirSync(inputs, { recursive: true });
  fs.writeFileSync(path.join(inputs, 'HTF_Brief_v2.pdf'), 'brief bytes');
  Object.assign(job, { kind: 'preproduction', scriptFormat: 'screenplay', storyboardStyle: 'live_pictures', hasTrailer: true, shootDays: 2,
    driveFolder: 'One Dash / Projects / HTF Night Shift', inputs: { brief: ['Brief/HTF_Brief_v2.pdf'], concept: [], assets: [] } });
  fs.writeFileSync(jobFile, JSON.stringify(job, null, 2));
  let r = run('route-job.js', [jobFile], tmp);
  assert.strictEqual(r.status, 0, 'a complete project routes: ' + r.stdout + r.stderr);
  const route = JSON.parse(fs.readFileSync(path.join(dir, 'route.json'), 'utf8'));
  assert.strictEqual(route.status, 'ROUTED');
  assert.strictEqual(route.workflowId, '1-22');
  assert.strictEqual(route.owner, 'orchestrator');
  assert.strictEqual(route.support.length, 10, 'ten directors in support: ' + route.support.join(', '));
  assert.deepStrictEqual(route.gates, ['A', 'B', 'C']);
  assert.deepStrictEqual([...route.tags].sort(), ['has_trailer', 'multi_day']);
  assert.ok(!/AWAITING_|_DRAFTED/.test(r.stdout), 'no state id is printed at a person');
  console.log('ok   a complete project routes to 1-22 with ten directors and three gates');

  // The plan carries every row of the table.
  r = run('plan-job.js', [path.join(dir, 'route.json')], tmp);
  assert.strictEqual(r.status, 0, 'plan: ' + r.stderr);
  const cells = l => l.split('|').slice(1, -1).map(c => c.trim());
  const tableRows = fs.readFileSync(path.join(ROOT, 'workflows', '1-22.md'), 'utf8').split(/\r?\n/)
    .filter(l => l.trim().startsWith('|')).map(cells).filter(c => c.length > 5 && !c.includes('Condition') && !c.every(x => /^:?-+:?$/.test(x)));
  const planRows = fs.readFileSync(path.join(dir, 'plan.md'), 'utf8').split(/\r?\n/)
    .filter(l => l.trim().startsWith('|')).map(cells).filter(c => c.length > 5 && !c.includes('State after') && !c.every(x => /^:?-+:?$/.test(x)));
  assert.strictEqual(planRows.length, tableRows.length, 'plan.md keeps every row of workflows/1-22.md (' + planRows.length + ' of ' + tableRows.length + ')');
  assert.ok(planRows.every(c => c.some(x => /^(owner|support|-)$/.test(x))), 'every row has an ownership');
  console.log('ok   plan.md carries all ' + planRows.length + ' rows of the 1-22 table');

  // 2. The brief never landed: blocked, exit 3, and it names what is missing.
  fs.rmSync(path.join(inputs, 'HTF_Brief_v2.pdf'));
  r = run('route-job.js', [jobFile], tmp);
  assert.strictEqual(r.status, 3, 'a missing brief blocks: ' + r.stdout + r.stderr);
  assert.match(r.stdout, /BLOCKED/);
  assert.match(r.stdout, /Brief/i, 'it names the missing brief');
  console.log('ok   a project whose Brief never landed is blocked, not started');

  // 3. A kind nobody built.
  fs.writeFileSync(path.join(inputs, 'HTF_Brief_v2.pdf'), 'brief bytes');
  job.kind = 'postproduction';
  fs.writeFileSync(jobFile, JSON.stringify(job, null, 2));
  r = run('route-job.js', [jobFile], tmp);
  assert.strictEqual(r.status, 4, 'a planned kind is unsupported: ' + r.stdout);
  assert.match(r.stdout, /UNSUPPORTED/);
  console.log('ok   an unbuilt kind is refused with exit 4');

  // 4. Missing the two fields that change what the directors write.
  job.kind = 'preproduction'; delete job.scriptFormat;
  fs.writeFileSync(jobFile, JSON.stringify(job, null, 2));
  r = run('route-job.js', [jobFile], tmp);
  assert.strictEqual(r.status, 3);
  assert.match(r.stdout, /scriptFormat/);
  console.log('ok   a missing script format is asked for, not guessed');

  console.log('route verification passed');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
