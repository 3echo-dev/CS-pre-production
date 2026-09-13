#!/usr/bin/env node
// Nothing on the board may read like the inside of the pipeline. A card was once shown to a
// client opening with "Insight it rests on: `brief.md#angle`", and a state id such as
// AWAITING_GATE_A reads like an error to anyone who did not build this.
const assert = require('assert');
const path = require('path');

const scripts = path.join(__dirname, '..');
const { plain, carriesJargon } = require(path.join(scripts, 'lib-plain.js'));

// 1. The cleaner itself.
assert.ok(!carriesJargon(plain('- Insight it rests on: `brief.md#angle`, the porter speaks first.')), 'a file reference is removed');
assert.ok(!plain('See workspaces/htf/client/sites.md for the list.').includes('sites.md'), 'a bare path is removed too');
assert.ok(!carriesJargon(plain('The project is AWAITING_GATE_A right now.')), 'a state id never survives');
assert.ok(plain('The porter leans on the laundry cage, then looks up.').includes('porter'), 'ordinary words are left alone');
assert.strictEqual(plain('- Provenance: internal deck, slide 4'), '', 'a line that only records where something came from is dropped');

// 2. The sentences the board is handed are already plain: every state's wording, and the
// substep a turn hook writes, go through the same guard.
const wording = require(path.join(scripts, 'lib-wording.js'));
const states = require(path.join(scripts, 'lib-states.js'));
for (const id of states.ids()) {
  const s = wording.sentence(id);
  assert.ok(!carriesJargon(s), id + ' reads as jargon: ' + s);
}
const turn = require(path.join(scripts, 'hooks', 'turn.js'));
const said = turn.whyItIsTheirTurn('**Blocked on:** You, to lock the creative on the board (see script/v3.md)\n');
assert.ok(!/\.md\b/.test(said), 'no file name reaches the person: ' + said);
assert.ok(!/[A-Z]{3,}_[A-Z]/.test(said), 'no state id reaches the person: ' + said);
assert.ok(/lock the creative/.test(said), 'the reason itself survives: ' + said);

console.log('ok   what the board shows carries no file names and no internal ids');
