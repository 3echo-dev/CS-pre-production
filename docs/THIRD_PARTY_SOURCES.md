# Third-party sources

Nothing here is installed or linked at runtime. Each row says which of our files a rule or a
script came from, so anything that looks wrong can be traced back to what was actually read.

- `kernel` means the file was carried over from social-media-pipeline and re-skinned for 1-22.
- `adapted` means rules, structures or numbers rewritten for our stages and gates.
- `vendored` means close to a copy. Exactly one file is vendored: `scripts/watch-video.py`, from `claude-video`, which keeps its MIT notice at the top.
- `wrapped` means read in place at runtime and never copied: every one of Sham's skills.

## The kernel

| Our files | Source | Repo | License | Usage | What was taken |
|---|---|---|---|---|---|
| `scripts/*.js` (workspace resolver, router shape, planner, scaffolds, state machine as data, set-state, stage, hash-artifact, record-approval, check-approval, collect-artifacts, check-deps, note-failure, sync-manifest, pane, pane-file, validate-schema, preflight-*, check-3echo, save-asset-bytes, contact-sheet), `hooks/**`, `scripts/hooks/**`, `scripts/test/**` (structure), `docs/` structure, `templates/status.md`, `templates/plan.md`, `templates/approval.json`, `CONFIG.md` shape, `.claude-plugin/**` | the whole repository at v0.12.9 | https://github.com/3echo-dev/social-media-pipeline | MIT | kernel | Files as state, deterministic routing, the executable workflow table, the state table as data, hash-bound approvals, the single-spender rule, command and function hooks, the test discipline, the word budgets, the house style for agents and skills. The social skin (nine role agents, twenty-three skills, platform rules, four workflows, hand-off and metrics) was removed; `lib-gate.js` became `lib-board.js`. |

## Borrowed files still present

| Our file | Source file | Repo | License | Usage | Commit | What was taken |
|---|---|---|---|---|---|---|
| `skills/source-validation/SKILL.md` | `skills/source-validation/SKILL.md` | https://github.com/3echo-dev/social-media-pipeline | MIT | kernel, adapted | v0.12.9 | Claim taxonomy, traceability block, confidence bands, the never-fabricate list, re-pointed at the brief and the reference board. Its own upstream rows are below. |
| `skills/source-validation/SKILL.md` | https://raw.githubusercontent.com/anthropics/knowledge-work-plugins/main/partner-built/brand-voice/skills/discover-brand/references/source-ranking.md | anthropics/knowledge-work-plugins (partner-built/brand-voice, Tribe AI) | MIT (nested LICENSE) | adapted | 4fa3cb92e2942d6594200fa8d2c800708e086072 | Source freshness bands, trust weight by category, newer-source-wins conflict rule. |
| `skills/source-validation/SKILL.md` | https://raw.githubusercontent.com/coreyhaines31/marketingskills/main/skills/competitor-profiling/SKILL.md | coreyhaines31/marketingskills | MIT | adapted | 2d4b091d122314ace4f0c93accb44c90ed70208f | The prompt-injection rule for fetched pages, including noting the attempt in the output. |
| `skills/storyboard/SKILL.md` | `skills/storyboard/SKILL.md` | https://github.com/3echo-dev/social-media-pipeline | MIT | kernel, adapted | v0.12.9 | Permanent panel ids, the Sequence line, the three Frame forms, text only before approval, the edit protocol, the revision log. Aspect ratio and safe-zone numbers dropped; 1-22 boards are films, not social clips. |
| `skills/make-image/SKILL.md` | `skills/make-image/SKILL.md` | https://github.com/3echo-dev/social-media-pipeline | MIT | kernel, adapted | v0.12.9 | Quote, explicit yes, the two preflights, one sample before the batch, the two landing routes, Pillow validation, the redo rule. |
| `skills/watch-video/SKILL.md` | https://github.com/bradautomates/claude-video/blob/main/skills/watch/SKILL.md | bradautomates/claude-video | MIT | adapted | 83da59fa78c3eee9e20f515fe75c438bb5166efd | The separation between extraction and interpretation, timestamp-pinned follow-up passes, transcript status, frame batches, and the rule that missing audio stays explicit. |
| `scripts/watch-video.py` | https://github.com/bradautomates/claude-video/blob/main/skills/watch/scripts/frames.py | bradautomates/claude-video | MIT | vendored and adapted | 304b639b4db1db2374bd59cba4dc958d43f3d4f6 | ffprobe metadata, duration-scaled frame sampling, scene-change selection, timestamped file names, perceptual deduplication. |
| `scripts/watch-video.py` | https://github.com/bradautomates/claude-video/blob/main/skills/watch/scripts/transcribe.py | bradautomates/claude-video | MIT | vendored and adapted | 429f3143e54975dbc4ad0a4b5b34163b9ba5639b | VTT and SRT cue parsing plus transcript-cue timestamp support. |
| `scripts/watch-video.py` | https://github.com/bradautomates/claude-video/blob/main/skills/watch/scripts/download.py | bradautomates/claude-video | MIT | vendored and adapted | 429f3143e54975dbc4ad0a4b5b34163b9ba5639b | Captions-first yt-dlp flow and local download fallback for frame extraction. |
| `skills/review/SKILL.md` | https://github.com/langchain-ai/social-media-agent | langchain-ai/social-media-agent | MIT | inspiration | (as reviewed for the kernel) | The approve, change, start-over review loop. |

## Wrapped at runtime, never copied

Sham's skills, read in place under `workspaces/{client}/client/skills/` by `skills/sham-skill-wrap`: `the-creative-director`, `no-ai-slop`, `inspiration-references`, `video-watch`, `reference-match-director`, `defuddle`, `generative-frame-craft`, `clip-director`, `htf-night-shift-frames`, `openmontage-craft`, `vo-roundtrip`, `kisah-prompt-department`. They are the client's; nothing from them is in this repository.

The chain-execution pattern (manifest, stage directors, checkpoints, human gates) was read from https://github.com/calesthio/OpenMontage (AGPL-3.0) as inspiration only and re-derived in our own words. No prose or code copied.

## Repos reviewed

| Repo | License | Verdict | Reason |
|---|---|---|---|
| https://github.com/3echo-dev/social-media-pipeline | MIT | kernel | Files as state, router, executable table, hash-bound gates, hooks, tests |
| https://github.com/bradautomates/claude-video | MIT | vendor | watch skill scripts: probe, frame sampling, VTT transcript, captions-only download |
| https://github.com/anthropics/knowledge-work-plugins | Apache-2.0 (partner-built/brand-voice MIT) | use (narrow) | source ranking only |
| https://github.com/coreyhaines31/marketingskills | MIT | use (narrow) | the fetched-content rule only |
| https://github.com/langchain-ai/social-media-agent | MIT | inspiration | approve, edit, reject review loop |
| https://github.com/calesthio/OpenMontage | AGPL-3.0 | inspiration | chain execution and gate discipline, re-derived |
