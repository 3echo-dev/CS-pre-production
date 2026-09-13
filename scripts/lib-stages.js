// Which of the eight board stages a person sees a state as.
//
// `docs/STAGES.md` is the mapping in prose, for a model to read. This is the same mapping as
// data, so `set-state.js` can post progress for every state change without the orchestrator
// remembering a second call, and so a test can check the two agree.
//
// A state that does not move the stepper maps to null: "start over" and "stuck" are told in
// words in the chat, and moving the stage backwards for them would misreport the run.
const STAGE_OF = {
  INTAKE_PENDING:      { stage: 'opening', substep: 'Waiting for the Drive folder', status: 'waiting' },
  PLANNED:             { stage: 'opening', substep: 'Reading the brief', status: 'running' },

  BRIEF_READY:         { stage: 'stage-1-creative', substep: 'Scraper', status: 'running' },
  REFERENCES_READY:    { stage: 'stage-1-creative', substep: 'Script', status: 'running' },
  SCRIPT_DRAFTED:      { stage: 'stage-1-creative', substep: 'Storyboard', status: 'running' },
  STORYBOARD_DRAFTED:  { stage: 'stage-1-creative', substep: 'Shot list', status: 'running' },
  SHOT_LIST_DRAFTED:   { stage: 'stage-1-creative', substep: 'Budget sheet and timeline', status: 'running' },
  PLANNING_DRAFTED:    { stage: 'stage-1-creative', status: 'done' },
  AWAITING_GATE_A:     { stage: 'gate-a', status: 'waiting' },
  GATE_A_PASSED:       { stage: 'gate-a', status: 'done' },

  LOGISTICS_OPEN:      { stage: 'stage-2-logistics', substep: 'Audio, talents, props, locations', status: 'running' },
  AWAITING_GATE_B:     { stage: 'gate-b', status: 'waiting' },
  GATE_B_PASSED:       { stage: 'gate-b', status: 'done' },

  BREAKDOWN_DRAFTED:   { stage: 'stage-3-documents', substep: 'Call sheets', status: 'running' },
  CALL_SHEETS_DRAFTED: { stage: 'stage-3-documents', status: 'done' },
  AWAITING_GATE_C:     { stage: 'gate-c', status: 'waiting' },
  RELEASED:            { stage: 'released', status: 'done' },

  CHANGES_REQUESTED: null,
  BLOCKED: null,
  ESCALATED: null,
  COMPLETE:            { stage: 'released', status: 'done' },
  CANCELLED: null,
};

// The eight stage ids, in the order the board draws them.
const STAGE_IDS = [
  'opening', 'stage-1-creative', 'gate-a', 'stage-2-logistics', 'gate-b',
  'stage-3-documents', 'gate-c', 'released',
];

const forState = id => STAGE_OF[id] || null;

// Short spellings the board also accepts.
const SHORT_OF = {
  'opening': 'intake',
  'stage-1-creative': 'stage1',
  'gate-a': 'gate_a',
  'stage-2-logistics': 'stage2',
  'gate-b': 'gate_b',
  'stage-3-documents': 'stage3',
  'gate-c': 'gate_c',
  'released': 'released',
};

// Client onboarding has its own short list (kept for the onboarding skill; no state maps here).
const BRAND_STAGE_IDS = ['reading-the-handoff', 'a-few-questions', 'writing-the-client-files', 'your-approval', 'done'];

const SHORT_IDS = Object.values(SHORT_OF).concat(['home']);
const ACCEPTED_STAGE_IDS = Object.keys(SHORT_OF).concat(SHORT_IDS);

function resolveStage(id) {
  const said = String(id || '').trim();
  if (!said) return null;
  if (SHORT_OF[said]) return said;
  return SHORT_IDS.includes(said) ? said : null;
}

// Stages a person is asked to act on. The run never says one of these has started; the gate
// record does, when the decision is actually on the board.
const APPROVAL_STAGE_IDS = ['gate-a', 'gate-b', 'gate-c'];

/**
 * The stage that has plainly started, given a state that just finished one. Only allowed
 * to say what the state machine already knows: every legal next state lands on the same
 * stage, that stage is the very next one in the list, and it is not a gate.
 */
function nextRunning(stateId, nextStateIds, walked) {
  const here = forState(stateId);
  if (!here || here.status !== 'done') return null;
  const order = (walked && walked.length ? walked : STAGE_IDS);
  const at = order.indexOf(here.stage);
  if (at < 0 || at + 1 >= order.length) return null;
  const candidates = (nextStateIds || []).map(forState).filter(Boolean)
    .filter(c => order.indexOf(c.stage) > at);
  if (!candidates.length) return null;
  const knowsRoute = Boolean(walked && walked.length);
  const stage = order[at + 1];
  if (!candidates.some(c => c.stage === stage)) return null;
  if (!knowsRoute && !candidates.every(c => c.stage === stage)) return null;
  if (APPROVAL_STAGE_IDS.includes(stage)) return null;
  return { stage, status: 'running' };
}

/** The stages this run will actually walk, from the states its plan passes through. */
function walkedStages(stateIds) {
  const seen = new Set();
  for (const id of stateIds || []) {
    const step = forState(id);
    if (step) seen.add(step.stage);
  }
  if (!seen.size) return null;
  seen.add(STAGE_IDS[0]);
  seen.add(STAGE_IDS[STAGE_IDS.length - 1]);
  return STAGE_IDS.filter(id => seen.has(id));
}

module.exports = { STAGE_OF, STAGE_IDS, APPROVAL_STAGE_IDS, nextRunning, walkedStages, BRAND_STAGE_IDS, SHORT_OF, ACCEPTED_STAGE_IDS, forState, resolveStage };
