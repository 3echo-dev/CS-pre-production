#!/usr/bin/env node
// Move a job to a new state. The only thing that writes status.md after scaffolding.
//
//   node set-state.js <client> <job-id> <STATE> --by <who> [--note "<text>"]
//        [--notes-file <path>] [--next "<one line>"] [--blocked "<who or what>"] [--json]
//
// Status used to be edited by hand: rewrite the state, rewrite the timestamp, append a log
// row, rewrite the notes. Six string replacements in one run, and list-jobs.js then scraped
// the result, so one stray edit broke the jobs list silently.
//
// Exit 0 moved · 1 illegal transition or write failure · 2 usage · 3 job not found
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');
const states = require('./lib-states.js');
const wording = require('./lib-wording.js');
const stages = require('./lib-stages.js');
const gate = require('./lib-board.js');
const roles = require('./lib-roles.js');

const argv = process.argv.slice(2);
const flag = (name, dflt) => { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt; };
const json = argv.includes('--json');

const { brand, jobId, dir } = ws.resolveJobArgs(argv);
const positional = argv.filter(a => !a.startsWith('--'));
// resolveJobArgs consumes brand and job, so the state is whatever is left.
const target = (positional[0] && /[\\/]/.test(positional[0])) ? positional[1] : positional[2];
const by = flag('by');

if (!brand || !jobId || !target || !by) {
  console.error('usage: set-state.js <client> <job-id> <STATE> --by <who> [--note "<text>"] [--notes-file <path>] [--next "<line>"] [--blocked "<text>"]');
  console.error('states: ' + states.ids().join(' '));
  process.exit(2);
}
if (!states.exists(target)) {
  console.error('"' + target + '" is not a state. Known states:\n  ' + states.ids().join(' '));
  process.exit(2);
}

const statusPath = path.join(dir, 'status.md');
if (!fs.existsSync(statusPath)) {
  console.error('No project at ' + ws.fwd(dir) + '. Check the client and job id, or scaffold it first.');
  process.exit(3);
}

const raw = fs.readFileSync(statusPath, 'utf8');
const nl = raw.includes('\r\n') ? '\r\n' : '\n';
let text = raw.replace(/\r\n/g, '\n');

const field = name => {
  const m = text.match(new RegExp('\\*\\*' + name + ':\\*\\*\\s*`?([^`\\n]*)`?'));
  return m ? m[1].trim() : '';
};
const current = field('Current state');
const title = field('Title');

if (current && !states.exists(current)) {
  console.error('status.md says the state is "' + current + '", which is not in the state table. Fix that line before moving on.');
  process.exit(1);
}
if (current && !states.canMove(current, target)) {
  console.error('cannot go from ' + current + ' to ' + target + '.');
  const allowed = (states.get(current).next || []);
  console.error('From ' + states.label(current) + ' the job can go to: ' + (allowed.length ? allowed.join(', ') : 'nowhere, it is finished') + '.');
  process.exit(1);
}

const stamp = ws.now(brand, argv);
const note = flag('notesFile') || flag('notes-file')
  ? fs.readFileSync(flag('notes-file') || flag('notesFile'), 'utf8').trim()
  : flag('note', '');

// Header fields.
const setField = (name, value) => {
  const re = new RegExp('(\\*\\*' + name + ':\\*\\*\\s*)`?[^`\\n]*`?', '');
  const backticked = name === 'Current state';
  if (re.test(text)) text = text.replace(re, '$1' + (backticked ? '`' + value + '`' : value));
};
setField('Current state', target);
setField('Last updated', stamp);
const nextLine = flag('next', wording.sentence(target));
setField('Next action', nextLine);
setField('Blocked on', flag('blocked', states.isGate(target) ? 'You' : (target === 'BLOCKED' || target === 'ESCALATED' ? 'You' : 'Nothing')));

// Stage log: append, never rewrite.
const logHeader = /\| Timestamp \| From \| To \| By \| Note \|\n\|[-| ]+\|\n/;
const row = '| ' + [stamp, current || '-', '`' + target + '`', by, (note || states.label(target)).replace(/\|/g, '/').replace(/\n+/g, ' ')].join(' | ') + ' |\n';
if (logHeader.test(text)) {
  // insert after the existing rows of that table
  const start = text.search(logHeader);
  const after = start + text.match(logHeader)[0].length;
  let end = after;
  while (end < text.length) {
    const lineEnd = text.indexOf('\n', end);
    const line = text.slice(end, lineEnd === -1 ? text.length : lineEnd);
    if (!line.trim().startsWith('|')) break;
    end = (lineEnd === -1 ? text.length : lineEnd + 1);
  }
  text = text.slice(0, end) + row + text.slice(end);
} else {
  console.error('status.md has no stage log table; the transition was not recorded. Re-scaffold from templates/status.md.');
  process.exit(1);
}

