// Which job a run is working on, when nothing told it.
//
// A hook event carries no job id, and asking for one would mean a setting somebody has to
// remember and keep correct. A workspace usually holds exactly one job that has not finished,
// and that is the one being worked on. Where several are open, the run is in whichever moved
// most recently. Where none is open there is nothing to report on.
//
// `heartbeat.js` worked this out for itself and `turn.js` needs the same answer plus the
// folder, so the resolution lives here once rather than drifting into two versions that
// disagree about which job a card belongs to.
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');
const states = require('./lib-states.js');

const STATE_LINE = /\*\*Current state:\*\*\s*`?([A-Z_]+)`?/;

/** The state id written in a `status.md`, or null when there is not one. */
const stateIn = (text) => (String(text || '').match(STATE_LINE) || [])[1] || null;

/**
 * The open job with the most recently touched `status.md`, or null.
 *
 * Returns `{ at, brand, jobId, dir, status, state, text }`, so a caller that only wants the
 * key and one that wants to read the whole file both get what they came for from one walk.
 *
 * `includeFinished` is for callers like the token counter, which attach to whatever the run
 * last touched even after it is done. The default leaves a finished job out: `next: []` is
 * how the state table spells "nothing follows this".
 */
function openJob(argv, options) {
  const opts = options || {};
  let brands;
  try { brands = fs.readdirSync(ws.brandsDir(argv), { withFileTypes: true }); } catch { return null; }
  const root = ws.brandsDir(argv);
  let best = null;
  for (const brand of brands) {
    if (!brand.isDirectory() || brand.name.startsWith('.')) continue;
    const jobs = path.join(root, brand.name, 'jobs');
    let entries = [];
    try { entries = fs.readdirSync(jobs); } catch { continue; }
    for (const job of entries) {
      const dir = path.join(jobs, job);
      const status = path.join(dir, 'status.md');
      let at = null;
      let text = '';
      try {
        at = fs.statSync(status).mtimeMs;
        text = fs.readFileSync(status, 'utf8');
      } catch { continue; }
      const state = stateIn(text);
      const done = state && states.exists(state) && (states.get(state).next || []).length === 0;
      if (done && !opts.includeFinished) continue;
      if (!best || at > best.at) best = { at, brand: brand.name, jobId: job, dir, status, state, text };
    }
  }
  return best;
}

module.exports = { openJob, stateIn, STATE_LINE };
