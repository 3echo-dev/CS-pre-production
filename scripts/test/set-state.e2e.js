#!/usr/bin/env node
// Status used to be edited by hand, six string replacements in one run, while list-jobs.js
// scraped the result. One script owns the transition now, and it refuses an impossible one.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const S = n => path.join(ROOT, 'scripts', n);
const env = { ...process.env };
delete env.CREATIVE_STUDIO_ROOT;
const run = (script, args, cwd, extraEnv = {}) =>
  spawnSync(process.execPath, [S(script), ...args], { cwd, encoding: 'utf8', env: { ...env, ...extraEnv } });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'od-state-'));
assert.strictEqual(run('scaffold-client.js', ['htf', 'HTF'], tmp).status, 0);

// A Manila workspace must stamp Manila time, whatever zone the process runs in.
const wsFile = path.join(tmp, 'workspaces', 'htf', 'workspace.json');
const cfg = JSON.parse(fs.readFileSync(wsFile, 'utf8'));
cfg.timezone = 'Asia/Manila';
fs.writeFileSync(wsFile, JSON.stringify(cfg, null, 2));

assert.strictEqual(run('scaffold-job.js', ['htf', 'walk', 'Walk'], tmp).status, 0);
const jobId = fs.readdirSync(path.join(tmp, 'workspaces', 'htf', 'jobs'))[0];
const statusPath = path.join(tmp, 'workspaces', 'htf', 'jobs', jobId, 'status.md');
const readStatus = () => fs.readFileSync(statusPath, 'utf8');
const field = name => (readStatus().match(new RegExp('\\*\\*' + name + ':\\*\\*\\s*`?([^`\\n]*)`?')) || [])[1].trim();

// Five transitions, each readable by list-jobs afterwards.
const walk = ['PLANNED', 'BRIEF_READY', 'REFERENCES_READY', 'SCRIPT_DRAFTED', 'STORYBOARD_DRAFTED'];
for (const target of walk) {
  const r = run('set-state.js', ['htf', jobId, target, '--by', 'bob', '--note', 'moved to ' + target], tmp);
  assert.strictEqual(r.status, 0, 'should move to ' + target + ': ' + r.stderr);
  assert.match(r.stdout, /^Now: /m, 'it should say where the job is in words');
  assert.match(r.stdout, /SYNC NEEDED/, 'a state change is what triggers the mirror');
  assert.strictEqual(field('Current state'), target);
  const list = run('list-jobs.js', ['htf'], tmp);
  assert.ok(list.stdout.includes(jobId), 'list-jobs should still find the job after ' + target);
  assert.ok(!/[A-Z]{4,}_[A-Z]/.test(list.stdout), 'list-jobs should not print raw state ids: ' + list.stdout);
}
console.log('ok   five transitions land, each readable by list-jobs, none printing a raw state id');

// A state change is what moves the board: it lands in the outbox with the state on it.
const outbox = path.join(tmp, '.board', 'outbox.jsonl');
assert.ok(fs.existsSync(outbox), 'a state change queues progress for the board');
const queued = fs.readFileSync(outbox, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
assert.ok(queued.some(q => q.kind === 'progress' && q.payload.key === jobId && q.payload.state === 'STORYBOARD_DRAFTED'),
  'the progress record carries the job and the state');
console.log('ok   every state change is queued for the board');

// A gate can be reached and rolled back to where "start over" sends it.
for (const st of ['SHOT_LIST_DRAFTED', 'PLANNING_DRAFTED', 'AWAITING_GATE_A']) {
  const m = run('set-state.js', ['htf', jobId, st, '--by', 'bob'], tmp);
  assert.strictEqual(m.status, 0, st + ': ' + m.stderr);
}
assert.match(run('set-state.js', ['htf', jobId, 'AWAITING_GATE_A', '--by', 'bob'], tmp).stdout, /Now: Gate A/);
// "Start over" goes through CHANGES_REQUESTED on its way back to the brief.
const changes = run('set-state.js', ['htf', jobId, 'CHANGES_REQUESTED', '--by', 'bob'], tmp);
assert.strictEqual(changes.status, 0, 'a change request leaves the gate: ' + changes.stderr);
const back = run('set-state.js', ['htf', jobId, 'BRIEF_READY', '--by', 'bob'], tmp);
assert.strictEqual(back.status, 0, 'start over at Gate A reaches the brief: ' + back.stderr);
console.log('ok   Gate A can be reached and rolled back to the brief');

const states = require('../lib-states.js');
assert.strictEqual(states.rollbackFor('AWAITING_GATE_A', ['A', 'B', 'C']), 'BRIEF_READY');
assert.strictEqual(states.rollbackFor('AWAITING_GATE_B', ['A', 'B', 'C']), 'LOGISTICS_OPEN');
assert.strictEqual(states.rollbackFor('AWAITING_GATE_C', ['A', 'B', 'C']), 'BREAKDOWN_DRAFTED');
assert.strictEqual(states.APPROVED_STATE.A, 'GATE_A_PASSED');
console.log('ok   every gate rolls back to the stage that owns the fix');

// The stage log is append-only: one row per move, plus the scaffold row.
const rows = readStatus().split('\n').filter(l => /^\|\s*20\d\d-/.test(l));
assert.ok(rows.length >= walk.length + 4, 'every transition should leave a row, got ' + rows.length);
console.log('ok   every transition appends a stage-log row');

// Manila, not the process zone.
assert.match(field('Last updated'), /\+08:00$/, 'stamp should be in the workspace zone, got ' + field('Last updated'));
const utcRun = run('set-state.js', ['htf', jobId, 'REFERENCES_READY', '--by', 'bob'], tmp, { TZ: 'UTC' });
assert.strictEqual(utcRun.status, 0, utcRun.stderr);
assert.match(field('Last updated'), /\+08:00$/, 'a UTC process must still stamp the workspace zone');
console.log('ok   timestamps follow the workspace timezone, not the process');

// An impossible move is refused, and nothing is written.
const before = readStatus();
const bad = run('set-state.js', ['htf', jobId, 'RELEASED', '--by', 'bob'], tmp);
assert.strictEqual(bad.status, 1, 'an impossible transition must fail');
assert.match(bad.stderr, /cannot go from/);
assert.strictEqual(readStatus(), before, 'a refused transition must not touch the file');
console.log('ok   an impossible transition is refused and changes nothing');

const unknown = run('set-state.js', ['htf', jobId, 'BANANA', '--by', 'bob'], tmp);
assert.strictEqual(unknown.status, 2);
assert.match(unknown.stderr, /is not a state/);
console.log('ok   an unknown state name is refused');

fs.rmSync(tmp, { recursive: true, force: true });
