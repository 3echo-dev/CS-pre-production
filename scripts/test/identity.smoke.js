#!/usr/bin/env node
// The plugin is creative-studio-pipeline and nothing in it still points at the social pipeline's root
// variable, config dir or manifest names. A leftover SOCIAL_PIPELINE_ROOT would send a run's
// work to a folder nobody is watching.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const readJson = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

const plugin = readJson('.claude-plugin/plugin.json');
assert.strictEqual(plugin.name, 'creative-studio-pipeline', 'plugin.json name');
assert.strictEqual(plugin.displayName, 'Creative Studio Pipeline', 'displayName');
const market = readJson('.claude-plugin/marketplace.json');
assert.ok(market.plugins.some(p => p.name === 'creative-studio-pipeline'), 'marketplace lists creative-studio-pipeline');
assert.ok(!market.plugins.some(p => p.name === 'social-pipeline'), 'marketplace no longer lists social-pipeline');

const ws = require('../lib-workspace.js');
assert.strictEqual(ws.CONFIG_DIR, '.creative-studio-pipeline', 'config dir');

// Walk every text file in the plugin, skipping the test outputs and this test.
const SKIP_DIRS = new Set(['.git', 'node_modules', '.out', '__pycache__']);
const TEXT = /\.(js|mjs|py|md|json|yaml|yml|html|txt|csv)$/i;
const BAD = [/SOCIAL_PIPELINE_ROOT/, /\.social-pipeline\b/, /"name":\s*"social-pipeline"/];
const hits = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = path.join(dir, name);
    const st = fs.statSync(abs);
    if (st.isDirectory()) { walk(abs); continue; }
    if (!TEXT.test(name)) continue;
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    if (rel === 'scripts/test/identity.smoke.js' || rel === 'docs/THIRD_PARTY_SOURCES.md' || rel === 'docs/ATTRIBUTION.md' || rel === 'docs/BUILD-BRIEF.md') continue;
    const text = fs.readFileSync(abs, 'utf8');
    for (const re of BAD) if (re.test(text)) hits.push(rel + ': ' + re.source);
  }
}
walk(ROOT);
assert.deepStrictEqual(hits, [], 'social pipeline identity left behind:\n  ' + hits.join('\n  '));

// A negative control: the checker must catch the pattern when it is present.
const probe = path.join(__dirname, '.out', 'identity-probe.js');
fs.mkdirSync(path.dirname(probe), { recursive: true });
fs.writeFileSync(probe, '// SOCIAL_PIPELINE_ROOT\n');
assert.ok(BAD[0].test(fs.readFileSync(probe, 'utf8')), 'control: the pattern is detectable');
fs.rmSync(path.dirname(probe), { recursive: true, force: true });

console.log('ok   plugin identity is creative-studio-pipeline and no social root or config dir remains');
console.log('identity verification passed');
