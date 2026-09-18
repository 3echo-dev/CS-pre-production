#!/usr/bin/env node
// Record a human verdict at a gate, bound to the artifacts' content hashes at decision time.
//
//   node record-approval.js <client> <job-id> <A|B|C|sample> <approve|edit|change|start over> --by "Name"
//        [--comment "..."] [--decided-at "<board time>"] [--max-credits N] [--chosen PANEL-ID]
//        (--max-credits: what the batch may spend from now on, not counting panels already drawn)
//        [--score 1-5] [--why "..."] [--channel chat|board|file] [--from-chat] [--publish-plan]
//        <file-relative-to-job...>
//
// This header and the usage line the script prints are the same call: the header once listed
// options the usage line did not, and a call built from it failed. The verdict words people use
// (approved, ok, yes, changes, reject, redo ...) map onto the four above through SYNONYMS.
// Writes approvals/<gate>-<round>.json validated against schemas/approval.schema.json.
// "edit" means the human changed the file and approves it as it now is.
// Exit 0 ok · 1 refused (a bad value, a missing artifact, a failed state move) · 2 usage.
// On exit 1 or 2 nothing was written, and the first line of stderr says so.
const fs = require('fs');
const path = require('path');
const { hashFile } = require('./hash-artifact.js');
const { validate } = require('./validate-schema.js');
const ws = require('./lib-workspace.js');
const states = require('./lib-states.js');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const pos = [], opts = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2);
    if (['publish-plan', 'from-chat', 'from-board'].includes(k)) opts[k] = true;
    else opts[k] = argv[++i];
  } else pos.push(a);
}
// A, B and C are the 1-22 gates. `sample` is the one storyboard panel approved before the batch is
// generated; it moves no state, it only unlocks make-image.
const GATES = ['A', 'B', 'C', 'sample'];
// One vocabulary, with the words people actually use mapped onto it.
const SYNONYMS = {
  approve: 'approve', approved: 'approve', ok: 'approve', yes: 'approve', go: 'approve', ship: 'approve',
  edit: 'edit',
  change: 'change', changes: 'change', update: 'change', revise: 'change', fix: 'change',
  'start-over': 'start over', startover: 'start over', reject: 'start over', no: 'start over', redo: 'start over',
};
const VERDICTS = { approve: 'approved', edit: 'approved', change: 'changes_requested', 'start over': 'rejected' };

// The vocabulary is the export; recording a verdict is not. `hooks/lib.mjs` carries a copy
// of SYNONYMS, because a function hook cannot require a CommonJS script. Required rather than run,
// this file stops here: everything below writes a file and moves a job.
module.exports = { GATES, SYNONYMS, VERDICTS };
if (require.main !== module) return;

