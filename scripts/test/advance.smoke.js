#!/usr/bin/env node
// A job must be able to walk from intake to planned without anyone remembering to record a
// state by hand. A real run stopped here: "cannot go from INTAKE_PENDING to PLANNED", because
// routing knew the job was routed and never said so.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const scripts = path.join(__dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'advance-'));
const brand = 'htf';
// The scaffolder names the job, and its name carries the time it was asked for, so this
// reads the name back rather than guessing it.
let jobId = null;
let jobDir = null;
fs.mkdirSync(path.join(root, 'workspaces', brand, 'client'), { recursive: true });
fs.mkdirSync(path.join(root, 'workspaces', brand, 'jobs'), { recursive: true });
fs.writeFileSync(path.join(root, 'workspaces', brand, 'workspace.json'), JSON.stringify({ client: brand }));

const run = (script, args) => spawnSync(process.execPath, [path.join(scripts, script), ...args], { encoding: 'utf8' });

// The state a job folder is really in, as status.md records it.
const stateOf = () => {
  const txt = fs.readFileSync(path.join(jobDir, 'status.md'), 'utf8');
  const m = txt.match(/\*\*Current state:\*\*\s*`([A-Z_]+)`/);
  return m ? m[1] : null;
};

const scaffold = run('scaffold-job.js', [brand, 'advance', 'One project, for the state walk', '--root', root]);
assert.strictEqual(scaffold.status, 0, 'the job folder is scaffolded: ' + (scaffold.stderr || scaffold.stdout));
jobId = (scaffold.stdout.match(/^job-id:\s*(\S+)$/m) || [])[1];
assert.ok(jobId, 'scaffold-job.js says what it called the job: ' + scaffold.stdout);
jobDir = path.join(root, 'workspaces', brand, 'jobs', jobId);
assert.ok(fs.existsSync(path.join(jobDir, 'status.md')), 'and the folder is there');

const jobFile = path.join(jobDir, 'job.json');
if (!fs.existsSync(jobFile)) {
  fs.writeFileSync(jobFile, JSON.stringify({ jobId, client: brand, kind: 'preproduction' }));
}

// lib-advance moves a job on its own, and refuses nothing the state machine allows.
const { advance } = require(path.join(scripts, 'lib-advance.js'));
const routed = advance(jobDir, 'PLANNED', { by: 'router', note: 'Routed to 1-22.' });
assert.ok(routed.ok, 'routing records itself: ' + routed.out);
assert.strictEqual(stateOf(), 'PLANNED', 'status.md carries the planned state');

const planned = advance(jobDir, 'PLANNED', { by: 'planner', note: 'Planned 18 stages.' });
assert.ok(planned.ok, 'planning re-earns the same state without complaint: ' + planned.out);
assert.strictEqual(stateOf(), 'PLANNED', 'and the job stays planned');

// An impossible jump is refused without taking the caller down with it.
const silly = advance(jobDir, 'INTAKE_PENDING', { by: 'test' });
assert.strictEqual(silly.ok, false, 'a state the machine forbids is refused');
assert.strictEqual(stateOf(), 'PLANNED', 'and the job stays where it was');

// The scripts that earn these states carry the wiring, so a rename cannot quietly drop it.
for (const file of ['route-job.js', 'plan-job.js']) {
  const src = fs.readFileSync(path.join(scripts, file), 'utf8');
  assert.ok(src.includes('lib-advance'), file + ' records the state it earns');
}

fs.rmSync(root, { recursive: true, force: true });
console.log('ok   routing and planning record their own state, and a bad jump changes nothing');
