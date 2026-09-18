#!/usr/bin/env node
// The pre-spend gate for storyboard panels. Proves the PLAN is safe to generate, before a
// single credit moves. Its sibling preflight-media.js proves the PIPE (that a generated file
// can reach disk). Run both before the first create_image_job of a project.
//
//   node preflight-generation.js <client> <job-id> [--json]
//
// Checks, in order:
//   1. the latest storyboard/v{n}/panels.md exists and lists panels with stable ids
//   2. the generation manifest names only panels on that board, and every panel once
//   3. one panel is marked as the sample, and the batch is not asked for before the sample
//      approval exists (approvals/sample-{n}.json, decision approved)
//   4. the panels still to generate fit the ceiling. Before the sample approval the ceiling is
//      credit_ceiling_per_job in CONFIG.md. After it, the ceiling is what the person agreed for
//      the batch (maxSpendCredits) on top of the panels that were on disk when they agreed
//      (scope.panelsOnDisk, written by record-approval.js). A panel counts as generated the
//      moment its file is on disk; no status word in the manifest changes the count. This used
//      to count every manifest item against the batch figure, so a ceiling recorded as the 43
//      panels remaining was refused as over the 43 agreed, and the guard taught people to work
//      around it.
//
// Exit 0 safe to generate · 1 problems found · 3 no storyboard on disk · 2 usage
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const json = argv.includes('--json');
const { brand: client, jobId, dir } = ws.resolveJobArgs(argv, argv);
if (!client || !jobId) {
  console.error('usage: preflight-generation.js <client> <job-id> [--json]');
  process.exit(2);
}
const problems = [], notes = [];
const fail = m => problems.push(m);
const note = m => notes.push(m);
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));

function ceilingFromConfig() {
  try {
    const txt = fs.readFileSync(path.join(ROOT, 'CONFIG.md'), 'utf8');
    const m = txt.match(/^credit_ceiling_per_job:\s*(\d+)/m);
    return m ? Number(m[1]) : 30;
  } catch { return 30; }
}

// 1. The latest board.
const boardRoot = path.join(dir, 'storyboard');
let versions = [];
try { versions = fs.readdirSync(boardRoot).filter(f => /^v\d+$/.test(f)).map(f => Number(f.slice(1))).sort((a, b) => a - b); } catch { versions = []; }
const latest = versions.length ? versions[versions.length - 1] : null;
const panelsFile = latest !== null ? path.join(boardRoot, 'v' + latest, 'panels.md') : null;
if (!panelsFile || !fs.existsSync(panelsFile)) {
  const out = { valid: false, problems: ['no storyboard on disk: storyboard/v{n}/panels.md is missing'], notes };
  if (json) console.log(JSON.stringify(out, null, 2)); else console.error('NO STORYBOARD: nothing to generate from yet.');
  process.exit(3);
}
const panelIds = [];
for (const line of fs.readFileSync(panelsFile, 'utf8').split(/\r?\n/)) {
  if (!line.trim().startsWith('|')) continue;
  const first = line.split('|').slice(1, -1).map(c => c.trim())[0] || '';
  if (/^P\d{2,}$/i.test(first)) panelIds.push(first.toUpperCase());
}
if (!panelIds.length) fail('storyboard/v' + latest + '/panels.md lists no panels with ids like P01');
else note('board v' + latest + ' has ' + panelIds.length + ' panels');

// 2. The manifest.
const manifestPath = path.join(boardRoot, 'v' + latest, 'generation-manifest.json');
let manifest = null;
try { manifest = readJson(manifestPath); } catch { fail('storyboard/v' + latest + '/generation-manifest.json is missing or not JSON'); }
const items = manifest && Array.isArray(manifest.items) ? manifest.items : [];
if (manifest && !items.length) fail('the manifest has no items');
const seen = new Set();
for (const it of items) {
  const id = String(it && it.panel || '').toUpperCase();
  if (!panelIds.includes(id)) fail('manifest item names ' + (id || '(no panel)') + ', which is not on board v' + latest);
  if (seen.has(id)) fail('manifest names ' + id + ' twice');
  seen.add(id);
  if (!it.prompt || String(it.prompt).trim().length < 20) fail(id + ' has no usable prompt');
  if (Array.isArray(it.assetIds) && it.assetIds.length > 16) fail(id + ' cites more than 16 image references');
}
for (const id of panelIds) if (!seen.has(id)) fail('board panel ' + id + ' has no manifest item');

