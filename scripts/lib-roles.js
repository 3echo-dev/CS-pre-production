// Who a person sees working, and what each one is doing.
//
// The seats are the agents under agents/. A state change knows the plan, and the plan names
// an agent on every row, so the board can show the workers on every stage without a run
// remembering to say so.
const ROLES = {
  orchestrator:          { label: 'Orchestrator',        action: 'Keeping the work moving and checking each file as it lands.' },
  'intake-director':     { label: 'Intake Clerk',        action: 'Reading the Drive folder and writing the unified brief.' },
  'reference-scout':     { label: 'Reference Scout',     action: "Searching the client's sites for references that fit the brief." },
  'script-director':     { label: 'Scriptwriter',        action: 'Drafting the script in the chosen format.' },
  'storyboard-director': { label: 'Storyboard Artist',   action: 'Drawing the panels in the one style chosen for this job.' },
  'shot-list-director':  { label: 'Shot Lister',         action: 'Listing every shot with an id that survives reordering.' },
  'production-planner':  { label: 'Production Planner',  action: 'Pre-filling the budget sheet and the timeline from the templates.' },
  'audio-supervisor':    { label: 'Audio Supervisor',    action: 'Listing VO, music and sound needs per scene.' },
  'logistics-registrar': { label: 'Logistics Registrar', action: 'Preparing the talent, prop and location registers for you to fill.' },
  'breakdown-compiler':  { label: 'Breakdown Compiler',  action: "Compiling the concept breakdown into the client's template." },
  'call-sheet-builder':  { label: 'Call Sheet Builder',  action: 'Building one call sheet per shoot day.' },
  questioner:            { label: 'Questioner',          action: 'Collecting the decisions only you can make.' },
  reviewer:              { label: 'Reviewer',            action: 'Checking the work against the rubric before it reaches you.' },

  // Workers a skill implies, beyond whoever owns the row.
  'image-maker':         { label: 'Image maker',         action: 'Making the picture for each panel.' },
  'reference-watcher':   { label: 'Reference watcher',   action: 'Watching a reference video and noting what it does.' },
  'drive-puller':        { label: 'Drive puller',        action: 'Copying the Drive folder into the job.' },
};

// Spellings a workflow row or a spawn prompt is likely to use for the same worker.
const ALIASES = {
  producer: 'orchestrator', manager: 'orchestrator',
  intake: 'intake-director', clerk: 'intake-director', 'intake-clerk': 'intake-director',
  scraper: 'reference-scout', scout: 'reference-scout', references: 'reference-scout',
  script: 'script-director', scriptwriter: 'script-director', writer: 'script-director',
  storyboard: 'storyboard-director', 'storyboard-artist': 'storyboard-director', artist: 'storyboard-director',
  'shot-list': 'shot-list-director', 'shot-lister': 'shot-list-director', shots: 'shot-list-director',
  planner: 'production-planner', budget: 'production-planner', timeline: 'production-planner',
  audio: 'audio-supervisor', sound: 'audio-supervisor',
  registrar: 'logistics-registrar', logistics: 'logistics-registrar', talents: 'logistics-registrar', props: 'logistics-registrar', locations: 'logistics-registrar',
  breakdown: 'breakdown-compiler', compiler: 'breakdown-compiler',
  'call-sheet': 'call-sheet-builder', 'call-sheets': 'call-sheet-builder', 'call-sheet-builder': 'call-sheet-builder',
  questions: 'questioner',
  review: 'reviewer', 'review-pass': 'reviewer', 'fresh-eyes': 'reviewer',
  images: 'image-maker', 'make-image': 'image-maker',
  'watch-video': 'reference-watcher', video: 'reference-watcher',
  'drive-pull': 'drive-puller', drive: 'drive-puller',
};

// The board has three words for a worker; a workflow row has more.
const STATUSES = {
  running: 'working', working: 'working', started: 'working', start: 'working',
  done: 'done', finished: 'done', complete: 'done', verified: 'done',
  waiting: 'waiting', blocked: 'waiting',
};

