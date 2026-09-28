---
name: subject-check
description: >-
  Before any storyboard panel is drawn, lists every character, location and prop the board needs, matches each against the client's pictures, and asks a person what to do for each one with no picture: generate a look (1 credit, then its own approval), wait for the client's photo, or leave it to the prompt. Use at stage 1c after the panel table and manifest exist, again when the client adds pictures, and whenever a board answer about a subject lands. Orchestrator only.
metadata:
  version: 0.1.0
user-invocable: false
---

# Skill: Subject check

## Why

The image model invents any face, place or product it has no picture of. Without this check the first time anyone sees an invented face is on a drawn panel, after the credits are spent. `preflight-generation.js` refuses the sample panel until the check is clear.

## Inputs

- `storyboard/v{n}/generation-manifest.json`: the continuity block names the recurring subjects (`THE GIRL: ...`); items may carry `characters`, `location`, `props`, `wardrobe`.
- Pictures: `job.referencesFolder`, else the pulled `Client Assets/`. Folders are read loosely: Cast, Talent, Characters; Locations, Backgrounds, Sets; Props, Products; Wardrobe, Costumes. Pictures in other folders are counted as unsorted.

## Steps

1. `subject-check.js scan {client} {job-id}`. It writes `storyboard/v{n}/subjects.json` and `subjects.md`, and queues one question per subject with no picture. Exit 0: nothing blocks the sample. Exit 1: say in chat what is waiting, in the item's terms ("9 characters have no picture: THE GIRL, THE FATHER…"). When pictures sit unsorted, also say so and name the folder names that would be read. Push and end the turn.
2. Next turn, after `board-sync.js land`: `subject-check.js land {client} {job-id}`. A person answering in chat is recorded with `subject-check.js decide ... --subject {id} --choice generate|wait|prompt|use-look|redo --by {who}`.
3. For each subject a person chose to **generate**: the prompt is the subject's continuity line in the board's style, one figure or object on a plain background, facing camera, no text. `create_image_job` with `idempotencyKey` spelled `{job-id}/look/{subject id}/r{attempt}` (the attempt `may-generate` prints). Land it as `subjects/looks/{kind}/{subject slug}.png` (a redo adds `-r{k}`), then `subject-check.js look {client} {job-id} --subject {id} --file {path}`. It puts the picture on the board with Use this look / Regenerate. Push and end the turn.
4. **Wait** blocks only that subject: when the client's picture arrives, the person drops it in the right folder and `scan` marks it ready.
5. Rescan whenever the storyboard changes version: decisions carry over by subject id.
6. When `scan` exits 0, `make-image` begins. Every subject that is ready is uploaded once and its asset id goes into `assetIds` for every panel that names it: `subjects.json` lists the panels.

## Rules

The shared rules in `${CLAUDE_PLUGIN_ROOT}/docs/SHARED-RULES.md` apply.

1. Never choose for a person: no picture and no answer means the sample waits.
2. A look costs 1 credit per yes. Regenerate is a new yes.
3. Leave it to the storyboard is a decision, recorded with who made it. The panel is then drawn from the words alone.
4. Two folders with the same name is a clash: the person picks which picture is meant.
5. A client picture always wins over a generated look of the same subject.

## Boundary

Does not write the panel table (`storyboard`), draw panels (`make-image`) or fill the talents, props and locations registers (Stage 2, `logistics-registrar`). The registers are shoot logistics; this check is about what the pictures look like.
