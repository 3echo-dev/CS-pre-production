---
name: board-sync
description: >
  How the orchestrator keeps the Pre-production board and the job folder agreeing: push the
  outbox as one write batch after every row, and land gate records, answers, change notes and
  register rows back on disk at every gate and every resume. Use after any row that recorded a
  version or a run, at every gate, and first thing on every resume.
metadata:
  version: 0.1.0
user-invocable: false
---

# Skill: Board sync

**Purpose:** the board shows what the files say; the files record what the board decided. Only you reach the board, through the Artifact tool.
**Used by:** the orchestrator; `new-project`, `resume-project`, `review`.

## The board

Its address comes from `lib-board.js`; pass it to the Artifact tool as `url`, never print it in chat. Collections under `projects/{job-id}`: `items`, `versions`, `runs`, `gates`, `inbox`, `messages`, `panels`, `sheets`, `talents`, `props`, `locations`, `days`.

## Push, after every row

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/board-sync.js" push {client} {job-id}
```

It prints `.board/outbox.jsonl` as write batches of at most fifty, with a `pins` list. The database refuses an unpinned write to an existing document: `read_db get` each pinned document and set its `version` as `if_version` (`mayExist` pins: skip when the read finds nothing). Hand each batch to the Artifact tool: `action: write_db`, `db_op: batch`, `writes` the array. On success:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/board-sync.js" push {client} {job-id} --ack
```

A rejected batch is not acknowledged; fix what it names, push again.

## Land, at a gate and on every resume

Read the board with the Artifact tool, `action: read_db`:

1. `db_op: get`, `collection: projects/{job-id}/gates`, `doc_id` A, B or C.
2. `db_op: list`, `collection: projects/{job-id}/inbox` (open, waiting and answered rows, so a waiting request meets its answer).
3. `db_op: list` on `/refsel` (the references ticked); past Gate A also `/talents`, `/props`, `/locations`, `/days`, `/panels`.

One JSON array under `.board/landed/`, each `{"collection": "projects/{job-id}/gates", "documents": [...]}` as returned. Then:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/board-sync.js" land {client} {job-id} ".board/landed/{file}.json"
```

It writes `.board/inbox.json`, `registers/*.json` and `references/selected.json`, prints what changed; no board record exits 1.

## Pull, once a gate is locked

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/board-sync.js" pull {client} {job-id} --gate A
```

Exit 0: every item version in the gate record matched disk; `approvals/A-{n}.json` is written, hash-bound, and the state moved. Exit 1 names the item whose file changed after the lock: re-present it. Exit 3: nothing landed; say what waits, end the turn. `--gate sample` binds the sample approval.

## Ask

A question only a person can answer goes to the board and the chat:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/board-sync.js" ask {client} {job-id} --item audio --text "Which VO voice for scenes 1, 4 and 9?" --options "Male, warm, 40s|Female, neutral, 30s|Send me three samples"
```

Copy the printed text into chat unchanged, push; the answer arrives with the next `land`.

`--blocks {request id}` on a question that blocks a landed generate or export request: the board shows the request waiting, and `land` prints `request {id} can proceed` once answered. Re-ask the question, never the request.

## Excel export

An `export` request in the inbox: `push-sheet.js {client} {job-id} --item {item} --drive` writes the Excel; upload it with the Google Drive connector (`create_file`, base64, xlsx mime, parent `driveExportsFolder` in `workspace.json`), then `push-sheet.js ... --request {id} --link {viewUrl}`, push. Without the connector, `--request` alone answers with the path.

## Rules

The shared rules in `${CLAUDE_PLUGIN_ROOT}/docs/SHARED-RULES.md` apply.

1. Push before ending any turn; an unpushed version is a person waiting for nothing.
2. Land before deciding anything on a resume; the decision is usually already there.

## Output contract

`.board/outbox.jsonl` drained on ack; `.board/inbox.json` and `registers/*.json` after a landing; `approvals/{g}-{n}.json` after a pull.

## Boundary

Does not decide a gate, write a version or spawn a director.

## Failure modes

| Failure | Fix |
|---|---|
| A chat verdict while the board is open | `record-approval.js --from-chat`, then push |
| Acknowledging a batch the tool rejected | Only after success |
| Hand-editing `inbox.json` | Only `board-sync.js land` writes it |
| Pulling an unlocked gate | Exit 3; say what waits |
| `land` refused | `record-approval.js --channel board` or `sites-check.js --add`; a register row waits |
| Ending a turn waiting on the board | Restate the open questions; say when you look again |
