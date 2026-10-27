// Home page: tonight's itinerary, live from the database.
// Activities and the 50/50 pot update on every screen when a manager saves.
// Live connections pause while the tab is hidden, to keep database reads low.
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { db, configured } from "./firebase-init.js";
import { GAME_ID, VENUES, TYPES } from "./config.js";
import { MIN, money, clock, clockParts, words, digits, badgeTime } from "./format.js";
import { watchActivities, venueOf, endOf, stateOf, drawOf } from "./activities.js";
import { startBulbs, startClock, setNav } from "./ui.js";

const $ = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

let acts = [];
let loaded = false;
let prize = null;
let shownPot = null;
let filter = "all";

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function chip(type) {
  const c = el("span", "chip", TYPES[type] || type);
  c.setAttribute("data-type", type);
  return c;
}
function link(a) {
  const l = el("a", null, a.title);
  l.href = "#a-" + a.id;
  return l;
}
function counter(tag, cls, until, fmt) {
  const n = el(tag, cls, fmt === "words" ? words(until - Date.now()) : digits(until - Date.now()));
  n.setAttribute("data-until", until);
  n.setAttribute("data-fmt", fmt);
  return n;
}
const nextUp = (now) => acts.find((a) => a.start > now) || null;
const liveNow = (now) => acts.filter((a) => stateOf(a, now) === "live");

// ---------- Hero: live now / up next ----------
function renderHero(now) {
  const venuesUsed = new Set(acts.map((a) => a.venue)).size;
  $("tagline").textContent = acts.length
    ? acts.length + (acts.length === 1 ? " activity. " : " activities. ") + venuesUsed + (venuesUsed === 1 ? " venue. " : " venues. ") + "One big night."
    : loaded ? "The programme is coming soon." : "Loading tonight's programme…";

  const live = liveNow(now), np = $("now-panel");
  np.replaceChildren();
  if (live.length) {
    const a = live[0];
    np.classList.add("is-live");
    np.append(el("span", "live-pill", "LIVE NOW"));
    const h = el("h3"); h.append(link(a)); np.append(h);
    const meta = el("div", "meta");
    meta.append(el("span", "venue-name", venueOf(a).name), document.createTextNode(" · ends in "), counter("span", null, endOf(a), "words"));
    np.append(meta);
    const bar = el("div", "bar"), fill = el("span");
    fill.setAttribute("data-from", a.start); fill.setAttribute("data-to", endOf(a));
    fill.style.width = Math.min(100, (now - a.start) / (endOf(a) - a.start) * 100) + "%";
    bar.append(fill); np.append(bar);
    if (live.length > 1) {
      const ul = el("ul", "also-live");
      live.slice(1).forEach((b) => {
        const li = el("li");
        li.append(document.createTextNode("Also live: "), link(b), document.createTextNode(" · " + venueOf(b).name));
        ul.append(li);
      });
      np.append(ul);
    }
  } else {
    np.classList.remove("is-live");
    np.append(el("p", "eyebrow", "Live now"));
    if (acts.length && acts.every((a) => stateOf(a, now) === "done")) np.append(el("h3", null, "That's a wrap"), el("div", "meta", "Thanks for a great night."));
    else np.append(el("h3", null, "Between shows"), el("div", "meta", acts.length ? "Grab a drink. The next one starts soon." : "Nothing is on yet."));
  }

  const nx = nextUp(now), xp = $("next-panel");
  xp.replaceChildren(el("p", "eyebrow", "Up next"));
  if (nx) {
    const h = el("h3"); h.append(link(nx)); xp.append(h);
    xp.append(el("div", "meta", venueOf(nx).name + " · " + clock(nx.start)), counter("div", "big-count", nx.start, "digits"));
  } else {
    xp.append(el("h3", null, acts.length ? "Nothing else tonight" : "Check back soon"), el("div", "meta", acts.length ? "That was the last one." : "The hosts are setting up."));
  }
}

// ---------- Programme ----------
function renderChips() {
  const box = $("chips");
  box.replaceChildren();
  [{ id: "all", name: "Everywhere" }].concat(VENUES).forEach((v) => {
    const b = el("button", null, v.name);
    b.type = "button";
    b.setAttribute("aria-pressed", String(filter === v.id));
    b.addEventListener("click", () => { filter = v.id; renderChips(); renderTimeline(Date.now()); });
    box.append(b);
  });
}

