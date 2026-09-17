#!/usr/bin/env node
// Land the client's folder in inputs/{client}/{job-id}/ from either of two places.
//
//   node drive-pull.js <client> <job-id> <local-folder>            copies it, writes the manifest
//   node drive-pull.js <client> <job-id> <drive-link-or-id>        writes pull-plan.json, exit 4:
//                                                                  the session fetches the files
//                                                                  with the Google Drive connector
//   node drive-pull.js stage <client> <job-id> --rel <Sub/name.ext> --b64 <file>
//                                                                  lands one downloaded file
//   node drive-pull.js finish <client> <job-id>                    manifest for what was staged
//
// Either route ends with the same manifest.json (source, pulledAt, one row per file with bytes
// and sha256), so nothing downstream knows which way the folder came in. Sub-folders are copied
// as they are named; the manifest maps each file to Brief, Concept or Client Assets by the first
// path segment, case-insensitively, and records `unmapped` for anything else. Office files get a
// Markdown sidecar from office-text.py when a python is present, and the manifest lists both.
//
// A second pull never replaces the first: without --again it refuses; with it the files land in
// pull-{n}/ beside the first and the manifest records both.
//
// Exit 0 done · 1 a file failed · 2 usage · 3 refused (job missing, already pulled, folder empty)
// · 4 the Drive route needs the session to fetch (plan written)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const ws = require('./lib-workspace.js');

const argv = process.argv.slice(2);
const flag = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const json = argv.includes('--json');
const again = argv.includes('--again');

const FOLDERS = { brief: 'Brief', concept: 'Concept', 'client assets': 'Client Assets', assets: 'Client Assets', 'client-assets': 'Client Assets' };
const OFFICE = /\.(docx|pptx|xlsx)$/i;
const SKIP = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

// Google Drive folder links come in several shapes; the id is what the connector wants.
function driveFolderId(s) {
  const t = String(s || '').trim();
  let m = t.match(/drive\.google\.com\/(?:drive\/)?(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  m = t.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{25,}$/.test(t) && !fs.existsSync(t)) return t;
  return null;
}

function mapFolder(rel) {
  const first = rel.split('/')[0];
  if (rel.indexOf('/') < 0) return 'unmapped';
  return FOLDERS[first.toLowerCase()] || 'unmapped';
}

function walk(dir, base = dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name) || name === 'manifest.json' || name === 'pull-plan.json') continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (!/^pull-\d+$/.test(name)) walk(p, base, out); continue; }
    out.push({ abs: p, rel: ws.fwd(path.relative(base, p)), bytes: st.size });
  }
  return out;
}

const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

function python() {
  for (const py of ['python3', 'python']) {
    const r = spawnSync(py, ['--version'], { encoding: 'utf8' });
    if (!r.error && r.status === 0) return py;
  }
  return null;
}

function sidecars(dest) {
  const py = python();
  if (!py) return { made: 0, note: 'no python: Office files have no Markdown sidecar' };
  const r = spawnSync(py, [path.join(__dirname, 'office-text.py'), dest], { encoding: 'utf8' });
  const made = (r.stdout || '').split('\n').filter(l => /\.md\b/.test(l)).length;
  return { made, note: r.status === 0 || r.status === 3 ? null : 'office-text.py exit ' + r.status };
}

