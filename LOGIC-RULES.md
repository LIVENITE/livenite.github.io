# LIVENITE logic rules

The precise behaviour of the site, written as rules: what the code does, not what it should do. When the code and this document disagree, that's a bug in one of them; record it under **Open questions** until it's settled.

- **Companion documents:** `DATA-RULES.md` (how screens edit, save and delete), `DECISIONS.md` (what was decided and why).
- **Scope:** the code on the `design` branch (`assets/site.js`, `firestore.rules`) and the preview-only add-on (`preview-only/`). Where `main` (the live site) differs, it's noted.
- **Status:** living document. Last reviewed **2026-11-04**.

## How to maintain this document

- **IDs are permanent.** Each rule has an ID (`AREA-n`). Rewording a rule keeps its ID. A removed rule is marked **Retired** with the date, and its ID is never reused. New rules take the next free number in their area.
- **Same change, same commit.** A change to behaviour isn't finished until its rule is updated here, in the same commit as the code (see `DATA-RULES.md`, rule 9).
- **Each rule cites its code and its check.** *Code* names the function or rule block. *Check* names the automated test in `tests/` that proves it (for example `preview-run-sheet` is `tests/preview-run-sheet.test.mjs`), or **none** if there isn't one yet. Run them all with `bash tests/run.sh` (see `tests/README.md`).
- **Disagreements go to Open questions,** never silently resolved.
- **Record every change in the Change history** at the bottom.

## Conventions

- Times are stored as Firestore timestamps (`start`) plus a whole-minute length (`length`). In the page: `start` is in ms, `len` is in minutes, and `end = start + len × 60 000`.
- "Now" is the device clock (`Date.now()`). In previews with demo mode on, it's the pretend clock (DEMO-1).
- Times are shown in the device's time zone. The event runs in Eastern time, so that's Eastern at the event.
- A **draft** is a change shown on screen but not yet saved (`DATA-RULES.md`, rule 4).

---

## TIME: activity timing

**TIME-1. State.** For an activity *a* at time *now*:
- `done` if `now ≥ end`
- `live` if `start ≤ now < end`
- `upcoming` otherwise

Start is inclusive and end is exclusive.
*Code:* `stateOf()`. *Check:* `preview-startnow`, `preview-demo` (indirectly).

**TIME-2. Next up.** The *next* activity is the one with the earliest `start > now`, across all types. Every other upcoming activity is *later*.
*Code:* `nextUp()`, `cardFor()`.

**TIME-3. Length limits.**
- Everywhere: at most 720 minutes (12 hours).
- Activity editor minimum: 5 minutes.
- Game screens, the run sheet and the database minimum: 1 minute (so "End now" can end something a minute after it started).
*Code:* `m-form` submit, `moveEnd()`, `validActivity()`. *Check:* `database-rules`.

**TIME-4. Moved-on-the-night record (`schedLength`).**
- On a game screen, the first save that changes the length records the previous length as `schedLength`. The game screen then shows "Scheduled: [original end]".
- Saving a new start or length in the activity editor deletes `schedLength`, because a new schedule replaces the old one.
- Run sheet saves don't touch it. See Open question Q2.

*Code:* `timeArea.save`, `m-form` submit, `rsSaveAll()`.

**TIME-5. Re-evaluation.** Every second the page checks whether any activity's state has changed (TIME-1). If one has, it redraws every screen. Countdowns update every second.
*Code:* `tick()`, `sig()`.

---

## CARD: what each card shows

**CARD-1. Status line, in order.** The first matching rule wins:

| # | Condition | Shows |
|---|---|---|
| 1 | Draws and `live` | blinking **DRAWING NOW** |
| 2 | Draws and `resultsFinal` | **SEARCH DRAW RESULTS** |
| 3 | `live`, any other type | blinking **LIVE** (50/50: **DRAWING NOW**), plus " See winners" if it has winners |
| 4 | Draws, `done`, not final | "Results so far" if any ticket is entered (DRAW-6), else "Results soon" |
| 5 | Draws, `upcoming` | "Draw at [start]" |
| 6 | 50/50, not `done` | "Draw in m:ss" (or h:mm:ss), counting down to start |
| 7 | *next* (TIME-2) | "Starts in N min" / "N h M min" |
| 8 | `done` | "Finished" |
| 9 | otherwise (*later*) | "[length] min" |

*Code:* `cardFor()`. *Check:* `preview-sofar` (rows 4 and 2), `preview-demo` (rows 1, 3, 7). Rows 5, 6, 8 and 9 are none.

