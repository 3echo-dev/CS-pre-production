#!/usr/bin/env node
// Every registry entry points at a file that exists, every agent file is inside its word
// budget, its frontmatter is strict-YAML safe, and its skills: line names only skills the
// registry preloads for it. One missing file makes a spawn fail at run time with a message
// that names nothing useful, so this is checked here instead.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const readJson = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const agents = readJson('registry/agents.json').agents;
const skills = readJson('registry/skills.json').skills;
const workflows = readJson('registry/workflows.json').workflows;

const missing = [];
for (const agent of agents.filter(a => a.status === 'active')) {
  const file = path.join('agents', agent.agentId + '.md');
  if (!fs.existsSync(path.join(ROOT, file))) missing.push(file);
}
for (const skill of skills) {
  const file = path.join('skills', skill.skillId, 'SKILL.md');
  if (!fs.existsSync(path.join(ROOT, file))) missing.push(file);
}
for (const workflow of workflows.filter(w => w.status === 'active')) {
  if (!workflow.file || !fs.existsSync(path.join(ROOT, workflow.file))) {
    missing.push(workflow.file || 'workflow file for ' + workflow.workflowId);
  }
}
for (const name of ['job', 'route', 'brief', 'approval']) {
  const file = path.join('schemas', name + '.schema.json');
  if (!fs.existsSync(path.join(ROOT, file))) missing.push(file);
}
assert.deepStrictEqual(missing, [], 'registered or planned files missing:\n' + missing.join('\n'));

// The eleven seats, by name.
const EXPECTED = ['orchestrator', 'intake-director', 'reference-scout', 'script-director', 'storyboard-director',
  'shot-list-director', 'production-planner', 'audio-supervisor', 'logistics-registrar', 'breakdown-compiler', 'call-sheet-builder'];
const active = agents.filter(a => a.status === 'active').map(a => a.agentId);
assert.deepStrictEqual([...active].sort(), [...EXPECTED].sort(), 'the eleven active agents');
const owner = agents.find(a => (a.ownerForKinds || []).includes('preproduction'));
assert.ok(owner && owner.agentId === 'orchestrator', 'orchestrator owns preproduction');

// Every agent on disk is registered, and every agent's skills: line is a subset of what the
// registry preloads for it.
const onDisk = fs.readdirSync(path.join(ROOT, 'agents')).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''));
assert.deepStrictEqual(onDisk.filter(a => !active.includes(a)), [], 'agent files with no registry entry');
const preloaded = id => skills.filter(s => (s.preloadedBy || []).includes(id)).map(s => s.skillId);
const skillIds = new Set(skills.map(s => s.skillId));
const problems = [];
for (const id of active) {
  const text = fs.readFileSync(path.join(ROOT, 'agents', id + '.md'), 'utf8');
  const fm = (text.match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] || '';
  const line = (fm.match(/^skills:\s*(.*)$/m) || [])[1];
  const listed = line ? line.split(',').map(s => s.trim()).filter(Boolean) : [];
  for (const s of listed) {
    if (!skillIds.has(s)) problems.push(id + ' lists unknown skill ' + s);
    else if (!preloaded(id).includes(s)) problems.push(id + ' lists ' + s + ' but registry does not preload it for ' + id);
  }
  if (id !== 'orchestrator' && !/^disallowedTools:.*\bAgent\b/m.test(fm)) problems.push(id + ' must set disallowedTools: Agent');
  if (id !== 'orchestrator' && /mcp__/i.test(fm)) problems.push(id + ' names an MCP tool');
}
assert.deepStrictEqual(problems, [], 'agent frontmatter problems:\n  ' + problems.join('\n  '));

// The workflow table names only agents that exist (or a script or board row).
const table = fs.readFileSync(path.join(ROOT, 'workflows', '1-22.md'), 'utf8').split(/\r?\n/);
const cells = l => l.split('|').slice(1, -1).map(c => c.trim());
const head = cells(table.find(l => l.trim().startsWith('|') && cells(l).includes('Agent')));
const agentCol = head.indexOf('Agent');
const unknownAgents = [];
let seenRows = false;
for (const line of table) {
  if (!line.trim().startsWith('|')) { if (seenRows) break; continue; }
  const c = cells(line);
  if (!c.includes('Agent') && !c.every(x => /^:?-+:?$/.test(x))) seenRows = true;
  if (c.includes('Agent') || c.every(x => /^:?-+:?$/.test(x))) continue;
  const a = c[agentCol];
  if (!['scripts', 'board', 'human', '-'].includes(a) && !active.includes(a)) unknownAgents.push(c[0] + ': ' + a);
}
assert.deepStrictEqual(unknownAgents, [], 'workflow rows naming unknown agents');

console.log('ok   every active component exists, eleven seats registered, skills lines match the registry');
console.log('structure verification passed');
