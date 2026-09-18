// The pure half of the function hooks. Nothing in here touches `$`; every function takes what
// an op returned and gives back a verdict, so `hooks.mjs` stays a thin layer of call sites
// and the rules can be read, and tested, as plain functions.
//
// Three tables below are copies of tables that live in CommonJS scripts, because a function
// hook cannot require one. `scripts/lib-states.js` (the gate states), `scripts/lib-stages.js`
// (the stage ids) and `scripts/record-approval.js` (the verdict words). Keep them in step.

// ---------------------------------------------------------------------------------------
// The spend guard's vocabulary. Only the suffix of an MCP tool name is stable: the server is
// `plugin_cs-pre-production_3echo` under this plugin and a bare id under a Desktop connector.
// ---------------------------------------------------------------------------------------
/** The one tool 1-22 may spend credits through: a storyboard panel is an image job. */
export const SPENDER = /__create_image_job$/;
/** Video is never generated in pre-production. A clip is a post-production decision. */
export const VIDEO = /__(create_video_job|estimate_video_job|generate_studio_take|generate_studio_take_batch|generate_studio_rough_cut|create_studio_fine_cut|generate_studio_reference_bible_versions)$/;
/** The studio tools spend without passing a quote, a board or a gate. Refused outright. */
export const STUDIO = /__(start_studio_flow|advance_studio_flow|create_studio_release|create_studio_creative_treatment|create_studio_target_frame_version|create_silent_studio_take_variant|refresh_studio_reference_bible|propose_studio_reference_bible)$/;

/** `record-approval.js` SYNONYMS: the words people use, mapped onto one vocabulary. */
export const SYNONYMS = {
  approve: 'approve', approved: 'approve', ok: 'approve', yes: 'approve', go: 'approve', ship: 'approve', lock: 'approve', release: 'approve',
  edit: 'edit',
  change: 'change', changes: 'change', update: 'change', revise: 'change', fix: 'change',
  'start-over': 'start over', startover: 'start over', reject: 'start over', no: 'start over', redo: 'start over',
};

/** `lib-states.js`: the states where it is the person's turn. */
export const GATE_STATES = { AWAITING_GATE_A: 'A', AWAITING_GATE_B: 'B', AWAITING_GATE_C: 'C' };
export const WAITING_STATES = ['BLOCKED', 'ESCALATED'];

/** `lib-stages.js` STAGE_IDS. */
export const STAGE_IDS = ['opening', 'stage-1-creative', 'gate-a', 'stage-2-logistics', 'gate-b', 'stage-3-documents', 'gate-c', 'released'];

export const DENY = {
  studio: 'The studio tools spend credits without a quote, a storyboard or a gate. 1-22 never calls them; storyboard panels go through make-image and create_image_job.',
  video: 'Video is never generated in pre-production. 1-22 delivers documents; a clip is a post-production decision made after Gate C.',
  noProject: 'No project is open in this folder, so there is nothing an image could belong to. Open or resume a project first.',
  noKey: 'Give an idempotencyKey spelled as the job id, then the storyboard version, then the panel id, joined by slashes: job-.../v2/P03.',
  wrongJob: 'That idempotencyKey names a different project from the one that is open.',
  notSafe: 'The pre-spend gate refused this plan. Fix what preflight-generation.js reported and run it again before any panel is generated.',
  sampleFirst: 'One sample panel is generated and approved before the batch. Generate the panel the manifest marks as the sample, put it on the board, and record the sample approval with record-approval.js sample approve --max-credits N.',
  overCeiling: (spent, ceiling) => 'Generating this panel would take the board to ' + (spent + 1) + ' panels on disk, over the ' + ceiling + ' the sample approval allows (the panels on disk when it was recorded plus the batch agreed).',
  preflightBroke: 'The pre-spend gate could not be run, so the spend is refused. Run preflight-generation.js by hand and read what it says.',
};

// ---------------------------------------------------------------------------------------
// The idempotency key ties a generation call to a panel the approved plan covers.
// ---------------------------------------------------------------------------------------
const KEY = /^([^/\s]+)\/(v\d+)\/(P\d{2,})$/i;
export function parseKey(key) {
  const hit = KEY.exec(String(key || '').trim());
  return hit ? { jobId: hit[1], version: hit[2].toLowerCase(), panel: hit[3].toUpperCase() } : null;
}

/** JSON out of a process result's stdout, or null. Never throws: a guard that throws is skipped. */
export function readJson(stdout) {
  try { return JSON.parse(String(stdout || '').trim()); } catch { return null; }
}

/**
 * The spend verdict, from what preflight-generation.js --json said and which panel is asked
 * for. Pure: every fact was read by the caller through an op.
 */
export function spendVerdict(tool, key, ctx, preflight, panelsOnDisk) {
  if (STUDIO.test(tool)) return { deny: DENY.studio };
  if (VIDEO.test(tool)) return { deny: DENY.video };
  if (!SPENDER.test(tool)) return null;
  if (!ctx || !ctx.jobId) return { deny: DENY.noProject };
  const k = parseKey(key);
  if (!k) return { deny: DENY.noKey };
  if (k.jobId !== ctx.jobId) return { deny: DENY.wrongJob };
  if (!preflight) return { deny: DENY.preflightBroke };
  if (preflight.valid !== true) return { deny: DENY.notSafe + ' ' + (preflight.problems || []).slice(0, 3).join(' ') };
  if (preflight.allowed === 'sample' && preflight.samplePanel && k.panel !== String(preflight.samplePanel).toUpperCase()) return { deny: DENY.sampleFirst };
  if (preflight.allowed === 'batch') {
    const spent = Number(panelsOnDisk || 0);
    const ceiling = Number(preflight.ceiling || 0);
    if (ceiling && spent + 1 > ceiling) return { deny: DENY.overCeiling(spent, ceiling) };
  }
  return null;
}

