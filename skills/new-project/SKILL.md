---
name: new-project
description: >
  Starts a new 1-22 project for a client. Scaffolds the job folder, pulls the named Drive
  folder, runs intake, routes and plans, opens the project on the board, and runs Stage 1 to
  Gate A, then stops. Use for "new project", "start the HTF job", "pre-production for", or any
  fresh brief that arrives as a Drive folder.
argument-hint: "[client] and the folder: a path on this computer or a Google Drive link"
metadata:
  version: 0.1.0
---

# Start a new project

**Purpose:** turn the client's folder into a routed, planned project at Gate A without asking twice.

## Read the request

`$ARGUMENTS` holds the message. The client is the first word matching a workspace folder (`list-jobs.js --json`), case-insensitively; the rest names the folder, a local path or a Drive link.

## Steps

1. **Resolve the client.** None named: list the folders under `workspaces/` and ask which. None exist: onboard first (the `1-22` skill says how). Opened on the slate: its card gives the fields, adopt it (SHARED-RULES, "A project opened on the slate"). Its client is a typed word: match it to a workspace folder or `workspace.json` name, case-insensitively, as a prefix ("HTF" is `htf26`). No match while workspaces exist: ask which, existing ones first, "a new client" last. Never scaffold blank from the slate: no sites, no templates.

2. **Get the folder.** If the message does not name it, ask on the board and in chat: "Where is the folder with the brief, concept and client assets? A path on this computer or a Google Drive folder link." A folder already under `<root>/inputs/{client}/` is not pulled again. Then `set-root.js` (no argument) prints where the work lives; say it beside the folder to pull before creating anything. If the pull is or holds that root, `set-root.js <folder>` from outside the client's folder first; the pull is refused otherwise, and so is scaffolding (exit 3) when the root is the client's.

3. **Derive a slug**, lowercase and hyphenated, three words at most:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/scaffold-job.js" {client} {slug} "{title}"
   ```

   Exit 3: no `workspace.json`, onboard first. Exit 1: the id exists, ask whether to resume or start another.

   The job id is the board's project id: open its page at once with `pane.js "{job-id}" "{title}"` (`${CLAUDE_PLUGIN_ROOT}/docs/SHARED-RULES.md`); never print the web address, then watch it (SHARED-RULES, "Watching the board"). The title is client and film in plain words, "HTF, Night Shift".

4. **Pull the folder** with `drive-pull` into `inputs/{client}/{job-id}/`; for a link, the connector steps it lists. Nothing else reads Drive.

5. **Run `project-intake`.** It writes `job.json`, asks the blocking questions once, runs the router and the planner, and owns an unroutable job.

6. **Open the project on the board:**

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/board-sync.js" open {client} {job-id}
   node "${CLAUDE_PLUGIN_ROOT}/scripts/board-sync.js" push {client} {job-id}
   ```

   Hand the printed batch to the board (`board-sync` skill), then `push --ack`.

7. **Run the plan.** Follow `plan.md` row by row as the `orchestrator`, which owns narration, versions, runs and pushes.

8. **Stop at Gate A.** Push, set the awaiting state, say what the creative director is locking and which XX items are open, and end the turn.

## Rules

The shared rules in `${CLAUDE_PLUGIN_ROOT}/docs/SHARED-RULES.md` apply.

1. One batch of questions, once: `project-intake` asks them; never re-ask in your own words.
2. Never invent or drop a file of the folder.
3. Never pass a gate. Silence is not approval.
4. Never generate a panel here; nothing is spent before the sample is approved on the board.

## Output contract

`workspaces/{client}/jobs/{job-id}/` with `job.json`, `route.json`, `plan.md`, `status.md` and Stage 1 files, waiting at Gate A.

## Boundary

Never onboards a client, decides a gate or builds the release; `resume-project` continues after a verdict, `review` lands one.

## Failure modes

| Failure | Fix |
|---|---|
| Asking the client and the folder in one message | Client, then scaffold, then the folder |
| Opening the board after the first stage has run | Open it the moment the id exists |
| Pulling a folder twice | Check `inputs/` first |
| The root defaulted to the client's folder | Say the root beside the folder first; `set-root.js` moves it |
