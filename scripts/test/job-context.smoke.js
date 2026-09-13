#!/usr/bin/env node
// `job-context.js` is the only thing a function hook can ask about the job, so what it must
// never do is as important as what it answers: never fail, never take the network, never print
// a state id at a person, and never invent a job in a folder that has none.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'job-context.js');
const { carriesJargon } = require(path.join(ROOT, 'scripts', 'lib-plain.js'));
const wording = require(path.join(ROOT, 'scripts', 'lib-wording.js'));

const env = { ...process.env };
delete env.ONEDASH_ROOT;

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'od-jobctx-'));
const brand = 'acme';
const jobId = 'job-20260907-context';
const jobDir = path.join(temp, 'workspaces', brand, 'jobs', jobId);

const run = (extra) => spawnSync(process.execPath, [SCRIPT, '--root', temp, ...(extra || [])],
  { encoding: 'utf8', env, cwd: temp });

const writeStatus = (state, fields) => {
  fs.mkdirSync(jobDir, { recursive: true });
  const f = fields || {};
  fs.writeFileSync(path.join(jobDir, 'status.md'), [
    '# Job status: ' + jobId, '',
    '**Client:** ' + brand,
    '**Job:** `' + jobId + '`',
    '**Current state:** `' + state + '`',
    '**Next action:** ' + (f.next || 'Write the captions'),
    '**Blocked on:** ' + (f.blocked || 'Nothing'),
    '**Credits spent:** ' + (f.credits || '0 of 0'), '',
    '## Stage log', '',
    '| Timestamp | From | To | By | Note |',
    '|---|---|---|---|---|',
    '| 2026-09-07 11:00 | - | `INTAKE_PENDING` | orchestrator | Project folder created |',
    '',
  ].join('\n'));
  const when = new Date(Date.now() + 1000);
  fs.utimesSync(path.join(jobDir, 'status.md'), when, when);
};

// 1. A folder with nothing in it. The common case at the start of a session, and the one a
// guard must be able to tell apart from a crash: whole JSON, exit 0, no job.
let r = run(['--json']);
assert.strictEqual(r.status, 0, 'an empty folder must not be reported as a failure: ' + r.stderr);
let c = JSON.parse(r.stdout);
assert.strictEqual(c.jobId, null, 'no job means no job, not a guess');
assert.strictEqual(c.isTheirTurn, false);
for (const key of ['root', 'brand', 'jobId', 'dir', 'state', 'sentence', 'gate', 'isTheirTurn',
  'stage', 'creditsSpent', 'creditsCeiling', 'openQuestion', 'openGate']) {
  assert.ok(key in c, 'every answer carries every field, and this one is missing ' + key);
}
console.log('ok   a folder with no job answers whole JSON and exits 0');

// 2. A job nobody is waiting on. The stage and the sentence come back; the gate does not.
writeStatus('SCRIPT_DRAFTED');
c = JSON.parse(run(['--json']).stdout);
assert.strictEqual(c.brand, brand);
assert.strictEqual(c.jobId, jobId);
assert.strictEqual(c.state, 'SCRIPT_DRAFTED');
assert.strictEqual(c.sentence, wording.sentence('SCRIPT_DRAFTED'), 'the sentence is lib-wording.js, not a second copy');
assert.strictEqual(c.isTheirTurn, false, 'drawing the board is not the person\'s turn');
assert.strictEqual(c.openGate, null);
assert.ok(c.stage, 'a state that belongs to a stage reports it');
assert.ok(c.dir.includes(jobId) && !c.dir.includes('\\'), 'paths come back in one form: ' + c.dir);
console.log('ok   an open job reports its state, its sentence and its stage');

// 3. A gate. This is the fact every guard in the plan turns on, so it is asserted by name.
writeStatus('AWAITING_GATE_A', {
  blocked: 'You, to lock the creative on the board or say what to change',
  credits: '4 of 30',
});
c = JSON.parse(run(['--json']).stdout);
assert.strictEqual(c.isTheirTurn, true, 'a gate is the person\'s turn');
assert.strictEqual(c.gate, 'A', 'the gate is read from lib-states.js');
assert.strictEqual(c.openGate, 'A', 'and it is still open');
assert.strictEqual(c.creditsSpent, 4);
assert.strictEqual(c.creditsCeiling, 30);
assert.ok(c.openQuestion && /lock the creative/i.test(c.openQuestion),
  'the question comes back in the job\'s own words: ' + c.openQuestion);
console.log('ok   a gate reports the gate, the question and the credit tally');

// 4. Nothing a person reads may carry an id or a file name.
const plain = run([]);
assert.strictEqual(plain.status, 0);
assert.ok(!carriesJargon(plain.stdout), 'the readable form leaks jargon:\n' + plain.stdout);
assert.ok(plain.stdout.includes('4 of 30'), 'it says what has been spent: ' + plain.stdout);
assert.ok(!/AWAITING_/.test(plain.stdout), 'a state id never reaches a person');
console.log('ok   the readable form carries no state id and no file name');

// 5. A status.md the job wrote badly. Still an answer, still exit 0.
fs.writeFileSync(path.join(jobDir, 'status.md'), 'not a status file at all\n');
r = run(['--json']);
assert.strictEqual(r.status, 0, 'a malformed status.md must not fail a hook');
c = JSON.parse(r.stdout);
assert.strictEqual(c.state, null, 'no state line means no state');
assert.strictEqual(c.isTheirTurn, false, 'and nothing unknown is treated as the person\'s turn');
console.log('ok   a status.md with no state line answers rather than throwing');

fs.rmSync(temp, { recursive: true, force: true });
