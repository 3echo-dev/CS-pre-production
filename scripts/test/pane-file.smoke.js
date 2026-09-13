#!/usr/bin/env node
// The fallback that keeps the workspace inside the app. A desktop session without the
// Browser pane tools used to print the https link, and the click opened the system browser.
// pane-file.js has to keep the interactive page embedded inside the local Preview file.
//
// It also checks that no skill, agent or shipped rule doc links the workspace host in chat.
//   node scripts/test/pane-file.smoke.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'pane-file.js');
const HOST = 'claude.ai/code/artifact';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pane-file-'));
fs.mkdirSync(path.join(tmp, 'workspaces'), { recursive: true });

const url = 'https://' + HOST + '/1e397118-0000#/p/job-20260913-1030-night-shift';
const run = spawnSync(process.execPath, [SCRIPT, 'job-20260913-1030-night-shift', url, '--root', tmp], {
  encoding: 'utf8',
});
assert.strictEqual(run.status, 0, 'pane-file.js failed: ' + (run.stderr || ''));

const printed = run.stdout.trim().split('\n').filter(Boolean);
assert.strictEqual(printed.length, 1, 'it prints the path and nothing else');
const file = printed[0];
assert.ok(fs.existsSync(file), 'the printed path exists: ' + file);
assert.ok(file.endsWith('.html'), 'it is an html file');
assert.ok(file.includes('/.pane/'), 'it lands in .pane/: ' + file);

const html = fs.readFileSync(file, 'utf8');
assert.ok(/<iframe\b/.test(html), 'it embeds the interactive page');
assert.ok(!/http-equiv="refresh"/.test(html), 'it has no meta refresh out of Preview');
assert.ok(!html.includes('location.replace'), 'it does not navigate Preview to the web address');
assert.ok(html.includes('job-20260913-1030-night-shift'), 'the url is in the page');
assert.ok(html.includes('1-22 Control board'), 'the embedded page has an accessible title');

// Bad input is refused rather than writing a page that redirects nowhere.
const bad = spawnSync(process.execPath, [SCRIPT, 'home', 'not-a-url', '--root', tmp], { encoding: 'utf8' });
assert.notStrictEqual(bad.status, 0, 'a url without a scheme is refused');

fs.rmSync(tmp, { recursive: true, force: true });

// Nothing a model reads at runtime may hand the person the web address to click. The
// connector setup lines in CONFIG.md and README.md are for a human at a terminal, not a link.
const checked = [];
const walk = dir => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs);
    else if (e.name.endsWith('.md')) checked.push(abs);
  }
};
for (const d of ['skills', 'agents', 'workflows']) walk(path.join(ROOT, d));
checked.push(path.join(ROOT, 'docs', 'SHARED-RULES.md'), path.join(ROOT, 'docs', 'STAGES.md'));

const offenders = [];
for (const abs of checked) {
  const text = fs.readFileSync(abs, 'utf8');
  if (text.includes(HOST)) offenders.push(path.relative(ROOT, abs).split(path.sep).join('/'));
}
assert.deepStrictEqual(offenders, [],
  'the board address belongs in lib-board.js and the workspace config only, never where a model\n' +
  'might print it as a link. Print the pane-file.js path instead:\n' + offenders.join('\n'));

console.log('ok   pane-file.js writes an embedded local page, and no runtime file links %s', HOST);
