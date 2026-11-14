// 50/50 board (phone page and TV): the live prize, plus the draw time and countdown
// taken from tonight's "Draw" activity. Live connections pause while the tab is hidden,
// to keep database reads low.
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { db, configured } from "./firebase-init.js";
import { GAME_ID, SITE, STALE_MS } from "./config.js";
import { money, clock, digits, toMillis } from "./format.js";
import { watchActivities, drawOf, endOf } from "./activities.js";
import { startBulbs } from "./ui.js";

const $ = (id) => document.getElementById(id);
let current = null;
let acts = [];
let stops = [];

$("brand").textContent = SITE.title;
$("sub").textContent = SITE.subtitle;

function note(text) {
  $("live-note").textContent = text;
  $("live-note").hidden = !text;
}

// The pot counts up to a new, higher amount and glows briefly, so people watching notice it went up
// (MOTION-RULES rule 12). With reduce motion it changes straight away.
const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
let potShown = null, potTarget = null, potCounting = false;
function paintPot(text) {
  $("amount").textContent = text;
  $("amount").style.setProperty("--chars", Math.max(text.length, 4));
}
function countUp(from, to) {
  potCounting = true;
  const el = $("amount"); el.classList.remove("pot-bump"); void el.offsetWidth; el.classList.add("pot-bump");
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - p, 3);
    potShown = Math.round(from + (to - from) * e); paintPot(money(potShown));
    if (p < 1) requestAnimationFrame(step); else { potShown = to; potCounting = false; }
  };
  requestAnimationFrame(step);
}

function render() {
  const now = Date.now();
  const ok = current && typeof current.amount === "number";
  if (!ok) { potShown = potTarget = null; paintPot("—"); }
  else if (potTarget !== current.amount) {
    const from = potShown; potTarget = current.amount;
    if (from != null && potTarget > from && !reduceMotion) countUp(from, potTarget);
    else { potShown = potTarget; paintPot(money(potShown)); }
  } else if (!potCounting) paintPot(money(potShown));
  $("amount").classList.toggle("empty", !ok);
  $("updated").textContent = ok && current.updatedAt ? "Updated " + clock(current.updatedAt) : "Waiting for the first update";
  $("price").textContent = (current && current.ticketPrice) || "—";
  $("stale").hidden = !(ok && current.updatedAt && now - current.updatedAt > STALE_MS);

  // The schedule's Draw activity wins; the manager's free-text draw time is the fallback.
  const d = drawOf(acts, now);
  $("time").textContent = d ? clock(d.start) : (current && current.drawTime) || "—";
  const counting = d && endOf(d) > now;
  $("count-fact").hidden = !counting;
  if (counting) {
    $("count-k").textContent = now >= d.start ? "DRAW" : "DRAW IN";
    $("count").textContent = now >= d.start ? "Now!" : digits(d.start - now);
  }
}

function listen() {
  if (stops.length || !db) return;
  stops.push(onSnapshot(doc(db, "games", GAME_ID), (snap) => {
    const d = snap.exists() ? snap.data({ serverTimestamps: "estimate" }) : null;
    current = d ? { amount: d.amount, ticketPrice: d.ticketPrice, drawTime: d.drawTime, updatedAt: toMillis(d.updatedAt) } : null;
    note("");
    render();
  }, () => {
    stops = [];
    note("Live updates stopped. Reload the page.");
  }));
  stops.push(watchActivities((list) => { acts = list; render(); }, () => {}));
}

function stop() {
  stops.forEach((s) => s());
  stops = [];
}

startBulbs();
render();
setInterval(render, 1000);

if (!configured) {
  note("This board isn't connected yet.");
} else {
  listen();
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : listen()));
}
