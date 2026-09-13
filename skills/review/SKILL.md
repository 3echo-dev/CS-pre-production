---
name: review
description: >
  Lands a gate decision. A gate in 1-22 is decided on the board; this skill reads the record
  back, binds it to the files as an approval, and moves the project on, or records a verdict
  typed in chat with the same weight. Use for "/1-22:review", "approve", "lock gate A",
  "send it back", "start over", "released", or after any decision on the board.
argument-hint: "[job] approve | change | start over"
metadata:
  version: 0.1.0
---

# Land a decision

## Read the request

`$ARGUMENTS` holds the whole message; pull each piece by shape, case-insensitively. Client: the first word matching a folder under the workspace root (`list-jobs.js --json`), else ask, never guess one not on disk. Job: the first token starting `job-`, else the only project waiting. Verdict: the first verdict word; the rest is the comment.

Three verdicts: **approve** (ok, yes, go, lock, release) moves the project on; **change** (update, revise, fix) reopens the owning row; **start over** (reject, no, redo) rolls the gate back.

## Steps

1. **Identify the open gate** with `list-jobs.js {client}`; if none is waiting, say so and stop. What each gate covers is the table in `${CLAUDE_PLUGIN_ROOT}/docs/SHARED-RULES.md`.

2. **Land the board first** (`board-sync` skill). The decision may already be there. If the gate record is `passed`:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/board-sync.js" pull {client} {job-id} --gate {g}
   ```

   Exit 0 wrote the approval and moved the state; skip to step 6. Exit 1 names a file that changed after the lock: re-present that item and stop.

3. **A verdict typed in chat** with no record on the board: say it back in one line, verdict, gate, project, decider, and wait for a yes. Skip that when the verdict arrived with the project named.

4. **Record it:**

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/record-approval.js" {client} {job-id} {g} {verdict} --by "{name}" --comment "{comment}" --from-chat {artifact...}
   ```

   `--from-chat` queues the same decision for the board so the card closes on the next push. `decidedBy` is a name, never "user"; it is an audit record.

5. **On change or start over**, write `revisions/{n}.json`: reason code from `templates/revision.json`, target row, scope, the quoted finding, the directive. Reset the row to `pending` in `plan.md`. A change on an approved item sends its dependents back for review; `workflows/1-22.md` has the map.

6. **The project moves itself**: `record-approval.js` calls `set-state.js`; if that failed, run the printed line. Push the board. Hand back to the orchestrator, which continues from the row the state names.

## Rules

The shared rules in `${CLAUDE_PLUGIN_ROOT}/docs/SHARED-RULES.md` apply.

1. Hash at decision time: an edited file is approved as edited.
2. Never infer approval from silence, urgency or vague positivity.
3. One gate at a time: Gate A does not approve a register; Gate B does not release a sheet.
4. Every verdict is recorded, including those sending work back.
5. Never delete a superseded approval; `supersedes` links it.
6. A comment contradicting its verdict ("lock it, but change scene 4") is `change`, and say why.
7. Gate C is per day: a sheet the lead did not approve is not released, whatever the others say.

## Output contract

`record-approval.js` writes it, never by hand: `approvals/{g}-{n}.json` against `schemas/approval.schema.json`, times with zones; on change or start over, `revisions/{n}.json`; `status.md` updated; the board pushed. Never approves for anyone, edits beyond the instruction, or builds the release.

## Failure modes

| Failure | Fix |
|---|---|
| Recording `decidedBy` as "user" | Ask their name once |
| Acting on a chat verdict with the board still open | Record with `--from-chat` first, then push |
| Passing Gate A with a register marked not applicable | Not accepted at A; send it back |
| Releasing all days on one approval | One approval row per day sheet |
