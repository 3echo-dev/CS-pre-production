# Playbook: budget sheet and timeline

Read by `production-planner` at rows 1e and 1f, and again when a register row lands or a shoot day is issued. Outputs: `budget.xlsx`, `timeline.xlsx`, copied from `client/templates/` and filled, with markdown mirrors `budget.md` and `timeline.md`. Both are XX items: the planner pre-fills what it can trace, the person enters the rest and accepts the template on the board. The client's project timeline is the standard for the calendar; the budget template is the client's and is never drafted by the plugin.

## 1. Before either sheet

1. Confirm `client/templates/budget.xlsx` and `client/templates/timeline.xlsx` exist. A missing template stops the row with a question. Never draft a template, never borrow one from another client.
2. Copy each template into the job folder unchanged: same sheets, same columns, same order, same formulas. Restructuring a template is the one thing this director must never do.
3. Read `brief.md` (deliverable, dates, budget band, Limits), `shot-list.csv`, `job.json` (`hasTrailer`, `shootDays`), `workspace.json` (currency, approvers), and `registers/talents.json` if it has landed.

## 2. Cell states

Every cell you touch is in exactly one state, and the mirror says which:

| State | Written as | Meaning |
|---|---|---|
| unknown | `unknown` | nobody has said. A question for the person. |
| estimated | the figure, with `est.` and the source in the notes column | derived from the shot list or a template rate the person accepted |
| entered | the figure, with `by {role} {date}` | typed by a person on the board or in the sheet |
| quoted | the figure, with the vendor and date | a quote the person recorded |
| not applicable | the template's own N/A mark, with who decided | a line this job does not need |

Zero is a value a person entered. It is never a placeholder. An empty cell is never written.

## 3. Budget sheet

- Currency comes from `workspace.json`. Written as the code then the amount with thousands separators: `SGD 5,000`. If the workspace is silent, currency is a question, not a default.
- Every figure has a source in the notes column or the mirror: a shot-list count, a register row, a rate the person named, a quote. A figure with no source is deleted.
- Talent cost and loading are copied from `registers/talents.json` once a row exists there, one talent per line, never typed twice and never estimated before the register has them.
- Line counts derive from the shot list where they can: shoot days from `shootDays` once answered, locations from the locations register, key props and art from the props register, vehicles and stunts from rows whose notes say `vehicle` or `stunt`, VFX and animation from rows whose notes say `VFX`.
- Rate source is named per section: the client's template rate, a vendor quote, or `unknown`.
- Spend approvers are the workspace's `approvers.release` and `approvers.finance` roles. Who approves spend is a question if the workspace is silent.
- The mirror ends with a list titled "What you have to enter", one line per unknown cell, grouped by section.

## 4. Timeline

The client's timeline is a month-per-page calendar with events written in date cells. Reproduce that shape in the template and in the mirror. Event types, each a separate entry on its own date, never merged:

| Event type | Written as | Notes |
|---|---|---|
| Rehearsal window | `Talent rehearsals window` across its dates | from the person |
| Shoot window or shoot day | `Shoot window` across dates; `Shoot day n` once call sheets issue | shoot days come from row 3d, never invented |
| Animation, VFX or graphics work | `{Work type} work` across dates | from the brief or a question |
| Submission | `{Company} submission: {deliverable} cut n` | one per round |
| Client feedback | `{Client} feedback: {deliverable} cut n` | one per round, dated separately from the submission |
| Client approval | `{Client} approval: {deliverable} final` | separate from feedback |
| Final delivery | `Final delivery: {deliverable}` | one per deliverable |
| Test days | `Video test days` | screen or venue checks before an event |
| Event days | the event's name | from the brief |
| Public holidays | the holiday's name | from the calendar for the workspace's country |

Rules:
- Main film and trailers are separate deliverables with separate submission, feedback, approval and delivery rows when `hasTrailer` is true. Trailer lengths are listed in the deliverable name, `Trailers [15s, 30s, 60s]`, from the brief.
- Rounds: the number of cut rounds is a question. House default when the person has not answered: four cuts plus final for the main film, three cuts plus final for trailers, with feedback dated five to seven days after each submission. Every defaulted date is marked `est.` and listed under "What you have to confirm".
- Submission, feedback, approval and delivery are four different events. Never one cell.
- Sample dates from the template are deleted before anything is written. A date is real only when a person entered it or a call sheet issued it.
- Dates are written `DD MMM YYYY`. Times, where they appear, in 24-hour form.

## 5. Change propagation

- A talent's cost or loading lands: update that talent's line in the budget only, note the register row, and say which line moved.
- Availability lands: the timeline does not change; the call sheet builder is told.
- A shoot day is issued at Gate C: write `Shoot day n` on that date in the timeline, replacing the window entry for that date, and update the shoot-day count in the budget.
- Never overwrite a cell in state `entered` or `quoted`. A re-spawn reads the file back first.

## 6. Questions for the board

Options first, recommended first, a real "not decided" among them. Typical: currency if silent; number of cut rounds; who approves spend; whether animation or VFX work runs in parallel with the shoot; the rehearsal window.

## Checklist before you deliver

1. Both files are unchanged copies of the client's templates: same sheets, columns, order, formulas.
2. Every touched cell is in one of the five states and the mirror names the state and the source.
3. No empty cell and no placeholder zero anywhere you wrote.
4. Currency is the workspace's, written as code then amount, or is a question.
5. Talent cost and loading came from the register or are `unknown`; nothing was estimated for a talent.
6. Every figure has a named source; every rate section names its rate source.
7. The timeline has separate entries for submission, feedback, approval and delivery per deliverable and per round.
8. Main film and trailers are separate rows when `hasTrailer` is true, with trailer lengths named.
9. No template sample date survives; every defaulted date is marked `est.` and listed to confirm.
10. Public holidays and event days for the window are on the calendar.
11. The mirrors end with "What you have to enter" and "What you have to confirm" lists.
12. On a re-spawn, no `entered` or `quoted` cell changed.

Sources: `docs/sources/planning.md`.
