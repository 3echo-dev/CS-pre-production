# The 1-22 Control board

`1-22-control.html` is the board page the pipeline writes to and people decide on: the Gate
A / B / C strip, the stage columns, the XX registers, the inbox, the Storyboard and Sheet
tabs. It ships with the plugin so that every account publishes **its own copy** as a claude.ai
artifact; the plugin never points at somebody else's private board.

The `board-setup` skill publishes it (Artifact tool, capabilities `db` and `artifact`) and
records the address with `scripts/set-board.js`. The page keeps its state in the artifact's
database, so a fresh copy opens on the slate with no projects until the first `board-sync.js
push`.

The file is a built page: the source, `src/1-22-control.html`, plus a base64 copy of that
source in a `<script type="text/plain" id="__src">` tag, so a gate lock can republish the page
from a pristine copy. Edit `src/1-22-control.html`, run `node scripts/build-board.js`, and commit
both files; `build-board.js --check` runs in the test suite, so a hand-edit of the built page
fails the build.

A decision on the page reaches the run as a comment sent to Claude (the `comments` capability),
which starts a turn in the session watching the artifact; the republish is the fallback, and
delivers a version without starting a turn. The panel cards take their ratio from the panels
themselves (`--panel-ar`, from the pixel size `push-panels.js` sends, else the project's aspect
ratio, else 16/9) and fit the frame instead of cropping it.

The database contract the scripts rely on is what `board-sync.js push --json` prints and
what `board-sync.js land` reads back; `skills/board-sync/SKILL.md` describes both.
