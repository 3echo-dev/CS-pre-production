#!/usr/bin/env node
// The board page is built from a source that lives in the repository. The shipped page must be
// exactly the build of that source, and the source must carry the two fixes the first test run
// asked for: panels shown in their own ratio, uncropped, and a bell that starts a turn.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const b = require(path.join(ROOT, 'scripts', 'build-board.js'));

const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-board.js'), '--check'], { encoding: 'utf8' });
assert.strictEqual(r.status, 0, r.stdout + r.stderr);

const src = b.lf(fs.readFileSync(b.SRC, 'utf8'));
const page = b.lf(fs.readFileSync(b.OUT, 'utf8'));
assert.strictEqual(b.embedded(page), src, 'the embedded copy is the source');
assert.strictEqual(page.slice(0, src.length), src, 'the page opens with the source');
assert.ok(!/aspect-ratio:\s*9\/16/.test(src), 'no ratio is hardcoded portrait');
assert.ok(src.includes('var(--panel-ar,16/9)'), 'the ratio is a variable with a landscape default');
assert.ok(src.includes('function panelRatio()') && src.includes('style="--panel-ar:${panelRatio()}"'), 'the grid sets the ratio from panel data');
assert.ok(src.includes('background-size:contain') && !src.includes('background-size:cover;background-position'), 'a frame is fitted, never cropped');
assert.ok(src.includes("claude.use('comments')") && src.includes('cm.sendToClaude(') && src.includes('canSendToClaude()'), 'a decision is sent to Claude as a comment');
assert.ok(src.includes("art.publish(buildDocument(src))"), 'the republish stays as the fallback');
console.log('ok   the shipped board is the build of its source, panels keep their ratio, and a decision rings the bell');
