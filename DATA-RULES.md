# LIVENITE data rules

Standing rules for how every screen edits, saves and deletes data. Every new feature and every change follows them. Each rule notes the problem that prompted it.

Words used here:
- **Record**: one saved thing in the database, like one activity, the 50/50 pot or the site settings.
- **Edit area**: one panel or form where something is changed, like the Venues panel or the activity editor.
- **Draft**: changes shown on screen that haven't been saved yet.

---

## 1. Edit the real record, never a stale copy

Every box on screen finds its record (by its ID) at the moment you change it. It must not hold on to the copy it was drawn from.

*Why:* the Venues panel saved the first edit and lost the next ones, because the boxes were still tied to a copy the page had already replaced.

## 2. Never overwrite what someone is working on

Updates arriving from the database (from another phone, or from your own earlier save) must not replace:
- a box someone is typing in, or
- an edit area that has unsaved changes.

Those updates are applied once the person saves or cancels.

*Why:* same Venues bug. Incoming saved settings overwrote edits still on screen.

## 3. Every save shows its status

Each save shows **Saving…**, then **Saved** or **Could not save** with the reason. Nothing saves silently, and no failure goes unshown.

## 4. Saving

**Edits wait for Save.**
- Typing, picking from lists, and adjustment buttons only change a draft on screen. Adjustment buttons include −5 / +5 / +10 min, End now, Set end time and Add winner.
- Nothing is saved until you press **Save**.
- **Cancel** throws the draft away and puts back what's saved.

**"Task done" ticks save instantly.**
- Ticking off a completed task saves the moment you tick it, with "Saved" shown briefly beside it.
- Example: **Claimed** on a prize.

**Big switches go through Save.**
- Settings that change what every guest sees wait for Save, even if they're a tick box.
- Example: **All tickets drawn**, which ends the draw and shows the results.

**Unsaved changes are obvious.**
- The edit area shows "Unsaved changes", and its Save button is highlighted.
- Leaving the page, or opening a different edit area, asks first: "You have unsaved changes. Leave without saving?"

## 5. Save only what changed

A save sends only the fields that edit area actually changed, never the whole record copied from when the screen opened.

*Why:* two people working on the same record at once must not wipe each other's work. Example: an admin has the activity editor open while a game manager adds a winner. The admin's Save must not erase that winner.

## 6. Deleting is deliberate

- Every delete needs two taps: "Delete", then "Tap again to delete".
- Anything still in use can't be deleted, and the screen says why. Example: a venue that activities still use.
- Deleting one thing never deletes or changes anything else as a side effect.

## 7. Check twice: on the page and in the database

- **On the page:** a friendly message explains what's wrong before saving. Example: "Length must be between 5 and 360 minutes."
- **In the database rules:** the same limits are enforced, so a mistake in the page can't save bad data, and only admins can save at all.
- Any new kind of data (a new field or a new list) needs its database-rule update tested and published **before** the feature goes live.

## 8. Warn while staging, enforce at Save

Some rules are allowed to bend while you're working on a draft, but never when it's saved.

- **While staging:** a change that breaks a rule can still be added to the draft, with a clear warning saying what's wrong. That way you can see where things land before deciding. Example: a Running-late push that runs past the event's end time.
- **At Save:** anything that still breaks the rule is refused. The save bar says exactly what's wrong and offers the fix as one step where there is one. Example: "Can't save: CORNHOLE would be outside event hours" with an "Extend event to 2:30 AM & save all" button.
- **Fixes save together:** when the fix changes another record, both are saved in the same step, so neither can be saved without the other. Example: the activity times and the new event end time.
- **Changes from either side are checked:** the rule holds whichever record changes. Example: the event times can't be shortened so they leave activities outside the event.
- **Things that are already wrong** (from before a rule existed) can be moved toward fixing them, never further out.

*Why:* an activity pushed past 2:00 AM could be saved while the event still ended at 2:00 AM.

## 9. Test checklist before anything ships

Every edit area must pass all of these:

1. Edit two fields in a row, then Save. Both are kept.
2. Edit, leave the page without saving. It asks first. Cancel puts back what was saved.
3. Save, leave the page, come back. The change is still there.
4. Two phones edit the same record at once. Neither wipes the other's changes.
5. Save while offline, then come back online. You see "Could not save" (or it saves once you're back), never a false "Saved".
6. Reload in the middle of an edit. Nothing half-saved appears.
7. Delete something still in use. It's blocked, with the reason shown.
8. "Task done" ticks save instantly. Everything else waits for Save.
9. Stage a change that breaks a rule (rule 8). It warns while staging, Save refuses it, and the offered fix saves both records together. Try it from both sides, for example by moving the activity and by changing the event times.
10. LOGIC-RULES.md is updated in the same change: any rule whose behaviour changed is rewritten (same ID), new rules get new IDs, and the Change history has a line.

---

*Last updated 2026-11-04: checklist item 10 (keep LOGIC-RULES.md in step). 2026-11-03: added rule 8 (warn while staging, enforce at Save). Change these rules only on purpose, and note why.*
