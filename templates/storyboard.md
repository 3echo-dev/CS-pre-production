---
job: {job-id}
client: {client}
version: 1
style: ""                     # sketches | live_pictures | cartoon_animation, from job.json
script_version: 0             # the selected script this board draws
panels: 0
status: draft                 # draft | sample_approved | approved | superseded
wrapped: ""                   # generative-frame-craft@..., clip-director@...
created: YYYY-MM-DD HH:MM {tz}
---

## What you're deciding

**This is:** {n} panels for {the film} in {style}, from script v{k}
**Decide:** approve the sample panel first, then the board · name a panel to change · start over
**Next:** after the sample, the batch costs {n} credits; then the shot list

---

# Board v{n}

**Sequence:** P01 -> P02 -> P03
**Panels:** {n} · **Style:** {style} · **Script:** v{k}

Panel ids are permanent. Cut P03 and the others keep their ids; a new panel takes the next unused number. Story order lives in the Sequence line and the column; shoot order is blank until a person orders the shoot.
Text only until the sample panel is approved on the board.

| panel | scene | story_order | shoot_order | frame (TO GENERATE / ASSET: file / TO SHOOT) | camera | on_screen_text | notes |
|---|---|---|---|---|---|---|---|
| P01 | 1 | 1 |  | TO GENERATE {size, setting, who, what the camera sees} | | | sample |
| P02 | 1 | 2 |  | TO GENERATE | | | |
| P03 | 2 | 3 |  | ASSET: {Client Assets/file} | | | |

# Not in frame

Every prompt repeats this: no readable text, no logos but the client's, no other brands, no extra people.

# Continuity

Recurring subject attributes repeated verbatim in every prompt (3 to 6 disambiguating details), the setting, the light.

# Revision log

- v1 (YYYY-MM-DD): created
