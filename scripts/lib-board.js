// The board, from a script's point of view.
//
// The kernel talked to a gate app over HTTP through lib-gate.js. 1-22's board is the 1-22
// Control artifact, whose database only the orchestrator can reach (through the Artifact
// tool's read_db and write_db). A script cannot call it. So every script that used to post
// to the gate app now appends to an outbox on disk, and `board-sync.js push` turns the outbox
// into the write batch the orchestrator hands to write_db. Reads work the other way round:
// the orchestrator lands a read_db result with `board-sync.js land`, and scripts read it here.
//
// Same call signature as lib-gate.js, so set-state.js, stage.js, record-approval.js and the
// hooks did not have to change shape:
//   await board.call('progress', { key, stage, status, ... }, { argv })
//   await board.call('url', { key, title }, { argv })      -> { workspaceUrl }
//   await board.call('answer?key=' + key, null, { argv })  -> { answer } | { offline }
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');

// There is no default board. Each account publishes its own copy of board/1-22-control.html
// (the board-setup skill) and records it with set-board.js; a private artifact of one account
// is unreachable from another, so a baked-in address would only ever work for its author.

function boardDir(argv) { return path.join(ws.root(argv), '.board'); }

// Is this folder the pipeline's? A hook fires in every folder a session opens, and one that
// queued heartbeats into somebody's unrelated project would be a menace. The board is
// present once the root has been chosen, a client scaffolded, or an outbox started.
function configured(argv) {
  const r = ws.root(argv);
  return fs.existsSync(path.join(r, ws.CONFIG_DIR)) || fs.existsSync(path.join(r, '.board')) || ws.listClients(argv).length > 0;
}
function outboxPath(argv) { return path.join(boardDir(argv), 'outbox.jsonl'); }
function inboxPath(argv) { return path.join(boardDir(argv), 'inbox.json'); }

function boardUrl(argv) {
  if (process.env.CREATIVE_STUDIO_BOARD_URL) return process.env.CREATIVE_STUDIO_BOARD_URL;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ws.root(argv), ws.CONFIG_DIR, ws.CONFIG_FILE), 'utf8'));
    if (cfg && cfg.boardUrl) return cfg.boardUrl;
  } catch { /* no config is fine */ }
  return null;
}

// A project's board id is its job id: the same key the pane, the inbox and the events use.
function projectIdOf(key) { return String(key || '').trim(); }

function append(argv, record) {
  fs.mkdirSync(boardDir(argv), { recursive: true });
  fs.appendFileSync(outboxPath(argv), JSON.stringify(record) + '\n');
}

function readInbox(argv) {
  try { return JSON.parse(fs.readFileSync(inboxPath(argv), 'utf8')); } catch { return {}; }
}

// What the orchestrator landed for a key: answers, decisions, gate records, register rows.
function landed(key, argv) {
  const all = readInbox(argv);
  return all[projectIdOf(key)] || null;
}

async function call(kind, payload, opts = {}) {
  const argv = opts.argv || process.argv;
  const [name, query] = String(kind).split('?');
  const params = Object.fromEntries((query || '').split('&').filter(Boolean).map(p => {
    const [k, v] = p.split('='); return [decodeURIComponent(k), decodeURIComponent(v || '')];
  }));
  const at = new Date().toISOString();

  if (name === 'url') {
    // The page for a key. `home` is the slate; a job id is that project's board.
    const key = payload && payload.key ? projectIdOf(payload.key) : 'home';
    const base = boardUrl(argv);
    if (!base) return { offline: true, workspaceUrl: null, key, reason: 'no board set: run the board-setup skill' };
    const url = base + (key === 'home' ? '#/' : '#/p/' + encodeURIComponent(key));
    return { workspaceUrl: url, key };
  }
  if (name === 'answer') {
    const got = landed(params.key, argv);
    const answers = got && got.answers ? got.answers : [];
    const open = answers.find(a => a.status === 'answered' && !a.consumed);
    return open ? { answer: open } : { offline: false, answer: null };
  }
  if (name === 'decision') {
    const got = landed(params.key, argv);
    const gates = got && got.gates ? got.gates : {};
    const g = params.gate ? gates[params.gate] : null;
    return g ? { decision: g } : { offline: false, decision: null };
  }
  // Everything else is a post to the board: progress, heartbeat, item, version, run,
  // question, message, gate, project. It is queued; nothing is refused here.
  append(argv, { kind: name, ...(Object.keys(params).length ? { params } : {}), payload: payload || {}, at });
  return { queued: true, kind: name };
}

// The outbox as records, and a way to clear the ones a push has delivered.
function drain(argv) {
  try {
    return fs.readFileSync(outboxPath(argv), 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
  } catch { return []; }
}
function clear(argv, upTo) {
  const rows = drain(argv);
  const keep = typeof upTo === 'number' ? rows.slice(upTo) : [];
  fs.mkdirSync(boardDir(argv), { recursive: true });
  fs.writeFileSync(outboxPath(argv), keep.map(r => JSON.stringify(r)).join('\n') + (keep.length ? '\n' : ''));
  return rows.length - keep.length;
}
function land(argv, key, data) {
  const all = readInbox(argv);
  all[projectIdOf(key)] = { ...(all[projectIdOf(key)] || {}), ...data, landedAt: new Date().toISOString() };
  fs.mkdirSync(boardDir(argv), { recursive: true });
  fs.writeFileSync(inboxPath(argv), JSON.stringify(all, null, 2) + '\n');
  return all[projectIdOf(key)];
}

module.exports = { call, configured, boardUrl, boardDir, outboxPath, inboxPath, drain, clear, land, landed, projectIdOf };