const { brand, jobId: job, dir, rest } = ws.resolveJobArgs(pos, argv);
const [gate, rawVerdict, ...files] = rest;
const verdict = SYNONYMS[String(rawVerdict || '').toLowerCase()] || rawVerdict;
const missing = [];
if (!brand) missing.push('the client');
if (!job) missing.push('the job id');
if (!GATES.includes(gate)) missing.push('a gate (' + GATES.join(', ') + ')' + (gate ? ', not "' + gate + '"' : ''));
if (!VERDICTS[verdict]) missing.push('a verdict (approve, edit, change, start over)' + (rawVerdict ? ', not "' + rawVerdict + '"' : ''));
if (!opts.by) missing.push('--by "Name"');
if (!files.length) missing.push('at least one file, relative to the job folder');
if (missing.length) {
  // Say what did not happen before saying how to call it: a usage line on its own has been read as success.
  console.error('Nothing was recorded. This call needs ' + missing.join('; ') + '.');
  console.error('usage: record-approval.js <client> <job-id> <' + GATES.join('|') + '> <approve|edit|change|start over> --by "Name" [--comment "..."] [--decided-at "<board time>"] [--max-credits N] [--chosen PANEL-ID] [--score 1-5] [--why "..."] [--channel chat|board|file] [--from-chat] [--publish-plan] <file...>');
  process.exit(2);
}
// The gate-app widget returns a 1-5 rating and a sentence with the verdict. Both are optional,
// because a verdict typed in chat carries neither, and both are validated when present.
const score = opts.score !== undefined ? Number(opts.score) : null;
if (opts.score !== undefined && (!Number.isInteger(score) || score < 1 || score > 5)) {
  console.error('REFUSED: --score must be an integer from 1 to 5');
  process.exit(1);
}
const jobDir = dir;
// Which gates this route kept decides where "start over" lands: a static post with no concept
// gate rolls back to the brief. A job folder without a readable route.json still records a
// verdict, it just gets the route-independent answer.
const routeGates = () => {
  try { return JSON.parse(fs.readFileSync(path.join(jobDir, 'route.json'), 'utf8')).gates || []; }
  catch { return []; }
};
const isApproval = VERDICTS[verdict] === 'approved';
const maxCredits = opts['max-credits'] !== undefined ? Number(opts['max-credits']) : null;
// Credits are whole. A fraction is a typo, not a budget.
if (opts['max-credits'] !== undefined && (!Number.isInteger(maxCredits) || maxCredits < 0)) {
  console.error('REFUSED: --max-credits must be a finite non-negative number');
  process.exit(1);
}
// The sample approval is the one that unlocks a spend, so it is the one that has to carry the
// figure the person agreed to: a batch nobody put a number against is a batch nobody authorised.
// The figure is what may be spent from here on. Panels already on disk are counted now and
// written beside it, so the preflight and the spend guard add the two rather than reading the
// batch figure as the whole board.
if (gate === 'sample' && isApproval && maxCredits === null) {
  console.error('REFUSED: an approved sample must include --max-credits: the credits the batch may spend from now on, not counting panels already drawn; 0 when no more panels may be generated');
  process.exit(1);
}
const panelsOnDisk = (() => {
  if (gate !== 'sample') return null;
  try {
    const root = path.join(jobDir, 'storyboard');
    const vs = fs.readdirSync(root).filter(f => /^v\d+$/.test(f)).map(f => Number(f.slice(1))).sort((a, b) => a - b);
    if (!vs.length) return { boardVersion: null, count: 0 };
    const v = vs[vs.length - 1];
    return { boardVersion: v, count: fs.readdirSync(path.join(root, 'v' + v)).filter(f => /^P\d{2,}\.(png|jpe?g|webp)$/i.test(f)).length };
  } catch { return { boardVersion: null, count: 0 }; }
})();
const apDir = path.join(jobDir, 'approvals');
fs.mkdirSync(apDir, { recursive: true });
const prev = fs.readdirSync(apDir).filter(f => f.startsWith(gate + '-') && f.endsWith('.json'))
  .map(f => +f.slice(gate.length + 1, -5)).filter(n => !isNaN(n)).sort((a, b) => a - b);
const round = (prev[prev.length - 1] || 0) + 1;

const artifacts = [];
for (const f of files) {
  const p = path.join(jobDir, f);
  if (!fs.existsSync(p)) { console.error('Nothing was recorded. Missing artifact: ' + f + ' (looked in ' + ws.fwd(jobDir) + ').'); process.exit(1); }
  const h = hashFile(p);
  artifacts.push({ path: f.split(path.sep).join('/'), sha256: h.sha256, bytes: h.bytes });
}
// An approval is an audit record, so it carries the workspace's zone, not the process's. A
// decision made on the board keeps the board's own time, so the record says when the person
// actually decided rather than when the orchestrator got round to landing it.
const when = opts['decided-at'] || ws.now(brand, process.argv);

