#!/usr/bin/env node
// May the reference scout be spawned? Only when the client's site list has at least one site,
// because the scout searches those sites and nowhere else. An empty roster means a question
// for the person ("where should the scout research?"), never a guess and never an empty board.
//
//   node sites-check.js <client> [--json]                    exit 0 with the sites, 1 when empty
//   node sites-check.js <client> --add "<site>" [--url u] [--note n]   append one row, in the person's words
//
// Exit 0 ok · 1 no sites yet · 2 usage · 3 client/sites.md missing
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null; };
const client = argv.find(a => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--add' && argv[argv.indexOf(a) - 1] !== '--url' && argv[argv.indexOf(a) - 1] !== '--note');
if (!client) { console.error('usage: sites-check.js <client> [--json] | --add "<site>" [--url <url>] [--note <text>]'); process.exit(2); }

const root = ws.root(argv);
const file = path.join(root, 'workspaces', client, 'client', 'sites.md');
if (!fs.existsSync(file)) { console.error('client/sites.md is missing for ' + client + '. Onboard the client first.'); process.exit(3); }

const rows = () => fs.readFileSync(file, 'utf8').split(/\r?\n/)
  .filter(l => /^\|/.test(l) && !/^\|\s*Site\s*\|/i.test(l) && !/^\|\s*-/.test(l))
  .map(l => l.split('|').slice(1, -1).map(c => c.trim()))
  .filter(c => c[0]);

const add = flag('--add');
if (add) {
  const site = add.trim();
  if (!site) { console.error('--add needs the site in the person\'s words'); process.exit(2); }
  if (rows().some(r => r[0].toLowerCase() === site.toLowerCase())) { console.log(site + ' is already on the list.'); process.exit(0); }
  let text = fs.readFileSync(file, 'utf8');
  if (!/^\|\s*Site\s*\|/im.test(text)) text = text.replace(/\s*$/, '\n\n| Site | URL | Notes |\n|---|---|---|\n');
  if (!/\n$/.test(text)) text += '\n';
  text += '| ' + site.replace(/\|/g, '/') + ' | ' + (flag('--url') || '').replace(/\|/g, '/') + ' | ' + (flag('--note') || '').replace(/\|/g, '/') + ' |\n';
  fs.writeFileSync(file, text);
  console.log('Added ' + site + '. The scout may search ' + rows().length + ' site' + (rows().length === 1 ? '' : 's') + '.');
  process.exit(0);
}

const list = rows();
const result = { valid: list.length > 0, sites: list.map(r => ({ site: r[0], url: r[1] || '', notes: r[2] || '' })) };
if (json) console.log(JSON.stringify(result, null, 2));
else if (list.length) console.log('ok: the scout may search ' + list.length + ' site' + (list.length === 1 ? '' : 's') + ': ' + list.map(r => r[0]).join(', ') + '.');
else console.error('No sites yet. Ask the person where the scout should research; a site not named by them is never searched.');
process.exit(list.length ? 0 : 1);
