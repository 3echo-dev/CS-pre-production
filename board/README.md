# The 1-22 Control board

`1-22-control.html` is the board page the pipeline writes to and people decide on: the Gate
A / B / C strip, the stage columns, the XX registers, the inbox, the Storyboard and Sheet
tabs. It ships with the plugin so that every account publishes **its own copy** as a claude.ai
artifact; the plugin never points at somebody else's private board.

The `board-setup` skill publishes it (Artifact tool, capabilities `db` and `artifact`) and
records the address with `scripts/set-board.js`. The page keeps its state in the artifact's
database, so a fresh copy opens on the slate with no projects until the first `board-sync.js
push`.

The file is a built page: the source plus a base64 copy of itself in a `<script type="text/plain"
id="__src">` tag. A gate lock republishes the page from that copy, which is the signal that
wakes a watching Claude Code session. Edit the source elsewhere and rebuild; never hand-edit
this file.

The database contract the scripts rely on is what `board-sync.js push --json` prints and
what `board-sync.js land` reads back; `skills/board-sync/SKILL.md` describes both.
