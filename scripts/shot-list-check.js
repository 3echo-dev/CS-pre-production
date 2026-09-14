#!/usr/bin/env node
// Every shot traces to a scene and a panel, and no shot id is reused.
//
//   node shot-list-check.js <client> <job-id> [--json]
//
// Reads shot-list.csv, the latest script/v{n}.md and the latest storyboard/v{n}/panels.md.
// A shot with no scene or no panel is an orphan and the whole list is refused: the breakdown
// and the call sheets are joins on exactly these two columns, and an orphan row becomes a
// row on a shoot day that nobody can place. Grouped labels such as 7/8 are fine: the label is
// for people, the shot_id is the key.
//
// Writes validation/shot-list-check.md. Exit 0 pass · 1 fail · 2 usage · 3 a file is missing
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const { brand: client, jobId, dir } = ws.resolveJobArgs(argv, argv);
if (!client || !jobId) { console.error('usage: shot-list-check.js <client> <job-id> [--json]'); process.exit(2); }

const latestDir = (root, wantFile) => {
  let vs = [];
  try { vs = fs.readdirSync(root).filter(f => /^v\d+(\.md)?$/.test(f)); } catch { return null; }
  const nums = vs.map(f => Number(f.replace(/^v/, '').replace(/\.md$/, ''))).filter(Number.isFinite).sort((a, b) => a - b);
  if (!nums.length) return null;
  const n = nums[nums.length - 1];
  const asFile = path.join(root, 'v' + n + '.md');
  const asDir = path.join(root, 'v' + n, wantFile || '');
  return fs.existsSync(asFile) ? asFile : (fs.existsSync(asDir) ? asDir : null);
};

const csvPath = path.join(dir, 'shot-list.csv');
const scriptPath = latestDir(path.join(dir, 'script'));
const panelsPath = latestDir(path.join(dir, 'storyboard'), 'panels.md');
for (const [p, what] of [[csvPath, 'shot-list.csv'], [scriptPath, 'a script version'], [panelsPath, 'a storyboard panels.md']]) {
  if (!p || !fs.existsSync(p)) { console.error('Missing ' + what + ' under ' + ws.fwd(dir)); process.exit(3); }
}

// Scenes are headings like "**4. INT. ..." or "SCENE 4" or "## Scene 4".
const scenes = new Set();
for (const line of fs.readFileSync(scriptPath, 'utf8').split(/\r?\n/)) {
  // Two heading forms: the numeric kind ("**4. INT.", "SCENE 4", "## Scene 4") and the episode
  // scene id the script method writes ("E01-S1"), which the shot list references verbatim.
  const idm = line.match(/^\s*(?:\*\*|#+\s*)?(E\d{2}-S\d+)\b/i);
  if (idm) { scenes.add(idm[1].toUpperCase()); continue; }
  const m = line.match(/^\s*(?:\*\*|#+\s*)?(?:scene\s+)?(\d+)[.:)\s]/i) || line.match(/^\s*(?:#+\s*)?scene\s+(\d+)/i);
  if (m) scenes.add(String(Number(m[1])));
}
const panels = new Set();
for (const line of fs.readFileSync(panelsPath, 'utf8').split(/\r?\n/)) {
  if (!line.trim().startsWith('|')) continue;
  const first = line.split('|').slice(1, -1).map(c => c.trim())[0] || '';
  if (/^P\d{2,}$/i.test(first)) panels.add(first.toUpperCase());
}

function parseCsv(text) {
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const cells = []; let cur = '', q = false;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (q) { if (c === '"' && raw[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === ',') { cells.push(cur); cur = ''; } else cur += c;
    }
    cells.push(cur);
    rows.push(cells.map(c => c.trim()));
  }
  return rows;
}
const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
const header = rows.shift() || [];
const col = name => header.indexOf(name);
const problems = [];
for (const need of ['shot_id', 'scene', 'panel']) if (col(need) < 0) problems.push('shot-list.csv has no ' + need + ' column');
const seen = new Set();
let grouped = 0;
if (!problems.length) {
  rows.forEach((r, i) => {
    const line = i + 2;
    const rawScene = String(r[col('scene')] || '').trim();
    const id = r[col('shot_id')] || '', scene = /^E\d{2}-S\d+$/i.test(rawScene) ? rawScene.toUpperCase() : String(Number(rawScene)), panel = (r[col('panel')] || '').toUpperCase();
    const label = col('label') >= 0 ? r[col('label')] || '' : '';
    if (!id) problems.push('line ' + line + ': no shot_id');
    else if (seen.has(id)) problems.push('line ' + line + ': shot_id ' + id + ' is used twice');
    seen.add(id);
    if (!r[col('scene')] || !scenes.has(scene)) problems.push('line ' + line + ' (' + (id || '?') + '): scene "' + (r[col('scene')] || '') + '" is not in the script');
    if (!panel || !panels.has(panel)) problems.push('line ' + line + ' (' + (id || '?') + '): panel "' + (r[col('panel')] || '') + '" is not on the storyboard');
    if (/\//.test(label)) grouped++;
  });
}
const result = { valid: !problems.length, rows: rows.length, scenes: scenes.size, panels: panels.size, grouped, problems };
fs.mkdirSync(path.join(dir, 'validation'), { recursive: true });
fs.writeFileSync(path.join(dir, 'validation', 'shot-list-check.md'), [
  '# Shot list check', '',
  '- Rows: ' + rows.length, '- Scenes in script: ' + scenes.size, '- Panels on board: ' + panels.size, '- Grouped labels: ' + grouped, '',
  problems.length ? '## Problems\n\n' + problems.map(p => '- ' + p).join('\n') : 'No problems. Every shot traces to a scene and a panel.', '',
].join('\n'));
if (json) console.log(JSON.stringify(result, null, 2));
else {
  for (const p of problems) console.error('PROBLEM: ' + p);
  console.log(problems.length ? 'The shot list is refused: ' + problems.length + ' problem' + (problems.length === 1 ? '' : 's') + '.' : 'ok: ' + rows.length + ' shots, 0 orphans, ' + grouped + ' grouped label' + (grouped === 1 ? '' : 's') + ' preserved.');
}
process.exit(problems.length ? 1 : 0);
