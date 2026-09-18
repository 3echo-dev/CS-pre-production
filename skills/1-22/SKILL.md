---
name: 1-22
description: >
  Entry point for CS Pre-production pre-production. Reads what is already in progress, opens the
  board, then asks whether to start a new project, resume one, or onboard a client, and routes
  accordingly. Use when the user types /1-22 or says any of "start 1-22", "run pre-production",
  "new project", "call sheets for", "where is the HTF job", or asks what this plugin does.
argument-hint: "[client]"
metadata:
  version: 0.1.0
---

# 1-22

**Purpose:** the one thing a user has to remember. Everything else is reachable from here.

## Steps

### 1. Look before you speak

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/list-jobs.js"
```

One row per project, in plain words. Never ask a question this answers.

### 2. Open the board

First time on this account: `set-board.js --show` exits 3 when no board is set; run the `board-setup` skill once (it publishes the board page that ships with the plugin and records the address), then continue.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/pane.js" "home" "1-22"
```

Then `ToolSearch` for `select:mcp__Claude_Browser__preview_start`. If it exists, call it with `previewUrl` and say one line that the board is open beside the chat. If not, print `fallbackFile` on its own line under "Open the board". The web address is never printed. `${CLAUDE_PLUGIN_ROOT}/docs/SHARED-RULES.md` has the whole rule.

### 3. Say what this is, in one line

> Your folder in, a path on this computer or a Google Drive link, call sheets out. You decide at three gates on the board, and you fill in what only you know.

Only for someone with no clients yet. With a project on disk, show what `list-jobs.js` printed, in its words.

### 4. Ask what they want

One question, always the same three options, ordered by what is likely:

1. **Resume {project}**: named, first, when a project is waiting on a decision or an XX item. Say what it is waiting for in the words `list-jobs.js` used.
2. **Start a new project**: first when nothing is waiting.
3. **Onboard a client**: first when there is no client folder.

Never drop an option for looking unlikely. The client slug can come with the answer; read the intent and route on it.

### 5. Route

| They chose | Do |
|---|---|
| Resume | `resume-project` with that client and job id. It continues; it does not reintroduce it. |
| New project | `new-project` with the client, which scaffolds, pulls the Drive folder and runs intake. |
| Onboard | Ask for the client name, the site list and the five blank templates (shot list, budget, timeline, breakdown, call sheet). Scaffold with `scaffold-client.js`, drop the templates under `client/templates/` and the sites in `client/sites.md`, then `template-check.js {client}`: exit 3 names a missing file and its folder, exit 1 a file that holds data, a question, never an input. `strip-template.py` empties a finished workbook and prints every cell it kept. |

What runs next must not repeat the table or the question.

### 6. Mention setup only if something is missing

The SessionStart hook already reported what is missing. Repeat only that, with the command. The 3echo MCP is needed only for storyboard panels.

## Rules

The shared rules in `${CLAUDE_PLUGIN_ROOT}/docs/SHARED-RULES.md` apply.

1. Read the disk before asking anything.
2. Open the board before asking anything.
3. Offer all three choices every time; order them, never remove one.
4. Never start work because someone typed the command. Ask, then act.
5. Never list every skill, and never print a state id or the board's address.
6. Never search Drive, email or a connector looking for a folder; the person names it.

## Output contract

Writes nothing. Routes to `new-project`, `resume-project` or client onboarding.

## Boundary

Does not scaffold, pull, intake, route, or run any stage. Does not decide a gate.

## Failure modes

| Failure | Fix |
|---|---|
| Dropping a choice that looked unlikely | All three are always offered |
| Making them type a job id you already read | Offer it by name |
| Burying a project that is waiting on them | Lead with it, and say what it waits for |
| Printing the board's web address | `preview_start` only; show `fallbackFile` otherwise |
