#!/usr/bin/env node
// Prepare the workspace page for Claude Code's internal Preview pane.
//   node pane.js <key> [title]
//
// The key is `home` or a job id. The page is the 1-22 Control board, at the slate or at that
// project. This writes the local embedded fallback through pane-file.js and returns both as JSON.
// Claude calls preview_start with previewUrl. It only shows fallbackFile to the person.
const path = require('path');
const { spawnSync } = require('child_process');
const ws = require('./lib-workspace.js');
const gate = require('./lib-board.js');

const argv = process.argv.slice(2);
const [key, title] = ws.positionals(argv);
if (!key) {
  console.error('usage: pane.js <key> [title]');
  process.exit(2);
}

const OFFLINE = 'The board address is not set. Set boardUrl in the workspace config or CREATIVE_STUDIO_BOARD_URL.';

(async () => {
  const res = await gate.call('url', { key, ...(title ? { title } : {}) }, { argv });
  if (res.offline || !res.workspaceUrl) {
    console.log(OFFLINE);
    return;
  }
  const rootArgs = argv.includes('--root') ? ['--root', argv[argv.indexOf('--root') + 1]] : [];
  const wrote = spawnSync(process.execPath,
    [path.join(__dirname, 'pane-file.js'), key, res.workspaceUrl].concat(rootArgs),
    { encoding: 'utf8' });
  if (wrote.status !== 0) {
    console.error((wrote.stderr || 'the local page could not be written').trim());
    process.exit(1);
  }
  const file = wrote.stdout.trim();
  console.log(JSON.stringify({
    status: 'ready',
    previewUrl: res.workspaceUrl,
    fallbackFile: path.resolve(file).split(path.sep).join('/'),
  }));
})();
