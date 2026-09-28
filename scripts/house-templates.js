#!/usr/bin/env node
// Put the plugin's generic house templates into a client's templates folder.
//
//   node house-templates.js <client>              copy each house template the client does not have yet
//   node house-templates.js <client> --replace budget,timeline   also overwrite those (the client's copy is kept as .bak)
//   node house-templates.js <client> --list       say which templates are the client's own and which are house
//
// The house templates live in templates/house/: shot-list.xlsx, budget.xlsx, timeline.xlsx (twelve
// calendar months) and storyboard.pptx (three panels a slide). They are generic: layout, labels,
// formulas and dropdowns only; no studio, client or crew name, no logo, no sample figures. A
// client's own file always wins: it is never overwritten without --replace. The breakdown and
// the call sheet have no house version; those stay the client's to supply.
//
// scaffold-client.js runs this for every new client. Each copy gets a .source.json saying it
// is the house default, so template-check.js can tell a house file from the client's own.
//
// Exit 0 done · 2 usage · 3 the client is not onboarded
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ws = require('./lib-workspace.js');

const HOUSE = path.join(__dirname, '..', 'templates', 'house');
const FILES = { shotList: 'shot-list.xlsx', budget: 'budget.xlsx', timeline: 'timeline.xlsx', storyboard: 'storyboard.pptx' };
const ALIAS = { 'shot-list': 'shotList', shot_list: 'shotList', shotlist: 'shotList', budget: 'budget', budget_sheet: 'budget', timeline: 'timeline', storyboard: 'storyboard' };

const argv = process.argv.slice(2);
const client = ws.positionals(argv)[0];
if (!client) { console.error('usage: house-templates.js <client> [--replace budget,timeline] [--list]'); process.exit(2); }
const dir = ws.wsDir(client, argv);
if (!fs.existsSync(path.join(dir, 'workspace.json'))) { console.error('No client ' + client + '. Onboard the client first.'); process.exit(3); }
const tdir = path.join(dir, 'client', 'templates');
fs.mkdirSync(tdir, { recursive: true });
const i = argv.indexOf('--replace');
const replace = new Set(i >= 0 && argv[i + 1] ? argv[i + 1].split(',').map(s => ALIAS[s.trim()] || s.trim()) : []);
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const isHouse = f => { try { return JSON.parse(fs.readFileSync(f + '.source.json', 'utf8')).source === 'house'; } catch { return false; } };

if (argv.includes('--list')) {
  for (const [key, file] of Object.entries(FILES)) {
    const f = path.join(tdir, file);
    console.log(file.padEnd(18) + (!fs.existsSync(f) ? 'missing' : isHouse(f) ? 'house default' : "client's own"));
  }
  process.exit(0);
}

const done = [];
for (const [key, file] of Object.entries(FILES)) {
  const src = path.join(HOUSE, file);
  const dst = path.join(tdir, file);
  if (!fs.existsSync(src)) continue;
  if (fs.existsSync(dst) && !replace.has(key)) { done.push(file + ': kept (' + (isHouse(dst) ? 'house default' : "client's own") + ')'); continue; }
  if (fs.existsSync(dst) && !isHouse(dst)) fs.copyFileSync(dst, dst + '.bak');
  fs.copyFileSync(src, dst);
  fs.writeFileSync(dst + '.source.json', JSON.stringify({ source: 'house', file, sha256: sha(dst), copiedAt: new Date().toISOString(), note: 'Generic house template from the plugin. Replace it with the client\'s own file when they send one.' }, null, 2) + '\n');
  done.push(file + ': house default ' + (replace.has(key) ? 'installed over the previous copy (kept as ' + file + '.bak)' : 'installed'));
}
console.log(done.join('\n'));
