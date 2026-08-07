# Hearts, Unicorns & Cats

A tiny proof-of-concept maze game: guide a cat through a maze, collect
hearts, and reach the locked gate to free a trapped unicorn. Built for
a kid to actually play on a phone.

## Stack

Plain HTML/CSS/JS — no build step, no dependencies, no package.json.
Everything runs directly in the browser via `<script src="game.js">`.

## Files

- `index.html` — page structure (HUD, canvas, D-pad, win overlay)
- `style.css` — mobile-first styling, safe-area aware
- `game.js` — maze generation, game state, rendering (Canvas 2D),
  input (touch/swipe/keyboard), and sound (Web Audio API synthesis)
- `.github/workflows/deploy-pages.yml` — deploys to GitHub Pages on
  push to `main`. Requires the repo to be public (private repos need
  a paid GitHub plan for Pages) and the Pages source set to "GitHub
  Actions" in repo settings (one-time, manual — no API/CLI covers
  that toggle). If `main` is ever renamed or replaced, GitHub's
  `github-pages` deployment environment can be left with a stale
  "Deployment branches and tags" rule restricting it to the old
  branch name — deploys fail instantly (no runner assigned) until
  that's updated in Settings → Environments → github-pages.

## Local development

No build step. Serve the folder and open it:

    python3 -m http.server 8080

Opening `index.html` directly via `file://` also works (no fetch
calls, everything is self-contained) — but iOS Mail/Files/Messages
often preview local HTML with JavaScript disabled, so test in an
actual browser tab, not an in-app preview.

## Maze generation

`generateMaze()` uses a recursive backtracker to produce a perfect
maze (a spanning tree — exactly one path between any two cells). The
goal cell acts as a locked gate: it's treated as impassable until all
hearts are collected. Because of that, hearts must only be placed in
cells reachable from the start *without* crossing the goal
(`reachableDistances(start, blocked)` computes this) — otherwise a
heart can end up stranded in the branch beyond the gate with no way
to reach it. This is what guarantees every generated maze is
solvable; don't place hearts from unfiltered `openCells()` again.

## Sound

All sound effects are synthesized in-browser via the Web Audio API
(oscillators + gain envelopes) — no audio asset files — plus the Web
Speech API for the spoken "Yay!" on winning. Audio is unlocked via
`unlockAudio()` on the very first `pointerdown`/`touchstart`/`keydown`
event: browsers (especially iOS Safari) require the `AudioContext` to
be created/resumed synchronously inside a real user gesture, and the
D-pad's hold-to-repeat uses `setInterval`, which does *not* count as
a gesture. If sound stops working again, check that unlock is still
firing before the first heart pickup, not lazily on first playback.

## Testing changes

There's no test suite. Verify with a headless browser (Playwright is
preinstalled at `/opt/pw-browsers/chromium`) — check for console
errors, and for maze changes, regenerate many mazes and confirm every
heart is reachable without crossing the goal cell.
