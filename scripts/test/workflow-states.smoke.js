#!/usr/bin/env node
// The 1-22 stage table names a state after every row. This plans one plan.md from a realistic
// route, reads the "State after" column in row order, and asserts every consecutive pair is a
// legal walk through lib-states.js. It also checks the board journey: every state the job
// reaches maps to a stage the route shows, and every working stage names who is working.
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

const states = require('../lib-states.js');
const paneStages = require('../lib-stages.js');
const paneRoles = require('../lib-roles.js');

const NEVER_INTERMEDIATE = new Set(['BLOCKED', 'ESCALATED', 'CHANGES_REQUESTED', 'CANCELLED', 'COMPLETE']);
function reachable(from, to) {
  if (from === to) return true;
  if (states.canMove(from, to)) return true;
  let frontier = [from];
  const seen = new Set([from]);
  for (let depth = 0; depth < 2; depth++) {
    const next = [];
    for (const node of frontier) {
      for (const step of (states.get(node).next || [])) {
        if (NEVER_INTERMEDIATE.has(step) || seen.has(step)) continue;
        seen.add(step);
        if (states.canMove(step, to)) return true;
        next.push(step);
      }
    }
    frontier = next;
  }
  return false;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'od-wfstates-'));
const scaffoldClient = fs.existsSync(S('scaffold-client.js')) ? 'scaffold-client.js' : 'scaffold-brand.js';
assert.strictEqual(run(scaffoldClient, ['htf', 'HTF'], tmp).status, 0, 'client scaffold');

const scenarios = [
  { name: 'single-day-no-trailer', tags: [] },
  { name: 'multi-day-with-trailer', tags: ['has_trailer', 'multi_day'] },
];

