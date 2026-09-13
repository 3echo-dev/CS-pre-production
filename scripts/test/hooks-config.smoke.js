#!/usr/bin/env node
// Every command hooks.json registers must point at a file that exists, and every module it
// names must load. A hook that names a missing script logs an error on every turn end and
// nothing else notices, which is exactly what happened when tokens.js was dropped in the
// fork and hooks.json still named it.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'hooks', 'hooks.json'), 'utf8'));

const missing = [];
for (const mod of cfg.modules || []) {
  const p = path.join(ROOT, 'hooks', mod);
  if (!fs.existsSync(p)) missing.push('module ' + mod);
}
const events = Object.keys(cfg.hooks || {});
assert.ok(events.length >= 3, 'hooks.json registers at least three events, got ' + events.join(', '));
let commands = 0;
for (const ev of events) {
  for (const group of cfg.hooks[ev]) {
    assert.ok(Array.isArray(group.hooks) && group.hooks.length, ev + ' has an empty hook group');
    for (const h of group.hooks) {
      commands++;
      const m = String(h.command || '').match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"' ]+)/);
      if (!m) { missing.push(ev + ': command does not use ${CLAUDE_PLUGIN_ROOT}: ' + h.command); continue; }
      if (!fs.existsSync(path.join(ROOT, m[1]))) missing.push(ev + ': ' + m[1]);
    }
  }
}
assert.deepStrictEqual(missing, [], 'hooks.json names files that do not exist:\n  ' + missing.join('\n  '));

// The function-hook module parses and exports register().
(async () => {
  const mod = await import('file://' + path.join(ROOT, 'hooks', 'hooks.mjs').split(path.sep).join('/'));
  assert.strictEqual(typeof mod.register, 'function', 'hooks.mjs exports register');
  console.log('ok   ' + commands + ' hook commands resolve to files; hooks.mjs loads and exports register');
  console.log('hooks-config verification passed');
})().catch(e => { console.error(e.message); process.exit(1); });
