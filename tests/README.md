# LIVENITE tests

Automated checks that click through the site in a real browser and test the database rules. They're referred to by name in LOGIC-RULES.md, under each rule's *Check*.

## What's here

| Test | What it checks | Needs |
|---|---|---|
| `preview-save-rules.test.mjs` | DATA-RULES checklist: Save/Cancel, leaving with unsaved changes, editor saving only changed fields, instant Claimed ticks | browser |
| `preview-run-sheet.test.mjs` | Run sheet: event times, outside-hours rules, Save all and "Extend & save all", venue changes, phone layout | browser |
| `preview-demo.test.mjs` | Demo mode (preview only): pretend clock, banner, reload, turning off | browser |
| `preview-startnow.test.mjs` | Game screen Start now | browser |
| `preview-wname.test.mjs` | Draws winner's name and ticket search | browser |
| `preview-sofar.test.mjs` | "Results so far" / "Results soon" / SEARCH DRAW RESULTS | browser |
| `preview-guide.test.mjs` | The step guide on Draws and 50/50 game screens | browser |
| `preview-motion.test.mjs` | MOTION-RULES.md checklist: press-in, hover, selected look, glow where you were working, slides, quick taps all counting, errors shaking, reduce motion, cards glowing as they go LIVE | browser |
| `preview-pinned.test.mjs` | Nothing pinned to the screen (save bars, the unsaved-changes bar, the floating 50/50 badge) is covered, on every screen, at the top and very bottom of the page, on laptop and phone. Checks several points on each button, not just the centre | browser |
| `database-rules.test.mjs` | Every database rule (who can save what, field limits, event hours, one 50/50) | practice database |
| `emu-two-phones-offline.test.mjs` | Two phones editing at once, saving offline, reloading mid-edit | browser + practice database |
| `emu-run-sheet.test.mjs` | Run sheet saves against the real database rules | browser + practice database |

Most browser tests run with animations switched off, so they check behaviour rather than timing; `preview-motion` turns them on. "Browser" tests run against the design preview (built from this branch by `preview-tools/build.py`). "Practice database" means Firebase's local emulator: a copy of Firebase that runs on your own computer, starts empty, and is thrown away afterwards. Nothing touches the live site or its data.

## Running them

From the repository folder:

1. Once: `cd tests && npm install && cd ..`. This installs the test tools: Playwright, Firebase's emulator and the rules-testing library.
2. Every time: `bash tests/run.sh`. It builds the preview, runs every test and ends with **ALL TESTS PASSED** or **SOME TESTS FAILED**.

It needs Node.js, Python 3, Java (for the emulator) and Chromium. If Chromium isn't found automatically, set `CHROME_PATH` to its location.

Screenshots and logs go to `tests/.out/`. That folder isn't saved to GitHub.

## How tests must click

Tests click the way a person does, so they catch what a person would hit.
- **No shortcuts that click through things.** Never use Playwright's `force: true`, or call a button's click from code, to press something a person would tap. Those skip the check that the button is visible, enabled and not covered, which is exactly how the footer covering the run sheet's Save all was missed.
- **Check what's really under the pointer** for anything pinned to the screen (save bars, floating badges): `document.elementFromPoint` must return the button at several points across it, not just the centre. The footer only covered the top half of Save all.
- **Test at the bottom of the page as well as the top**, on laptop and phone sizes. Things pinned to the screen and things that change the page's height behave differently there.
- **Admin panels:** tests start with every Admin panel unfolded. Pass `{ folds: "default" }` to `newContext` to start the way a new visitor does (Activities open, the rest folded).
- **Save the way a person does:** press the box's Apply, then Save all in the save bar (`saveAll(page)` in `lib.mjs`).
- **Wait for slides to finish** (a little over ¼ second) before checking where things ended up, but press buttons mid-slide where the rules promise taps keep working.

## Adding a test

New behaviour gets a test, and its rule in LOGIC-RULES.md names that test under *Check*. Tests print one `PASS` / `FAIL` line per check and finish with `all passed` when everything passed. Shared paths and the browser launcher are in `lib.mjs`.
