#!/usr/bin/env node
// Put an exported file on the board so a person can download it from the item, in the client's
// template, without waiting for the pipeline.
//
//   node push-export.js <client> <job-id> --item <item> --file <path in the job> [--day N] [--version N]
//
// A board document holds at most 256 KiB, so the file goes as one record, exports/{id}
// (filename, bytes, sha256, chunk count, when, from which version), and its bytes base64 in
// exportchunks/{id}-{k}. The page joins the chunks and hands the file to the viewer through the
// downloads capability. push-sheet.js calls this for every export it writes; the id is the item,
// or call_sheet-day-{d} for one shoot day.
//
// Exit 0 queued · 2 usage · 3 the file is not there
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ws = require('./lib-workspace.js');
const board = require('./lib-board.js');

const CHUNK = 190000; // base64 characters a chunk: well under the 256 KiB document ceiling

async function pushExport({ jobId, dir, item, file, day, version, argv }) {
  const abs = path.isAbsolute(file) ? file : path.join(dir, file);
  if (!fs.existsSync(abs)) return { error: 'The file is not there: ' + ws.fwd(abs) };
  const buf = fs.readFileSync(abs);
  const b64 = buf.toString('base64');
  const id = item + (day ? '-day-' + day : '');
  const chunks = Math.max(1, Math.ceil(b64.length / CHUNK));
  const at = new Date().toISOString();
  for (let k = 0; k < chunks; k++) {
    await board.call('export-chunk', { key: jobId, id, k, data: b64.slice(k * CHUNK, (k + 1) * CHUNK) }, { argv });
  }
  const rec = { key: jobId, id, item, day: day || null, filename: path.basename(abs), bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), chunks, version: version || null, path: ws.fwd(path.relative(dir, abs)), at };
  await board.call('export-file', rec, { argv });
  return rec;
}
module.exports = { pushExport };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const opt = n => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
  const { brand: client, jobId, dir } = ws.resolveJobArgs(argv, argv);
  if (!client || !jobId || !opt('--item') || !opt('--file')) {
    console.error('Nothing was queued. usage: push-export.js <client> <job-id> --item <item> --file <path in the job> [--day N] [--version N]');
    process.exit(2);
  }
  pushExport({ jobId, dir, item: opt('--item'), file: opt('--file'), day: opt('--day') ? Number(opt('--day')) : null, version: opt('--version') ? Number(opt('--version')) : null, argv }).then(r => {
    if (r.error) { console.error('Nothing was queued. ' + r.error); process.exit(3); }
    console.log('Download queued for the board: ' + r.filename + ' (' + Math.round(r.bytes / 1024) + ' KB, ' + r.chunks + ' part' + (r.chunks === 1 ? '' : 's') + '). Run board-sync.js push next.');
  });
}
