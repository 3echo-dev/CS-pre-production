#!/usr/bin/env node
// Deterministic router: job.json -> route.json. Rules override the model.
//
//   node route-job.js <job.json> [--out <route.json>] [--config <CONFIG.md>] [--human]
//
// Exit codes: 0 ROUTED · 3 NEEDS_CLARIFICATION or BLOCKED · 4 UNSUPPORTED · 1 internal error · 2 usage
//
// Five rules, and it is a script rather than a prompt because the same folder must route the
// same way every time, and because the model must not be able to talk itself past a gate.
// The orchestrator may append to modelAddedRiskFlags. It never edits anything else.
const fs = require('fs');
const path = require('path');
const { validate } = require('./validate-schema.js');
const ws = require('./lib-workspace.js');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const jobPath = args.find(a => !a.startsWith('--') && !['--out', '--config'].includes(args[args.indexOf(a) - 1]));
if (!jobPath) {
  console.error('usage: route-job.js <job.json> [--out <route.json>] [--config <CONFIG.md>] [--human]');
  process.exit(2);
}
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
const outPath = opt('--out', path.join(path.dirname(jobPath), 'route.json'));
const cfgPath = opt('--config', path.join(ROOT, 'CONFIG.md'));

// The yaml block at the top of CONFIG.md, flat keys only.
function readConfig(file) {
  const cfg = {};
  let txt = '';
  try { txt = fs.readFileSync(file, 'utf8'); } catch { return cfg; }
  const m = txt.match(/```yaml\r?\n([\s\S]*?)```/);
  if (!m) return cfg;
  for (const raw of m[1].split(/\r?\n/)) {
    if (/^\s/.test(raw)) continue;
    const line = raw.replace(/#.*$/, '').trimEnd();
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (v === '') continue;
    if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
    else if (v === 'true') v = true;
    else if (v === 'false') v = false;
    else if (!isNaN(Number(v))) v = Number(v);
    cfg[k] = v;
  }
  return cfg;
}

const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
let job, agentsReg, workflowsReg;
try {
  job = readJson(jobPath);
  agentsReg = readJson(path.join(ROOT, 'registry', 'agents.json'));
  workflowsReg = readJson(path.join(ROOT, 'registry', 'workflows.json'));
} catch (e) {
  console.error('cannot read inputs: ' + e.message);
  process.exit(1);
}
// A schema that is missing or broken must not stop routing: the rules below still hold, and
// the note on stderr is how the missing file gets noticed.
const loadSchema = name => {
  try { return readJson(path.join(ROOT, 'schemas', name)); }
  catch (e) { console.error('note: schemas/' + name + ' could not be read (' + e.message + '); skipping that check'); return null; }
};
const schema = loadSchema('job.schema.json');
const routeSchema = loadSchema('route.schema.json');
const cfg = readConfig(cfgPath);
const threshold = typeof cfg.route_confidence_threshold === 'number' ? cfg.route_confidence_threshold : 0.8;

const client = job.client || job.brand || null;
const R = {
  schemaVersion: '1.0', jobId: job.jobId || null, client, brand: client, status: null,
  workflowId: null, workflowVersion: null,
  requiredDisciplines: [], owner: null, support: [],
  riskFlags: [], modelAddedRiskFlags: [], gates: [], tags: [],
  confidence: 1, missingFields: [], unsupported: [], blockers: [], rationale: [],
  createdAt: new Date().toISOString(),
};
const say = s => R.rationale.push(s);
const missing = f => { if (!R.missingFields.includes(f)) R.missingFields.push(f); };
const tag = t => { if (!R.tags.includes(t)) R.tags.push(t); };

// Rule 1: schema validity. scriptFormat and storyboardStyle are required whatever the schema
// says, because they change what the directors write, and a guess here is a wrong script.
if (schema) {
  for (const e of validate(schema, job)) {
    const field = e.path.replace(/^\$\.?/, '');
    if (e.keyword === 'required') missing(field);
    else missing(field + ' (' + e.message + ')');
  }
}
for (const f of ['jobId', 'client', 'title', 'kind']) if (!job[f] && !(f === 'client' && job.brand)) missing(f);
const FORMATS = ['screenplay', 'av_script'];
const STYLES = ['sketches', 'live_pictures', 'cartoon_animation'];
if (!FORMATS.includes(job.scriptFormat)) missing('scriptFormat (one of ' + FORMATS.join(', ') + ')');
if (!STYLES.includes(job.storyboardStyle)) missing('storyboardStyle (one of ' + STYLES.join(', ') + ')');
if (R.missingFields.length) say('Rule 1: missing or invalid fields: ' + R.missingFields.join(', '));
else say('Rule 1: job.json is complete');

// Rule 2: the kind must have an active workflow.
const wf = workflowsReg.workflows.find(w => (w.kinds || []).includes(job.kind));
if (!wf) { R.unsupported.push('kind:' + (job.kind || '?') + ' has no workflow'); say('Rule 2: no workflow for kind ' + job.kind); }
else if (wf.status !== 'active') { R.unsupported.push('workflow:' + wf.workflowId + ' is ' + wf.status); say('Rule 2: workflow ' + wf.workflowId + ' is ' + wf.status + ', not active'); }
else { R.workflowId = wf.workflowId; R.workflowVersion = wf.version; say('Rule 2: kind ' + job.kind + ' routes to ' + wf.workflowId); }

// Rule 3: the Drive folder must have landed, at least its Brief. A project with nothing to
// read would spend the whole intake finding that out.
const jobDir = path.dirname(path.resolve(jobPath));
const inputsDir = client && job.jobId ? ws.inputsDir(client, process.argv) : null;
const briefFiles = ((job.inputs || {}).brief || []).filter(Boolean);
if (!briefFiles.length) {
  R.blockers.push("the Drive folder's Brief file");
  say('Rule 3: inputs.brief names no file');
} else {
  const found = briefFiles.some(f => {
    const candidates = [
      inputsDir ? path.join(inputsDir, job.jobId, f) : null,
      inputsDir ? path.join(inputsDir, f) : null,
      path.join(jobDir, f),
      path.resolve(f),
    ].filter(Boolean);
    return candidates.some(p => fs.existsSync(p) && fs.statSync(p).isFile());
  });
  if (!found) { R.blockers.push("the Drive folder's Brief file (" + briefFiles.join(', ') + ' is not in inputs)'); say('Rule 3: no brief file from inputs.brief exists on disk'); }
  else say('Rule 3: the brief is on disk');
}

// Rule 4: tags the planner reads.
if (job.hasTrailer === true) { tag('has_trailer'); say('Rule 4: a trailer is tracked separately'); }
if (Number.isInteger(job.shootDays) && job.shootDays > 1) { tag('multi_day'); say('Rule 4: ' + job.shootDays + ' shoot days'); }
if (!R.tags.length) say('Rule 4: no conditional tags');

// Rule 5: owner, support, gates. One owner, every director in workflow order, three gates.
const active = agentsReg.agents.filter(a => a.status === 'active');
const ownerA = active.find(a => (a.ownerForKinds || []).includes(job.kind));
if (ownerA) R.owner = ownerA.agentId;
else if (job.kind) { R.unsupported.push('kind:' + job.kind + ' has no owner agent'); say('Rule 5: no owner agent for kind ' + job.kind); }
const order = agentsReg.disciplineOrder || [];
R.support = active
  .filter(a => !ownerA || a.agentId !== ownerA.agentId)
  .sort((a, b) => order.indexOf(a.discipline) - order.indexOf(b.discipline))
  .map(a => a.agentId);
R.requiredDisciplines = active
  .map(a => a.discipline)
  .filter((d, i, all) => d && all.indexOf(d) === i)
  .sort((a, b) => order.indexOf(a) - order.indexOf(b));
if (wf && wf.status === 'active') R.gates = [...(wf.gates || [])];
say('Rule 5: owner ' + (R.owner || 'none') + '; support ' + (R.support.join(', ') || 'none') + '; gates ' + (R.gates.join(', ') || 'none'));

// Confidence, reduced per missing field.
R.confidence = Math.max(0, Math.round((1 - 0.15 * R.missingFields.length) * 100) / 100);
if (R.confidence < threshold) R.riskFlags.push('ambiguous_request');

// Status. A blocker outranks a missing field: there is a specific thing to fetch.
if (R.unsupported.length) R.status = 'UNSUPPORTED';
else if (R.blockers.length) R.status = 'BLOCKED';
else if (R.missingFields.length || R.confidence < threshold) R.status = 'NEEDS_CLARIFICATION';
else R.status = 'ROUTED';
say('Status: ' + R.status);

if (routeSchema) {
  const selfErrs = validate(routeSchema, R);
  if (selfErrs.length) {
    console.error('internal error: route.json fails its own schema: ' + selfErrs.map(e => e.path + ' ' + e.message).join('; '));
    process.exit(1);
  }
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(R, null, 2) + '\n');

const fwd = s => s.split(path.sep).join('/');
if (args.includes('--human')) {
  if (R.status === 'ROUTED') console.log('I can run this. Three gates along the way are yours: creative lock, logistics lock, release.');
  else if (R.status === 'BLOCKED') console.log('I need ' + R.blockers.join(', and ') + ' before I can start.');
  else if (R.status === 'NEEDS_CLARIFICATION') console.log('I need a bit more before I start: ' + R.missingFields.join(', ') + '.');
  else console.log('I cannot run this: ' + R.unsupported.join('; ') + '.');
}
console.log(R.status + ': ' + (R.workflowId || '-') + ' · owner ' + (R.owner || '-') + ' · support [' + R.support.join(', ') + '] · gates [' + R.gates.join(', ') + '] · tags [' + R.tags.join(', ') + ']');
if (R.blockers.length) console.log('I need ' + R.blockers.join(', and ') + ' before I can start.');
if (R.missingFields.length) console.log('missing: ' + R.missingFields.join(', '));
if (R.unsupported.length) console.log('unsupported: ' + R.unsupported.join('; '));
console.log('wrote ' + fwd(outPath));

// The router is the only thing that knows the job is routed, so it records it. A blocked or
// unclear job stays where it was: the 1-22 table has no state for "asked and waiting", the
// board carries the question instead.
const { advance } = require('./lib-advance.js');
if (R.status === 'ROUTED') {
  advance(path.dirname(jobPath), 'PLANNED', { by: 'router', note: 'Routed to ' + R.workflowId + '.' });
} else if (R.status === 'BLOCKED') {
  advance(path.dirname(jobPath), 'BLOCKED', { by: 'router', note: 'Waiting for ' + R.blockers.join(', and ') + '.' });
}
process.exit(R.status === 'ROUTED' ? 0 : (R.status === 'UNSUPPORTED' ? 4 : 3));
