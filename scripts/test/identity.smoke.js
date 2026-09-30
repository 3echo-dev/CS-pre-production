#!/usr/bin/env node
// The plugin is cs-pre-production and nothing in it still points at the social pipeline's root
// variable, config dir or manifest names. A leftover SOCIAL_PIPELINE_ROOT would send a run's
// work to a folder nobody is watching.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const readJson = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

const plugin = readJson('.claude-plugin/plugin.json');
assert.strictEqual(plugin.name, 'cs-pre-production', 'plugin.json name');
assert.strictEqual(plugin.displayName, 'CS Pre-production', 'displayName');
const market = readJson('.claude-plugin/marketplace.json');
assert.ok(market.plugins.some(p => p.name === 'cs-pre-production'), 'marketplace lists cs-pre-production');
assert.ok(!market.plugins.some(p => p.name === 'social-pipeline'), 'marketplace no longer lists social-pipeline');

const ws = require('../lib-workspace.js');
assert.strictEqual(ws.CONFIG_DIR, '.creative-studio-pipeline', 'config dir');

// Walk every text file in the plugin, skipping the test outputs and this test.
const SKIP_DIRS = new Set(['.git', 'node_modules', '.out', '__pycache__']);
const TEXT = /\.(js|mjs|py|md|json|yaml|yml|html|txt|csv)$/i;
// A leftover root variable or the social pipeline's plugin name would misdirect a run; those are
// forbidden everywhere. The `.social-pipeline` config-dir string is different: the sibling guard
// (ws.foreignOwner) names it on purpose, to step aside in a Social Pipeline folder rather than
// adopt one. So that one pattern is allowed in the two files that hold the guard, and our own
// config dir stays pinned by the CONFIG_DIR assertion above.
const BAD_ALL = [/SOCIAL_PIPELINE_ROOT/, /"name":\s*"social-pipeline"/];
const BAD_CONFIG = /\.social-pipeline\b/;
const SIBLING_GUARD_FILES = new Set(['scripts/lib-workspace.js', 'scripts/test/sibling-yield.smoke.js']);
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
    for (const re of BAD_ALL) if (re.test(text)) hits.push(rel + ': ' + re.source);
    if (!SIBLING_GUARD_FILES.has(rel) && BAD_CONFIG.test(text)) hits.push(rel + ': ' + BAD_CONFIG.source);
  }
}
walk(ROOT);
assert.deepStrictEqual(hits, [], 'social pipeline identity left behind:\n  ' + hits.join('\n  '));

// A negative control: the checker must catch the pattern when it is present.
const probe = path.join(__dirname, '.out', 'identity-probe.js');
fs.mkdirSync(path.dirname(probe), { recursive: true });
fs.writeFileSync(probe, '// SOCIAL_PIPELINE_ROOT\n');
assert.ok(BAD_ALL[0].test(fs.readFileSync(probe, 'utf8')), 'control: the pattern is detectable');
fs.rmSync(path.dirname(probe), { recursive: true, force: true });

console.log('ok   plugin identity is cs-pre-production and no social root or config dir remains');
console.log('identity verification passed');
