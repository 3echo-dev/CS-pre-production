# One Dash 1-22

A Claude Code plugin that takes a client's Drive folder, the brief, the concept deck and the
client assets, and gives back a concept breakdown and one call sheet per shoot day, in the client's
own templates.

It reads the folder, finds references on the sites the client names, writes the script in the format
he chose, draws the storyboard in one style, lists the shots, pre-fills the budget sheet and the
timeline, **stops for Gate A**, lays out the audio and opens the three registers a person fills,
**stops for Gate B**, compiles the breakdown and builds the day sheets, and **stops for Gate C**.

Three hard stops, six items only a person can fill, and nothing invented: a template that is
missing stays missing, a cost nobody entered stays unknown.

---

## How it works

A Drive folder becomes a typed project. A script routes it. An orchestrator walks the stage
table, spawning ten directors that wrap the client's skills. Every gate is decided on the board.

```
      Drive folder: Brief / Concept / Client Assets
                     |
                     v
       +-----------------------------+
       |  OPEN  ·  drive-pull        |  copied as is, manifest written
       |  project-intake  job.json   |  four questions, in one batch
       +--------------+--------------+
                      v
       +-----------------------------+
       |  ROUTE  ·  route-job.js     |  five rules, deterministic
       |  route.json  ->  plan.md    |  one workflow, three gates
       +--------------+--------------+
                      |
   +----------+-------+---+-----------+-----------+
   v          v           v           v           v
+--------+----------+----------+----------+----------+
| INTAKE | STAGE 1  | STAGE 2  | STAGE 3  | RELEASE  |
| brief  | scraper  | audio    | concept  | breakdown|
|        | script   | talents  | breakdown| + day    |
|        | board    | props    | call     |  sheets  |
|        | shots    | locations|  sheets  |          |
|        | budget   |          |          |          |
|        | timeline |          |          |          |
+--------+----------+----------+----------+----------+
                 ^           ^           ^
              GATE A      GATE B      GATE C
           creative     logistics    documents
             lock         lock       released

   XX items a person fills: scraper selection, budget sheet, timeline, talents, props, locations.
   Only storyboard panels cost credits, and only after the sample panel is approved.
```

**The gates are the point.** Claude cannot pass one. A gate is locked by a person on the board,
and the lock is bound to the sha256 of the exact files they saw. Editing a file after the lock
invalidates it, and `build-release.js` refuses to package it.

**XX means a person.** Six items are prepared by a director and filled by the assistant or
the creative director on the board. No agent types a talent, a prop, a location, a cost or a date. Unknown stays
unknown; not applicable is a decision a person made, with their name on it.

**Skills reference each other downward, never in a loop:**

```
source-validation  ->  intake, references
client-skill-wrap    ->  every director that wraps a client skill
storyboard         ->  make-image (orchestrator only)
register-forms     ->  logistics, planner, board-sync
board-sync         ->  every gate, every resume
```

---

## Roles

Eleven roles, one agent file each. The orchestrator dispatches; nobody else can, because every
director sets `disallowedTools: Agent`. No director holds an MCP tool, so no director can spend
a credit or touch the board.

| Role | What it owns | Wraps | Model |
|---|---|---|---|
| `orchestrator` | Dispatch, disk verification, versions and runs on the board, gates, every credit spent, the release | | sonnet |
| `intake-director` | The unified brief: index, intent, conflicts, open questions | the-creative-director, defuddle | sonnet |
| `reference-scout` | The scraper: references from the client's sites with URL, date and reason; gaps | inspiration-references, video-watch, defuddle | sonnet |
| `script-director` | The script, screenplay or AV, one file per version | the-creative-director, no-ai-slop | **opus** |
| `storyboard-director` | Panels in one style with permanent ids; prompts for the sample and the batch | generative-frame-craft, clip-director | sonnet |
| `shot-list-director` | Shot rows with ids that survive reordering | clip-director | sonnet |
| `production-planner` | Budget sheet and timeline pre-filled from the client's templates | | sonnet |
| `audio-supervisor` | VO, BGM and SFX per scene with a source per row | openmontage-craft | sonnet |
| `logistics-registrar` | The three register skeletons and the summary of what landed | | sonnet |
| `breakdown-compiler` | The MOT-format breakdown in the client's template | | sonnet |
| `call-sheet-builder` | One sheet per shoot day in the HTF layout | | sonnet |

