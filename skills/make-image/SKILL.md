---
name: make-image
description: >-
  Generates storyboard panels through the 3echo image tools and lands them on disk. Quotes the credits, waits for an explicit yes on the board and in chat, preflights, generates the one sample panel and stops for its approval on the board, then the batch. Use at stage 1c after the panel table exists, and to regenerate one named panel. Orchestrator only.
metadata:
  version: 0.1.0
user-invocable: false
---

# Skill: Make image

## Inputs

- `storyboard/v{n}/generation-manifest.json`: its `kind: image` items, `sample`, `style`, `continuity`, `negative`, `referenceAssets`.
- `storyboard/v{n}/panels.md`: `style`, the panel table, Not in frame, Continuity.
- `brief.md` Assets to carry forward; `workspace.json`; `status.md` credit tally.

## Steps

1. `preflight-generation.js {client} {job-id} {n}`. Exit 3 means no panel table; exit 1 faults; exit 0 is the only permission to quote.
2. Quote `count x 1 credit` for items not `validated`. Over `credit_ceiling_per_job` in `CONFIG.md` it stops and asks what to cut.
3. Say the load-bearing assumptions in one line first: storyboard style, aspect ratio from the brief, sample panel id, reference assets, credit ceiling. Put them and the quote to the person on the board and in chat as one question (`board-sync.js ask ... --item storyboard`). **Wait for an explicit yes.** The spend guard refuses without it.
4. `list_workspaces` for the id and balance, then `check-3echo.js {client} {job-id} --credits {balance}` (or `--unreachable`), then `get_asset` and `preflight-media.js "<media-url>"`. Exit 0 from both is the only permission to generate.
5. Upload the client assets the manifest names with `upload_asset` or `import_asset_from_url`. Record the ids in `manifest.referenceAssets` and each item's `assetIds`.
6. **The sample panel only**: `create_image_job` (`workspaceId`, `prompt`, `aspectRatio`, `assetIds`, `idempotencyKey` spelled `{job-id}/v{n}/P{id}`), `wait_for_job`, `get_job_result`. Land it under rules 5 to 8. Record the version with `record-version.js --item storyboard --note "sample P{id}"`, push the board, and end the turn. The person approves the sample on the board.
7. On the next turn, once the landing shows the sample approved: the batch, same key format, same preamble, continuity and negative list. Land each as `storyboard/v{n}/P{id}.png`, by panel id never display number; set `status` and `file`.
8. `python "${CLAUDE_PLUGIN_ROOT}/scripts/contact-sheet.py" "storyboard/v{n}" --cols 4`. A panel it excludes is `rejected`: re-fetch or regenerate. Update the tally in `status.md`.

`stage.js` at both ends: `--substep "Storyboard: quoting"` for steps 1 to 4, then `--substep "Storyboard: panels" --agents "image-maker:working"`.

## Rules

The shared rules in `${CLAUDE_PLUGIN_ROOT}/docs/SHARED-RULES.md` apply.

1. Prompt order: subject, setting, style, lighting, composition, technical. State the ratio in both the prompt and the parameter.
2. Prompts under 200 words. Every prompt repeats the board's Not in frame list verbatim.
3. Never request legible text, logos or UI.
4. Two landing routes: `get_asset` then an HTTP fetch of the media URL, or `fetch_asset_bytes` `variant: "thumbnail"` piped to `save-asset-bytes.py storyboard/v{n}/P{id}.png`. The `media` variant is too large to return.
5. Thumbnails are review quality only.
6. Validate every file: opens with Pillow, 200 px or more short side.
7. Look at every panel: another brand, a wrong location, a face the brief did not cast.
8. A real place must look like the client's picture, not a guess.
9. `assetIds` takes 16 references per job. `aspectRatio` is one of `1:1 2:3 3:2 3:4 4:3 9:16 16:9 21:9`, from the brief, never assumed.
10. A redo is one panel, one credit: only the ids the person named, archived as `P{id}-r{k}.png`, the person's note verbatim as the last line of the prompt, and a yes to the redo's own quote.
11. Cutting a panel is a storyboard version, not a generation.

## Output contract

`storyboard/v{n}/P{id}.png` per panel, `P{id}-r{k}.png` per archived regeneration, `storyboard/v{n}/contact-sheet.png` rebuilt on every change. The manifest updated in place with `status`, `file`, `assetIds` and `credits`. `status.md` carries the tally.

## Boundary

Does not write the panel table (`storyboard-director`), list shots, or approve anything. Only the orchestrator runs it.

## Failure modes

| Failure | Fix |
|---|---|
| `preflight-media.js` exits 3 | Allowlist the asset host; do not generate |
| A generation tool fails silently | Run `check-3echo.js`. Three in a row was a reachability problem |
| The batch generated before the sample was approved | Stop; the guard should have refused; report it |
| Base64 transcribed by hand | Pipe `dataBase64` into `save-asset-bytes.py` |
