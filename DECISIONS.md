# LIVENITE decision log

What we decided, why, and what it replaced. Add new decisions at the bottom of the right section, with the date. Rules for editing, saving and deleting data live in **DATA-RULES.md** and aren't repeated here.

Dates before November 2 are approximate: those decisions were made in conversation before this log existed.

---

## How the site is hosted and run

**Hosting: GitHub Pages for the web pages, Firebase for the data** (late Oct 2026)
- Why: free, simple, and lets several people update the site at once without everyone needing an account on a paid service.
- The site lives at https://livenite.github.io/. The GitHub repository has to be public, because private GitHub Pages sites need a paid GitHub plan.
- The site is hidden from search engines (a "noindex" tag on every page).

**Firebase plan: the free "Spark" plan while testing** (late Oct 2026)
- Why: costs nothing while we experiment. This is test and demo use only, not a real money draw.
- Before any real event, move to the pay-as-you-go "Blaze" plan, so the site doesn't shut off for the rest of the month if the free daily limits are hit.

**Time zone: Eastern (Toronto)** (Nov 2026)
- All times are shown in the time zone of the phone or computer viewing the site. That's Eastern for everyone at the event.

**Previews never touch the live data** (Nov 2, 2026)
- Design previews run the live site's code with a copy of the live data held inside the preview page. Changes there save only on that page, and reloading starts again from the copy.
- The admin list and the 50/50 history are never copied into previews, because they contain account emails.

**Design work lives on the `design` branch on GitHub** (Nov 4, 2026)
- The repository has two branches (parallel copies of the files). **main** is what GitHub Pages publishes to https://livenite.github.io/. **design** holds the work in progress: site changes not yet live, DATA-RULES.md, this log, TODO.md, the preview-only demo mode and the tools that build the design preview.
- Why: nothing on `design` can reach the live site by accident, the documents stay next to the code they describe, and work can be picked up later from GitHub.
- Publishing means copying the site files from `design` onto `main` (leaving `preview-only/` and `preview-tools/` behind), and only with an explicit go-ahead.

**Demo mode exists only in previews, never on the live site** (Nov 4, 2026)
- Demo mode lets an admin pretend it's a different time, to see the night as guests would.
- Why: on the live site, an admin who left it on could save real activity times based on a pretend clock.
- How it's kept out: demo mode lives in a separate preview-only add-on that's attached only when a preview page is built. The site files that get published contain none of it.

---

## Who can do what

**Admins only, for now** (Oct 2026)
- Only people on the admin list (called "managers" inside the database) can log in and change anything. Admins run every game screen.
- Game manager logins, where each game manager gets their own login limited to their own games, are planned. See TODO.md.

**"Manager" is called "Admin" on screen** (Oct 2026)
- The database keeps its internal name, "managers", so existing logins keep working.

---

## Activities

**Only one 50/50, but any number of Draws** (Oct 29, 2026)
- The 50/50 has a single pot, countdown and floating badge, so there can only be one.
- "Draws" (prize ticket draws) can be added as many times as needed. Each gets its own menu link, and more than two fold into one "Draws ▾" dropdown.

**Activities can be up to 12 hours long everywhere** (Nov 4, 2026)
- The activity editor used to stop at 6 hours, while game screens and the run sheet allowed 12. They now all allow 12, matching the longest possible event. The editor still asks for at least 5 minutes.

**Only one 50/50, enforced by the database too** (Nov 4, 2026)
- Previously only the page stopped a second 50/50, so two admins saving at the same instant could both succeed. Now the database keeps one "50/50 slot" record naming the 50/50, and making an activity the 50/50 must claim it in the same save. Only one claim can win.

**Activities can share a venue at the same time** (Nov 3, 2026)
- Overlaps at the same venue are allowed and shown as a text note ("OK if planned"), never blocked and never highlighted on the timeline.

**Venues are editable in Admin** (Nov 2, 2026)
- A venue still in use by activities can't be removed until they move elsewhere. There's always at least one venue.

---

## Draws (prize ticket draws)

**What the Draws card shows** (Oct 29 – Nov 3, 2026)
- Before the start: "Draw at [time]".
- While the draw is on: a blinking DRAWING NOW.
- After the end time, if not all tickets are marked drawn: "Results so far" if any winning tickets are entered, otherwise "Results soon".
- Once "All tickets drawn" is saved: SEARCH DRAW RESULTS.

**"All tickets drawn" ends the draw** (Oct 29, 2026)
- Ticking it and saving during the draw ends the draw at that moment, so the card goes straight to SEARCH DRAW RESULTS.
- Unticking doesn't restart the draw. Use the time controls to extend it.

**Ticket search ignores spaces, dashes and leading zeros** (Oct 29, 2026)
- "1388" finds ticket 001388.

