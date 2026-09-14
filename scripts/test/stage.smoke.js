#!/usr/bin/env node
// stage.js, the one call a workflow row makes at its start and at its end.
//
// The board moves only when something says a stage started or finished, and a workflow row
// is not a state: the storyboard runs for many minutes inside one state. So every stage in
// the list has to be sayable, in order, and the named workers under it have to come out in
// plain English with no agent id anywhere near them. The board is reached through the
// outbox, so that is what is read back.
//   node scripts/test/stage.smoke.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const stages = require('../lib-stages.js');
const states = require('../lib-states.js');

const SCRIPT = path.join(__dirname, '..', 'stage.js');
const run = (args, root) => spawnSync(process.execPath, [SCRIPT, ...args, '--root', root], { encoding: 'utf8' });

function pipelineRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-on-'));
  fs.mkdirSync(path.join(dir, 'workspaces'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.creative-studio-pipeline'), { recursive: true });
  return dir;
}
const outbox = root => {
  const f = path.join(root, '.board', 'outbox.jsonl');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l)).map(r => r.payload) : [];
};

const root = pipelineRoot();
const job = 'job-20260913-1030-night-shift';

// 1. The friendly names. A workflow row names agents; a person reads seats.
const named = run([
  job, 'stage-1-creative', 'running',
  '--substep', 'Script',
  '--title', 'HTF, Night Shift',
  '--agents', 'script-director:running,storyboard-director:running,reference-scout:done,watch-video:running,orchestrator:done',
], root);
assert.strictEqual(named.status, 0, 'stage.js failed: ' + (named.stderr || ''));
let posts = outbox(root);
const post = posts[posts.length - 1];
assert.strictEqual(post.key, job, 'it posts against the job id');
assert.strictEqual(post.stage, 'stage-1-creative', 'it keeps the stage id from docs/STAGES.md');
assert.strictEqual(post.substep, 'Script');
assert.strictEqual(post.status, 'running');
assert.strictEqual(post.title, 'HTF, Night Shift');
assert.deepStrictEqual(post.activities.map(a => a.role),
  ['Scriptwriter', 'Storyboard Artist', 'Reference Scout', 'Reference watcher', 'Orchestrator'],
  'each agent reads as the seat a person would name, in the order it was reported');
assert.deepStrictEqual(post.activities.map(a => a.status), ['working', 'working', 'done', 'working', 'done']);
for (const a of post.activities) {
  assert.ok(a.action && a.action.length <= 180, 'every worker says what it is doing: ' + a.role);
  assert.ok(/^[A-Z]/.test(a.role), 'a role is written for a person: ' + a.role);
  assert.ok(!/[_]|--/.test(a.role), 'no id leaks into the role: ' + a.role);
}
assert.ok(named.stdout.includes('Scriptwriter working'), 'the chat line names them too');

// Every director has a plain name.
const rest = run([job, 'stage-2-logistics', 'running', '--agents',
  'intake-director:done,shot-list-director:done,production-planner:done,audio-supervisor:running,logistics-registrar:running,breakdown-compiler:running,call-sheet-builder:running,questioner:done'], root);
assert.strictEqual(rest.status, 0, rest.stderr);
posts = outbox(root);
assert.deepStrictEqual(posts[posts.length - 1].activities.map(a => a.role),
  ['Intake Clerk', 'Shot Lister', 'Production Planner', 'Audio Supervisor', 'Logistics Registrar', 'Breakdown Compiler', 'Call Sheet Builder', 'Questioner']);

// 2. Both spellings of a stage go through unchanged; a made-up one is refused.
const short = run([job, 'stage1', 'done'], root);
assert.strictEqual(short.status, 0, 'the short spelling is accepted');
posts = outbox(root);
assert.strictEqual(posts[posts.length - 1].stage, 'stage1');
assert.strictEqual(posts[posts.length - 1].status, 'done');
const madeUp = run([job, 'doing-the-thing', 'running'], root);
assert.strictEqual(madeUp.status, 2, 'a stage that is in neither list is refused');
assert.ok(/not a stage/.test(madeUp.stderr));

// 3. Every stage, in order, start and end.
const before = outbox(root).length;
for (const id of stages.STAGE_IDS) {
  assert.strictEqual(run([job, id, 'running'], root).status, 0, id + ' could not be started');
  assert.strictEqual(run([job, id, 'done'], root).status, 0, id + ' could not be finished');
}
const walked = outbox(root).slice(before);
assert.strictEqual(walked.length, stages.STAGE_IDS.length * 2, 'both ends of every stage landed');
assert.deepStrictEqual(walked.filter((_, i) => i % 2 === 0).map(p => p.stage), stages.STAGE_IDS, 'the board hears the stages in the order it draws them');

// 4. A folder that is not the pipeline's: no word, no file, exit 0.
const lonely = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-off-'));
const offline = run([job, 'stage-1-creative', 'running', '--agents', 'script-director:running'], lonely);
assert.strictEqual(offline.status, 0, 'outside the pipeline it still exits 0');
assert.strictEqual(offline.stdout.trim(), '', 'and says nothing at all');
assert.strictEqual(offline.stderr.trim(), '');
assert.ok(!fs.existsSync(path.join(lonely, '.board')), 'and queues nothing in a stranger\'s folder');

// 5. Finishing a stage says what has started, where the state machine leaves no doubt.
const onward = id => stages.nextRunning(id, (states.get(id) || {}).next || []);
assert.deepStrictEqual(onward('GATE_A_PASSED'), { stage: 'stage-2-logistics', status: 'running' }, 'passing Gate A starts logistics');
assert.deepStrictEqual(onward('GATE_B_PASSED'), { stage: 'stage-3-documents', status: 'running' }, 'passing Gate B starts the documents');
assert.strictEqual(onward('PLANNING_DRAFTED'), null, 'the next thing is a gate, and the gate says so itself');
assert.strictEqual(onward('SCRIPT_DRAFTED'), null, 'a stage still running has not finished anything');
for (const id of stages.APPROVAL_STAGE_IDS) assert.ok(stages.STAGE_IDS.includes(id), id + ' is one of the eight stages');

fs.rmSync(root, { recursive: true, force: true });
fs.rmSync(lonely, { recursive: true, force: true });
console.log('ok   stage.js reports every stage in order and names the workers under it');
