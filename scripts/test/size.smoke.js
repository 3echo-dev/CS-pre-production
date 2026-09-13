#!/usr/bin/env node
// Every preloaded skill lands in a specialist's context in full, and every agent file is
// read on every spawn. Length is a running cost, so it is a build failure, not a style note.
//   node scripts/test/size.smoke.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BUDGET = { agent: 900, skill: 700 };

const words = file => fs.readFileSync(file, 'utf8').split(/\s+/).filter(Boolean).length;

const files = [];
for (const f of fs.readdirSync(path.join(ROOT, 'agents')).filter(f => f.endsWith('.md'))) {
  files.push({ rel: 'agents/' + f, kind: 'agent', abs: path.join(ROOT, 'agents', f) });
}
for (const d of fs.readdirSync(path.join(ROOT, 'skills'))) {
  const abs = path.join(ROOT, 'skills', d, 'SKILL.md');
  if (fs.existsSync(abs)) files.push({ rel: 'skills/' + d + '/SKILL.md', kind: 'skill', abs });
}

const over = [];
let total = 0;
for (const f of files) {
  const n = words(f.abs);
  total += n;
  if (n > BUDGET[f.kind]) over.push({ rel: f.rel, n, budget: BUDGET[f.kind] });
}

if (over.length) {
  console.error('over budget (' + BUDGET.agent + ' words per agent, ' + BUDGET.skill + ' per skill):');
  for (const o of over.sort((a, b) => b.n - a.n)) {
    console.error('  %s  %d words, %d over', o.rel, o.n, o.n - o.budget);
  }
  console.error('');
  console.error('Cut restatement, not rules. Numbers move to docs/sources, thresholds to a');
  console.error('playbook read at the stage that needs them, shared rules to docs/SHARED-RULES.md.');
  process.exit(1);
}

console.log('ok   %d agent and skill files inside budget, %d words in total', files.length, total);
