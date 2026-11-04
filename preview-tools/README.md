# Preview tools

These build the **design preview**: a single private page that runs this branch's site code with a copy of the live data held inside the page. Nothing in a preview ever saves to the live database.

- `build.py`: combines `index.html`, `assets/cards.css`, `assets/site.js` and `assets/format.js` into one page. It swaps Firebase for the pretend database and adds the preview-only demo mode from `../preview-only/`.
- `shim.js`: the pretend database. It behaves like Firebase, but the data lives only in the page, and a reload starts again from the copy.
- `snapshot.json`: the copy of the live data the preview starts from (activities, site settings and the 50/50 pot). The admin list and the 50/50 history are never copied, because they contain account emails.

To build: from the repository folder, run `python3 -I preview-tools/build.py . livenite-design.html`.

None of these files, nor `preview-only/`, are published to the live site. See DECISIONS.md.
