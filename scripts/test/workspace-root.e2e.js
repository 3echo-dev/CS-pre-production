#!/usr/bin/env node
// Where the work is saved must be a setting, not an accident of the current directory.
// A project created in a cloud container without one is lost when the session ends.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const S = n => path.join(ROOT, 'scripts', n);
const run = (script, args, opts = {}) =>
  spawnSync(process.execPath, [S(script), ...args], { encoding: 'utf8', ...opts });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'od-root-'));
const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'od-elsewhere-'));
const away = fs.mkdtempSync(path.join(os.tmpdir(), 'od-away-'));
const clean = { ...process.env };
delete clean.CREATIVE_STUDIO_ROOT;

// 4. The default: the current folder.
let r = run('scaffold-client.js', ['htf', 'HTF'], { cwd: tmp, env: clean });
assert.strictEqual(r.status, 0, r.stderr);
assert.ok(fs.existsSync(path.join(tmp, 'workspaces', 'htf', 'workspace.json')), 'default root should be the cwd');
console.log('ok   with no setting, work lands under the current folder');

// 2. The environment variable, from a completely different directory.
r = run('scaffold-client.js', ['acme', 'Acme'], { cwd: away, env: { ...clean, CREATIVE_STUDIO_ROOT: elsewhere } });
assert.strictEqual(r.status, 0, r.stderr);
assert.ok(fs.existsSync(path.join(elsewhere, 'workspaces', 'acme', 'workspace.json')), 'CREATIVE_STUDIO_ROOT should decide where the client lands');
assert.ok(!fs.existsSync(path.join(away, 'workspaces')), 'nothing should be written next to the cwd');
console.log('ok   CREATIVE_STUDIO_ROOT wins over the current folder');

// 1. --root beats the environment variable.
const flagged = fs.mkdtempSync(path.join(os.tmpdir(), 'od-flag-'));
r = run('scaffold-client.js', ['flagclient', 'Flag', '--root', flagged], { cwd: away, env: { ...clean, CREATIVE_STUDIO_ROOT: elsewhere } });
assert.strictEqual(r.status, 0, r.stderr);
assert.ok(fs.existsSync(path.join(flagged, 'workspaces', 'flagclient', 'workspace.json')), '--root should win');
console.log('ok   --root wins over the environment variable');

// 3. The config file, found by walking up from a nested directory.
const project = fs.mkdtempSync(path.join(os.tmpdir(), 'od-proj-'));
const data = path.join(project, 'data');
r = run('set-root.js', [data], { cwd: project, env: clean });
assert.strictEqual(r.status, 0, r.stderr);
assert.match(r.stdout, /will be saved in/);
assert.ok(fs.existsSync(path.join(project, '.creative-studio-pipeline', 'config.json')), 'the setting is written under the plugin\'s own config dir');
r = run('scaffold-client.js', ['configclient', 'Config'], { cwd: project, env: clean });
assert.strictEqual(r.status, 0, r.stderr);
assert.ok(fs.existsSync(path.join(data, 'workspaces', 'configclient', 'workspace.json')), 'config root should apply');

const nested = path.join(data, 'workspaces', 'configclient');
r = run('list-jobs.js', [], { cwd: nested, env: clean });
assert.ok(/configclient|No projects started/.test(r.stdout), 'config should be found by walking up: ' + r.stdout);
console.log('ok   .creative-studio-pipeline/config.json is found from a nested folder');

// The board's outbox lives at the root too, wherever a script is run from.
run('scaffold-job.js', ['htf', 'sync', 'Sync'], { cwd: tmp, env: clean });
const jobId = fs.readdirSync(path.join(tmp, 'workspaces', 'htf', 'jobs'))[0];
r = run('set-state.js', ['htf', jobId, 'PLANNED', '--by', 'test'], { cwd: tmp, env: clean });
assert.strictEqual(r.status, 0, r.stderr);
assert.ok(fs.existsSync(path.join(tmp, '.board', 'outbox.jsonl')), 'the outbox sits beside workspaces/, not in the job');
console.log('ok   the board outbox lands at the workspace root');

// The mirror manifest: what changed since the last copy out of the container.
r = run('sync-manifest.js', ['htf', '--json'], { cwd: tmp, env: clean });
assert.strictEqual(r.status, 1, 'a first run has files to copy');
const first = JSON.parse(r.stdout);
assert.ok(first.count > 0 && first.files.some(f => f.path.includes('workspace.json')), 'should list the client files');

r = run('sync-manifest.js', ['htf', '--mark'], { cwd: tmp, env: clean });
assert.strictEqual(r.status, 0, r.stderr);
r = run('sync-manifest.js', ['htf', '--json'], { cwd: tmp, env: clean });
assert.strictEqual(r.status, 0, 'nothing should be listed straight after a mark');
assert.strictEqual(JSON.parse(r.stdout).count, 0);

fs.appendFileSync(path.join(tmp, 'workspaces', 'htf', 'client', 'sites.md'), '\n| Vimeo | https://vimeo.com | |\n');
r = run('sync-manifest.js', ['htf', '--json'], { cwd: tmp, env: clean });
assert.strictEqual(r.status, 1);
const diff = JSON.parse(r.stdout);
assert.strictEqual(diff.count, 1, 'only the changed file should be listed');
assert.match(diff.files[0].path, /sites\.md$/);
console.log('ok   the sync manifest lists only what changed since the last copy');

for (const d of [tmp, elsewhere, away, flagged, project]) fs.rmSync(d, { recursive: true, force: true });
