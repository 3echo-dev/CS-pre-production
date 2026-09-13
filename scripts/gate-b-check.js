#!/usr/bin/env node
// May Gate B be asked for? Every register is entered or explicitly not applicable, and audio
// is on disk. Unknown is not the same as not applicable, so a row with a blank field fails
// unless somebody marked that blank as a decision.
//
//   node gate-b-check.js <client> <job-id> [--json]
//
// Registers are registers/{talents,props,locations}.json, landed from the board:
//   { "na": true, "by": "assistant", "at": "..." }            the item is not applicable to this job
//   { "rows": [ { "name": "...", ..., "unknownByDecision": true } ] }
// Exit 0 pass · 1 fail (names the row) · 2 usage · 3 audio.md or a register file is missing
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');

const FIELDS = {
  talents: ['name', 'picture', 'age', 'availability', 'cost', 'loading'],
  props: ['name', 'scene', 'source', 'have'],
  locations: ['name', 'address', 'availability', 'contact'],
};

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const { brand: client, jobId, dir } = ws.resolveJobArgs(argv, argv);
if (!client || !jobId) { console.error('usage: gate-b-check.js <client> <job-id> [--json]'); process.exit(2); }

const problems = [], notes = [];
if (!fs.existsSync(path.join(dir, 'audio.md'))) { console.error('audio.md is not on disk yet.'); process.exit(3); }
for (const reg of Object.keys(FIELDS)) {
  const p = path.join(dir, 'registers', reg + '.json');
  if (!fs.existsSync(p)) { console.error('registers/' + reg + '.json is not landed yet. Read the register from the board and land it.'); process.exit(3); }
  let data;
  try { data = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { problems.push(reg + ': not JSON (' + e.message + ')'); continue; }
  if (data && data.na === true) {
    if (!data.by) problems.push(reg + ': marked not applicable but nobody is named as deciding it');
    else notes.push(reg + ': not applicable, decided by ' + data.by);
    continue;
  }
  const rows = Array.isArray(data) ? data : (Array.isArray(data.rows) ? data.rows : []);
  if (!rows.length) { problems.push(reg + ': no rows entered and not marked not applicable'); continue; }
  rows.forEach((row, i) => {
    const blank = FIELDS[reg].filter(f => !String(row[f] == null ? '' : row[f]).trim());
    if (!blank.length) return;
    if (row.unknownByDecision === true) { notes.push(reg + ' row ' + (row.name || i + 1) + ': ' + blank.join(', ') + ' left unknown by decision'); return; }
    problems.push(reg + ' row ' + (row.name || '#' + (i + 1)) + ': ' + blank.join(', ') + ' blank and not marked unknown by decision');
  });
  notes.push(reg + ': ' + rows.length + ' row' + (rows.length === 1 ? '' : 's'));
}
const result = { valid: !problems.length, problems, notes };
if (json) console.log(JSON.stringify(result, null, 2));
else {
  for (const n of notes) console.log('note: ' + n);
  for (const p of problems) console.error('PROBLEM: ' + p);
  console.log(problems.length ? 'Gate B cannot be asked for yet.' : 'ok: every register is entered or not applicable, and audio is on disk. Gate B can be asked for.');
}
process.exit(problems.length ? 1 : 0);
