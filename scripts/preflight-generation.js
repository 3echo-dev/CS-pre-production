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
//   4. the panel count fits the ceiling: the sample approval's maxSpendCredits, else
//      credit_ceiling_per_job in CONFIG.md; images cost 1 credit each
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

// 4. The ceiling.
const ceiling = sampleApproval && Number.isFinite(Number((sampleApproval.scope || {}).maxSpendCredits))
  ? Number(sampleApproval.scope.maxSpendCredits) : ceilingFromConfig();
const cost = items.length;
if (sampleApproval && cost > ceiling) fail('the batch is ' + cost + ' panels at 1 credit each, over the ' + ceiling + ' agreed');
else note(cost + ' panel' + (cost === 1 ? '' : 's') + ' at 1 credit each, ceiling ' + ceiling);

// Panels already on disk for this board version: what has been spent so far.
let generated = 0;
try { generated = fs.readdirSync(path.join(boardRoot, 'v' + latest)).filter(f => /^P\d{2,}\.(png|jpe?g|webp)$/i.test(f)).length; } catch { generated = 0; }
const result = {
  valid: !problems.length, client, jobId, boardVersion: latest, panels: panelIds.length,
  sampleApproved: Boolean(sampleApproval), allowed: sampleApproval ? 'batch' : 'sample',
  samplePanel: sample ? String(sample.panel || '').toUpperCase() : null, generated,
  credits: cost, ceiling, problems, notes,
};
if (json) console.log(JSON.stringify(result, null, 2));
else {
  for (const n of notes) console.log('note: ' + n);
  for (const p of problems) console.error('PROBLEM: ' + p);
  console.log(problems.length ? 'Not safe to generate. Fix the problems above.' : (sampleApproval ? 'Safe to generate the batch.' : 'Safe to generate the sample panel only.'));
}
process.exit(problems.length ? 1 : 0);
