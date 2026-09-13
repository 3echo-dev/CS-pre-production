# Flow

Every path a project can take, and every point it can stop.

[`../README.md`](../README.md) is what the plugin does. [`ARCHITECTURE.md`](ARCHITECTURE.md) is
how the pieces fit. This is the sequence.

---

## The whole thing, once

```
  you / the board           scripts                    directors                 3echo
   |                         |                          |                         |
   |  "new project, htf,     |                          |                         |
   |   this Drive folder"    |                          |                         |
   +------------------------>|                          |                         |
   |                         |  drive-pull -> inputs/   |                         |
   |<- four questions -------+  project-intake          |                         |
   +- answers -------------->|  writes job.json         |                         |
   |                         |  route-job.js            |                         |
   |                         |  +- UNSUPPORTED ---------+-> stop, say what        |
   |                         |  +- BLOCKED -------------+-> "the folder has no    |
   |                         |  |                       |    Brief file"          |
   |                         |  +- ROUTED               |                         |
   |                         |  plan-job.js -> plan.md  |                         |
   |                         |  board-sync open, push   |                         |
   |                         |                          |                         |
   |                         |                          +-> intake-director       |
   |                         |                          |   brief.md              |
   |                         |  collect-artifacts.js <--+ verify on disk          |
   |                         |  record-version, record-run, set-state, push       |
   |                         |                          |                         |
   |                         |                          +-> reference-scout       |
   |<= XX: tick references on the board ================+   references/board.md   |
   |                         |                          +-> script-director       |
   |                         |                          |   script/v1.md          |
   |                         |                          +-> storyboard-director   |
   |                         |                          |   panels.md, manifest   |
   |<- quote: N credits, go ahead? --------------------+                         |
   +- yes ------------------>|  check-3echo, preflight  +-------------------------->|
   |<- the sample panel, on the board -----------------+<-- P03.png --------------+
   +- approve sample ------->|                          +-- the batch ------------>|
   |                         |                          +-> shot-list-director    |
   |                         |  shot-list-check.js      |   shot-list.csv         |
   |                         |                          +-> production-planner    |
   |<= XX: budget, timeline on the board ===============+   budget.xlsx, timeline |
   |                         |                          |                         |
   |<== GATE A == lock the creative on the board ===================================+
   |   select script version, approve board, shot list, templates, references     |
   +- Lock Gate A ---------->|  land, pull --gate A     |                         |
   |                         |  record-approval.js      |                         |
   |                         |                          +-> audio-supervisor      |
   |<- question: which VO voice? ----------------------+   audio.md              |
   |                         |                          +-> logistics-registrar   |
   |<= XX: talents, props, locations on the board ======+   skeletons             |
   +- rows entered --------->|  land -> registers/*.json|                         |
   |                         |  gate-b-check.js         |                         |
   |<== GATE B == lock the logistics on the board ==================================+
   +- Lock Gate B ---------->|  land, pull --gate B     |                         |
   |                         |                          +-> breakdown-compiler    |
   |                         |  breakdown-check.js      |   breakdown.xlsx        |
   |<- question: rows to days? -------------------------+                         |
   +- days assigned -------->|  land -> registers/days  +-> call-sheet-builder    |
   |                         |  call-sheet-check.js     |   call-sheets/day-*.xlsx|
   |<== GATE C == release each day sheet on the board ==============================+
   +- approve day 1, day 2 ->|  land, pull --gate C     |                         |
   |                         |  check-approval.js       |                         |
   |<- release/ -------------+  build-release.js        |                         |
   |                         |  shoot days -> timeline, push                      |
```

After every row: `record-version.js`, `record-run.js`, `set-state.js`, `board-sync.js push`.
Before every decision: read the board, `board-sync.js land`.

---

## The one workflow

`workflows/1-22.md`. Every row runs on every project; the two tags only add milestones.

