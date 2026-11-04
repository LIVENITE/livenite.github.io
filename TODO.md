# To do

## Waiting on a decision

- **Draws winners' names: public or private?** Right now the optional winner's name on each prize shows to everyone who opens the Draws page. Options: keep it public, show first name and last initial only, or show names only on the admin game screen.

## Next to build

- **Game manager logins.** Each game manager gets their own email login and can only update the games an admin assigns to them (end time, winners, ticket lists). Today only admins (the `managers` list) can log in and run every game screen.

## Publishing the design to the live site

The design preview has many changes the live site doesn't have yet: Save buttons, the run sheet, event times, venues, 10 more card looks, Start now, Results so far, draw guides and more. Publishing them means:

1. **Update the database rules first.** The new rules add event times and venues to the site settings, and check that activities stay inside event hours. They're written and tested in `firestore.rules` (71 rule tests). The live site keeps working with the new rules, so they can go first safely.
2. **Then publish the site files** (`index.html`, `assets/`), plus `DATA-RULES.md`, `DECISIONS.md` and this file.
3. **Set the event times on the run sheet** once it's live. Until then, activities aren't checked against event hours.
4. **Tidy your data:** Cornhole, Strong Man/Woman and Restrooms are still at about 1–3 AM on Oct 29, from earlier testing. They'll show as outside event hours.

Demo mode is not published; it stays in previews only (see DECISIONS.md).

## Known limits

- **A Claimed tick can land on the wrong prize in one rare case.** This can happen if one person removes a prize from a Draws list and saves while someone else is ticking Claimed on that same draw. The fix: give each prize a permanent ID instead of using its position in the list.
- **Firebase free plan.** Move to the pay-as-you-go Blaze plan before any real event, so the site can't shut off for the rest of the month if the free daily limits are hit.
- **Older automated tests need updating.** Two older test scripts still expect "saves as you type", which the Save buttons replaced. A newer checklist test covers the same ground, so they can be removed.