const violations = [];
const journeyGaps = [];
let planned = 0;
for (const sc of scenarios) {
  const scaffolded = run('scaffold-job.js', ['htf', sc.name, sc.name], tmp);
  assert.strictEqual(scaffolded.status, 0, 'job scaffold ' + sc.name + ': ' + scaffolded.stderr);
  const jobId = (scaffolded.stdout.match(/^job-id:\s*(\S+)$/m) || [])[1];
  assert.ok(jobId, 'scaffold-job.js should print the job id, got: ' + scaffolded.stdout);
  const dir = path.join(tmp, 'workspaces', 'htf', 'jobs', jobId);

  const route = {
    schemaVersion: '1.0', status: 'ROUTED', jobId, client: 'htf',
    workflowId: '1-22', workflowVersion: '0.1.0',
    requiredDisciplines: [], gates: ['A', 'B', 'C'], tags: sc.tags,
    owner: 'orchestrator', support: ['intake-director', 'reference-scout', 'script-director', 'storyboard-director',
      'shot-list-director', 'production-planner', 'audio-supervisor', 'logistics-registrar', 'breakdown-compiler', 'call-sheet-builder'],
    riskFlags: [], modelAddedRiskFlags: [], confidence: 1, missingFields: [], unsupported: [], rationale: [],
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, 'route.json'), JSON.stringify(route, null, 2) + '\n');
  const job = JSON.parse(fs.readFileSync(path.join(dir, 'job.json'), 'utf8'));
  job.hasTrailer = sc.tags.includes('has_trailer'); job.shootDays = sc.tags.includes('multi_day') ? 3 : 1;
  fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify(job, null, 2) + '\n');

  const p = run('plan-job.js', [path.join(dir, 'route.json')], tmp);
  assert.strictEqual(p.status, 0, 'plan-job for ' + sc.name + ': ' + p.stderr + p.stdout);
  planned++;

  const planText = fs.readFileSync(path.join(dir, 'plan.md'), 'utf8');
  const plan = planText.split(/\r?\n/);
  const cells = line => line.split('|').slice(1, -1).map(c => c.trim());
  const headerLine = plan.find(l => l.trim().startsWith('|') && cells(l).includes('State after'));
  assert.ok(headerLine, 'plan.md has no State after column');
  const col = cells(headerLine).indexOf('State after');
  const numCol = cells(headerLine).indexOf('#');
  const stageCol = cells(headerLine).indexOf('Stage');

  const walk = [{ state: 'INTAKE_PENDING', row: '-', stage: 'scaffold' }];
  for (const line of plan) {
    if (!line.trim().startsWith('|')) continue;
    const c = cells(line);
    if (c.includes('State after') || c.every(x => /^:?-+:?$/.test(x))) continue;
    const state = (c[col] || '').replace(/`/g, '');
    if (!state) continue;
    walk.push({ state, row: c[numCol] || '?', stage: c[stageCol] || '?' });
  }
  assert.ok(walk.length > 10, sc.name + ' planned ' + (walk.length - 1) + ' rows with a state, expected the whole table');
  for (let i = 1; i < walk.length; i++) {
    let prev = walk[i - 1].state;
    const cur = walk[i].state;
    if (states.isGate(prev)) prev = states.APPROVED_STATE[states.gateOf(prev)];
    if (!reachable(prev, cur)) violations.push(sc.name + ' row ' + walk[i].row + ' ' + walk[i].stage + ': ' + prev + ' -> ' + cur);
  }
  assert.strictEqual(walk[walk.length - 1].state, 'RELEASED', 'the table ends released');

  const walked = paneStages.walkedStages(walk.map(w => w.state));
  assert.ok(walked, 'stages could be read from the plan');
  const last = paneStages.STAGE_IDS[paneStages.STAGE_IDS.length - 1];
  for (const stage of walked) {
    // Gates are the person's turn and the final stage is a result, not work.
    if (paneStages.APPROVAL_STAGE_IDS.includes(stage) || stage === last) continue;
    const who = paneRoles.workersFromPlan(planText, stage, 'working');
    if (!who.length) journeyGaps.push(sc.name + ': "' + stage + '" shows nobody working on it');
    for (const w of who) if (w.action === 'Working on this part of the job.') journeyGaps.push(sc.name + ' at "' + stage + '": ' + w.id + ' has no words of its own');
  }
  for (const w of walk) {
    const step = paneStages.forState(w.state);
    if (step && !walked.includes(step.stage)) journeyGaps.push(sc.name + ' row ' + w.row + ': ' + w.state + ' drawn at a hidden stage');
  }
  assert.strictEqual(walked[0], paneStages.STAGE_IDS[0]);
  assert.strictEqual(walked[walked.length - 1], paneStages.STAGE_IDS[paneStages.STAGE_IDS.length - 1]);
  for (const g of ['gate-a', 'gate-b', 'gate-c']) assert.ok(walked.includes(g), sc.name + ' shows ' + g);
}
assert.deepStrictEqual(journeyGaps, [], 'a route would draw a journey that cannot show where the run is:\n  ' + journeyGaps.join('\n  '));
console.log('ok   ' + planned + ' routes draw a journey through all three gates with someone working on every stage');

// Every state a workflow table names must exist.
const unknown = [];
for (const file of fs.readdirSync(path.join(ROOT, 'workflows')).filter(f => f.endsWith('.md')).sort()) {
  const lines = fs.readFileSync(path.join(ROOT, 'workflows', file), 'utf8').split(/\r?\n/);
  let col = -1, numCol = -1;
  for (const line of lines) {
    if (!line.trim().startsWith('|')) continue;
    const c = line.split('|').slice(1, -1).map(x => x.trim());
    if (col < 0) { if (c.includes('State after')) { col = c.indexOf('State after'); numCol = c.indexOf('#'); } continue; }
    if (c.every(x => /^:?-+:?$/.test(x))) continue;
    const state = (c[col] || '').replace(/`/g, '');
    if (state && !states.exists(state)) unknown.push(file + ' row ' + (c[numCol] || '?') + ': ' + state);
  }
  assert.ok(col >= 0, file + ' has no State after column');
}
assert.deepStrictEqual(unknown, [], 'workflow tables name states that do not exist');
console.log('ok   every State after cell in workflows/*.md is a real state');
assert.deepStrictEqual(violations, [], 'planned stage walks that the state table refuses:\n  ' + violations.join('\n  '));
console.log('ok   every planned route is a legal walk through lib-states.js');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('workflow-states verification passed');
