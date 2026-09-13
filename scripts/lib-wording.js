#!/usr/bin/env node
// One sentence per state, in the words a person reads.
//
// The state ids are for the files. lib-states.js carries a short label for the stepper; this
// file carries the full sentence to say: what is true now, and what happens next.
const states = require('./lib-states.js');

const SENTENCES = {
  INTAKE_PENDING: 'Waiting for the Drive folder before the work can start.',
  PLANNED: 'The folder is in and the brief is being read.',

  BRIEF_READY: 'The brief is written and references are being gathered from your sites.',
  REFERENCES_READY: 'References are on the board and the script is being written.',
  SCRIPT_DRAFTED: 'The script is drafted and the storyboard is being drawn.',
  STORYBOARD_DRAFTED: 'The storyboard is drafted and the shot list is being written.',
  SHOT_LIST_DRAFTED: 'The shot list is done and the budget sheet and timeline are being prepared.',
  PLANNING_DRAFTED: 'Budget sheet and timeline are ready for you to fill and accept.',
  AWAITING_GATE_A: 'Gate A: lock the creative on the board, or say what to change. Nothing downstream starts until you do.',
  GATE_A_PASSED: 'Creative is locked and logistics is opening.',

  LOGISTICS_OPEN: 'Audio is drafted. Talents, props and locations are waiting for you on the board.',
  AWAITING_GATE_B: 'Gate B: lock the logistics on the board once every register is entered or marked not applicable.',
  GATE_B_PASSED: 'Logistics is locked and the concept breakdown is being compiled.',

  BREAKDOWN_DRAFTED: 'The breakdown is compiled and the call sheets are being built.',
  CALL_SHEETS_DRAFTED: 'Call sheets are ready for the production lead to release.',
  AWAITING_GATE_C: "Gate C: the production lead releases each day's call sheet on the board.",
  RELEASED: 'The breakdown and call sheets are released.',

  CHANGES_REQUESTED: 'Making the change you asked for.',
  BLOCKED: 'Waiting on something before I can carry on.',
  ESCALATED: 'Stuck, and it needs you.',
  COMPLETE: 'Shoot done, handed to post-production.',
  CANCELLED: 'Cancelled.',
};

const sentence = id => SENTENCES[id] || 'Working on it.';
const has = id => Object.prototype.hasOwnProperty.call(SENTENCES, id);
const missing = () => states.ids().filter(id => !has(id));

// A last guard for anything assembled by hand: does this line still carry a state id?
const STATE_ID = /\b[A-Z][A-Z0-9]{2,}(?:_[A-Z0-9]+)+\b/;
const carriesStateId = text => STATE_ID.test(String(text));

module.exports = { SENTENCES, sentence, has, missing, carriesStateId };
