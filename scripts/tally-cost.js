#!/usr/bin/env node
// What a project has cost so far, for the board: tokens and turns from every recorded run,
// per item and in total, and the 3echo credits from status.md.
//
//   node tally-cost.js <client> <job-id>          queue the tally for the board (then push)
//   node tally-cost.js <client> <job-id> --json   print it, queue nothing
//
// record-run.js calls tally() after every run, so the board stays current without a separate
// step; run this by hand to back-fill a job recorded before the tally existed. The numbers are
// the directors' runs only: the orchestrator's own session is not a run and is not counted, and
// a run recorded without --tokens counts as a run with no tokens (the board says how many).
//
// Exit 0 done · 2 usage
const fs = require('fs');
const path = require('path');

const CREDITS = /\*\*Credits spent:\*\*\s*([0-9.]+)\s*of\s*([0-9.]+)/;

function tally(dir) {
  const byItem = {};
  let tokens = 0, turns = 0, runs = 0, untracked = 0;
  let files = [];
  try { files = fs.readdirSync(path.join(dir, 'runs')).filter(f => /-v\d+\.json$/.test(f)); } catch { files = []; }
  for (const f of files) {
    let r; try { r = JSON.parse(fs.readFileSync(path.join(dir, 'runs', f), 'utf8')); } catch { continue; }
    if (!r || !r.item) continue;
    const t = Number(r.tokens), u = Number(r.turns);
    const row = byItem[r.item] = byItem[r.item] || { tokens: 0, turns: 0, runs: 0, models: [] };
    row.runs++; runs++;
    if (Number.isFinite(t) && r.tokens != null) { row.tokens += t; tokens += t; } else untracked++;
    if (Number.isFinite(u) && r.turns != null) { row.turns += u; turns += u; }
    if (r.model && !row.models.includes(r.model)) row.models.push(r.model);
  }
  let creditsSpent = null, creditsCeiling = null;
  try {
    const hit = fs.readFileSync(path.join(dir, 'status.md'), 'utf8').match(CREDITS);
    if (hit) { creditsSpent = Number(hit[1]); creditsCeiling = Number(hit[2]); }
  } catch { /* no status yet */ }
  return { tokens, turns, runs, untracked, byItem, creditsSpent, creditsCeiling };
}

// Queue the tally as a `cost` post; board-sync merges it into the project document.
async function queue(board, jobId, dir, argv) {
  const cost = tally(dir);
  await board.call('cost', { key: jobId, ...cost }, { argv });
  return cost;
}

module.exports = { tally, queue };

if (require.main === module) {
  const ws = require('./lib-workspace.js');
  const board = require('./lib-board.js');
  const argv = process.argv.slice(2);
  const { brand: client, jobId, dir } = ws.resolveJobArgs(argv, argv);
  if (!client || !jobId) {
    console.error('Nothing was tallied. usage: tally-cost.js <client> <job-id> [--json]');
    process.exit(2);
  }
  if (argv.includes('--json')) { console.log(JSON.stringify(tally(dir), null, 2)); process.exit(0); }
  queue(board, jobId, dir, argv).then(c => {
    console.log('Cost queued for the board: ' + c.tokens.toLocaleString('en-US') + ' tokens over ' + c.runs + ' run' + (c.runs === 1 ? '' : 's') +
      (c.untracked ? ' (' + c.untracked + ' without a token count)' : '') +
      (c.creditsSpent != null ? ', ' + c.creditsSpent + ' of ' + c.creditsCeiling + ' credits' : '') + '. Run push next.');
  });
}