// ---------------------------------------------------------------------------------------
// The write guard. What no agent may write, by path, whatever it says it is doing.
// ---------------------------------------------------------------------------------------
export function normPath(p) { return String(p || '').replace(/\\/g, '/').replace(/\/+$/, ''); }
export function isUnder(parent, child) {
  const a = normPath(parent).toLowerCase(), b = normPath(child).toLowerCase();
  return Boolean(a) && (b === a || b.startsWith(a + '/'));
}
export function relativeTo(root, p) {
  const a = normPath(root), b = normPath(p);
  return isUnder(a, b) ? b.slice(a.length).replace(/^\//, '') : null;
}
export const WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];
export const WRITE_ALLOWED = ['workspaces', 'inputs', '.pane', '.board', '.creative-studio-pipeline'];
export const WRITE_DENY = {
  plugin: 'The plugin folder is read-only. It is replaced whole on update, so a fix written there is lost and a rule written there is a rule nobody agreed.',
  status: 'status.md is written only by set-state.js, which refuses an illegal move. Use it.',
  approval: 'An approval record is a person\'s decision, landed by board-sync.js pull or recorded by record-approval.js. Nothing else writes one.',
  versions: 'versions.jsonl is written only by record-version.js, which hashes the file it names. A line written by hand is a version nobody can check.',
  register: 'A register is filled by a person on the board and landed by board-sync.js. The registrar prepares the form; it never types a talent, a prop or a location.',
  release: 'release/ is built by build-release.js from an approved Gate C record. Nothing is copied there by hand.',
  outside: 'Write only under workspaces/ and inputs/ in the workspace root. Nothing else is the pipeline\'s to change.',
};
export const writeTarget = (args) => String((args && (args.file_path || args.notebook_path || args.path)) || '');

/**
 * Allow or deny a write. `root` is the workspace root job-context.js reported, or null when
 * no project is open, in which case only the plugin rule applies.
 */
export function classifyWrite(filePath, root, pluginRoot) {
  const p = normPath(filePath);
  if (!p) return { action: 'allow' };
  if (pluginRoot && isUnder(pluginRoot, p)) return { action: 'deny', reason: WRITE_DENY.plugin };
  if (!root) return { action: 'allow' };
  const rel = relativeTo(root, p);
  if (rel === null) return { action: 'allow' };   // a file outside the workspace is the session's business
  const seg = rel.split('/');
  if (!WRITE_ALLOWED.includes(seg[0])) return { action: 'deny', reason: WRITE_DENY.outside };
  if (seg[0] !== 'workspaces') return { action: 'allow' };
  // workspaces/<client>/jobs/<job>/...
  const name = seg[seg.length - 1] || '';
  const inJob = seg[2] === 'jobs' && seg.length >= 5;
  if (inJob && name === 'status.md' && seg.length === 5) return { action: 'deny', reason: WRITE_DENY.status };
  if (inJob && seg[4] === 'approvals') return { action: 'deny', reason: WRITE_DENY.approval };
  if (inJob && name === 'versions.jsonl' && seg.length === 5) return { action: 'deny', reason: WRITE_DENY.versions };
  if (inJob && seg[4] === 'registers' && /\.json$/i.test(name)) return { action: 'deny', reason: WRITE_DENY.register };
  if (inJob && seg[4] === 'release') return { action: 'deny', reason: WRITE_DENY.release };
  return { action: 'allow' };
}

/** A Bash heredoc loses the file on this machine; the Write tool is the way. */
export const HEREDOC = /<<-?\s*['"]?\w+/;

// ---------------------------------------------------------------------------------------
// The context block beside every prompt, from job-context.js --json.
// ---------------------------------------------------------------------------------------
export function contextBlock(ctx) {
  if (!ctx || !ctx.jobId || !(ctx.client || ctx.brand)) return null;
  const lines = ['1-22, this folder:'];
  lines.push('- ' + (ctx.client || ctx.brand) + ', ' + ctx.jobId + '. ' + (ctx.sentence || 'Working on it.'));
  if (ctx.isTheirTurn) {
    // A decision on the board reaches the run only when a turn lands it, so the block says when
    // that last happened and makes landing the first thing to do, not a reproach at the end.
    lines.push('- It is the person\'s turn' + (ctx.openGate ? ' at Gate ' + ctx.openGate : '') + '. The board was last landed ' +
      (ctx.landedAt ? ctx.landedAt : 'never') + ': read projects/' + ctx.jobId + '/gates and projects/' + ctx.jobId +
      '/inbox with the artifact database tool and land them (board-sync.js land, then pull) before assuming anything was decided.');
  }
  if (ctx.creditsCeiling !== null && ctx.creditsCeiling !== undefined) lines.push('- ' + ctx.creditsSpent + ' of ' + ctx.creditsCeiling + ' credits used.');
  lines.push('- A gate is decided on the board, never in this chat. An XX item is filled by a person, never by an agent.');
  return lines.join('\n');
}

/** The line drawn under a turn that ended on the person's turn. */
export function statusLine(ctx) {
  if (!ctx || !ctx.jobId) return null;
  return [(ctx.client || ctx.brand), ctx.jobId, ctx.sentence || 'Working on it.'].join(' · ');
}

export function classifyVerdict(text) {
  const said = String(text || '').trim().toLowerCase().replace(/[.!]+$/, '');
  const joined = said.replace(/\s+/g, '-');
  const first = said.split(/\s+/)[0] || '';
  return SYNONYMS[said] || SYNONYMS[joined] || SYNONYMS[first] || null;
}

export const PLUGIN_NAME = 'CS Pre-production';
