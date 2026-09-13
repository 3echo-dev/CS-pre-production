# Playbook: the unified brief

Read by `intake-director` at row 0a, after the Drive pull has landed under `inputs/{client}/{job-id}/`. Output: `brief.md` on `templates/brief.md`. The brief is the one file every later director reads instead of the folder, so a fact that is not in it does not exist downstream.

## 1. Order of work

1. Skeleton first. Write every section of the template with its heading, marked unfinished, before reading anything. A run that dies mid-way leaves a usable partial.
2. Index the folder. Glob `Brief/`, `Concept/`, `Client Assets/`. One Index row per file, including images, zips and duplicates. A file you could not open still gets a row with `Read: no` and the reason.
3. Read in this order: the brief document, then emails by date ascending, then the concept deck, then assets. Later material overrides earlier material only through a Conflicts row, never silently.
4. Extract the audience, the intent, the deliverable, the constraints, the assets.
5. List conflicts and open questions.
6. Write the summary the orchestrator asked for, fifteen lines at most.

## 2. What the brief must answer

Fill each of these from the folder, with the file name beside every fact. A blank is an open question, never a default.

| Field | Where it usually lives | If missing |
|---|---|---|
| Client and project name | brief, email subject | question |
| Deliverable: film length, format, ratio, versions (main, trailers, cutdowns) | brief, deck last pages | question; never assume 16:9 or one version |
| Distribution: where the film plays (event screen, social, broadcast, internal) | brief | flag as decision pending; it changes ratio and safe areas |
| Audience, three layers (section 3) | brief, deck | critical gap; ask before the script is written |
| Intent: the one thing the film must make the audience feel or do | brief, deck | question |
| Tone and register words, quoted | brief, deck | quote what exists; do not paraphrase into your own adjectives |
| Must-include content: messages, products, people, places, logos | brief, emails | list verbatim |
| Must-exclude content and sensitivities (government, safety, uniform rules) | brief, emails | list verbatim; see section 6 |
| Dates: shoot window, submission rounds, event date | emails, brief | question; a date from a sample or a template is not a date |
| Budget band, if stated | brief, email | record as stated; never invent a figure |
| Approvers named by the client | emails | record names and roles; approver ids in `job.json` stay roles |
| Language of the film and of on-screen text | brief | question |

## 3. Audience, three layers

Write the audience as three short blocks. This is who watches the film, not the client.

- Demographic: age band, gender split if it matters, location, language primary and secondary.
- Psychographic: what they believe now about the subject, what they associate with the client, what they are sceptical of.
- Behavioural: where they will meet the film (a hall screen, a phone, a lobby loop), how long they will give it, what makes them keep watching.

If the folder is silent on any layer, write `unknown` in that block and add one open question per missing layer. Do not fill a layer from general knowledge of the client's sector.

## 4. Intent, in the client's words

Quote the brief and the deck. Two to five quoted lines with file name and page. Then one line of your own that says what the film must do, marked as yours. The script-director cites Intent lines by number under every scene heading, so number them: I1, I2, I3.

## 5. Conflicts

A conflict is two files, or two places in one file, that disagree on length, name, date, deliverable, tone, audience or a must-include. One row each:

| What A says (file, page) | What B says (file, page) | Later | Kept | Why |

Rules:
- The later dated document is noted as later. That is a fact, not a resolution.
- `Kept` is what the brief carries forward for now. `Why` is one line. Both are visible to the person, who overrides on the board.
- A conflict about length, name or deliverable also becomes an open question, because a script written both ways wastes a version.

## 6. Sensitivities and hard limits

Carry these forward verbatim from the brief or emails into a `Limits` list under Intent:
- Government or public-sector clients: no political position, no characterisation of policy, no speculation about agency intent. Neutral, factual phrasing everywhere downstream.
- Uniformed services: any rule about portrayal (driving against traffic, weapons, insignia) is a limit line with its source.
- Faces, names and locale: if the brief names the country or community the film is for, write it as a casting and locale line so the storyboard cannot drift.
- Client assets and logos: which may appear, where, and whether an end card is mandatory.

## 7. Open questions

One line each, answerable by a person, in the words a person uses. Each becomes a board question through the orchestrator. Rank them: first the ones that block the script (length, format, audience, language), then the ones that block logistics, then everything else. Do not ask what the folder already answers.

## 8. Assets to carry forward

Every logo pack, reference still, location photo, product shot, wardrobe reference, music file or previous film in `Client Assets/`, with its file name and the use you expect (end card, location reference, wardrobe reference, product, previous work as tone reference). A reference film the client sent is a reference for the scout, noted here, not watched here.

## 9. What not to do

- Never invent a quote, a date, a figure or a client decision. An email that says something was approved is a claim, quoted with its source.
- Never write `[to fill]` or `TBC` as a value. A missing value is an open question.
- Never resolve a conflict silently, even an obvious one.
- Never carry facts in from another client's job.
- Never describe the folder from memory. A row in the Index means the file was opened this run.

## Checklist before you deliver

1. Every file in the three sub-folders has an Index row, with `Read: yes` or a reason.
2. Every field in section 2 is filled from a file or is an open question.
3. The audience has three blocks, each filled or `unknown` with a question.
4. Intent lines are numbered I1 onward and quoted with file and page.
5. Every conflict is a row with both sources, and each length or name conflict is also a question.
6. Limits are verbatim with their source.
7. Open questions are ranked, one line each, none answerable from the folder.
8. Assets to carry forward name a file and a use.
9. No state id, no path outside `inputs/`, no rule number, no em dash.
10. The summary is fifteen lines or fewer and names the count of conflicts and questions.

Sources: `docs/sources/brief.md`.
