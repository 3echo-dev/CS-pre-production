#!/usr/bin/env node
// Does the compiled breakdown say what the source records say?
//
//   node breakdown-check.js <client> <job-id> [--sample 3] [--json]
//
// Reads breakdown.xlsx (or breakdown.csv), shot-list.csv and the landed registers. Three
// things are checked, because they are the three ways a compiled table has gone wrong on
// real jobs: a sample of rows must trace back to a shot in the shot list and to register
// rows for the talents and locations it names; the two same-label client-input columns of
// the client's template must both still be there, as separate columns; and a shot must not appear
// twice, which is what a row continued across a page break turns into.
//
// Writes validation/breakdown-check.md. Exit 0 pass · 1 fail · 2 usage · 3 a file is missing
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');
const { readRows, parseCsv } = require('./lib-xlsx.js');

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const opt = name => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const sampleN = Number(opt('--sample') || 3);
const { brand: client, jobId, dir } = ws.resolveJobArgs(argv, argv);
if (!client || !jobId) { console.error('usage: breakdown-check.js <client> <job-id> [--sample N] [--json]'); process.exit(2); }

const breakdownPath = ['breakdown.xlsx', 'breakdown.csv'].map(f => path.join(dir, f)).find(p => fs.existsSync(p));
const shotPath = path.join(dir, 'shot-list.csv');
if (!breakdownPath) { console.error('No breakdown.xlsx or breakdown.csv under ' + ws.fwd(dir) + '.'); process.exit(3); }
if (!fs.existsSync(shotPath)) { console.error('No shot-list.csv under ' + ws.fwd(dir) + '.'); process.exit(3); }

const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const findCol = (header, ...names) => header.findIndex(h => names.includes(norm(h)));
const register = name => {
  try { const d = JSON.parse(fs.readFileSync(path.join(dir, 'registers', name + '.json'), 'utf8')); return d && d.na ? { na: true, rows: [] } : { na: false, rows: Array.isArray(d) ? d : (d.rows || []) }; }
  catch { return null; }
};
const talents = register('talents'), locations = register('locations');

let rows;
try { rows = readRows(breakdownPath); } catch (e) { console.error('cannot read ' + path.basename(breakdownPath) + ': ' + e.message); process.exit(3); }
const header = rows[0] || [];
const body = rows.slice(1).filter(r => r.some(c => c));
const shots = parseCsv(fs.readFileSync(shotPath, 'utf8'));
const sh = shots[0] || [];
const shotIds = new Set(shots.slice(1).map(r => r[sh.indexOf('shot_id')]).filter(Boolean));

const problems = [], notes = [];
const cShot = findCol(header, 'shotid', 'shot', 'ss', 's');
const cTalent = findCol(header, 'talent', 'talents', 'cast');
const cLoc = findCol(header, 'location', 'loc');
if (cShot < 0) problems.push('no shot column (S/s or shot_id) in the breakdown header');

// The two client-input columns carry the same label in the client's template. They are two columns,
// and a compiler that merged them on the label lost half the client's answers.
const clientCols = header.map((h, i) => (/client/i.test(String(h)) ? i : -1)).filter(i => i >= 0);
if (clientCols.length < 2) problems.push('the two client-input columns are not both present (found ' + clientCols.length + ')');
else notes.push('client-input columns kept separate at ' + clientCols.map(i => i + 1).join(' and '));

// Duplicates: a continued row is the same shot twice.
if (cShot >= 0) {
  const seen = new Map();
  body.forEach((r, i) => { const id = r[cShot]; if (!id) return; if (seen.has(id)) problems.push('shot ' + id + ' appears twice (rows ' + (seen.get(id) + 2) + ' and ' + (i + 2) + '): a continued row became a duplicate'); else seen.set(id, i); });
}

// The sample: evenly spaced rows, traced back to their sources.
if (cShot >= 0 && body.length) {
  const step = Math.max(1, Math.floor(body.length / Math.max(1, sampleN)));
  const picked = [];
  for (let i = 0; i < body.length && picked.length < sampleN; i += step) picked.push(i);
  for (const i of picked) {
    const r = body[i], line = i + 2, id = r[cShot];
    if (!id) { problems.push('row ' + line + ': no shot id'); continue; }
    if (!shotIds.has(id)) problems.push('row ' + line + ': shot ' + id + ' is not in shot-list.csv');
    if (cTalent >= 0 && r[cTalent] && talents && !talents.na) {
      for (const name of String(r[cTalent]).split(/[,;/]/).map(s => s.trim()).filter(Boolean)) {
        if (!talents.rows.some(t => norm(t.name) === norm(name))) problems.push('row ' + line + ': talent "' + name + '" is not in the talents register');
      }
    }
    if (cLoc >= 0 && r[cLoc] && locations && !locations.na) {
      if (!locations.rows.some(l => norm(l.name) === norm(r[cLoc]))) problems.push('row ' + line + ': location "' + r[cLoc] + '" is not in the locations register');
    }
  }
  notes.push('sampled rows ' + picked.map(i => i + 2).join(', ') + ' of ' + body.length);
}
// Blank, N/A and client-to-advise are three different things; a cell that reads N/A where the
// register says unknown is a decision nobody made.
let naCells = 0;
for (const r of body) for (const c of r) if (/^n\/?a$/i.test(String(c).trim())) naCells++;
if (naCells) notes.push(naCells + ' cell' + (naCells === 1 ? '' : 's') + ' read N/A; each must trace to a not-applicable decision on the board');

const result = { valid: !problems.length, rows: body.length, problems, notes };
fs.mkdirSync(path.join(dir, 'validation'), { recursive: true });
fs.writeFileSync(path.join(dir, 'validation', 'breakdown-check.md'), [
  '# Breakdown check', '', '- Rows: ' + body.length, notes.map(n => '- ' + n).join('\n'), '',
  problems.length ? '## Problems\n\n' + problems.map(p => '- ' + p).join('\n') : 'No problems. The sample traces back to its sources.', '',
].join('\n'));
if (json) console.log(JSON.stringify(result, null, 2));
else {
  for (const n of notes) console.log('note: ' + n);
  for (const p of problems) console.error('PROBLEM: ' + p);
  console.log(problems.length ? 'The breakdown is refused: ' + problems.length + ' problem' + (problems.length === 1 ? '' : 's') + '.' : 'ok: ' + body.length + ' rows, sample traced, client-input columns intact, no duplicates.');
}
process.exit(problems.length ? 1 : 0);