**CARD-2. Winners on cards.** A card lists its winners ("Winner" / "Winners: a · b") only when the activity is `done` and has at least one winner.
*Code:* `cardFor()`.

**CARD-3. 50/50 card body.** It shows the pot (`money(pot)`, or "$—" if no pot has been saved), then "Draw at [start] · Tickets [price]" (the price part only if one is set), then the tagline.
*Code:* `cardFor()`.

**CARD-4. Blinking.**
- LIVE and DRAWING NOW blink on and off about once a second.
- On devices set to reduce motion, they instead fade slowly every 2 seconds.
- Marquee bulbs follow the same pattern: they chase, or fade slowly every 2.4 seconds.

*Code:* `cards.css` (`.pill`, `@media (prefers-reduced-motion)`).

**CARD-5. Graphic.**
- `graphic = "suggest"`: an icon from the first matching word in the title, otherwise from the type (game → dice, music → microphone, social → cocktail, challenge → trophy, 50/50 and Draws → ticket).
- `graphic = "auto"`: patterns cycle in line-up order (LINEUP-1).
- Any other value: that graphic.

*Code:* `suggestFor()`, `graphicOf()`, `renderCards()`.

**CARD-6. Title fit.** The title's font size is capped so its longest word fits the card width, using a per-look letter-width factor.
*Code:* `cardFor()` (`--fit`, `widths`).

---

## LINEUP: home page order and header

**LINEUP-1. Order.**
1. live activities, by start;
2. the first upcoming activity that isn't the 50/50;
3. the 50/50, if it's upcoming;
4. the remaining upcoming activities, by start;
5. finished activities, by start.

*Code:* `renderCards()`.

**LINEUP-2. Tagline.**
- If the admin set a tagline, show it.
- Otherwise: "[N] shows. [M] venues. One big night.", where M counts the distinct venues in use.
- With no activities: "Tonight's line-up is coming soon."

*Code:* `renderChrome()`.

**LINEUP-3. Event times line.** When both event times are set, the home page shows "[Day, Mon D] · [start] – [end]" under the tagline. Otherwise it shows nothing.
*Code:* `renderChrome()`, `fullWhen()`. *Check:* `preview-run-sheet`, `emu-run-sheet`.

**LINEUP-4. Menu.**
- Items show in the admin's order, and hidden items are skipped.
- "50/50" appears only if a 50/50 activity exists, and links to it.
- "Draws": one link per Draws activity, named after it and in start order. With more than two, they fold into a "Draws ▾" dropdown.
- The current page's item is highlighted. Any admin screen highlights Admin.

*Code:* `renderChrome()`, `highlight()`.

---

## TYPE: activity types

