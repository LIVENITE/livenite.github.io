// ---------- Demo mode (previews only) ----------
// Added to preview builds by build.py; the live site's files never contain it.
// When on, the whole page reads a pretend clock: real time plus an offset, still running.
var realNow = Date.now.bind(Date);
var demo = { on: false, offset: 0 };
try { var savedDemo = JSON.parse(localStorage.getItem("livenite-demo") || "null"); if (savedDemo && savedDemo.on) demo = { on: true, offset: Number(savedDemo.offset) || 0 }; } catch (e) {}
Date.now = function () { return realNow() + (demo.on ? demo.offset : 0); };

var demoPick = null;
function demoDefault() {
  // 9:20 PM on the event's first day, or on the first activity's day.
  var w = eventWin(), first = sorted()[0], d = new Date(w ? w.s : first ? first.start : realNow());
  d.setHours(21, 20, 0, 0); return d.getTime();
}
function saveDemo() { try { localStorage.setItem("livenite-demo", JSON.stringify(demo)); } catch (e) {} }
function afterClockChange() { lastSig = ""; refresh(); if (!$("view-runsheet").hidden) renderRunSheet(); tick(); }
function demoChanged() {
  demoPick.touched = true;
  var m = demoPick.get(); if (m == null) return;
  if (demo.on) { demo.offset = toMs(m) - realNow(); saveDemo(); afterClockChange(); }
  renderDemo();
}
function renderDemo() {
  if (!demoPick) { demoPick = dateTimePick(toM(demo.on ? Date.now() : demoDefault()), "Demo time", demoChanged); $("demo-when").append(demoPick); }
  // Until someone picks a time, keep the suggestion in step with the data as it loads.
  else if (!demo.on && !demoPick.touched) demoPick.set(toM(demoDefault()));
  $("demo-on").checked = demo.on;
  $("demo-box").classList.toggle("dirty", demo.on);
  $("demo-note").textContent = demo.on ? "On. The clock is running from the time you picked. Turn it off to go back to real time." : "Off. Pick a time, then tick the box.";
  $("demo-banner").hidden = !demo.on;
  if (demo.on) $("demo-banner-text").textContent = "Pretending it's " + new Date(Date.now()).toLocaleString("en-CA", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " (clock running).";
}
$("demo-on").addEventListener("change", function () {
  if (!demoPick) renderDemo();
  if ($("demo-on").checked) demo = { on: true, offset: toMs(demoPick.get()) - realNow() };
  else { demo = { on: false, offset: 0 }; demoPick.set(toM(demoDefault())); }
  saveDemo(); renderDemo(); afterClockChange();
});
// Hook into the site's own screens without changing its code: draw the panel whenever Admin is shown.
var siteRoute = route;
route = function (scroll) { siteRoute(scroll); if (!$("admin-app").hidden && !$("view-admin").hidden) renderDemo(); };
// Keep the banner's time current and show it straight away if demo mode was left on.
setInterval(function () { if (demo.on) renderDemo(); }, 30000);
if (demo.on) { renderDemo(); afterClockChange(); }
