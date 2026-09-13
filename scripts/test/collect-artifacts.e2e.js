#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const COLLECT = path.join(ROOT, 'scripts', 'collect-artifacts.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'social-pipeline-collect-'));
const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'social-pipeline-remote-'));

function run(job = 'job-target', artifact = 'research/audience.md') {
  return spawnSync(process.execPath, [COLLECT, '3echo', job, artifact], {
    cwd: temp,
    encoding: 'utf8'
  });
}

try {
  const target = path.join(temp, 'workspaces', '3echo', 'jobs', 'job-target', 'research', 'audience.md');
  const decoy = path.join(temp, 'workspaces', 'another-brand', 'jobs', 'job-other', 'research', 'audience.md');
  fs.mkdirSync(path.dirname(decoy), { recursive: true });
  fs.writeFileSync(decoy, 'unrelated audience\n');

  const unrelated = run();
  assert.notStrictEqual(unrelated.status, 0, 'a basename match from another job must not be recovered');
  assert.strictEqual(fs.existsSync(target), false);

  const source = path.join(remote, 'workspaces', '3echo', 'jobs', 'job-target', 'research', 'audience.md');
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, 'correct audience\n');
  const recovered = run();
  assert.strictEqual(recovered.status, 0, recovered.stdout + recovered.stderr);
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'correct audience\n');

  const emptyDir = path.join(temp, 'workspaces', '3echo', 'jobs', 'job-empty', 'media', 'D1');
  fs.mkdirSync(emptyDir, { recursive: true });
  const empty = run('job-empty', 'media/D1');
  assert.notStrictEqual(empty.status, 0, 'an empty directory is not a completed artifact');
  fs.writeFileSync(path.join(emptyDir, 'render.mp4'), 'render bytes');
  const populated = run('job-empty', 'media/D1');
  assert.strictEqual(populated.status, 0, populated.stdout + populated.stderr);

  const remoteDir = path.join(remote, 'workspaces', '3echo', 'jobs', 'job-remote', 'media', 'D2');
  fs.mkdirSync(remoteDir, { recursive: true });
  fs.writeFileSync(path.join(remoteDir, 'render.mp4'), 'remote render bytes');
  const recoveredDir = run('job-remote', 'media/D2');
  assert.strictEqual(recoveredDir.status, 0, recoveredDir.stdout + recoveredDir.stderr);
  assert.strictEqual(
    fs.readFileSync(path.join(temp, 'workspaces', '3echo', 'jobs', 'job-remote', 'media', 'D2', 'render.mp4'), 'utf8'),
    'remote render bytes'
  );
  console.log('ok   artifact recovery requires the full brand, job, and relative path');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
  fs.rmSync(remote, { recursive: true, force: true });
}
