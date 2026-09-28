#!/usr/bin/env node
// The subject check: every character, location, prop and costume the storyboard needs, whether
// the client supplied a picture of it, and what a person decided for each one that is missing.
// It runs after the panel table is written and before the sample panel is drawn, so no face,
// place or product is invented without somebody choosing that.
//
//   node subject-check.js scan <client> <job-id>          build storyboard/v{n}/subjects.json, ask about gaps
//   node subject-check.js land <client> <job-id>          apply the answers board-sync.js land brought back
//   node subject-check.js decide <client> <job-id> --subject <id> --choice generate|wait|prompt|use-look|redo [--by <who>]
//   node subject-check.js look <client> <job-id> --subject <id> --file <path in the job>
//   node subject-check.js may-generate <client> <job-id> --subject <id> --json
//
// Where pictures come from: job.referencesFolder, else a references/refs/assets folder inside the
// pulled Client Assets, else Client Assets itself. Folder names are read loosely (Cast, Talent,
// Locations, Backgrounds, Props, Products, Wardrobe...: see lib-references.js). Pictures that sit
// in folders with other names are counted as unsorted: the check cannot say what they show.
//
// What each subject needs: fields a manifest item carries (characters, location, props,
// wardrobe), library names found in the panel's prompt, and screenplay CAPITALS (THE GIRL).
//
// A missing subject is asked once on the board: generate a look (1 credit, then its own
// approval), wait for the client's photo, or leave it to the storyboard prompt. The sample
// panel is refused (preflight-generation.js) while any subject is undecided, waiting, or has a
// look nobody has approved yet.
//
// Exit 0 nothing blocks the sample · 1 something still needs a person · 2 usage · 3 no storyboard
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ws = require('./lib-workspace.js');
const board = require('./lib-board.js');
const refs = require('./lib-references.js');

const argv = process.argv.slice(2);
const cmd = argv[0];
const rest = argv.slice(1);
const opt = n => { const i = rest.indexOf(n); return i >= 0 && rest[i + 1] ? rest[i + 1] : null; };
const asJson = rest.includes('--json');
const CMDS = ['scan', 'land', 'decide', 'look', 'may-generate'];
function usage(msg) {
  if (msg) console.error(msg);
  console.error('usage: subject-check.js <' + CMDS.join('|') + '> <client> <job-id> [--subject id] [--choice c] [--file f] [--json]');
  process.exit(2);
}
if (!CMDS.includes(cmd)) usage('Nothing was checked. Name a command first.');
const { brand: client, jobId, dir } = ws.resolveJobArgs(rest, rest);
if (!client || !jobId) usage('Nothing was checked. This call needs the client and the job id.');

const readJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const fwd = p => String(p).split(path.sep).join('/');
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'x';
const KIND_LABEL = { characters: 'character', locations: 'location', props: 'prop', wardrobe: 'costume' };
const OPT = { generate: 'Generate a look (1 credit)', wait: "Wait for the client's photo", prompt: 'Leave it to the storyboard' };

function latestBoard() {
  const root = path.join(dir, 'storyboard');
  let vs = [];
  try { vs = fs.readdirSync(root).filter(f => /^v\d+$/.test(f)).map(f => Number(f.slice(1))).sort((a, b) => a - b); } catch { vs = []; }
  return vs.length ? vs[vs.length - 1] : null;
}
const n = latestBoard();
if (n === null) { console.error('No storyboard on disk yet: the subject check reads storyboard/v{n}/generation-manifest.json.'); process.exit(3); }
const boardDir = path.join(dir, 'storyboard', 'v' + n);
const outFile = path.join(boardDir, 'subjects.json');
const job = readJson(path.join(dir, 'job.json')) || {};

