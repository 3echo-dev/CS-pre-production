---
name: board-setup
description: >
  Publishes this account's own copy of the Pre-production board, the page that ships with the
  plugin at board/pre-production.html, as a claude.ai artifact with the db, artifact and
  comments capabilities, and records its address for the workspace. Use once per account or workspace,
  when set-board.js --show says no board is set, or when the user asks for a fresh board.
argument-hint: "[--new]"
metadata:
  version: 0.1.0
user-invocable: true
---

# Skill: Board setup

**Purpose:** give the account that runs the pipeline a board it owns. The plugin carries the page; the artifact belongs to whoever publishes it, only an owner's session can write its database, and only a session watching it is woken by its decisions.

## Steps

1. **Is there one already?**

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/set-board.js" --show
   ```

   Exit 0 prints the board in use and where the setting came from: say so in one line and stop, unless the user asked for a new one (`--new`). Exit 3: continue.

2. **Publish the page** with the Artifact tool, `file_path` set to `${CLAUDE_PLUGIN_ROOT}/board/pre-production.html`, `title` "Pre-production", `favicon` "🎬", `capabilities` `{"db": {}, "artifact": {}, "comments": {}}`, and a one-line description ("Pre-production board: gates, registers, storyboard, inbox"). Publish it as it is: never edit the page, never strip the base64 copy at its end, never pass `contract`. The artifact starts private; `comments` keeps it inside the organization, which a board is anyway. The publish result says whether this session now watches the board: note the answer for step 5.

3. **Record the address** the publish result returned:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/set-board.js" {url}
   ```

   It writes `boardUrl` into the workspace config. Any `CREATIVE_STUDIO_BOARD_URL` in the environment would win over it: say so if one is set.

4. **Prove the session can write it.** One `ArtifactData` set on the new artifact, collection `meta`, document `board`, data `{"installedBy": "cs-pre-production", "pluginVersion": "{version from plugin.json}", "installedAt": "{now}"}`. The first write asks the person for consent once; a refusal means the board cannot be driven from this session, say that and stop.

5. **Say who is watching.** A decision reaches the run as a comment sent to Claude, only in a session watching the artifact with replies armed; publishing from this session arms it. `ArtifactComments` `action: "watch"` with no `url` lists the watches: if the board's row is connected and armed, the session running jobs must be this one, or must watch it as "Watching the board" in SHARED-RULES says. Otherwise say plainly that every decision on the board must also be said in chat.

6. **Open it** with `pane.js "home" "1-22"`, then ask the person to press **Signal pipeline** on the board once and approve the prompt that lets the page message this session. A turn headed as a comment sent to Claude arrives: reply in its thread in one line. That press is the proof; until it is approved every decision on the board falls back to a silent republish. Never repeat the address.

## Rules

The shared rules in `${CLAUDE_PLUGIN_ROOT}/docs/SHARED-RULES.md` apply.

1. One board per workspace root. A second `board-setup` without `--new` changes nothing.
2. The page is published unmodified. Changes to the board are a plugin release, not a per-account edit.
3. `--new` publishes a fresh, empty board; projects on the old one stay there. Say that before publishing.
4. Never point a workspace at a board this account does not own: its decisions would wake nobody and the writes would be refused.

## Output contract

A private artifact of the board page with capabilities db, artifact and comments; `boardUrl` and `boardSetAt` in `<root>/.creative-studio-pipeline/config.json`; the `meta/board` document on the artifact's database.

## Boundary

Does not push projects (`board-sync`), share the artifact, or edit the page.

## Failure modes

| Failure | Fix |
|---|---|
| Publish refused for the capabilities | Say which; the page needs `db`, `artifact` and `comments` |
| A decision on the board wakes nobody | The page was never allowed to message a session: press Signal pipeline and approve |
| The consent for the first write is declined | Stop; the board stays published but unused until a session with consent writes it |
