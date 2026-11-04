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
| `database-rules.test.mjs` | Every database rule (who can save what, field limits, event hours, one 50/50) | practice database |
| `emu-two-phones-offline.test.mjs` | Two phones editing at once, saving offline, reloading mid-edit | browser + practice database |
| `emu-run-sheet.test.mjs` | Run sheet saves against the real database rules | browser + practice database |

"Browser" tests run against the design preview (built from this branch by `preview-tools/build.py`). "Practice database" means Firebase's local emulator: a copy of Firebase that runs on your own computer, starts empty, and is thrown away afterwards. Nothing touches the live site or its data.

## Running them

From the repository folder:

1. Once: `cd tests && npm install && cd ..`. This installs the test tools: Playwright, Firebase's emulator and the rules-testing library.
2. Every time: `bash tests/run.sh`. It builds the preview, runs every test and ends with **ALL TESTS PASSED** or **SOME TESTS FAILED**.

It needs Node.js, Python 3, Java (for the emulator) and Chromium. If Chromium isn't found automatically, set `CHROME_PATH` to its location.

Screenshots and logs go to `tests/.out/`. That folder isn't saved to GitHub.

## Adding a test

New behaviour gets a test, and its rule in LOGIC-RULES.md names that test under *Check*. Tests print one `PASS` / `FAIL` line per check and finish with `all passed` when everything passed. Shared paths and the browser launcher are in `lib.mjs`.
