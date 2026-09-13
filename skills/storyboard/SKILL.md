---
name: storyboard
description: >-
  Builds and revises a 1-22 storyboard as a panel table with permanent panel ids in the one style the job chose, story order and shoot order as separate fields, one sample panel marked, text only until the sample is approved on the board. Use at stage 1c and on any panel change request.
metadata:
  version: 0.1.0
user-invocable: false
---

# Skill: Storyboard

## Inputs

- The selected `script/v{k}.md`; `job.json` for `storyboardStyle`.
- `brief.md` Assets to carry forward (location pictures, product, logo); `references/board.md` selected rows.
- On revision: `revisions/{n}.json` and the current `storyboard/v{n}/panels.md`.

## Steps

1. Style from `job.json`, never inferred: `sketches`, `live_pictures` or `cartoon_animation`. Blank means a question, raised first, and the row stops.
2. Panel count from the script: one beat per panel; a scene with two actions is two panels. Say where the count came from.
3. Front matter `style` preamble: treatment, light, colour, casting, setting, in the job's style. Every prompt opens with it and repeats the Continuity block verbatim: 3 to 6 disambiguating attributes per recurring subject, setting and light.
4. One row per panel on `templates/storyboard.md`: `panel` as `P{nn}`, `scene`, `story_order`, `shoot_order` blank, `frame` (what the camera sees, size, setting), `camera`, `on_screen_text`, `notes`.
5. Write Not in frame: no readable text, no logos but the client's, no other brands, no extra people.
6. `generation-manifest.json`: one `kind: image` item per panel, prompts as preamble plus continuity plus panel plus negative, `sample: true` on the one panel that best tests the style, no video items.
7. Revision log line, report the path, the panel count and the sample id.

## Rules

The shared rules in `${CLAUDE_PLUGIN_ROOT}/docs/SHARED-RULES.md` apply.

1. Panel ids are permanent: a cut leaves the rest unchanged; a new panel takes the next unused number. Order lives in the Sequence line and the `story_order` column.
2. `shoot_order` is blank here. A person orders the shoot when the call sheet is built.
3. One style for the whole board. A prompt in another style is deleted.
4. Text only before the sample: no frame, free or paid, before the sample panel is approved on the board; then the batch, and only the batch the manifest lists.
5. Every panel names a scene in the selected script; a panel with no scene is deleted.
6. Client assets are referenced by file name from the brief, never described from memory: a location picture in `Client Assets/` is the reference for that location's panels.
7. Frame is one of three: `TO GENERATE` (what the camera sees), `ASSET: {file}` (a client picture used as is), or `TO SHOOT` (a live picture the crew takes for a live-pictures board).
8. Apply revisions literally; if a cut breaks the flow, say so and ask. Increment `version`; log each change by panel id; a cut panel stays restorable.
9. Regeneration after approval targets one panel by id; a cut or insert is a new version and returns to the board.

## Edit protocol

Put this verbatim under the board:

```
Cut P03.
Edit P05 frame to "..."
Insert after P04: {the new beat}
Reorder: P01, P02, P04, P03, P05
Replace the board entirely: {new direction}
```

## Output contract

`storyboard/v{n}/panels.md` filled: front matter `job`, `client`, `version`, `style`, `script_version`, `panels`, `status: draft`, `wrapped`, `created`; Sequence line; the panel table; Not in frame; Continuity; Revision log. `storyboard/v{n}/generation-manifest.json` with `boardVersion` equal to `version`, `sample` on exactly one item, files by panel id.

## Boundary

Does not generate, quote or download frames (`make-image`, orchestrator only), write scenes (`script-director`), list shots (`shot-list-director`), or approve anything.

## Failure modes

| Failure | Fix |
|---|---|
| Renumbering after a cut | Only the Sequence line and `story_order` change |
| Two styles on one board | Redo the odd panels in the job's style |
| A shoot order filled in | Blank it |
| A frame described as if it exists | `TO GENERATE`, `ASSET: file`, or `TO SHOOT` |
| Generation before the sample is approved | Text only; stop |
