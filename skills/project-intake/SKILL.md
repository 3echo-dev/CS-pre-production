---
name: project-intake
description: >
  Turns a pulled Drive folder into a validated job.json: script format, storyboard style,
  trailer, shoot days, the file lists under Brief, Concept and Client Assets, and the approvers.
  Asks only the blocking questions, once, on the board and in chat, then runs the deterministic
  router and planner. Use at stage 0 of 1-22, and again when a route returns a missing field or
  a blocker.
metadata:
  version: 0.1.0
user-invocable: false
---

# Skill: Project intake

**Purpose:** a `job.json` the router can decide on, asking as little as possible.
**Used by:** the orchestrator at stage 0; `new-project`.

## Inputs

`inputs/{client}/{job-id}/manifest.json` from `drive-pull`; the job folder's `job.json` skeleton from `scaffold-job.js`; `workspaces/{client}/workspace.json` for approvers and templates; `${CLAUDE_PLUGIN_ROOT}/templates/job.json` for the shape and `_enums`.

## Steps

1. Fill what the folder answers without asking: `driveFolder` (the manifest's `source`: a path or a Drive link, whichever came in), `inputs.brief`, `inputs.concept`, `inputs.assets` from the manifest; `client`, `title`, `approvers` from the workspace.
2. Read the brief and concept file names and first pages for anything that states the format, the style, a trailer or shoot days. Quote it in the field's `_source` note; never infer from tone.
3. Ask the blocking questions in one batch, at most four, on the board and in chat at once (`${CLAUDE_PLUGIN_ROOT}/docs/SHARED-RULES.md`): script format (screenplay or AV script), storyboard style (sketches, live pictures, cartoon animation), trailer (yes or no), shoot days (a number or not decided yet). Options first, recommended first, a real "not decided yet" on shoot days.
4. Write `job.json`. `shootDays` stays `null` until answered; every other field is required.
5. Route:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/route-job.js" "workspaces/{client}/jobs/{job-id}/job.json" --human
   ```

   Exit 0: plan. Exit 3 with `missingFields`: ask them once more, the second and last round. Exit 3 with a blocker: it is always a file the folder lacks; ask for it on the board, set nothing else. Exit 4: say what is unsupported and stop.

6. Plan:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-job.js" "workspaces/{client}/jobs/{job-id}/route.json" --human
   ```

7. Quote the router's plain line and the planner's plain line. Nothing else.

## Rules

The shared rules in `${CLAUDE_PLUGIN_ROOT}/docs/SHARED-RULES.md` apply.

1. Two rounds of questions at most; `max_intake_rounds` in `CONFIG.md`.
2. Never fill `scriptFormat` or `storyboardStyle` from a guess. They change what every director writes.
3. The folder must hold at least one Brief file. A folder without one is a blocker, not a missing field.
4. `kind` is `preproduction`. Post-production is planned, not routed.
5. Nothing in `job.json` is a decision of yours. Every field traces to the folder, the workspace, or an answer.

## Output contract

`job.json` valid against `${CLAUDE_PLUGIN_ROOT}/schemas/job.schema.json`; `route.json` at `ROUTED`; `plan.md` with every row of `workflows/1-22.md`. The state is `PLANNED` when the planner has run.

## Boundary

Does not pull the folder (`drive-pull`), write the brief (`intake-director`), or open the board (`board-sync`).

## Failure modes

| Failure | Fix |
|---|---|
| Asking the style in prose and stopping | On the board and in chat, in one batch, then wait |
| Inferring AV script from a deck layout | Ask; quote the source if one exists |
| A third round of questions | Stop; report the two missing fields and end the turn |
| Routing before the folder is pulled | `drive-pull` first; the router checks the Brief file exists |