function renderTimeline(now) {
  const list = $("timeline");
  list.replaceChildren();
  const nx = nextUp(now);
  let lastHour = null, shown = 0;
  acts.forEach((a) => {
    if (filter !== "all" && a.venue !== filter) return;
    const hourLabel = new Date(a.start).toLocaleTimeString("en-CA", { hour: "numeric" });
    if (hourLabel !== lastHour) { lastHour = hourLabel; list.append(el("li", "hour", hourLabel)); }
    let st = stateOf(a, now);
    if (st === "upcoming") st = nx && nx.id === a.id ? "next" : "later";
    const li = el("li", "slot");
    li.setAttribute("data-state", st);
    const parts = clockParts(a.start), t = el("div", "slot-time", parts[0]);
    t.append(el("small", null, parts[1]));
    const card = el("a", "act");
    card.href = "#a-" + a.id;
    const top = el("div", "act-top");
    top.append(chip(a.type), el("span", "venue-name", venueOf(a).name));
    const state = el("span", "state");
    if (st === "live") { state.textContent = "LIVE · ends in "; state.append(counter("span", null, endOf(a), "words")); }
    else if (st === "next") { state.textContent = "Starts in "; state.append(counter("span", null, a.start, "words")); }
    else if (st === "done") state.textContent = "Finished";
    else state.textContent = a.length + " min";
    top.append(state);
    card.append(top, el("h3", null, a.title));
    if (a.blurb) card.append(el("p", null, a.blurb));
    li.append(t, card);
    list.append(li);
    shown++;
  });
  if (!shown) list.append(el("li", "empty", !loaded ? "Loading…" : acts.length ? "Nothing scheduled here tonight." : "The programme is coming soon."));
}

function renderVenues(now) {
  const box = $("venues");
  box.replaceChildren();
  VENUES.forEach((v) => {
    const here = acts.filter((a) => a.venue === v.id);
    const cur = here.find((a) => stateOf(a, now) === "live");
    const nxt = here.find((a) => a.start > now);
    const card = el("article", "venue");
    card.append(el("h3", null, v.name), el("p", null, v.blurb));
    const dl = el("dl");
    const dd1 = el("dd", cur ? "now-dd" : null);
    if (cur) dd1.append(link(cur)); else dd1.textContent = "Nothing on";
    const dd2 = el("dd");
    if (nxt) dd2.append(link(nxt), document.createTextNode(" · " + clock(nxt.start)));
    else dd2.textContent = "Done for tonight";
    dl.append(el("dt", null, "Now"), dd1, el("dt", null, "Next"), dd2);
    card.append(dl);
    box.append(card);
  });
}

// ---------- One activity ----------
function renderDetail(a, now) {
  const top = $("d-top");
  top.replaceChildren(chip(a.type));
  const st = stateOf(a, now);
  if (st === "live") top.append(el("span", "live-pill", "LIVE NOW"));
  $("d-title").textContent = a.title;
  $("d-where").textContent = venueOf(a).name;
  $("d-when").textContent = clock(a.start) + " – " + clock(endOf(a));
  const c = $("d-count");
  c.setAttribute("data-fmt", "digits");
  if (st === "live") { $("d-count-k").textContent = "Ends in"; c.setAttribute("data-until", endOf(a)); c.textContent = digits(endOf(a) - now); }
  else if (st === "upcoming") { $("d-count-k").textContent = "Starts in"; c.setAttribute("data-until", a.start); c.textContent = digits(a.start - now); }
  else { $("d-count-k").textContent = "Status"; c.removeAttribute("data-until"); c.textContent = "Finished"; }
  $("d-blurb").textContent = a.blurb || "Details coming soon.";
  $("d-host").textContent = a.host || "The LIVENITE crew";
  const more = $("d-more");
  more.replaceChildren();
  acts.filter((b) => b.venue === a.venue && b.id !== a.id && endOf(b) > now).forEach((b) => {
    const li = el("li");
    li.append(link(b), document.createTextNode(" · " + clock(b.start)));
    more.append(li);
  });
  if (!more.children.length) more.append(el("li", null, "Nothing else here tonight."));
  $("d-5050").hidden = a.type !== "draw";
}

