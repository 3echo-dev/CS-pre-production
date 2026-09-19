#!/usr/bin/env node
// Every state a director works in maps to the board items that director holds, so the card
// reads Working while the file is being written (run 3, R8). The map names real states and
// real items, and every item is held in some state, or a card could never light up.
const assert = require('assert');
const path = require('path');
const stages = require(path.join(__dirname, '..', 'lib-stages.js'));
const states = require(path.join(__dirname, '..', 'lib-states.js'));

const ITEMS = ['intake', 'scraper', 'script', 'storyboard', 'shot_list', 'budget_sheet', 'timeline',
  'audio', 'talents', 'props', 'locations', 'concept_breakdown', 'call_sheet'];
for (const [state, items] of Object.entries(stages.ITEMS_OF)) {
  assert.ok(states.exists(state), state + ' is a state');
  assert.ok(items.length, state + ' names at least one item');
  for (const it of items) assert.ok(ITEMS.includes(it), it + ' is a board item');
}
const covered = new Set([].concat(...Object.values(stages.ITEMS_OF)));
for (const it of ITEMS) assert.ok(covered.has(it), it + ' is worked in some state');
assert.deepStrictEqual(stages.itemsWorkedIn('AWAITING_GATE_A'), [], 'a gate works no item');
assert.deepStrictEqual(stages.itemsWorkedIn('SHOT_LIST_DRAFTED'), ['budget_sheet', 'timeline'], 'the planner holds two items at once');
console.log('ok   every working state names the board items its director holds, and every item is held somewhere');