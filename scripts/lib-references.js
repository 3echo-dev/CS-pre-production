// Shared with creative-studio-post (scripts/lib-references.js): keep the two copies the same.
// The reference library of a job and what each storyboard panel needs from it.
//
// Where it lives: job.referencesFolder, or <driveFolder>/references. Five kinds, one folder each:
//
//   references/characters/<name>/*.png|jpg|webp     one folder per person (or a single image named after them)
//   (the folder names are forgiving: Cast, Backgrounds, 2. Props, Outfits, camera moves... see KIND_WORDS;
//    the library itself may be called references, refs or assets, or be the footage folder itself)
//   references/wardrobe/<name>/...                   costumes and outfits
//   references/locations/<name>/...                  sets and places
//   references/props/<name>/...                      objects that must look the same every time
//   references/motion/<P03|scene-3|name>.mp4|mov      camera moves or performance to follow
//
// Optional references/labels.json adds aliases, so the script can say "the girl" for a folder named "mei":
//   { "characters": { "mei": { "aliases": ["the girl"] } } }
//
// What a panel needs comes from three places, strongest first: fields the storyboard already carries
// (characters, location, wardrobe, props), names from the library found in the panel's words (caption,
// shot, the scene's script line), and screenplay CAPITALS in those words (THE GIRL). A need with no
// match in the library is reported as "from text": the model draws it from the prompt alone.
const fs = require('fs');
const path = require('path');

const KINDS = ['characters', 'wardrobe', 'locations', 'props', 'motion'];
const IMG = /\.(png|jpe?g|webp)$/i;
const VID = /\.(mp4|mov|webm|m4v)$/i;
// AgentC / SeeDance 2 per request: at most 9 image, 3 video and 3 audio references.
const LIMITS = { image: 9, video: 3 };
const PER_KIND = { characters: 4, wardrobe: 2, locations: 1, props: 2 };
const NOT_NAMES = new Set(['INT', 'EXT', 'VO', 'V.O', 'O.S', 'OS', 'CU', 'ECU', 'MS', 'MCU', 'WS', 'EWS', 'POV', 'DAY', 'NIGHT', 'CUT', 'TO', 'FADE', 'IN', 'OUT', 'CONT', 'CONTINUOUS', 'LATER', 'SCENE', 'TBC', 'OTS', 'LS', 'TV', 'AI', 'SFX', 'BGM', 'TITLE', 'SUPER', 'THE', 'A', 'AND', 'OF']);

// Folder names people actually use, per kind: any case, singular or plural, spaces, - or _.
const KIND_WORDS = {
  characters: ['characters', 'character', 'chars', 'cast', 'talent', 'talents', 'actors', 'actor', 'actress', 'people', 'person', 'faces', 'face', 'models', 'model', 'influencers', 'influencer'],
  wardrobe: ['wardrobe', 'wardrobes', 'costumes', 'costume', 'outfits', 'outfit', 'clothes', 'clothing', 'styling', 'looks'],
  locations: ['locations', 'location', 'backgrounds', 'background', 'bg', 'bgs', 'backdrops', 'backdrop', 'sets', 'set', 'places', 'place', 'environments', 'environment', 'env', 'envs', 'plates', 'scenery'],
  props: ['props', 'prop', 'objects', 'object', 'items', 'item', 'products', 'product', 'packshots', 'packshot'],
  motion: ['motion', 'motions', 'movement', 'movements', 'camera', 'camera moves', 'camera move', 'moves', 'reference videos', 'ref videos', 'videos', 'video'],
};
const ROOT_WORDS = ['references', 'reference', 'refs', 'ref', 'assets', 'library'];
const norm = s => String(s || '').toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
const kindOf = folder => { const n = norm(folder).replace(/^\d+\s*[.)]?\s*/, ''); return Object.keys(KIND_WORDS).find(k => KIND_WORDS[k].includes(n)) || null; };
const fwd = p => p.replace(/\\/g, '/');
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The library: job.referencesFolder, else a folder in the footage folder named references, refs,
// assets... (any case), else the footage folder itself when it holds kind folders directly.
function libraryRoot(job) {
  if (job.referencesFolder) return job.referencesFolder;
  if (!job.driveFolder) return null;
  const def = path.join(job.driveFolder, 'references');
  if (!fs.existsSync(job.driveFolder)) return def;
  const dirs = fs.readdirSync(job.driveFolder, { withFileTypes: true }).filter(e => e.isDirectory());
  const named = dirs.find(e => ROOT_WORDS.includes(norm(e.name).replace(/^\d+\s*[.)]?\s*/, '')));
  if (named) return path.join(job.driveFolder, named.name);
  if (dirs.some(e => !SHOOT_DIRS.test(e.name) && (kindOf(e.name) || holdsKinds(path.join(job.driveFolder, e.name))))) return job.driveFolder;
  return def;
}

