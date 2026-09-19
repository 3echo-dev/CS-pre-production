#!/usr/bin/env node
// The two guards that taught people to ignore guards on the first test run.
//
// preflight-media.js answered "expired" to a URL that was seconds old, because the shell had
// eaten the signature after the first &; the message now says so. preflight-generation.js
// counted every panel on the board against the batch figure, so a ceiling recorded as the
// panels remaining was refused as over the panels remaining; it now counts files on disk as
// spent, and the sample approval carries how many were on disk when the person agreed.
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawnSync, execFile } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const S = n => path.join(ROOT, 'scripts', n);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'od-preflight-'));
const run = (script, args) => spawnSync(process.execPath, [S(script), ...args, '--root', tmp], { encoding: 'utf8', cwd: tmp });
// The media check talks to a server this test runs, so it is spawned without blocking the event loop.
const media = args => new Promise(resolve => execFile(process.execPath, [S('preflight-media.js'), ...args], { encoding: 'utf8' }, (err, stdout, stderr) => resolve({ status: err ? err.code : 0, stdout, stderr })));
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8cfc00000020001e221bc330000000049454e44ae426082', 'hex');

(async () => {
  // --- preflight-media: a signed URL, and the same URL with its signature lost ------------------
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.pathname === '/media' && u.searchParams.get('sig') === 'abc' && u.searchParams.get('exp')) {
      res.writeHead(200, { 'content-type': 'image/png' }); res.end(PNG);
    } else { res.writeHead(401); res.end('unauthorised'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/media';
  try {
    let r = await media([base + '?exp=1&sig=abc', tmp]);
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /ok: round trip works\. \d+ bytes, PNG/);
    r = await media([base + '?exp=1', tmp]);
    assert.strictEqual(r.status, 1, 'the URL without its signature is refused: ' + r.stdout);
    assert.match(r.stderr, /answered 401/);
    assert.match(r.stderr, /carries one query parameter/);
    assert.match(r.stderr, /loses everything after its first &/);
    assert.match(r.stderr, /in double quotes/);
    assert.doesNotMatch(r.stderr.split('\n')[1], /expired/, 'the first diagnosis is the shell, not expiry');
    r = await media([base + '?exp=1&sig=wrong&x=1', tmp]);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /The signature is present, so the URL has expired/);
    console.log('ok   preflight-media tells a URL that lost its signature in the shell from one that expired');
  } finally {
    server.close();
  }

  // --- preflight-generation: the ceiling counts what remains, on top of what was on disk ---------
  assert.strictEqual(run('scaffold-client.js', ['htf', 'HTF']).status, 0);
  const made = run('scaffold-job.js', ['htf', 'night-shift', 'HTF Night Shift']);
  const jobId = (made.stdout.match(/^job-id:\s*(\S+)$/m) || [])[1];
  const dir = path.join(tmp, 'workspaces', 'htf', 'jobs', jobId);
  const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  const ids = ['P01', 'P02', 'P03', 'P04'];
  write('storyboard/v1/panels.md', '| Panel | Scene | Frame |\n|---|---|---|\n' + ids.map(id => '| ' + id + ' | 1 | frame |\n').join(''));
  const item = (id, sample) => ({ panel: id, kind: 'image', sample, status: sample ? 'generated' : 'pending', file: 'storyboard/v1/' + id + '.png', credits: 1, prompt: 'Subject: something long enough to be a prompt for ' + id + '. Motion: none.' });
  write('storyboard/v1/generation-manifest.json', JSON.stringify({ schemaVersion: '1.0', items: ids.map((id, i) => item(id, i === 0)) }));

  // A job whose ratio was never asked is not safe to quote: the ratio decides every panel and
  // what a redo costs, and it is an intake answer, not a question at the moment of spending.
  let r = run('preflight-generation.js', ['htf', jobId, '--json']);
  let out = JSON.parse(r.stdout);
  assert.strictEqual(out.valid, false, 'no ratio, no quote: ' + r.stdout);
  assert.ok(out.problems.some(p => /aspectRatio/.test(p)), 'and it names the field');
  const jobFile = path.join(dir, 'job.json');
  fs.writeFileSync(jobFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(jobFile, 'utf8')), aspectRatio: '16:9' }, null, 2));

  // Before any approval: the sample only, and the per-job ceiling from CONFIG.md applies to what remains.
  r = run('preflight-generation.js', ['htf', jobId, '--json']);
  out = JSON.parse(r.stdout);
  assert.strictEqual(out.valid, true, r.stdout);
  assert.ok(out.notes.some(n => /16:9/.test(n)), 'the quote says what frame it draws in');
  assert.strictEqual(out.allowed, 'sample');
  assert.strictEqual(out.remaining, 4);
  assert.strictEqual(out.generated, 0);

  // The sample lands on disk. Its status word in the manifest is not what makes it count.
  write('storyboard/v1/P01.png', PNG);
  r = run('preflight-generation.js', ['htf', jobId, '--json']);
  out = JSON.parse(r.stdout);
  assert.strictEqual(out.remaining, 3, 'a file on disk is a generated panel');
  assert.strictEqual(out.generated, 1);

  // The person agrees 3 more: the three remaining. That is exactly enough, and the record says one was on disk.
  r = run('record-approval.js', ['htf', jobId, 'sample', 'approve', '--by', 'creative-director', '--max-credits', '3', 'storyboard/v1/P01.png']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const ap = JSON.parse(fs.readFileSync(path.join(dir, 'approvals', 'sample-1.json'), 'utf8'));
  assert.strictEqual(ap.scope.maxSpendCredits, 3);
  assert.strictEqual(ap.scope.panelsOnDisk, 1, 'the approval records what was on disk when the person agreed');
  assert.strictEqual(ap.scope.boardVersion, 1);
  r = run('preflight-generation.js', ['htf', jobId, '--json']);
  out = JSON.parse(r.stdout);
  assert.strictEqual(out.valid, true, 'three remaining under three agreed: ' + r.stdout);
  assert.strictEqual(out.allowed, 'batch');
  assert.strictEqual(out.ceiling, 4, 'the guard ceiling is what was on disk plus what was agreed');
  assert.strictEqual(out.agreed, 3);
  assert.strictEqual(out.onDiskAtApproval, 1);
  assert.match(out.notes.join(' '), /4 panels on the board: 1 on disk, 3 to generate at 1 credit each; the sample approval allows 3 more/);
  console.log('ok   a batch ceiling equal to the panels remaining is accepted, and the sample already drawn is not counted against it');

  // Two panels land; one remains; still fine. Then a fifth panel appears on the board: over.
  write('storyboard/v1/P02.png', PNG);
  write('storyboard/v1/P03.png', PNG);
  r = run('preflight-generation.js', ['htf', jobId, '--json']);
  out = JSON.parse(r.stdout);
  assert.strictEqual(out.valid, true, r.stdout);
  assert.strictEqual(out.remaining, 1);
  write('storyboard/v1/panels.md', '| Panel | Scene | Frame |\n|---|---|---|\n' + ids.concat('P05').map(id => '| ' + id + ' | 1 | frame |\n').join(''));
  write('storyboard/v1/generation-manifest.json', JSON.stringify({ schemaVersion: '1.0', items: ids.concat('P05').map((id, i) => item(id, i === 0)) }));
  r = run('preflight-generation.js', ['htf', jobId]);
  assert.strictEqual(r.status, 1, 'five panels against one on disk plus three agreed is over: ' + r.stdout);
  assert.match(r.stderr, /PROBLEM: 2 panels remain to be generated and 3 are on disk, which is 5 in all, over the 4 the sample approval allows \(1 on disk when it was recorded, plus 3 agreed for the batch\)\. Panels already drawn are not counted against the 3\./);
  console.log('ok   the refusal spells out the arithmetic: on disk, remaining, and what the approval allows');

  // A record written before panelsOnDisk existed: the sample alone is assumed to have been on disk.
  fs.rmSync(path.join(dir, 'approvals', 'sample-1.json'));
  write('approvals/sample-1.json', JSON.stringify({ schemaVersion: '1.0', approvalId: 'sample-1', jobId, brand: 'htf', client: 'htf', gate: 'sample', round: 1,
    decision: 'approved', edited: false, artifacts: [], decidedBy: 'x', decidedAt: '2026-09-18 15:55 +08:00', channel: 'board', comment: '', scope: { publishPlanIncluded: false, maxSpendCredits: 4 }, supersedes: null }));
  r = run('preflight-generation.js', ['htf', jobId, '--json']);
  out = JSON.parse(r.stdout);
  assert.strictEqual(out.valid, true, 'an older record with 4 agreed reads as 1 + 4: ' + r.stdout);
  assert.strictEqual(out.ceiling, 5);
  assert.match(out.notes.join(' '), /an older record; the sample alone is assumed/);
  console.log('ok   an approval recorded before the baseline existed is read as the sample plus the batch');

  // Before any approval, a board over credit_ceiling_per_job is refused, so the quote step asks what to cut.
  fs.rmSync(path.join(dir, 'approvals', 'sample-1.json'));
  const many = Array.from({ length: 70 }, (_, i) => 'P' + String(i + 1).padStart(2, '0'));
  write('storyboard/v1/panels.md', '| Panel | Scene | Frame |\n|---|---|---|\n' + many.map(id => '| ' + id + ' | 1 | frame |\n').join(''));
  write('storyboard/v1/generation-manifest.json', JSON.stringify({ schemaVersion: '1.0', items: many.map((id, i) => item(id, i === 0)) }));
  r = run('preflight-generation.js', ['htf', jobId]);
  assert.strictEqual(r.status, 1, r.stdout);
  assert.match(r.stderr, /67 panels to generate at 1 credit each, over credit_ceiling_per_job 60/);
  console.log('ok   a board over the per-job ceiling is refused before anything is quoted');

  console.log('preflight verification passed');
})().catch(e => { console.error(e); process.exit(1); }).finally(() => fs.rmSync(tmp, { recursive: true, force: true }));
