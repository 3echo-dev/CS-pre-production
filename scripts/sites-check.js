#!/usr/bin/env node
// May the reference scout be spawned? Only when the client's site list has at least one site,
// because the scout searches those sites and nowhere else. An empty roster means a question
// for the person ("where should the scout research?"), never a guess and never an empty board.
//
//   node sites-check.js <client> [--json]                              exit 0 with the sites, 1 when empty
//   node sites-check.js <client> --add "<site>" [--url u] [--note n]   append one row, in the person's words
//   node sites-check.js <client> --add "<a>" --add "<b>" ...           append several; --url and --note need a single --add
//   node sites-check.js <client> --from <file>                         land a sites/links file from the project folder
//
// Exit 0 ok · 1 no sites yet (or nothing in the file reads as a site) · 2 usage · 3 a file is missing
//
// `--add a --add b --add c` used to take the first, print "Added a. The scout may search 1 site."
// and exit 0, with b and c dropped without a word. Every --add is taken now, and the line says
// which sites were added, which were already there, and how many the scout may search.
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null; };
const VALS = new Set(['--add', '--url', '--note', '--from', '--root']);
const client = argv.find((a, i) => !a.startsWith('--') && !VALS.has(argv[i - 1]));
if (!client) { console.error('Nothing was changed. usage: sites-check.js <client> [--json] | --add "<site>" [--add "<site>" ...] [--url <url>] [--note <text>] | --from <file>'); process.exit(2); }

const root = ws.root(argv);
const file = path.join(root, 'workspaces', client, 'client', 'sites.md');
if (!fs.existsSync(file)) { console.error('client/sites.md is missing for ' + client + '. Onboard the client first.'); process.exit(3); }

const rows = () => fs.readFileSync(file, 'utf8').split(/\r?\n/)
  .filter(l => /^\|/.test(l) && !/^\|\s*Site\s*\|/i.test(l) && !/^\|\s*-/.test(l))
  .map(l => l.split('|').slice(1, -1).map(c => c.trim()))
  .filter(c => c[0]);
const cell = v => String(v || '').replace(/\|/g, '/');
function append(entries) {
  let text = fs.readFileSync(file, 'utf8');
  if (!/^\|\s*Site\s*\|/im.test(text)) text = text.replace(/\s*$/, '\n\n| Site | URL | Notes |\n|---|---|---|\n');
  if (!/\n$/.test(text)) text += '\n';
  for (const [site, url, note] of entries) text += '| ' + cell(site) + ' | ' + cell(url) + ' | ' + cell(note) + ' |\n';
  fs.writeFileSync(file, text);
}

if (argv.includes('--add')) {
  const sites = argv.map((a, i) => a === '--add' ? String(argv[i + 1] || '').trim() : null).filter(v => v !== null);
  if (sites.some(s => !s || s.startsWith('--'))) { console.error('Nothing was added. --add needs the site in the person\'s words, one site per --add.'); process.exit(2); }
  if (sites.length > 1 && (flag('--url') || flag('--note'))) { console.error('Nothing was added. --url and --note describe one site; with several --add flags they are ambiguous, so add that site on its own.'); process.exit(2); }
  const have = new Set(rows().map(r => r[0].toLowerCase()));
  const added = [], already = [];
  for (const site of sites) {
    if (have.has(site.toLowerCase())) { if (!already.includes(site)) already.push(site); continue; }
    have.add(site.toLowerCase()); added.push([site, flag('--url') || '', flag('--note') || '']);
  }
  if (added.length) append(added);
  const total = rows().length;
  const said = [];
  if (added.length) said.push('Added ' + added.length + ' site' + (added.length === 1 ? '' : 's') + ': ' + added.map(a => a[0]).join(', ') + '.');
  if (already.length) said.push(already.join(', ') + (already.length === 1 ? ' is' : ' are') + ' already on the list.');
  console.log(said.join(' ') + ' The scout may search ' + total + ' site' + (total === 1 ? '' : 's') + '.');
  process.exit(0);
}

const from = flag('--from');
if (from) {
  // A file the person put in the project folder: one site per line, a name and, where present, a
  // link. Headings, blank lines, table rules and a header row are skipped; the first URL on a line
  // is the URL; a line that is only a URL takes its host as the name.
  const src = path.resolve(from);
  if (!fs.existsSync(src)) { console.error('No such file: ' + from); process.exit(3); }
  const seen = new Set(rows().map(r => r[0].toLowerCase()));
  const before = seen.size;
  const added = [];
  for (let line of fs.readFileSync(src, 'utf8').split(/\r?\n/)) {
    line = line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').replace(/^\|/, '').replace(/\|$/, '').trim();
    if (!line || /^#/.test(line) || /^-{3,}/.test(line) || /^-+\s*\|/.test(line) || /^site\s*\|/i.test(line)) continue;
    const url = (line.match(/https?:\/\/\S+/) || [''])[0].replace(/[),.]+$/, '');
    let name = line.replace(url, '').replace(/\|/g, ' ').replace(/[\s:]+$/, '').replace(/^[\s:]+/, '').trim();
    if (!name && url) { try { name = new URL(url).hostname.replace(/^www\./, ''); } catch { name = url; } }
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase()); added.push([name, url, 'from ' + path.basename(src)]);
  }
  if (!added.length) { console.error('Nothing in ' + path.basename(src) + ' reads as a site.'); process.exit(1); }
  append(added);
  console.log('Took ' + added.length + ' site' + (added.length === 1 ? '' : 's') + ' from ' + path.basename(src) + ': ' + added.map(a => a[0]).join(', ') + '. The scout may search ' + (before + added.length) + '.');
  process.exit(0);
}

const list = rows();
const result = { valid: list.length > 0, sites: list.map(r => ({ site: r[0], url: r[1] || '', notes: r[2] || '' })) };
if (json) console.log(JSON.stringify(result, null, 2));
else if (list.length) console.log('ok: the scout may search ' + list.length + ' site' + (list.length === 1 ? '' : 's') + ': ' + list.map(r => r[0]).join(', ') + '.');
else console.error('No sites yet. Ask the person where the scout should research; a site not named by them is never searched.');
process.exit(list.length ? 0 : 1);