// 3. The sample first.
const apDir = path.join(dir, 'approvals');
let sampleApproval = null;
try {
  sampleApproval = fs.readdirSync(apDir).filter(f => /^sample-\d+\.json$/.test(f)).map(f => readJson(path.join(apDir, f)))
    .sort((a, b) => a.round - b.round).filter(r => r.decision === 'approved').pop() || null;
} catch { sampleApproval = null; }
const sample = items.find(it => it && it.sample === true);
if (!sample) fail('no manifest item is marked "sample": true; one hero panel is generated and looked at before the batch');
if (!sampleApproval) note('no sample approval yet: only the sample panel may be generated');

// 4. The ceiling. Disk is the truth about what has been spent: a panel whose file exists is
// generated, whatever word its manifest item carries.
const boardDir = path.join(boardRoot, 'v' + latest);
const onDiskFor = it => {
  const id = String(it && it.panel || '').toUpperCase();
  const named = it && it.file ? path.join(dir, String(it.file)) : null;
  if (named && fs.existsSync(named)) return true;
  return ['png', 'jpg', 'jpeg', 'webp'].some(ext => fs.existsSync(path.join(boardDir, id + '.' + ext)));
};
let generated = 0;
try { generated = fs.readdirSync(boardDir).filter(f => /^P\d{2,}\.(png|jpe?g|webp)$/i.test(f)).length; } catch { generated = 0; }
const remaining = items.filter(it => !onDiskFor(it)).length;
const scope = (sampleApproval && sampleApproval.scope) || {};
const agreed = Number.isFinite(Number(scope.maxSpendCredits)) ? Number(scope.maxSpendCredits) : null;
// A record written before panelsOnDisk existed was made when only the sample was on disk,
// which is what pull --gate sample counted the batch against.
const baseline = sampleApproval ? (Number.isFinite(Number(scope.panelsOnDisk)) ? Number(scope.panelsOnDisk) : 1) : 0;
const configCeiling = ceilingFromConfig();
const ceiling = sampleApproval && agreed !== null ? baseline + agreed : configCeiling;
const cost = remaining;
if (sampleApproval && agreed !== null) {
  if (generated + remaining > ceiling) {
    fail(remaining + ' panel' + (remaining === 1 ? '' : 's') + ' remain to be generated and ' + generated + ' ' + (generated === 1 ? 'is' : 'are') +
      ' on disk, which is ' + (generated + remaining) + ' in all, over the ' + ceiling + ' the sample approval allows (' + baseline +
      ' on disk when it was recorded, plus ' + agreed + ' agreed for the batch). Panels already drawn are not counted against the ' + agreed + '.');
  } else {
    note(items.length + ' panels on the board: ' + generated + ' on disk, ' + remaining + ' to generate at 1 credit each; the sample approval allows ' +
      agreed + ' more' + (Number.isFinite(Number(scope.panelsOnDisk)) ? '' : ' (an older record; the sample alone is assumed to have been on disk when it was made)'));
  }
} else if (remaining > configCeiling) {
  fail(remaining + ' panels to generate at 1 credit each, over credit_ceiling_per_job ' + configCeiling + ' in CONFIG.md; ask what to cut before quoting');
} else {
  note(items.length + ' panels on the board: ' + generated + ' on disk, ' + remaining + ' to generate at 1 credit each, under the per-job ceiling ' + configCeiling);
}
const result = {
  valid: !problems.length, client, jobId, boardVersion: latest, panels: panelIds.length,
  sampleApproved: Boolean(sampleApproval), allowed: sampleApproval ? 'batch' : 'sample',
  samplePanel: sample ? String(sample.panel || '').toUpperCase() : null,
  // generated is what the spend guard compares against ceiling: files on disk now, and the
  // most files the approval allows in all.
  generated, remaining, agreed, onDiskAtApproval: sampleApproval ? baseline : null,
  credits: cost, ceiling, problems, notes,
};
if (json) console.log(JSON.stringify(result, null, 2));
else {
  for (const n of notes) console.log('note: ' + n);
  for (const p of problems) console.error('PROBLEM: ' + p);
  console.log(problems.length ? 'Not safe to generate. Fix the problems above.' : (sampleApproval ? 'Safe to generate the batch.' : 'Safe to generate the sample panel only.'));
}
process.exit(problems.length ? 1 : 0);
