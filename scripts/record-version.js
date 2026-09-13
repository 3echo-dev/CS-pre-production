#!/usr/bin/env node
// Record a delivery: one line in versions.jsonl and the item on the board.
//
//   node record-version.js <client> <job-id> --item script --n 3 --note "..." --file script/v3.md [--seat script-director]
//
// Every director runs this after writing a file, so the board, the hash-bound gate record and
// the file on disk all name the same version. The version number is the director's; the hash
// is computed here, from the file as it is now. A version is never overwritten: a second call
// with the same item and number is refused, because that is exactly how an approved file
// drifts from the hash that approved it.
//
// Exit 0 recorded · 1 refused (duplicate version) · 2 usage · 3 the file is not there
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');
const board = require('./lib-board.js');
const { hashFile } = require('./hash-artifact.js');

const ITEMS = ['intake', 'scraper', 'script', 'storyboard', 'shot_list', 'budget_sheet', 'timeline',
  'audio', 'talents', 'props', 'locations', 'concept_breakdown', 'call_sheet'];

const argv = process.argv.slice(2);
const opt = name => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const { brand: client, jobId, dir } = ws.resolveJobArgs(argv, argv);
const item = opt('--item'), n = Number(opt('--n')), note = opt('--note') || '', file = opt('--file'), seat = opt('--seat') || null;
// A skeleton a person must fill (an XX item) is recorded as needs_input, so the board shows the
// tape stamp and opens the register. The plugin never records approved or na; those are human acts.
const status = opt('--status') || 'draft';
if (!['draft', 'needs_input', 'running', 'needs_review'].includes(status)) { console.error('--status must be draft, needs_input, running or needs_review'); process.exit(2); }
if (!client || !jobId || !ITEMS.includes(item) || !Number.isInteger(n) || n < 1 || !file) {
  console.error('usage: record-version.js <client> <job-id> --item <' + ITEMS.join('|') + '> --n <1..> --file <path relative to the job> [--note "..."] [--seat <agent>] [--status draft|needs_input]');
  process.exit(2);
}
const abs = path.join(dir, file);
if (!fs.existsSync(abs)) { console.error('The file is not there: ' + ws.fwd(abs)); process.exit(3); }
// A directory version (a storyboard folder) hashes its panels.md; a file hashes itself.
const target = fs.statSync(abs).isDirectory() ? path.join(abs, 'panels.md') : abs;
if (!fs.existsSync(target)) { console.error('A folder version needs a panels.md inside it: ' + ws.fwd(target)); process.exit(3); }

const log = path.join(dir, 'versions.jsonl');
let lines = [];
try { lines = fs.readFileSync(log, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l)); } catch { lines = []; }
if (lines.some(v => v.item === item && Number(v.n) === n)) {
  console.error('REFUSED: ' + item + ' v' + n + ' is already recorded. A new delivery is a new number.');
  process.exit(1);
}
const h = hashFile(target);
const rel = path.relative(dir, target).split(path.sep).join('/');
const at = ws.now(client, argv);
const rec = { item, n, note, path: rel, hash: h.sha256, bytes: h.bytes, seat, at };
fs.appendFileSync(log, JSON.stringify(rec) + '\n');

(async () => {
  await board.call('version', { key: jobId, item, n, note, path: rel, hash: h.sha256, seat, at }, { argv });
  await board.call('item', { key: jobId, item, status, version: n, summary: note, artifactPath: rel, hash: h.sha256, updatedBy: seat || 'pipeline' }, { argv });
  if (argv.includes('--json')) console.log(JSON.stringify(rec, null, 2));
  else console.log(item + ' v' + n + ' recorded: ' + rel + ' (' + h.sha256.slice(0, 12) + '). Queued for the board.');
})();
