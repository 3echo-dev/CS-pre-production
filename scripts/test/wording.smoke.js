#!/usr/bin/env node
// A state id is a file record, never something a person reads. A new state added to
// lib-states.js without a sentence would print as "Working on it." or, worse, leak the id
// through a caller that fell back to it. This is the check that keeps the two tables together.
//   node scripts/test/wording.smoke.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const states = require(path.join(ROOT, 'scripts', 'lib-states.js'));
const wording = require(path.join(ROOT, 'scripts', 'lib-wording.js'));

const missing = wording.missing();
assert.deepStrictEqual(
  missing, [],
  'every state needs a sentence in lib-wording.js, these have none: ' + missing.join(', ')
);
console.log('ok   all %d states have a plain sentence', states.ids().length);

// The sentences themselves must not smuggle an id back in.
for (const id of states.ids()) {
  const s = wording.sentence(id);
  assert.ok(s.length > 2, id + ' has an empty sentence');
  assert.ok(!wording.carriesStateId(s), id + ' prints a state id: ' + s);
  assert.ok(/[.!?]$/.test(s), id + ' should read as a sentence, ending in a full stop: ' + s);
}
console.log('ok   no sentence carries a state id, and each one is a sentence');

// The guard catches the ids people actually see leak.
for (const bad of ['NEEDS_APPROVAL', 'AWAITING_CONCEPT_APPROVAL', 'the job is HANDOFF_READY now']) {
  assert.ok(wording.carriesStateId(bad), 'should have caught ' + bad);
}
for (const fine of ['Pick a concept, or say what to change.', 'Ready for you to post.', 'A B C']) {
  assert.ok(!wording.carriesStateId(fine), 'should not have flagged ' + fine);
}
console.log('ok   the guard catches a state id and leaves plain English alone');

// The two scripts a person reads output from both go through this table.
for (const script of ['set-state.js', 'list-jobs.js']) {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', script), 'utf8');
  assert.ok(src.includes("require('./lib-wording.js')"), script + ' should print through lib-wording.js');
}
console.log('ok   set-state.js and list-jobs.js print through the wording table');
