#!/usr/bin/env node
// Every agent and skill must carry frontmatter that a strict YAML parser accepts.
//
// This exists because of a real failure: several descriptions were written as unquoted
// scalars containing ": ", which YAML reads as a nested mapping. Claude Code tolerated it
// and the plugin worked locally; Cowork's stricter parser rejected the files, and a single
// bad one made the whole plugin fail to load, so even valid commands came back "Unknown
// command". Node has no bundled YAML parser, so this checks the shapes that actually break.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const files = [];
for (const f of fs.readdirSync(path.join(ROOT, 'agents'))) {
  if (f.endsWith('.md')) files.push({ file: path.join(ROOT, 'agents', f), expect: f.replace(/\.md$/, '') });
}
for (const d of fs.readdirSync(path.join(ROOT, 'skills'))) {
  const p = path.join(ROOT, 'skills', d, 'SKILL.md');
  if (fs.existsSync(p)) files.push({ file: p, expect: d });
}

const problems = [];
for (const { file, expect } of files) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) { problems.push(rel + ': no frontmatter block'); continue; }

  const lines = m[1].split('\n');
  const keys = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || /^\s/.test(line)) continue;          // blank or nested
    const kv = line.match(/^([A-Za-z0-9_-]+):(.*)$/);
    if (!kv) { problems.push(rel + ': line ' + (i + 2) + ' is not a key: ' + JSON.stringify(line)); continue; }
    const key = kv[1];
    const value = kv[2].trim();
    keys[key] = value;

    if (value === '' || value === '>' || value === '|' || value === '>-' || value === '|-') continue;
    const quoted = (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
    const bracketed = value.startsWith('[') && value.endsWith(']');
    // ": " inside a bare scalar is the exact shape that makes YAML see a nested mapping.
    if (!quoted && !bracketed && / : |: /.test(value)) {
      problems.push(rel + ': "' + key + '" is a bare scalar containing ": ", which strict YAML rejects. ' +
        'Use a folded block (' + key + ': >-) or quote it.');
    }
  }

  if (!keys.name) problems.push(rel + ': missing name');
  else if (keys.name.replace(/^["']|["']$/g, '') !== expect)
    problems.push(rel + ': name is "' + keys.name + '" but the path says "' + expect + '"');
  if (!('description' in keys)) problems.push(rel + ': missing description');
}

if (problems.length) {
  for (const p of problems) console.error('  x ' + p);
  assert.fail(problems.length + ' frontmatter problem(s). A single one stops the whole plugin loading in Cowork.');
}
console.log('ok   all ' + files.length + ' agent and skill frontmatter blocks are strict-YAML safe');
