#!/usr/bin/env node
// What job this folder is working on, in one answer.
//
//   node job-context.js            one sentence a person can read
//   node job-context.js --json     the same facts as JSON, for a hook
//
// Six scripts already work this out for themselves in slightly different ways: `heartbeat.js`
// and `turn.js` find the open job, `export-events.js` reads the credit tally out of
// `status.md`, `turn.js` decides which of the ten stages a state belongs to. A function hook
// cannot require any of that, because it runs in the engine's worker rather than in node, so
// it asks for the answer through `$.process.run`. That is what this exists to answer.
//
// It resolves nothing itself. Every fact below comes from the library that owns it:
// `lib-workspace.js` for the root, `lib-open-job.js` for which job is open, `lib-states.js`
// for whether the state is a gate, `lib-wording.js` for the sentence a person reads, and
// `hooks/turn.js` for the `**Name:** value` reader and the stage lookup it already had to
// write. A second copy of any of those is a second answer waiting to disagree.
//
// It never touches the network, so it costs the same in a folder that is not the pipeline's,
// and it always exits 0 with a whole answer: a hook that has to tell an exit code
// apart from a crash is a hook that fails closed on a folder with no jobs in it yet.
const ws = require('./lib-workspace.js');
const jobs = require('./lib-open-job.js');
const states = require('./lib-states.js');
const wording = require('./lib-wording.js');
const board = require('./lib-board.js');
const turn = require('./hooks/turn.js');

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');

// `**Credits spent:** 12 of 30`, the line `export-events.js` reads for `credits.tallied`.
const CREDITS = /\*\*Credits spent:\*\*\s*([0-9.]+)\s*of\s*([0-9.]+)/;

function creditsIn(text) {
  const hit = String(text || '').match(CREDITS);
  if (!hit) return { spent: null, ceiling: null };
  const spent = Number(hit[1]);
  const ceiling = Number(hit[2]);
  return {
    spent: Number.isFinite(spent) ? spent : null,
    ceiling: Number.isFinite(ceiling) ? ceiling : null,
  };
}

function context() {
  const root = ws.root(argv);
  const empty = {
    root: ws.fwd(root),
    brand: null,
    client: null,
    jobId: null,
    dir: null,
    state: null,
    sentence: null,
    gate: null,
    isTheirTurn: false,
    stage: null,
    creditsSpent: null,
    creditsCeiling: null,
    openQuestion: null,
    openGate: null,
    landedAt: null,
  };

  let job = null;
  try { job = jobs.openJob(argv); } catch { return empty; }
  if (!job) return empty;

  const isTheirTurn = turn.isTheirTurn(job.state);
  const gate = states.gateOf(job.state);
  const credits = creditsIn(job.text);

  // The question, in the job's own words, taken the way `turn.js` takes it for the pane:
  // `Blocked on` names the missing thing, `Next action` names the work that would follow, and
  // the first is the better of the two when a job carries both.
  const asked = isTheirTurn ? turn.whyItIsTheirTurn(job.text) : null;

  return {
    root: ws.fwd(root),
    brand: job.brand,
    client: job.brand,
    jobId: job.jobId,
    dir: ws.fwd(job.dir),
    state: job.state,
    sentence: job.state ? wording.sentence(job.state) : null,
    gate,
    isTheirTurn,
    stage: turn.stageFor(job.state, job.text),
    creditsSpent: credits.spent,
    creditsCeiling: credits.ceiling,
    openQuestion: asked,
    // A gate the person still has to decide, as opposed to a gate the job has walked past.
    openGate: isTheirTurn ? gate : null,
    // When the board was last landed for this job, so a hook can say how stale the run's view is.
    landedAt: (() => { try { return (board.landed(job.jobId, argv) || {}).landedAt || null; } catch { return null; } })(),
  };
}

/** The plain-English form, for whoever ran this by hand. No ids, no paths that are not a folder. */
function say(c) {
  if (!c.jobId) return 'No job is open here. Nothing is waiting on anyone.';
  const lines = [c.brand + ', ' + c.jobId + '. ' + (c.sentence || 'Working on it.')];
  if (c.creditsCeiling !== null) {
    lines.push(c.creditsSpent + ' of ' + c.creditsCeiling + ' credits used so far.');
  }
  if (c.isTheirTurn && c.openQuestion) lines.push(c.openQuestion);
  return lines.join('\n');
}

if (require.main === module) {
  let c;
  try {
    c = context();
  } catch (err) {
    // Rule of this file: always a whole answer. A folder nobody has scaffolded yet is the
    // normal case at the start of a session, not a failure to report.
    c = { root: ws.fwd(process.cwd()), brand: null, client: null, jobId: null, dir: null, state: null,
      sentence: null, gate: null, isTheirTurn: false, stage: null, creditsSpent: null,
      creditsCeiling: null, openQuestion: null, openGate: null, landedAt: null, unreadable: String(err && err.message || err) };
  }
  process.stdout.write((asJson ? JSON.stringify(c) : say(c)) + '\n');
}

module.exports = { context, creditsIn, say, CREDITS };