function writeManifest(dest, source, route, extra) {
  const files = walk(dest).map(f => ({
    path: f.rel, bytes: f.bytes, sha256: sha(f.abs), folder: mapFolder(f.rel),
    ...(OFFICE.test(f.rel) ? { office: true } : {}),
    ...(/\.md$/i.test(f.rel) && fs.existsSync(f.abs.replace(/\.md$/i, '')) ? {} : {}),
  }));
  // A sidecar is the Office file's name plus .md; mark it so intake reads one, not two documents.
  const names = new Set(files.map(f => f.path));
  for (const f of files) {
    const stem = f.path.replace(/\.md$/i, '');
    if (/\.md$/i.test(f.path) && OFFICE.test(stem) && names.has(stem)) f.sidecarOf = stem;
  }
  const counts = { Brief: 0, Concept: 0, 'Client Assets': 0, unmapped: 0, unreadable: 0 };
  for (const f of files) if (!f.sidecarOf) counts[f.folder] = (counts[f.folder] || 0) + 1;
  const manifest = { source, route, pulledAt: new Date().toISOString(), counts, files, ...(extra || {}) };
  fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

function say(manifest, dest) {
  const c = manifest.counts;
  const line = 'Pulled ' + manifest.files.filter(f => !f.sidecarOf).length + ' files into ' + ws.fwd(dest) +
    ': Brief ' + c.Brief + ', Concept ' + c.Concept + ', Client Assets ' + c['Client Assets'] +
    (c.unmapped ? ', unmapped ' + c.unmapped : '') + ', unreadable ' + c.unreadable + '.' +
    (c.Brief ? '' : ' The Brief folder is empty: the router will block until a brief lands.');
  if (json) console.log(JSON.stringify({ ok: true, dest: ws.fwd(dest), manifest }, null, 2));
  else console.log(line);
}

function destFor(client, jobId) {
  const base = path.join(ws.inputsDir(client, argv), jobId);
  if (!fs.existsSync(path.join(base, 'manifest.json'))) return { dest: base, n: 1 };
  if (!again) {
    console.error('REFUSED: ' + ws.fwd(base) + ' was pulled already. Add --again to land a second pull beside it as pull-2/.');
    process.exit(3);
  }
  for (let n = 2; n < 50; n++) {
    const d = path.join(base, 'pull-' + n);
    if (!fs.existsSync(path.join(d, 'manifest.json'))) return { dest: d, n };
  }
  console.error('REFUSED: too many pulls.'); process.exit(3);
}

function jobExists(client, jobId) {
  if (!fs.existsSync(ws.jobDir(client, jobId, argv))) {
    console.error('No job ' + jobId + ' for ' + client + '. Run scaffold-job.js first.');
    process.exit(3);
  }
}

// ---- routes -----------------------------------------------------------------------------

function pullLocal(client, jobId, src) {
  const { dest } = destFor(client, jobId);
  const files = walk(src);
  if (!files.length) { console.error('REFUSED: ' + ws.fwd(src) + ' holds no files.'); process.exit(3); }
  fs.mkdirSync(dest, { recursive: true });
  let failed = 0;
  const unreadable = [];
  for (const f of files) {
    const to = path.join(dest, f.rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    try { fs.copyFileSync(f.abs, to); }
    catch (e) { failed++; unreadable.push({ path: f.rel, status: 'unreadable', reason: e.message }); }
  }
  const side = sidecars(dest);
  const manifest = writeManifest(dest, ws.fwd(path.resolve(src)), 'local', { unreadable, sidecarNote: side.note });
  manifest.counts.unreadable = unreadable.length;
  fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2));
  say(manifest, dest);
  process.exit(failed ? 1 : 0);
}

function planDrive(client, jobId, link, folderId) {
  const { dest } = destFor(client, jobId);
  fs.mkdirSync(dest, { recursive: true });
  const plan = {
    source: link, folderId, route: 'drive', status: 'staging', plannedAt: new Date().toISOString(),
    // Google-native files have no bytes of their own; export them as the Office kind the
    // directors already read. Everything else downloads as it is.
    exportAs: {
      'application/vnd.google-apps.document': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: '.docx' },
      'application/vnd.google-apps.spreadsheet': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: '.xlsx' },
      'application/vnd.google-apps.presentation': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: '.pptx' },
    },
    steps: [
      'search_files with query "parentId = \'' + folderId + '\'" (excludeContentSnippets true); for each sub-folder (mimeType application/vnd.google-apps.folder) search again with its id; never search by title',
      'download_file_content for each file (exportMimeType from exportAs for Google-native kinds); write the base64 string to a temp file',
      'node drive-pull.js stage ' + client + ' ' + jobId + ' --rel "<Sub-folder>/<name><ext>" --b64 <temp file>',
      'node drive-pull.js finish ' + client + ' ' + jobId,
    ],
  };
  fs.writeFileSync(path.join(dest, 'pull-plan.json'), JSON.stringify(plan, null, 2));
  if (json) console.log(JSON.stringify({ ok: false, needsSession: true, dest: ws.fwd(dest), plan }, null, 2));
  else {
    console.log('Drive folder ' + folderId + ': this script cannot reach Google Drive itself. Plan written to ' + ws.fwd(path.join(dest, 'pull-plan.json')) + '.');
    console.log('Fetch with the Google Drive connector, then stage each file and finish:');
    for (const s of plan.steps) console.log('  - ' + s);
  }
  process.exit(4);
}

