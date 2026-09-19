// Where the work lives. One resolver, used by every script.
//
// Before this existed, eleven scripts joined the literal string 'workspaces' against
// process.cwd(). In a cloud container the cwd is discarded at session end, so a job created
// without remembering to cd first was lost. There was no setting to change that.
//
// Resolution order, first hit wins:
//   1. --root <dir> on the command line
//   2. CREATIVE_STUDIO_ROOT in the environment
//   3. "root" in .creative-studio-pipeline/config.json, from the nearest ancestor of cwd
//   4. the current directory
//
// A root holds workspaces/ (one folder per client) and inputs/ side by side. Pointing a root straight at a
// workspaces/ directory also works, because people will do that.
const fs = require('fs');
const path = require('path');

const CONFIG_DIR = '.creative-studio-pipeline';
const CONFIG_FILE = 'config.json';

function readConfigFrom(dir) {
  try {
    const p = path.join(dir, CONFIG_DIR, CONFIG_FILE);
    if (fs.existsSync(p)) return { config: JSON.parse(fs.readFileSync(p, 'utf8')), at: p };
  } catch { /* a malformed config must not stop a run */ }
  return null;
}

// Walk up from cwd so a script run inside a job folder still finds the project's setting.
function findConfig(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    const hit = readConfigFrom(dir);
    if (hit) return hit;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

// Returns { path, source } so callers can tell the user where the work is going.
function rootWithSource(argv = process.argv) {
  const i = argv.indexOf('--root');
  if (i >= 0 && argv[i + 1]) return { path: path.resolve(argv[i + 1]), source: '--root' };
  if (process.env.CREATIVE_STUDIO_ROOT) {
    return { path: path.resolve(process.env.CREATIVE_STUDIO_ROOT), source: 'CREATIVE_STUDIO_ROOT' };
  }
  const found = findConfig();
  if (found && found.config && found.config.root) {
    return { path: path.resolve(path.dirname(path.dirname(found.at)), found.config.root), source: found.at };
  }
  return { path: process.cwd(), source: 'current folder' };
}

const root = (argv) => rootWithSource(argv).path;

// A root may hold workspaces/, or be the workspaces directory itself.
function brandsDir(argv) {
  const r = root(argv);
  const nested = path.join(r, 'workspaces');
  if (fs.existsSync(nested)) return nested;
  if (path.basename(r) === 'workspaces') return r;
  return nested;
}

const wsDir = (brand, argv) => path.join(brandsDir(argv), brand);
const jobsDir = (brand, argv) => path.join(wsDir(brand, argv), 'jobs');
const jobDir = (brand, jobId, argv) => path.join(jobsDir(brand, argv), jobId);

function inputsDir(brand, argv) {
  const b = brandsDir(argv);
  const dataRoot = path.basename(b) === 'workspaces' ? path.dirname(b) : b;
  return brand ? path.join(dataRoot, 'inputs', brand) : path.join(dataRoot, 'inputs');
}

function listBrands(argv) {
  const b = brandsDir(argv);
  try {
    return fs.readdirSync(b)
      .filter(n => !n.startsWith('.') && fs.existsSync(path.join(b, n, 'workspace.json')))
      .sort();
  } catch { return []; }
}

function listJobs(brand, argv) {
  try { return fs.readdirSync(jobsDir(brand, argv)).filter(j => j.startsWith('job-')).sort(); }
  catch { return []; }
}

// Flags that take a value. Filtering only on the leading `--` leaves the value behind as a
// positional, which is how `scaffold-client.js acme --root C:/tmp/x` came to write the flag
// and its path into the brand's display name, producing a workspace.json that would not parse.
const VALUE_FLAGS = ['--root', '--out', '--job', '--by', '--comment', '--note', '--credits',
  '--max-credits', '--captions', '--state', '--since', '--until', '--rating', '--ack',
  // Every one of these carries a value. A flag missing from this list makes its value look
  // like a positional, which is how a title once turned into part of a file path.
  '--title', '--score', '--why', '--chosen', '--gate-app-decision-id', '--channel',
  '--brand', '--timeout',
  // The price question and a change of deliverable: the quotes read in, the ceiling to fit,
  // where the working is written, and the person's own words for why the plan changed.
  '--quotes', '--ceiling', '--breakdown', '--answer',
  // The board: which item a run or version belongs to, its number, the seat that made it.
  '--item', '--n', '--seat', '--gate', '--file', '--project', '--kind', '--days',
  // The photo of the product a person sent from the page: where to fetch it, what to
  // call it once it has landed, and where it came from, which decides who owns it.
  '--url', '--name', '--source'];

function positionals(args) {
  const out = [];
  for (let i = 0; i < (args || []).length; i++) {
    const a = String(args[i]);
    if (a.startsWith('--')) { if (VALUE_FLAGS.includes(a)) i++; continue; }
    out.push(a);
  }
  return out;
}

// Scripts used to take either "<brand> <job-id>" or a path, inconsistently. Accept both
// everywhere: a path to job.json, route.json, or the job folder resolves to the same pair.
function resolveJobArgs(args, argv) {
  const positional = positionals(args);
  const first = positional[0];
  if (first && (/[\\/]/.test(first) || /\.json$/i.test(first))) {
    let p = path.resolve(first);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) p = path.dirname(p);
    const jobId = path.basename(p);
    const brand = path.basename(path.dirname(path.dirname(p)));
    return { brand, jobId, dir: p, rest: positional.slice(1) };
  }
  const [brand, jobId, ...rest] = positional;
  return { brand, jobId, dir: brand && jobId ? jobDir(brand, jobId, argv) : null, rest };
}

