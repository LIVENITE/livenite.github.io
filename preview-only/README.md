# Preview-only add-ons

**Demo mode** lets an admin pretend it's a different time, to see the night as guests would. It's attached only when a preview page is built (by `preview-tools/build.py`), and is never part of the live site. See DECISIONS.md, "Demo mode exists only in previews".

- `demo.js`: the pretend clock and the Admin panel's controls.
- `demo.css`: the striped DEMO MODE banner and panel styles.
- `demo-panel.html`, `demo-banner.html`: the pieces added to the page.
