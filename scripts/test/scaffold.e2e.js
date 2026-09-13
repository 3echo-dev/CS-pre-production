#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'od-scaffold-'));
const run = (name, args = []) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', name), ...args], { cwd: temp, encoding: 'utf8' });

try {
  const client = run('scaffold-client.js', ['htf', 'HTF']);
  assert.strictEqual(client.status, 0, client.stdout + client.stderr);
  for (const file of ['workspace.json', 'client/sites.md', 'client/templates/README.md']) {
    assert.strictEqual(fs.existsSync(path.join(temp, 'workspaces', 'htf', file)), true, file + ' missing');
  }
  const ws = JSON.parse(fs.readFileSync(path.join(temp, 'workspaces', 'htf', 'workspace.json'), 'utf8'));
  assert.strictEqual(ws.client, 'htf');
  assert.strictEqual(ws.name, 'HTF');
  assert.ok(ws.approvers && ws.approvers.creative, 'the approvers are on the workspace');
  assert.ok(fs.existsSync(path.join(temp, 'inputs', 'htf')), 'inputs/<client> exists for Drive pulls');
  assert.strictEqual(run('scaffold-client.js', ['htf', 'HTF']).status, 1, 'client scaffold must not overwrite');

  const job = run('scaffold-job.js', ['htf', 'night-shift', 'HTF Night Shift']);
  assert.strictEqual(job.status, 0, job.stdout + job.stderr);
  const match = job.stdout.match(/job-id:\s+(job-\d{8}-\d{4}-night-shift)/);
  assert.ok(match, 'scaffold did not report a job id');
  const jobDir = path.join(temp, 'workspaces', 'htf', 'jobs', match[1]);
  for (const dir of ['references', 'script', 'storyboard', 'registers', 'validation', 'revisions', 'approvals', 'release', 'runs']) {
    assert.strictEqual(fs.statSync(path.join(jobDir, dir)).isDirectory(), true, dir + ' missing');
  }
  assert.match(fs.readFileSync(path.join(jobDir, 'status.md'), 'utf8'), /INTAKE_PENDING/);
  const j = JSON.parse(fs.readFileSync(path.join(jobDir, 'job.json'), 'utf8'));
  assert.strictEqual(j.client, 'htf');
  assert.strictEqual(j.kind, 'preproduction');
  assert.strictEqual(j.title, 'HTF Night Shift');
  assert.ok(!('_enums' in j), 'the enums stay in the template');
  assert.ok(fs.existsSync(path.join(jobDir, 'versions.jsonl')), 'the version log starts empty');
  assert.ok(fs.existsSync(path.join(temp, 'inputs', 'htf', match[1])), 'the Drive pull folder is ready');

  // Asking for the same thing twice is asking for two projects, not for the first one back.
  const second = run('scaffold-job.js', ['htf', 'night-shift', 'HTF Night Shift']);
  assert.strictEqual(second.status, 0, 'a second project with the same words is allowed: ' + second.stderr);
  const secondId = (second.stdout.match(/^job-id:\s*(\S+)$/m) || [])[1];
  assert.ok(secondId && secondId !== match[1], 'and it gets a name of its own');
  assert.match(fs.readFileSync(path.join(jobDir, 'status.md'), 'utf8'), /INTAKE_PENDING/, 'and the first one is untouched');

  const listed = run('list-jobs.js', ['htf']);
  assert.strictEqual(listed.status, 0, listed.stdout + listed.stderr);
  assert.match(listed.stdout, new RegExp(match[1]));
  assert.match(listed.stdout, new RegExp(secondId));
  console.log('ok   client and project scaffolds create complete workspaces, and a second project is a second project');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