function workspaceConfig(brand, argv) {
  try { return JSON.parse(fs.readFileSync(path.join(wsDir(brand, argv), 'workspace.json'), 'utf8')); }
  catch { return {}; }
}

// Stamps were written in whatever zone the process ran in, so a Manila workspace recorded
// its approvals in UTC. Format in the workspace's own zone instead.
function now(brand, argv, date = new Date()) {
  const tz = (workspaceConfig(brand, argv) || {}).timezone;
  const pad = n => String(n).padStart(2, '0');
  if (!tz) {
    const off = -date.getTimezoneOffset(), s = off < 0 ? '-' : '+';
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' +
      pad(date.getHours()) + ':' + pad(date.getMinutes()) + ' ' +
      s + pad(Math.floor(Math.abs(off) / 60)) + ':' + pad(Math.abs(off) % 60);
  }
  try {
    const f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'longOffset',
    });
    const parts = Object.fromEntries(f.formatToParts(date).map(p => [p.type, p.value]));
    // longOffset gives "GMT+08:00"; the record wants "+08:00".
    const offset = (parts.timeZoneName || '').replace(/^GMT/, '') || '+00:00';
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} ${offset}`;
  } catch {
    return now(null, argv, date);
  }
}

const fwd = p => String(p).split(path.sep).join('/');

// Every client is a workspace. The kernel calls it a brand in a few places; both names work.
const clientsDir = brandsDir;
const listClients = listBrands;

// The client's intake folder holds Brief, Concept and Client Assets. Three runs in a row the
// session was started inside that folder, the root defaulted to the current directory, and
// the pipeline wrote workspaces/, inputs/ and .board/ beside the client's own material. The
// folder is read-only client input; nothing of the pipeline's belongs in it. Any of the three
// names is enough to say so: a person who names a folder "Brief" is not naming a workspace.
const INTAKE_MARKS = ['brief', 'concept', 'client assets'];
function intakeMarks(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && INTAKE_MARKS.includes(e.name.toLowerCase()))
      .map(e => e.name).sort();
  } catch { return []; }
}
// The refusal every script that creates something at the root prints, or null when the root
// is fine. Exit 3 is the caller's: a prerequisite (a root that is not the client's) is missing.
function refuseIntakeRoot(argv) {
  const { path: r, source } = rootWithSource(argv);
  const marks = intakeMarks(r);
  if (!marks.length) return null;
  return 'REFUSED: the workspace root ' + fwd(r) + ' (set by ' + source + ') is the client\'s intake folder: it holds ' +
    marks.join(', ') + '. The pipeline never writes into client material. Choose a root that is not the client\'s folder: ' +
    'set-root.js <folder> from outside it, --root <folder>, or CREATIVE_STUDIO_ROOT. Nothing was created.';
}

module.exports = {
  intakeMarks, refuseIntakeRoot,
  root, rootWithSource, brandsDir, clientsDir, wsDir, jobsDir, jobDir, inputsDir, listClients,
  listBrands, listJobs, positionals, resolveJobArgs, workspaceConfig, now, fwd,
  CONFIG_DIR, CONFIG_FILE,
};