// A shared library can be split by project: <library>/<project>/<kind>/... plus <library>/shared/<kind>/...
// This project takes its own folder (matched by title or job slug) and shared/, never another project's.
const SHARED_WORDS = ['shared', 'common', 'global', 'general', 'all projects', 'all'];
const squash = s => norm(s).replace(/[^a-z0-9]+/g, '');
function projectKeys(scope) {
  const keys = new Set();
  if (scope && scope.title) keys.add(squash(scope.title));
  if (scope && scope.jobId) { keys.add(squash(scope.jobId)); const slug = String(scope.jobId).replace(/^job-\d{8}-\d{4}-/, ''); keys.add(squash(slug)); }
  keys.delete('');
  return keys;
}
const SHOOT_DIRS = /^(footage|audio|day[-_ ]?\d+|plates|keep|cutout|composite|backgrounds|generated|vo|bgm|sfx)$/i;
const holdsKinds = dir => { try { return fs.readdirSync(dir, { withFileTypes: true }).some(e => e.isDirectory() && kindOf(e.name)); } catch { return false; } };

// Every item in the library: { kind, name, key, aliases, images[], videos[], scope, sources[], clash }
// scope: { title, jobId, driveFolder } of the job reading it.
function scanLibrary(root, scope) {
  const lib = { root: root ? fwd(root) : null, exists: !!(root && fs.existsSync(root)), items: [], folders: {}, unrecognised: [], layout: 'flat', project: null, shared: null, otherProjects: [], warnings: [] };
  if (!lib.exists) return lib;
  let labels = {};
  try { labels = JSON.parse(fs.readFileSync(path.join(root, 'labels.json'), 'utf8')); } catch { labels = {}; }
  // Which folders feed this project: kind folders at the top (flat), or a project folder plus shared/.
  const sources = [];   // { dir, kind, level: 'project'|'shared'|'flat', label }
  const keys = projectKeys(scope);
  const top = fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.'));
  const projectDirs = top.filter(e => !SHOOT_DIRS.test(e.name) && !kindOf(e.name) && holdsKinds(path.join(root, e.name)));
  if (projectDirs.length) lib.layout = 'by-project';
  for (const e of top) {
    const k = kindOf(e.name);
    if (k) { sources.push({ dir: path.join(root, e.name), kind: k, level: lib.layout === 'by-project' ? 'shared' : 'flat', label: e.name }); lib.folders[e.name] = k; continue; }
    if (projectDirs.includes(e)) {
      const sq = squash(e.name);
      const level = SHARED_WORDS.map(squash).includes(sq) ? 'shared' : (keys.has(sq) ? 'project' : null);
      if (!level) { lib.otherProjects.push(e.name); continue; }
      if (level === 'project') lib.project = e.name; else lib.shared = e.name;
      for (const s of fs.readdirSync(path.join(root, e.name), { withFileTypes: true })) {
        const k2 = s.isDirectory() ? kindOf(s.name) : null;
        if (k2) { sources.push({ dir: path.join(root, e.name, s.name), kind: k2, level, label: e.name + '/' + s.name }); lib.folders[e.name + '/' + s.name] = k2; }
      }
      continue;
    }
    if (!SHOOT_DIRS.test(e.name)) lib.unrecognised.push(e.name);
  }
  if (lib.layout === 'by-project' && !lib.project) lib.warnings.push({ code: 'no-project-folder', text: 'The library is split by project, but no folder matches this project' + (scope && scope.title ? ' ("' + scope.title + '")' : '') + '. Only ' + (lib.shared ? 'the shared folder' : 'nothing') + ' is used; ' + lib.otherProjects.length + ' other project folder(s) are ignored.' });
  const inside = scope && scope.driveFolder && fwd(path.resolve(root)).toLowerCase().startsWith(fwd(path.resolve(scope.driveFolder)).toLowerCase());
  if (lib.layout === 'flat' && scope && scope.driveFolder && !inside) lib.warnings.push({ code: 'unscoped-shared', text: 'The library is outside this project\'s folder and is not split by project, so it may hold other projects\' pictures. Only items this script names are used; check the list before approving.' });
  // One entry per (kind, name). The same name from two folders at the same level is a clash; a project
  // item over a shared one of the same name is an override, not a clash.
  for (const kind of KINDS) {
    const byKey = new Map();
    for (const src of sources.filter(s => s.kind === kind)) {
      const groups = new Map();
      for (const e of fs.readdirSync(src.dir, { withFileTypes: true })) {
        if (e.name.startsWith('.')) continue;
        const full = path.join(src.dir, e.name);
        if (e.isDirectory()) groups.set(e.name, (groups.get(e.name) || []).concat(fs.readdirSync(full).filter(f => !f.startsWith('.')).sort().map(f => path.join(full, f))));
        else if (IMG.test(e.name) || VID.test(e.name)) { const nm = e.name.replace(/\.[^.]+$/, '').replace(/[_\-\s]+\d+$/, '') || e.name; groups.set(nm, (groups.get(nm) || []).concat([full])); }
      }
      for (const [name, files] of groups) {
        const entry = { name, files, level: src.level, label: src.label };
        const key = norm(name);
        (byKey.get(key) || byKey.set(key, []).get(key)).push(entry);
      }
    }
    for (const [key, entries] of byKey) {
      const best = ['project', 'flat', 'shared'].find(l => entries.some(e => e.level === l));
      const chosen = entries.filter(e => e.level === best);
      const lab = ((labels[kind] || {})[chosen[0].name]) || ((labels[kind] || {})[key]) || {};
      const files = chosen[0].files;
      lib.items.push({
        kind, name: chosen[0].name, key, aliases: (lab.aliases || []).map(norm).filter(Boolean), note: lab.note || null,
        images: files.filter(f => IMG.test(f)).map(fwd), videos: files.filter(f => VID.test(f)).map(fwd),
        scope: best, sources: chosen.map(e => e.label),
        overrides: entries.some(e => e.level !== best) ? entries.filter(e => e.level !== best).map(e => e.label) : null,
        clash: chosen.length > 1 ? chosen.map(e => e.label) : null,
      });
    }
  }
  return lib;
}

