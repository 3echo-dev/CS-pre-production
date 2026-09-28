#!/usr/bin/env node
// The subject check: recurring subjects come from the continuity block, a client picture in a
// loosely named folder makes one ready, every other one is asked once on the board, a look is
// allowed once per yes, and the sample panel waits until nothing is undecided.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const S = n => path.join(ROOT, 'scripts', n);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'od-subjects-'));
const run = (script, args) => spawnSync(process.execPath, [S(script), ...args, '--root', tmp], { encoding: 'utf8', cwd: tmp });
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8cfc00000020001e221bc330000000049454e44ae426082', 'hex');

try {
  run('scaffold-client.js', ['htf']);
  const made = run('scaffold-job.js', ['htf', 'night-shift', 'HTF Night Shift']);
  const jobId = (made.stdout.match(/^job-id:\s*(\S+)$/m) || [])[1];
  assert.ok(jobId, 'job scaffolded: ' + made.stdout + made.stderr);
  const dir = path.join(tmp, 'workspaces', 'htf', 'jobs', jobId);
  const put = (abs, body) => { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, body); };
  const jobFile = path.join(dir, 'job.json');
  fs.writeFileSync(jobFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(jobFile, 'utf8')), aspectRatio: '16:9' }, null, 2));

  const ids = ['P01', 'P02', 'P03'];
  put(path.join(dir, 'storyboard/v1/panels.md'), '| Panel | Scene | Frame |\n|---|---|---|\n' + ids.map(id => '| ' + id + ' | 1 | frame |\n').join(''));
  const prompts = {
    P01: 'Wide frame, THE GIRL on the floor tiles beside THE LEGO CITY, warm lamp light, night, eye level.',
    P02: 'Medium frame, THE FATHER in the doorway of the HDB flat, SCDF patch turned away, tired, night.',
    P03: 'Close frame, the girl and the father at the window, the Lego city behind them, night.',
  };
  put(path.join(dir, 'storyboard/v1/generation-manifest.json'), JSON.stringify({
    continuity: 'Continuity - THE GIRL: Singaporean, 8, dark hair. THE FATHER: late 30s, Home Team uniform. THE LEGO CITY: a plastic brick city on the floor. Grade: warm.',
    items: ids.map((id, i) => ({ panel: id, kind: 'image', sample: i === 0, prompt: prompts[id] })),
  }));
  // The client sent a picture of the father, in a folder named the way people name folders.
  put(path.join(tmp, 'inputs', 'htf', jobId, 'Client Assets', '03. Cast', 'The Father', 'father.png'), PNG);
  // And some pictures in a folder the check cannot sort.
  put(path.join(tmp, 'inputs', 'htf', jobId, 'Client Assets', '24. Power Points', 'slide.jpg'), PNG);

  let r = run('subject-check.js', ['scan', 'htf', jobId]);
  assert.strictEqual(r.status, 1, 'two subjects have no picture: ' + r.stdout + r.stderr);
  let rec = JSON.parse(fs.readFileSync(path.join(dir, 'storyboard/v1/subjects.json'), 'utf8'));
  const by = id => rec.subjects.find(s => s.id === id);
  assert.deepStrictEqual(rec.subjects.map(s => s.id).sort(), ['characters-the-father', 'characters-the-girl', 'props-the-lego-city'], 'the continuity labels, not acronyms like HDB or SCDF: ' + rec.subjects.map(s => s.id));
  assert.strictEqual(by('characters-the-father').status, 'ready', 'the father is read from 03. Cast/The Father');
  assert.deepStrictEqual(by('characters-the-girl').panels, ['P01', 'P03'], 'panels found by name in any case');
  assert.strictEqual(by('props-the-lego-city').kind, 'props', 'a label with no person word is a prop or set');
  assert.strictEqual(rec.library.unsorted, 1, 'the power-point picture is counted as unsorted');
  const outbox = fs.readFileSync(path.join(tmp, '.board', 'outbox.jsonl'), 'utf8');
  assert.strictEqual((outbox.match(/"id":"ref-/g) || []).length, 2, 'one question per subject with no picture');
  console.log('ok   subjects come from the continuity labels; a picture in 03. Cast makes one ready; the rest are asked once');

  // The sample waits.
  r = run('preflight-generation.js', ['htf', jobId, '--json']);
  assert.strictEqual(JSON.parse(r.stdout).valid, false, 'undecided subjects block the sample');
  // A rescan does not ask again.
  run('subject-check.js', ['scan', 'htf', jobId]);
  assert.strictEqual((fs.readFileSync(path.join(tmp, '.board', 'outbox.jsonl'), 'utf8').match(/"id":"ref-/g) || []).length, 2, 'a rescan asks nothing twice');

  // Generate a look for the girl: one per yes.
  r = run('subject-check.js', ['may-generate', 'htf', jobId, '--subject', 'characters-the-girl', '--json']);
  assert.strictEqual(r.status, 1, 'nobody chose yet');
  run('subject-check.js', ['decide', 'htf', jobId, '--subject', 'characters-the-girl', '--choice', 'generate', '--by', 'creative-director']);
  r = run('subject-check.js', ['may-generate', 'htf', jobId, '--subject', 'characters-the-girl', '--json']);
  assert.deepStrictEqual(JSON.parse(r.stdout), { allowed: true, attempt: 1 });
  put(path.join(dir, 'subjects/looks/characters/the-girl.png'), PNG);
  r = run('subject-check.js', ['look', 'htf', jobId, '--subject', 'characters-the-girl', '--file', 'subjects/looks/characters/the-girl.png']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  r = run('subject-check.js', ['may-generate', 'htf', jobId, '--subject', 'characters-the-girl', '--json']);
  assert.strictEqual(r.status, 1, 'a second look waits for the answer on the first');
  // The person asks for another: exactly one more is allowed.
  run('subject-check.js', ['decide', 'htf', jobId, '--subject', 'characters-the-girl', '--choice', 'redo']);
  r = run('subject-check.js', ['may-generate', 'htf', jobId, '--subject', 'characters-the-girl', '--json']);
  assert.deepStrictEqual(JSON.parse(r.stdout), { allowed: true, attempt: 2 });
  put(path.join(dir, 'subjects/looks/characters/the-girl-r2.png'), PNG);
  run('subject-check.js', ['look', 'htf', jobId, '--subject', 'characters-the-girl', '--file', 'subjects/looks/characters/the-girl-r2.png']);
  // The board answer lands: use this look.
  put(path.join(tmp, '.board', 'inbox.json'), JSON.stringify({ [jobId]: { answers: [
    { id: 'look-characters-the-girl-2', status: 'answered', answer: 'Use this look', answeredBy: 'creative-director' },
    { id: 'ref-props-the-lego-city', status: 'answered', answer: 'Leave it to the storyboard', answeredBy: 'creative-director' },
  ] } }));
  r = run('subject-check.js', ['land', 'htf', jobId]);
  assert.strictEqual(r.status, 0, 'nothing blocks once the look is used and the city is left to the prompt: ' + r.stdout + r.stderr);
  rec = JSON.parse(fs.readFileSync(path.join(dir, 'storyboard/v1/subjects.json'), 'utf8'));
  assert.strictEqual(by('characters-the-girl').status, 'ready');
  assert.deepStrictEqual(by('characters-the-girl').files, ['subjects/looks/characters/the-girl-r2.png'], 'the approved attempt, not the first');
  assert.strictEqual(by('props-the-lego-city').decidedBy, 'creative-director', 'leaving it to the prompt is a recorded decision');
  console.log('ok   a look is allowed once per yes, waits for its answer, and a used look makes the subject ready');

  r = run('preflight-generation.js', ['htf', jobId, '--json']);
  assert.strictEqual(JSON.parse(r.stdout).valid, true, 'the sample may be drawn: ' + r.stdout);
  console.log('ok   the sample panel is refused until every subject has a picture or a decision');
  console.log('subjects verification passed');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
