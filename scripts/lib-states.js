// The state table as data, so it can be validated and translated instead of retyped.
//
// Twenty-two states, three gates. `next` lists the states a job may move to. `rollback` is
// where a "start over" verdict at a gate sends it. An empty `next` means terminal. The ids are
// for the files; every id carries the sentence a person reads instead (lib-wording.js has the
// long form).
const STATES = [
  // Opening
  { id: 'INTAKE_PENDING',      label: 'Waiting for the Drive folder',                       next: ['PLANNED', 'BLOCKED', 'CANCELLED'] },
  { id: 'PLANNED',             label: 'Folder pulled, reading the brief',                    next: ['BRIEF_READY', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },

  // Stage 1: creative
  { id: 'BRIEF_READY',         label: 'Brief written, looking for references',               next: ['REFERENCES_READY', 'CHANGES_REQUESTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  { id: 'REFERENCES_READY',    label: 'References on the board, writing the script',         next: ['SCRIPT_DRAFTED', 'CHANGES_REQUESTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  { id: 'SCRIPT_DRAFTED',      label: 'Script drafted, drawing the board',                   next: ['STORYBOARD_DRAFTED', 'SCRIPT_DRAFTED', 'CHANGES_REQUESTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  { id: 'STORYBOARD_DRAFTED',  label: 'Storyboard drafted, listing the shots',               next: ['SHOT_LIST_DRAFTED', 'STORYBOARD_DRAFTED', 'CHANGES_REQUESTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  { id: 'SHOT_LIST_DRAFTED',   label: 'Shot list drafted, preparing budget and timeline',    next: ['PLANNING_DRAFTED', 'CHANGES_REQUESTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  { id: 'PLANNING_DRAFTED',    label: 'Budget and timeline templates ready for you',         next: ['AWAITING_GATE_A', 'CHANGES_REQUESTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  { id: 'AWAITING_GATE_A',     label: 'Gate A: creative lock is yours to give', gate: 'A', rollback: 'BRIEF_READY',
    next: ['GATE_A_PASSED', 'BRIEF_READY', 'SCRIPT_DRAFTED', 'STORYBOARD_DRAFTED', 'SHOT_LIST_DRAFTED', 'PLANNING_DRAFTED', 'CHANGES_REQUESTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  { id: 'GATE_A_PASSED',       label: 'Creative locked, opening logistics',                  next: ['LOGISTICS_OPEN', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },

  // Stage 2: logistics
  { id: 'LOGISTICS_OPEN',      label: 'Audio drafted; talents, props and locations waiting on you', next: ['AWAITING_GATE_B', 'LOGISTICS_OPEN', 'CHANGES_REQUESTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  { id: 'AWAITING_GATE_B',     label: 'Gate B: logistics lock is yours to give', gate: 'B', rollback: 'LOGISTICS_OPEN',
    next: ['GATE_B_PASSED', 'LOGISTICS_OPEN', 'CHANGES_REQUESTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  { id: 'GATE_B_PASSED',       label: 'Logistics locked, compiling the breakdown',           next: ['BREAKDOWN_DRAFTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },

  // Stage 3: documents
  { id: 'BREAKDOWN_DRAFTED',   label: 'Breakdown compiled, building call sheets',            next: ['CALL_SHEETS_DRAFTED', 'BREAKDOWN_DRAFTED', 'CHANGES_REQUESTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  { id: 'CALL_SHEETS_DRAFTED', label: 'Call sheets ready for release',                       next: ['AWAITING_GATE_C', 'CHANGES_REQUESTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  { id: 'AWAITING_GATE_C',     label: "Gate C: release is the production lead's call", gate: 'C', rollback: 'BREAKDOWN_DRAFTED',
    next: ['RELEASED', 'BREAKDOWN_DRAFTED', 'CALL_SHEETS_DRAFTED', 'CHANGES_REQUESTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  { id: 'RELEASED',            label: 'Documents released',                                  next: ['CHANGES_REQUESTED', 'COMPLETE', 'CANCELLED'] },

  // Anywhere
  { id: 'CHANGES_REQUESTED',   label: 'Making the change you asked for',
    next: ['BRIEF_READY', 'REFERENCES_READY', 'SCRIPT_DRAFTED', 'STORYBOARD_DRAFTED', 'SHOT_LIST_DRAFTED', 'PLANNING_DRAFTED',
           'LOGISTICS_OPEN', 'BREAKDOWN_DRAFTED', 'CALL_SHEETS_DRAFTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  { id: 'BLOCKED',             label: 'Waiting on something before I can carry on',
    next: ['INTAKE_PENDING', 'PLANNED', 'BRIEF_READY', 'REFERENCES_READY', 'SCRIPT_DRAFTED', 'LOGISTICS_OPEN', 'BREAKDOWN_DRAFTED', 'ESCALATED', 'CANCELLED'] },
  { id: 'ESCALATED',           label: 'Stuck, needs you',
    next: ['BRIEF_READY', 'LOGISTICS_OPEN', 'BREAKDOWN_DRAFTED', 'CHANGES_REQUESTED', 'BLOCKED', 'CANCELLED'] },
  { id: 'COMPLETE',            label: 'Shoot done, handed to post-production',               next: [] },
  { id: 'CANCELLED',           label: 'Cancelled',                                           next: [] },
];

const BY_ID = Object.fromEntries(STATES.map(s => [s.id, s]));

const get = id => BY_ID[id] || null;
const exists = id => Boolean(BY_ID[id]);
const label = id => (BY_ID[id] ? BY_ID[id].label : id);
const isGate = id => Boolean(BY_ID[id] && BY_ID[id].gate);
const gateOf = id => (BY_ID[id] ? BY_ID[id].gate || null : null);
const rollbackOf = id => {
  const raw = BY_ID[id] ? BY_ID[id].rollback : null;
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] : raw;
};
const ids = () => STATES.map(s => s.id);

// A job may always stop or get stuck, and re-entering the same state is a no-op rather than
// an error: a retried script should not fail because the state is already correct.
function canMove(from, to) {
  if (!exists(from) || !exists(to)) return false;
  if (from === to) return true;
  return (BY_ID[from].next || []).includes(to);
}

// Where "start over" at a gate sends a job. Every 1-22 gate has exactly one answer; the
// route-aware form is kept so callers written against the kernel keep working.
function rollbackFor(id, routeGates) {
  const raw = BY_ID[id] ? BY_ID[id].rollback : null;
  if (!raw) return null;
  const candidates = Array.isArray(raw) ? raw : [raw];
  const gates = Array.isArray(routeGates) ? routeGates : [];
  for (const c of candidates) {
    const gate = gateOf(c);
    if (!gate || gates.includes(gate)) return c;
  }
  return candidates[candidates.length - 1];
}

// The state a gate's approval moves the job into.
const APPROVED_STATE = { A: 'GATE_A_PASSED', B: 'GATE_B_PASSED', C: 'RELEASED' };

const AWAITING_STATE = Object.fromEntries(STATES.filter(s => s.gate).map(s => [s.gate, s.id]));

// The board's own word for where a project is, keyed by state. `projects/{id}.status` on the
// 1-22 Control board takes exactly these values.
const BOARD_STATUS = {
  INTAKE_PENDING: 'intake', PLANNED: 'intake',
  BRIEF_READY: 'stage1', REFERENCES_READY: 'stage1', SCRIPT_DRAFTED: 'stage1', STORYBOARD_DRAFTED: 'stage1',
  SHOT_LIST_DRAFTED: 'stage1', PLANNING_DRAFTED: 'stage1', AWAITING_GATE_A: 'gate_a',
  GATE_A_PASSED: 'stage2', LOGISTICS_OPEN: 'stage2', AWAITING_GATE_B: 'gate_b',
  GATE_B_PASSED: 'stage3', BREAKDOWN_DRAFTED: 'stage3', CALL_SHEETS_DRAFTED: 'stage3', AWAITING_GATE_C: 'gate_c',
  RELEASED: 'released', COMPLETE: 'released', CANCELLED: 'killed',
};
const boardStatusOf = id => BOARD_STATUS[id] || null;

module.exports = {
  STATES, get, exists, label, isGate, gateOf, rollbackOf, rollbackFor, ids, canMove,
  APPROVED_STATE, AWAITING_STATE, BOARD_STATUS, boardStatusOf,
};
