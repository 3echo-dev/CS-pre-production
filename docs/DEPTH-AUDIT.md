# Depth audit: what decides each director's decisions

Measured 2026-09-14 from the files on disk. "Before" counts decisions decided by the agent file, its preloaded skills, a template or a check script. "After" adds `playbooks/`. A decision is "decided" when a rule, a template column, a check or a playbook section says what to do; a decision the director is told to raise as a question counts as decided (asking is the rule). "Gap" is a decision nothing decides, with the handoff.

| Director | Decisions | Before | After | Gaps left |
|---|---|---|---|---|
| intake-director | 12 | 7 | 12 | 0 |
| reference-scout | 12 | 6 | 12 | 0 |
| script-director | 14 | 5 | 14 | 0 |
| storyboard-director | 15 | 7 | 15 | 0 |
| shot-list-director | 11 | 6 | 11 | 0 |
| production-planner | 13 | 6 | 12 | 1 |
| audio-supervisor | 12 | 5 | 12 | 0 |
| logistics-registrar | 8 | 8 | 8 | 0 |
| breakdown-compiler | 11 | 6 | 11 | 0 |
| call-sheet-builder | 14 | 7 | 13 | 1 |
| Total | 122 | 63 | 120 | 2 |

## intake-director (playbook: brief-method.md)

| Decision | Before | After |
|---|---|---|
| Which files to open and in what order | agent step 2 (glob), no order | playbook 1: brief, emails by date, deck, assets |
| What an Index row must say | agent step 2 | same, plus unreadable files get a reason |
| Which fields the brief must answer | template headings only | playbook 2: twelve fields with where-found and if-missing |
| How to write the audience | nothing | playbook 3: three layers, unknown per layer |
| How to write Intent | agent step 4 (quoted) | playbook 4: numbered I1 onward with file and page |
| What counts as a conflict | agent step 5 | same, plus length and name conflicts also become questions |
| Which document wins a conflict | agent rule (never silently) | playbook 5: later is a fact, kept is provisional, person overrides |
| Sensitivities and limits to carry forward | nothing | playbook 6 |
| How to rank open questions | nothing | playbook 7: blocks script, blocks logistics, rest |
| What to list as assets | agent step 7 | playbook 8, with the use named |
| Placeholders and invented values | agent rule 3 | playbook 9 |
| Summary length | agent step 8 (fifteen lines) | same |

## reference-scout (playbook: references-method.md)

| Decision | Before | After |
|---|---|---|
| How to build search phrases | agent step 2 (three, from the brief) | playbook 1: three to five, technique words, glossary translation |
| Which sites and in what order | agent rule 1 | same |
| How many sites per run | nothing | playbook 2: two to four, matched to medium |
| How many references | agent step 5 (twelve to twenty) | same, with the fewer-is-fine rule |
| What a row must carry | agent rule 2 | playbook 3, with the Why format tied to Intent numbers and named techniques |
| When to watch a clip and how to report it | agent step 3 (video-watch) | playbook 4: at most three, five aspects, timestamps, transcript status |
| How to record an unreachable site | agent step 4 | same |
| Whether a reference is feasible for this film | nothing | playbook 5: needs line for the top five |
| What to ask the creative director | nothing | playbook 6: three to five questions, options first |
| Provenance of the shortlist | nothing | playbook 7: one of two provenance lines |
| A reference film the client supplied | nothing | playbook 1: entry 1, watched first |
| Revisions | agent rule 6 | same |

## script-director (playbook: script-method.md)