The scriptwriter keeps Opus because the script is the one file every later stage reads, and a
weak scene is copied faithfully into the board, the shot list and the breakdown where no gate
will catch it.

---

## Skills

Claude invokes these itself. Four are for you.

| Skill | Runs when |
|---|---|
| `/1-22` | The entry point. What is in progress, the board, and where to go next |
| `/new-project` | Starting a project from a Drive folder and running to Gate A |
| `/resume-project` | Picking one back up, after landing what the board decided |
| `/review` | Landing a gate decision, or recording one typed in chat |
| `project-intake` | The folder into `job.json`; four questions, once |
| `drive-pull` | Copying the named folder into `inputs/`, never searching for it |
| `board-sync` | Pushing the outbox to the board; landing gates, answers and registers back |
| `register-forms` | How an XX item is asked for and landed; unknown versus not applicable |
| `client-skill-wrap` | How a director uses one of the client's skills without copying it |
| `storyboard` | Panels with stable ids in one style; text only until the sample is approved |
| `make-image` | Panels through 3echo: quote, yes, sample, batch. Orchestrator only |
| `watch-video` | Frames and transcript of one reference clip |
| `source-validation` | Claim labels, traceability, the never-fabricate list |
| `review-pass` | A fresh-context review of everything a gate covers, before the gate opens. Orchestrator only |

**Playbooks carry the depth.** Nine craft playbooks under `playbooks/` (the script method, the storyboard method, shot list rules, planning, audio, breakdown columns, call sheet rules, references, the brief) are read by a director when it reaches its row, not preloaded, so a method can run to two thousand words at no spawn cost. Each ends with the checklist that is that row's definition of done, and `playbooks/review-rubrics.md` is what the reviewer checks before each gate.

Thirty-odd scripts do the work that must not depend on remembering: routing, planning,
scaffolding, state transitions, hashing, approvals, board sync, version and run records, the
four checks, and the release.

---

## What you get

**A brief that lists its conflicts.** Every file in the folder indexed, every disagreement
between two files as a row, every missing decision as a question on the board.

**References from your sites only.** Each with a URL, a retrieval date and the brief line it
serves. A site that could not be reached is a gap, never a reference.

**A script you edit directly.** One file per version. The version you select on the board is the
one the lock binds.

**A storyboard in one style.** Panel ids that never move, story order and shoot order kept
apart, one sample panel before any batch.

**A shot list the crew can trust.** Stable ids, grouped labels preserved, every row traced to a
scene and a panel, checked by a script.

**Your templates, pre-filled and honest.** Budget and timeline from the client's files, unknown left
unknown, sample dates removed.

**Registers you fill, on the board.** Six fields per talent. Cost and loading flow into the
budget; availability flows into the affected day sheets only.

**A breakdown and day sheets in the client's layout.** Column order preserved, continued rows never
duplicated, shooting order kept as selected, overnight blocks computed, conflicts flagged.

---

## What it costs

**Everything but the storyboard panels is free.** Intake, references, script, shot list,
budget, timeline, audio, registers, breakdown and call sheets are text and spreadsheets.

| Step | Cost |
|---|---|
| Everything except panels | **Free** |
| Storyboard panels | 1 credit each, the sample first |
| Regenerating one panel | 1 credit |

`credit_ceiling_per_job` in `CONFIG.md` is the hard limit, and it is 40. Two checks run
before any spend: `check-3echo.js` confirms 3echo is answering and the balance covers the
board; `preflight-media.js` confirms one asset reaches disk.

---

## Install

### 1. Add the plugin

```bash
/plugin marketplace add 3echo-dev/onedash-1-22
```

```bash
/plugin install onedash-1-22@3echo
```