**TYPE-1. One 50/50.** At most one activity can have type `draw`.
- **Page:** the editor disables the option when another 50/50 exists, and refuses the save if one is forced.
- **Database:** the record `site/fiftyFifty` (`{ activityId, updatedAt }`) names the activity that is the 50/50.
  - Making an activity the 50/50 (creating one, or changing an activity's type to `draw`) must claim that record in the same save.
  - The claim is refused unless the record names this same activity, or the activity it names is gone or is no longer a 50/50.
  - Saving an activity that's already the 50/50 needs no claim.
  - Two admins making a 50/50 at the same moment can't both succeed: there's only one record to claim.
- **Saves that claim it:** the editor (new 50/50, or a change to 50/50) and Load sample night.
- If the database refuses a claim, the editor says another activity was just made the 50/50.

*Code:* `otherDraw()`, `openEditor()`, `m-form` submit, `fiftyFiftyOk()` and `validFiftyFifty()` (rules). *Check:* `database-rules` (7 checks), `emu-run-sheet` (sample night claims it).

**TYPE-2. Any number of Draws.** A new Draws starts with 10 empty prizes. Changing an existing activity to Draws gives it 10 if it has none.
*Code:* `formActivity()`, `m-form` submit.

**TYPE-3. Game screens.** An activity has a game screen if it has a game manager, or is a 50/50 or Draws.
*Code:* `route()`, `renderActList()`.

---

## DRAW: Draws (prize ticket draws)

**DRAW-1. Prize rows.** Each prize has:
- `label`: shown as "#n" when blank;
- `ticket`: up to 12 characters;
- `name`: optional, up to 60 characters;
- `claimed`: true or false.

At most 200 prizes.
*Code:* `slotLabel()`, `renderSlots()`, `validActivity()`.

**DRAW-2. Ticket matching.**
- Ticket numbers are compared after removing everything except letters and digits, uppercasing, and removing leading zeros (keeping at least one character). So "1388", "001388" and "00-1388" all match.
- A search hit needs an exact match after this cleanup.

*Code:* `cleanNo()`, `renderTickets()`. *Check:* `preview-wname`.

**DRAW-3. Search messages.**
- **Hit:** "Ticket [t] is a winner! [label], won by [name]" (the name part only if set, and its trailing full stop removed). Then either ". This prize has been claimed." or ". Collect it at the prize desk."
- **Miss:** "Ticket [q] isn't on the list" + "." if results are final, else " yet. More tickets are still being drawn."

*Code:* `renderTickets()`.

**DRAW-4. Claimed saves instantly.**
- Ticking Claimed saves straight away. A transaction reads the latest list and sets only that prize's `claimed`, matched by its position in the saved list.
- If the save fails, the tick reverts and shows "Not saved ([reason])".
- A prize that's in the draft but not yet saved can't be ticked.

See Known limit L1.
*Code:* `saveClaim()`. *Check:* `preview-save-rules`, `emu-two-phones-offline`.

**DRAW-5. Saving the ticket list.**
- "Save ticket list" saves the draft's labels, tickets, names, added and removed rows, and the `resultsFinal` setting, in one transaction.
- Each row's `claimed` is taken from the latest saved list, never from the draft.

*Code:* `slotsArea.save`.

**DRAW-6. Drawn count.** A prize counts as drawn when its ticket is non-empty after cleanup (DRAW-2).
*Code:* `drawnCount()`.

**DRAW-7. All tickets drawn.**
- Saving `resultsFinal = true` while the draw is `live` also ends it: `length = max(1, floor((now − start) / 1 min))`, with `schedLength` recorded per TIME-4.
- Unticking and saving sets `resultsFinal = false` but doesn't restart the draw.

*Code:* `slotsArea.save`. *Check:* none yet (an earlier mockup was tested, but that test wasn't carried over).

**DRAW-8. Draw page status box.** Shows Drawing now, Results posted, Results so far, Results soon or "Draw at [start]", following CARD-1's precedence.
**DRAW-9. Draw page list heading.**
- "All tickets drawn. N winning tickets."
- "Results so far: N of M drawn. More may be added." (after the end time)
- "Drawing in progress: N of M drawn so far."
- "No tickets drawn yet."

Draws pages have no winners panel.
*Code:* `renderDetail()`, `renderTickets()`.

**DRAW-10. Guide.** Draws and 50/50 game screens show a step guide. The highlighted step:
- **Draws:**
  - `resultsFinal` → "All tickets drawn";
  - `upcoming` → "Before";
  - `live` → "Drawing";
  - `done` → "End time passed".
- **50/50:**
  - `upcoming` → "Before";
  - `live` with no winner → "Drawing";
  - `live` with a winner → "Winner drawn";
  - `done` → "After".

*Code:* `renderGuide()`. *Check:* `preview-guide`.

---

## POT: the 50/50

**POT-1. Pot record.**
- `games/5050` holds `{ amount, ticketPrice, drawTime, updatedAt }`.
- Each save also adds a history entry with the saver's email. Only admins can read history, and it can't be edited or deleted.
- `amount` is 0–10 000 000. "1,240.50" is accepted and rounded to cents.

*Code:* `potArea.save`, `parseAmount()`, `validPublic()`, `validHistory()`. *Check:* `database-rules`.

**POT-2. Floating badge.** The badge shows when all of these are true:
- a 50/50 exists;
- `now < its end`;
- the viewer is on a guest page (not Admin, a game screen, the run sheet, or the 50/50's own page);
- it hasn't been dismissed with ×, or the draw is within 10 minutes.

It shows the 50/50's name, the pot, and "m:ss" / "Hh MM" until the start, then "DRAWING".
*Code:* `updateFloat()`.

**POT-3. Pot animation.** When a saved pot rises, the amount counts up over 0.9 s with a "+$x" flash. On reduce-motion devices it changes instantly.
*Code:* `animatePot()`.

**POT-4. 50/50 winners.** A 50/50 winner entered with a ticket number is stored as "[name] (ticket #[n])".
*Code:* `gm-win-form` submit.

---

## GAME: game screens (time controls)

**GAME-1. Start now.** The draft start becomes now, rounded down to the minute. The length stays the same, so the end moves with it.
*Code:* `gm-start-now` handler. *Check:* `preview-startnow`.

**GAME-2. End now.**
- The draft length becomes `max(1, floor((now − draft start) / 1 min))`.
- It's only available while `draft start ≤ now < draft end`.

*Code:* `gm-end-now` handler.

**GAME-3. Adjust and set.**
- −5 / +5 / +10 change the draft length.
- "Set" picks a clock time on the start's date, or the next day if that time is earlier than the start.
- The result must be a length of 1–720 minutes.

*Code:* `moveEnd()`, `setTimes()`, `gm-set-form`.

**GAME-4. Save times.**
- Saves only what changed: `start`, and `length` plus `schedLength` per TIME-4.
- Refused if the result breaks EVT-3.

*Code:* `timeArea`. *Check:* `preview-startnow`.

**GAME-5. Winners.**
- "Add to list" and × change the draft.
- "Save winners" runs a transaction on the latest list: removes the first occurrence of each removed name, then appends the added names.
- Maximum 50 winners.

*Code:* `winArea`. *Check:* `emu-two-phones-offline` (two phones).

---

## EVT: event times

**EVT-1. Storage.**
- `site/settings.eventStart` and `eventEnd` (timestamps) are set together or not at all.
- `eventEnd > eventStart` and `eventEnd − eventStart ≤ 12 h`.

The database enforces all of this.
*Code:* `validEventTimes()` (rules), `rsEvCheck()`. *Check:* `database-rules`, `preview-run-sheet`.

**EVT-2. Unset means unconstrained.** With no event times, no activity is checked against event hours. The run sheet spans all activities and prompts for times.
*Code:* `eventWin()`, `windowProblem()`, `renderTimeline()`.

**EVT-3. The window rule.** With old times `(s₀, e₀)` and new times `(s, e)`, a change is allowed when both:
- `s ≥ eventStart` **or** `s ≥ s₀`;
- `e ≤ eventEnd` **or** `e ≤ e₀`.

So a move can't take an activity outside the event, and one already outside can only move closer. A new activity must be fully inside.

Applies to the activity editor, game screens and run sheet moves. The database applies the same test to the settings as they'll be **after** the save (`getAfter`), so extending the event in the same save counts.
*Code:* `windowProblem()`, `rsSetDraft()`, `timesInEvent()` / `insideOrCloser()` (rules). *Check:* `database-rules`, `preview-run-sheet`, `emu-run-sheet`.

**EVT-4. Unmoved saves always pass.** A save that leaves `start` and `length` unchanged (winners, tickets, labels, look) is never refused by EVT-3.
*Code:* `unmoved()` (rules). *Check:* `database-rules`.

**EVT-5. Setting times for the first time.** Allowed even if activities fall outside. Those are then flagged as outside.
*Code:* `ev-save` handler.

**EVT-6. No stranding.** Changing existing event times is refused if any activity currently fully inside would end up outside. The page checks this; the database can't, because it can't scan all activities in a rule (Q4).
*Code:* `ev-save` handler. *Check:* none yet (the run sheet mockup was tested, but that test wasn't carried over).

**EVT-7. Outside, explained.** Activities outside event hours are labelled:
- "Not during the event" (no overlap with the event at all);
- "Starts before the event starts";
- "Ends after the event ends".

Those with no overlap are listed under "Outside event hours". Those partly outside get an orange outline on the timeline.
*Code:* `rsOutsideText()`, `renderTimeline()`.

---

## RS: run sheet (admins)

**RS-1. Layout.**
- Above 760 px wide: a timeline with one row per venue, from 30 minutes before the event start to 30 minutes after the end, shading outside event hours, a midnight marker per date change, and a now line.
- At 760 px or less: a list (Earlier / On now / Coming up / Outside event hours), with a date heading at each new day.

*Code:* `renderTimeline()`, `renderRsPhone()`.

**RS-2. Drafts.** Time and venue changes are per-activity drafts, until Save all or Cancel. The live/finished labels on the run sheet use **saved** times, not draft times.
*Code:* `RS.drafts`, `rsState()`.

**RS-3. Single moves.**
- Start −5 / +5 / +10 moves the whole activity (the length stays the same). End −5 / +5 / +10 changes the length.
- Start now keeps the length. End now sets the end to now.
- Every change is checked against EVT-3 straight away; a refused change is never added to the draft.

*Code:* `rsControls()`, `rsSetDraft()`.

**RS-4. Exact pickers.**
- A date box plus hour, minute (5-minute steps; an existing off-step minute is kept) and AM/PM dropdowns.
- Dates are limited to the event's dates.
- The result must be **fully inside** the event, which is stricter than EVT-3.
- For an activity that's outside, it suggests the same time of day on the first event date where it fits.

*Code:* `dateTimePick()`, `rsSuggestedStart()`. *Check:* `preview-run-sheet`.

**RS-5. Running late.**
- Moves every activity that is upcoming (by saved times), at least partly inside the event, and starts after the chosen point ("Now", or a chosen activity, which is itself included).
- Moves by 5, 10, 15, 30 or 60 minutes.
- Live and finished activities are skipped.
- "Add to changes" stages the moves as drafts.

*Code:* `rsLateMoves()`, `renderLate()`.

**RS-6. Warn while staging, enforce at Save** (`DATA-RULES.md`, rule 8).
- If a push would end past the event's end, the panel warns and offers "Extend the event to [time]", rounded up to the quarter hour. That's greyed out if it would exceed 12 h.
- At Save all, any draft breaking EVT-3 blocks the save. The bar then offers "Extend event to [time] & save all", rounded out to quarter hours, if the result is ≤ 12 h.

*Code:* `rsViolations()`, `renderRsSaveBar()`. *Check:* `preview-run-sheet`, `emu-run-sheet`.

**RS-7. Save all.** One batch:
- for each changed activity, only the changed fields of `start`, `length` and `venue`;
- plus the new event times when extending.

The database checks EVT-3 against the event times after the save.
*Code:* `rsSaveAll()`. *Check:* `emu-run-sheet`.

**RS-8. Overlaps.** Two activities overlap when they share a venue and their times intersect. This shows as text ("⚠ N overlapping (OK if planned)", or a note in the editing panel). It's never highlighted and never blocks.
*Code:* `rsOverlaps()`.

---

## VEN: venues

**VEN-1. List.**
- 1–20 venues, each with an ID and a name (30 characters max).
- Names are required to save.
- A new venue's ID is "v" + a time-based code.

*Code:* `venueArea`, `validSettings()`.

**VEN-2. In use.** A venue used by any activity can't be removed. If another admin moves an activity into a venue that this draft removes, the save is refused.
*Code:* `renderVenueRows()`, `venueArea.check`.

**VEN-3. Removed but referenced.** An activity whose venue ID isn't in the list shows the raw ID. In the editor it appears as "[id] (removed)".
*Code:* `fillVenueOptions()`.

---

## ACC: access

**ACC-1. Guests** can read activities, site settings and the 50/50 pot, without logging in.
**ACC-2. Admins** are logged-in users with a document at `managers/{uid}`. Only admins can create, update or delete activities, save site settings, save the pot, and read pot history. No one can add themselves to the admin list from a page.
**ACC-3. Field checks.** The database checks every saved activity's fields (types, sizes, allowed fields) whatever the page sends, and requires `updatedAt` to be the server's time.
*Code:* `firestore.rules`. *Check:* `database-rules` (78 checks).

**ACC-4. Game managers** (planned): see TODO.md.

---

## DEMO: demo mode (previews only)

**DEMO-1. Pretend clock.**
- When on, `Date.now()` returns the real time plus an offset, so the pretend clock keeps running.
- It applies to every time-based rule on the page.
- It's stored in this browser only (`localStorage`) and survives reloads.

*Code:* `preview-only/demo.js`. *Check:* `preview-demo`.

**DEMO-2. Never live.** Demo mode is added by `preview-tools/build.py` and isn't in any published file (see DECISIONS.md).

---

## Open questions

- **Q2. `schedLength` is inconsistent.** Game screens record the original length, the editor clears it, and the run sheet leaves it alone. Should run sheet moves record "Scheduled" too?
- **Q4. No-stranding is page-only.** The database can't check EVT-6. A buggy or out-of-date page could shrink the event around activities.
- **Q5. Winners' names on Draws are public.** Still undecided (see TODO.md).

## Known limits

- **L1.** Claimed is matched by position (DRAW-4). If someone saves a list with a prize removed while another person ticks Claimed on the same draw, the tick can land on the wrong prize. Fix: give each prize a permanent ID.

## Resolved questions

- **Q1 (2026-11-04).** Length limits differed (editor 5–360 minutes, elsewhere 1–720). Resolved: the editor now allows up to 720 minutes too. See TIME-3.
- **Q3 (2026-11-04).** One 50/50 wasn't enforced by the database. Resolved: the database now requires claiming `site/fiftyFifty`. See TYPE-1.
- **Q6 (2026-11-04).** Tests weren't in the repository. Resolved: they're in `tests/`, with `tests/run.sh` and `tests/README.md`.

## Change history

- **2026-11-04:** First version, written from the code on the `design` branch (commit `373b5d3`).
- **2026-11-04:** TIME-3 (editor allows 720 minutes), TYPE-1 (one 50/50 enforced by the database), ACC-3 (78 checks). Tests moved into `tests/`, and every *Check* now names a test there. Q1, Q3 and Q6 resolved.
