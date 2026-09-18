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

1. `preflight-generation.js {client} {job-id}`. Exit 3: no panel table; exit 1: faults; exit 0 is the only permission to quote.
2. Quote `count x 1 credit` for items with no file on disk. Over `credit_ceiling_per_job` (`CONFIG.md`) stop and ask what to cut.
3. State the assumptions in one line: style, ratio from the brief, sample panel, reference assets, ceiling. `push-panels.js` puts a placeholder per panel on the board's Storyboard tab, whose Generate button files a `generate` request (landed as `generate[]`, scope sample or batch); that request, or the answer to `board-sync.js ask ... --item storyboard`, is the yes. **Wait for it.** The spend guard refuses without it.
4. `list_workspaces` for id and balance, `check-3echo.js {client} {job-id} --credits {balance}` (or `--unreachable`), then `get_asset` and `preflight-media.js "<media-url>"`. Exit 0 from both is the permission to generate.
5. Upload the client assets the manifest names (`upload_asset` or `import_asset_from_url`); record the ids in `manifest.referenceAssets` and each item's `assetIds`.
6. **The sample panel only**: `create_image_job` (`workspaceId`, `prompt`, `aspectRatio`, `assetIds`, `idempotencyKey` spelled `{job-id}/v{n}/P{id}`), `wait_for_job`, `get_job_result`. Land it under rules 5 to 8. Record the version (`record-version.js {client} {job-id} --item storyboard --n {n} --file "storyboard/v{n}" --note "sample P{id}"`), `push-panels.js --only P{id}`, push, end the turn. The person approves the sample on the board; `board-sync.js pull --gate sample` writes `approvals/sample-{n}.json` with the batch ceiling (panels still to draw) from the generate request.
7. Next turn, once the sample approval is on disk: the batch, same key format, preamble, continuity and negative list. Land each as `storyboard/v{n}/P{id}.png` by panel id, never display number; set `status` and `file`.
8. `push-panels.js`, then `python "${CLAUDE_PLUGIN_ROOT}/scripts/contact-sheet.py" "storyboard/v{n}" --cols 4`. A panel it excludes is `rejected`: re-fetch or regenerate, and update the tally.

`stage.js {job-id} stage-1-creative running --substep "Storyboard: quoting"` for steps 1 to 4, then `--substep "Storyboard: panels" --agents "image-maker:working"`, then `done`. `storyboard` is not a stage id.

## Rules

The shared rules in `${CLAUDE_PLUGIN_ROOT}/docs/SHARED-RULES.md` apply.

1. Prompt order: subject, setting, style, lighting, composition, technical. State the ratio in the prompt and the parameter.
2. Prompts under 200 words, each repeating the board's Not in frame list verbatim.
3. Never request legible text, logos or UI.
4. Landing routes: `get_asset` then an HTTP fetch of the media URL, or `fetch_asset_bytes` `variant: "thumbnail"` into `save-asset-bytes.py storyboard/v{n}/P{id}.png`; the `media` variant is too large.
5. Thumbnails are review quality only.
6. Validate every file: opens with Pillow, 200 px or more short side.
7. Look at every panel: another brand, a wrong location, an uncast face.
8. A real place matches the client's picture.
9. `assetIds` takes 16 references. `aspectRatio` is one of `1:1 2:3 3:2 3:4 4:3 9:16 16:9 21:9`, from `job.json`, never assumed.
10. A redo is one panel, one credit: only the ids the person named, archived as `P{id}-r{k}.png`, their note verbatim as the prompt's last line, a yes to its own quote.
11. Cutting a panel is a storyboard version, not generation.

## Output contract

`storyboard/v{n}/P{id}.png` per panel, `P{id}-r{k}.png` per archived regeneration, `contact-sheet.png` rebuilt on every change, one board `panels/P{id}` document per panel. The manifest updated in place with `status`, `file`, `assetIds`, `credits`; `status.md` carries the tally.

## Boundary

Never writes the panel table, lists shots or approves.

## Failure modes

| Failure | Fix |
|---|---|
| `preflight-media.js` exits 3 | Allowlist the asset host; do not generate |
| A generation tool fails silently | Run `check-3echo.js`; three fails is reachability |
| The batch generated before the sample was approved | Stop and report it |
| Base64 transcribed by hand | Pipe `dataBase64` into `save-asset-bytes.py` |
