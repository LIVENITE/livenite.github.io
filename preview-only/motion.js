// ---------- Animation speed (previews only) ----------
// Added to preview builds by build.py; the live site's files never contain it.
// Lets you try the run sheet's tap animations at different speeds. The chosen speed becomes the site's setting later.
var motionSpeeds = { off: 0, normal: 250, slow: 700 }, motionChoice = "normal";
try { var savedMotion = localStorage.getItem("livenite-motion"); if (savedMotion && motionSpeeds.hasOwnProperty(savedMotion)) motionChoice = savedMotion; } catch (e) {}
function applyMotion() {
  rsMotion.ms = motionSpeeds[motionChoice];
  document.querySelectorAll('input[name="motion-speed"]').forEach(function (r) { r.checked = r.value === motionChoice; });
}
document.querySelectorAll('input[name="motion-speed"]').forEach(function (r) {
  r.addEventListener("change", function () {
    if (!r.checked) return;
    motionChoice = r.value; applyMotion();
    try { localStorage.setItem("livenite-motion", motionChoice); } catch (e) {}
  });
});
applyMotion();
