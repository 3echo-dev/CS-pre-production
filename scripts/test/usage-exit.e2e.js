#!/usr/bin/env node
// A failed script fails, and says so.
//
// The first end-to-end run reported three scripts printing usage and returning success, so an
// orchestrator walking plan.md read a failed step as done. Every script here already returned 2,
// but the words on stderr were only a usage line, and `sites-check.js --add a --add b --add c`
// really did succeed after taking one site. This test holds both halves: every command-line
// script exits non-zero when called with nothing, and the calls the run got wrong exit non-zero
// with a first line that says nothing was written.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const scripts = path.join(ROOT, 'scripts');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'od-usage-'));
const run = (name, args, opts = {}) => spawnSync(process.execPath, [path.join(scripts, name), ...args],
  { encoding: 'utf8', cwd: tmp, env: { ...process.env, CREATIVE_STUDIO_ROOT: tmp }, ...opts });

try {
  // 1. Every command-line script called with no arguments exits non-zero. The exceptions take
  //    no arguments by design: four report the folder's state, and note-failure.js is a hook that
  //    reads an event on stdin and must never fail the tool it is reporting on.
  //    build-board.js with no arguments is its ordinary call: build the page from its source.
  const NO_ARGS_OK = new Set(['check-deps.js', 'job-context.js', 'list-jobs.js', 'set-root.js', 'note-failure.js', 'build-board.js']);
  const cli = fs.readdirSync(scripts).filter(name => name.endsWith('.js') && !name.startsWith('lib-') && !NO_ARGS_OK.has(name));
  const zero = [];
  for (const name of cli) {
    const r = run(name, [], { timeout: 20000, input: '' });
    if (r.status === 0) zero.push(name);
  }
  assert.deepStrictEqual(zero, [], 'these scripts exit 0 with no arguments: ' + zero.join(', '));
  console.log('ok   ' + cli.length + ' scripts exit non-zero when called with nothing');

  // 2. The calls the first run built wrongly.
  let r = run('scaffold-client.js', ['acme']);
  assert.strictEqual(r.status, 0, r.stderr);
  r = run('scaffold-job.js', ['acme', 'test-job', 'A test']);
  assert.strictEqual(r.status, 0, r.stderr);
  const jobId = fs.readdirSync(path.join(tmp, 'workspaces', 'acme', 'jobs'))[0];
  const jobDir = path.join(tmp, 'workspaces', 'acme', 'jobs', jobId);

  // record-approval.js without --by, then with a file that is not there: nothing recorded, said first.
  r = run('record-approval.js', ['acme', jobId, 'A', 'approve', 'script/v1.md']);
  assert.strictEqual(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr.split(/\r?\n/)[0], /^Nothing was recorded\. This call needs --by "Name"\./);
  r = run('record-approval.js', ['acme', jobId, 'A', 'approve', '--by', 'Me', '--score', '4', '--why', 'w', '--channel', 'chat', '--from-chat', 'script/v1.md']);
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /^Nothing was recorded\. Missing artifact: script\/v1\.md/);
  assert.ok(!fs.existsSync(path.join(jobDir, 'approvals', 'A-1.json')), 'no approval appears on a refused call');
  console.log('ok   record-approval.js refuses a wrong call, exits 2 or 1, and says nothing was recorded');

  // record-version.js without --n: exit 2, and the first line names the flag.
  fs.mkdirSync(path.join(jobDir, 'script'), { recursive: true });
  fs.writeFileSync(path.join(jobDir, 'script', 'v1.md'), '# v1\n');
  r = run('record-version.js', ['acme', jobId, '--item', 'script', '--file', 'script/v1.md']);
  assert.strictEqual(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr.split(/\r?\n/)[0], /^Nothing was recorded\. This call needs --n <whole number from 1>\./);
  const versions = () => { try { return fs.readFileSync(path.join(jobDir, 'versions.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean); } catch { return []; } };
  assert.deepStrictEqual(versions(), [], 'no version line is appended on a refused call');
  r = run('record-version.js', ['acme', jobId, '--item', 'script', '--n', 'three', '--file', 'script/v1.md']);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /--n <whole number from 1>, not "three"/);
  console.log('ok   record-version.js refuses a call without a valid --n and says nothing was recorded');

  // sites-check.js takes every --add, and names what it did and did not add.
  r = run('sites-check.js', ['acme', '--add', 'Vimeo', '--add', 'Behance', '--add', 'Nowness']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Added 3 sites: Vimeo, Behance, Nowness\. The scout may search 3 sites\./);
  r = run('sites-check.js', ['acme', '--add', 'behance', '--add', 'Dribbble']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Added 1 site: Dribbble\. behance is already on the list\. The scout may search 4 sites\./);
  r = run('sites-check.js', ['acme', '--json']);
  assert.deepStrictEqual(JSON.parse(r.stdout).sites.map(s => s.site), ['Vimeo', 'Behance', 'Nowness', 'Dribbble']);
  r = run('sites-check.js', ['acme', '--add', 'Fubiz', '--add', 'Stash', '--url', 'https://fubiz.example']);
  assert.strictEqual(r.status, 2, 'a --url with two --add flags is ambiguous');
  assert.match(r.stderr, /^Nothing was added\./);
  r = run('sites-check.js', ['acme', '--add']);
  assert.strictEqual(r.status, 2, 'a bare --add is a usage error');
  r = run('sites-check.js', ['acme', '--json']);
  assert.strictEqual(JSON.parse(r.stdout).sites.length, 4, 'a refused call added nothing');
  console.log('ok   sites-check.js takes every --add and reports each one');

  // board-sync.js land with a file that holds no board record: exit 1, and the shape it wants.
  fs.writeFileSync(path.join(tmp, 'landed-shape.json'), JSON.stringify({ gates: {}, questions: [], answers: [] }));
  r = run('board-sync.js', ['land', 'acme', jobId, path.join(tmp, 'landed-shape.json')]);
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /reads as a board record, so nothing was landed/);
  assert.match(r.stderr, /"collection":"projects\/.*\/gates","documents"/);
  r = run('board-sync.js', ['land', 'acme', jobId, path.join(tmp, 'landed-shape.json'), '--json']);
  assert.strictEqual(r.status, 1);
  assert.deepStrictEqual(JSON.parse(r.stdout).landed, []);
  console.log('ok   board-sync.js land fails on a file with no board record and names the shape it takes');

  console.log('usage-exit verification passed');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
