# Settings

Claude reads this file at the start of any project and honours every value.
To change something, edit it here. Asking in conversation does not change it.

## Settings you may change

These are yours. Everything below them is machinery.

| Setting | What it does | Default |
|---|---|---|
| `max_parallel_agents` | How many directors work at once. Lower is slower and cheaper. | 3 |
| `credit_ceiling_per_job` | The most 3echo credits one project may spend on storyboard panels. | 60 |
| `require_gate_*_human_approval` | Which gates stop and wait for a person on the board. Turning one off means that stage passes without anyone locking it. | all on |
| `timezone` | The zone every timestamp in a workspace carries, unless `workspace.json` says otherwise. | Asia/Singapore |
| Where the work is kept | Not in this file. Run `set-root.js <folder>`, or pass `--root`, or set `CREATIVE_STUDIO_ROOT`. | the current folder |
| The board | Not in this file. `CREATIVE_STUDIO_BOARD_URL`, or `boardUrl` in `.creative-studio-pipeline/config.json`, written by `scripts/set-board.js` after the `board-setup` skill publishes this account's copy of `board/1-22-control.html`. No default: a board is private to the account that published it. | this account's 1-22 Control artifact |

The gate flags are the reason this thing exists rather than a script that writes call sheets on its own.
Claude will not change them on request, will not behave as though they were changed, and the write guard refuses to write this file at all.

```yaml
max_parallel_agents: 3
credit_ceiling_per_job: 60
timezone: Asia/Singapore

require_gate_a_human_approval: true        # Creative lock: the creative director, on the board
require_gate_b_human_approval: true        # Logistics lock: assistant enters, the creative director confirms
require_gate_c_human_approval: true        # Documents released: production lead, per day sheet
require_sample_panel_human_approval: true  # one panel before any batch is generated
```

## Internals

Read by scripts and agents. Enforcement is honest: **Mechanical** means a script decides and a person cannot talk past it, **Mechanical (function hook)** means `hooks/hooks.mjs` refuses the tool call itself when `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` and the written rule is the fallback when it is not, **Structural** means the agent cannot do it at all, and Instruction means it is a rule the model follows.

```yaml
# Routing
route_confidence_threshold: 0.8            # below this the project is NEEDS_CLARIFICATION
max_intake_rounds: 2                       # project-intake may ask for missing fields this many times

# Delegation
max_agent_depth: 1                         # only the orchestrator spawns; directors are leaves
collect_artifacts_after_each_batch: true   # a director reporting success is not evidence
max_machine_revisions_per_stage: 2         # third identical reason code escalates to the human

# Money
preflight_media_download: true             # prove one asset round-trips to disk before generating
one_sample_before_batch: true              # generate one panel, get it approved on the board, then the rest

# Evidence
require_sources_for_material_claims: true
registers_from_board_only: true            # no agent types a talent, prop, location, cost or date

# Board
board_push_after_every_row: true           # a version on disk the board does not show is a person waiting for nothing
board_land_before_resume: true             # the decision is probably already there

# Output style
verbose: false
```

| Setting | Meaning | Enforcement |
|---|---|---|
| `route_confidence_threshold` | `route-job.js` sets `NEEDS_CLARIFICATION` below it. The orchestrator can add risk flags, never raise confidence. | **Mechanical.** The script is the only confidence source. |
| `max_agent_depth: 1` | Only `orchestrator` spawns. | **Structural.** Every director sets `disallowedTools: Agent`. |
| `collect_artifacts_after_each_batch` | `collect-artifacts.js` must exit 0 before a stage advances. | Instruction, with the script's exit code. |
| `max_machine_revisions_per_stage` | The same reason code for the same stage twice; the third time the project goes to the person. | Instruction, counted in `revisions/`. |
| `require_gate_*_human_approval` | Each gate: push the board, set the awaiting state, end the turn; the person locks it on the board; `board-sync.js pull` binds the record to the file hashes. | Instruction, plus `check-approval.js` refusing the release without a matching approval, plus `board-sync.js pull` refusing a record whose versions no longer match disk. |
| `require_sample_panel_human_approval` | One panel is generated and approved on the board before the batch. | **Mechanical (function hook).** The first allowed image call per board locks the rest until the sample is approved on a landing. |
| `preflight_media_download` | `preflight-media.js` runs before the first generation. Exit 3 means the host is unreachable: stop before spend. | Instruction; the pre-spend gate `preflight-generation.js` is **Mechanical (function hook)**. |
| `registers_from_board_only` | Register files are written by `board-sync.js land` and nothing else. | **Mechanical (function hook)** on `registers/*.json`; Instruction elsewhere. |
| `board_push_after_every_row` | Every row ends with `board-sync.js push` and an acknowledged batch. | Instruction; `scripts/hooks/turn.js` warns when a turn ends with an outbox that was never pushed. |
| `verbose: false` | Files carry content, not explanations of the system. Chat says what is waiting and what to do. | Instruction. |

File length is not a setting. `scripts/test/size.smoke.js` enforces 900 words per agent and 700 per skill, and fails the build.

## The board

Gates, XX registers and questions are decided on the 1-22 Control board, an artifact whose database only the orchestrator reaches through the Artifact tool. Scripts queue what they have to say in `.board/outbox.jsonl`; the orchestrator pushes it as one batch after every row and lands what the person did before every decision. `docs/SHARED-RULES.md` has the procedure; the `board-sync` skill has the exact calls.

In the desktop app's Code tab the board opens in the pane beside the chat: `pane.js` returns the address, `preview_start` opens it, and the address never appears in the chat. Without the pane the fallback file is the way in. In Cowork and the CLI the board is still the decision surface; the person opens it themselves.

## Function hooks

Most of what this plugin promises is a rule the model is asked to follow. Function hooks are the first thing that can refuse a step outright, and they are off unless you turn them on. `set-root.js` and `scaffold-client.js` arm them; `check-deps.js` says at the start of every session whether they are on.

With the flag on, `hooks/hooks.mjs` refuses: a generation call before the sample panel is approved, any spend past the ceiling or without a yes on record, a `status.md` or approval record written by hand, a register JSON written by anything but `board-sync.js land`, a `# Decision` section, a write inside the plugin folder or `CONFIG.md`, and a shell heredoc. Every refusal is one plain sentence with no path and no state id in it.

## Environment notes

- Windows: use `python`, not `python3`. Use project-relative paths, never `/tmp`.
- Set `PYTHONUTF8=1` for any Python reading markdown with curly quotes.
- Cowork: MCP calls work, HTTP egress to the 3echo asset host may be blocked. `preflight-media.js` finds out for one request.
- 3echo images: 1 credit each, up to 16 references, `aspectRatio` from the brief.
- Excel templates are the client's files under `workspaces/{client}/client/templates/`; the plugin copies and fills, never authors one.

## Function hooks (the refusing guards)

`hooks/hooks.json` ships with command hooks only, because a `modules` entry stops the desktop app from syncing the plugin. The refusing guards in `hooks/hooks.mjs` still ship. To arm them in a local Claude Code checkout, add `"modules": ["./hooks.mjs"]` to `hooks/hooks.json` and set `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`; `scripts/test/hooks-lib.unit.js` proves the guards either way.
