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

// Run 2, R4: the bell was wired to locking a gate, requesting a generation and requesting an
// export, and left off answering a question - the one thing a person does constantly. Four
// answers landed on the board and the run never woke. Assert the common paths ring it.
const answerFn = src.slice(src.indexOf('async function answer('), src.indexOf('async function addRow('));
assert.ok(answerFn.includes('signalPipeline('), 'answering a question rings the bell');
const addRowFn = src.slice(src.indexOf('async function addRow('), src.indexOf('async function createProject('));
assert.ok(addRowFn.includes('signalPipeline('), 'starting a register rings the bell');
// Run 3, R6 and R8: a request the run has picked up reads as waiting, never as a button to
// press again; a card with an open question of its own reads Your input; and the slate says
// what the run is doing, not only which stage it is at.
assert.ok(src.includes("r.status==='waiting'") && src.includes('function waitingGenerate()'), 'a landed request that waits on a question is shown as waiting');
assert.ok(src.includes('function shownStatus(') && src.includes('pill ${shownStatus(it)}'), 'a card with an open question of its own reads Your input');
assert.ok(src.includes('p.activity'), 'the slate card carries what the run is doing');
console.log('ok   the shipped board is the build of its source, panels keep their ratio, a decision rings the bell, and waiting and working are visible');
