#!/usr/bin/env node
// The depth lives in files read at the stage, not preloaded: every director that owns a craft
// names a playbook that exists, every playbook ends with a checklist and a Sources line, the
// rubric covers every gate, and the review pass is wired into the workflow, the registry and
// the orchestrator. A director pointing at a playbook that is not there would read nothing
// and write from memory, which is the exact failure this pass exists to remove.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const PLAYBOOK_OF = {
  'intake-director': 'brief-method.md',
  'reference-scout': 'references-method.md',
  'script-director': 'script-method.md',
  'storyboard-director': 'storyboard-method.md',
  'shot-list-director': 'shot-list-rules.md',
  'production-planner': 'planning-rules.md',
  'audio-supervisor': 'audio-rules.md',
  'breakdown-compiler': 'breakdown-columns.md',
  'call-sheet-builder': 'call-sheet-rules.md',
};

const problems = [];

// 1. Every director names its playbook, and the playbook exists.
for (const [agent, pb] of Object.entries(PLAYBOOK_OF)) {
  const text = read('agents/' + agent + '.md');
  if (!text.includes('playbooks/' + pb)) problems.push(agent + ' does not name playbooks/' + pb);
  if (!/^## Method/m.test(text)) problems.push(agent + ' has no Method section');
  if (!fs.existsSync(path.join(ROOT, 'playbooks', pb))) problems.push('playbooks/' + pb + ' is missing');
}

// 2. Every method playbook ends with a checklist of at least six items and a Sources line.
for (const pb of new Set(Object.values(PLAYBOOK_OF))) {
  const p = path.join(ROOT, 'playbooks', pb);
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, 'utf8');
  const at = text.search(/^#{1,3} .*Checklist/im);
  if (at < 0) { problems.push(pb + ': no Checklist heading'); continue; }
  const tail = text.slice(at);
  const items = tail.split(/\r?\n/).filter(l => /^\s*(- \[ \]|- |\d+\.)\s+\S/.test(l)).length;
  if (items < 6) problems.push(pb + ': checklist has ' + items + ' items, needs at least 6');
  if (!/^(\*\*)?Sources(\*\*)?[:.]?\s/im.test(text) && !/^#{1,3} Sources/m.test(text)) problems.push(pb + ': no Sources line');
  if (/—/.test(text)) problems.push(pb + ': contains an em dash');
}

// 3. The rubric has at least five items per gate.
const rubric = read('playbooks/review-rubrics.md');
for (const g of ['A', 'B', 'C']) {
  const start = rubric.search(new RegExp('^## Gate ' + g + '\\b', 'm'));
  assert.ok(start >= 0, 'rubric has a Gate ' + g + ' section');
  const rest = rubric.slice(start + 1);
  const next = rest.search(/^## Gate /m);
  const section = next >= 0 ? rest.slice(0, next) : rest;
  const n = (section.match(new RegExp('^- ' + g + '\\d+\\.', 'gm')) || []).length;
  if (n < 5) problems.push('rubric Gate ' + g + ' has ' + n + ' items, needs at least 5');
}
if (/—/.test(rubric)) problems.push('review-rubrics.md contains an em dash');

// 4. The workflow has three review rows naming review-pass, one before each gate.
const wf = read('workflows/1-22.md').split(/\r?\n/).filter(l => l.startsWith('| '));
const cells = l => l.split('|').slice(1, -1).map(c => c.trim());
const head = cells(wf.find(l => cells(l).includes('Skills')));
const skillsCol = head.indexOf('Skills'), gateCol = head.indexOf('Gate'), stageCol = head.indexOf('Stage');
const reviewRows = wf.map(cells).filter(c => /review-pass/.test(c[skillsCol] || ''));
if (reviewRows.length !== 3) problems.push('workflow has ' + reviewRows.length + ' review rows, expected 3');
const rows = wf.map(cells).filter(c => c[0] && !/^:?-+:?$/.test(c[0]) && c[0] !== '#');
for (const g of ['A', 'B', 'C']) {
  const gi = rows.findIndex(c => (c[gateCol] || '') === g);
  if (gi < 1) { problems.push('no Gate ' + g + ' row'); continue; }
  if (!/review-pass/.test(rows[gi - 1][skillsCol] || '')) problems.push('the row before Gate ' + g + ' (' + rows[gi - 1][stageCol] + ') is not a review pass');
}

// 5. The skill exists and is registered; the orchestrator runs it.
if (!fs.existsSync(path.join(ROOT, 'skills', 'review-pass', 'SKILL.md'))) problems.push('skills/review-pass/SKILL.md is missing');
const reg = JSON.parse(read('registry/skills.json')).skills;
const entry = reg.find(s => s.skillId === 'review-pass');
if (!entry) problems.push('review-pass is not in registry/skills.json');
else if (!(entry.invokedBy || []).includes('orchestrator')) problems.push('review-pass is not invoked by the orchestrator in the registry');
const orch = read('agents/orchestrator.md');
if (!/review-pass/.test(orch)) problems.push('orchestrator.md does not mention review-pass');
if (!/review-rubrics\.md/.test(orch)) problems.push('orchestrator.md does not name the rubric');

assert.deepStrictEqual(problems, [], 'depth problems:\n  ' + problems.join('\n  '));
console.log('ok   ' + Object.keys(PLAYBOOK_OF).length + ' directors point at existing playbooks with checklists; rubric covers A, B, C; review pass wired before every gate');
console.log('depth verification passed');