const rec = {
  schemaVersion: '1.0', approvalId: gate + '-' + round, jobId: job, brand, client: brand, gate, round,
  decision: VERDICTS[verdict], edited: verdict === 'edit', artifacts,
  decidedBy: opts.by, decidedAt: when, channel: opts.channel === 'file' ? 'file' : (opts.channel === 'board' || opts['from-board'] ? 'board' : 'chat'),
  comment: opts.comment || '',
  ...(score !== null ? { score } : {}),
  ...(opts.why ? { why: opts.why } : {}),
  // A pick_one gate returns the one panel the human chose; the rest were dropped, not rejected.
  ...(opts.chosen ? { chosen: opts.chosen } : {}),
  scope: {
    publishPlanIncluded: !!opts['publish-plan'], maxSpendCredits: maxCredits,
    ...(panelsOnDisk ? { panelsOnDisk: panelsOnDisk.count, boardVersion: panelsOnDisk.boardVersion } : {}),
  },
  supersedes: prev.length ? gate + '-' + prev[prev.length - 1] : null,
};
const errs = validate(JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', 'approval.schema.json'), 'utf8')), rec);
if (errs.length) { console.error('record fails schema: ' + errs.map(e => e.path + ' ' + e.message).join('; ')); process.exit(1); }
const out = path.join(apDir, rec.approvalId + '.json');
fs.writeFileSync(out, JSON.stringify(rec, null, 2) + '\n');
if (argv.includes('--human')) {
  const said = { approve: 'Approved', change: 'Noted, changes wanted', 'start over': 'Starting that over' };
  console.log((said[rec.decision] || rec.decision) + (rec.edited ? ', with your edits' : '') + '.');
} else {
  console.log(rec.decision + (rec.edited ? ' (edited)' : '') + ': ' + out.split(path.sep).join('/'));
  for (const a of artifacts) console.log('  ' + a.sha256.slice(0, 12) + '  ' + a.path);
}

// A verdict typed in the chat has to reach the board too, or the board goes on asking for
// something the person has already decided. --from-chat queues the same verdict as a council
// message; the board's own gate record is only ever written by a person on the board.
if (opts['from-chat']) {
  const board = require('./lib-board.js');
  board.call('message', {
    key: job, by: rec.decidedBy,
    text: (gate === 'sample' ? 'Storyboard sample' : 'Gate ' + gate) + ': ' + rec.decision.replace('_', ' ') + ' in chat' + (rec.comment ? '. ' + rec.comment : '.'),
    item: gate === 'sample' ? 'storyboard' : null,
  }, { argv }).catch(() => { /* the board never fails a recorded approval */ });
}

// Move the state here, so an approval and the state it implies cannot drift apart.
// approve or edit -> the gate's approved state; change -> CHANGES_REQUESTED;
// start over -> the gate's rollback. The sample is not a gate of the state machine.
const target = gate === 'sample' ? null : rec.decision === 'approved'
  ? states.APPROVED_STATE[gate]
  : (rec.decision === 'changes_requested'
      ? 'CHANGES_REQUESTED'
      : states.rollbackFor(states.AWAITING_STATE[gate], routeGates()));

if (target) {
  const note = rec.decision === 'approved'
    ? 'Approved by ' + rec.decidedBy + (rec.comment ? ': ' + rec.comment : '')
    : (rec.comment || 'Sent back by ' + rec.decidedBy);
  const move = spawnSync(process.execPath,
    [path.join(__dirname, 'set-state.js'), brand, job, target, '--by', rec.decidedBy, '--note', note]
      // Without --root the child resolves the workspace from cwd and moves a same-named job elsewhere.
      .concat(argv.includes('--root') ? ['--root', argv[argv.indexOf('--root') + 1]] : []),
    { encoding: 'utf8' });
  if (move.status === 0) {
    process.stdout.write(move.stdout);
  } else if (move.status === 3) {
    // No status.md to move: a job folder that this pipeline did not scaffold. The record is
    // still valid, and there is no state to drift from, so this is a note rather than a failure.
    console.error('Recorded. There is no status.md for this job, so nothing was moved to ' + target + '.');
  } else {
    // The record is written and correct; only the state move failed, so say exactly that.
    console.error('The decision was recorded, but the job could not be moved to ' + target + ':');
    console.error((move.stderr || '').trim());
    console.error('Move it with: set-state.js ' + brand + ' ' + job + ' ' + target + ' --by "' + rec.decidedBy + '"');
    process.exit(1);
  }
}