// Notes describe now, so they are replaced rather than appended. A stale note reads as a live
// instruction to the next session.
if (note) {
  const m = text.match(/(\n## Notes\n)([\s\S]*)$/);
  if (m) {
    const keep = m[2].split('\n').filter(l => l.startsWith('**') && l.includes('CURRENT state')).join('\n');
    text = text.slice(0, m.index) + m[1] + (keep ? keep + '\n\n' : '\n') + note + '\n';
  } else {
    text += '\n## Notes\n\n' + note + '\n';
  }
}

fs.writeFileSync(statusPath, text.replace(/\n/g, nl));

const result = {
  brand, job: jobId, from: current || null, to: target,
  label: states.label(target), sentence: wording.sentence(target), gate: states.gateOf(target), at: stamp, syncNeeded: true,
};
// The stepper on the board moves with the state, so the post goes out from here rather than
// from a second call the orchestrator has to remember. The state change is already on disk and is
// what counts, so a pane that is not connected, or is down, changes nothing but the reporting.
// The stages this job will actually walk, read from its own plan.
//
// A route that skips research still drew "Researching" in the pane, greyed, for the whole
// job. It never lights up, so the journey reads as though it stalled before it started.
const readPlan = () => { try { return fs.readFileSync(path.join(dir, 'plan.md'), 'utf8'); } catch { return ''; } };

// Who a person sees working on a stage, read from the plan rather than from a run
// remembering to name them. Every route names an agent on every row, so no stage of any
// route shows an empty box where the workers should be.

/**
 * The line under the stage, in this route's own words.
 *
 * The ten stage names are shared by every job, so a repurpose job that was watching a
 * reference video read as "Researching, looking at the audience and competitors". The plan
 * already names each row in plain English, and that name is what is actually happening.
 */
function substepFromPlan(state) {
  try {
    const plan = readPlan();
    const lines = plan.split(/\r?\n/).filter(l => l.trim().startsWith('|'));
    const cells = l => l.split('|').slice(1, -1).map(c => c.trim());
    const head = cells(lines.find(l => cells(l).includes('State after')) || '');
    const at = head.indexOf('State after');
    const nameAt = head.indexOf('Stage');
    if (at < 0 || nameAt < 0) return null;
    for (const line of lines) {
      const c = cells(line);
      if ((c[at] || '').replace(/`/g, '') !== state) continue;
      const said = c[nameAt] || '';
      if (said && said.length <= 60) return said;
    }
    return null;
  } catch { return null; }
}

function workersOn(stage, status) {
  try {
    return roles.workersFromPlan(readPlan(), stage, status === 'done' ? 'done' : 'working');
  } catch { return []; }
}

function plannedStages() {
  try {
    const plan = readPlan();
    if (!plan) return null;
    const header = plan.split(/\r?\n/).find(l => l.includes('State after'));
    if (!header) return null;
    const at = header.split('|').map(c => c.trim()).indexOf('State after');
    if (at < 0) return null;
    const seen = [];
    for (const line of plan.split(/\r?\n/)) {
      if (!line.trim().startsWith('|')) continue;
      const cells = line.split('|').map(c => c.trim());
      const said = (cells[at] || '').replace(/`/g, '');
      if (states.exists(said)) seen.push(said);
    }
    return stages.walkedStages(seen);
  } catch { return null; }
}

async function reportProgress() {
  const step = stages.forState(target);
  if (!step) return;
  const walk = plannedStages();
  const here = workersOn(step.stage, step.status);
  await gate.call('progress', {
    key: jobId,
    state: target,
    ...(title ? { title } : {}),
    stage: step.stage,
    ...(substepFromPlan(target) || step.substep
      ? { substep: substepFromPlan(target) || step.substep }
      : {}),
    status: step.status,
    ...(walk ? { stages: walk } : {}),
    ...(here.length ? { activities: here } : {}),
    // The state on disk is the truth, so this post outranks a workflow row reporting late.
    fromState: true,
  }, { argv });

  // Finishing a stage is not the end of the work, and the row that picks it up may not say
  // so for several minutes. Where the state machine leaves no doubt about what comes next,
  // say it here, so the pane never reads as finished while the chat is still working.
  const onward = stages.nextRunning(target, (states.get(target) || {}).next || [], walk);
  if (!onward) return;
  const next = workersOn(onward.stage, onward.status);
  await gate.call('progress', {
    key: jobId,
    ...(title ? { title } : {}),
    stage: onward.stage,
    status: onward.status,
    ...(walk ? { stages: walk } : {}),
    ...(next.length ? { activities: next } : {}),
    fromState: true,
  }, { argv });
}

// The cards for the items this state works on. Until now a card read Not started for the
// whole time a director was writing it, then jumped to Draft: the running pill on the page had
// no writer. An item already delivered once (a revision pass) keeps its own status; the
// change note has marked it, and delivery will mark it again.
async function reportItems() {
  const items = stages.itemsWorkedIn(target);
  if (!items.length) return;
  const delivered = new Set();
  try {
    for (const l of fs.readFileSync(path.join(dir, 'versions.jsonl'), 'utf8').split(/\r?\n/)) {
      if (l.trim()) delivered.add(JSON.parse(l).item);
    }
  } catch { /* nothing delivered yet */ }
  for (const item of items) {
    if (delivered.has(item)) continue;
    await gate.call('item', { key: jobId, item, status: 'running', updatedBy: by }, { argv });
  }
}

reportProgress().catch(() => { /* the pane is never allowed to fail a state change */ })
  .then(() => reportItems().catch(() => { /* same rule */ })).then(() => {
  if (json) { console.log(JSON.stringify(result, null, 2)); process.exit(0); }
  console.log('Now: ' + wording.sentence(target));
  // The mirror to a connected folder is triggered by a state change, so say so here rather
  // than making the producer remember.
  console.log('SYNC NEEDED');
});
