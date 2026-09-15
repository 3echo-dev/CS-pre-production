#!/usr/bin/env node
// The bridge between the files and the 1-22 Control board.
//
//   node board-sync.js open <client> <job-id>                 queue the project and its 13 items
//   node board-sync.js push <client> <job-id> [--json] [--ack] fold the outbox into write batches
//   node board-sync.js land <client> <job-id> <read.json>       store what the orchestrator read
//   node board-sync.js pull <client> <job-id> --gate A|B|C      turn a landed gate record into an approval
//
// A script cannot reach the board's database; only the orchestrator can, through the Artifact
// tool's write_db and read_db. So `push` prints the batch and the orchestrator hands it over,
// then runs `push --ack` to clear what was delivered. `land` takes the JSON the orchestrator
// saved from read_db (any of: a gate document, an inbox query, register lists) and files it
// where lib-board.js and the registers expect it. `pull` is the only path from a board
// decision to an approval on disk, and it refuses when the board approved a version that is
// not the one on disk.
//
// Exit 0 done · 1 the answer is no (a stale version) · 2 usage · 3 a prerequisite is missing
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ws = require('./lib-workspace.js');
const board = require('./lib-board.js');
const states = require('./lib-states.js');
const stages = require('./lib-stages.js');

const ITEMS = ['intake', 'scraper', 'script', 'storyboard', 'shot_list', 'budget_sheet', 'timeline',
  'audio', 'talents', 'props', 'locations', 'concept_breakdown', 'call_sheet'];
const REGISTERS = ['talents', 'props', 'locations', 'days'];
const HUMAN_ONLY = new Set(['approved', 'na']);
const BATCH = 50;

const argv = process.argv.slice(2);
const cmd = ws.positionals(argv)[0];
const rest = argv.slice(argv.indexOf(cmd) + 1);
const json = argv.includes('--json');
const opt = name => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const usage = () => {
  console.error('usage: board-sync.js open|push|land|pull|ask <client> <job-id> [args] [--json] [--ack] [--gate A|B|C|sample] [--item X --text "..." --options "a|b|c"]');
  process.exit(2);
};
if (!['open', 'push', 'land', 'pull', 'ask'].includes(cmd)) usage();
const { brand: client, jobId, dir, rest: more } = ws.resolveJobArgs(rest, argv);
if (!client || !jobId) usage();
if (!fs.existsSync(dir)) { console.error('No project at ' + ws.fwd(dir) + '.'); process.exit(3); }

const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const now = () => new Date().toISOString();
const fwd = ws.fwd;
const base = 'projects/' + jobId;

