#!/usr/bin/env node
// The board travels with the plugin and every account publishes its own copy: no address is
// baked into the scripts, set-board.js records one per workspace, and the page in board/ is
// the built one (source plus its base64 copy) declaring the two capabilities it needs.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SET = path.join(ROOT, 'scripts', 'set-board.js');
const page = fs.readFileSync(path.join(ROOT, 'board', '1-22-control.html'), 'utf8');

// 1. The page.
assert.ok(/<title>1-22 Control<\/title>/.test(page), 'the board page, as published');
assert.ok(page.includes("use('db')") && page.includes("use('artifact')") && page.includes("use('comments')"), 'uses the db, artifact and comments capabilities the setup skill declares');
assert.ok(/<script type="text\/plain" id="__src">[A-Za-z0-9+/=]+<\/script>/.test(page), 'built page carries its base64 source for the gate-lock republish');
assert.ok(page.length < 16 * 1024 * 1024, 'inside the artifact size limit');

// 2. No baked-in address anywhere in the scripts.
const lib = fs.readFileSync(path.join(ROOT, 'scripts', 'lib-board.js'), 'utf8');
assert.ok(!/claude\.ai\/code\/artifact\/[0-9a-f-]{36}/.test(lib), 'lib-board.js names no artifact');
for (const f of fs.readdirSync(path.join(ROOT, 'scripts')).filter(f => f.endsWith('.js'))) {
  const s = fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8');
  assert.ok(!/claude\.ai\/code\/artifact\/[0-9a-f-]{36}/.test(s), f + ' names no artifact');
}

// 3. set-board.js in an empty root: none set, then recorded, then read back by lib-board.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'board-setup-'));
const env = { ...process.env }; delete env.CREATIVE_STUDIO_BOARD_URL;
const run = (...a) => spawnSync(process.execPath, [SET, ...a, '--root', root], { encoding: 'utf8', env });
let r = run('--show');
assert.strictEqual(r.status, 3, 'no board yet exits 3: ' + r.stdout);
r = run('https://example.com/not-an-artifact');
assert.strictEqual(r.status, 2, 'a non-artifact address is refused');
const url = 'https://claude.ai/code/artifact/0123abcd-0123-4abc-8abc-0123456789ab';
r = run(url + '?x=1');
assert.strictEqual(r.status, 0, 'recorded: ' + r.stderr);
const cfg = JSON.parse(fs.readFileSync(path.join(root, '.creative-studio-pipeline', 'config.json'), 'utf8'));
assert.strictEqual(cfg.boardUrl, url, 'query string dropped, address kept');
r = run('--show');
assert.strictEqual(r.status, 0);
assert.strictEqual(JSON.parse(r.stdout).url, url);

// lib-board resolves it, and reports offline without it.
const board = require(path.join(ROOT, 'scripts', 'lib-board.js'));
delete process.env.CREATIVE_STUDIO_BOARD_URL;
assert.strictEqual(board.boardUrl(['--root', root]), url);
(async () => {
  const ok = await board.call('url', { key: 'job-x' }, { argv: ['--root', root] });
  assert.ok(ok.workspaceUrl.startsWith(url + '#/p/job-x'), 'project page on the recorded board');
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'board-none-'));
  const off = await board.call('url', { key: 'home' }, { argv: ['--root', empty] });
  assert.strictEqual(off.offline, true, 'no board means offline, not a broken address');
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(empty, { recursive: true, force: true });
  console.log('ok   the board ships with the plugin, each account records its own copy, nothing is baked in');
})().catch(e => { console.error(e); process.exit(1); });
