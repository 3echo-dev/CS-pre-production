#!/usr/bin/env node
// Queue a sheet item for the board's Sheet tab in the client's format, and write its Excel
// export. The board shows the grid; its Export button files an export request the pipeline
// answers by running this again and naming the file it wrote.
//
//   node push-sheet.js <client> <job-id> --item shot_list|budget_sheet|timeline|concept_breakdown [--request <inbox-id>] [--drive]
//
// --request marks that inbox request done with the export path. --drive also copies the export
// into <driveFolder>/Exports/ from job.json, so the client finds it in their own folder.
// Exit 0 queued · 1 no source · 2 usage
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ws = require('./lib-workspace.js');
const board = require('./lib-board.js');

const argv = process.argv.slice(2);
const { brand: client, jobId, dir } = ws.resolveJobArgs(argv, argv);
const flag = n => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const item = flag('--item');
const ITEMS = ['shot_list', 'budget_sheet', 'timeline', 'concept_breakdown'];
if (!client || !jobId || !ITEMS.includes(item)) { console.error('usage: push-sheet.js <client> <job-id> --item ' + ITEMS.join('|') + ' [--request <id>] [--drive]'); process.exit(2); }

const clientDir = path.join(ws.wsDir(client, argv), 'client');
const r = spawnSync('python', [path.join(__dirname, 'sheet-export.py'), dir, '--item', item, '--client-dir', clientDir, '--json'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
if (r.status !== 0) { process.stderr.write(r.stderr || ''); process.exit(r.status || 1); }
const out = JSON.parse(r.stdout.trim().split('\n').pop());

let driveCopy = null;
if (argv.includes('--drive')) {
  try {
    const job = JSON.parse(fs.readFileSync(path.join(dir, 'job.json'), 'utf8'));
    if (job.driveFolder && fs.existsSync(job.driveFolder)) {
      const d = path.join(job.driveFolder, 'Exports');
      fs.mkdirSync(d, { recursive: true });
      driveCopy = path.join(d, path.basename(out.export));
      fs.copyFileSync(out.export, driveCopy);
    }
  } catch { driveCopy = null; }
}

(async () => {
  const at = new Date().toISOString();
  await board.call('sheet', {
    key: jobId, item, columns: out.columns, rows: out.rows, rowCount: out.rowCount,
    template: out.template, exportPath: ws.fwd(out.export), driveCopy: driveCopy ? ws.fwd(driveCopy) : null, updatedAt: at,
  }, { argv });
  const req = flag('--request');
  if (req) await board.call('export-done', { key: jobId, id: req, item, exportPath: ws.fwd(out.export), driveCopy: driveCopy ? ws.fwd(driveCopy) : null }, { argv });
  console.log('Queued ' + item + ' for the board: ' + out.rowCount + ' rows, ' + out.columns.length + ' columns' + (out.template ? ' in the client template' : '') + '. Excel at ' + ws.fwd(out.export) + (driveCopy ? ' and ' + ws.fwd(driveCopy) : '') + '. Run board-sync.js push next.');
})();