// One fingerprint for the pictures a panel sends: kind, name and the bytes of every file.
function refsHash(refs) {
  const crypto = require('crypto');
  const parts = (refs.images || []).concat(refs.videos || []).map(r => {
    let sha = 'missing'; try { sha = crypto.createHash('sha256').update(fs.readFileSync(r.file)).digest('hex'); } catch {}
    return r.kind + '|' + r.name + '|' + sha;
  });
  return crypto.createHash('sha256').update(parts.join('\n')).digest('hex');
}
const hasLibraryRefs = refs => !!refs && ((refs.images || []).some(r => r.kind !== 'frame') || (refs.videos || []).length > 0);

function asList(v) { return v == null ? [] : (Array.isArray(v) ? v : [v]).map(String).filter(Boolean); }

// The screenplay convention: a character is written in capitals. Phrases of capital words, 2+ letters.
function capitalNames(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(/\b([A-Z][A-Z'\.]*(?:-[A-Z][A-Z'\.]*)*[A-Z'\.](?:\s+[A-Z][A-Z'\.\-]+){0,2})\b/g)) {
    const words = m[1].split(/\s+/).filter(w => !NOT_NAMES.has(w.replace(/\.$/, '')));
    if (!words.length) continue;
    const phrase = m[1].replace(/\.$/, '');
    if (words.every(w => w.length < 2)) continue;
    if (NOT_NAMES.has(phrase)) continue;
    out.add(phrase);
  }
  return [...out];
}

function mentions(text, item) {
  const t = ' ' + norm(text) + ' ';
  return [item.key].concat(item.aliases).some(n => n && new RegExp('(^|[^a-z0-9])' + esc(n) + '([^a-z0-9]|$)').test(t));
}

