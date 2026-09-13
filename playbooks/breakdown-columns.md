# Playbook: the concept breakdown

Read by `breakdown-compiler` at row 3a. Output: `breakdown.xlsx` (the client's template, filled), `breakdown.md` (a mirror with a trace column), `validation/breakdown-check.md`. The client's concept breakdown is the standard: a landscape table, one row per shot, in shot order, with a title row naming the project and the concept, and a header row repeated on every page. Column order is the template's and is never changed.

## 1. The column contract

Read the header row of `client/templates/breakdown.xlsx` and record it in the mirror's front matter before writing a cell. The client's sample carries eleven columns in this order; the template for a job may differ, and the template wins:

| # | Column | Fed by |
|---|---|---|
| 1 | Scene and shot (`S/s`) | shot list label, written `scene-shot`, `1-1`, `5C-2` |
| 2 | Visuals | the panel's frame cell, shortened to what the camera sees |
| 3 | Description | the panel's action and the script's scene action |
| 4 | Lyrics (or Audio) | `audio.md`: the lyric line for a music video, else the VO or sync note |
| 5 | Location | the locations register: name and address |
| 6 | Specifics or Request | props register rows for this shot, source text preserved; production requests to the client written as `{CLIENT} TO ADVISE ...` |
| 7 | Client input (first) | left for the client; a note written here is a question, in the template's own words |
| 8 | Talents | talents register: count and role, with age band and casting mix; extras grouped |
| 9 | Wardrobe | talents register wardrobe notes, as bullets; props worn or carried stay here if the source put them here |
| 10 | Client input (second) | left for the client; never merged with column 7 |
| 11 | Remarks | shot-list notes, camera movement, stunt or vehicle flags, references by number |

The two client-input columns carry the same label in the client's template. They are two columns, in template order, both kept, both usually blank. A note the compiler has for the client goes in column 6 as a request, not in a client-input column.

## 2. Rows

- One row per shot-list row, in shot-list order. The `S/s` cell is the crew label, not the `shot_id`.
- A shot that continues across a page break in the template is one row, once. The template repeats the header; it does not repeat the row. Never write a second row for a continuation, and the check counts labels to prove it.
- A retired shot (`notes: retired v{n}`) is not a row.
- Extras are written as the client writes them: `FEATURED EXTRAS`, then `n x {role}`, age band, gender, one group per line, with their wardrobe bullets under Wardrobe in the same order.
- Talents: `1 x {role}` per line; where the client has to name a person, the line ends `*{CLIENT} to advise who this profile is`. Named talent from the register is written as name then age in brackets.

## 3. Cell states

Four states, and they never collapse into one another:

| State | Written as |
|---|---|
| a value | the value, traced to its source row |
| unknown | `unknown` |
| not applicable | the template's own mark, `NA` in the client's sample |
| client to advise | `{CLIENT} TO ADVISE {what}` in the Specifics or Request column, uppercase as the client writes it |

A blank cell is never written by the compiler. If the template's sample has blanks, they are the client's blanks in the client-input columns only.

## 4. Sources per cell

Every cell traces to one file and one row. The mirror carries a final column `trace` with `file:row` for each cell that was filled, so the check and the person can read where a value came from:
- Visuals, Description, Remarks: `shot-list.csv:S0nn` and `storyboard/v{n}/panels.md:P0nn`.
- Lyrics or Audio: `audio.md:scene n`.
- Location: `registers/locations.json:{id}`.
- Specifics: `registers/props.json:{id}`, with the source text quoted as written where the prop came from a wardrobe or request line.
- Talents, Wardrobe: `registers/talents.json:{id}`.
- References: `references/board.md:#n` for selected rows, by number in Remarks.

## 5. What the check does

`breakdown-check.js --sample 3` picks rows and compares each cell to its source; it fails on a merged or missing client-input column, a duplicate label, a blank cell, or a value with no trace. Fix what it names and run again. A failing check is never fixed by deleting a row.

## 6. Versions and revisions

- A re-compile is a new version; the earlier file is not overwritten. The title row carries the version and date as the client's does, `V{n}_{YYMMDD}`.
- A change on the board to a register or the audio sheet reopens the breakdown; only the affected rows change, and the mirror's changelog names them.

## Checklist before you deliver

1. The header row is the template's, unchanged: no column added, renamed, merged, reordered or dropped, and both client-input columns are present.
2. The title row names the project and concept and carries the version and date.
3. One row per live shot-list row, in shot-list order, labelled with the crew's scene-shot label.
4. No label appears twice; no continuation became a second row.
5. Every cell is a value, `unknown`, the template's NA mark, or a `{CLIENT} TO ADVISE` request; no cell is blank.
6. Every filled cell has a `file:row` trace in the mirror.
7. Extras are grouped as the client groups them, with wardrobe in the same order.
8. Props that the source wrote inside wardrobe or request lines are quoted as written, not moved.
9. Selected references appear by number in Remarks.
10. `breakdown-check.js --sample 3` exits 0 and its report is in `validation/`.

Sources: `docs/sources/breakdown.md`.
