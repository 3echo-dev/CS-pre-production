---
name: register-forms
description: >
  How an XX item is asked for and landed. The registrar prepares a skeleton, the orchestrator
  sets the item to needs input on the board, the person enters rows there, and the rows land on
  disk through board-sync. Covers talents, props, locations, the budget sheet, the timeline and
  the scraper selection, and the difference between unknown and not applicable. Use whenever
  a workflow row is marked XX.
metadata:
  version: 0.1.0
user-invocable: false
---

# Skill: Register forms

**Purpose:** the six XX items are filled by a person, in the shape the templates expect, and nothing in the pipeline pretends otherwise.
**Used by:** the logistics registrar (preloaded); the orchestrator at stages 1a, 1e, 1f, 2b, 2c, 2d.

## The six XX items

| Item | Who prepares | Who fills | Where the rows live | What they feed |
|---|---|---|---|---|
| Scraper | reference scout | the creative director selects | `references/board.md` selected column | script, storyboard |
| Budget sheet | production planner | assistant | `budget.xlsx` | spend approvals |
| Timeline | production planner | assistant confirms | `timeline.xlsx` | call sheets |
| Talents | logistics registrar | assistant | board `talents` then `registers/talents.json` | budget (cost, loading), call sheet (availability), breakdown |
| Props | logistics registrar | assistant | board `props` then `registers/props.json` | breakdown, call sheet art block |
| Locations | logistics registrar | assistant | board `locations` then `registers/locations.json` | breakdown, call sheet location block |

## Steps

1. The director writes the skeleton: every row the shot list implies, every cell `unknown`, source text kept in notes.
2. The orchestrator records the skeleton as a version with `--status needs_input`, so the board card shows the tape stamp and the register tab opens. Push.
3. Say in chat, in one line each, what is waiting and where: "Talents: three roles to enter on the board." Never a path, never a state id.
4. Carry on with rows that do not need the answer. Stage 2 audio does not wait on talents.
5. On the next landing, `registers/*.json` holds the rows. Re-spawn the registrar for the summary, and the planner or call sheet builder for whatever a row changed.
6. The item is approved or marked not applicable on the board by the person. The plugin never does either.

## Unknown and not applicable

`unknown` is a question: the cell is blank because nobody has answered. `not applicable` is a decision: a person said this job has no props, and the board records who and when. `gate-b-check.js` refuses a register that still has an `unknown` unless the row carries `unknownByDecision: true`, which is also the person's mark. Gate A never accepts not applicable.

## Rules

The shared rules in `${CLAUDE_PLUGIN_ROOT}/docs/SHARED-RULES.md` apply.

1. No agent types a register row. Ever. Not from an email, not from a previous job, not to unblock a gate.
2. Six fields per talent in the template's order: name, picture, age, availability, cost, loading.
3. A cost or loading that lands updates the budget sheet through the planner; an availability that lands updates only the affected call sheets. Nothing else copies a value.
4. A skeleton is re-issued when the shot list changes; entered rows are never overwritten.
5. A blank answer is an answer: the item stays needs input and the run says so once.

## Output contract

Skeleton files under `registers/`, the item at needs input on the board, and after a landing the JSON registers plus `registers/summary.md`.

## Boundary

Does not compile the breakdown, build a call sheet, or decide a gate.

## Failure modes

| Failure | Fix |
|---|---|
| Typing a talent to make Gate B pass | Delete it; the gate waits |
| Treating a blank as not applicable | `unknown`; a person marks N/A |
| Overwriting entered rows with a new skeleton | Merge: new rows only |
| Asking in chat only | Board and chat at once |
