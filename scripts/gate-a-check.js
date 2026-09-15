#!/usr/bin/env node
// May Gate A be asked for? The creative director locks on pictures, not on a panel table, so
// every image panel in the latest storyboard's generation manifest must have its file on disk.
// A board without images passes only when a person recorded that decision in the manifest:
//   "imagesDeferred": { "by": "creative-director", "at": "...", "reason": "..." }
// A panel table alone is not a storyboard; a run that locked on one is what this check stops.
//
//   node gate-a-check.js <client> <job-id> [--json]
//
// Exit 0 pass · 1 fail (names the missing panels) · 2 usage · 3 no storyboard or manifest on disk
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const { brand: client, jobId, dir } = ws.resolveJobArgs(argv, argv);
if (!client || !jobId) { console.error('usage: gate-a-check.js <client> <job-id> [--json]'); process.exit(2); }

const problems = [], notes = [];
const boardRoot = path.join(dir, 'storyboard');
let versions = [];
try { versions = fs.readdirSync(boardRoot).filter(f => /^v\d+$/.test(f)).map(f => Number(f.slice(1))).sort((a, b) => a - b); } catch { versions = []; }
const latest = versions.length ? versions[versions.length - 1] : null;
const vdir = latest !== null ? path.join(boardRoot, 'v' + latest) : null;
if (!vdir || !fs.existsSync(path.join(vdir, 'panels.md'))) { console.error('No storyboard on disk yet.'); process.exit(3); }
const manifestPath = path.join(vdir, 'generation-manifest.json');
if (!fs.existsSync(manifestPath)) { console.error('storyboard v' + latest + ' has no generation manifest yet.'); process.exit(3); }

let manifest;
try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (e) { console.error('generation manifest is not JSON: ' + e.message); process.exit(3); }
const items = (manifest.items || []).filter(it => (it.kind || 'image') === 'image');
if (!items.length) problems.push('the manifest names no image panels');

const missing = [], landed = [];
for (const it of items) {
  const rel = it.file || ('storyboard/v' + latest + '/' + it.panel + '.png');
  const abs = path.join(dir, rel);
  const ok = fs.existsSync(abs) && fs.statSync(abs).size > 0 && it.status !== 'rejected' && it.status !== 'pending';
  (ok ? landed : missing).push(it.panel || rel);
}
notes.push('storyboard v' + latest + ': ' + items.length + ' image panel' + (items.length === 1 ? '' : 's') + ', ' + landed.length + ' on disk');

const deferred = manifest.imagesDeferred;
if (missing.length) {
  if (deferred && deferred.by && deferred.reason) {
    notes.push('images deferred by ' + deferred.by + (deferred.at ? ' on ' + deferred.at : '') + ': ' + deferred.reason + ' (' + missing.length + ' panel' + (missing.length === 1 ? '' : 's') + ' without a file)');
  } else if (deferred) {
    problems.push('imagesDeferred is set but does not say who decided it and why');
  } else {
    const shown = missing.slice(0, 6).join(', ') + (missing.length > 6 ? ' and ' + (missing.length - 6) + ' more' : '');
    problems.push(missing.length + ' of ' + items.length + ' panels have no image on disk (' + shown + '). Generate them through make-image, or a person records the decision to lock without images in the manifest as imagesDeferred');
  }
}
const sample = items.find(it => it.sample === true);
if (sample && !missing.includes(sample.panel) && landed.length && !deferred && sample.status !== 'validated' && sample.status !== 'approved') {
  notes.push('sample ' + sample.panel + ' is on disk; its approval is read from the board at the lock');
}

const result = { valid: !problems.length, boardVersion: latest, panels: items.length, landed: landed.length, missing, deferred: !!(deferred && deferred.by), problems, notes };
try {
  fs.mkdirSync(path.join(dir, 'validation'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'validation', 'gate-a-check.md'), '# Gate A check\n\n' + notes.map(n => '- ' + n).join('\n') + '\n' + (problems.length ? '\n## Problems\n\n' + problems.map(p => '- ' + p).join('\n') + '\n' : '\nok: every panel has its image, or the decision to lock without images is recorded.\n'));
} catch { /* the summary file is a courtesy */ }
if (json) console.log(JSON.stringify(result, null, 2));
else {
  for (const n of notes) console.log('note: ' + n);
  for (const p of problems) console.error('PROBLEM: ' + p);
  console.log(problems.length ? 'Gate A cannot be asked for yet.' : 'ok: every storyboard panel has its image on disk, or the decision to lock without images is recorded. Gate A can be asked for.');
}
process.exit(problems.length ? 1 : 0);
