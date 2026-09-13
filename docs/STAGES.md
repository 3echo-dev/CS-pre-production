# Stages the person sees

The board shows a project as eight stages in plain words, not as plugin states or workflow row numbers. This file is the one mapping between them; `scripts/lib-stages.js` is the same mapping as data, and a test checks the two agree.

The orchestrator reports a stage with `stage.js {job-id} <stage-id> running|done --substep "<line>" --agents "<seat>:running"`. `set-state.js` posts the stage of every state it moves, so a state change needs no second call.

## Project stages

| Stage id | What the person reads | Sub-steps while it is current | Workflow rows and states it covers |
|---|---|---|---|
| `opening` | Opening | Waiting for the Drive folder, Reading the brief | Open, Intake; `INTAKE_PENDING`, `PLANNED` |
| `stage-1-creative` | Stage 1, creative | Scraper, Script, Storyboard, Shot list, Budget sheet and timeline | rows 1a to 1f; `BRIEF_READY` through `PLANNING_DRAFTED` |
| `gate-a` | Gate A, creative lock | | `AWAITING_GATE_A`, `GATE_A_PASSED` |
| `stage-2-logistics` | Stage 2, logistics | Audio, talents, props, locations | rows 2a to 2d; `LOGISTICS_OPEN` |
| `gate-b` | Gate B, logistics lock | | `AWAITING_GATE_B`, `GATE_B_PASSED` |
| `stage-3-documents` | Stage 3, documents | Concept breakdown, Call sheets | rows 3a, 3b; `BREAKDOWN_DRAFTED`, `CALL_SHEETS_DRAFTED` |
| `gate-c` | Gate C, documents released | | `AWAITING_GATE_C` |
| `released` | Released | | row 3d; `RELEASED`, `COMPLETE` |

Short spellings the board also accepts: `intake`, `stage1`, `gate_a`, `stage2`, `gate_b`, `stage3`, `gate_c`, `released`. These are also the values of `projects/{id}.status` on the board.

Gate stages are reported by the gate record, never by the run: a gate is "waiting" the moment the awaiting state is set, and "done" when the person locks it.

## Client onboarding stages

Onboarding a client has its own short list, used only by the `1-22` skill's onboard path: `reading-the-handoff`, `a-few-questions`, `writing-the-client-files`, `your-approval`, `done`.

## Who the person sees working

`stage.js --agents "name:running|done"` maps each name to the words below; nothing else reaches the board.

| Name given | What the person reads |
|---|---|
| `orchestrator` | Orchestrator |
| `intake-director` | Intake Clerk |
| `reference-scout` | Reference Scout |
| `script-director` | Scriptwriter |
| `storyboard-director` | Storyboard Artist |
| `shot-list-director` | Shot Lister |
| `production-planner` | Production Planner |
| `audio-supervisor` | Audio Supervisor |
| `logistics-registrar` | Logistics Registrar |
| `breakdown-compiler` | Breakdown Compiler |
| `call-sheet-builder` | Call Sheet Builder |
| `questioner` | Questioner |
| `image-maker` | Image maker |
| `reference-watcher` | Reference watcher |
| `drive-puller` | Drive puller |

A spawn is one entry. The board keeps eight, so a row with more than eight workers reports the eight it started.
