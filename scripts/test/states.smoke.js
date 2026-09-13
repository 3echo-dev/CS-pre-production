#!/usr/bin/env node
// The state table is data, so its shape is checkable: 22 states, three gates A B C, every
// next and rollback target exists, every state has a sentence, every non-terminal state can
// reach the terminal ones, and the board status map covers every state that moves the board.
const assert = require('assert');
const states = require('../lib-states.js');
const wording = require('../lib-wording.js');
const stages = require('../lib-stages.js');

const ids = states.ids();
assert.strictEqual(ids.length, 22, 'expected 22 states, got ' + ids.length + ': ' + ids.join(' '));
assert.strictEqual(new Set(ids).size, ids.length, 'state ids are unique');

const gates = states.STATES.filter(s => s.gate).map(s => s.gate).sort();
assert.deepStrictEqual(gates, ['A', 'B', 'C'], 'three gates named A, B, C');
assert.deepStrictEqual(states.APPROVED_STATE, { A: 'GATE_A_PASSED', B: 'GATE_B_PASSED', C: 'RELEASED' });
for (const g of ['A', 'B', 'C']) {
  assert.ok(states.exists(states.AWAITING_STATE[g]), 'awaiting state for gate ' + g);
  assert.ok(states.exists(states.APPROVED_STATE[g]), 'approved state for gate ' + g);
  assert.ok(states.canMove(states.AWAITING_STATE[g], states.APPROVED_STATE[g]), 'gate ' + g + ' can pass');
}

const bad = [];
for (const s of states.STATES) {
  for (const n of s.next || []) if (!states.exists(n)) bad.push(s.id + ' -> ' + n);
  const rb = s.rollback ? (Array.isArray(s.rollback) ? s.rollback : [s.rollback]) : [];
  for (const r of rb) if (!states.exists(r)) bad.push(s.id + ' rollback ' + r);
  if (s.gate && !rb.length) bad.push(s.id + ' is a gate with no rollback');
}
assert.deepStrictEqual(bad, [], 'dangling transitions:\n  ' + bad.join('\n  '));

assert.deepStrictEqual(wording.missing(), [], 'every state has a sentence');
for (const id of ids) assert.ok(!wording.carriesStateId(wording.sentence(id)), id + ' sentence leaks a state id');

// Reachability: from INTAKE_PENDING every state is reachable, and every non-terminal state
// can reach COMPLETE or CANCELLED.
function reach(from) {
  const seen = new Set([from]); const q = [from];
  while (q.length) { const c = q.shift(); for (const n of states.get(c).next || []) if (!seen.has(n)) { seen.add(n); q.push(n); } }
  return seen;
}
const fromStart = reach('INTAKE_PENDING');
const unreachable = ids.filter(id => !fromStart.has(id));
assert.deepStrictEqual(unreachable, [], 'unreachable from the start');
const terminals = ids.filter(id => !(states.get(id).next || []).length);
assert.deepStrictEqual(terminals.sort(), ['CANCELLED', 'COMPLETE']);
const stuck = ids.filter(id => !terminals.includes(id) && ![...reach(id)].some(x => terminals.includes(x)));
assert.deepStrictEqual(stuck, [], 'states that can never finish');

// The happy path is one legal walk.
const happy = ['INTAKE_PENDING', 'PLANNED', 'BRIEF_READY', 'REFERENCES_READY', 'SCRIPT_DRAFTED', 'STORYBOARD_DRAFTED',
  'SHOT_LIST_DRAFTED', 'PLANNING_DRAFTED', 'AWAITING_GATE_A', 'GATE_A_PASSED', 'LOGISTICS_OPEN', 'AWAITING_GATE_B',
  'GATE_B_PASSED', 'BREAKDOWN_DRAFTED', 'CALL_SHEETS_DRAFTED', 'AWAITING_GATE_C', 'RELEASED', 'COMPLETE'];
for (let i = 1; i < happy.length; i++) assert.ok(states.canMove(happy[i - 1], happy[i]), happy[i - 1] + ' -> ' + happy[i]);

// Board status and stage coverage.
for (const id of ids) {
  const moves = stages.forState(id);
  if (moves) {
    assert.ok(stages.STAGE_IDS.includes(moves.stage), id + ' maps to a known stage');
    assert.ok(states.boardStatusOf(id), id + ' has a board status');
  }
}
assert.strictEqual(states.boardStatusOf('AWAITING_GATE_A'), 'gate_a');
assert.strictEqual(states.boardStatusOf('RELEASED'), 'released');

console.log('ok   22 states, gates A B C, every transition resolves, every state has a sentence');
console.log('states verification passed');
