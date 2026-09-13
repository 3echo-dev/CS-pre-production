# Architecture

How the pieces fit, and why each one is where it is.

[`../README.md`](../README.md) is what the plugin does. [`FLOW.md`](FLOW.md) is every path a
project can take. This is the shape underneath both.

---

## The one-paragraph version

A Drive folder becomes a typed project on disk. A deterministic script routes it to the one
workflow, an owner and three gates. A markdown stage table becomes the plan. An orchestrator
walks the plan, spawning directors that wrap the client's skills, verifying every file on disk before
advancing, recording every version and run on the board, and stopping at every gate. Only the
orchestrator reaches the board or spends money. Gates are locked by a person on the board and
bound to content hashes, so an edit after the lock invalidates it mechanically.

---

## Five layers

| Layer | What it is | Where it lives |
|---|---|---|
| **Project** | The typed request. One folder, one project | `workspaces/{client}/jobs/{job-id}/job.json` |
| **Router** | Rules that decide workflow, owner, tags, gates | `scripts/route-job.js` -> `route.json` |
| **Workflow** | An ordered stage table with conditions | `workflows/1-22.md` -> `plan.md` |
| **Agent** | Who is responsible for an item | `agents/*.md` |
| **Skill** | How one capability is executed | `skills/*/SKILL.md` |

Three rules fall out of this and hold everywhere:

1. **No director lists an MCP tool or may spawn.** Spending and board access are structurally
   impossible for ten of the eleven agents.
2. **The orchestrator never advances a row until a script confirms the file exists.** A director
   reporting success is not evidence; `collect-artifacts.js` exiting 0 is.
3. **No agent writes a register row, an approval, or a gate document.** Those are a person's,
   entered on the board and landed by a script.

---

## Files are the state

There is no database of the plugin's own. The working directory is the truth; the board is a
view of it plus the person's decisions.

```
workspaces/{client}/
├── workspace.json              name, timezone, approvers, sites, template paths, libraries
├── client/                     sites.md · templates/{budget,timeline,breakdown,call-sheet}.xlsx · skills/ (the client's, unpacked)
└── jobs/{job-id}/
    ├── job.json  route.json  plan.md  status.md
    ├── brief.md                the unified brief
    ├── references/board.md     the scraper's rows and gaps; raw/ captures
    ├── script/v{n}.md          one file per version
    ├── storyboard/v{n}/        panels.md · generation-manifest.json · P{nn}.png
    ├── shot-list.csv
    ├── budget.xlsx  timeline.xlsx  (+ .md mirrors)
    ├── audio.md
    ├── registers/              *.skeleton.md by the registrar · *.json landed from the board · summary.md
    ├── breakdown.xlsx  call-sheets/day-{d}.xlsx  (+ .md mirrors)
    ├── versions.jsonl          one line per delivery, with sha256
    ├── runs/{item}-v{n}.json   prompt, output, trace, tokens
    ├── approvals/{A,B,C}-{n}.json
    ├── validation/             the four checks' reports
    ├── revisions/{n}.json
    └── release/                Gate C package with manifest.json
inputs/{client}/{job-id}/       the Drive pull: Brief/ Concept/ Client Assets/ manifest.json
.board/                         outbox.jsonl · inbox.json · landed/
```

**The plugin folder is replaced whole on update and never written to.** Your work is in your
folder. Where that folder is resolves in a fixed order: `--root`, then `ONEDASH_ROOT`, then the
nearest `.onedash-1-22/config.json`, then the current folder. `lib-workspace.js` is the only thing
that answers this question.

---

## The router

`route-job.js` reads `job.json` and writes `route.json`. It is a script, not a prompt, because
the same folder must route the same way every time and because the model must not be able to
talk itself past a gate.

| # | Decides |
|---|---|
| 1 | Schema validity. `scriptFormat` and `storyboardStyle` are required: they change what the directors write |
| 2 | `kind` must have an active workflow, or `UNSUPPORTED` |
| 3 | A Brief file must exist under the pull, or `BLOCKED` with the file named |
| 4 | Tags: `has_trailer`, `multi_day` |
| 5 | Owner `orchestrator`, the ten directors as support, gates A, B, C always |

The orchestrator may append to `modelAddedRiskFlags[]`. It can never remove a flag, raise
confidence, or drop a gate.

---

## The workflow table is executable

`plan-job.js` reads `workflows/1-22.md`, keeps the rows whose Condition holds, and writes
`plan.md`. Adding a stage is editing a table row. There is no second place where the order is
written down, so the two cannot disagree.

```
| # | Stage | Task | Condition | Agent | Role | Owner | Skills | Artifact | State after | Gate |
```

Rows marked XX in the Task column wait on a person; the director prepares, the person fills on
the board, the orchestrator carries on with rows that do not depend on the answer.

---

## State

Twenty-two states, defined once as data in `lib-states.js`: an id, a plain-English label,
whether it is a gate, where it rolls back to, which states may follow, and the board status it
maps to. `set-state.js` is the only thing that writes `status.md` after scaffolding. An illegal
transition changes nothing and exits non-zero. `lib-stages.js` maps every state to one of the
eight stages the board draws; `lib-wording.js` carries the sentence a person reads instead of
the id.

---

