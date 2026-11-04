# Builds the LIVENITE design preview: the live site's own page, styles and script in one file,
# with Firebase swapped for an in-page copy of the live data (snapshot.json).
# Usage (from the repository folder): python3 -I preview-tools/build.py . livenite-design.html
import json, re, sys, pathlib

here = pathlib.Path(__file__).parent
site = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2])
snap = json.load(open(here / "snapshot.json"))

html = (site / "index.html").read_text()
css = (site / "assets/cards.css").read_text()
js = (site / "assets/site.js").read_text()
fmt = (site / "assets/format.js").read_text()
shim = (here / "shim.js").read_text().replace("__SNAPSHOT__", json.dumps(snap))

def once(s, a, b):
    assert s.count(a) == 1, (s.count(a), a[:80])
    return s.replace(a, b)

# The site's imports are replaced by the shim and the formatting helpers.
js = re.sub(r"^import .*?;\n", "", js, flags=re.M | re.S)
fmt = re.sub(r"^export ", "", fmt, flags=re.M)
# Kept in its own scope (it has helpers with the same names as site.js); only what site.js imports comes out.
fmt = ("var _fmt = (function () {\n" + fmt + "\nreturn { money: money, parseAmount: parseAmount, toMillis: toMillis };\n})();\n"
       "var fmtMoney = _fmt.money, parseAmount = _fmt.parseAmount, toMillis = _fmt.toMillis;")

banner = ('<div class="wrap"><p class="preview-note" style="padding-top:10px"><strong>Design preview.</strong> '
          'Live site code and data as of ' + snap["takenAt"] +
          '. You are logged in as admin; changes stay on this page and a reload starts again.</p></div>')

html = once(html, '<link rel="stylesheet" href="assets/cards.css">', "<style>\n" + css + "\n</style>")
html = once(html, '<script type="module" src="assets/site.js"></script>',
            "<script>\n(function () {\n" + shim + "\n" + fmt + "\n" + js + "\n})();\n</script>")
html = once(html, '<div class="wrap">\n  <p class="preview-note" id="conn-note"', banner + '\n<div class="wrap">\n  <p class="preview-note" id="conn-note"')
html = once(html, '<title>LIVENITE</title>', '<title>LIVENITE Design</title>')
html = html.replace('href="5050/tv/"', 'href="#"')

# Preview-only add-ons (demo mode). They're attached here, at build time, so the site's own files
# (which are what gets published to the live site) never contain them.
extra = here.parent / "preview-only"  # the demo-mode add-on, kept out of the site files
html = once(html, "\n})();\n</script>", "\n" + (extra / "demo.js").read_text() + "\n})();\n</script>")
html = once(html, "\n</style>", "\n" + (extra / "demo.css").read_text() + "\n</style>")
html = once(html, '  <section class="panel" id="v-box"', (extra / "demo-panel.html").read_text() + '  <section class="panel" id="v-box"')
html = once(html, '<div class="wrap">\n  <p class="preview-note" id="conn-note"', (extra / "demo-banner.html").read_text() + '<div class="wrap">\n  <p class="preview-note" id="conn-note"')
out.write_text(html)
print("wrote", out, len(html), "bytes")
