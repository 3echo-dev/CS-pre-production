# Playbook: the storyboard

Read by `storyboard-director` at row 1c and on every panel change. Output: `storyboard/v{n}/panels.md` on `templates/storyboard.md` and `storyboard/v{n}/generation-manifest.json`. Text only: the director writes panels and prompts; the orchestrator generates one sample, the person approves it on the board, then the batch. The client's shoot board is the standard: one scene per section, one panel per shot, a frame, a camera line and a description, with a disclaimer that visuals guide and do not bind the shoot.

## 1. Lock the style once

- `job.json` names one style: `sketches`, `live_pictures` or `cartoon_animation`. Write it in the front matter and in a one-paragraph style preamble that every prompt repeats verbatim. A board never mixes styles; a job that left the style blank is a question, not a default.
- The preamble names: the medium (pencil sketch on paper, photographic frame, flat animation), palette or grade, light logic, era, texture, and the audience's world (whose faces, whose streets, whose institutions). Banned in the preamble unless attached to a named reference: cinematic, photorealistic, stunning, epic, high quality.

## 2. Hero frames first

Before panels, name the frames the film will be remembered by and give each one full attention:
- the opening image,
- the reveal image,
- the final image,
- any client sign-off frame (product, logo, sign, uniform).
Mark them `hero` in the notes column. The sample panel is a hero frame, usually the one that tests casting, setting and light at once.

## 3. One panel per shot, five aspects per panel

Walk the selected script in scene order. Each `Camera:` line becomes one panel; a scene that plainly needs coverage becomes two to four panels. For every panel, the frame cell answers all five aspects in one paragraph, and an aspect that does not apply is written `N/A`, never left out:

1. Subject: who or what, count, and three to six disambiguating attributes copied verbatim from the Continuity block.
2. Subject motion: what happens during the frame, in order.
3. Scene: setting, time of day, weather or light; overlays and on-screen text listed in their own column, never inside the frame description.
4. Spatial framing: shot size (EWS, WS, MS, MCU, CU, ECU, insert, OTS, POV), where the subject sits in frame, what is foreground, midground and background, and how that changes if the camera moves.
5. Camera: speed (real time, slow motion), lens feel, height, angle, focus and depth, steadiness, one movement.

The camera column carries the short form the crew reads: `MS, dolly in, shallow focus`. The frame cell carries the full paragraph.

## 4. Frame source

Every frame cell starts with one of three words:
- `TO GENERATE`: a prompt for the sample or the batch. Text only here.
- `ASSET: {file}`: a client asset from the brief's Assets to carry forward, used as the frame.
- `TO SHOOT`: a location photo or a live reference will be inserted by a person; no image is generated.

## 5. Panel ids and orders

- Panel id `P{nn}` is permanent. A cut panel keeps its id and leaves the Sequence line; a new panel takes the next unused number. "Change P05" means the same panel in every round.
- The crew label is scene-shot, `5C-1`, `7-2`, written in the notes column so the shot list can carry it.
- Story order is the Sequence line and the column. Shoot order stays blank; a person orders the shoot later.
- Panels per scene: one to four. More than four is a scene the script should split, and is a question.

## 6. Transitions and overlays

- Pick a transition vocabulary of at most four for the whole board (hard cut, match cut, fade to black, slow dissolve, push in) and name a transition only where the script's beat map turns. A transition on every panel is noise.
- On-screen text, titles, lower thirds, dashboard readouts and logos go in the `on_screen_text` column. Every prompt ends with the Not-in-frame line so the generator draws no readable text unless the panel asks for it.

## 7. Continuity block and absolute phrasing

- For every recurring subject, write three to six attributes once in the Continuity block and paste them verbatim into every prompt that shows the subject. Paraphrase is how drift starts.
- Write constraints in absolute form with the wrong version named: the colour of a garment and what it is not, the exact count of people in frame, the direction of travel, which side the high ground is on.
- Casting is absolute and specific. Name the ethnicity mix and age per character as the script's Cast block has them, and state that no other faces appear. Apply the same to place: the buildings, the vegetation, the vehicles and the uniforms belong to the film's locale, and the prompt names what they are not.
- Not in frame: no readable text, no logos but the client's, no other brands, no extra people, plus any Limits line from the brief.

## 8. Sample and batch

- Manifest: one `kind: image` item per `TO GENERATE` panel, in story order, `sample: true` on exactly one hero panel. No video items, ever, in pre-production.
- After the sample is approved on the board, the batch uses the same preamble and continuity blocks unchanged. A change the person asks for on the sample is applied to the preamble first, then to every prompt.
- One panel is regenerated at a time. A whole board is never regenerated to fix one panel.

## 9. Auditing what you cannot see

You may not be able to view a generated frame. Audit the stored prompts instead: for each recurring subject, confirm the same attribute block appears in every prompt that shows them, and count. Report which you did: spec drift (prompts differ) is yours to fix; render drift (a correct prompt came back wrong) is the person's call on the board. Never write as though you saw the image.

## 10. Revisions

A change request names panels. Edit only those. A cut panel keeps its id. A new version folder is created; the earlier one is never overwritten. The manifest is regenerated with the same sample panel unless the person chose another.

## Checklist before you deliver

1. One style from `job.json`, one preamble, repeated verbatim in every prompt.
2. Hero frames named: opening, reveal, final, client sign-off; the sample is one of them.
3. Every scene of the selected script has one to four panels; every panel names its scene.
4. Every frame cell starts with TO GENERATE, ASSET or TO SHOOT and answers all five aspects, with N/A written where an aspect does not apply.
5. Camera column carries size, movement and focus in the crew's short form.
6. Panel ids are P01 onward, permanent; crew labels are in notes; shoot order is blank.
7. Overlays and on-screen text live only in their column and every prompt ends with the Not-in-frame line.
8. Continuity block has three to six attributes per recurring subject, pasted verbatim into every prompt; casting and locale are absolute and name what they are not.
9. At most four transition types, named only at beat turns.
10. The manifest has one image item per TO GENERATE panel, exactly one sample, no video.
11. On a revision only the named panels changed and the earlier version folder is untouched.
12. No credit was quoted and no tool was called.

Sources: `docs/sources/storyboard.md`.
