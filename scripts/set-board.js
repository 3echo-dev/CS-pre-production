#!/usr/bin/env node
// Record which 1-22 Control board this workspace talks to.
//
//   node set-board.js <artifact url>     writes boardUrl into <root>/.creative-studio-pipeline/config.json
//   node set-board.js --show             prints the board in use and where it came from, exit 3 when none
//
// The board page ships with the plugin at board/1-22-control.html. Every account publishes its
// own copy (the `board-setup` skill does it with the Artifact tool, capabilities db and
// artifact) and records the address here, so the pipeline never points at somebody else's
// private board. CREATIVE_STUDIO_BOARD_URL in the environment wins over the config file.
//
// Exit 0 done · 2 usage or not an artifact address · 3 no board set (--show)
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');

const argv = process.argv.slice(2);
// Two shapes are in the wild: the older /code/artifact/<uuid> and the short id the Artifact
// tool returns today. Both are this account's own page; only the shape differs.
const ARTIFACT = /^https:\/\/claude\.ai\/(?:code\/)?artifact\/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Za-z0-9]{8,40})$/i;
const cfgPath = () => path.join(ws.root(argv), ws.CONFIG_DIR, ws.CONFIG_FILE);

function current() {
  if (process.env.CREATIVE_STUDIO_BOARD_URL) return { url: process.env.CREATIVE_STUDIO_BOARD_URL, source: 'CREATIVE_STUDIO_BOARD_URL' };
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath(), 'utf8'));
    if (cfg && cfg.boardUrl) return { url: cfg.boardUrl, source: ws.fwd(cfgPath()) };
  } catch { /* no config yet */ }
  return null;
}

if (argv.includes('--show')) {
  const c = current();
  if (!c) {
    console.log('No board is set for ' + ws.fwd(ws.root(argv)) + '. Publish one with the board-setup skill, then: node set-board.js <artifact url>');
    process.exit(3);
  }
  console.log(JSON.stringify(c));
  process.exit(0);
}

const url = ws.positionals(argv).find(a => /^https?:/i.test(a));
if (!url) {
  console.error('usage: set-board.js <the artifact address the publish returned> | --show');
  process.exit(2);
}
if (!ARTIFACT.test(url.replace(/[?#].*$/, ''))) {
  console.error('Not a claude.ai artifact address: ' + url + '. The board is an artifact published from board/1-22-control.html.');
  process.exit(2);
}
const clean = url.replace(/[?#].*$/, '');
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(cfgPath(), 'utf8')) || {}; } catch { /* first write */ }
fs.mkdirSync(path.dirname(cfgPath()), { recursive: true });
cfg.boardUrl = clean;
cfg.boardSetAt = new Date().toISOString();
fs.writeFileSync(cfgPath(), JSON.stringify(cfg, null, 2) + '\n');
console.log('Board recorded in ' + ws.fwd(cfgPath()) + '. Every project in ' + ws.fwd(ws.root(argv)) + ' now opens on it.');