// The latest version of an item as versions.jsonl records it, or 0.
function latestVersion(item) {
  let best = null;
  try {
    for (const line of fs.readFileSync(path.join(dir, 'versions.jsonl'), 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      const v = JSON.parse(line);
      if (v.item === item && (!best || v.n > best.n)) best = v;
    }
  } catch { /* no versions yet */ }
  return best;
}

async function open() {
  const job = readJson(path.join(dir, 'job.json'));
  await board.call('project', {
    key: jobId, title: job.title, client: job.client || client, driveFolder: job.driveFolder || '',
    scriptFormat: job.scriptFormat || null, storyboardStyle: job.storyboardStyle || null,
    status: 'intake', createdAt: job.requestedAt || now(), createdBy: 'pipeline',
  }, { argv });
  for (const item of ITEMS) {
    await board.call('item', { key: jobId, item, status: 'pending', version: 0, summary: '' }, { argv });
  }
  console.log('Queued the project and ' + ITEMS.length + ' items for the board. Run push next.');
}

// One outbox record into zero or one write. Later records for the same document win, which is
// what `fold` relies on: the outbox is replayed in order and the map keeps the last state.
function toWrite(rec) {
  const p = rec.payload || {};
  const key = board.projectIdOf(p.key || jobId);
  if (key !== jobId) return null;
  const at = rec.at || now();
  switch (rec.kind) {
    case 'project': {
      const data = { ...p }; delete data.key;
      // A project record is the whole document (open writes it), so it is a set: the database
      // refuses an update on a document that does not exist yet.
      return { op: 'set', collection: 'projects', doc_id: jobId, data: { ...data, updatedAt: at } };
    }
    case 'item': {
      if (!ITEMS.includes(p.item)) return { warn: 'unknown item ' + p.item };
      if (HUMAN_ONLY.has(p.status)) return { warn: 'dropped: the pipeline may not set ' + p.item + ' to ' + p.status + '; only a person on the board does' };
      const data = { ...p }; delete data.key; delete data.item;
      // The first record for an item (pending, no version) creates the document; every later one
      // updates it, so the fields a person wrote on the board (approvedBy, changeNote) survive.
      const fresh = (p.status || 'pending') === 'pending' && !Number(p.version || 0);
      return { op: fresh ? 'set' : 'update', collection: base + '/items', doc_id: p.item, data: { ...data, updatedAt: at, updatedBy: p.updatedBy || 'pipeline' } };
    }
    case 'version':
      return { op: 'set', collection: base + '/versions', doc_id: 'v-' + p.item + '-' + p.n,
        data: { item: p.item, n: p.n, note: p.note || '', path: p.path || '', hash: p.hash || '', seat: p.seat || null, at: p.at || at } };
    case 'run': {
      const data = { ...p }; delete data.key;
      return { op: 'set', collection: base + '/runs', doc_id: p.item + '-v' + p.version, data };
    }
    case 'sheet': {
      const data = { ...p }; delete data.key;
      return { op: 'set', collection: base + '/sheets', doc_id: p.item, data };
    }
    case 'export-done':
      return { op: 'update', collection: base + '/inbox', doc_id: p.id, data: { status: 'answered', answer: p.link ? 'Google Sheet ready' : 'Excel written: ' + (p.driveCopy || p.exportPath), exportPath: p.exportPath, driveCopy: p.driveCopy || null, link: p.link || null, answeredBy: 'pipeline', answeredAt: at } };
    case 'panel': {
      const data = { ...p }; delete data.key; delete data.id;
      return { op: p.thumb ? 'update' : 'set', collection: base + '/panels', doc_id: p.id, data };
    }
    case 'question':
      return { op: 'set', collection: base + '/inbox', doc_id: p.id || ('q-' + Date.parse(at).toString(36)),
        data: { type: 'question', item: p.item || null, text: p.text, options: p.options || [], from: p.from || 'orchestrator', status: 'open', createdAt: at } };
    case 'message':
      return { op: 'set', collection: base + '/messages', doc_id: p.id || ('m-' + Date.parse(at).toString(36)),
        data: { by: p.by || 'pipeline', text: p.text, item: p.item || null, at } };
    case 'progress': {
      const status = p.state ? states.boardStatusOf(p.state) : null;
      const stage = p.stage ? (stages.SHORT_OF[p.stage] || p.stage) : null;
      const activity = p.substep || (p.activities || []).map(a => a.role + ' ' + a.status).join(', ') || null;
      const data = { updatedAt: at, ...(status ? { status } : {}), ...(stage ? { stage, stageStatus: p.status || null } : {}), ...(activity ? { activity } : {}) };
      return { op: 'update', collection: 'projects', doc_id: jobId, data };
    }
    case 'heartbeat':
      return { op: 'update', collection: 'projects', doc_id: jobId, data: { activity: p.line || 'Still working', heartbeatAt: at } };
    default:
      return { warn: 'unknown record kind ' + rec.kind };
  }
}

function fold(records) {
  const writes = new Map();
  const warnings = [];
  for (const rec of records) {
    const w = toWrite(rec);
    if (!w) continue;
    if (w.warn) { warnings.push(w.warn); continue; }
    const id = w.collection + '/' + w.doc_id;
    const prev = writes.get(id);
    // Two updates to one document merge; a set replaces whatever came before it.
    if (prev && w.op === 'update' && prev.op === 'update') prev.data = { ...prev.data, ...w.data };
    else if (prev && w.op === 'update' && prev.op === 'set') prev.data = { ...prev.data, ...w.data };
    else writes.set(id, w);
  }
  const all = [...writes.values()];
  const batches = [];
  for (let i = 0; i < all.length; i += BATCH) batches.push(all.slice(i, i + BATCH));
  return { batches, warnings, count: all.length };
}

function push() {
  const records = board.drain(argv).filter(r => board.projectIdOf((r.payload || {}).key || jobId) === jobId);
  if (argv.includes('--ack')) {
    // Only this project's records leave the outbox; another project's stay for their own push.
    const all = board.drain(argv);
    const keep = all.filter(r => board.projectIdOf((r.payload || {}).key || jobId) !== jobId);
    board.clear(argv);
    for (const r of keep) fs.appendFileSync(board.outboxPath(argv), JSON.stringify(r) + '\n');
    console.log('Cleared ' + records.length + ' delivered record' + (records.length === 1 ? '' : 's') + ' from the outbox.');
    return;
  }
  const { batches, warnings, count } = fold(records);
  if (json) {
    // An update needs the document's current version pinned as if_version, or the database
    // refuses it. Name them so the orchestrator reads exactly those before sending.
    // A set on a document that already exists is refused without its version too; sheets and
    // panels are re-set on every delivery, so they are listed as pins the orchestrator reads first
    // (mayExist: skip the pin when the read finds nothing).
    const pins = [].concat(...batches).filter(w => w.op === 'update' || /\/(sheets|panels)$/.test(w.collection)).map(w => ({ collection: w.collection, doc_id: w.doc_id, ...(w.op === 'set' ? { mayExist: true } : {}) }));
    console.log(JSON.stringify({ url: board.boardUrl(argv), project: jobId, count, pins, batches, warnings }, null, 2));
    return;
  }
  for (const w of warnings) console.error('warning: ' + w);
  if (!count) { console.log('Nothing queued for the board.'); return; }
  console.log(count + ' write' + (count === 1 ? '' : 's') + ' for the board in ' + batches.length + ' batch' + (batches.length === 1 ? '' : 'es') + '.');
  console.log('Hand each batch to the Artifact tool (write_db, db_op batch) on the board, then run push --ack. Use --json to print them.');
}

// Whatever read_db returned, in any of the shapes the orchestrator saves it in.
function land() {
  const file = more[0];
  if (!file) usage();
  let got;
  try { got = readJson(path.resolve(file)); } catch (e) { console.error('cannot read ' + file + ': ' + e.message); process.exit(3); }
  const docs = Array.isArray(got) ? got : (Array.isArray(got.documents) ? got.documents : (Array.isArray(got.docs) ? got.docs : [got]));
  const landed = { gates: {}, questions: [], answers: [], registers: {}, panels: {}, generate: [], exports: [] };
  const changed = [];
  for (const d of docs) {
    const id = d.id || d.doc_id || null;
    const data = d.data || d;
    const coll = String(d.collection || got.collection || '');
    if (/\/gates$/.test(coll) || (id && /^[ABC]$/.test(id) && data.status)) {
      landed.gates[id] = { ...data, id }; changed.push('gate ' + id + ' ' + data.status);
    } else if (/\/panels$/.test(coll) || (id && /^P\d{2,}$/i.test(id) && ('sample' in data || 'thumb' in data || data.approvedBy))) {
      const { thumb, ...rest } = data; landed.panels[id] = { ...rest, id };
      if (data.approvedBy) changed.push('panel ' + id + ' approved by ' + data.approvedBy);
    } else if (/\/inbox$/.test(coll) || data.type === 'question' || data.type === 'change' || data.type === 'gate' || data.type === 'generate' || data.type === 'export') {
      const q = { ...data, id };
      if (q.type === 'generate') landed.generate.push(q);
      if (q.type === 'export') landed.exports.push(q);
      landed.questions.push(q);
      if (q.status === 'answered') landed.answers.push(q);
      changed.push((q.type || 'inbox') + ' ' + id + ' ' + (q.status || ''));
    } else {
      const reg = REGISTERS.find(r => new RegExp('/' + r + '$').test(coll));
      if (reg) { (landed.registers[reg] = landed.registers[reg] || []).push({ ...data, id }); }
    }
  }
  // Registers land on disk as the directors read them: rows the board holds, never typed here.
  fs.mkdirSync(path.join(dir, 'registers'), { recursive: true });
  for (const reg of Object.keys(landed.registers)) {
    const rows = landed.registers[reg];
    fs.writeFileSync(path.join(dir, 'registers', reg + '.json'), JSON.stringify({ rows, landedAt: now() }, null, 2) + '\n');
    changed.push(reg + ': ' + rows.length + ' row' + (rows.length === 1 ? '' : 's'));
  }
  const prev = board.landed(jobId, argv) || {};
  board.land(argv, jobId, {
    gates: { ...(prev.gates || {}), ...landed.gates },
    questions: landed.questions.length ? landed.questions : (prev.questions || []),
    answers: landed.answers.length ? landed.answers : (prev.answers || []),
    panels: { ...(prev.panels || {}), ...landed.panels },
    generate: landed.generate.length ? landed.generate : (prev.generate || []),
    exports: landed.exports.length ? landed.exports : (prev.exports || []),
  });
  if (json) console.log(JSON.stringify({ project: jobId, landed: changed }, null, 2));
  else console.log(changed.length ? 'Landed: ' + changed.join('; ') + '.' : 'Nothing recognisable in ' + file + '.');
}

// A decision only a person can make. Queued for the board inbox as a question, and printed
// as numbered chat text so the person can answer wherever they are; the first answer wins.
async function ask() {
  const text = opt('--text');
  if (!text) { console.error('ask needs --text "the question" [--item <item>] [--options "a|b|c"] [--from <seat>]'); process.exit(2); }
  const item = opt('--item') || null;
  if (item && !ITEMS.includes(item)) { console.error('unknown item ' + item); process.exit(2); }
  const options = (opt('--options') || '').split('|').map(o => o.trim()).filter(Boolean);
  const id = 'q-' + Date.now().toString(36);
  await board.call('question', { key: jobId, id, item, text, options, from: opt('--from') || 'orchestrator', status: 'open', createdAt: now() }, { argv });
  if (json) { console.log(JSON.stringify({ id, item, text, options })); return; }
  console.log(text);
  options.forEach((o, i) => console.log('  ' + (i + 1) + '. ' + o));
  if (options.length) console.log('  ' + (options.length + 1) + '. Something else (say what)');
  console.log('Asked on the board too. Push, then end the turn; land the answer next turn.');
}

// The items each gate covers, and the file each item's version lives at.
const GATE_ITEMS = { A: ['script', 'storyboard', 'shot_list', 'budget_sheet', 'timeline', 'scraper'], B: ['audio', 'talents', 'props', 'locations'], C: ['concept_breakdown', 'call_sheet'] };
const NA_ALLOWED = new Set(['talents', 'props', 'locations']);

function pullSample() {
  const got = board.landed(jobId, argv) || {};
  const panels = got.panels || {};
  const sample = Object.values(panels).find(p => p.sample === true) || null;
  if (!sample) { console.error('No sample panel landed. Read projects/' + jobId + '/panels from the board and land it first.'); process.exit(3); }
  if (!sample.approvedBy) { console.error('Sample ' + sample.id + ' is on the board but nobody has approved it yet.'); process.exit(1); }
  const open = (got.generate || []).find(g => g.status === 'open' && g.scope === 'batch');
  let max = open ? Number(open.credits) : null;
  if (!Number.isInteger(max)) {
    try {
      const vdir = fs.readdirSync(path.join(dir, 'storyboard')).filter(f => /^v\d+$/.test(f)).sort().pop();
      const m = readJson(path.join(dir, 'storyboard', vdir, 'generation-manifest.json'));
      max = (m.items || []).filter(it => (it.kind || 'image') === 'image' && String(it.panel).toUpperCase() !== String(sample.id).toUpperCase()).length;
    } catch { max = 0; }
  }
  const file = sample.file || null;
  const args = [path.join(__dirname, 'record-approval.js'), client, jobId, 'sample', 'approve', '--by', sample.approvedBy, '--channel', 'board', '--max-credits', String(max)]
    .concat(sample.approvedAt ? ['--decided-at', String(sample.approvedAt)] : [])
    .concat(argv.includes('--root') ? ['--root', argv[argv.indexOf('--root') + 1]] : [])
    .concat(file && fs.existsSync(path.join(dir, file)) ? [file] : []);
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  if (r.status !== 0) { process.stderr.write(r.stderr || ''); process.exit(r.status || 1); }
  console.log('Sample ' + sample.id + ' landed as an approval; the batch may spend up to ' + max + ' credits.');
}

function pull() {
  const gate = opt('--gate');
  if (gate === 'sample') return pullSample();
  if (!gate || !GATE_ITEMS[gate]) usage();
  const got = board.landed(jobId, argv);
  const rec = got && got.gates ? got.gates[gate] : null;
  if (!rec) { console.error('No landed record for gate ' + gate + '. Read projects/' + jobId + '/gates/' + gate + ' from the board and land it first.'); process.exit(3); }
  if (rec.status !== 'passed') { console.error('Gate ' + gate + ' is ' + rec.status + ' on the board, not passed.'); process.exit(1); }
  const stale = [], files = [];
  for (const item of GATE_ITEMS[gate]) {
    const said = (rec.items || {})[item] || {};
    if (said.status === 'na' && NA_ALLOWED.has(item)) continue;
    const disk = latestVersion(item);
    if (!disk) { stale.push(item + ': the board approved v' + (said.version ?? '?') + ' but nothing is recorded on disk'); continue; }
    if (Number(said.version) !== Number(disk.n)) { stale.push(item + ': the board approved v' + said.version + ', disk is at v' + disk.n); continue; }
    if (disk.path) files.push(disk.path);
  }
  if (stale.length) {
    for (const s of stale) console.error('STALE: ' + s);
    console.error('The board approved a version that is not the one on disk. Push the current versions and ask again.');
    process.exit(1);
  }
  if (!files.length) { console.error('Nothing to bind: no item under gate ' + gate + ' has a file on disk.'); process.exit(3); }
  const by = rec.decidedBy || 'board';
  const args = [path.join(__dirname, 'record-approval.js'), client, jobId, gate, 'approve', '--by', by, '--channel', 'board']
    .concat(rec.decidedAt ? ['--decided-at', String(rec.decidedAt)] : [])
    .concat(argv.includes('--root') ? ['--root', argv[argv.indexOf('--root') + 1]] : [])
    .concat(files);
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  if (r.status !== 0) { process.stderr.write(r.stderr || ''); process.exit(r.status || 1); }
  console.log('Gate ' + gate + ' landed as an approval bound to ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '.');
}

(async () => {
  if (cmd === 'open') await open();
  else if (cmd === 'push') push();
  else if (cmd === 'land') land();
  else if (cmd === 'pull') pull();
  else if (cmd === 'ask') await ask();
})().catch(e => { console.error(e && e.message || e); process.exit(1); });