Or try it without installing:

```bash
claude --plugin-dir ./onedash-1-22
```

### 2. Dependencies

A `SessionStart` hook checks these every session and says what is missing.

**Required:** `python -m pip install Pillow`

**Recommended:** `winget install Gyan.FFmpeg` and `python -m pip install yt-dlp`, for watching
a reference clip. Without them the reference row says what was not analysed.

### 3. Connect 3echo

Declared in `.mcp.json`. Needed only for storyboard panels.

### 4. Pick a folder to work in

```bash
node scripts/set-root.js "D:/onedash"
```

Or pass `--root`, or set `ONEDASH_ROOT`, or run in the folder you want. The first run makes
`workspaces/`, `inputs/` and `.board/` itself, and turns the guards on.

### 5. Onboard a client, once

`/1-22`, then **Onboard a client**. Give it the client's name, the client's site list, and his four
template files: budget, timeline, breakdown, call sheet. Unpack his skills zip under
`workspaces/{client}/client/skills/`. The plugin wraps them there and never copies them.

---

## Use

### Start

```
/1-22
```

It reads what is on disk, opens the board beside the chat, and asks whether to start a
project, resume one, or onboard a client.

```
/new-project htf "One Dash / Projects / HTF Night Shift"
```

Four questions in one batch: script format, storyboard style, trailer, shoot days. Then it
pulls, routes, plans, opens the project on the board and runs Stage 1.

### Gate A: creative lock

On the board: select the script version, approve the storyboard after its sample, approve the
shot list, accept the budget and timeline templates, tick the references. Then press Lock Gate A.

```
Lock it.
Scene 4: the porter speaks first.
Redo P07 in the same style, wider.
```

A change to the script sends the board and the shot list back for review and reopens Gate A
only. Nothing downstream regenerates until you approve again.

### Gate B: logistics lock

Enter talents, props and locations on the board, or mark a register not applicable. Answer
the audio questions. Unknown blocks the gate; not applicable does not.

### Gate C: documents released

Assign breakdown rows to shoot days on the board. The production lead approves each day's
sheet. The release package is built only from approved sheets.

### Resume

```
/resume-project htf
```

Lands what the board decided, reconciles `status.md` against disk, and continues. It will not
walk through a gate you did not lock.

---

## Where it runs

| Environment | How |
|---|---|
| **Claude Code CLI / Desktop** | `/plugin marketplace add` then `/plugin install`, or `--plugin-dir` |
| **Desktop app, Code tab** | The board opens in the pane beside the chat through `preview_start`; the address never appears in chat |
| **Cowork, claude.ai** | Same skills; you open the board yourself. Generation works, downloads may not |
| **With the guards on** | `"env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" }` in `.claude/settings.json`. See `CONFIG.md` |

### The board

The 1-22 Control artifact is the decision surface: stage cards, XX registers, the three gates,
the inbox, the council log, and every director's prompt, output and trace. Scripts queue what
they have to say; the orchestrator pushes it after every row and lands what you did before every
decision. `docs/SHARED-RULES.md` has the procedure.

---

## Verify

```bash
node scripts/test/run-all.js
```

Routing, states, approvals and hash binding, board sync, the four checks, scaffolding, argument
parsing, frontmatter safety, file size and provenance. No network and no API calls.

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) is how the pieces fit.
[`docs/FLOW.md`](docs/FLOW.md) is every path a project can take.
[`docs/AUTHORING.md`](docs/AUTHORING.md) is the house style for a new agent or skill.

---

## Provenance

The kernel is [social-media-pipeline](https://github.com/3echo-dev/social-media-pipeline) by
3echo, MIT. The 1-22 skin is new. [`docs/THIRD_PARTY_SOURCES.md`](docs/THIRD_PARTY_SOURCES.md)
lists every borrowed file with its licence.

---

## Requirements

Claude Code or Cowork with subagents · Node 18+ · Python 3.9+ with Pillow · a 3echo workspace
for storyboard panels · the client's templates and skills for the client · ffmpeg and yt-dlp optional.
