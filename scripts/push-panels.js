#!/usr/bin/env node
// Queue the storyboard panels for the board's Storyboard tab: one document per panel from the
// latest generation manifest, with a review-size thumbnail and the pixel size for every panel
// whose image is on disk. The size is what the board takes its card ratio from, so a 21:9 frame
// is shown as 21:9 rather than cropped to a portrait box. Run after the storyboard director
// writes the manifest (placeholders, so the Generate button appears) and again after every
// landing from make-image (thumbnails).
//
//   node push-panels.js <client> <job-id> [--only P01,P02] [--json]
//
// Exit 0 queued · 2 usage · 3 no manifest
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ws = require('./lib-workspace.js');
const board = require('./lib-board.js');

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const { brand: client, jobId, dir } = ws.resolveJobArgs(argv, argv);
if (!client || !jobId) { console.error('usage: push-panels.js <client> <job-id> [--only P01,P02] [--json]'); process.exit(2); }
const onlyIdx = argv.indexOf('--only');
const only = onlyIdx >= 0 && argv[onlyIdx + 1] ? new Set(argv[onlyIdx + 1].split(',').map(s => s.trim().toUpperCase())) : null;

const boardRoot = path.join(dir, 'storyboard');
let versions = [];
try { versions = fs.readdirSync(boardRoot).filter(f => /^v\d+$/.test(f)).map(f => Number(f.slice(1))).sort((a, b) => a - b); } catch { versions = []; }
const latest = versions.length ? versions[versions.length - 1] : null;
const manifestPath = latest !== null ? path.join(boardRoot, 'v' + latest, 'generation-manifest.json') : null;
if (!manifestPath || !fs.existsSync(manifestPath)) { console.error('No generation manifest on disk yet.'); process.exit(3); }
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const items = (manifest.items || []).filter(it => (it.kind || 'image') === 'image');

// The caption is the panel's own frame text: the Subject sentence of its prompt, which the
// storyboard director copied verbatim from panels.md.
function captionOf(it) {
  const m = String(it.prompt || '').match(/Subject:\s*([^.]*\.)/);
  return (m ? m[1] : String(it.prompt || '').slice(0, 120)).trim();
}
function thumbOf(file) {
  if (!file) return null;
  const abs = path.join(dir, file);
  if (!fs.existsSync(abs)) return null;
  const r = spawnSync('python', [path.join(__dirname, 'panel-thumb.py'), abs], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (r.status !== 0) { console.error('warning: ' + file + ': ' + (r.stderr || '').trim()); return null; }
  return r.stdout.trim();
}

function sizeOf(file) {
  const abs = path.join(dir, file);
  const r = spawnSync('python', ['-c', 'import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1])\nprint(im.size[0], im.size[1])', abs], { encoding: 'utf8' });
  const m = String(r.stdout || '').trim().match(/^(\d+) (\d+)$/);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

let queued = 0, withThumb = 0;
const at = new Date().toISOString();
(async () => {
for (const it of items) {
  const id = String(it.panel || '').toUpperCase();
  if (!id || (only && !only.has(id))) continue;
  const thumb = thumbOf(it.file);
  const size = thumb ? sizeOf(it.file) : null;
  const payload = {
    key: jobId, id, scene: it.scene || '', storyOrder: it.storyOrder || null, shootOrder: it.shootOrder || null,
    sample: it.sample === true, status: thumb ? (it.status && it.status !== 'pending' ? it.status : 'generated') : (it.status || 'pending'),
    caption: captionOf(it), boardVersion: latest, credits: it.credits || 1, file: it.file || null,
    ...(thumb ? { thumb } : {}), ...(size ? { width: size.width, height: size.height } : {}), updatedAt: at,
  };
  await board.call('panel', payload, { argv });
  queued++; if (thumb) withThumb++;
}
const out = { project: jobId, boardVersion: latest, queued, withThumb, style: manifest.style || null };
if (json) console.log(JSON.stringify(out));
else console.log('Queued ' + queued + ' panel' + (queued === 1 ? '' : 's') + ' for the board, ' + withThumb + ' with a thumbnail. Run board-sync.js push next.');
})();