// What one panel needs and what the library gives it.
function panelNeeds(panel, words, lib) {
  const found = [];     // { kind, name, item }
  const missing = [];   // { kind, name, why }
  const clashes = [];   // { kind, name, sources } — two different pictures share the name: a person decides
  const byKind = k => lib.items.filter(i => i.kind === k);
  const explicit = { characters: asList(panel.characters), locations: asList(panel.location || panel.locations), wardrobe: asList(panel.wardrobe), props: asList(panel.props) };
  for (const kind of ['characters', 'wardrobe', 'locations', 'props']) {
    const seen = new Set();
    for (const want of explicit[kind]) {
      const hit = byKind(kind).find(i => i.key === norm(want) || i.aliases.includes(norm(want)));
      if (hit) { if (!seen.has(hit.key)) { found.push({ kind, name: hit.name, item: hit }); seen.add(hit.key); } }
      else missing.push({ kind, name: want, why: 'named on the storyboard, no reference in the library' });
    }
    for (const it of byKind(kind)) if (!seen.has(it.key) && mentions(words, it)) { found.push({ kind, name: it.name, item: it }); seen.add(it.key); }
  }
  // Characters in capitals that nothing in the library covers.
  const covered = found.filter(f => f.kind === 'characters').flatMap(f => [f.item.key].concat(f.item.aliases));
  for (const cap of capitalNames(words)) {
    const n = norm(cap);
    if (covered.some(c => c === n || n.includes(c) || c.includes(n))) continue;
    if (missing.some(m => norm(m.name) === n)) continue;
    missing.push({ kind: 'characters', name: cap, why: 'in the script in capitals, no reference in the library' });
  }
  // Motion: by panel id, by scene, or by name in the words.
  const motion = byKind('motion').filter(i => i.key === norm(panel.id) || (panel.scene != null && (i.key === 'scene ' + String(panel.scene) || i.key === 's' + String(panel.scene))) || mentions(words, i));
  for (const m of motion) found.push({ kind: 'motion', name: m.name, item: m });
  // A clashing item is never attached: which picture is meant is a person's call.
  for (let i = found.length - 1; i >= 0; i--) if (found[i].item.clash) { clashes.push({ kind: found[i].kind, name: found[i].name, sources: found[i].item.clash }); found.splice(i, 1); }
  return { found, missing, clashes };
}

// The reference list one generation request carries, in the order the prompt names them.
function attach(framePath, found) {
  const images = [{ kind: 'frame', name: 'storyboard frame', file: fwd(framePath) }];
  const videos = [];
  for (const kind of ['characters', 'locations', 'wardrobe', 'props']) {
    let n = 0;
    for (const f of found.filter(x => x.kind === kind)) {
      if (n >= PER_KIND[kind] || images.length >= LIMITS.image) break;
      if (!f.item.images.length) continue;
      images.push({ kind, name: f.name, file: f.item.images[0] }); n++;
      if (kind === 'characters' && f.item.images[1] && images.length < LIMITS.image && found.filter(x => x.kind === 'characters').length <= 2) images.push({ kind, name: f.name, file: f.item.images[1] });
    }
  }
  for (const f of found.filter(x => x.kind === 'motion')) {
    for (const v of f.item.videos) { if (videos.length >= LIMITS.video) break; videos.push({ kind: 'motion', name: f.name, file: v }); }
  }
  return { images, videos };
}

// The sentence that tells the model what each attached reference is for.
function legend(refs) {
  const role = { frame: 'the storyboard frame, for composition and framing', characters: 'keep this face, build and hair', locations: 'this is the place', wardrobe: 'this is the costume', props: 'this object, exactly as shown' };
  const parts = refs.images.map((r, i) => '[Image ' + (i + 1) + '] ' + (r.kind === 'frame' ? role.frame : r.name + ' (' + r.kind.replace(/s$/, '') + '): ' + role[r.kind]));
  refs.videos.forEach((r, i) => parts.push('[Video ' + (i + 1) + '] ' + r.name + ': follow this camera move and timing'));
  return parts.length ? 'References: ' + parts.join('; ') + '.' : '';
}

const scopeOf = job => ({ title: job.title || null, jobId: job.jobId || null, driveFolder: job.driveFolder || null });

module.exports = { KINDS, KIND_WORDS, LIMITS, kindOf, libraryRoot, scanLibrary, scopeOf, panelNeeds, attach, legend, refsHash, hasLibraryRefs, capitalNames };
