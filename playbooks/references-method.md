# Playbook: references

Read by `reference-scout` at row 1a. Output: `references/board.md` on `templates/references.md`, raw captures under `references/raw/{date}/`. This is an XX item: the creative director ticks the references that count. The scout's job is a shortlist a person can choose from, with the reason for each one written down.

## 1. Frame the search

1. Read the brief's Intent lines, the audience blocks, the Limits and the open questions. Nothing else.
2. Write three to five ranked search phrases. Each phrase names a technique, a mood, a medium or an era from the brief, not the client's category. "Government safety film" is a category; "night exterior car pursuit, handheld, practical siren light" is a search.
3. Translate loose words into named techniques where you can (rack focus reveal, top-down toy perspective, single continuous take, split screen). Named techniques are what the board and the script can use.
4. If the brief names a reference film in Assets to carry forward, it is entry 1 of the board with `Source site: client`, retrieved date today, and it is watched (section 4) before searching, because it sets the vocabulary.

## 2. Pull from the client's sites only

- `client/sites.md` is the roster, in the person's own words; while it is empty the row is a question, not a search. A site not on it is a question for the orchestrator, never a search.
- Per site: search with the site filter, open the candidate page, read the title and maker from the page, save the raw capture under `references/raw/{date}/{site}-{n}.html` or `.md`, then write the row.
- Two to four sites per run is enough for one brief. Prefer the sites whose medium matches the deliverable: a motion or animation brief goes to the motion sites first, a live-action commercial to the advertising sites first.
- Twelve to twenty references across the run. Fewer than twelve is fine when the sites are exhausted and the Gaps table says so; more than twenty is a sweep, not a shortlist.
- A site that refuses, needs a login, is paywalled or times out is a Gaps row: site, what was tried, when, reason. Never a reference, never a guess at what it would have shown.

## 3. The row

| # | Title | URL | Retrieved | Source site | Why it fits (brief line) | Selected |

- Title and maker as the page states them. Not from memory.
- URL is the page you opened, not a search result URL.
- Retrieved is today's date.
- Why it fits is one or two sentences that name a technique and tie it to a numbered Intent line: "I2: single continuous handheld follow through a corridor; the film's ward walk needs the same unbroken feel". Craft, not plot.
- Add two to four named techniques in the Why cell, so the script and the board can reuse the words.
- Selected stays blank. The person fills it on the board.

## 4. Watching one reference clip

Use `watch-video` for a clip when a still cannot show what it does, at most three clips per run.

- Read every frame the script lists, cite timestamps, not impressions.
- Describe the clip in five aspects, each one line, `N/A` when it does not apply: subject (who or what, count, distinguishing attributes), subject motion (what they do, in order), scene (setting, time of day, overlays listed separately), spatial framing (shot size, position in frame, foreground and background, and how it changes), camera (speed, lens, height, angle, focus, steadiness, movement).
- Add one line on hook: what the first three seconds do.
- The clip's transcript status is stated: captions, none, or supplied. No transcript is not a failure; say so.
- File the five-aspect block in the raw folder next to the frames and quote the one line that matters in the board row.

## 5. Can we make this

For each of the top five candidates, one line on what the reference would need if the film copied it: location type, night or day, talent count, stunt or vehicle work, drone, VFX, animation. This is not a decision; it is what the production planner and the registrar read to know what the board is asking for. Anything that plainly exceeds the brief's stated budget band or shoot window gets a `Limits` note in the row.

## 6. Questions for the board

After the shortlist, write three to five questions the creative director has to answer before the script can start, options first, recommended option first, a real "not decided" among them. Typical: which two references set the visual language; live-action, animation or mixed; whether the film needs narration, dialogue, or neither; whether the reference film in the client's folder is a tone reference or a structure reference.

## 7. Provenance line

The board's front matter carries `sites_searched` and one provenance line, exactly one of:
- `References: pulled from {sites}`
- `References: none retrieved; gaps recorded`

A row that was not fetched this run does not exist. Writing a reference from memory is the failure this playbook exists to stop.

## 8. On a change request

`revisions/{n}.json` asks for more references, a different site, or a narrower theme. Add rows with new numbers. Never delete a row the person selected. Re-run the provenance line.

## Checklist before you deliver

1. Three to five search phrases are written, each naming a technique or mood from the brief, none naming the client's category.
2. Only sites from `client/sites.md` were searched, in order, and the front matter lists them.
3. Every row has title and maker from the page, a page URL, today's date, the source site, and a Why line that cites an Intent number.
4. Every Why line names at least two techniques in words the script can reuse.
5. Twelve to twenty rows, or fewer with a Gaps row explaining each exhausted site.
6. Every refused or unreachable site is a Gaps row, and no Gaps site appears as a reference.
7. Any watched clip has frames read, timestamps cited, and a five-aspect block in the raw folder.
8. Top five candidates carry a "what it would need" line.
9. Three to five board questions, options first, recommended first.
10. The provenance line is present and true.
11. Selected is blank on every row.

Sources: `docs/sources/references.md`.