| Decision | Before | After |
|---|---|---|
| Format | agent rule 1 | same |
| What to do with an open brief conflict | agent step 1 | same |
| How to use selected references | agent step 2 | same, plus the technique-to-Intent line |
| The creative problem | nothing | playbook 1.3 |
| Structure before scenes | nothing | playbook 2: beat map, four to eight beats, but-therefore |
| Number of scenes and words for the running time | nothing | playbook 2 table |
| Scene heading and numbering | agent rule 1 and 3 | same |
| Brief line per scene | agent rule 2 | same, numbered Intent |
| Action paragraph shape | nothing | playbook 3: present tense, 25 to 60 words, concrete nouns |
| Camera intent per scene | nothing | playbook 3: one line, size, movement, focus |
| Dialogue and VO discipline | agent rule 4 (final copy) | playbook 4: sparingly, no doubling with text, speech rate, language |
| Casting and locale in the text | nothing | playbook 3 and 4: Cast block, locale explicit |
| Edit pass | agent step 4 (no-ai-slop last) | playbook 5: the rules that apply |
| Revision discipline | agent step 5, rule 6 | same |

## storyboard-director (playbook: storyboard-method.md)

| Decision | Before | After |
|---|---|---|
| Style lock and preamble | agent step 4, rule 1 | playbook 1, with banned words |
| Which frames matter most | nothing | playbook 2: hero frames |
| How many panels per scene | agent step 1 (one per beat) | playbook 3 and 5: one to four, coverage rule |
| What a frame cell must say | storyboard skill, template | playbook 3: five aspects, N/A written |
| Frame source | template (TO GENERATE, ASSET, TO SHOOT) | playbook 4 |
| Panel ids and orders | agent rule 2, template | same, plus crew label in notes |
| Transitions | nothing | playbook 6: at most four, only at beat turns |
| Overlays and on-screen text | template column | playbook 6: never inside the frame; Not-in-frame line |
| Continuity block | agent step 4 (3 to 6 attributes) | playbook 7, with absolute phrasing |
| Casting and locale in prompts | nothing | playbook 7 |
| Sample panel choice | agent step 5 (one) | playbook 2 and 8: a hero frame that tests casting, setting, light |
| Batch discipline | agent rule 5 | playbook 8: preamble first, one panel regenerated at a time |
| Auditing without seeing frames | nothing | playbook 9 |
| Revisions | agent step 6, rule 7 | same |
| No spend, no tools | agent rule 4 | same |

## shot-list-director (playbook: shot-list-rules.md)

| Decision | Before | After |
|---|---|---|
| Columns | template header | playbook 2 table, per-column rules |
| Id form and permanence | agent rule 1 | same |
| Label form | agent step 3 (grouped) | playbook 2: scene-shot as the crew reads it |
| Panels to shots | agent step 2 | playbook 3: master and coverage, grouped setups, dialogue coverage, board gaps |
| Size vocabulary | agent step 3 (five sizes) | playbook 2: nine sizes |
| Movement vocabulary | nothing | playbook 2: twelve movements, one per row |
| Duration estimates | nothing | playbook 5 |
| Total against script duration | nothing | playbook 5: within 15 percent or a question |
| What the description must name | nothing | playbook 4: roles, props, locations in the script's words |
| Retirement | agent step 6 | same |
| No shoot order | agent rule 4 | same |

## production-planner (playbook: planning-rules.md)

| Decision | Before | After |
|---|---|---|
| Templates missing | agent step 1 | same |
| Copy unchanged | agent step 2, rule 5 | same |
| Cell states | agent rule 1 (unknown, zero) | playbook 2: five states |
| Currency and its format | agent step 3 (from workspace) | playbook 3: written form, question if silent |
| Source per figure | agent step 2, rule 2 | same |
| Talent cost and loading | agent step 3 | same |
| Which counts derive from the shot list | nothing | playbook 3 |
| Spend approvers | agent rule 4 (question) | playbook 3: workspace roles first |
| Timeline event types | agent step 4 (four events) | playbook 4: ten event types |
| Rounds and feedback spacing | agent rule 4 (question) | playbook 4: house default marked est. until answered |
| Main film versus trailers | agent step 4 | same, trailer lengths named |
| Sample dates | agent rule 3 | same |
| The client's budget template line structure | nothing | gap: the budget template is not in the handoff (review register S10); the playbook can only say copy it unchanged. Handoff: ask the client for the template before the first job. |

