# Before a run: what a good pre-production execution needs in hand

Everything here is something the pipeline will otherwise stop and ask for. Each item names
the stop it prevents.

## Client folder (the Drive folder the intake reads)

1. **Brief**: intent, target length per episode, aspect ratio, language rule (spoken and subtitle), platform, hard dates. Prevents: open questions carried through every stage.
2. **One concept document marked as the base.** If a draft and a rework both exist, say which wins. Prevents: a conflict list the script director cannot resolve.
3. **Client assets**: logo, brand colours, product shots, any face or place that must be matched, and what may appear on screen. Prevents: "no logos until the client says so" on every panel.
4. **Look references**: three to five images or clips showing the panel style. Prevents: a storyboard style question at 1c.
5. **A sites or links file** naming where the reference scout may research. Prevents: the scraper row stopping as a question (`sites-check.js`).

## Client setup (once per client, under `workspaces/{client}/client/`)

6. **The four templates** as the client's own Excel files: `budget.xlsx`, `timeline.xlsx`, `breakdown.xlsx`, `call-sheet.xlsx`. Prevents: generic skeletons in the wrong shape.
7. **`sites.md`** with the scout's roster, or item 5 above.
8. **Audio libraries** named in `workspace.json` (`libraries.vo`, `bgm`, `sfx`). Prevents: three "where does the music come from" questions at Stage 2.
9. **Client skills** to wrap, under `client/skills/`, so directors use the client's craft rules instead of the plugin defaults.

## Decisions to have ready (asked at intake, answered on the board)

10. Script format: screenplay or AV script.
11. Storyboard style: sketches, live pictures or cartoon. One only.
12. Production mode: live shoot with shoot days, or AI-generated with zero shoot days. Shapes the budget, the timeline, the audio rows and whether call sheets exist.
13. Cast facts the script needs: ages, names, relations.
14. Locale and location facts: city, one outlet or two, real place or generic build.

## Accounts and limits

15. **3echo workspace** with credits for one per panel plus a redo margin; `credit_ceiling_per_job` in `CONFIG.md` must cover the panel count.
16. **People on the three human seats**: creative director, production assistant, production lead. Each gate waits on a named seat.
17. **Someone to answer the inbox** during the run. An unanswered question is a stall.

## Time

18. Expect two stops before Gate A (sample panel approval, then the lock), one before Gate B (registers entered), and one per shoot day at Gate C. Plan the run across sessions.
