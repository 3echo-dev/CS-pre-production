#!/usr/bin/env node
// The Gate C package: the breakdown and every approved day sheet, bound to their hashes.
//
//   node build-release.js <client> <job-id> [--json]
//
// Refuses unless check-approval.js exits 0 for gate C, so an edit after the release was
// approved is a hash mismatch rather than a document somebody has to notice. Copies the
// approved files into release/ with a manifest of their hashes and a README a production
// lead can read. Nothing is sent anywhere: the lead hands the folder over.
//
// Exit 0 built · 1 the approval no longer covers the files · 2 usage · 3 no approval
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ws = require('./lib-workspace.js');
const { hashFile } = require('./hash-artifact.js');

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const { brand: client, jobId, dir } = ws.resolveJobArgs(argv, argv);
if (!client || !jobId) { console.error('usage: build-release.js <client> <job-id> [--json]'); process.exit(2); }

const rootArgs = argv.includes('--root') ? ['--root', argv[argv.indexOf('--root') + 1]] : [];
const check = spawnSync(process.execPath, [path.join(__dirname, 'check-approval.js'), client, jobId, 'C', '--json', ...rootArgs], { encoding: 'utf8' });
let verdict = null;
try { verdict = JSON.parse(check.stdout); } catch { verdict = null; }
if (check.status === 3 || !verdict) { console.error('No approved record for gate C. The production lead releases on the board first.'); process.exit(3); }
if (check.status !== 0) {
  console.error('The release was approved for other versions of these files:');
  for (const c of verdict.changed || []) console.error('  changed: ' + c.path);
  for (const m of verdict.missing || []) console.error('  gone: ' + m);
  console.error('Ask for Gate C again on the current versions.');
  process.exit(1);
}

const apDir = path.join(dir, 'approvals');
const rec = fs.readdirSync(apDir).filter(f => /^C-\d+\.json$/.test(f)).map(f => JSON.parse(fs.readFileSync(path.join(apDir, f), 'utf8')))
  .sort((a, b) => a.round - b.round).filter(r => r.decision === 'approved').pop();
const out = path.join(dir, 'release');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const files = [];
for (const a of rec.artifacts) {
  const src = path.join(dir, a.path);
  const dest = path.join(out, path.basename(a.path));
  fs.copyFileSync(src, dest);
  const h = hashFile(dest);
  files.push({ file: path.basename(a.path), from: a.path, sha256: h.sha256, bytes: h.bytes });
}
const when = ws.now(client, argv);
const manifest = { schemaVersion: '1.0', jobId, client, gate: 'C', approvalId: rec.approvalId, releasedBy: rec.decidedBy, decidedAt: rec.decidedAt, builtAt: when, files };
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const T = path.join(__dirname, '..', 'templates', 'release-README.md');
let readme = null;
try { readme = fs.readFileSync(T, 'utf8'); } catch { readme = null; }
if (!readme) {
  readme = [
    '# Release: {title}', '', 'Released by {releasedBy} on {decidedAt}. Built {builtAt}.', '',
    '| File | From | Hash |', '|---|---|---|', '{rows}', '',
    'Every file above is the version the production lead approved at Gate C. A later change is a new version and a new release.', '',
  ].join('\n');
}
let title = jobId;
try { title = JSON.parse(fs.readFileSync(path.join(dir, 'job.json'), 'utf8')).title || jobId; } catch { /* the id will do */ }
readme = readme.split('{title}').join(title).split('{releasedBy}').join(rec.decidedBy).split('{decidedAt}').join(rec.decidedAt)
  .split('{builtAt}').join(when).split('{rows}').join(files.map(f => '| ' + f.file + ' | ' + f.from + ' | ' + f.sha256.slice(0, 12) + ' |').join('\n'));
fs.writeFileSync(path.join(out, 'README.md'), readme);

if (json) console.log(JSON.stringify(manifest, null, 2));
else {
  console.log('Release built at ' + ws.fwd(out) + ' with ' + files.length + ' file' + (files.length === 1 ? '' : 's') + ', approved by ' + rec.decidedBy + '.');
  for (const f of files) console.log('  ' + f.sha256.slice(0, 12) + '  ' + f.file);
}