## audio-supervisor (playbook: audio-rules.md)

| Decision | Before | After |
|---|---|---|
| Three rows per scene | agent rule 1 | same |
| VO when the script says none | agent step 3 | same |
| VO row content and locale | nothing | playbook 2 |
| Voice question format | agent step 7 | playbook 2 and 6 |
| VO timing against the scene | nothing | playbook 2: 2.4 words per second |
| Lyric-driven films | nothing | playbook 2 |
| BGM enters, holds, exits | agent step 4 | same, plus cue description and tempo bands |
| Instrumental under speech | nothing | playbook 3 |
| Silence as a choice | nothing | playbook 3 |
| SFX categories and timing | nothing | playbook 4 |
| Diegetic, MOS, sync marking | nothing | playbook 4 and 5 |
| No mix numbers, no generation | agent rule 5 | playbook 7 |

## logistics-registrar (register-forms skill, templates)

| Decision | Before | After |
|---|---|---|
| What roles, props and places to list | agent step 1 | same |
| Field names per register | templates | same |
| unknown versus not applicable | agent rule 2 | same |
| Source text preserved | agent rule 4 | same |
| Who fills rows | agent rule 3 and 6 | same |
| Summary content | agent step 4 | same |
| What a landed value changes | agent step 5 | same |
| No shared database | agent rule 1 | same |

No playbook was written for the registrar: every decision was already decided by the agent file, the register templates and the register-forms skill.

## breakdown-compiler (playbook: breakdown-columns.md)

| Decision | Before | After |
|---|---|---|
| Column order | agent step 1, rule 1 | playbook 1: the eleven-column contract and what feeds each |
| The two client-input columns | agent step 1 | same, plus where a compiler note goes instead |
| Row per shot, in order | agent step 2 | same, labelled with the crew label |
| Continuations | agent step 4 | same |
| Cell states | agent step 3, rule 3 | playbook 3: four states, none blank |
| Extras and named talent format | nothing | playbook 2 |
| Client-to-advise wording | nothing | playbook 3: uppercase, in Specifics |
| Trace per cell | agent rule 2 | playbook 4: file:row form per column |
| References in Remarks | agent step 2 | same |
| Check usage | agent step 6 | same |
| Versions | agent rule 5 | playbook 6, title form |

## call-sheet-builder (playbook: call-sheet-rules.md)

| Decision | Before | After |
|---|---|---|
| Prerequisites | agent step 1 | same |
| Day assignment and order | agent rule 1 and 4 | same |
| Which blocks a sheet has | template (unknown to the agent) | playbook 2: ten blocks and their sources |
| Schedule columns | nothing | playbook 3 |
| Fixed rows (calls, moves, meals, briefs, tear down, wrap) | nothing | playbook 3 |
| Set-up and shot durations | agent step 3 (from rows) | playbook 3: house defaults marked est. |
| AUDIO word per row | nothing | playbook 3 from the audio sheet |
| Cast list form | agent step 4 | playbook 3 and 6: numbered, only on this day |
| Overnight arithmetic | agent step 3 | playbook 4 |
| Parallel units | agent step 6 | playbook 5 |
| Availability blocks | agent rule 2 | playbook 6 |
| Release and revision | agent rule 5 | playbook 7 |
| Contacts, vehicles, weather, hospital | nothing | playbook 2: register, workspace or question |
| Call time offsets per department | nothing | gap: the template's offsets are not known until the client's call-sheet template arrives (review register S03). Handoff: read the template's department rows and record offsets in the workspace. |

## Two gaps, both waiting on the client

1. Budget template structure (S10). Until the client supplies `budget.xlsx`, the planner can copy nothing and the check falls back to CSV.
2. Call-time offsets by department (S03). The sample shows production at call and crew fifteen minutes later; whether that is the template's rule or one day's choice is unknown.

Both are open items on the client sign-off page already; nothing in the plugin decides them and nothing should.
