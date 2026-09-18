#!/usr/bin/env node
// drive-pull.js lands a client's folder from either a path on this computer or a Google Drive
// link, and both routes end with the same manifest. This builds a temp root with a job, pulls a
// local folder, then plans a Drive pull, stages one file from base64 and finishes it.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'drive-pull.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-pull-'));
const client = 'tclient', jobId = 'job-20260101-0000-test';
fs.mkdirSync(path.join(root, 'workspaces', client, 'jobs', jobId), { recursive: true });
fs.writeFileSync(path.join(root, 'workspaces', client, 'workspace.json'), '{"client":"tclient"}');

const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args, '--root', root], { encoding: 'utf8' });
const inputs = path.join(root, 'inputs', client, jobId);

// 1. Local route: sub-folders copied as named, mapped case-insensitively, Brief empty is said.
const src = path.join(root, 'src');
fs.mkdirSync(path.join(src, 'brief'), { recursive: true });
fs.mkdirSync(path.join(src, 'Concept'), { recursive: true });
fs.mkdirSync(path.join(src, 'Client Assets'), { recursive: true });
fs.writeFileSync(path.join(src, 'brief', 'brief.md'), '# Brief\nA thing.');
fs.writeFileSync(path.join(src, 'Concept', 'deck.txt'), 'slide one');
fs.writeFileSync(path.join(src, 'notes.txt'), 'loose');
// Tool state that a synced folder often carries: skipped and named, never copied.
fs.mkdirSync(path.join(src, '.git'), { recursive: true });
fs.writeFileSync(path.join(src, '.git', 'config'), '[core]');
fs.mkdirSync(path.join(src, '.claude'), { recursive: true });
fs.writeFileSync(path.join(src, '.claude', 'settings.json'), '{}');
let r = run(client, jobId, src);
assert.strictEqual(r.status, 0, 'local pull exits 0: ' + r.stderr + r.stdout);
assert.ok(/Skipped 2 hidden folders \(\.claude, \.git\): tool state, not client material\./.test(r.stdout), 'hidden folders are named: ' + r.stdout);
assert.ok(!fs.existsSync(path.join(inputs, '.git')), 'and not copied');
let m = JSON.parse(fs.readFileSync(path.join(inputs, 'manifest.json'), 'utf8'));
assert.strictEqual(m.route, 'local');
assert.strictEqual(m.counts.Brief, 1); assert.strictEqual(m.counts.Concept, 1); assert.strictEqual(m.counts.unmapped, 1);
assert.ok(fs.existsSync(path.join(inputs, 'brief', 'brief.md')), 'files are copied under their own folder names');
assert.ok(m.files.every(f => /^[0-9a-f]{64}$/.test(f.sha256)), 'every row has a hash');
assert.ok(m.files.every(f => !f.path.startsWith('.')), 'no hidden folder reaches the manifest');
assert.ok(/Pulled 3 files/.test(r.stdout), 'counts are said: ' + r.stdout);

// 1b. The pipeline never pulls itself: the root, a folder holding the root, or its own inputs/.
const jobId2 = 'job-20260101-0001-second';
fs.mkdirSync(path.join(root, 'workspaces', client, 'jobs', jobId2), { recursive: true });
r = run(client, jobId2, root);
assert.strictEqual(r.status, 3, 'pulling the root is refused: ' + r.stdout + r.stderr);
assert.ok(/REFUSED: .* is the workspace root .* \(set by --root\)/.test(r.stderr), r.stderr);
assert.ok(/set-root\.js <folder>/.test(r.stderr), 'the way out is named');
assert.ok(!fs.existsSync(path.join(root, 'inputs', client, jobId2)), 'nothing was copied');
r = run(client, jobId2, path.dirname(root));
assert.strictEqual(r.status, 3, 'a folder that holds the root is refused before it is walked');
assert.ok(/holds the workspace root/.test(r.stderr), r.stderr);
r = run(client, jobId2, inputs);
assert.strictEqual(r.status, 3, 'a previous pull is not client material');
assert.ok(/inside the pipeline's inputs\//.test(r.stderr), r.stderr);
const sibling = path.join(root, 'Pre-Prod', 'Brief');
fs.mkdirSync(sibling, { recursive: true });
fs.writeFileSync(path.join(sibling, 'brief.md'), '# ok');
r = run(client, jobId2, path.dirname(sibling));
assert.strictEqual(r.status, 0, 'a client folder that merely sits under the root is fine: ' + r.stderr);

// 2. A second pull refuses without --again.
r = run(client, jobId, src);
assert.strictEqual(r.status, 3, 'a pulled job refuses a second pull');

// 3. Drive route: the link's id is parsed, a plan is written, exit 4 tells the session to fetch.
const link = 'https://drive.google.com/drive/u/0/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456?usp=sharing';
r = run(client, jobId, link, '--again');
assert.strictEqual(r.status, 4, 'drive route exits 4: ' + r.stderr + r.stdout);
const dest = path.join(inputs, 'pull-2');
const plan = JSON.parse(fs.readFileSync(path.join(dest, 'pull-plan.json'), 'utf8'));
assert.strictEqual(plan.folderId, '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456');
assert.strictEqual(plan.status, 'staging');
assert.ok(plan.exportAs['application/vnd.google-apps.document'].ext === '.docx', 'Google Docs export as docx');

// 4. finish before anything is staged refuses.
r = run('finish', client, jobId);
assert.strictEqual(r.status, 3, 'nothing staged, nothing to finish');

// 5. stage one file from a base64 temp file, then finish: same manifest shape, source is the link.
const b64file = path.join(root, 'brief.b64');
fs.writeFileSync(b64file, Buffer.from('# Brief from Drive\n').toString('base64'));
r = run('stage', client, jobId, '--rel', 'Brief/brief.md', '--b64', b64file);
assert.strictEqual(r.status, 0, 'stage exits 0: ' + r.stderr);
assert.strictEqual(fs.readFileSync(path.join(dest, 'Brief', 'brief.md'), 'utf8'), '# Brief from Drive\n');
r = run('stage', client, jobId, '--rel', '../escape.md', '--b64', b64file);
assert.strictEqual(r.status, 2, 'a path that climbs out is refused');
r = run('finish', client, jobId);
assert.strictEqual(r.status, 0, 'finish exits 0: ' + r.stderr + r.stdout);
m = JSON.parse(fs.readFileSync(path.join(dest, 'manifest.json'), 'utf8'));
assert.strictEqual(m.route, 'drive');
assert.strictEqual(m.source, link);
assert.strictEqual(m.counts.Brief, 1);
assert.strictEqual(m.files[0].path, 'Brief/brief.md');
assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dest, 'pull-plan.json'), 'utf8')).status, 'done');

// 6. Something that is neither is refused with a plain sentence.
r = run(client, jobId, 'not-a-folder-anywhere', '--again');
assert.strictEqual(r.status, 2);
assert.ok(/Not a folder on this computer and not a Google Drive folder link/.test(r.stderr));

fs.rmSync(root, { recursive: true, force: true });
console.log('ok   drive-pull lands a local folder or a Drive link on the same manifest');
