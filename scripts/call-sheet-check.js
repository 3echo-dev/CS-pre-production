#!/usr/bin/env node
// A call sheet may only name people and places that are known.
//
//   node call-sheet-check.js <client> <job-id> [--json]
//
// Reads every call-sheets/day-{d}.xlsx (or .csv) and the landed registers. Every row's talent
// and location must resolve to a register row whose availability is filled in, not unknown:
// a sheet that calls a talent nobody has confirmed is a shoot day that does not happen.
// Shooting order is checked against the breakdown when one is on disk (rows keep the
// breakdown's order, never renumbered), overnight blocks are computed from call and wrap
// times, and two units sharing a talent or a location at the same hour are flagged.
//
// Writes validation/call-sheet-check.md. Exit 0 pass · 1 fail · 2 usage · 3 nothing to check
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');
const { readRows } = require('./lib-xlsx.js');

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const { brand: client, jobId, dir } = ws.resolveJobArgs(argv, argv);
if (!client || !jobId) { console.error('usage: call-sheet-check.js <client> <job-id> [--json]'); process.exit(2); }

const sheetsDir = path.join(dir, 'call-sheets');
let sheets = [];
try { sheets = fs.readdirSync(sheetsDir).filter(f => /^day-\d+\.(xlsx|csv)$/i.test(f)).sort(); } catch { sheets = []; }
if (!sheets.length) { console.error('No call sheets under ' + ws.fwd(sheetsDir) + '.'); process.exit(3); }

const register = name => {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(dir, 'registers', name + '.json'), 'utf8'));
    if (d && d.na === true) return { na: true, rows: [] };
    return { na: false, rows: Array.isArray(d) ? d : (d.rows || []) };
  } catch { return null; }
};
const talents = register('talents'), locations = register('locations');
if (!talents || !locations) { console.error('The talents and locations registers must be landed before a call sheet is checked.'); process.exit(3); }
const known = (reg, name) => {
  if (!name) return { ok: true };
  if (reg.na) return { ok: false, why: 'the register is marked not applicable' };
  const row = reg.rows.find(r => String(r.name || '').trim().toLowerCase() === String(name).trim().toLowerCase());
  if (!row) return { ok: false, why: 'not in the register' };
  if (!String(row.availability || '').trim() || /^unknown$/i.test(String(row.availability))) return { ok: false, why: 'availability is unknown' };
  return { ok: true };
};

// Column lookup by header words, so the HTF layout and a CSV fixture both read.
const findCol = (header, ...names) => header.findIndex(h => names.some(n => String(h).toLowerCase().replace(/[^a-z]/g, '') === n));
const minutes = t => { const m = String(t || '').match(/^(\d{1,2})[:.](\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

let breakdownOrder = null;
for (const f of ['breakdown.csv', 'breakdown.xlsx']) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) continue;
  try {
    const rows = readRows(p);
    const h = rows[0] || [];
    const sc = findCol(h, 'shotid', 'shot', 'ss', 's');
    if (sc >= 0) breakdownOrder = rows.slice(1).map(r => r[sc]).filter(Boolean);
  } catch { /* an unreadable breakdown is breakdown-check's problem */ }
  break;
}

const problems = [], notes = [];
const byHour = {};
for (const f of sheets) {
  let rows;
  try { rows = readRows(path.join(sheetsDir, f)); } catch (e) { problems.push(f + ': cannot read (' + e.message + ')'); continue; }
  const h = rows[0] || [];
  const cShot = findCol(h, 'shotid', 'shot', 'ss'), cTalent = findCol(h, 'talent', 'talents', 'cast'), cLoc = findCol(h, 'location', 'loc');
  const cCall = findCol(h, 'call', 'calltime', 'start'), cWrap = findCol(h, 'wrap', 'end'), cUnit = findCol(h, 'unit');
  if (cTalent < 0 && cLoc < 0) { problems.push(f + ': no talent or location column found in the header'); continue; }
  const order = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    if (!r.some(c => c)) return;
    const shot = cShot >= 0 ? r[cShot] : '';
    if (shot) order.push(shot);
    for (const name of (cTalent >= 0 ? String(r[cTalent] || '').split(/[,;/]/) : [])) {
      const k = known(talents, name.trim());
      if (!k.ok) problems.push(f + ' line ' + line + ': talent "' + name.trim() + '" ' + k.why);
    }
    if (cLoc >= 0 && r[cLoc]) { const k = known(locations, r[cLoc]); if (!k.ok) problems.push(f + ' line ' + line + ': location "' + r[cLoc] + '" ' + k.why); }
    const call = cCall >= 0 ? minutes(r[cCall]) : null, wrap = cWrap >= 0 ? minutes(r[cWrap]) : null;
    if (call !== null && wrap !== null) {
      const span = wrap >= call ? wrap - call : wrap + 24 * 60 - call;
      if (wrap < call) notes.push(f + ' line ' + line + ': overnight block, ' + Math.round(span / 60 * 10) / 10 + ' h');
      const unit = cUnit >= 0 ? (r[cUnit] || '1') : '1';
      for (let m = call; m < call + span; m += 60) {
        const hour = (Math.floor(m / 60) % 24);
        const slot = f + ':' + hour;
        byHour[slot] = byHour[slot] || [];
        for (const who of [].concat(cTalent >= 0 ? String(r[cTalent] || '').split(/[,;/]/).map(s => s.trim()).filter(Boolean) : [], cLoc >= 0 && r[cLoc] ? ['@' + r[cLoc]] : [])) {
          const clash = byHour[slot].find(x => x.who.toLowerCase() === who.toLowerCase() && x.unit !== unit);
          if (clash) problems.push(f + ' line ' + line + ': "' + who.replace(/^@/, '') + '" is on unit ' + unit + ' and unit ' + clash.unit + ' at ' + String(hour).padStart(2, '0') + ':00');
          byHour[slot].push({ who, unit, line });
        }
      }
    }
  });
  if (breakdownOrder && order.length) {
    const positions = order.map(s => breakdownOrder.indexOf(s)).filter(p => p >= 0);
    for (let i = 1; i < positions.length; i++) if (positions[i] < positions[i - 1]) { problems.push(f + ': rows are not in the breakdown\'s shooting order (' + order[i] + ' before ' + order[i - 1] + ')'); break; }
  }
  notes.push(f + ': ' + order.length + ' rows');
}

const result = { valid: !problems.length, sheets: sheets.length, problems, notes };
fs.mkdirSync(path.join(dir, 'validation'), { recursive: true });
fs.writeFileSync(path.join(dir, 'validation', 'call-sheet-check.md'), [
  '# Call sheet check', '', notes.map(n => '- ' + n).join('\n'), '',
  problems.length ? '## Problems\n\n' + problems.map(p => '- ' + p).join('\n') : 'No problems. Every talent and location is known and available.', '',
].join('\n'));
if (json) console.log(JSON.stringify(result, null, 2));
else {
  for (const n of notes) console.log('note: ' + n);
  for (const p of problems) console.error('PROBLEM: ' + p);
  console.log(problems.length ? 'The call sheets are refused: ' + problems.length + ' problem' + (problems.length === 1 ? '' : 's') + '.' : 'ok: ' + sheets.length + ' call sheet' + (sheets.length === 1 ? '' : 's') + ', every talent and location known.');
}
process.exit(problems.length ? 1 : 0);
