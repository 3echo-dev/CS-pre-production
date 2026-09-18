#!/usr/bin/env node
// Scaffold one client workspace in a single call.
//   node scaffold-client.js <client-slug> [display name]
// Reads templates from the plugin, writes into the chosen root: workspace.json, client/ (the
// scraper site list and the client's templates), jobs/, and inputs/<client>/ for Drive pulls.
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');
const guards = require('./lib-guards.js');

const argv = process.argv.slice(2);
const pos = ws.positionals(argv);
const slug = (pos[0] || '').trim();
if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  console.error('usage: scaffold-client.js <client-slug> [display name]   (slug: lowercase, hyphens)');
  process.exit(2);
}
const name = (pos.slice(1).join(' ') || slug).trim();
const dest = ws.wsDir(slug, argv);
if (fs.existsSync(dest)) {
  console.error('REFUSED: ' + ws.fwd(dest) + ' already exists. Edit it rather than overwriting.');
  process.exit(1);
}
const T = path.join(__dirname, '..', 'templates');
const today = ws.now(slug, argv).slice(0, 10);

for (const d of [ws.inputsDir(slug, argv), dest, path.join(dest, 'client'), path.join(dest, 'client', 'templates'), path.join(dest, 'jobs')]) {
  fs.mkdirSync(d, { recursive: true });
}
const fill = s => s.split('{client}').join(slug).split('{brand}').join(slug)
  .split('{Client Name}').join(name).split('{Brand Name}').join(name).split('YYYY-MM-DD').join(today);

// workspace.json from the template when it parses; a complete built-in otherwise, so a
// client can be opened while the templates are mid-edit and the file always parses.
let wsJson = null;
try { wsJson = JSON.parse(fill(fs.readFileSync(path.join(T, 'workspace.json'), 'utf8'))); } catch { wsJson = null; }
const base = {
  schemaVersion: '1.0', client: slug, name, status: 'active', timezone: 'Asia/Singapore',
  approvers: { creative: 'creative-director', logistics: 'assistant', release: 'lead' },
  sites: [],
  // Five, not four: the shot list's client columns come from shot-list.xlsx (workflow row 1d),
  // and an onboarding that never asked for it left every client short one template.
  templates: { shotList: 'client/templates/shot-list.xlsx', budget: 'client/templates/budget.xlsx', timeline: 'client/templates/timeline.xlsx', breakdown: 'client/templates/breakdown.xlsx', callSheet: 'client/templates/call-sheet.xlsx' },
  createdAt: today,
};
const cfg = { ...base, ...(wsJson || {}), client: slug, name };
delete cfg.brand;
if (!cfg.status) cfg.status = 'active';
fs.writeFileSync(path.join(dest, 'workspace.json'), JSON.stringify(cfg, null, 2) + '\n');

fs.writeFileSync(path.join(dest, 'client', 'sites.md'), [
  '# Scraper sites for ' + name, '',
  'One line per site the reference scout may search, in the words the client gave. A site not on this',
  'list is never searched. Empty means the pipeline asks where to research before the scout runs.', '',
  '| Site | URL | Notes |', '|---|---|---|', '',
].join('\n'));
fs.writeFileSync(path.join(dest, 'client', 'templates', 'README.md'), [
  '# Templates for ' + name, '',
  "Drop the client's blank files here, named exactly: shot-list.xlsx, budget.xlsx, timeline.xlsx, breakdown.xlsx, call-sheet.xlsx.",
  "Blank means the header block only. A finished job's workbook is not a template: it is the answers, and a",
  'filled call sheet carries phone numbers into every job. Strip one with',
  '  python "${CLAUDE_PLUGIN_ROOT}/scripts/strip-template.py" <workbook> --out <template> --sheet <name> --header <row>',
  'and read the cells it kept. Then',
  '  node "${CLAUDE_PLUGIN_ROOT}/scripts/template-check.js" ' + slug,
  'says whether all five are here and empty; the orchestrator runs it before every row that copies one.',
  'The planners and builders refuse to invent a template; a missing one is a question on the board.', '',
].join('\n'));

console.log('ready: ' + ws.fwd(dest) + '/  (workspace.json, client/sites.md, client/templates/, jobs/)');
console.log('inputs: ' + ws.fwd(ws.inputsDir(slug, argv)) + '/  Drive pulls land here, one folder per project');

// A first client is the moment this folder is unambiguously the pipeline's, so it is the
// moment to arm the guards. Somebody who never runs set-root.js still gets the refusals.
console.log(guards.sentence(guards.arm(process.cwd()), ws.fwd));
