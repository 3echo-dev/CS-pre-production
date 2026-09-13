# Playbook: audio requirements

Read by `audio-supervisor` at row 2a. Output: `audio.md` on `templates/audio.md`: one table per scene, three rows each (VO, BGM, SFX), every row with a requirement and a source or `not applicable`, and a Questions list for every choice only a person can make. Nothing is generated and no library is called. The breakdown copies these rows into its audio or lyrics column; post-production reads them as the brief for the mix.

## 1. Order of work

1. Skeleton: one table per scene of the selected script, three rows, every cell `unknown`.
2. Read the approved storyboard first. The board shows what is on screen and what makes a sound.
3. Read the selected script second. The script says what is spoken, and its footer says `VO: none` or where VO lives.
4. Read `workspace.json` for library links (VO provider, music library, SFX library). A library the workspace does not name is `unknown` with a question.
5. Fill rows scene by scene. Then the Questions list. Then the summary.

## 2. VO row

- If the script footer says `VO: none`, every VO row is `not applicable (script: VO none)`. That is a decision with its reason, not a blank.
- If the script has narration, the VO row carries: the line or lines for that scene, the character or narrator, the language, and the accent or register the brief implies. Locale is explicit: the voice belongs to the film's place, and the row says so.
- Voice choice is a board question with options: two or three voice descriptions (gender, age band, register) and a "send me samples" option. Never a specific voice name unless a person gave it.
- Timing check: words in the scene divided by 2.4 words per second must fit inside the scene's estimated seconds from the shot list. If it does not, the row says `over by n s` and the script-director is told through the summary.
- Dialogue on set is not VO. A scene with dialogue and no narration has VO `not applicable (dialogue only, sync sound)`.
- Lyric-driven films (a music video): the VO row carries the lyric line the scene sits under, marked `lyric`, because the breakdown's Lyrics column takes it from here.

## 3. BGM row

- Per scene: `enters`, `holds`, `exits`, or `none`. Music that runs across scenes is written on each scene it runs through with the same cue name.
- Cue description in production words: tempo band, feel, instrumentation, whether it has a lyric. Never a track title unless a person named it.
- Tempo bands, house defaults: calm and observational 60 to 80 bpm; steady and informational 90 to 110; upbeat 110 to 130; action and pursuit 130 or more.
- Instrumental when there is narration or dialogue over it. A vocal track under speech is a question, never a default.
- Even dynamics under speech; a swell or drop only where the beat map turns, and the row names the beat.
- Source: the library named in the workspace, a client-supplied track from Assets to carry forward, or a composer brief marked `to commission`. Each is a source; `unknown` is a question.
- Silence is a choice. A scene with no music is `none`, with the reason (reveal lands in silence; diegetic only).

## 4. SFX row

- One entry per action the board shows that makes a sound: a door, a wheel, a monitor, a siren, a card tap. Written per shot label when a scene has several.
- Categories for live action: diegetic action sounds (what the picture does), ambience and room tone (per location), stings and impacts (a reveal or a stamp), risers (into a reveal, one to three seconds), transitions (a whoosh only for graphics or animation, 400 to 500 milliseconds, starting 10 to 20 milliseconds before the cut).
- Every SFX entry names its source: the workspace's SFX library, location sound recorded on the day (`sync`), or `to design`.
- Mark each scene `Diegetic` or `MOS` in the table header note, because the call sheet's AUDIO column carries that word per shot.

## 5. Sync sound and the shoot

- Scenes with dialogue or diegetic sound the film keeps are marked `sync` so the call sheet lists a sound recordist and the location register flags noise risks (roads, water features, machinery).
- Scenes shot MOS (no sound recorded) are marked so, and their SFX rows say `to design`.

## 6. Questions for the board

Options first, recommended first, a real "not decided yet" among them. Typical: VO voice; whether a scene has music; vocal or instrumental; a client track versus library; the language of VO; whether the reveal plays in silence.

## 7. What this is not

- No credit is spent and no generation tool is called.
- No mix levels, loudness targets or EQ. Those are post-production decisions and live in the post brief.
- VO quality control after a voice is delivered follows the client's round-trip pattern (transcribe, diff against the script, pass, review or fail) in post, not here.

## Checklist before you deliver

1. Every scene of the selected script has one table with exactly three rows: VO, BGM, SFX.
2. Every VO row is a line with character, language and locale, or `not applicable` with its reason.
3. Every VO scene passes the 2.4 words per second timing check or says by how much it is over.
4. Every BGM row says enters, holds, exits or none, with a tempo band and feel, and names its source.
5. No BGM row names a track title a person did not give.
6. Every SFX row lists the sounds the board shows, per shot label where needed, with a source.
7. Every scene is marked Diegetic or MOS, and sync scenes are marked sync.
8. Every `unknown` has a matching question; every `not applicable` has a reason.
9. Questions list options first, recommended first, with a "not decided yet".
10. No mix numbers, no generation, no library called.

Sources: `docs/sources/audio.md`.
