#!/usr/bin/env node
// Flags and their values are not positional arguments.
//
// Every script filtered arguments with `!a.startsWith('--')`, which drops the flag and keeps
// the value after it. `scaffold-client.js acme --root C:/tmp/x` therefore read the path as the
// client's display name and wrote it, unescaped, into workspace.json. The file then failed to
// parse, so every later read of it silently returned an empty config.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const script = name => path.join(ROOT, 'scripts', name);
const run = (name, args) => spawnSync(process.execPath, [script(name), ...args], { encoding: 'utf8' });

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'od-cli-'));

// 1. A --root value never becomes the client name.
run('scaffold-client.js', ['acme', '--root', root]);
const wsFile = path.join(root, 'workspaces', 'acme', 'workspace.json');
const raw = fs.readFileSync(wsFile, 'utf8');
let cfg;
assert.doesNotThrow(() => { cfg = JSON.parse(raw); }, 'workspace.json must parse: ' + raw.slice(0, 200));
assert.strictEqual(cfg.name, 'acme', 'with no display name given, the name is the slug');
assert.strictEqual(cfg.status, 'active', 'the rest of the template survived');
console.log('ok   a --root value is not mistaken for the client display name');

// 2. A display name still works, and still stops at the flag.
fs.rmSync(path.join(root, 'workspaces', 'acme'), { recursive: true, force: true });
run('scaffold-client.js', ['acme', 'Acme', 'Films', '--root', root]);
assert.strictEqual(JSON.parse(fs.readFileSync(wsFile, 'utf8')).name, 'Acme Films');
console.log('ok   a multi-word display name is kept and the flags are not');

// 3. The health check reads the job folder, which only exists if the flags resolved.
run('scaffold-job.js', ['acme', 'test-job', 'A test', '--root', root]);
const jobId = fs.readdirSync(path.join(root, 'workspaces', 'acme', 'jobs'))[0];

let r = run('check-3echo.js', ['acme', jobId, '--credits', '100', '--root', root]);
assert.strictEqual(r.status, 0, r.stdout + r.stderr);
assert.match(r.stdout, /3echo is answering\. 100 credits available/);
assert.doesNotMatch(r.stdout, /may spend up to/, 'nothing is claimed before anything is agreed');
console.log('ok   the health check reports the balance, and claims no budget nobody set');

r = run('check-3echo.js', ['acme', jobId, '--unreachable', '--root', root]);
assert.strictEqual(r.status, 3);
assert.match(r.stdout, /not answering right now\. Nothing was spent/);
assert.doesNotMatch(r.stdout + r.stderr, /Error|stack|at Object/, 'no stack traces at a human');
console.log('ok   an unreachable 3echo is reported in plain words, not a stack trace');

r = run('check-3echo.js', ['acme', jobId, '--root', root]);
assert.strictEqual(r.status, 2, 'no balance given is a usage error');
assert.match(r.stderr, /list_workspaces/);
console.log('ok   the health check says how to get the balance it needs');

// 4. What the person agreed to at the sample approval is the only figure that binds.
const approvals = path.join(root, 'workspaces', 'acme', 'jobs', jobId, 'approvals');
fs.mkdirSync(approvals, { recursive: true });
fs.writeFileSync(path.join(approvals, 'sample-1.json'),
  JSON.stringify({ gate: 'sample', decision: 'approved', scope: { maxSpendCredits: 12 } }, null, 2));
r = run('check-3echo.js', ['acme', jobId, '--credits', '20', '--root', root]);
assert.strictEqual(r.status, 0, r.stdout + r.stderr);
assert.match(r.stdout, /up to 12, which is what you agreed at the sample approval/);
console.log('ok   the only budget is the one the person agreed to');

r = run('check-3echo.js', ['acme', jobId, '--credits', '5', '--root', root]);
assert.strictEqual(r.status, 1, 'too little credit for what they agreed to should fail');
assert.match(r.stdout, /less credit than this job is allowed to spend/);
console.log('ok   a balance below what they agreed to stops the job before any spend');

fs.rmSync(root, { recursive: true, force: true });
