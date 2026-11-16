# To do

## Waiting on a decision

- **Draws winners' names: public or private?** Right now the optional winner's name on each prize shows to everyone who opens the Draws page. Options: keep it public, show first name and last initial only, or show names only on the admin game screen.

## Next to build

- **Game manager logins.** Each game manager gets their own email login and can only update the games an admin assigns to them (end time, winners, ticket lists). Today only admins (the `managers` list) can log in and run every game screen.

- **Rework the Admin "Navigation bar" section (to discuss).** It needs design work. Today it has the logo text and a list of menu items to rename, show or hide, and move up or down (with Draws links added automatically). Details to agree when we pick it up.

- **Rehearsal mode for new users and admins (to discuss).** A way to practise running the night on the live site, separate from demo mode. Demo mode stays as it is: preview only, with its current scope (a pretend clock for looking around). To talk through first:
  - What a rehearsal covers: practising game screens and the run sheet, training new admins and game managers.
  - Keeping real data safe: a pretend clock must never save real times (Start now, End now, Running late, "All tickets drawn" all use "now"). Options include a look-only rehearsal, a separate practice copy of the data, or loading the live line-up into a preview.
  - Who can use it, and how to make sure it can't be left on by accident on event night.

## Later (with the Blaze plan)

- **Server-side check that event times can't strand activities.** The database rules can't scan all activities, so today only the page stops event times being shortened around activities (LOGIC-RULES EVT-6, Q4). A small Firebase Cloud Function could check every change on Firebase's own servers and undo one that strands activities. Cloud Functions need the pay-as-you-go Blaze plan, which is already planned before any real event. Check current pricing when switching.

## After publishing (Nov 16, 2026)

The design was published to the live site on Nov 16: the database rules were updated first (the previous rules are saved in `backups/` on the design branch), the "one 50/50" record was created for the existing 50/50, then the site files went to `main`. Still to do on the live site:

1. **Set the event times:** Admin, then the Run sheet tab, then Apply and Save all. Until then, activities aren't checked against event hours.
2. **Tidy the test data:** CORNHOLE, STRONG MAN/WOMAN and RESTROOOMS are still at about 1–3 AM on Oct 29, from earlier testing. They'll show as outside event hours.

Publishing again later: update the database rules first if they changed, then copy the site files (`index.html`, `assets/`, the 50/50 pages) and the documents from `design` to `main`. Demo mode, `preview-tools/`, `preview-only/`, `tests/` and `backups/` stay on `design`.

## Known limits

- **A Claimed tick can land on the wrong prize in one rare case.** This can happen if one person removes a prize from a Draws list and saves while someone else is ticking Claimed on that same draw. The fix: give each prize a permanent ID instead of using its position in the list.
- **Firebase free plan.** Move to the pay-as-you-go Blaze plan before any real event, so the site can't shut off for the rest of the month if the free daily limits are hit.
- **iPhones can't vibrate on errors.** Websites aren't allowed to vibrate iPhones, so iPhone users get the error shake only (MOTION-RULES rule 11).
- **The 50/50 board and TV screen count-up has no automated test** (MOT-6). It was checked by hand. Those pages aren't part of the design preview.
- **Two rules have no automated test yet:** DRAW-7 ("All tickets drawn" ends the draw) and EVT-6 (event times can't strand activities). See LOGIC-RULES.md.
