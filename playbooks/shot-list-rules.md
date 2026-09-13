# Playbook: the shot list

Read by `shot-list-director` at row 1d and on every revision. Output: `shot-list.csv` on `templates/shot-list.csv`, checked by `scripts/shot-list-check.js`. The shot list is the join table of the whole pipeline: the breakdown has one row per shot, the call sheet schedules shots by label, and a change to a shot is what reopens Gate A. Ids are issued once and never reused.

## 1. Inputs and order of work

1. Read the current `shot-list.csv` if one exists. Every `shot_id` already issued stays issued.
2. Read the selected script for scene numbers, headings and `Camera:` lines.
3. Read the current storyboard's panel table for panel ids, crew labels and camera cells.
4. Walk the storyboard in story order. Write rows. Run the check. Fix orphans. Run again.

## 2. Columns, in the template's order

`shot_id,label,scene,panel,description,size,movement,est_duration_s,notes`

| Column | Rule |
|---|---|
| shot_id | `S{nnn}` from the next unused number. Permanent. Never reissued, never renumbered. |
| label | The crew's number, scene-shot: `1A-2`, `5C-1`, `7-3`. Grouped setups as `7/8`. Written exactly as the crew will read it on the call sheet. |
| scene | The script scene number. Must exist in the selected version. |
| panel | The panel id `P{nn}`. Must exist in the current storyboard. |
| description | One line: what the camera sees, from the panel's frame cell, plus the action beat. 12 to 30 words. |
| size | One of `EWS, WS, MS, MCU, CU, ECU, insert, OTS, POV`. |
| movement | One of `static, dolly in, dolly out, slide, pan, tilt, crash zoom, handheld follow, gimbal follow, drone, orbit, crane`. One movement per shot; a second movement is a second shot. |
| est_duration_s | Estimated on-screen seconds, 2 to 12. A held master can be longer; say why in notes. |
| notes | `hero`, `master`, `coverage of S0nn`, `dialogue`, `MOS`, `stunt`, `vehicle`, `VFX`, `retired v{n}`, or blank. |

No blank cells. An unknown value is written `unknown`, which the check reports and the summary lists.

## 3. Panels to shots

- One panel is one shot by default.
- A panel whose action needs a master and coverage is two or more rows: the master first, then each piece of coverage with `coverage of S0nn` in notes. All carry the same scene and panel.
- Two shots the crew treats as one setup share a grouped label, `7/8`, and stay adjacent.
- Dialogue: every line in the script is covered by at least one row whose notes say `dialogue`. A scene with a two-hander needs the two singles or the two-shot the script's `Camera:` line implies.
- A shot the script implies but the board does not show (an insert of the clipboard the action names) is a row with its scene and the nearest panel, and a `notes: board gap` for the storyboard-director.

## 4. What the list feeds

- Breakdown: description, scene and label fill the Visuals and Description cells one row per shot, in this order.
- Call sheet: label, description, movement and est_duration_s become the schedule row; the person assigns rows to days and orders the shoot.
- Registers: every talent role, key prop and location a description names is what the registrar prepares. Name them in the description with the script's words so the registrar can grep them.

## 5. Estimating durations

- Sum of `est_duration_s` should land within 15 percent of the script's `duration_s`. If it does not, the board or the script has a gap; report it as a question rather than padding shots.
- A master of a whole scene: 8 to 12 seconds. Coverage: 2 to 5. Inserts: 1 to 3.

## 6. Revisions and retirement

- A revision adds rows or retires rows. A retired row keeps its id, keeps its label, and gets `notes: retired v{n}`. Nothing is deleted.
- A shot added between two existing shots takes the next unused id and is placed in story order; ids do not sort, story order does.
- A change to scene numbers in a new script version is a question before any row moves, because every downstream document keys on the label.

## 7. What the check enforces

`shot-list-check.js`: header matches the template; every `shot_id` unique and well formed; every `scene` exists in the latest script; every `panel` exists in the latest storyboard; grouped labels allowed; no blank cells. It writes `validation/shot-list-check.md`. A failing check is fixed by editing rows, never by deleting the offending row's id.

## Checklist before you deliver

1. Header is the template's nine columns, in order.
2. Every `shot_id` is `S{nnn}`, unique, and every id from the previous version is still present, retired or live.
3. Every `label` is the crew's scene-shot form, grouped setups written `n/m` and adjacent.
4. Every row names a scene in the selected script and a panel in the current storyboard.
5. Every dialogue line in the script is covered by a row marked `dialogue`.
6. Size and movement use only the listed vocabularies, one movement per row.
7. Total estimated seconds are within 15 percent of the script's duration, or the gap is a question.
8. Talent roles, key props and locations appear in descriptions in the script's words.
9. No blank cells; `unknown` is written where a value is not known, and the summary lists them.
10. No shoot order was written anywhere.
11. The check exits 0 and `validation/shot-list-check.md` exists.

Sources: `docs/sources/shot-list.md`.
