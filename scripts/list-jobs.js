#!/usr/bin/env node
// What is in progress, in words a person can act on.
//   node list-jobs.js [client] [--json] [--root <dir>]
// Exit 0 jobs listed · 3 nothing set up yet (so a caller can branch)
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');
const states = require('./lib-states.js');
const wording = require('./lib-wording.js');

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const only = ws.positionals(argv)[0];

function grab(txt, label) {
  const m = txt.match(new RegExp('\\*\\*' + label + ':\\*\\*\\s*`?([^`\\n]*)`?'));
  return m ? m[1].trim() : '';
}

let brands = ws.listClients();
if (only) brands = brands.filter(b => b === only);

const rows = [];
for (const b of brands) {
  for (const j of ws.listJobs(b)) {
    const f = path.join(ws.jobDir(b, j), 'status.md');
    let txt = '';
    try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const id = grab(txt, 'Current state');
    rows.push({
      client: b, brand: b, job: j, state: id, label: states.label(id), sentence: wording.sentence(id),
      isGate: states.isGate(id),
      updated: grab(txt, 'Last updated'),
      next: grab(txt, 'Next action'),
      blocked: grab(txt, 'Blocked on'),
    });
  }
}
rows.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));

if (json) {
  console.log(JSON.stringify({ root: ws.rootWithSource().path, clients: brands, brands, jobs: rows }, null, 2));
  process.exit(0);
}

if (!brands.length) {
  console.log('No clients set up yet.');
  process.exit(0);
}
if (!rows.length) {
  console.log('Clients: ' + brands.join(', ') + '. No projects started yet.');
  process.exit(0);
}

// A job waiting on the person comes first, because that is why they are looking.
const waiting = rows.filter(r => r.isGate);
const running = rows.filter(r => !r.isGate);
const width = Math.max(...rows.map(r => r.job.length));
// The sentence, never the id: this list is the first thing a person reads.
const line = r => '  ' + r.job.padEnd(width) + '  ' + wording.sentence(r.state);
if (waiting.length) { console.log('Waiting on you:'); for (const r of waiting) console.log(line(r)); }
if (running.length) { if (waiting.length) console.log(''); console.log('In progress:'); for (const r of running) console.log(line(r)); }
