#!/usr/bin/env node
// Are the client's five templates there, and are they empty?
//
//   node template-check.js <client> [--json]
//
// The templates under workspaces/{client}/client/templates/ are the client's own files, copied
// and filled by the planners and builders. They never come from the pulled folder, which is why
// a missing one is reported with the folder it belongs in. A template with rows below its
// header is a question, not an input: it hands the compiler the answers it is supposed to
// produce, and a filled call sheet carries phone numbers into every job. Onboarding runs this
// after the files are dropped in; the orchestrator runs it before every row that copies one.
//
// The reading is done by strip-template.py --scan, which also records where a template came
// from, so the line for each file says its provenance when that is known.
//
// Exit 0 all present and clean · 1 a template holds data or cannot be read · 2 usage
//      · 3 a template is missing, the client is not onboarded, or python with openpyxl is not there
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ws = require('./lib-workspace.js');

// The five, in the order the workflow needs them. A workspace.json written before shotList
// existed still gets all five, because the map below is the floor and the file only overrides.
const TEMPLATES = {
  shotList: 'client/templates/shot-list.xlsx',
  budget: 'client/templates/budget.xlsx',
  timeline: 'client/templates/timeline.xlsx',
  breakdown: 'client/templates/breakdown.xlsx',
  callSheet: 'client/templates/call-sheet.xlsx',
};

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const client = ws.positionals(argv)[0];
if (!client) { console.error('usage: template-check.js <client> [--json]'); process.exit(2); }
const dir = ws.wsDir(client, argv);
if (!fs.existsSync(path.join(dir, 'workspace.json'))) {
  console.error('No client ' + client + ' under ' + ws.fwd(ws.clientsDir(argv)) + '. Onboard the client first.');
  process.exit(3);
}
const cfg = ws.workspaceConfig(client, argv);
const map = { ...TEMPLATES, ...(cfg.templates || {}) };
const where = ws.fwd(path.join(dir, 'client', 'templates')) + '/';
const strip = path.join(__dirname, 'strip-template.py');

const runs = c => { try { return spawnSync(c, ['-c', 'import openpyxl'], { stdio: 'ignore' }).status === 0; } catch { return false; } };
const PY = runs('python3') ? 'python3' : (runs('python') ? 'python' : null);
if (!PY) {
  console.error('python with openpyxl is needed to read the templates: python -m pip install openpyxl');
  process.exit(3);
}

const results = [];
for (const [key, rel] of Object.entries(map)) {
  const file = path.join(dir, rel);
  const name = path.basename(rel);
  if (!fs.existsSync(file)) { results.push({ key, name, status: 'missing' }); continue; }
  const r = spawnSync(PY, [strip, '--scan', file, '--json'], { encoding: 'utf8' });
  let scan = null;
  try { scan = JSON.parse(r.stdout); } catch { scan = null; }
  if (!scan) { results.push({ key, name, status: 'unreadable', detail: (r.stderr || '').trim() }); continue; }
  const side = scan.sidecar || {};
  const provenance = side.acceptedBy
    ? 'accepted as empty by ' + side.acceptedBy + ' on ' + String(side.acceptedAt || '').slice(0, 10)
    : (side.sourceName
      ? 'from ' + side.sourceName + ' sheet ' + side.sheet + ', stripped ' + String(side.strippedAt || '').slice(0, 10)
      : 'provenance not recorded');
  results.push({ key, name, status: scan.verdict, bytes: scan.bytes, sheets: scan.sheets, warnings: scan.warnings, provenance });
}

const missing = results.filter(r => r.status === 'missing');
const filled = results.filter(r => r.status === 'filled');
const unreadable = results.filter(r => r.status === 'unreadable');
const valid = !missing.length && !filled.length && !unreadable.length;

if (json) {
  console.log(JSON.stringify({ client, folder: where, valid, templates: results }, null, 2));
} else {
  for (const r of results) {
    if (r.status === 'missing') { console.log(r.name + ': missing'); continue; }
    if (r.status === 'unreadable') { console.log(r.name + ': cannot be read. ' + r.detail); continue; }
    const sheet = r.sheets[0] || {};
    console.log(r.name + ': ' + r.status + ', ' + r.sheets.length + ' sheet' + (r.sheets.length === 1 ? '' : 's') +
      ', header row ' + sheet.header + ', ' + r.bytes + ' bytes, ' + r.provenance + '.');
    for (const w of r.warnings) console.log('  warning: ' + w);
  }
  if (missing.length) {
    console.error('Missing: ' + missing.map(m => m.name).join(', ') + '. Templates live at ' + where +
      '; they never come from the pulled folder. Ask the client for the blank files, drop them there, and run this again.');
  }
  for (const r of filled) {
    for (const s of r.sheets.filter(s => s.dataRows)) {
      const eg = s.sample[0] ? ', e.g. row ' + s.sample[0].row + ': ' + s.sample[0].cells.join(' | ') : '';
      console.error(r.name + ' holds data: sheet ' + s.name + ' has ' + s.dataRows + ' row' + (s.dataRows === 1 ? '' : 's') +
        ' below its header (row ' + s.header + ')' + eg + '.');
    }
    console.error('A template with rows below its header is a question, not an input. Strip it: ' + PY + ' "' + ws.fwd(strip) +
      '" "<the client\'s workbook>" --out "' + where + r.name + '" --sheet "<sheet>" --header <row> --force, then read the cells it kept. ' +
      'If those rows are the form\'s own labels: ' + PY + ' "' + ws.fwd(strip) + '" --accept "' + where + r.name + '" --by "<who read it>".');
  }
  for (const r of unreadable) console.error(r.name + ' cannot be read; ask the client for the file again.');
  if (valid) console.log('ok: all five templates are here and empty.');
}
process.exit(missing.length ? 3 : (valid ? 0 : 1));
