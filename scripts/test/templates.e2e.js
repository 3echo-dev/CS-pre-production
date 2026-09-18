#!/usr/bin/env node
// The template trap: a client hands over a finished workbook as a template, and nothing says so.
//
// On the first test run all five templates arrived full of live production data, one of them
// 166 MB of embedded frames, and the pipeline accepted them without a word. A filled template
// hands the compiler the answers it is supposed to produce and carries crew phone numbers into
// every job. So: template-check.js refuses a filled template and names the folder a missing one
// belongs in, strip-template.py empties a workbook and prints what it kept, and a template that
// has been stripped or accepted by a person passes with its provenance on the line.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const scripts = path.join(ROOT, 'scripts');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'od-templates-'));
const run = (name, args) => spawnSync(process.execPath, [path.join(scripts, name), ...args, '--root', tmp], { encoding: 'utf8', cwd: tmp });
const has = c => { try { return spawnSync(c, ['-c', 'import openpyxl'], { stdio: 'ignore' }).status === 0; } catch { return false; } };
const PY = has('python3') ? 'python3' : (has('python') ? 'python' : null);
const py = args => spawnSync(PY, [path.join(scripts, 'strip-template.py'), ...args], { encoding: 'utf8', cwd: tmp });

try {
  if (!PY) { console.log('skip python with openpyxl is not installed, so the template checks cannot run here'); process.exit(0); }

  assert.strictEqual(run('scaffold-client.js', ['acme']).status, 0);
  const tdir = path.join(tmp, 'workspaces', 'acme', 'client', 'templates');
  const wsCfg = JSON.parse(fs.readFileSync(path.join(tmp, 'workspaces', 'acme', 'workspace.json'), 'utf8'));
  assert.strictEqual(wsCfg.templates.shotList, 'client/templates/shot-list.xlsx', 'the fifth template is in the workspace map');
  assert.match(fs.readFileSync(path.join(tdir, 'README.md'), 'utf8'), /shot-list\.xlsx, budget\.xlsx/, 'and the README names it');

  // 1. Nothing dropped in yet: every template is missing, and the message says where they go.
  let r = run('template-check.js', ['acme']);
  assert.strictEqual(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stderr, /Missing: shot-list\.xlsx, budget\.xlsx, timeline\.xlsx, breakdown\.xlsx, call-sheet\.xlsx\./);
  assert.match(r.stderr, /workspaces\/acme\/client\/templates\/; they never come from the pulled folder/);
  console.log('ok   a missing template is named with the folder it belongs in');

  // 2. A finished workbook: a stray number on row 1, band labels on row 2, the real header on row 3,
  //    seventeen rows of data with a phone number in them, and two more sheets.
  const fixture = path.join(tmp, 'fixture.py');
  fs.writeFileSync(fixture, [
    'import sys, openpyxl',
    "wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'MASTER'",
    'ws["A1"] = 1',
    "ws['A2'] = 'PRE PRODUCTION'; ws['I2'] = 'PRODUCTION'; ws['Q2'] = 'POST PRODUCTION'",
    "for c in range(1, 25): ws.cell(3, c).value = 'H%d' % c",
    'for r in range(4, 21):',
    "    for c in range(1, 25): ws.cell(r, c).value = 'v%d-%d' % (r, c)",
    "ws['B5'] = '+65 9123 4567'",
    "wb.create_sheet('Other')['A1'] = 'x'",
    "wb.create_sheet('Sheet3')",
    'wb.save(sys.argv[1])',
    '',
  ].join('\n'));
  const filledFile = path.join(tmp, 'HTF Shot List 260811.xlsx');
  const made = spawnSync(PY, [fixture, filledFile], { encoding: 'utf8' });
  assert.strictEqual(made.status, 0, made.stderr);
  for (const name of ['shot-list', 'budget', 'timeline', 'breakdown', 'call-sheet']) fs.copyFileSync(filledFile, path.join(tdir, name + '.xlsx'));

  r = run('template-check.js', ['acme']);
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /breakdown\.xlsx holds data: sheet MASTER has 17 rows below its header \(row 3\), e\.g\. row 4: v4-1 \| v4-2/);
  assert.match(r.stderr, /a question, not an input/);
  assert.match(r.stdout, /warning: 3 sheets; a template is one sheet/);
  assert.match(r.stdout, /warning: 1 cell that reads like phone numbers/);
  assert.match(r.stdout, /provenance not recorded/);
  console.log('ok   a template with rows below its header is refused, with the rows and the sheet named');

  // 3. Strip it to the header: one sheet, no data rows, every kept cell printed, provenance recorded.
  r = py([filledFile, '--out', path.join(tdir, 'breakdown.xlsx'), '--sheet', 'MASTER', '--header', '3']);
  assert.strictEqual(r.status, 1, 'an existing template is not overwritten without --force: ' + r.stdout);
  r = py([filledFile, '--out', path.join(tdir, 'breakdown.xlsx'), '--sheet', 'MASTER', '--header', '3', '--force']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Dropped 2 other sheets and 0 images; deleted every row below row 3/);
  assert.match(r.stdout, /Kept 28 cells\./);
  assert.match(r.stdout, /  A1: 1\r?\n  A2: PRE PRODUCTION/);
  assert.match(r.stdout, /  X3: H24/);
  assert.doesNotMatch(r.stdout, /v4-1|9123/, 'no data row and no phone number survives');
  const side = JSON.parse(fs.readFileSync(path.join(tdir, 'breakdown.xlsx.source.json'), 'utf8'));
  assert.strictEqual(side.sourceName, 'HTF Shot List 260811.xlsx');
  assert.strictEqual(side.headerRow, 3);
  assert.deepStrictEqual(side.droppedSheets, ['Other', 'Sheet3']);
  r = py(['--scan', path.join(tdir, 'breakdown.xlsx')]);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /breakdown\.xlsx: accepted/);
  console.log('ok   a stripped template keeps the header block only, prints what it kept, and records its source');

  // 4. A form (a call sheet) keeps its layout; the person clears the filled ranges and reads the rest.
  r = py([filledFile, '--out', path.join(tdir, 'call-sheet.xlsx'), '--sheet', 'MASTER', '--layout', '--clear', 'A4:X20', '--force']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /kept the form as it is; cleared 408 cells/);
  assert.match(r.stdout, /Kept 28 cells\./);
  r = py([filledFile, '--out', path.join(tmp, 'x.xlsx'), '--force']);
  assert.strictEqual(r.status, 2, 'neither --header nor --layout is a usage error');
  assert.match(r.stderr, /^Nothing was written\./);
  console.log('ok   a form template keeps its layout and clears only the ranges named');

  // 5. A person may accept a file as empty after reading it; the record carries their name.
  r = py(['--accept', path.join(tdir, 'timeline.xlsx')]);
  assert.strictEqual(r.status, 2, '--accept without --by is a usage error');
  r = py(['--accept', path.join(tdir, 'timeline.xlsx'), '--by', 'production lead']);
  assert.strictEqual(r.status, 0, r.stderr);
  for (const name of ['shot-list', 'budget']) {
    r = py([filledFile, '--out', path.join(tdir, name + '.xlsx'), '--sheet', 'MASTER', '--header', '3', '--force']);
    assert.strictEqual(r.status, 0, r.stderr);
  }
  r = run('template-check.js', ['acme']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /breakdown\.xlsx: accepted, 1 sheet, header row 3, \d+ bytes, from HTF Shot List 260811\.xlsx sheet MASTER, stripped \d{4}-\d{2}-\d{2}\./);
  assert.match(r.stdout, /timeline\.xlsx: accepted, 3 sheets, .* accepted as empty by production lead on \d{4}-\d{2}-\d{2}\./);
  assert.match(r.stdout, /ok: all five templates are here and empty\./);
  r = run('template-check.js', ['acme', '--json']);
  assert.strictEqual(JSON.parse(r.stdout).valid, true);
  console.log('ok   five stripped or accepted templates pass, each with its provenance on the line');

  // 6. A template edited after it was accepted is a question again.
  fs.appendFileSync(path.join(tdir, 'timeline.xlsx'), Buffer.from([0]));
  r = py(['--scan', path.join(tdir, 'timeline.xlsx')]);
  assert.strictEqual(r.status, 1, 'the sidecar hash no longer matches: ' + r.stdout);
  assert.match(r.stdout, /warning: the file changed after it was stripped or accepted/);
  console.log('ok   a template changed after acceptance is refused again');

  console.log('templates verification passed');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