// ---------------------------------------------------------------------------------------
// Where the pictures are.
// ---------------------------------------------------------------------------------------
const IMG = /\.(png|jpe?g|webp)$/i;
function pulledAssets() {
  const base = path.join(ws.inputsDir(client, rest), jobId);
  const hit = (() => { try { return fs.readdirSync(base, { withFileTypes: true }).find(e => e.isDirectory() && /client\s*assets?/i.test(e.name)); } catch { return null; } })();
  return hit ? path.join(base, hit.name) : null;
}
function libraryRoot() {
  if (job.referencesFolder) return { root: job.referencesFolder, assets: null };
  const assets = pulledAssets();
  if (!assets) return { root: null, assets: null };
  const sub = fs.readdirSync(assets, { withFileTypes: true }).find(e => e.isDirectory() && ['references', 'reference', 'refs', 'ref', 'library'].includes(e.name.toLowerCase().replace(/^\d+\s*[.)]?\s*/, '').trim()));
  return { root: sub ? path.join(assets, sub.name) : assets, assets };
}
// Pictures under Client Assets that are not inside a folder the library recognised.
function unsortedPictures(assets, lib) {
  if (!assets) return [];
  const known = Object.keys(lib.folders || {}).map(f => path.resolve(lib.root, f).toLowerCase());
  const out = [];
  const walk = p => {
    let st; try { st = fs.statSync(p); } catch { return; }
    if (st.isDirectory()) {
      if (known.some(k => path.resolve(p).toLowerCase() === k)) return;
      for (const e of fs.readdirSync(p)) if (!e.startsWith('.')) walk(path.join(p, e));
    } else if (IMG.test(p)) out.push(fwd(path.relative(assets, p)));
  };
  walk(assets);
  return out;
}
// Looks a person approved on an earlier board version are part of the library from then on.
function addLooks(lib) {
  const lookRoot = path.join(dir, 'subjects', 'looks');
  for (const kind of ['characters', 'locations', 'props', 'wardrobe']) {
    let files = [];
    try { files = fs.readdirSync(path.join(lookRoot, kind)).filter(f => IMG.test(f)); } catch { files = []; }
    const approved = readJson(path.join(lookRoot, 'approved.json')) || {};
    for (const f of files) {
      const id = f.replace(/(-r\d+)?\.[^.]+$/, '');
      if (!approved[kind + '-' + id] || approved[kind + '-' + id].file !== fwd(path.join('subjects', 'looks', kind, f))) continue;
      if (lib.items.some(i => i.kind === kind && slug(i.name) === id)) continue;
      lib.items.push({ kind, name: approved[kind + '-' + id].name || id, key: approved[kind + '-' + id].name ? approved[kind + '-' + id].name.toLowerCase() : id.replace(/-/g, ' '), aliases: [], images: [fwd(path.join(dir, 'subjects', 'looks', kind, f))], videos: [], scope: 'look', sources: ['approved look'], clash: null });
    }
  }
}

