// Public page and TV: show the live prize. One live connection per screen,
// paused while the tab is hidden or the phone is locked, to keep database reads low.
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { db, configured } from "./firebase-init.js";
import { GAME_ID, SITE, STALE_MS } from "./config.js";
import { money, clock, toMillis } from "./format.js";

const $ = (id) => document.getElementById(id);
let current = null;
let unsub = null;

$("brand").textContent = SITE.title;
$("sub").textContent = SITE.subtitle;

function note(text) {
  $("live-note").textContent = text;
  $("live-note").hidden = !text;
}

function render() {
  const ok = current && typeof current.amount === "number";
  const shown = ok ? money(current.amount) : "—";
  $("amount").textContent = shown;
  $("amount").style.setProperty("--chars", Math.max(shown.length, 4));
  $("amount").classList.toggle("empty", !ok);
  $("updated").textContent = ok && current.updatedAt ? "Updated " + clock(current.updatedAt) : "Waiting for the first update";
  $("price").textContent = (current && current.ticketPrice) || "—";
  $("time").textContent = (current && current.drawTime) || "—";
  $("stale").hidden = !(ok && current.updatedAt && Date.now() - current.updatedAt > STALE_MS);
}

function listen() {
  if (unsub || !db) return;
  unsub = onSnapshot(doc(db, "games", GAME_ID), (snap) => {
    const d = snap.exists() ? snap.data({ serverTimestamps: "estimate" }) : null;
    current = d ? { amount: d.amount, ticketPrice: d.ticketPrice, drawTime: d.drawTime, updatedAt: toMillis(d.updatedAt) } : null;
    note("");
    render();
  }, () => {
    unsub = null;
    note("Live updates stopped. Reload the page.");
  });
}

function stop() {
  if (unsub) { unsub(); unsub = null; }
}

render();
setInterval(render, 30000);

if (!configured) {
  note("This board isn't connected yet.");
} else {
  listen();
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : listen()));
}