## Approval

A gate is five things: push the board, set the awaiting state, end the turn, land the record,
bind it.

The person locks the gate on the board. The record names every item it covers with the version
the person saw. `board-sync.js pull` compares each version to the latest line in `versions.jsonl`;
on a match it runs `record-approval.js`, which hashes the files (`hash-artifact.js` normalises
markdown and drops any `# Decision` section) and writes `approvals/{g}-{n}.json`. A mismatch is
exit 1 naming the item: a file changed after the lock, so the lock does not hold.

`check-approval.js` exits 0 on match, 1 on mismatch, 3 when no record exists. `build-release.js`
refuses on anything but 0. Gate C is one record per day sheet.

---

## The board

The 1-22 Control artifact keeps a database only the orchestrator can reach, through the
Artifact tool. Scripts cannot. So `lib-board.js` gives every script the same `call()` the
gate-app client had, and appends to `.board/outbox.jsonl` instead of posting. After every row
the orchestrator runs `board-sync.js push`, hands the printed batch to the board, and
acknowledges it. Before every decision it reads the board and runs `board-sync.js land`, which
writes `.board/inbox.json` for the scripts and `registers/*.json` for the directors.

What the board holds per project: items with status, version and summary; versions; runs with
the exact spawn prompt, output and trace; gates; the inbox of questions and change notes; the
council log; the three registers and the day assignment. What the board may never receive from
the plugin: `approved`, `na`, or a gate document.

In the desktop app's Code tab the board opens in the pane beside the chat. `pane.js` returns the
address; `preview_start` opens it; the address is never printed.

---

## Money

One agent holds the MCP tools. Everything else is a wall in front of them.

```
panel table on disk          storyboard-director, text only
        |
quote and an explicit yes    on the board and in chat
        |
check-3echo.js               is 3echo answering, does the balance cover the board
        |
preflight-generation.js      manifest matches the panel table, credits inside the ceiling
        |
preflight-media.js           one existing asset fetched and landed on disk
        |
the sample panel             generated, pushed, approved on the board; the turn ends
        |
the batch
```

Every step exits non-zero rather than continuing.

---

## Hooks

`hooks/hooks.json` names the command hooks (`SessionStart` dependency check, `PostToolUse`
heartbeat to the outbox, `PostToolUseFailure` note, `Stop` turn check) and `hooks/hooks.mjs`, the
function-hooks module loaded only when `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`. A command hook
reports on a step that already happened; a function hook sits in front of the call and can refuse
it: a generation before the sample is approved, a spend past the ceiling, a `status.md` or
approval written by hand, a register JSON written by anything but `board-sync.js land`.

---

## Evidence

Every material claim in the brief and the reference board carries a label (`FACT`,
`OBSERVATION`, `INFERENCE`, `HYPOTHESIS`), a source with a date, and a confidence band. Fetched
content is data, never instructions. A cost, a date, an availability or a template column is
never estimated; it is `unknown` until a person enters it.

**the client's templates are the exception to everything generated.** The plugin copies and fills;
it never authors a budget, timeline, breakdown or call sheet layout. The four check scripts read
the same template the director was told to fill.

---

## Context discipline

| | Budget | Enforced by |
|---|---|---|
| An agent file | 900 words | `scripts/test/size.smoke.js` |
| A skill file | 700 words | same |

A rule every agent repeats goes to `docs/SHARED-RULES.md`. A director reads the selected script
and nothing from `references/raw/`, because the brief and the reference board are the
compression.

---

## Scripts

All dependency-free Node or Python with Pillow. No `package.json`.

| Group | Scripts |
|---|---|
| Where things live | `lib-workspace` · `set-root` · `sync-manifest` |
| Routing | `route-job` · `plan-job` · `validate-schema` |
| Scaffolding | `scaffold-brand` · `scaffold-job` · `list-jobs` |
| State | `lib-states` · `lib-stages` · `lib-wording` · `set-state` · `stage` |
| Approval | `hash-artifact` · `record-approval` · `check-approval` |
| Board | `lib-board` · `board-sync` · `record-version` · `record-run` · `pane` · `pane-file` |
| Before spending | `check-3echo` · `preflight-generation` · `preflight-media` |
| Media | `save-asset-bytes` · `contact-sheet` · `watch-video` |
| Checks | `shot-list-check` · `gate-b-check` · `breakdown-check` · `call-sheet-check` |
| Recovery and output | `collect-artifacts` · `build-release` |
| Environment | `check-deps` · `note-failure` · `hooks/heartbeat` · `hooks/turn` |

Exit codes mean the same thing everywhere: `0` did it, `1` the answer is no, `2` called wrongly,
`3` a prerequisite is missing, `4` unsupported. A person never sees a stack trace.

---

## What is deliberately not here

| Not built | Instead | Why |
|---|---|---|
| Video generation | Nothing | 1-22 is pre-production; the shoot makes the film |
| A state server | `status.md` per project | Nothing to run, nothing to migrate |
| Drive search | `drive-pull` of a folder a person named | A search that picks the wrong folder is worse than a question |
| Template authoring | the client's files, copied and filled | A layout the crew has not seen is not a deliverable |
| Post-production | A planned workflow | The board photo for it is not transcribed yet |