**Claimed ticks save instantly** (Nov 2, 2026)
- Ticking Claimed marks a finished task, so it saves the moment it's ticked, with no Save needed. Everything else on the Draws screen waits for Save.

**Winner's name on each prize is optional and public** (Nov 2, 2026)
- Guests see it on the Draws page and in search results. Still open: whether names should be private, or shown as first name and last initial only. See TODO.md.

**Draw screens have a step-by-step guide** (Nov 3, 2026)
- Every Draws and 50/50 game screen opens with a "How this draw works" guide, using that draw's own times and highlighting the step that applies right now.

---

## The 50/50

**The 50/50 card and badge say DRAWING NOW / DRAWING during the draw** (Oct 29, 2026)
- Instead of LIVE, to match what's actually happening.

**The floating 50/50 badge always shows** (Oct 2026)
- It shows on guest pages from before the draw until it ends, with a very large pot amount and the draw's own name. It's hidden on admin screens.

---

## Look and feel

**Card-based retro design with 16 card looks** (Oct – Nov 2026)
- Each activity picks a look (a colour and font pairing from the site's palette) and a graphic (a pattern or an icon).
- A suggested icon is chosen from the activity's name or type, for example "bingo" gives a bingo ball and "strong" gives the barbell and dumbbell.

**Finished activities aren't dimmed** (Oct 2026)
- When a game finishes, its winners show on the card instead.

**LIVE blinks, gently for people who prefer less motion** (Oct 29, 2026)
- Phones and computers set to "reduce motion" get a slow, soft fade instead of no blink at all. The marquee light bulbs follow the same approach.

**Bright yellow is kept for the main action on each screen** (Nov 3, 2026)
- Secondary buttons use a muted style.
- A changed but unsaved time shows in yellow, with a "was [old time]" badge.

---

## Event times and the run sheet

**The event has a planned start and end, at most 12 hours apart** (Nov 3, 2026)
- Why 12: long enough for, say, 3 PM to 2 AM, while still crossing midnight only once.
- Guests see the event times on the home page, under the title.

**Activities must stay inside event hours** (Nov 3, 2026)
- A time change can't move an activity outside the event. Applies on the run sheet, in the activity editor and on game screens.
- An activity that's already outside (from before event times were set) can be moved closer to the event, but not further out.
- The database enforces the same rule. Saves that don't move an activity (winners, ticket lists, labels) are never blocked by it.
- Setting event times for the first time is allowed even if some activities fall outside. Those are flagged for you to move.
- The event times can't be changed so that they leave activities that are currently inside stranded outside.

**Running late pushes the rest of the night, skipping what's live or finished** (Nov 3, 2026)
- If a push would run past the event's end, it warns but still lets you stage it (see DATA-RULES.md, rule 8). Save all then refuses, and offers "Extend event to [time] & save all", which saves both together.

**Run sheet layout** (Nov 3, 2026)
- Laptops: a timeline with a row per venue across the whole event, with a midnight marker showing the date change.
- Phones: a list in time order (Earlier, On now, Coming up).
- Admins only.
- Activities are chosen by clicking or tapping, not dragged, because dragging is error-prone on phones.

**Times are picked with dropdowns that never roll over** (Nov 3, 2026)
- A date box plus hour, minute and AM/PM dropdowns, replacing the browser's own time box, where 59 rolls over to 00 and 12 to 1.
- Minutes go in 5-minute steps. An existing off-step time (such as 7:32) stays in the list so nothing is silently rounded.

**Venue can be changed on the run sheet** (Nov 3, 2026)
- A venue change is an unsaved change like a time change, and saves with Save all.

---

## Working practices

**Data rules first** (Nov 2, 2026)
- DATA-RULES.md covers how every screen edits, saves and deletes data. Every change is checked against it, and against its test checklist, before it ships.

**Automated tests live in the repository** (Nov 4, 2026)
- The tests are in `tests/` on the `design` branch, runnable with `bash tests/run.sh` (see `tests/README.md`), so any future session can rerun them. Each rule in LOGIC-RULES.md names the test that checks it.

**LOGIC-RULES.md is a living technical reference** (Nov 4, 2026)
- It describes exactly how the site behaves, as rules with permanent IDs (for example `CARD-1`, `EVT-3`). Each rule names the code that does it and the test that checks it.
- It's updated in the same change as any behaviour change (DATA-RULES.md, checklist item 10), with a dated change history. Disagreements between code and decisions go to its Open questions, never silently resolved.
- A plain-language version for event helpers comes later, once the design settles.

**Nothing goes live without asking first** (ongoing)
- Changes are made and tested in the design preview first. Publishing to the live site, or changing the live database rules, happens only after an explicit go-ahead.
