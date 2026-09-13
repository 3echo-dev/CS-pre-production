#!/usr/bin/env node
// No leftover social skin: the instruction files a director reads must not mention the
// platforms, roles or artifacts of the pipeline this kernel came from. A director told to
// write a caption for TikTok would do it.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DIRS = ['agents', 'skills', 'workflows', 'platform-rules', 'playbooks', 'templates'];
const WORDS = ['tiktok', 'instagram', 'facebook', 'caption', 'hashtag', 'media-buyer', 'copywriter'];
const RE = new RegExp('\\b(' + WORDS.join('|') + ')\\b', 'i');

const hits = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (fs.statSync(abs).isDirectory()) { walk(abs); continue; }
    if (!/\.(md|json|csv|yaml|yml|txt)$/i.test(name)) continue;
    const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
    lines.forEach((l, i) => { const m = l.match(RE); if (m) hits.push(path.relative(ROOT, abs).split(path.sep).join('/') + ':' + (i + 1) + ' ' + m[1]); });
  }
}
for (const d of DIRS) walk(path.join(ROOT, d));
assert.deepStrictEqual(hits, [], 'social words left in instruction files:\n  ' + hits.join('\n  '));

// Control: the pattern fires on a known positive.
assert.ok(RE.test('write the caption for tiktok'), 'control: detector fires');
assert.ok(!RE.test('the call sheet for day 2'), 'control: detector is quiet on 1-22 text');

console.log('ok   no social skin words in ' + DIRS.filter(d => fs.existsSync(path.join(ROOT, d))).join(', '));
console.log('no-social verification passed');
