---
name: board-sync
description: >
  How the orchestrator keeps the 1-22 Control board and the job folder agreeing: push the
  outbox as one write batch after every row, and land gate records, answers, change notes and
  register rows back on disk at every gate and every resume. Use after any row that recorded a
  version or a run, at every gate, and first thing on every resume.
metadata:
  version: 0.1.0
user-invocable: false
---

# Skill: Board sync

**Purpose:** the board shows what the files say, and the files record what the board decided. Scripts queue; only you reach the board, through the Artifact tool.
**Used by:** the orchestrator; `new-project`, `resume-project`, `review`.

## The board

Its address comes from `lib-board.js` (`CREATIVE_STUDIO_BOARD_URL`, then `.creative-studio-pipeline/config.json`, then the default). Pass it to the Artifact tool as `url`. Never print it in chat. Collections live under `projects/{job-id}`: `items`, `versions`, `runs`, `gates`, `inbox`, `messages`, `talents`, `props`, `locations`, `days`.

## Push, after every row

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/board-sync.js" push {client} {job-id}
```

It folds `.board/outbox.jsonl` into one write batch, at most fifty entries, and prints it as JSON with a `pins` list. The database refuses an unpinned update: `read_db get` each document in `pins` and set its `version` as `if_version` on that entry. Then hand the batch to the Artifact tool: `action: write_db`, `db_op: batch`, `url` the board, `writes` the array. On success:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/board-sync.js" push {client} {job-id} --ack
```

A rejected batch is not acknowledged; fix what it names and push again.

## Land, at a gate and on every resume

Read the board with the Artifact tool, `action: read_db`, `url` the board:

1. `db_op: get`, `collection: projects/{job-id}/gates`, `doc_id` A, B or C: the gate you are at.
2. `db_op: query`, `collection: projects/{job-id}/inbox`, `query.where` `[["status", "==", "open"]]`: questions answered, change notes, gate events.
3. `db_op: list` on `projects/{job-id}/talents`, `/props`, `/locations`, `/days` when the job is past Gate A.

Save every result, unchanged, into one JSON file under `.board/landed/{job-id}-{timestamp}.json` with keys `gates`, `inbox`, `talents`, `props`, `locations`, `days`. Then:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/board-sync.js" land {client} {job-id} ".board/landed/{file}.json"
```

It writes `.board/inbox.json` for the scripts and `registers/*.json` for the directors, and prints what changed. Inbox rows you acted on are marked answered in your next push.

## Pull, once a gate is locked

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/board-sync.js" pull {client} {job-id} --gate A
```

Exit 0: every item version in the gate record matched the latest version on disk, `record-approval.js` wrote `approvals/A-{n}.json` bound to the file hashes, the state moved. Exit 1: it names the item whose file changed after the human locked it; re-present that item on the board and do not pass. Exit 3: no gate record landed yet; say what is waiting and end the turn.

## Ask

A question only a person can answer goes to the board and the chat at once:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/board-sync.js" ask {client} {job-id} --item audio --text "Which VO voice for scenes 1, 4 and 9?" --options "Male, warm, 40s|Female, neutral, 30s|Send me three samples"
```

Copy the numbered text it prints into your next message unchanged, then push; the answer arrives with the next `land`.

## Rules

The shared rules in `${CLAUDE_PLUGIN_ROOT}/docs/SHARED-RULES.md` apply.

1. Push before ending any turn; a version the board does not show is a person waiting for nothing.
2. Land before deciding anything on a resume; the decision is probably already there.
3. The plugin never writes `approved`, `na` or a gate document. Those are the person's.
4. Register rows and day assignments come only from a landing. Never typed.
5. Never print the board's address, a document id, or a state id at the person.

## Output contract

`.board/outbox.jsonl` drained on ack; `.board/inbox.json` and `registers/*.json` after a landing; `approvals/{g}-{n}.json` after a pull. Quote what the scripts print.

## Boundary

Does not decide a gate, write a version, or spawn a director.

## Failure modes

| Failure | Fix |
|---|---|
| Acting on a chat verdict with the board still open | `record-approval.js --from-chat` first, then push |
| Acknowledging a batch the tool rejected | Only after success |
| Hand-editing `inbox.json` | Only `board-sync.js land` writes it |
| Pulling a gate not yet locked | Exit 3; say what is waiting |
