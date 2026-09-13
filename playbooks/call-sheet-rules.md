# Playbook: call sheets

Read by `call-sheet-builder` at row 3b and on every revision. Output: one `call-sheets/day-{d}.xlsx` per shoot day in the client's template, a `day-{d}.md` mirror, and `validation/call-sheet-check.md`. The client's Day 9 call sheet is the standard. Gate C releases each day's sheet separately, by the production lead, and a released sheet is never edited.

## 1. Before any sheet

1. `client/templates/call-sheet.xlsx` exists and `shootDays` in `job.json` is answered. Either missing stops the row with a question.
2. `registers/days.json` has landed from the board: for each day, the shot labels assigned in the selected shooting order, the call time, the location ids, and any second unit. Day assignment and order are a person's decisions; the builder never chooses them.
3. Read the breakdown (rows by label), the talents and locations registers, the audio sheet (Diegetic, MOS, sync), and the timeline for the date.

## 2. The blocks, in the client's layout

Reproduce every block the template has, in its place. The client's sample has these:

| Block | Fields | Source |
|---|---|---|
| Header | project name, company, page number, sheet version `V{n}_{YYMMDD}` | job, version |
| Shoot details | date written in full (`Wednesday, 26 August 2026`), `Shoot Day n of N` | days register, shootDays |
| Production crew contacts | primary and secondary points of contact with phone numbers | workspace or a question; never invented |
| Call times by department | department, time, location; production first, then crew departments, then client and agency, then profiles and cast | days register call time plus template offsets, or a question |
| Profiles and cast | name (role), call time, location; numbered `1.`, `2.` in the order the schedule uses | talents register, only those on this day's rows |
| Vehicle information | production, camera, lighting, art, personal vehicles with plates | a question; blank plates never invented |
| Instructions to all crew | numbered list; the template's standing lines plus location-specific safety lines from the location register or brief Limits | template, register, brief |
| Locations | number, timing, address, loading and parking, weather line, nearest hospital with address | locations register; weather and hospital are questions if the register lacks them |
| Schedule | see section 3 | breakdown, days register, audio sheet |
| Wrap | `Location Wrap` as the last row, with the hour marker | computed |

## 3. The schedule table

Columns, in the client's order: `TIME | DUR (hrs) | SCENE/SHOT | DESCRIPTION | Frame reference | AUDIO | INT/EXT | LOCATION | CAST | ART | DIALOGUE | Notes`.

- Hour markers: the first column of each hour carries `0h`, `1h`, `2h` from the production call.
- Times as `h:mm AM/PM` ranges; durations as `h:mm`.
- Fixed rows the template expects: producers and production team call, crew call, security clearance and company move where the location needs it, equipment move, meals (a meal of 30 minutes at least every five hours), team brief, choreography or rehearsal blocks when the day has stunt or vehicle work, `Set up for {label} | Director Brief` before each shot block, `MAIN UNIT TEAR DOWN`, `Location Wrap`.
- Shot rows: label in SCENE/SHOT; description from the breakdown, shortened; frame reference is the panel id or the shoot board page; AUDIO is `Diegetic`, `MOS` or `Sync` from the audio sheet; INT/EXT from the script heading; LOCATION as the register's short name; CAST as the numbered list from the cast block; ART as key props on that row; DIALOGUE as the script lines spoken in that shot, character name uppercase; Notes carries the camera movement.
- Set-up durations, house defaults when the person has not given them: 20 minutes for a like-for-like next shot, 30 minutes for a new camera position at the same location, 45 minutes to 1 hour 30 for a new location or a stunt reset. A shot block itself is 15 to 20 minutes for coverage, 20 to 30 for a master. Every defaulted duration is marked `est.` in Notes.
- Shooting order is kept exactly as the days register lists it. Never resorted, never renumbered, never grouped by location for convenience. A better order is a question.

## 4. Overnight days

- Times continue past midnight without resetting; the hour marker keeps counting. `11:05 PM to 12:35 AM` is `1:30` and the marker on the next row is the next hour.
- The date in Shoot details is the call date; the wrap time is written with its AM and the sheet says the day runs overnight in Notes.
- The client's sample pattern is a 90-minute set-up block for a location move at night; use it as the default for a night company move when the person has not given a duration.

## 5. Parallel units

- When the days register marks a second unit, lay its rows beside the main unit's rows for the same time range, each labelled with its unit.
- Flag any talent, location or key prop both units need in the same range in `validation/call-sheet-check.md` as a conflict; the sheet is not released with an unflagged conflict.
- The main unit's tear down may overlap a second unit's plate shot; that is allowed and is the client's own pattern.

## 6. Cast and availability

- Cast calls list only talents on this day's rows, with the register's call time offsets.
- A talent whose availability in the register is `unknown` or does not cover the date blocks the sheet. The check names them; the answer is a register update on the board, not a guess.
- A location whose availability is `unknown` blocks the same way.

## 7. Release and revision

- Each day is released separately at Gate C by the production lead named in the workspace. The sheet's version and date are in the header.
- A released sheet is never edited. A change is a new version file and Gate C is asked again for that day only.
- An availability change reaches only the days that talent or location is on.

## Checklist before you deliver

1. One sheet per day in the days register, each a copy of the template with every block in its place.
2. Shoot details carry the full date and `Day n of N`.
3. Contacts, vehicles, weather and hospital are from a register, the workspace or a question; nothing is invented.
4. The schedule keeps the days register's shooting order exactly, with set-up, brief, meal, move, tear-down and wrap rows around the shots.
5. Every shot row has label, description, frame reference, AUDIO word, INT/EXT, location, numbered cast, art, dialogue and movement.
6. Every defaulted duration is marked `est.`; a meal falls at least every five hours.
7. Overnight times continue past midnight with hour markers counting up.
8. Cast and location availability cover the date for every row; no `unknown` survives on a sheet.
9. Parallel units are side by side and every shared-resource clash is in the check report.
10. The header carries version and date; no earlier version was overwritten.
11. `call-sheet-check.js` exits 0 for every day.

Sources: `docs/sources/call-sheet.md`.
