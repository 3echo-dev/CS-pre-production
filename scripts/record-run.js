#!/usr/bin/env node
// Record what a director actually did, so the board can show it under the item.
//
//   node record-run.js <client> <job-id> --item script --n 3 --seat script-director
//        --prompt-file <spawn-prompt.txt> [--output-file script/v3.md] [--trace-file <trace.json>]
//        [--model opus] [--turns 9] [--tokens 51900] [--status done|running]
//
// Writes runs/{item}-v{n}.json and queues the same record for the board's runs collection,
// which is what the Output, Prompt and Trace tabs read. The spawn prompt is recorded exactly;
// the output is the file's text when it is text, and empty with a path when it is not.
//
// The output file is the one record-version.js recorded for this item and number, read from
// versions.jsonl; --output-file overrides it for a run that wrote something else. It used to be
// optional and nothing else: a rule in a document that every director had to remember on every
// row, and on the third test run it was forgotten, so the board's Output tab told the person
// to open the file on their computer. A run of a delivered item with no output to show is
// refused, not recorded empty.
//
// Exit 0 recorded · 2 usage · 3 a named file is missing, or no version to take the output from
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');
const board = require('./lib-board.js');

const argv = process.argv.slice(2);
const opt = name => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const { brand: client, jobId, dir } = ws.resolveJobArgs(argv, argv);
const item = opt('--item'), n = Number(opt('--n')), seat = opt('--seat');
if (!client || !jobId || !item || !Number.isInteger(n) || !seat || !opt('--prompt-file')) {
  console.error('usage: record-run.js <client> <job-id> --item <item> --n <n> --seat <agent> --prompt-file <file> [--output-file <path>] [--trace-file <file>] [--model m] [--turns t] [--tokens k] [--status done|running]');
  process.exit(2);
}
const readOr = (p, what) => {
  if (!p) return null;
  const abs = path.isAbsolute(p) ? p : (fs.existsSync(path.join(dir, p)) ? path.join(dir, p) : path.resolve(p));
  if (!fs.existsSync(abs)) { console.error('The ' + what + ' is not there: ' + ws.fwd(abs)); process.exit(3); }
  return abs;
};
const promptPath = readOr(opt('--prompt-file'), 'prompt file');
const status = opt('--status') || 'done';
function versionOf(it, num) {
  try {
    return fs.readFileSync(path.join(dir, 'versions.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l))
      .find(v => v.item === it && Number(v.n) === num) || null;
  } catch { return null; }
}
let outputArg = opt('--output-file');
if (!outputArg) {
  const v = versionOf(item, n);
  if (v && v.path) { outputArg = v.path; console.error('Output: ' + v.path + ', as recorded for ' + item + ' v' + n + '.'); }
  else if (status === 'done') {
    console.error('Nothing was recorded. ' + item + ' v' + n + ' is not in versions.jsonl, so there is no file to show on the board for this run. Run record-version.js first (version, then run), or pass --output-file <path> for a run that wrote something else.');
    process.exit(3);
  }
}
const outputPath = readOr(outputArg, 'output file');
const tracePath = readOr(opt('--trace-file'), 'trace file');

const TEXT = /\.(md|txt|csv|json|yaml|yml)$/i;
let output = '';
if (outputPath) {
  const target = fs.statSync(outputPath).isDirectory() ? path.join(outputPath, 'panels.md') : outputPath;
  if (fs.existsSync(target) && TEXT.test(target)) output = fs.readFileSync(target, 'utf8').slice(0, 60000);
}
// The drawer's Output tab renders `output`; a run without it shows an empty tab and a path,
// which on the first test run left the person opening files to learn what a director made.
if (!outputPath) console.error('Note: a running record carries no output yet; the board\'s Output tab fills when the run is recorded done.');
else if (!output) console.error('Note: ' + path.basename(outputPath) + ' is not text, so the board\'s Output tab shows its path only.');
let trace = [];
if (tracePath) { try { trace = JSON.parse(fs.readFileSync(tracePath, 'utf8')); } catch { trace = []; } }

const rec = {
  item, seat, version: n, status,
  model: opt('--model') || null,
  turns: opt('--turns') ? Number(opt('--turns')) : null,
  tokens: opt('--tokens') ? Number(opt('--tokens')) : null,
  skills: (opt('--skills') || '').split(',').map(s => s.trim()).filter(Boolean),
  prompt: fs.readFileSync(promptPath, 'utf8'),
  output,
  trace: Array.isArray(trace) ? trace : [],
  artifactPath: outputPath ? path.relative(dir, outputPath).split(path.sep).join('/') : null,
  startedAt: opt('--started') || new Date().toISOString(),
  finishedAt: status === 'done' ? new Date().toISOString() : null,
};
fs.mkdirSync(path.join(dir, 'runs'), { recursive: true });
const out = path.join(dir, 'runs', item + '-v' + n + '.json');
fs.writeFileSync(out, JSON.stringify(rec, null, 2) + '\n');

(async () => {
  await board.call('run', { key: jobId, ...rec }, { argv });
  console.log('Run recorded: ' + ws.fwd(out) + '. Queued for the board.');
})();
