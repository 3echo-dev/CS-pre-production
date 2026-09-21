---
name: resume-project
description: >
  Resumes an existing 1-22 project. Reads status.md, reconciles it against what is on disk and
  what the board has landed, reloads the context the next stage needs, and continues from the
  correct place. Never passes a gate. Use for "resume", "continue", "where were we", "pick up
  {job-id}", or after a decision on the board.
argument-hint: "[client or job]"
metadata:
  version: 0.1.0
---

# Resume a project

**Purpose:** continue a project from disk and the board, not from memory of a conversation. Used by the user, `1-22`, and `review`.

## Steps

1. **Find the project.** If either argument is missing, `node "${CLAUDE_PLUGIN_ROOT}/scripts/list-jobs.js" {client}`. One project: take it. Several: ask, most recent first.

   The id is the board's project id, so open its page now, before reading anything: `pane.js "{job-id}" "{title}"` (`${CLAUDE_PLUGIN_ROOT}/docs/SHARED-RULES.md`); never print the web address, then watch it ("Watching the board" in SHARED-RULES) and say in one line whether the board can wake this run. The title is the client and the film in the words `status.md` uses today.

2. **Read the board first, every time.** Follow the `board-sync` skill: read the gate documents, the open inbox rows and the registers into a JSON file, then:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/board-sync.js" land {client} {job-id} "{file.json}"
   ```

   It prints what changed since the last landing: a gate locked, a question answered, a change requested, rows entered. A turn that opened with `[Artifact comment sent to Claude]` is the board ringing for exactly this landing; reply in that thread in one line once you have acted.

3. **Read `status.md`**, its Notes block first: live constraints, an open revision, a deferred question, the credit tally for panels.

4. **Reconcile against disk.** If `status.md` disagrees with the files, the files win. Correct it with `set-state.js`, say what you corrected in one clause. Read the state off the last artifact present, against `plan.md`, with the table in `${CLAUDE_PLUGIN_ROOT}/docs/SHARED-RULES.md`.

   Never redo work that exists. Re-spawn only the director whose file is missing or sent back.

5. **At a gate**, run `board-sync.js pull --gate {g}`. Exit 0 means the human locked it and the approval is on disk: carry on. Exit 1 names a file that changed after the lock: re-present that item. No decision yet: report what is waiting and stop.

6. **Reload the context the next stage needs**, from disk, in full, never from a summary: the owning director's Contract `reads:` block.

7. **Verify.** If the last batch was never checked, run `collect-artifacts.js` now.

8. **Mirror.** When a connected folder is in use, `sync-manifest.js {client} {job-id}` lists what changed since the last copy; copy that and nothing else.

## The states you cannot resume past

Every state whose row in `scripts/lib-states.js` names a gate.

**Resuming is not approval.** "Continue" while a gate is open asks you to run the step only they can run. Ask for the decision, in the words `lib-wording.js` gives, and point at the board.

## Rules

The shared rules in `${CLAUDE_PLUGIN_ROOT}/docs/SHARED-RULES.md` apply.

1. Land the board before deciding anything; a decision made while you were away is probably already there.
2. A change request lands as an inbox row, not as a new version: re-enter the owning row with `revisions/{n}.json`.
3. Register rows land from the board only; never type one to unblock a resume.

## Output contract

Writes nothing of its own. Corrects `status.md` where it disagreed with disk; lands the board.

## Report back

Two lines: what is waiting, and what to do about it. Then end the turn.

> **HTF, Night Shift** - Gate A is waiting on you. Budget sheet and timeline still have 11 unknowns.
>
> Lock the creative on the board, or say what to change.

## Failure modes

| Failure | Fix |
|---|---|
| Inferring the stage from the conversation | Read `status.md`, then the disk, then the board |
| Re-running a director to fill one gap | Re-spawn only what is missing |
| Saying the project is at an internal state | Say what `list-jobs.js` printed |
| Resuming without landing the board | Land first; the decision may be there |