const roleOf = (name) => {
  const key = String(name || '').trim().toLowerCase();
  const id = ROLES[key] ? key : ALIASES[key];
  return id ? { id, ...ROLES[id] } : null;
};

// "script-director:running,storyboard-director:done" into what the board stores.
// An unknown name is still a worker: it goes through as title case rather than being
// dropped, because a silent worker is the very thing this exists to fix.
function parseAgents(text) {
  if (!text) return [];
  return String(text).split(',').map(s => s.trim()).filter(Boolean).map(entry => {
    const at = entry.lastIndexOf(':');
    const name = (at >= 0 ? entry.slice(0, at) : entry).trim();
    const said = (at >= 0 ? entry.slice(at + 1) : 'running').trim().toLowerCase();
    const known = roleOf(name);
    const slug = String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const words = slug.split('-').filter(Boolean).join(' ');
    return {
      id: (known ? known.id : slug || 'worker').slice(0, 80),
      role: (known ? known.label : (words ? words[0].toUpperCase() + words.slice(1) : 'Worker')).slice(0, 80),
      action: (known ? known.action : 'Working on this part of the job.').slice(0, 180),
      status: STATUSES[said] || 'working',
    };
  }).slice(0, 8);
}

// Skills that mean a distinct worker a person can see, beyond whoever owns the row.
const SKILL_WORKERS = { 'make-image': 'image-maker', 'watch-video': 'reference-watcher', 'drive-pull': 'drive-puller' };

const NOT_A_WORKER = new Set(['scripts', 'script', 'human', 'board', '-', '', 'none']);

/**
 * Who is working on a stage, read from the job's own plan. Every row names its agent, and a
 * row with no state of its own belongs to the next row that has one, which is how a plan
 * reads: several rows of work, then the state they earn together.
 */
function workersFromPlan(planText, stageId, status) {
  const stages = require('./lib-stages.js');
  const lines = String(planText || '').split(/\r?\n/).filter(l => l.trim().startsWith('|'));
  const cells = l => l.split('|').slice(1, -1).map(c => c.trim());
  const header = lines.find(l => cells(l).includes('State after'));
  if (!header) return [];
  const head = cells(header);
  const at = { agent: head.indexOf('Agent'), task: head.indexOf('Task'), skills: head.indexOf('Skills'), state: head.indexOf('State after') };
  if (at.state < 0) return [];

  const rows = [];
  for (const line of lines) {
    const c = cells(line);
    if (c.includes('State after') || c.every(x => /^:?-+:?$/.test(x))) continue;
    rows.push({
      agent: (c[at.agent] || '').replace(/`/g, ''),
      task: c[at.task] || '',
      skills: c[at.skills] || '',
      state: (c[at.state] || '').replace(/`/g, ''),
    });
  }
  for (let i = rows.length - 1, carry = ''; i >= 0; i--) {
    if (rows[i].state) carry = rows[i].state;
    else rows[i].state = carry;
  }
  // A row that ends by opening a gate did its work in the stage before it.
  let last = null;
  for (const row of rows) {
    const step = stages.forState(row.state);
    row.stage = step ? step.stage : null;
    if (row.stage && stages.APPROVAL_STAGE_IDS.includes(row.stage)) row.stage = last;
    else if (row.stage) last = row.stage;
  }
  const said = [];
  for (const row of rows) {
    if (row.stage !== stageId) continue;
    if (!NOT_A_WORKER.has(row.agent.toLowerCase())) said.push(row.agent);
    for (const [skill, role] of Object.entries(SKILL_WORKERS)) {
      if (new RegExp('(^|[^a-z-])' + skill + '([^a-z-]|$)', 'i').test(row.skills || '')) said.push(role);
    }
  }
  const seen = new Set();
  const unique = said.filter(n => { const k = String(n).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  return parseAgents(unique.map(n => n + ':' + status).join(','));
}

module.exports = { ROLES, ALIASES, STATUSES, roleOf, parseAgents, workersFromPlan };
