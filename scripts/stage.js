#!/usr/bin/env node
// Say which stage is running and who is working on it.
//
//   node stage.js <job-id> <stage-id> running|done|waiting
//        [--substep "Script"]
//        [--agents "script-director:running,storyboard-director:done"]
//        [--title "HTF, Night Shift"] [--root <dir>] [--json]
//
// The stepper used to move only when `set-state.js` changed a state, and a workflow row is
// not a state: research ran for twenty minutes inside one state, so the pane sat on "Getting
// your brief" and then jumped to "Shaping the idea" with nothing in between. Whole stages
// came and went unreported. A stage is now said out loud at the start and the end of every
// row, by the run that is actually doing it.
//
// It also names the roles working under that stage. The person watching asked for exactly
// that: market researcher, competitor researcher, video analyzer, brand researcher, each
// showing whether it is working or finished. The pane knows nothing about agent names, so
// the friendly wording is decided here, once.
//
// Nothing here fails the caller. The board is never allowed to stop the work it reports on,
// so a folder that is not the pipeline's prints nothing and exits 0.
const gate = require('./lib-board.js');
const stages = require('./lib-stages.js');

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const json = argv.includes('--json');

// Who the workers are and how their names are spelled lives in lib-roles.js, because a
// state change names them too.
const { parseAgents, STATUSES } = require('./lib-roles.js');

const positional = argv.filter(a => !a.startsWith('--'));
const [key, stageArg, statusArg] = positional;
const status = STATUSES[String(statusArg || '').toLowerCase()] === 'working' ? 'running'
  : STATUSES[String(statusArg || '').toLowerCase()] || null;

const usage = () => {
  console.error('usage: stage.js <job-id> <stage-id> running|done|waiting [--substep "<line>"] [--agents "script-director:running,storyboard-director:done"] [--title "<words>"]');
  console.error('stages: ' + stages.STAGE_IDS.join(' '));
  process.exit(2);
};

if (!key || !stageArg || !status) usage();

const stage = stages.resolveStage(stageArg);
if (!stage) {
  console.error('"' + stageArg + '" is not a stage. See docs/STAGES.md. Known stages:');
  console.error('  ' + stages.STAGE_IDS.join(' '));
  console.error('  ' + stages.BRAND_STAGE_IDS.join(' '));
  process.exit(2);
}

const title = flag('title');
const substep = flag('substep');
const agents = parseAgents(flag('agents'));

const body = {
  key,
  ...(title ? { title } : {}),
  stage,
  ...(substep ? { substep } : {}),
  status,
  ...(agents.length ? { activities: agents } : {}),
};

(async () => {
  // A folder that is not the pipeline's says nothing at all: one line per workflow row would
  // be pure noise, and a queued heartbeat in a stranger's project would be worse.
  if (!gate.configured(argv)) { if (json) console.log(JSON.stringify({ posted: false, sent: body, reason: 'not configured' }, null, 2)); return; }
  const result = await gate.call('progress', body, { argv });
  if (json) {
    console.log(JSON.stringify({ posted: !result.offline, sent: body, ...(result.offline ? { reason: result.reason } : {}) }, null, 2));
    return;
  }
  // A folder that was never connected is the normal case in a chat-only run, so it says
  // nothing at all: one line per workflow row would be pure noise.
  if (result.offline) return;
  const who = agents.map(a => a.role + ' ' + (a.status === 'done' ? 'finished' : a.status)).join(', ');
  console.log('Board: ' + (substep || stage) + (who ? ' - ' + who : ''));
})().catch(() => { /* the pane is never allowed to fail the work it reports on */ });