// The continuity block's labels: an all-capitals name, an optional (scene note), then a colon.
// A label with a person word in it is a character; anything else (THE LEGO CITY) is a prop or set.
const PERSON = /\b(GIRL|BOY|MAN|MEN|WOMAN|WOMEN|FATHER|MOTHER|DAD|MUM|MOM|SON|DAUGHTER|BROTHER|SISTER|WIFE|HUSBAND|CHILD|KID|KIDS|BABY|OFFICER|OFFICERS|DRIVER|DOCTOR|NURSE|TEACHER|FRIEND|GRANDMA|GRANDPA|GRANDMOTHER|GRANDFATHER|AUNTIE|UNCLE|HOST|PRESENTER|NARRATOR|CUSTOMER|STAFF|WORKER|GUARD|INMATE|POLICE|CHEF|CROWD|FAMILY|COUPLE|PERSON|PEOPLE|LEAD|HERO|VILLAIN)\b/;
function continuityLabels(text) {
  const out = [];
  const re = /(?:^|[.;:,–—-]\s+|\s)((?:THE\s+)?[A-Z][A-Z0-9'’\-]*(?:\s+[A-Z][A-Z0-9'’\-]*){0,4})\s*(?:\([^)]{0,60}\))?:\s/g;
  for (const m of String(text || '').matchAll(re)) {
    const name = m[1].replace(/['’]+$/, '').trim();
    if (name.length < 3 || /^(CONTINUITY|NOTE|NOTES|STYLE|GRADE|TEXTURE|LIGHT|LIGHTING|PALETTE|CAMERA|SHOT|FRAME|NEGATIVE)$/.test(name)) continue;
    if (out.some(o => o.name === name)) continue;
    out.push({ name, kind: PERSON.test(name) ? 'characters' : 'props' });
  }
  return out;
}
// Does a prompt name this subject? "THE SCDF OFFICER" is also found as "the SCDF officer" or "SCDF officer".
function mentionsName(words, name) {
  const w = ' ' + String(words || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
  const full = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const bare = full.replace(/^the /, '');
  const sing = bare.replace(/s$/, '');
  return [full, bare, sing].some(n => n.length > 2 && w.includes(' ' + n + ' '));
}

// ---------------------------------------------------------------------------------------
// The record on disk: the previous decisions survive a rescan.
// ---------------------------------------------------------------------------------------
function load() { return readJson(outFile) || { job: jobId, board: n, subjects: [] }; }
function save(rec) {
  rec.updatedAt = new Date().toISOString();
  fs.writeFileSync(outFile, JSON.stringify(rec, null, 2) + '\n');
  fs.writeFileSync(path.join(boardDir, 'subjects.md'), render(rec));
}
function blockerOf(s) {
  if (s.status === 'ready') return null;
  if (s.status === 'clash' && !s.decision) return 'two pictures share this name; a person picks one';
  if (!s.decision) return 'no picture, and nobody has decided yet';
  if (s.decision === 'wait') return "waiting for the client's photo";
  if (s.decision === 'generate') return s.look && s.look.file ? 'a look is generated and waits for approval' : 'a look is to be generated';
  return null; // prompt: the storyboard draws it from the words, by choice
}
function render(rec) {
  const lines = ['# Subjects for storyboard v' + rec.board, '', 'Pictures from: ' + (rec.library.root || 'no library found') + (rec.library.unsorted ? ' · ' + rec.library.unsorted + ' pictures in folders the check cannot sort' : ''), '',
    '| Subject | Kind | Panels | Status | Decision | Blocks the sample |', '|---|---|---|---|---|---|'];
  for (const s of rec.subjects) lines.push('| ' + s.name + ' | ' + KIND_LABEL[s.kind] + ' | ' + s.panels.join(' ') + ' | ' + s.status + (s.files.length ? ' (' + s.files.length + ' picture' + (s.files.length === 1 ? '' : 's') + ')' : '') + ' | ' + (s.decision || '') + ' | ' + (blockerOf(s) || '') + ' |');
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------------------
// scan
// ---------------------------------------------------------------------------------------
async function scan() {
  const manifest = readJson(path.join(boardDir, 'generation-manifest.json'));
  if (!manifest || !Array.isArray(manifest.items)) { console.error('No generation manifest in storyboard/v' + n + '; the subject check reads its panels.'); process.exit(3); }
  const { root, assets } = libraryRoot();
  const lib = refs.scanLibrary(root, refs.scopeOf({ ...job, jobId }));
  addLooks(lib);
  const unsorted = unsortedPictures(assets, lib);
  const found = new Map();
  const add = (kind, name, panel, entry) => {
    const id = kind + '-' + slug(name);
    const s = found.get(id) || { id, kind, name, panels: [], status: entry.status, files: entry.files || [], why: entry.why || null, sources: entry.sources || null };
    if (!s.panels.includes(panel)) s.panels.push(panel);
    found.set(id, s);
  };
  const items = manifest.items.filter(i => i && i.panel);
  const wordsOf = it => [it.prompt, it.frame, it.caption, it.notes].filter(Boolean).join(' ');
  // The recurring subjects: the continuity block's labelled entries ("THE GIRL: Singaporean, 8...").
  // Screenplay capitals are only the fallback for a board with no continuity block, because in
  // running prose they also catch agency acronyms and sentence fragments.
  const continuity = [manifest.continuity, manifest.preamble].filter(x => typeof x === 'string').join(' ');
  const labelled = continuityLabels(continuity);
  const named = labelled.length ? labelled : [...new Set(items.flatMap(it => refs.capitalNames(wordsOf(it))))].map(name => ({ name, kind: 'characters' }));
  const libHit = (kind, name) => {
    const k = name.toLowerCase().replace(/^the\s+/, '');
    return lib.items.find(i => (i.kind === kind || kind === 'props') && [i.key].concat(i.aliases).some(a => a === name.toLowerCase() || a === k));
  };
  for (const it of items) {
    const panel = String(it.panel).toUpperCase();
    const words = wordsOf(it);
    // Fields the manifest item names, and library pictures the prompt mentions by name.
    const need = refs.panelNeeds({ id: panel, scene: it.scene, characters: it.characters, location: it.location, props: it.props, wardrobe: it.wardrobe }, '', lib);
    const mentioned = refs.panelNeeds({ id: panel }, words, lib);
    for (const f of need.found.concat(mentioned.found)) if (f.kind !== 'motion') add(f.kind, f.name, panel, { status: 'ready', files: f.item.images, sources: f.item.sources });
    for (const m of need.missing) add(m.kind, m.name, panel, { status: 'missing', why: m.why });
    for (const c of need.clashes.concat(mentioned.clashes)) {
      const item = lib.items.find(i => i.kind === c.kind && i.name === c.name);
      add(c.kind, c.name, panel, { status: 'clash', sources: c.sources, files: item ? item.images : [] });
    }
    for (const s of named) {
      if (!mentionsName(words, s.name)) continue;
      const hit = libHit(s.kind, s.name);
      if (hit && [...found.values()].some(f => f.files === hit.images)) continue;
      add(hit ? hit.kind : s.kind, hit ? hit.name : s.name, panel, hit ? { status: hit.clash ? 'clash' : 'ready', files: hit.images, sources: hit.clash || hit.sources } : { status: 'missing', why: 'a recurring subject with no picture supplied' });
    }
  }
  // A labelled subject that no prompt names still recurs by design: list it with no panels.
  for (const s of labelled) {
    if ([...found.values()].some(f => slug(f.name) === slug(s.name))) continue;
    const hit = libHit(s.kind, s.name);
    const id = (hit ? hit.kind : s.kind) + '-' + slug(hit ? hit.name : s.name);
    found.set(id, { id, kind: hit ? hit.kind : s.kind, name: hit ? hit.name : s.name, panels: [], status: hit ? 'ready' : 'missing', files: hit ? hit.images : [], why: hit ? null : 'in the continuity block, no picture supplied', sources: hit ? hit.sources : null });
  }
  const prev = load();
  const before = new Map((prev.subjects || []).map(s => [s.id, s]));
  const subjects = [...found.values()].map(s => {
    const p = before.get(s.id) || {};
    const keep = { decision: p.decision || null, decidedBy: p.decidedBy || null, decidedAt: p.decidedAt || null, asked: p.asked || null, look: p.look || null, pick: p.pick || null };
    const out = { ...s, ...keep };
    if (out.look && out.look.approvedBy && out.look.file) { out.status = 'ready'; out.files = [out.look.file]; out.source = 'look'; }
    else if (out.status === 'clash' && out.pick) { out.status = 'ready'; out.source = 'picked'; }
    else out.source = out.status === 'ready' ? 'library' : null;
    return out;
  }).sort((a, b) => ['characters', 'locations', 'props', 'wardrobe'].indexOf(a.kind) - ['characters', 'locations', 'props', 'wardrobe'].indexOf(b.kind) || a.name.localeCompare(b.name));
  const rec = { job: jobId, board: n, library: { root: root ? fwd(root) : null, layout: lib.layout, folders: lib.folders, unsorted: unsorted.length, unsortedSample: unsorted.slice(0, 8), warnings: lib.warnings }, subjects };
  // Ask once per subject that needs a person and has not been asked.
  let asked = 0;
  for (const s of subjects) {
    if (s.asked || s.status === 'ready' || s.decision) continue;
    const where = s.panels.length ? ' (' + s.panels.length + ' panel' + (s.panels.length === 1 ? '' : 's') + ': ' + s.panels.slice(0, 6).join(', ') + (s.panels.length > 6 ? '…' : '') + ')' : '';
    const text = s.status === 'clash'
      ? s.name + ' (' + KIND_LABEL[s.kind] + ')' + where + ': two folders have a picture with this name. Which one is meant?'
      : s.name + ' (' + KIND_LABEL[s.kind] + ')' + where + ': no picture was supplied. What should the storyboard use?';
    const options = s.status === 'clash' ? s.sources.map(x => 'Use ' + x).concat([OPT.prompt]) : [OPT.generate, OPT.wait, OPT.prompt];
    s.asked = 'ref-' + s.id;
    await board.call('question', { key: jobId, id: s.asked, item: 'storyboard', text, options, from: 'orchestrator', status: 'open', createdAt: new Date().toISOString() }, { argv: rest });
    asked++;
  }
  save(rec);
  report(rec, asked);
}

function report(rec, asked) {
  const blocking = rec.subjects.filter(blockerOf);
  if (asJson) { console.log(JSON.stringify({ board: rec.board, subjects: rec.subjects.length, ready: rec.subjects.filter(s => s.status === 'ready').length, blocking: blocking.map(s => ({ id: s.id, name: s.name, why: blockerOf(s) })), unsorted: rec.library.unsorted, asked: asked || 0 }, null, 2)); }
  else {
    const ready = rec.subjects.filter(s => s.status === 'ready').length;
    console.log('Subjects on storyboard v' + rec.board + ': ' + rec.subjects.length + ', ' + ready + ' with a picture' + (rec.library.unsorted ? '; ' + rec.library.unsorted + ' pictures in Client Assets sit in folders the check cannot sort (name them Cast, Locations, Props or Wardrobe to use them)' : '') + '.');
    for (const s of blocking) console.log('  waiting: ' + s.name + ' (' + KIND_LABEL[s.kind] + '): ' + blockerOf(s));
    if (asked) console.log(asked + ' question' + (asked === 1 ? '' : 's') + ' queued for the board. Push, then end the turn.');
    if (!blocking.length) console.log('Nothing blocks the sample panel.');
  }
  process.exit(blocking.length ? 1 : 0);
}

// ---------------------------------------------------------------------------------------
// Decisions: from the board (land) or from chat (decide).
// ---------------------------------------------------------------------------------------
function apply(s, choice, by) {
  const at = new Date().toISOString();
  if (choice === 'use-look') { if (!s.look || !s.look.file) return 'no look on disk to approve'; s.look.approvedBy = by; s.look.approvedAt = at; s.status = 'ready'; s.files = [s.look.file]; s.source = 'look'; approveLook(s); return null; }
  if (choice === 'redo') { if (!s.look) return 'no look to regenerate'; s.look.redo = true; s.look.approvedBy = null; return null; }
  if (choice.startsWith('use ')) { s.pick = choice.slice(4); s.decision = 'pick'; s.status = 'ready'; s.source = 'picked'; s.decidedBy = by; s.decidedAt = at; return null; }
  if (!['generate', 'wait', 'prompt'].includes(choice)) return 'unknown choice ' + choice;
  s.decision = choice; s.decidedBy = by; s.decidedAt = at;
  return null;
}
function approveLook(s) {
  const f = path.join(dir, 'subjects', 'looks', 'approved.json');
  const all = readJson(f) || {};
  all[s.id] = { name: s.name, file: s.look.file, by: s.look.approvedBy, at: s.look.approvedAt };
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(all, null, 2) + '\n');
}
function choiceOf(answer) {
  const a = String(answer || '').trim().toLowerCase();
  if (/^use this look|^use the look|^approve/.test(a)) return 'use-look';
  if (/regenerat|redo|another/.test(a)) return 'redo';
  if (/^use /.test(a)) return 'use ' + String(answer).trim().slice(4);
  if (/generat/.test(a)) return 'generate';
  if (/wait|photo/.test(a)) return 'wait';
  if (/leave|storyboard|prompt/.test(a)) return 'prompt';
  return null;
}
async function landAnswers() {
  const rec = load();
  const got = board.landed(jobId, rest) || {};
  let applied = 0;
  for (const a of got.answers || []) {
    const s = rec.subjects.find(x => x.asked === a.id || (x.look && x.look.question === a.id));
    if (!s) continue;
    const isLook = s.look && s.look.question === a.id;
    if (isLook && (s.look.approvedBy || s.look.redo)) continue;
    if (!isLook && (s.decision || s.pick)) continue;
    const c = choiceOf(a.answer);
    if (!c) { console.error('Could not read "' + a.answer + '" for ' + s.name + '; decide it with subject-check.js decide.'); continue; }
    const err = apply(s, c, a.answeredBy || 'board');
    if (err) console.error(s.name + ': ' + err); else applied++;
  }
  save(rec);
  console.log(applied + ' answer' + (applied === 1 ? '' : 's') + ' applied.');
  report(rec, 0);
}
async function decide() {
  const rec = load();
  const s = rec.subjects.find(x => x.id === opt('--subject'));
  if (!s) usage('No subject ' + (opt('--subject') || '(none given)') + '. Run scan and use an id from subjects.json.');
  const err = apply(s, String(opt('--choice') || ''), opt('--by') || 'chat');
  if (err) { console.error('Nothing was recorded: ' + err + '.'); process.exit(1); }
  if (s.asked) await board.call('answered', { key: jobId, id: s.look && s.look.question && /look|redo/.test(opt('--choice')) ? s.look.question : s.asked, answer: opt('--choice'), by: opt('--by') || 'chat' }, { argv: rest });
  save(rec);
  report(rec, 0);
}

// ---------------------------------------------------------------------------------------
// A generated look: record it and put it in front of a person.
// ---------------------------------------------------------------------------------------
function thumbOf(abs) {
  const py = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c',
    'import sys,io,base64\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert("RGB")\nim.thumbnail((480,480))\nb=io.BytesIO()\nim.save(b,"JPEG",quality=80)\nprint("data:image/jpeg;base64,"+base64.b64encode(b.getvalue()).decode())', abs], { encoding: 'utf8' });
  return py.status === 0 ? py.stdout.trim() : null;
}
async function look() {
  const rec = load();
  const s = rec.subjects.find(x => x.id === opt('--subject'));
  if (!s) usage('No subject ' + (opt('--subject') || '(none given)') + '.');
  if (s.decision !== 'generate') { console.error('Nothing was recorded: nobody chose to generate a look for ' + s.name + '.'); process.exit(1); }
  const rel = opt('--file');
  if (!rel || !fs.existsSync(path.join(dir, rel))) usage('Nothing was recorded: --file must name the landed look inside the job.');
  const attempts = ((s.look && s.look.attempts) || 0) + 1;
  s.look = { file: fwd(rel), attempts, redo: false, approvedBy: null, question: 'look-' + s.id + '-' + attempts };
  const thumb = thumbOf(path.join(dir, rel));
  await board.call('question', { key: jobId, id: s.look.question, item: 'storyboard', from: 'orchestrator', status: 'open', createdAt: new Date().toISOString(),
    text: 'Look for ' + s.name + ' (' + KIND_LABEL[s.kind] + ')' + (attempts > 1 ? ', attempt ' + attempts : '') + '. Every panel with ' + s.name + ' will be drawn from this picture.',
    options: ['Use this look', 'Regenerate (1 credit)'], ...(thumb ? { thumb } : {}) }, { argv: rest });
  save(rec);
  console.log('Look for ' + s.name + ' recorded and asked on the board' + (thumb ? ' with a preview' : ' (no preview: Pillow could not read it)') + '. Push, then end the turn.');
}

// ---------------------------------------------------------------------------------------
// may-generate: the spend guard's question. Yes only for a subject a person chose to generate,
// with no look waiting for an answer, and at most one generation per yes.
// ---------------------------------------------------------------------------------------
function mayGenerate() {
  const rec = load();
  const s = rec.subjects.find(x => x.id === opt('--subject'));
  const out = !s ? { allowed: false, reason: 'no subject ' + opt('--subject') + ' in storyboard/v' + n + '/subjects.json; run subject-check.js scan' }
    : s.decision !== 'generate' ? { allowed: false, reason: 'nobody chose to generate a look for ' + s.name }
    : s.look && s.look.file && !s.look.redo ? { allowed: false, reason: 'a look for ' + s.name + ' is already generated and waits for its answer on the board' }
    : { allowed: true, attempt: ((s.look && s.look.attempts) || 0) + 1 };
  console.log(JSON.stringify(out));
  process.exit(out.allowed ? 0 : 1);
}

(async () => {
  if (cmd === 'scan') await scan();
  else if (cmd === 'land') await landAnswers();
  else if (cmd === 'decide') await decide();
  else if (cmd === 'look') await look();
  else mayGenerate();
})();
