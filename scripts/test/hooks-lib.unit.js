#!/usr/bin/env node
// The pure half of the function hooks, tested as plain functions. The spend guard must refuse
// video and studio tools outright, refuse an image job without an open project, a key, a safe
// preflight or the sample panel, and refuse the panel that would cross the ceiling. The write
// guard must refuse the files only scripts may write and allow ordinary job files. The three
// copied tables must match the CommonJS originals.
const assert = require('assert');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const states = require('../lib-states.js');
const stages = require('../lib-stages.js');

(async () => {
  const lib = await import('file://' + path.join(ROOT, 'hooks', 'lib.mjs').split(path.sep).join('/'));

  // Copied tables stay in step with their originals.
  assert.deepStrictEqual(lib.STAGE_IDS, stages.STAGE_IDS, 'STAGE_IDS copy drifted from lib-stages.js');
  assert.deepStrictEqual(lib.GATE_STATES, states.AWAITING_STATE ? Object.fromEntries(Object.entries(states.AWAITING_STATE).map(([g, s]) => [s, g])) : lib.GATE_STATES, 'GATE_STATES copy drifted from lib-states.js');
  for (const s of lib.WAITING_STATES) assert.ok(states.exists(s), s + ' is a real state');

  // Spend guard.
  const ctx = { jobId: 'job-20260913-1030-night-shift', client: 'htf' };
  const safeSample = { valid: true, allowed: 'sample', samplePanel: 'P03', ceiling: 12 };
  const safeBatch = { valid: true, allowed: 'batch', ceiling: 12 };
  const img = 'mcp__plugin_onedash-1-22_3echo__create_image_job';
  const key = ctx.jobId + '/v2/P03';

  assert.ok(lib.spendVerdict('mcp__x__create_video_job', key, ctx, safeBatch, 0).deny, 'video is refused');
  assert.ok(lib.spendVerdict('mcp__x__generate_studio_take', key, ctx, safeBatch, 0).deny, 'studio takes are refused');
  assert.ok(lib.spendVerdict('mcp__x__start_studio_flow', key, ctx, safeBatch, 0).deny, 'studio flows are refused');
  assert.strictEqual(lib.spendVerdict('mcp__x__list_assets', key, ctx, safeBatch, 0), null, 'a read tool is not the spend guard\'s business');
  assert.ok(lib.spendVerdict(img, key, null, safeBatch, 0).deny, 'no open project refuses');
  assert.ok(lib.spendVerdict(img, 'nonsense', ctx, safeBatch, 0).deny, 'a malformed key refuses');
  assert.ok(lib.spendVerdict(img, 'job-other/v2/P03', ctx, safeBatch, 0).deny, 'another project\'s key refuses');
  assert.ok(lib.spendVerdict(img, key, ctx, null, 0).deny, 'a broken preflight refuses');
  assert.ok(lib.spendVerdict(img, key, ctx, { valid: false, problems: ['manifest names P99'] }, 0).deny, 'an unsafe plan refuses');
  assert.ok(lib.spendVerdict(img, ctx.jobId + '/v2/P07', ctx, safeSample, 0).deny, 'before the sample is approved only the sample panel may be generated');
  assert.strictEqual(lib.spendVerdict(img, key, ctx, safeSample, 0), null, 'the sample panel itself is allowed');
  assert.strictEqual(lib.spendVerdict(img, ctx.jobId + '/v2/P07', ctx, safeBatch, 11), null, 'the batch is allowed under the ceiling');
  assert.ok(/12/.test(lib.spendVerdict(img, ctx.jobId + '/v2/P08', ctx, safeBatch, 12).deny), 'the panel that would cross the ceiling is refused, naming the ceiling');

  // Write guard.
  const root = 'C:/onedash';
  const plugin = 'C:/Users/x/.claude/plugins/onedash-1-22';
  const job = root + '/workspaces/htf/jobs/job-1/';
  const deny = (p) => { const v = lib.classifyWrite(p, root, plugin); assert.strictEqual(v.action, 'deny', p + ' should be refused'); return v.reason; };
  const allow = (p) => assert.strictEqual(lib.classifyWrite(p, root, plugin).action, 'allow', p + ' should be allowed');
  deny(plugin + '/skills/review/SKILL.md');
  deny(job + 'status.md');
  deny(job + 'approvals/A-1.json');
  deny(job + 'versions.jsonl');
  deny(job + 'registers/talents.json');
  deny(job + 'release/manifest.json');
  deny(root + '/notes.md');
  allow(job + 'script/v3.md');
  allow(job + 'storyboard/v2/panels.md');
  allow(job + 'brief.md');
  allow(root + '/inputs/htf/job-1/Brief/brief.pdf');
  allow('C:/somewhere/else/file.md');
  assert.strictEqual(lib.classifyWrite(job + 'status.md', null, plugin).action, 'allow', 'with no project open only the plugin rule applies');
  assert.strictEqual(lib.classifyWrite(job.replace(/\//g, '\\') + 'approvals\\B-1.json', root, plugin).action, 'deny', 'backslash paths are normalised');

  // Verdict words and the heredoc rule.
  assert.strictEqual(lib.classifyVerdict('Lock it.'), 'approve');
  assert.strictEqual(lib.classifyVerdict('change the porter line'), 'change');
  assert.strictEqual(lib.classifyVerdict('start over'), 'start over');
  assert.strictEqual(lib.classifyVerdict('hmm'), null);
  assert.ok(lib.HEREDOC.test("cat > f <<'EOF'"), 'heredoc detected');
  assert.ok(!lib.HEREDOC.test('node scripts/set-state.js htf job-1 PLANNED --by me'), 'a plain command is not a heredoc');

  // Context block never leaks a state id.
  const block = lib.contextBlock({ jobId: 'job-1', client: 'htf', sentence: 'Gate A: lock the creative on the board.', isTheirTurn: true, openGate: 'A', creditsSpent: 3, creditsCeiling: 12 });
  assert.ok(block && /Gate A/.test(block) && !/AWAITING_GATE_A/.test(block), 'context block speaks in sentences');
  assert.strictEqual(lib.contextBlock(null), null);

  console.log('ok   spend guard refuses video, studio, unsafe and over-ceiling; write guard refuses the six script-only paths; tables match');
  console.log('hooks-lib verification passed');
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
