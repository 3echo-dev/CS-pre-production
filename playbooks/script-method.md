# Playbook: the script

Read by `script-director` at row 1b and on every revision. Output: `script/v{n}.md` on `templates/script-screenplay.md` or `templates/script-av.md`, one new file per version. The script is the source of truth the storyboard, the shot list and the breakdown all trace back to, so every scene must be checkable against the brief and every line must be final copy.

## 1. Before a word of scene text

1. Read the brief: Intent lines I1 onward, the audience blocks, the Limits, the Conflicts. A conflict about length, name, language or deliverable that is still open stops you. Report it as a question; do not write the scene both ways unless the brief says to.
2. Read only the references marked selected. For each, one line: the technique it lends and which Intent line it serves.
3. State the creative problem in one line: what the audience believes now, and what the film wants them to feel or do by the end. This line goes in the front matter as `problem:` and every beat has to move it.
4. Confirm the format from `job.json`: screenplay or AV script. One format per job. Never both, never a hybrid.

## 2. Beat map first, scenes second

Build the beat map before any scene text. Four beats minimum, in this order:

| Beat | Job | Share of running time |
|---|---|---|
| Hook | The first image or line that earns the next ten seconds. Works with sound off. | first 5 to 10 percent |
| Escalation | The situation tightens, the stakes are shown not told. One midpoint turn for films over 60 seconds. | 40 to 55 percent |
| Reveal | The one moment the film exists for. Lands distinctly, with room around it. | 15 to 25 percent |
| Landing | The final feeling or action, then the end card. | last 10 to 15 percent |

Scale by duration, house defaults:

| Running time | Beats | Scenes | Words of VO or dialogue at most |
|---|---|---|---|
| up to 30 s | 4 | 3 to 5 | 60 |
| 31 to 60 s | 4 or 5 | 5 to 8 | 130 |
| 61 to 120 s | 5 or 6 | 7 to 12 | 260 |
| over 120 s | 6 to 8 | one scene per 8 to 12 s | 2.4 words per second of speech |

Join beats with "but" or "therefore", never "and then". If two consecutive beats join only with "and then", merge them or cut one.

## 3. Writing each scene

- Heading. Screenplay: `**n. INT./EXT. PLACE - TIME**`. AV: the row number. Scene numbers start at 1 and are permanent within a version; a cut scene leaves a gap in the next version and the front matter says so.
- Brief line. Under every heading, a comment naming the Intent number the scene serves: `<!-- brief: I2 -->`. A scene that serves no Intent line is cut.
- Action in present tense, what the camera sees. One paragraph per scene of 25 to 60 words. Concrete nouns: the ward station, the clipboard, the laundry cage. No mood adjectives standing in for images.
- Camera intent. One line per scene, after the action, marked `Camera:`: shot size, one movement, one focus note. "Medium, slow dolly in, shallow focus on the clipboard." This line is what the storyboard expands; it is not the shot list.
- Dialogue and VO are final copy. No placeholders, no "something like". Every speaking part has a name and, for casting, the ethnicity and age the brief or audience implies, written once in a `Cast` block at the top, not repeated in scenes.
- On-screen text is short and separate: list it per scene in the footer. Trailer rule: fewer words, more contrast. Nothing that a spoken line already says.
- Locale is explicit. If the film is set somewhere, the place, the institutions and the people are named as that place's, not left to a default. The storyboard copies this verbatim.

## 4. Dialogue and narration

- Use dialogue sparingly. A line earns its place by revealing, deciding or turning; a line that explains what the picture shows is cut.
- Narration and on-screen text never say the same thing twice.
- Speech rate for timing: 2.4 words per second for calm narration, 2.8 for conversational. A 60-second film with narration throughout carries at most 145 words.
- Language: the brief's language. A second-language version is a separate deliverable and a question, not a translation dropped into the same file.
- Names are the brief's names. A character the brief did not name is a question, and the script uses a role label (the Nurse) until answered.

## 5. The edit pass, last

Run the client's edit-pass skill through `client-skill-wrap` as the final step. Its rules that apply here:
- Cut the banned filler words and the empty openers.
- No colon reveals, no fake-profound closing lines, no summary endings. The last scene is an image, not a moral.
- Repeat the clear word; do not cycle synonyms for a character or a place.
- Keep the writer's real voice where a line is strong; make the minimum edit.
- No em dashes.

## 6. Revisions

- A revision arrives as `revisions/{n}.json` with the person's note. Change only what the note requires, keep everything else word for word, and say in `changed:` exactly what moved.
- Never touch `v{n-1}.md`. The next number is the only place to write.
- A note that changes length, format or a named character is a question first, because it reopens the brief.

## 7. Front matter that must be true

`format`, `scenes`, `duration_s` (estimated from speech rate and action lines at three seconds per action line), `changed`, `wrapped` (the client skills used, by name), `status: draft`. The person selects a version on the board; the script never marks itself selected.

## Checklist before you deliver

1. The format is the one in `job.json`, and no scene mixes the two.
2. `problem:` is one line and every beat moves it.
3. The beat map has four to eight beats, joined by but or therefore, with the hook inside the first ten percent.
4. Every scene heading carries a brief-line comment naming an Intent number that exists in the brief.
5. Every scene has one `Camera:` line with a size, a movement and a focus note.
6. Dialogue and VO are final copy; total speech words are inside the table for the running time.
7. The Cast block names every speaking part with the brief's names, ethnicity and age; no scene repeats them.
8. On-screen text is listed per scene in the footer and never repeats a spoken line.
9. Locale, institutions and uniforms are named as the brief's, with the brief's Limits respected.
10. The edit pass ran last; no banned words, no colon reveals, no summary ending, no em dash.
11. On a revision, `changed:` names only what the note asked for, and the previous version is untouched.
12. Every open decision (a name, a length, a language) is in the summary as a question, not decided in the text.

Sources: `docs/sources/script.md`.
