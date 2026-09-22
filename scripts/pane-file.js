#!/usr/bin/env node
// Embed the workspace page in a local HTML file for Claude Code Preview.
//   node pane-file.js <key> <url>
//
// Some desktop Code tab sessions are not offered preview_start. A static HTML path in an
// assistant message opens in Preview, so this file keeps the remote workspace inside a
// full-size iframe. It does not redirect the Preview pane to an external address.
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');

const [key, url] = ws.positionals(process.argv.slice(2));
if (!key || !url) {
  console.error('usage: pane-file.js <key> <url>');
  process.exit(2);
}
if (!/^https?:\/\//i.test(url)) {
  console.error('The url must start with http:// or https://.');
  process.exit(2);
}

// A key is `home` or a job id.
const safe = String(key).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'page';
const dir = path.join(ws.root(), '.pane');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, safe + '.html');

const attr = String(url).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

fs.writeFileSync(file, `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pre-production</title>
<style>
html, body { height: 100%; margin: 0; background: #f7f7f5; }
body { display: grid; font: 14px system-ui, sans-serif; color: #30302e; }
iframe { width: 100%; height: 100%; border: 0; background: #fff; }
.fallback { display: none; place-self: center; max-width: 28rem; padding: 2rem; text-align: center; }
.fallback a { color: #5b4dc4; }
</style>
</head>
<body>
<iframe src="${attr}" title="Pre-production board" allow="clipboard-read; clipboard-write"></iframe>
<noscript>
  <div class="fallback" style="display:grid">
    <p>The board needs JavaScript.</p>
    <p><a href="${attr}">Open the board</a></p>
  </div>
</noscript>
</body>
</html>
`);

console.log(ws.fwd(file));
