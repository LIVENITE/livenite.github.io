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

function render() {
  const now = Date.now();
  const ok = current && typeof current.amount === "number";
  const shown = ok ? money(current.amount) : "—";
  $("amount").textContent = shown;
  $("amount").style.setProperty("--chars", Math.max(shown.length, 4));
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
