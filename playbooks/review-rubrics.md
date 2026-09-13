# Review rubrics, one section per gate

Read by the reviewer the orchestrator spawns before a gate (`skills/review-pass`). Every item is a yes or no question and names the file to look in. A no is a finding; the reviewer places it (line, cell, panel id, shot id) and proposes the fix. Sources of each item: the manifest's review focus lines, the definition's acceptance tests T1 to T5 and A16 to A20, and the rules the check scripts enforce.

## Gate A, creative lock

Covers: scraper, script, storyboard, shot list, budget sheet, timeline. Run `shot-list-check.js` first and hand its output to the reviewer.

### Scraper (`references/board.md`)

- A1. Does every row carry a URL, a retrieval date and a "why it fits" sentence? (T4)
- A2. Is every URL on a site listed in `client/sites.md`? A site not on the list is a finding, not a bonus.
- A3. Is every unreachable site recorded as a gap row rather than left out? (T4)
- A4. Does the "why it fits" name a brief intent line, not a generic quality? (manifest: brief-specific)
- A5. Is the selected column blank or filled only by the board record, never by the scout?

### Script (`script/v{n}.md`, latest)

- A6. Is the format the one in `job.json` (`scriptFormat`), and only that format, with no scene mixing screenplay and AV columns?
- A7. Does every scene reference an intent line from `brief.md`, in its front matter or its heading note?
- A8. Is the version file new, with the previous version untouched, and is it in `versions.jsonl`?
- A9. Does the front matter name the format, the version and the brief version it was written from?
- A10. Where the brief listed a conflict, does the script say which side it took, or is the conflict still open as a board question? (A01)

### Storyboard (`storyboard/v{n}/panels.md`)

- A11. Is there exactly one style across all panels, matching `storyboardStyle` in `job.json`?
- A12. Does every panel have a stable id, a scene, a story order and a shoot order as three separate fields? (R19)
- A13. Does every scene in the script have at least one panel, and every panel a scene that exists?
- A14. Was a sample panel recorded as approved before any batch row exists? (clip-director rule 4)
- A15. Does each panel's frame description fill subject, motion, scene, spatial and camera, with no camera term used for two different moves?

### Shot list (`shot-list.csv`)

- A16. Did `shot-list-check.js` exit 0?
- A17. Is every `shot_id` unique and never reused after a revision?
- A18. Does every row name a scene in the script and a panel on the board? (orphan rows are critical)
- A19. Are grouped labels such as `7/8` preserved in `label` while `shot_id` stays one per row?
- A20. Does `est_duration_s` exist on every row, or is a blank explained in `notes`?

### Budget sheet (`budget.xlsx` or `budget.md`)

- A21. Is every unknown cell written as unknown, never as zero or a guessed figure? (R08)
- A22. Do talent cost and loading cells trace to the talents register, or are they marked pending the register? (T2)
- A23. Is the currency and the rate source recorded on the sheet? (S10)
- A24. Is the template's row and column order unchanged from `client/templates/budget.xlsx`?

### Timeline (`timeline.xlsx` or `timeline.md`)

- A25. Are submission, feedback, approval and delivery separate events, never one merged milestone? (R18)
- A26. When `hasTrailer` is true, are main film and trailer milestones tracked as separate rows?
- A27. Is no date copied from the template's sample project? (S04)
- A28. Are shoot days left as placeholders until call sheets are released?

## Gate B, logistics lock

Covers: audio, talents, props, locations. Run `gate-b-check.js` first and hand its output to the reviewer.

### Audio (`audio.md`)

- B1. Does every scene have separate VO, BGM and SFX rows, never a combined line?
- B2. Does every row that names a choice name its library or source?
- B3. Is a scene with no VO marked not applicable, never blank? (A07)
- B4. Was the VO voice chosen through a board question, not by the supervisor?
- B5. Do SFX rows name the shot or panel they attach to?

### Talents (`registers/talents.json`)

- B6. Did `gate-b-check.js` exit 0?
- B7. Does every row have all six fields present: name, picture, age, availability, cost, loading?
- B8. Is every blank either marked `unknownByDecision` by a person or a finding? (T1)
- B9. Is the register either rows from the board or a not-applicable decision naming who decided?
- B10. Did no agent type a value; do all rows carry the board's `by` and `at`?

### Props (`registers/props.json`)

- B11. Are key props declared by a person on the board, with the skeleton's candidates marked as candidates?
- B12. Where a prop lives inside a wardrobe or request cell in the source, is the source text preserved verbatim in `source`?
- B13. Does every prop name a scene or a shot it belongs to?

### Locations (`registers/locations.json`)

- B14. Is every location a real place entered by a person, not a script description?
- B15. Is availability filled by a person or marked unknown by decision, never inferred? (R06)
- B16. Do the fields match the call sheet's location block: name, address, availability, contact?

## Gate C, documents released

Covers: concept breakdown, call sheets. Run `breakdown-check.js` and `call-sheet-check.js` first and hand their output to the reviewer.

### Concept breakdown (`breakdown.xlsx` or `breakdown.csv`)

- C1. Did `breakdown-check.js` exit 0?
- C2. Is the column order identical to `client/templates/breakdown.xlsx`? (S02)
- C3. Are the two same-label client-input columns both present and kept separate?
- C4. Does no shot appear twice, including across page continuations? (A19)
- C5. Does every sampled row trace to a `shot_id` in `shot-list.csv` and to register rows for talent and location?
- C6. Is every N/A cell backed by a not-applicable decision on the board, and every blank distinct from N/A?
- C7. Are props carried in the wardrobe or requests column exactly as the register's source text?

### Call sheets (`call-sheets/day-{d}.*`)

- C8. Did `call-sheet-check.js` exit 0?
- C9. Does every row's talent and location resolve to a register row that is not unknown? (T5)
- C10. Is the shooting order from the breakdown kept, never renumbered? (R17)
- C11. Is every overnight block computed across midnight with the right span? (A16)
- C12. Where two units run in parallel, is every shared-resource clash flagged? (A17)
- C13. Does the day assignment match `registers/days.json`, one sheet per day, no row on two days?
- C14. Are the cast call, crew call and location blocks laid out as `client/templates/call-sheet.xlsx`?
- C15. Is the releaser named, and is nothing marked released before the Gate C record exists? (A20)
