# Motion and feedback rules

Standing rules for how every screen responds to taps and clicks, shows what changed, and moves things around. Every new feature and every change follows them. They sit alongside the data rules (how screens edit, save and delete data) and don't repeat them.

## How to use this file

- **People:** add this file to a project, or upload it at the start of a session, and fill in **Project details** at the bottom. From then on, any screen people tap or click is expected to follow these rules and pass the checklist in rule 14.
- **AI assistants:** treat these rules as standing instructions for this project.
  - Before building or changing anything people tap, click or watch change, check the design against every rule.
  - Before calling the work done, run the rule 14 checklist and report which items passed, which failed and which couldn't be tested.
  - If a rule can't be met (for example, a browser doesn't support something), say so plainly and suggest options. Don't quietly skip it.
  - If something in **Project details** is missing, ask for it rather than guessing.
- **Changing the rules:** change them only on purpose, record why in the change history at the end, and tell the person when a change you're making would bend a rule.

## Words used here

- **Tap:** a tap on a phone or a click on a computer.
- **Press-in:** the way something looks while it's being pressed.
- **Hover:** the way something looks when a mouse pointer is over it, before clicking. Only computers with a mouse or trackpad have hover; phones don't.
- **Highlight:** a short glow on something that has just changed, so the eye finds it.
- **Slide:** an animation where something visibly moves from its old place to its new one.
- **Reduce motion:** a setting on phones and computers for people who find movement on screen uncomfortable. Websites can read it.

## Overall feel

The same rules apply on every screen, for guests and for staff. The aim is a polished app feel: every tap answers straight away, changes are easy to follow, and nothing makes you wait.

---

## 1. Every tap gets an answer straight away

Anything that can be tapped visibly presses in the moment it's pressed: buttons, tappable tiles and list items, tick boxes, dropdowns and menu links.

- Press-in: shrinks slightly (to about 95%) and darkens (to about 80% brightness), in under a tenth of a second.
- It must show even if the tap then takes time to do its work.

*Why:* without it, people can't tell whether their tap registered, and they tap again.

## 2. Hover shows what can be clicked (computers only)

On computers with a mouse or trackpad, tappable things react when the pointer is over them.

- Most things: a slight brightening and a soft shadow.
- Main buttons (the bright, most important button on a screen) and large tappable tiles: a stronger hover. They lift a few pixels, get a light ring around them and a deeper shadow. A slight brightening barely shows on bright colours.
- Hover never appears on phones and tablets. It would stick after a tap and look like a selection.

## 3. Selected things stay visibly selected

When tapping something selects it (for example, picking an item to edit), it stays clearly marked until something else is selected.

- The selected item turns a **reserved selection colour** that nothing else on the site uses. It keeps a **stripe of its own colour** across about a third of its width, so you can still tell which item it is.
- Its text must stay readable on the selection colour.
- If an item's own colour is too close to the selection colour, its stripe uses a contrasting colour instead (listed in **Project details**).

*Why:* a thin outline is easy to miss on a busy screen, especially on colourful items.

## 4. What changed is highlighted

Whenever a tap changes something on screen (a time, a position, a value, a list), the thing that changed gets a **highlight**: a glow in the highlight colour that fades over **1 second**.

- Only what actually changed is highlighted, not the whole screen.
- The glow appears where you were working. Other copies of the same item on the screen update quietly, without glowing.
- For a changed value, such as a time, the glow is on the value itself (around its text), not a ring around its whole row.
- A dropdown or choice you just changed yourself doesn't glow: you're already looking at it.
- The highlight never moves anything and never blocks a tap.
- This is the one exception to the ¼-second limit in rule 8. A highlight is a fading colour, not movement, so it doesn't slow anyone down.

## 5. Every tap counts

While something is sliding, the browser ignores taps **anywhere on the page**, not just on the thing that's moving. So:

- **Buttons people tap several times in a row never slide.** Examples: +/− buttons, nudge buttons, steppers, counters. They change instantly and use the highlight (rule 4). This way, tapping +5 three times quickly always adds 15.
- **Other actions may slide** (rules 6 and 7), as long as the screen passes the quick-tap check in rule 14, item 4.
- No animation may make a tap wait before its change happens.

## 6. Things that move slide, then highlight

When a tap moves something to a new place (a list re-sorts, an item moves to a new time or row), it slides from its old place to its new one, then gets the highlight from rule 4.

- Exception: if the tap came from a repeat-tap button (rule 5), it jumps instantly and gets the highlight.
- If the thing being edited would move off screen, the page scrolls to keep it in view.
- **Only what the tap changed may move.** Everything else on the screen stays perfectly still: no flicker, no resizing, no redrawing. If a tap changes one panel, the panels around it don't react.

## 7. Panels and editors slide in and out

When a panel, editor, drawer or pop-up opens or closes, it slides in from its edge (or expands in place) and slides out the same way.

- It slides only when it opens or closes, not each time something inside it changes.

## 8. Quick, with one time limit

- Any movement (slide, expand, press-in, shake) lasts **¼ second or less**.
- The only longer effect is the 1-second highlight (rule 4), which doesn't move anything.