// ---------- 50/50 pot ----------
function showPot(n) {
  const text = n == null ? "—" : money(n);
  $("pot").textContent = text;
  $("fp-amt").textContent = text;
}
function setPot(n) {
  if (n == null || shownPot == null || reduceMotion || n <= shownPot) { shownPot = n; showPot(n); return; }
  const from = shownPot, jump = $("pot-jump");
  shownPot = n;
  jump.textContent = "+" + money(n - from);
  jump.hidden = false;
  setTimeout(() => { jump.hidden = true; }, 4000);
  const t0 = performance.now();
  (function step(t) {
    const p = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - p, 3);
    showPot(Math.round((from + (n - from) * e) * 100) / 100);
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}
function renderPotText(now) {
  const d = drawOf(acts, now);
  const parts = [];
  if (d && endOf(d) > now) parts.push("Drawn live at " + clock(d.start) + " in " + venueOf(d).name + ".");
  else if (d) parts.push("Tonight's draw is done. Thanks for playing!");
  if (prize && prize.ticketPrice) parts.push("Tickets: " + prize.ticketPrice + ".");
  $("pot-sub").textContent = parts.join(" ") || "Tickets on sale now.";
}

// Floating badge: steps aside while the big pot is on screen, hides on the draw's own page,
// and comes back 10 minutes before the draw even if a guest closed it.
let potInView = true, fpClosed = false;
function updateFloat(now) {
  const box = $("float-pot"), d = drawOf(acts, now);
  const hash = (location.hash || "").slice(1);
  const onDrawPage = d && hash === "a-" + d.id;
  const hasPot = prize && typeof prize.amount === "number";
  const live = !d || endOf(d) > now;
  const soon = d && d.start - now <= 10 * MIN;
  const show = !!(hasPot && live && !onDrawPage && (!fpClosed || soon));
  box.hidden = !show;
  if (!show) return;
  box.classList.toggle("away", potInView && !$("view-home").hidden);
  const link = $("fp-link");
  link.href = d ? "#a-" + d.id : "5050/";
  if (!d) { $("fp-when").textContent = "Tickets"; link.setAttribute("aria-label", "50/50 pot " + money(prize.amount)); }
  else if (now >= d.start) { $("fp-when").textContent = "LIVE"; link.setAttribute("aria-label", "50/50 draw happening now. Pot " + money(prize.amount)); }
  else { $("fp-when").textContent = badgeTime(d.start - now); link.setAttribute("aria-label", "50/50 draw in " + words(d.start - now) + ". Pot " + money(prize.amount)); }
}

// ---------- Routing and ticking ----------
function findActivity(hash) {
  return hash.indexOf("a-") === 0 ? acts.find((x) => x.id === hash.slice(2)) : null;
}
function route() {
  const h = (location.hash || "").slice(1), now = Date.now();
  if (h === "programme" || h === "venues") {
    $("view-home").hidden = false;
    $("view-detail").hidden = true;
    setNav(h);
    $(h).scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    updateFloat(now);
    return;
  }
  const a = findActivity(h);
  const d = drawOf(acts, now);
  setNav(h === "" ? "home" : a && d && a.id === d.id ? "draw" : "");
  $("view-home").hidden = !!a;
  $("view-detail").hidden = !a;
  if (a) renderDetail(a, now);
  window.scrollTo(0, 0);
  updateFloat(now);
}

let lastSig = "";
const signature = (now) => acts.map((a) => a.id + stateOf(a, now)).join("|");
function renderAll() {
  const now = Date.now();
  lastSig = signature(now);
  renderHero(now);
  renderTimeline(now);
  renderVenues(now);
  renderPotText(now);
  const a = findActivity((location.hash || "").slice(1));
  if (a) renderDetail(a, now);
  updateFloat(now);
}
function tick() {
  const now = Date.now();
  if (signature(now) !== lastSig) { renderAll(); return; }
  document.querySelectorAll("[data-until]").forEach((n) => {
    const left = Number(n.getAttribute("data-until")) - now;
    n.textContent = n.getAttribute("data-fmt") === "words" ? words(left) : digits(left);
  });
  document.querySelectorAll("[data-from]").forEach((f) => {
    const from = Number(f.getAttribute("data-from")), to = Number(f.getAttribute("data-to"));
    f.style.width = Math.min(100, (now - from) / (to - from) * 100) + "%";
  });
  updateFloat(now);
}

// ---------- Live data ----------
let stops = [];
function listen() {
  if (stops.length || !db) return;
  stops.push(watchActivities((list) => {
    acts = list;
    loaded = true;
    renderAll();
    if ((location.hash || "").indexOf("#a-") === 0) route();
  }, () => {
    // Activities unavailable (for example, rules not published yet): show an empty programme
    // and keep the live 50/50 prize running.
    acts = [];
    loaded = true;
    renderAll();
  }));
  stops.push(onSnapshot(doc(db, "games", GAME_ID), (snap) => {
    prize = snap.exists() ? snap.data() : null;
    setPot(prize && typeof prize.amount === "number" ? prize.amount : null);
    renderPotText(Date.now());
    updateFloat(Date.now());
  }, () => {}));
}
function stop() {
  stops.forEach((s) => s());
  stops = [];
}

startBulbs();
startClock();
renderChips();
renderAll();
showPot(null);
route();
setInterval(tick, 1000);
window.addEventListener("hashchange", route);
$("fp-close").addEventListener("click", () => { fpClosed = true; updateFloat(Date.now()); });
if ("IntersectionObserver" in window) {
  new IntersectionObserver((entries) => { potInView = entries[0].isIntersecting; updateFloat(Date.now()); })
    .observe(document.querySelector(".pot"));
} else {
  potInView = false;
}

if (!configured) {
  loaded = true;
  renderAll();
  $("live-note").textContent = "This site isn't connected to Firebase yet.";
  $("live-note").hidden = false;
} else {
  listen();
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : listen()));
}