function stage(client, jobId) {
  const rel = flag('--rel'), b64 = flag('--b64');
  if (!rel || !b64 || /^(\.\.|\/|[A-Za-z]:)/.test(rel) || rel.includes('/../')) {
    console.error('usage: drive-pull.js stage <client> <job-id> --rel <Sub-folder/name.ext> --b64 <file with the base64 string>');
    process.exit(2);
  }
  const base = path.join(ws.inputsDir(client, argv), jobId);
  const dest = currentStagingDir(base);
  const to = path.join(dest, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  let raw;
  try { raw = fs.readFileSync(b64, 'utf8').replace(/^data:[^,]*,/, '').replace(/\s+/g, ''); }
  catch (e) { console.error('Cannot read ' + b64 + ': ' + e.message); process.exit(1); }
  const bytes = Buffer.from(raw, 'base64');
  if (!bytes.length) { console.error('Empty after decoding: ' + b64); process.exit(1); }
  fs.writeFileSync(to, bytes);
  console.log('Staged ' + rel + ' (' + bytes.length + ' bytes) in ' + ws.fwd(dest));
  process.exit(0);
}

// The staging folder is the newest pull folder that has a plan but no manifest yet.
function currentStagingDir(base) {
  const candidates = [base];
  try { for (const n of fs.readdirSync(base)) if (/^pull-\d+$/.test(n)) candidates.push(path.join(base, n)); } catch { /* none */ }
  const open = candidates.filter(d => fs.existsSync(path.join(d, 'pull-plan.json')) && !fs.existsSync(path.join(d, 'manifest.json')));
  if (!open.length) { console.error('No Drive pull in progress under ' + ws.fwd(base) + '. Run drive-pull.js <client> <job-id> <drive-link> first.'); process.exit(3); }
  return open.sort().pop();
}

function finish(client, jobId) {
  const base = path.join(ws.inputsDir(client, argv), jobId);
  const dest = currentStagingDir(base);
  const plan = JSON.parse(fs.readFileSync(path.join(dest, 'pull-plan.json'), 'utf8'));
  if (!walk(dest).length) { console.error('REFUSED: nothing staged in ' + ws.fwd(dest) + ' yet.'); process.exit(3); }
  const side = sidecars(dest);
  const manifest = writeManifest(dest, plan.source, 'drive', { folderId: plan.folderId, unreadable: [], sidecarNote: side.note });
  plan.status = 'done'; plan.finishedAt = manifest.pulledAt;
  fs.writeFileSync(path.join(dest, 'pull-plan.json'), JSON.stringify(plan, null, 2));
  say(manifest, dest);
  process.exit(0);
}

// ---- main -------------------------------------------------------------------------------

const pos = ws.positionals(argv);
if (pos[0] === 'stage' || pos[0] === 'finish') {
  const [cmd, client, jobId] = pos;
  if (!client || !jobId) { console.error('usage: drive-pull.js ' + cmd + ' <client> <job-id> ...'); process.exit(2); }
  jobExists(client, jobId);
  if (cmd === 'stage') stage(client, jobId); else finish(client, jobId);
} else {
  const [client, jobId, ...rest] = pos;
  const src = rest.join(' ').trim();
  if (!client || !jobId || !src) {
    console.error('usage: drive-pull.js <client> <job-id> <local-folder | Google Drive folder link or id> [--again] [--json]');
    process.exit(2);
  }
  jobExists(client, jobId);
  const id = driveFolderId(src);
  if (id) planDrive(client, jobId, src, id);
  else if (fs.existsSync(src) && fs.statSync(src).isDirectory()) pullLocal(client, jobId, src);
  else {
    console.error('Not a folder on this computer and not a Google Drive folder link: ' + src);
    console.error('Give the path to the folder that holds Brief, Concept and Client Assets, or its Drive link.');
    process.exit(2);
  }
}