## 9. Changing screens is instant

Going to a different screen or page happens instantly, and the new screen starts at the top.

## 10. Reduce motion is respected

When someone has reduce motion turned on:

- Nothing slides, expands, shrinks or shakes. Changes happen in place.
- Fades and highlights still show, because they don't move anything.
- The error shake (rule 11) becomes a brief red flash.
- Press-in still darkens, but doesn't shrink.

## 11. Errors are hard to miss

When something can't be done (for example, "Can't save: …"):

- The error message gives a short side-to-side shake, ¼ second.
- On phones that allow it, the phone gives a short vibration too. Most Android phones allow this; iPhones don't let websites vibrate, so iPhone users get the shake only.
- With reduce motion on, the shake becomes a brief red flash.
- The wording follows the data rules: it says what's wrong and how to fix it.

## 12. Changes from elsewhere get a gentle cue, never a jolt

Some changes don't come from your own tap: another person's edit, or the clock (something starting, a total going up).

- They get a subtle cue at most. Examples: a number counting up to its new value, or an item glowing briefly as it starts.
- They never slide, and never move or redraw anything someone is in the middle of working on. This matches data rule 2, "never overwrite what someone is working on".
- On staff screens where a tap would be confusing to interrupt, these changes may simply appear without any cue.

## 13. Messages stay as they are

Save status ("Saving…", "Saved", "Could not save") and the short pop-up notes follow the data rules. These motion rules don't change how they behave.

---

## 14. Test checklist before anything ships

Every screen people tap or click must pass all of these:

1. Tap every kind of tappable thing on the screen. Each one visibly presses in as soon as it's pressed.
2. On a computer, move the mouse over tappable things. They react, and the main button and large tiles react clearly. On a phone, nothing stays highlighted after a tap.
3. Select an item. It's clearly marked in the selection colour with its own-colour stripe, its text is readable, and it stays marked until something else is selected.
4. **Quick-tap check:** tap each repeat-tap button 5 times quickly. All 5 count. Then tap something that slides and immediately tap something else. The second tap counts, or the slide is changed so it does.
5. Make a change. Only what changed is highlighted, for about 1 second.
6. Move something. It slides to its new place, then highlights. If it would end up off screen, the page follows it.
7. Make a change, and watch the rest of the screen. Nothing outside the changed area moves, flickers or changes size.
8. Open and close each panel or editor. It slides in and out, and doesn't slide again while you work inside it.
9. Time every movement. Nothing lasts longer than ¼ second, apart from the 1-second highlight.
10. Turn on reduce motion and repeat 1 to 9. Nothing slides, shrinks or shakes; highlights still show; errors flash red.
11. Trigger each error. It shakes (or flashes red with reduce motion), and on an Android phone it vibrates.
12. Have a change arrive from elsewhere while someone is mid-edit. It doesn't move or redraw what they're working on.
13. If the project has a behaviour reference document, it's updated in the same change.

Where possible, these checks are automated tests kept with the project, so anyone can rerun them.

---

## Project details

Fill this in for each project. AI assistants: ask about anything left blank before relying on it.

| Item | This project (LIVENITE) |
|---|---|
| Screens covered | Every screen: guest pages (home, activity pages, ticket search) and Admin (Admin panel, activity editor, game screens, run sheet) |
| Selection colour (rule 3) | White (#ffffff), with a stripe of the item's own card colour across about 30% of its width |
| Stripe exceptions (rule 3) | Cream card looks (Ticket, Diner) use an orange stripe; dark card looks (Chalk and similar) use their dark background colour |
| Highlight colour and length (rule 4) | Yellow glow (the site's bright yellow), fading over 1 second. Times glow on their digits; added rows (winners, prizes) and moved blocks get a ring |
| Repeat-tap buttons (rule 5) | −5 / +5 / +10 time buttons, Running late "By" choices, ticket and winner adders |
| Things that slide (rules 6 and 7) | Run sheet blocks and phone list items moving to a new time or venue; panels and editors opening and closing; the phone Running late panel |
| Press-in (rule 1) | Shrink to 95%, darken to about 80%, under 0.1 second |
| Strong hover (rule 2) | Main yellow buttons (Save, Save all) and run sheet blocks: lift 3 pixels, light ring, deeper shadow |
| Error vibration (rule 11) | About 0.06 seconds, Android only |
| Gentle cues from elsewhere (rule 12) | 50/50 pot amount counts up; a card glows briefly when it goes LIVE. Run sheet: changes from others appear without a cue |
| How motion is built | Slides use the browser's View Transitions feature where available. Browsers without it change instantly, which is allowed. |
| How to run the tests | `bash tests/run.sh` |
| Behaviour reference document | `LOGIC-RULES.md` |
| Data rules | `DATA-RULES.md` |
| Known limits | iPhones can't vibrate from websites (rule 11). Slides block taps across the whole page while they play (rule 5). |

## Change history

- *Nov 13, 2026:* first version, from questions answered and the "Motion options" mock-up.
- *Nov 14, 2026:* rule 4: a changed value glows on its text, not its whole row; a dropdown you just changed doesn't glow.
