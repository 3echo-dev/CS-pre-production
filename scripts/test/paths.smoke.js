#!/usr/bin/env node
// The workspace folder is the person's own, and it often has a space in it:
// "Desktop/social media pipeline". An unquoted path in an instruction splits at that space
// and the script is handed two arguments it cannot use, which shows up as a confusing
// "job not found" rather than as a quoting bug. So every path an instruction hands to a
// shell has to be quoted, and this checks that instead of trusting each author to remember.
//   node scripts/test/paths.smoke.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const files = [];
const walk = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs);
    else if (entry.name.endsWith('.md')) files.push(abs);
  }
};
for (const d of ['skills', 'agents', 'workflows']) walk(path.join(ROOT, d));

// A command is a node/python invocation, whether it is in a fenced block or inline in
// backticks. Its arguments are what we check.
const COMMAND = /\b(?:node|python3?|bash|sh)\s+([^\n`]+)/g;
// An argument that names a path: it has a slash, or it is a plugin-root reference.
const looksLikePath = a => a.includes('/') || a.includes('${CLAUDE_PLUGIN_ROOT}');
const quoted = a => (a.startsWith('"') && a.endsWith('"')) || (a.startsWith("'") && a.endsWith("'"));

const bad = [];
for (const abs of files) {
  const text = fs.readFileSync(abs, 'utf8');
  const rel = path.relative(ROOT, abs).split(path.sep).join('/');
  for (const line of text.split('\n')) {
    COMMAND.lastIndex = 0;
    let m;
    while ((m = COMMAND.exec(line))) {
      // Split on spaces the shell would split on, keeping quoted runs together.
      const args = m[1].match(/"[^"]*"|'[^']*'|\S+/g) || [];
      for (const a of args) {
        if (a.startsWith('--') || a.startsWith('<') || a.startsWith('[')) continue;
        if (!looksLikePath(a)) continue;
        if (quoted(a)) continue;
        bad.push({ rel, arg: a, line: line.trim() });
      }
    }
  }
}

if (bad.length) {
  console.error('unquoted paths, which break on a workspace folder with a space in its name:');
  for (const b of bad) console.error('  %s  %s\n    %s', b.rel, b.arg, b.line);
  process.exit(1);
}
console.log('ok   every path handed to a shell in %d instruction files is quoted', files.length);
