#!/usr/bin/env node
// A folder another studio/social plugin owns is not ours. The hooks and the session-start script
// all gate on ws.foreignOwner()/gate.configured(); this proves both, so cs-pre-production never
// again refuses a stop, queues a board line, or writes its config dir into a Social Pipeline or
// creative-studio-post project. The reverse of social-pipeline's own siblingStudioRoot guard.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ws = require('../lib-workspace.js');
const gate = require('../lib-board.js');

const mk = (dir, marker) => {
  fs.mkdirSync(path.join(dir, marker), { recursive: true });
  fs.writeFileSync(path.join(dir, marker, 'config.json'), JSON.stringify({ root: '.' }));
};
const withClient = dir => {
  fs.mkdirSync(path.join(dir, 'workspaces', 'dynacore', 'jobs'), { recursive: true });
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cspp-sibling-'));
const cwd0 = process.cwd();
try {
  // A Social Pipeline folder: its marker present, ours absent.
  const social = path.join(tmp, 'social'); fs.mkdirSync(social);
  mk(social, '.social-pipeline'); withClient(social);
  assert.strictEqual(ws.foreignOwner(social), '.social-pipeline', 'social folder is foreign');

  // A creative-studio-post folder.
  const post = path.join(tmp, 'post'); fs.mkdirSync(post);
  mk(post, '.creative-studio-post');
  assert.strictEqual(ws.foreignOwner(post), '.creative-studio-post', 'post folder is foreign');

  // Our own config wins even when a sibling marker is lying around.
  const ours = path.join(tmp, 'ours'); fs.mkdirSync(ours);
  mk(ours, '.creative-studio-pipeline'); mk(ours, '.social-pipeline');
  assert.strictEqual(ws.foreignOwner(ours), null, 'our own config wins');

  // A plain folder with neither marker is not foreign.
  const plain = path.join(tmp, 'plain'); fs.mkdirSync(plain); withClient(plain);
  assert.strictEqual(ws.foreignOwner(plain), null, 'no marker is not foreign');

  // gate.configured() reads process.cwd() through foreignOwner, so drive it by chdir.
  // The false-positive this fixes: a sibling's workspaces/ tree used to read as ours.
  process.chdir(social);
  assert.strictEqual(gate.configured([]), false, 'a foreign folder is never configured for us');
  console.log('ok   a Social Pipeline folder is not configured for cs-pre-production');

  // Our own config folder stays configured even with a sibling marker beside it (ours wins).
  process.chdir(ours);
  assert.strictEqual(gate.configured([]), true, 'our own config folder is configured');
  console.log('ok   our own config folder stays configured even beside a sibling marker');

  console.log('sibling-yield verification passed');
} finally {
  process.chdir(cwd0);
  fs.rmSync(tmp, { recursive: true, force: true });
}