```
 0   Open               drive-pull, job.json, route, plan, board open       PLANNED
 0a  Intake             brief.md                                             BRIEF_READY
 1a  Scraper       XX   references/board.md                                  REFERENCES_READY
 1b  Script             script/v{n}.md                                       SCRIPT_DRAFTED
 1c  Storyboard         storyboard/v{n}/  sample, then batch                 STORYBOARD_DRAFTED
 1d  Shot list          shot-list.csv  (shot-list-check.js)                  SHOT_LIST_DRAFTED
 1e  Budget sheet  XX   budget.xlsx                                          PLANNING_DRAFTED
 1f  Timeline      XX   timeline.xlsx                                        PLANNING_DRAFTED
 1g  Gate A             approvals/A-n.json                              +--- GATE A
 2a  Audio              audio.md                                             LOGISTICS_OPEN
 2b  Talents       XX   registers/talents.json                               LOGISTICS_OPEN
 2c  Props         XX   registers/props.json                                 LOGISTICS_OPEN
 2d  Locations     XX   registers/locations.json                             LOGISTICS_OPEN
 2e  Gate B             approvals/B-n.json  (gate-b-check.js)           +--- GATE B
 3a  Concept breakdown  breakdown.xlsx  (breakdown-check.js)                 BREAKDOWN_DRAFTED
 3b  Call sheets        call-sheets/day-d.xlsx  (call-sheet-check.js)        CALL_SHEETS_DRAFTED
 3c  Gate C             approvals/C-n.json per day, release/            +--- GATE C
 3d  Shoot days         timeline.xlsx updated, final push                    RELEASED
```

Tags: `has_trailer` adds trailer milestones to the timeline; `multi_day` adds one call sheet
per day and the day-assignment question.

---

## The three gates

| Gate | After | Passes when | Who | Not applicable |
|---|---|---|---|---|
| A, creative lock | Stage 1 | script version selected; storyboard approved in its one style after the sample; shot list approved; budget and timeline templates accepted; references selected | the creative director; the assistant accepts the templates | never |
| B, logistics lock | Stage 2 | talents, props and locations entered or explicitly not applicable; audio approved | assistant enters, the creative director confirms | allowed on the three registers |
| C, documents released | Stage 3 | breakdown checked against a sample; every shoot day's sheet approved | production lead, per day | never |

A gate is locked on the board. `board-sync.js pull` binds the record to the file hashes; a file
that changed after the lock makes the lock fail, and the item is re-presented.

Before each gate row (1h, 2f, 3c) a review pass runs: the check scripts first, then a reviewer
spawned with no memory of the work, reading against the gate's section of
`playbooks/review-rubrics.md`. A critical finding re-enters the owning row through
`revisions/{n}.json`; after two rounds the gate opens with the warnings attached, and the person
decides with them in view.

---

## XX items

Six items wait on a person. The director prepares a skeleton or a pre-filled template; the item
shows the tape stamp on the board; the person fills it there; the rows land on disk through
`board-sync.js land`. The orchestrator carries on with rows that do not need the answer: audio
does not wait for talents. `unknown` is a question and blocks Gate B; `not applicable` is a
decision with a name on it and does not.

---

## Change propagation

```
a person presses Change on an approved item
        |
        +- the item and every dependent item go to needs review on the board
        +- only that item's gate reopens
        +- an inbox row of type change lands
        |
orchestrator lands it, writes revisions/{n}.json, re-enters the owning row
        |
        +- 1st time  -> the director revises only what the note requires
        +- 2nd time  -> again
        +- 3rd time, same code, same row  -> ESCALATED: all three findings shown, stop
```

| Changed | Sent back for review |
|---|---|
| brief | everything |
| script | storyboard, shot list, budget, timeline, audio, props, locations, breakdown, call sheets |
| storyboard | shot list, audio, props, locations, breakdown, call sheets |
| shot list | budget, timeline, registers, breakdown, call sheets |
| any register or audio | breakdown, call sheets |
| timeline | call sheets |

Previous versions are never deleted. Nothing downstream regenerates until the changed item is
approved again.

---

## Where it can stop before spending

| Check | Catches |
|---|---|
| `route-job.js` rule 3 | No Brief file in the pull |
| The quote question | No yes on record |
| `check-3echo.js` | 3echo unreachable, or the balance will not cover the board |
| `preflight-generation.js` | Manifest disagrees with the panel table, or over the ceiling |
| `preflight-media.js` | Generated files cannot reach disk |
| The sample panel | One credit, approved on the board before the batch |

---

## Resuming

```
/resume-project htf
        |
        +- open the board pane
        +- read status.md
        +- read the board, board-sync.js land
        +- reconcile: the files win over the header
        +- at a gate: pull; no record yet means stop and say what is waiting
        +- continue from the first row whose file is missing
```

It will not walk through a gate you did not lock. A project left at Gate B a week ago is still
waiting there, with the registers it was waiting on.

---

## The second project for a client

Nothing carries over. Every register is empty per project: a talent from the last job is not on
this one until a person enters them again. What does carry over is the client folder: the
sites, the templates and the skills, so the second project asks four questions and nothing else.
