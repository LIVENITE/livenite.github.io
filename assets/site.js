// LIVENITE: the card line-up, activity pages, Admin and game screens, all on one page.
// Everyone reads tonight's activities, the site settings and the 50/50 pot live from the database.
// Only admins (people on the "managers" list) can save; firestore.rules enforces that.
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { doc, getDoc, onSnapshot, collection, query, orderBy, setDoc, updateDoc, addDoc, deleteDoc, writeBatch, runTransaction, deleteField, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { app, db, configured } from "./firebase-init.js";
import { GAME_ID } from "./config.js";
import { money as fmtMoney, parseAmount, toMillis } from "./format.js";

var MIN = 60000;
var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
var $ = function (id) { return document.getElementById(id); };

// ---------- Motion and feedback helpers (MOTION-RULES.md) ----------
// Movement only when reduce motion is off; otherwise changes are instant.
function canMove() { return !reduceMotion; }
function replayClass(n, cls) { if (!n) return; n.classList.remove(cls); void n.offsetWidth; n.classList.add(cls); }
// Rule 4: what changed glows yellow for 1 second (also with reduce motion: it doesn't move anything).
function glow(n) { replayClass(n, "glow"); }
// For a changed value (a time), the glow is on the text itself rather than a ring around it.
function glowText(n) { replayClass(n, "glow-text"); }
// Rule 11: errors shake (a red flash with reduce motion) and vibrate on phones that allow it (not iPhones).
function shake(n) { replayClass(n, reduceMotion ? "err-flash" : "shake"); try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) {} }
// Rule 7: panels slide in when they open and out when they close.
function panelIn(n) {
  clearTimeout(n.outTimer);
  var opening = n.hidden || n.classList.contains("panel-out");
  n.classList.remove("panel-out"); n.hidden = false;
  if (opening && canMove()) replayClass(n, "panel-in");
}
function panelOut(n) {
  if (n.hidden) return;
  if (!canMove()) { n.hidden = true; return; }
  n.classList.remove("panel-in"); n.classList.add("panel-out");
  clearTimeout(n.outTimer);
  n.outTimer = setTimeout(function () { n.classList.remove("panel-out"); n.hidden = true; }, 250);
}

var STYLES = [
  { id: "marquee", name: "Marquee (sunflower)" },
  { id: "sunset", name: "Sunset (tangerine)" },
  { id: "wave", name: "Wave (aqua)" },
  { id: "bloom", name: "Bloom (rose)" },
  { id: "neon", name: "Neon (dark, glowing)" },
  { id: "studio", name: "Studio (dark, gold)" },
  { id: "ember", name: "Ember (tangerine, bold)" },
  { id: "sunflower", name: "Sunflower (yellow, script)" },
  { id: "lagoon", name: "Lagoon (aqua, script)" },
  { id: "candy", name: "Candy (rose, rounded)" },
  { id: "ticket", name: "Ticket (cream, chunky)" },
  { id: "diner", name: "Diner (cream, handwritten)" },
  { id: "glowrose", name: "Glow Rose (dark, pink neon)" },
  { id: "glowgold", name: "Glow Gold (dark, gold neon)" },
  { id: "chalk", name: "Chalkboard (dark, aqua)" },
  { id: "nightsky", name: "Night Sky (dark, 3-D letters)" }
];
var GRAPHICS = [
  { id: "sunburst", name: "Sunburst" },
  { id: "dots", name: "Polka dots" },
  { id: "sparkles", name: "Sparkles" },
  { id: "stripes", name: "Stripes" },
  { id: "squiggle", name: "Squiggles" },
  { id: "waves", name: "Waves" },
  { id: "atomic", name: "Atomic starburst" },
  { id: "boomerang", name: "Boomerangs" },
  { id: "checker", name: "Checkerboard" },
  { id: "halftone", name: "Halftone dots" },
  { id: "zigzag", name: "Zigzag" }
];
// Icons carry meaning, so they never appear on Auto: an admin picks them on purpose.
var ICONS = [
  { id: "microphone", name: "Microphone" },
  { id: "notes", name: "Musical notes" },
  { id: "bingo", name: "Bingo ball" },
  { id: "dice", name: "Dice" },
  { id: "cards", name: "Playing cards" },
  { id: "disco", name: "Disco ball" },
  { id: "trophy", name: "Trophy" },
  { id: "dumbbell", name: "Barbell & dumbbell" },
  { id: "ticket", name: "Ticket stub" },
  { id: "popcorn", name: "Popcorn" },
  { id: "fries", name: "Fries" },
  { id: "cocktail", name: "Cocktail" },
  { id: "burger", name: "Burger" },
  { id: "washroom", name: "Washroom sign" },
  { id: "arrow", name: "Arrow sign" }
];
// Suggested icon: a word in the activity's name wins, otherwise its type decides.
var SUGGEST_WORDS = [
  [/strong|muscle|flex|arm wrestl|tug of war|gym|fitness|weight ?lift|barbell|dumbbell/i, "dumbbell"], [/bingo/i, "bingo"], [/karaoke|\bmic/i, "microphone"], [/tune|song|band|music|choir/i, "notes"],
  [/dance|disco|party/i, "disco"], [/fries|chips/i, "fries"], [/popcorn|movie|film|cinema/i, "popcorn"],
  [/snack|food|burger|slider|bbq|dinner|grill/i, "burger"], [/quiz|trivia|cards|poker|blackjack/i, "cards"],
  [/washroom|restroom|bathroom|toilet/i, "washroom"], [/cocktail|bar\b|drinks|mixer|happy hour/i, "cocktail"],
  [/draw|50\/50|raffle|ticket/i, "ticket"], [/final|champion|showdown|contest|tournament|win/i, "trophy"],
  [/this way|exit|info|directions|entrance/i, "arrow"], [/dice|board game|craps/i, "dice"]
];
var SUGGEST_TYPE = { game: "dice", music: "microphone", social: "cocktail", challenge: "trophy", draw: "ticket", tickets: "ticket" };
function suggestFor(title, type) {
  for (var i = 0; i < SUGGEST_WORDS.length; i++) if (SUGGEST_WORDS[i][0].test(title)) return SUGGEST_WORDS[i][1];
  return SUGGEST_TYPE[type] || "sparkles";
}
function iconName(id) { var f = ICONS.filter(function (x) { return x.id === id; })[0]; return f ? f.name : id; }
function isIcon(id) { return ICONS.some(function (x) { return x.id === id; }); }
function graphicOf(a) {
  if (!a.graphic || a.graphic === "suggest") return suggestFor(a.title, a.type);
  if (a.graphic === "auto") return autoGraphic[a.id] || "sunburst";
  return a.graphic;
}
var autoGraphic = {};
// Where activities happen. Admins edit the list (site settings); these are the starting four.
var DEFAULT_VENUES = [{ id: "lobby", name: "Grand Lobby" }, { id: "stage", name: "Main Stage" }, { id: "lounge", name: "Starlight Lounge" }, { id: "deck", name: "Lido Deck" }];
var VENUES = {};
function setVenues(list) { VENUES = {}; list.forEach(function (v) { VENUES[v.id] = v.name; }); }
setVenues(DEFAULT_VENUES);
// "draw" is the 50/50: a special type there can only ever be one of.
// "tickets" is Draws: a ticket draw with a searchable winning-ticket list. Any number allowed; only one 50/50.
var TYPES = { game: "Game", music: "Music", social: "Social", challenge: "Challenge", draw: "50/50", tickets: "Draws" };
var SPECIAL = { draw: "50/50", tickets: "Draws" };
function otherOfType(type, except) { return acts.filter(function (x) { return x.type === type && (!except || x.id !== except.id); })[0] || null; }
function otherDraw(except) { return otherOfType("draw", except); }
function ticketsActs() { return acts.filter(function (x) { return x.type === "tickets"; }).sort(function (x, y) { return x.start - y.start; }); }
// Tickets entered so far on a Draws list.
function drawnCount(a) { return (a.slots || []).filter(function (sl) { return cleanNo(sl.ticket); }).length; }
function slotLabel(sl, i) { return sl.label && sl.label.trim() ? sl.label : "#" + (i + 1); }
// Ticket numbers compare without spaces, dashes or leading zeros, so "1388" finds "001388".
function cleanNo(t) { return String(t || "").replace(/[^0-9a-z]/gi, "").toUpperCase().replace(/^0+(?=.)/, ""); }
function newSlots(n) { var out = []; for (var i = 0; i < n; i++) out.push({ label: "", ticket: "", claimed: false }); return out; }

var DEFAULT_SETTINGS = {
  mark: "LIVENITE",
  eyebrow: "Tonight's programme",
  brand: "LIVENITE",
  tagline: "",
  bulbs: true,
  venues: DEFAULT_VENUES,
  nav: [
    { id: "home", label: "Tonight", href: "#", show: true },
    { id: "programme", label: "Line-up", href: "#programme", show: true },
    { id: "draw", label: "50/50", href: "", show: true },
    { id: "tickets", label: "Each Draws", href: "", show: true, auto: true },
    { id: "venues", label: "Venues", href: "#programme", show: false }
  ]
};

// ---------- Live data ----------
var settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
var acts = [];
var loaded = false;
var pot = null, ticketPrice = "", potSetAt = null, potDrawTime = "";
var user = null, isAdmin = false;

function toActivity(snap) {
  var d = snap.data({ serverTimestamps: "estimate" });
  var a = {
    id: snap.id,
    title: d.title || "",
    tag: d.tag != null ? d.tag : d.blurb || "",
    type: TYPES[d.type] ? d.type : "game",
    venue: d.venue || "stage",
    start: toMillis(d.start),
    len: d.length || 30,
    schedLen: d.schedLength || null,
    schedStart: toMillis(d.schedStart) || null,
    host: d.host || "",
    style: d.style || "marquee",
    graphic: d.graphic || "suggest",
    hasManager: !!d.hasManager,
    manager: d.manager || "",
    winners: Array.isArray(d.winners) ? d.winners.slice() : [],
    slots: Array.isArray(d.slots) ? d.slots.map(function (s) { return { label: String(s.label || ""), ticket: String(s.ticket || ""), name: String(s.name || ""), claimed: !!s.claimed }; }) : [],
    resultsFinal: !!d.resultsFinal
  };
  return a;
}
// The full record an activity is saved as.
function toDoc(a) {
  var d = {
    title: a.title.slice(0, 60), tag: (a.tag || "").slice(0, 80), type: a.type, venue: a.venue,
    start: Timestamp.fromMillis(a.start), length: a.len, host: (a.host || "").slice(0, 60),
    style: a.style, graphic: a.graphic || "suggest", hasManager: !!a.hasManager, manager: (a.manager || "").slice(0, 60),
    winners: a.winners || [], slots: a.slots || [], resultsFinal: !!a.resultsFinal, updatedAt: serverTimestamp()
  };
  if (a.schedLen) d.schedLength = a.schedLen;
  return d;
}
// The original planned slot, remembered the first time times change on a game screen or the run sheet
// (LOGIC-RULES TIME-4). Returns the fields to add to that save; empty if it's already remembered.
function rememberSchedule(a) {
  if (a.schedStart || a.schedLen) return {};
  return { schedStart: Timestamp.fromMillis(startOf(a)), schedLength: a.len };
}
// The original slot if one is remembered, else null.
function scheduleOf(a) {
  if (!a.schedStart && !a.schedLen) return null;
  var s = a.schedStart || startOf(a);
  return { s: s, e: s + (a.schedLen || a.len) * MIN };
}
function errText(err) { return (err && (err.code || err.message)) || "error"; }
function note(text) { $("conn-note").textContent = text; $("conn-note").hidden = !text; }
function bad(id, text) { $(id).textContent = text; $(id).classList.add("bad"); shake($(id)); }
function ok(id, text) { $(id).textContent = text; $(id).classList.remove("bad"); }

function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
function startOf(a) { return a.start; }
function endOf(a) { return a.start + a.len * MIN; }
function clock(ms) { return new Date(ms).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }); }
function money(n) { return n == null ? "$—" : fmtMoney(n); }
function pad(n) { return (n < 10 ? "0" : "") + n; }
function words(ms) { var m = Math.max(0, Math.ceil(ms / MIN)); if (m >= 60) { var h = Math.floor(m / 60), r = m % 60; return h + " h" + (r ? " " + r + " min" : ""); } return m + " min"; }
function digits(ms) { var s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? h + ":" + pad(m) + ":" + pad(x) : m + ":" + pad(x); }
function badgeTime(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); return s >= 3600 ? Math.floor(s / 3600) + "h " + pad(Math.floor((s % 3600) / 60)) : Math.floor(s / 60) + ":" + pad(s % 60); }
function sorted() { return acts.slice().sort(function (a, b) { return a.start - b.start; }); }
function stateOf(a, now) { return now >= endOf(a) ? "done" : now >= startOf(a) ? "live" : "upcoming"; }
function nextUp(now) { return sorted().filter(function (a) { return startOf(a) > now; })[0] || null; }
function draw() { return acts.filter(function (a) { return a.type === "draw"; })[0]; }
function byId(id) { return acts.filter(function (x) { return x.id === id; })[0] || null; }

// ---------- Title section and nav (from admin settings) ----------
function renderChrome() {
  $("mark").textContent = settings.mark;
  $("eyebrow").textContent = settings.eyebrow;
  $("eyebrow").hidden = !settings.eyebrow;
  $("brand").textContent = settings.brand;
  var venues = {}; acts.forEach(function (a) { venues[a.venue] = 1; });
  var nv = Object.keys(venues).length;
  $("tagline").textContent = settings.tagline || (!loaded ? "" : acts.length ? acts.length + (acts.length === 1 ? " show. " : " shows. ") + nv + (nv === 1 ? " venue." : " venues.") + " One big night." : "Tonight's line-up is coming soon.");
  var w = eventWin(); $("event-when").hidden = !w; if (w) $("event-when").textContent = fullWhen(w);
  document.querySelectorAll(".marquee .bulbs").forEach(function (b) { b.hidden = !settings.bulbs; });
  var nav = $("nav"); nav.replaceChildren();
  settings.nav.forEach(function (item) {
    if (!item.show) return;
    var href = item.href;
    // The 50/50 link goes to whichever activity is the 50/50; no 50/50, no link.
    if (item.id === "draw") { var d = draw(); if (!d) return; href = "#a-" + d.id; }
    // Every Draws gets its own link, named after it. More than two fold into a "Draws" dropdown.
    if (item.id === "tickets") {
      var ts = ticketsActs(), menu = $("draws-menu");
      var links = ts.map(function (t) { var l = el("a", null, t.title); l.href = "#a-" + t.id; l.setAttribute("data-nav", "tickets-" + t.id); return l; });
      if (ts.length <= 2) { links.forEach(function (l) { nav.append(l); }); return; }
      var btn = el("button", "nav-drop"); btn.type = "button"; btn.id = "draws-btn";
      btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-controls", "draws-menu");
      btn.append(document.createTextNode("Draws "), el("span", "caret", "▾"));
      btn.addEventListener("click", function (e) { e.stopPropagation(); toggleDraws(menu.hidden || menu.classList.contains("panel-out")); });
      menu.replaceChildren.apply(menu, links);
      nav.append(btn);
      return;
    }
    var a = el("a", null, item.label); a.href = href; a.setAttribute("data-nav", item.id); nav.append(a);
  });
  if (!$("draws-btn")) { $("draws-menu").hidden = true; $("draws-menu").replaceChildren(); }
  highlight();
  fillBulbs();
}
// The menu sits outside the scrolling nav so it isn't clipped; line it up under the button.
function toggleDraws(open) {
  var btn = $("draws-btn"), menu = $("draws-menu");
  if (!btn) return;
  btn.setAttribute("aria-expanded", String(open));
  if (!open) { panelOut(menu); return; }
  panelIn(menu);
  var bar = document.querySelector(".topbar").getBoundingClientRect(), r = btn.getBoundingClientRect();
  var left = Math.max(16, Math.min(r.left, innerWidth - menu.offsetWidth - 16));
  menu.style.left = (left - bar.left) + "px"; menu.style.top = (r.bottom - bar.top + 6) + "px";
}
document.addEventListener("click", function (e) { if (!$("draws-menu").hidden && !$("draws-menu").contains(e.target) && !(e.target.closest && e.target.closest("#draws-btn"))) toggleDraws(false); });
document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("draws-menu").hidden) { toggleDraws(false); $("draws-btn").focus(); } });
$("draws-menu").addEventListener("click", function (e) { if (e.target.closest("a")) toggleDraws(false); });
addEventListener("resize", function () { toggleDraws(false); });
$("nav").addEventListener("scroll", function () { toggleDraws(false); });

// ---------- Cards ----------
function cardFor(a, now, opts) {
  opts = opts || {};
  var st = stateOf(a, now), nx = nextUp(now);
  if (st === "upcoming") st = nx && nx.id === a.id ? "next" : "later";
  var c = el(opts.static ? "div" : "a", "card s-" + a.style);
  var g = graphicOf(a);
  c.setAttribute("data-graphic", g);
  if (isIcon(g)) c.setAttribute("data-kind", "icon");
  else if (/^(atomic|boomerang|checker|halftone|zigzag)$/.test(g)) c.setAttribute("data-kind", "pattern");
  var art = el("span", "c-art"); art.setAttribute("aria-hidden", "true"); c.append(art);
  if (!opts.static) c.href = "#a-" + a.id;
  c.setAttribute("data-state", st);
  if (st === "live" && !opts.static) c.classList.add("feature");
  var top = el("div", "c-top");
  top.append(el("span", "c-time", clock(startOf(a))), el("span", "c-venue", VENUES[a.venue] || a.venue));
  var mid = el("div");
  var h = el(opts.heading || (opts.static ? "h1" : "h3"), "c-title", a.title);
  // Shrink the title so its longest word always fits the card (each face has a different letter width).
  var widths = { marquee: 0.74, sunset: 0.66, wave: 0.62, bloom: 0.88, neon: 0.84, studio: 0.66,
    ember: 0.74, sunflower: 0.66, lagoon: 0.66, candy: 0.62, ticket: 0.88, diner: 0.62, glowrose: 0.84, glowgold: 0.84, chalk: 0.62, nightsky: 0.8 };
  var longest = a.title.split(/\s+/).reduce(function (m, w) { return Math.max(m, w.length); }, 1);
  h.style.setProperty("--fit", (84 / (longest * (widths[a.style] || 0.75))).toFixed(2) + "cqi");
  if (a.type === "draw") {
    var amt = el("div", "pot-amt"); var num = el("span", null, money(pot)); num.setAttribute("data-pot", ""); amt.append(num);
    if (!opts.static) { var jump = el("span", "pot-jump"); jump.id = "pot-jump"; jump.hidden = true; amt.append(jump); }
    mid.append(h, amt, el("p", "c-tag c-drawtime", "Draw at " + clock(startOf(a)) + (ticketPrice ? " · Tickets " + ticketPrice : "")));
    if (a.tag) mid.append(el("p", "c-tag", a.tag));
  } else {
    mid.append(h, el("p", "c-tag", a.tag));
  }
  // Once a game is over, its winners take the spotlight on the card.
  if (stateOf(a, now) === "done" && (a.winners || []).length) {
    var wl = el("p", "c-winners"); wl.append(el("b", null, a.winners.length === 1 ? "Winner" : "Winners"), document.createTextNode(a.winners.join(" · ")));
    mid.append(wl);
  }
  var foot = el("div", "c-foot");
  var s = el("span", "c-state");
  // Draws come first so they never fall through to the plain LIVE label. While on, it's DRAWING NOW.
  if (a.type === "tickets" && st === "live") { s.append(el("span", "pill", "DRAWING NOW")); }
  else if (a.type === "tickets" && a.resultsFinal) { s.append(el("span", "pill-search", "SEARCH DRAW RESULTS")); }
  else if (st === "live") { s.append(el("span", "pill", a.type === "draw" ? "DRAWING NOW" : "LIVE")); if ((a.winners || []).length) s.append(el("span", null, " See winners")); }
  // After the draw, with some tickets in but not all marked drawn, guests can already search what's there.
  else if (a.type === "tickets") { s.textContent = st === "done" ? (drawnCount(a) ? "Results so far" : "Results soon") : "Draw at " + clock(startOf(a)); }
  else if (a.type === "draw" && st !== "done") { s.textContent = "Draw in " + digits(startOf(a) - now); s.setAttribute("data-until", startOf(a)); s.setAttribute("data-fmt", "draw"); }
  else if (st === "next") { s.textContent = "Starts in " + words(startOf(a) - now); s.setAttribute("data-until", startOf(a)); s.setAttribute("data-fmt", "words-starts"); }
  else if (st === "done") s.textContent = "Finished";
  else s.textContent = a.len + " min";
  foot.append(s, el("span", "c-type", TYPES[a.type]));
  c.append(top, mid, foot);
  return c;
}

// Each home card's last state, so a card glows once when it goes LIVE while the page is open (MOTION-RULES rule 12).
var cardWas = null, cardNow = {};
function homeCard(a, now) {
  var c = cardFor(a, now), st = stateOf(a, now); cardNow[a.id] = st;
  if (cardWas && cardWas[a.id] && cardWas[a.id] !== "live" && st === "live") c.classList.add("glow");
  return c;
}
function renderCards() {
  var now = Date.now(), box = $("cards"); box.replaceChildren();
  cardWas = loaded ? cardNow : null; cardNow = {};
  if (loaded && !acts.length) { box.append(el("p", "meta", "Tonight's line-up is coming soon. Check back shortly.")); return; }
  var list = sorted();
  // Live and next first, then the 50/50 pot, then the rest of the night in order.
  var live = list.filter(function (a) { return stateOf(a, now) === "live"; });
  var upcoming = list.filter(function (a) { return stateOf(a, now) === "upcoming"; });
  var done = list.filter(function (a) { return stateOf(a, now) === "done"; });
  // Cycle graphics in the order cards appear.
  live.concat(upcoming, done).forEach(function (a, i) { autoGraphic[a.id] = GRAPHICS[i % GRAPHICS.length].id; });
  // The 50/50 is pulled up to sit right after what's live and next, so the pot is always near the top.
  var d = draw();
  var isD = function (a) { return d && a === d && stateOf(a, now) === "upcoming"; };
  var rest = upcoming.filter(function (a) { return !isD(a); });
  live.forEach(function (a) { box.append(homeCard(a, now)); });
  rest.slice(0, 1).forEach(function (a) { box.append(homeCard(a, now)); });
  if (d && isD(d)) box.append(homeCard(d, now));
  rest.slice(1).forEach(function (a) { box.append(homeCard(a, now)); });
  done.forEach(function (a) { box.append(homeCard(a, now)); });
}

// ---------- Activity page ----------
function renderDetail(a) {
  var now = Date.now();
  $("d-card").replaceChildren(cardFor(a, now, { static: true }));
  $("d-where").textContent = VENUES[a.venue] || a.venue;
  $("d-when").textContent = clock(startOf(a)) + " – " + clock(endOf(a));
  $("d-host").textContent = a.host;
  $("d-gm-box").hidden = !a.hasManager;
  $("d-gm").textContent = a.manager || "";
  var wins = a.winners || [];
  var isT = a.type === "tickets";
  $("d-draws-panel").hidden = !isT;
  if (isT) renderTickets(a, $("d-search").value);
  $("d-win-panel").hidden = isT || !(a.hasManager || wins.length);
  $("d-winners").replaceChildren.apply($("d-winners"), wins.map(function (w) { return el("li", null, w); }));
  $("d-no-win").hidden = wins.length > 0;
  var st = stateOf(a, now), c = $("d-count");
  if (st === "live") { $("d-count-k").textContent = "Ends in"; c.setAttribute("data-until", endOf(a)); c.setAttribute("data-fmt", "digits"); c.textContent = digits(endOf(a) - now); }
  else if (st === "upcoming") { $("d-count-k").textContent = "Starts in"; c.setAttribute("data-until", startOf(a)); c.setAttribute("data-fmt", "digits"); c.textContent = digits(startOf(a) - now); }
  else { $("d-count-k").textContent = "Status"; c.removeAttribute("data-until"); c.textContent = "Finished"; }
  // Draws have no countdown: just say when it is.
  if (isT) { $("d-count-k").textContent = "Status"; c.removeAttribute("data-until"); c.textContent = st === "live" ? "Drawing now" : a.resultsFinal ? "Results posted" : st === "done" ? (drawnCount(a) ? "Results so far" : "Results soon") : "Draw at " + clock(startOf(a)); }
}

// Numbered winning-ticket list with a search that finds your ticket.
function renderTickets(a, query) {
  var q = cleanNo(query), list = $("d-tix"), hit = null;
  var slots = a.slots || [];
  var drawn = slots.filter(function (sl) { return cleanNo(sl.ticket); }).length;
  $("d-draws-state").textContent = a.resultsFinal ? "All tickets drawn. " + drawn + " winning tickets." : !drawn ? "No tickets drawn yet." : stateOf(a, Date.now()) === "done" ? "Results so far: " + drawn + " of " + slots.length + " drawn. More may be added." : "Drawing in progress: " + drawn + " of " + slots.length + " drawn so far.";
  list.replaceChildren();
  slots.forEach(function (sl, i) {
    var t = cleanNo(sl.ticket);
    var li = el("li", sl.claimed ? "claimed" : "");
    var who = el("span", "who"); who.append(el("span", "lbl2", slotLabel(sl, i)));
    if (sl.name) who.append(el("span", "wname", sl.name));
    li.append(who, t ? el("span", "num", sl.ticket) : el("span", "pending", "not drawn yet"));
    if (q && t && t === q) { li.classList.add("hit"); hit = { sl: sl, i: i }; }
    list.append(li);
  });
  var msg = $("d-search-msg");
  msg.classList.toggle("win", !!hit);
  if (!q) msg.textContent = "";
  else if (hit) msg.textContent = "Ticket " + hit.sl.ticket + " is a winner! " + slotLabel(hit.sl, hit.i) + (hit.sl.name ? ", won by " + hit.sl.name.replace(/\.+$/, "") : "") + (hit.sl.claimed ? ". This prize has been claimed." : ". Collect it at the prize desk.");
  else msg.textContent = "Ticket " + query.trim() + " isn't on the list" + (a.resultsFinal ? "." : " yet. More tickets are still being drawn.");
}
$("d-search").addEventListener("input", function () { var h = (location.hash || "").slice(1); var a = h.indexOf("a-") === 0 ? byId(h.slice(2)) : null; if (a) renderTickets(a, $("d-search").value); });
$("d-search-form").addEventListener("submit", function (e) { e.preventDefault(); });

// ---------- Edit areas (DATA-RULES.md) ----------
// Each edit area keeps its changes as a draft on screen until Save (rule 4), then saves only the
// fields it owns (rule 5) and always says how the save went (rule 3).
var areas = [];
// ---- Apply, then Save all (DATA-RULES rule 4, "Screens with one shared Save") ----
// Each box's changes are a draft. Apply checks them (refusing values that can never be valid, on the spot) and
// stages them; the page's save bar at the bottom saves everything applied in one go, and its Cancel drops it all.
// A box's draft that has changed since it was applied is "pending" again until Apply is pressed.
function editArea(o) {
  areas.push(o);
  if (o.saveId) $(o.saveId).addEventListener("click", function (e) { e.preventDefault(); applyArea(o); });
  $(o.cancelId).addEventListener("click", function () { undoArea(o); });
  return o;
}
function areaValue(o) { return JSON.stringify(o.draft ? o.draft() : null); }
function pendingOf(o) { return o.pending ? o.pending() : o.dirty() && areaValue(o) !== o.appliedValue; }
function appliedOf(o) { return o.applied ? o.applied() : o.dirty() && areaValue(o) === o.appliedValue ? 1 : 0; }
function applyArea(o) {
  if (!pendingOf(o)) return;
  var problem = o.check ? o.check() : "";
  if (problem) { o.badValue = areaValue(o); setStatus(o.statusId, "Can't apply: " + problem, true); return; }
  o.appliedValue = areaValue(o); o.badValue = null; $(o.statusId).classList.remove("bad");
  markArea(o);
  if (o.boxId) glow($(o.boxId).querySelector(".status"));
}
function undoArea(o) {
  o.discard(); o.appliedValue = null; o.badValue = null;
  if (o.redraw) o.redraw();
  $(o.statusId).classList.remove("bad"); ok(o.statusId, ""); markArea(o);
}
function markArea(o) {
  if (o.mark) { o.mark(); markPageBars(); return; }
  var d = o.dirty(), pend = d && pendingOf(o);
  if (o.boxId) $(o.boxId).classList.toggle("dirty", d);
  if (o.saveId) $(o.saveId).disabled = !pend || !!o.saving;
  $(o.cancelId).disabled = !d || !!o.saving;
  var st = $(o.statusId);
  // A refusal stays until the values it refused are changed.
  if (st.classList.contains("bad") && o.badValue != null && areaValue(o) !== o.badValue) { st.classList.remove("bad"); o.badValue = null; }
  if (!st.classList.contains("bad") && !o.saving) {
    if (pend) { st.textContent = "Press Apply to use these changes."; st.classList.add("unsaved"); }
    else if (d) { st.textContent = "Applied. Press Save all at the bottom to save."; st.classList.add("unsaved"); }
    else if (st.classList.contains("unsaved")) { st.textContent = ""; st.classList.remove("unsaved"); }
  }
  markPageBars();
}
function setStatus(id, text, isBad) { var st = $(id); st.classList.remove("unsaved"); if (isBad) bad(id, text); else ok(id, text); }
// Saves one applied box (used by pages whose boxes save one after another).
function saveAreaNow(o) {
  o.saving = true; markArea(o); setStatus(o.statusId, "Saving…");
  return Promise.resolve().then(o.save).then(function () {
    o.saving = false; o.discard(); o.appliedValue = null; if (o.redraw) o.redraw(); markArea(o);
    setStatus(o.statusId, o.savedText || "Saved. Every screen shows it now.");
  }, function (err) {
    o.saving = false; markArea(o);
    setStatus(o.statusId, "Could not save (" + errText(err) + "). Your changes are still here; try again.", true);
    throw err;
  });
}
// The save bar at the bottom of a page. Its parts are made once and only updated, so a press is never lost to a redraw.
var PAGES = [];
function pageBar(page) {
  var bar = $(page.bar);
  if (!page.parts) {
    var st = el("span", "unsaved"), save = el("button", "btn", "Save all"), cancel = el("button", "btn ghost", "Cancel");
    save.type = cancel.type = "button";
    save.addEventListener("click", function () { runPageSave(page); });
    cancel.addEventListener("click", function () {
      page.areas().forEach(function (o) { if (o.dirty() || pendingOf(o)) undoArea(o); });
      page.status = null; page.statusBad = false; markPageBars();
    });
    bar.append(st, save, cancel); page.parts = { st: st, save: save, cancel: cancel };
  }
  return page.parts;
}
function markPageBars() {
  PAGES.forEach(function (page) {
    if (!page.shown()) return;
    var parts = pageBar(page), list = page.areas();
    var pend = list.filter(pendingOf), n = list.reduce(function (t, o) { return t + appliedOf(o); }, 0);
    var problem = !pend.length && n && page.check ? page.check() : "";
    var wasBlocked = parts.st.className === "bar-block";
    if (page.saving) { parts.st.className = "unsaved"; parts.st.textContent = page.status || "Saving…"; }
    else if (pend.length) { parts.st.className = "bar-block"; parts.st.textContent = "Apply or undo the changes in " + pend.map(function (o) { return o.name; }).join(", ") + " first."; }
    else if (problem) { parts.st.className = "bar-block"; parts.st.textContent = "⏰ Can't save: " + problem; }
    else if (page.status && page.statusBad) { parts.st.className = "bar-block"; parts.st.textContent = page.status; }
    else if (n) { page.status = null; parts.st.className = "unsaved"; parts.st.textContent = n + " unsaved change" + (n > 1 ? "s" : ""); }
    else { parts.st.className = "unsaved"; parts.st.textContent = page.status || "No unsaved changes"; }
    if (parts.st.className === "bar-block" && !wasBlocked && !page.saving) shake(parts.st);
    parts.save.disabled = !!page.saving || !n || !!pend.length || !!problem;
    parts.cancel.disabled = !!page.saving || !(n || pend.length);
    $(page.bar).toggleAttribute("data-clean", !(n || pend.length));
  });
}
function runPageSave(page) {
  if (page.saving) return;
  page.saving = true; page.status = "Saving…"; markPageBars();
  // A save with no signal waits for the connection; say so rather than look stuck (or falsely saved).
  var slow = setTimeout(function () { if (page.saving) { page.status = "Still saving… check your signal. Your changes are kept and save when you're back online."; markPageBars(); } }, 8000);
  Promise.resolve().then(page.save).then(function (msg) {
    clearTimeout(slow); page.saving = false; page.status = msg || "Saved. Every screen shows it now."; page.statusBad = false; markPageBars();
  }, function (err) {
    clearTimeout(slow); page.saving = false; page.status = "Could not save (" + errText(err) + "). Your changes are still here; try again."; page.statusBad = true;
    markPageBars(); shake(pageBar(page).st);
  });
}
// Areas on the screen being shown that have unsaved changes.
function dirtyAreas() { return areas.filter(function (o) { return o.shown() && o.dirty(); }); }
function discardAll() { areas.forEach(function (o) { if (o.shown() && o.dirty()) { o.discard(); if (o.redraw) o.redraw(); markArea(o); if ($(o.statusId)) ok(o.statusId, ""); } }); }

// Rule 4: leaving with unsaved changes asks first.
var leaveAction = null, leaveAreas = null;
function askLeave(action, only) { leaveAction = action; leaveAreas = only || null; panelIn($("leave-bar")); $("leave-stay").focus(); }
$("leave-stay").addEventListener("click", function () { panelOut($("leave-bar")); leaveAction = null; });
$("leave-go").addEventListener("click", function () {
  $("leave-bar").hidden = true;
  var a = leaveAction, only = leaveAreas; leaveAction = null; leaveAreas = null;
  if (only) only.forEach(function (o) { o.discard(); markArea(o); }); else discardAll();
  if (a) a();
});
addEventListener("beforeunload", function (e) { if (dirtyAreas().length) { e.preventDefault(); e.returnValue = ""; } });
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// ---------- Admin: title section, menu and venues ----------
var settingsExists = false;
// Saves just these settings fields (rule 5). If the record doesn't exist yet, it's created with the
// defaults in the same step, so two admins saving at once on a fresh site can't overwrite each other.
function saveSettings(fields) {
  var ref = doc(db, "site", "settings");
  var f = Object.assign({}, fields, { updatedAt: serverTimestamp() });
  if (settingsExists) return updateDoc(ref, f);
  return runTransaction(db, function (t) {
    return t.get(ref).then(function (snap) {
      if (snap.exists()) { t.update(ref, f); return; }
      var d = DEFAULT_SETTINGS;
      t.set(ref, Object.assign({ mark: d.mark, eyebrow: d.eyebrow, brand: d.brand, tagline: d.tagline, bulbs: d.bulbs, nav: cleanNav(d.nav), venues: cleanVenues(d.venues) }, f));
    });
  });
}
function cleanNav(list) { return list.map(function (n) { var o = { id: n.id, label: String(n.label).slice(0, 20), href: n.href || "", show: !!n.show }; if (n.auto) o.auto = true; return o; }); }
function cleanVenues(list) { return list.map(function (v) { return { id: v.id, name: String(v.name).trim().slice(0, 30) }; }); }
function adminShown() { return !$("view-admin").hidden && !$("admin-app").hidden; }

// Title section
var titleDraft = null;
var TITLE_FIELDS = [["a-eyebrow", "eyebrow"], ["a-brand", "brand"], ["a-tagline", "tagline"]];
function titleNow() { return titleDraft || { eyebrow: settings.eyebrow, brand: settings.brand, tagline: settings.tagline, bulbs: settings.bulbs }; }
var titleArea = editArea({
  name: "Title section", draft: function () { return titleDraft; },
  fields: function () { var t = titleDraft; return { eyebrow: t.eyebrow.slice(0, 40), brand: t.brand.slice(0, 24), tagline: t.tagline.slice(0, 80), bulbs: !!t.bulbs }; },
  boxId: "t-box", saveId: "t-save", cancelId: "t-cancel", statusId: "t-status", shown: adminShown,
  dirty: function () { return !!titleDraft && !same(titleDraft, { eyebrow: settings.eyebrow, brand: settings.brand, tagline: settings.tagline, bulbs: settings.bulbs }); },
  discard: function () { titleDraft = null; },
  redraw: function () { fillTitleInputs(true); },
  save: function () { var t = titleDraft; return saveSettings({ eyebrow: t.eyebrow.slice(0, 40), brand: t.brand.slice(0, 24), tagline: t.tagline.slice(0, 80), bulbs: !!t.bulbs }); }
});
function fillTitleInputs(force) {
  var t = titleNow();
  TITLE_FIELDS.forEach(function (p) { if (force || !titleDraft) $(p[0]).value = t[p[1]]; });
  $("a-bulbs").checked = t.bulbs;
  markArea(titleArea);
}
TITLE_FIELDS.forEach(function (p) {
  $(p[0]).addEventListener("input", function () { titleDraft = JSON.parse(JSON.stringify(titleNow())); titleDraft[p[1]] = $(p[0]).value; markArea(titleArea); });
});
$("a-bulbs").addEventListener("change", function () { titleDraft = JSON.parse(JSON.stringify(titleNow())); titleDraft.bulbs = $("a-bulbs").checked; markArea(titleArea); });

// Navigation bar: logo text and menu items. Rows find their item by id in the draft (rule 1).
var navDraft = null;
function navNow() { return navDraft || { mark: settings.mark, nav: JSON.parse(JSON.stringify(settings.nav)) }; }
function editNav() { if (!navDraft) navDraft = navNow(); return navDraft; }
var navArea = editArea({
  name: "Navigation bar", draft: function () { return navDraft; },
  fields: function () { return { mark: navDraft.mark.slice(0, 24), nav: cleanNav(navDraft.nav) }; },
  boxId: "n-box", saveId: "n-save", cancelId: "n-cancel", statusId: "n-status", shown: adminShown,
  dirty: function () { return !!navDraft && !same(navDraft, { mark: settings.mark, nav: settings.nav }); },
  discard: function () { navDraft = null; },
  redraw: function () { renderNavRows(true); },
  save: function () { return saveSettings({ mark: navDraft.mark.slice(0, 24), nav: cleanNav(navDraft.nav) }); }
});
function renderNavRows(force) {
  var list = $("a-nav"), n = navNow();
  if (force || !navDraft) $("a-mark").value = n.mark;
  markArea(navArea);
  if (!force && navDraft) return; // a draft on screen stays exactly as the admin left it (rule 2)
  list.replaceChildren();
  n.nav.forEach(function (item, i) {
    var li = el("li", "nav-row");
    var cur = function () { return editNav().nav.filter(function (x) { return x.id === item.id; })[0]; };
    var show = el("input"); show.type = "checkbox"; show.checked = item.show; show.setAttribute("aria-label", "Show " + item.label);
    show.style.cssText = "width:22px;height:22px;accent-color:var(--bulb);margin:0 6px";
    show.addEventListener("change", function () { cur().show = show.checked; markArea(navArea); });
    var name = el("input"); name.type = "text"; name.value = item.label; name.maxLength = 20; name.setAttribute("aria-label", "Menu label");
    name.addEventListener("input", function () { cur().label = name.value || "Untitled"; markArea(navArea); });
    if (item.auto) { name.value = "Draws (one link each, uses its name)"; name.disabled = true; }
    var move = function (by) {
      var d = editNav(), me = cur(), at = d.nav.indexOf(me), to = at + by;
      if (at < 0 || to < 0 || to >= d.nav.length) return;
      d.nav[at] = d.nav[to]; d.nav[to] = me;
      renderNavRows(true); markArea(navArea);
      glow($("a-nav").children[to]); // the moved menu item glows in its new place (MOTION-RULES rule 4)
    };
    var up = el("button", "icon-btn", "↑"); up.type = "button"; up.setAttribute("aria-label", "Move up"); up.disabled = i === 0;
    up.addEventListener("click", function () { move(-1); });
    var down = el("button", "icon-btn", "↓"); down.type = "button"; down.setAttribute("aria-label", "Move down"); down.disabled = i === n.nav.length - 1;
    down.addEventListener("click", function () { move(1); });
    li.append(show, name, up, down); list.append(li);
  });
}
$("a-mark").addEventListener("input", function () { editNav().mark = $("a-mark").value; markArea(navArea); });

// Venues: rename, add, remove. A venue in use can't be removed until its activities move (rule 6).
var venueDraft = null;
function venuesNow() { return venueDraft || JSON.parse(JSON.stringify(settings.venues)); }
function editVenues() { if (!venueDraft) venueDraft = venuesNow(); return venueDraft; }
var venueArea = editArea({
  name: "Venues", draft: function () { return venueDraft; },
  fields: function () { return { venues: cleanVenues(venueDraft) }; },
  boxId: "v-box", saveId: "v-save", cancelId: "v-cancel", statusId: "v-status", shown: adminShown,
  dirty: function () { return !!venueDraft && !same(venueDraft, settings.venues); },
  discard: function () { venueDraft = null; },
  redraw: function () { renderVenueRows(true); },
  check: function () {
    if (venueDraft.some(function (v) { return !v.name.trim(); })) return "Give every venue a name before saving.";
    // Someone may have moved an activity to a venue this draft removes.
    var gone = settings.venues.filter(function (v) { return !venueDraft.some(function (x) { return x.id === v.id; }); });
    var inUse = gone.filter(function (v) { return effActs().some(function (a) { return a.venue === v.id; }); });
    return inUse.length ? inUse[0].name + " has activities, so it can't be removed. Undo, or move them first." : "";
  },
  save: function () { return saveSettings({ venues: cleanVenues(venueDraft) }); }
});
function renderVenueRows(force) {
  var list = $("a-venues");
  markArea(venueArea);
  if (!force && venueDraft) return;
  list.replaceChildren();
  venuesNow().forEach(function (v) {
    var used = acts.filter(function (a) { return a.venue === v.id; }).length;
    var isNewVenue = !settings.venues.some(function (x) { return x.id === v.id; });
    var li = el("li", "nav-row venue-row" + (isNewVenue ? " adding" : ""));
    var name = el("input"); name.type = "text"; name.value = v.name; name.maxLength = 30; name.placeholder = "Venue name"; name.setAttribute("aria-label", "Venue name");
    name.addEventListener("input", function () { var now = editVenues().filter(function (x) { return x.id === v.id; })[0]; if (now) now.name = name.value; markArea(venueArea); });
    var info = el("span", "meta", isNewVenue ? "New" : used ? used + (used === 1 ? " activity" : " activities") : "Not used");
    info.style.cssText = "font-size:13px;white-space:nowrap";
    var rm = el("button", "icon-btn", "×"); rm.type = "button"; rm.setAttribute("aria-label", "Remove " + (v.name || "venue"));
    rm.disabled = used > 0 || venuesNow().length === 1;
    rm.title = used ? "Move its activities to another venue first" : "";
    rm.addEventListener("click", function () { venueDraft = editVenues().filter(function (x) { return x.id !== v.id; }); renderVenueRows(true); markArea(venueArea); });
    li.append(name, info, rm); list.append(li);
  });
}
$("a-add-venue").addEventListener("click", function () {
  var d = editVenues();
  if (d.length >= 20) { setStatus("v-status", "That's 20 venues, the most the list holds.", true); return; }
  d.push({ id: "v" + Date.now().toString(36), name: "" });
  renderVenueRows(true); markArea(venueArea);
  var inputs = $("a-venues").querySelectorAll("input"); inputs[inputs.length - 1].focus();
  glow($("a-venues").lastElementChild); // the new venue row glows (MOTION-RULES rule 4)
});
// The draw guide's steps slide in when it's unfolded (MOTION-RULES rule 7).
document.querySelector("#gm-guide details").addEventListener("toggle", function (e) { if (e.target.open && canMove()) replayClass($("gm-guide-steps"), "panel-in"); });
PAGES.push({
  bar: "admin-savebar", shown: adminShown,
  areas: function () { return [titleArea, navArea, venueArea, editorArea, actStageArea]; },
  check: function () {
    if (effActs().filter(function (a) { return a.type === "draw"; }).length > 1) return "there can only be one 50/50. Undo one of them.";
    return venueArea.dirty() ? venueArea.check() : "";
  },
  // Settings and activity changes go in one batch, so related changes (say, a new venue and the activities moved
  // into it) can't land without each other.
  save: function () {
    var batch = writeBatch(db), sf = {}, n = 0, claims = false;
    [titleArea, navArea, venueArea].forEach(function (o) { if (o.dirty()) { Object.assign(sf, o.fields()); n++; } });
    if (n) {
      var sref = doc(db, "site", "settings"); sf.updatedAt = serverTimestamp();
      if (settingsExists) batch.update(sref, sf);
      else { var d = DEFAULT_SETTINGS; batch.set(sref, Object.assign({ mark: d.mark, eyebrow: d.eyebrow, brand: d.brand, tagline: d.tagline, bulbs: d.bulbs, nav: cleanNav(d.nav), venues: cleanVenues(d.venues) }, sf)); }
    }
    Object.keys(actStage).forEach(function (k) {
      var st = actStage[k]; n++;
      if (st.kind === "new") {
        var r = doc(collection(db, "activities")); batch.set(r, st.doc);
        if (st.becomesDraw) { claims = true; batch.set(doc(db, "site", "fiftyFifty"), { activityId: r.id, updatedAt: serverTimestamp() }); }
      } else if (st.kind === "edit") {
        batch.update(doc(db, "activities", st.id), Object.assign({}, st.fields, { updatedAt: serverTimestamp() }));
        if (st.becomesDraw) { claims = true; batch.set(doc(db, "site", "fiftyFifty"), { activityId: st.id, updatedAt: serverTimestamp() }); }
      } else batch.delete(doc(db, "activities", st.id));
    });
    return batch.commit().then(function () {
      [titleArea, navArea, venueArea].forEach(function (o) { if (o.dirty()) { o.discard(); o.appliedValue = null; o.redraw(); ok(o.statusId, "Saved. Every screen shows it now."); markArea(o); } });
      actStage = {}; renderActList(); ok("m-done", "");
      return "Saved " + n + " change" + (n > 1 ? "s" : "") + ". Every screen shows it now.";
    }, function (err) {
      if (claims && errText(err) === "permission-denied") throw new Error("another activity was just made the 50/50, and there can only be one. Undo yours");
      throw err;
    });
  }
});
// Game screens: each box saves in turn (they're separate records, with nothing checked between them).
PAGES.push({
  bar: "gm-savebar", shown: function () { return !$("view-gm").hidden && !!gmGame(); },
  areas: function () { return [timeArea, winArea, potArea, slotsArea].filter(function (o) { return o.shown(); }); },
  save: function () {
    var list = [timeArea, winArea, potArea, slotsArea].filter(function (o) { return o.shown() && appliedOf(o); }), n = list.length;
    return list.reduce(function (pr, o) { return pr.then(function () { return saveAreaNow(o); }); }, Promise.resolve())
      .then(function () { return "Saved " + n + " change" + (n > 1 ? "s" : "") + ". Every screen shows it now."; });
  }
});
// ---- Admin panels fold ----
// Each Admin panel folds on its heading. Activities starts open and the rest start folded; each browser remembers
// what was left open. A folded panel with changes says so on its heading (the save bar also names it).
var FOLD_KEY = "livenite-folds";
function foldState() { try { return JSON.parse(localStorage.getItem(FOLD_KEY) || "{}"); } catch (e) { return {}; } }
function setupFolds() {
  var saved = foldState();
  ["t-box", "n-box", "demo-box", "v-box", "acts-box"].forEach(function (id) {
    var box = $(id); if (!box || box.classList.contains("foldable")) return;
    var h = box.querySelector("h3"), head = h.closest(".section-head") || h;
    box.classList.add("foldable"); head.classList.add("fold-head");
    h.setAttribute("role", "button"); h.tabIndex = 0;
    var open = saved[id] != null ? saved[id] : id === "acts-box";
    var set = function (o, animate) {
      box.classList.toggle("folded", !o); h.setAttribute("aria-expanded", String(o));
      if (o && animate && canMove()) [].forEach.call(box.children, function (c) { if (c !== head) replayClass(c, "panel-in"); });
    };
    var toggle = function () { var o = box.classList.contains("folded"); set(o, true); var st = foldState(); st[id] = o; try { localStorage.setItem(FOLD_KEY, JSON.stringify(st)); } catch (e) {} };
    h.addEventListener("click", toggle);
    h.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
    set(open, false);
  });
}
setupFolds();
function renderAdmin() { fillTitleInputs(); renderNavRows(); renderVenueRows(); renderActList(); }

// ---------- Admin: activities editor ----------
var editing = null, isNew = false, delArmed = false;
function opt(sel, value, label) { var o = el("option", null, label); o.value = value; sel.append(o); }
Object.keys(TYPES).forEach(function (k) { opt($("m-type"), k, TYPES[k]); });
// The Where list follows the venues admins have set up; an activity at a removed venue keeps it listed.
function fillVenueOptions(keep) {
  var sel = $("m-venue"), value = keep || sel.value;
  sel.replaceChildren();
  settings.venues.forEach(function (v) { opt(sel, v.id, v.name || "Untitled venue"); });
  if (value && !VENUES[value]) opt(sel, value, value + " (removed)");
  sel.value = value && sel.querySelector('option[value="' + CSS.escape(value) + '"]') ? value : settings.venues[0] ? settings.venues[0].id : "";
}
STYLES.forEach(function (st) { opt($("m-look"), st.id, st.name); });
function graphicLabel(a) {
  if (!a.graphic || a.graphic === "suggest") return "Suggested: " + iconName(suggestFor(a.title, a.type));
  if (a.graphic === "auto") return "Auto pattern: " + (GRAPHICS.filter(function (g) { return g.id === graphicOf(a); })[0] || { name: "Sunburst" }).name;
  var f = GRAPHICS.concat(ICONS).filter(function (g) { return g.id === a.graphic; })[0];
  return f ? f.name : a.graphic;
}
// The graphic list's first option names tonight's suggestion, so it changes as the name or type changes.
function fillGraphics(value) {
  var sel = $("m-graphic"); sel.replaceChildren();
  opt(sel, "suggest", "Suggested: " + iconName(suggestFor($("m-title").value, $("m-type").value)));
  opt(sel, "auto", "Auto pattern (cycles)");
  [["Patterns", GRAPHICS], ["Icons", ICONS]].forEach(function (grp) {
    var og = document.createElement("optgroup"); og.label = grp[0];
    grp[1].forEach(function (g) { var o = el("option", null, g.name); o.value = g.id; og.append(o); });
    sel.append(og);
  });
  sel.value = value || "suggest";
}
// datetime-local wants local "YYYY-MM-DDTHH:MM".
function toLocalInput(ms) { var d = new Date(ms); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
function hhmm(ms) { var d = new Date(ms); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
function formActivity() {
  var start = new Date($("m-start").value).getTime();
  return {
    id: editing ? editing.id : "draft", start: isFinite(start) ? start : Date.now(), len: parseInt($("m-len").value, 10) || 30,
    schedLen: editing ? editing.schedLen : null,
    title: $("m-title").value.trim() || "New activity", tag: $("m-tag").value.trim(), type: $("m-type").value,
    venue: $("m-venue").value, host: $("m-host").value.trim(), style: $("m-look").value, graphic: $("m-graphic").value,
    hasManager: $("m-hasgm").checked, manager: $("m-gm").value.trim(), winners: editing ? editing.winners || [] : [],
    slots: editing && editing.slots && editing.slots.length ? editing.slots : $("m-type").value === "tickets" ? newSlots(10) : [],
    resultsFinal: editing ? !!editing.resultsFinal : false
  };
}
function renderPreview() { $("m-preview").replaceChildren(cardFor(formActivity(), Date.now(), { static: true, heading: "h3" })); }
function renderActList() {
  var list = $("m-list"); list.replaceChildren();
  var now = Date.now();
  var rows = sorted().map(function (a) { return { a: a, key: a.id, st: actStage[a.id] }; });
  Object.keys(actStage).forEach(function (k) { if (actStage[k].kind === "new") rows.push({ a: null, key: k, st: actStage[k] }); });
  rows.forEach(function (r) {
    var st = r.st, a = st && st.act ? Object.assign({}, r.a || {}, st.act, { id: r.a ? r.a.id : r.key }) : r.a;
    var li = el("li", "act-row" + ((editing && r.a && editing.id === r.a.id) || (editingKey && editingKey === r.key) ? " editing" : "") + (st ? " staged" : "") + (st && st.kind === "delete" ? " deleting" : ""));
    var mini = el("div", "mini"); mini.append(cardFor(a, now, { static: true, heading: "h3" }));
    var n = el("div", "n");
    n.append(el("b", null, a.title), el("span", null, clock(startOf(a)) + " · " + (VENUES[a.venue] || a.venue) + " · " + a.len + " min"),
      el("span", null, (STYLES.filter(function (x) { return x.id === a.style; })[0] || { name: a.style }).name + " · " + graphicLabel(a)));
    if (a.hasManager) {
      var chipLine = el("span"); chipLine.style.marginTop = "6px";
      chipLine.append(el("span", "gm-chip", "Game manager: " + a.manager));
      if ((a.winners || []).length) chipLine.append(document.createTextNode("  " + a.winners.length + (a.winners.length === 1 ? " winner" : " winners")));
      n.append(chipLine);
    }
    if (st) n.append(el("span", "unsaved staged-note", st.kind === "new" ? "New, unsaved" : st.kind === "delete" ? "Will be deleted when you press Save all" : "Unsaved change"));
    var btns = el("div"); btns.style.cssText = "display:flex;flex-direction:column;gap:8px";
    if (!st || st.kind !== "delete") {
      var b = el("button", "btn ghost", "Edit"); b.type = "button";
      b.addEventListener("click", function () { openEditorSafely(r.a, r.a ? null : r.key); });
      btns.append(b);
    }
    if (st) {
      var u = el("button", "btn ghost", "Undo"); u.type = "button";
      u.addEventListener("click", function () { delete actStage[r.key]; if ((editing && r.a && editing.id === r.a.id) || editingKey === r.key) closeEditor(); renderActList(); markPageBars(); });
      btns.append(u);
    }
    if (r.a && !st && (r.a.hasManager || SPECIAL[r.a.type])) { var g = el("a", "btn", SPECIAL[r.a.type] ? SPECIAL[r.a.type] + " screen" : "Game screen"); g.href = "#gm-" + r.a.id; btns.append(g); }
    li.append(mini, n, btns); list.append(li);
  });
  if (!rows.length) list.append(el("li", "meta", "No activities yet. Add one, or load the sample night to try things out."));
  $("acts-box").classList.toggle("dirty", Object.keys(actStage).length > 0 || (!!editorShown && editorArea.dirty()));
  $("m-clear").hidden = !acts.length;
}
// The editor's current values, compared with what it opened with to tell whether anything changed.
var editorBase = null;
function editorValues() {
  return {
    title: $("m-title").value.trim(), tag: $("m-tag").value.trim(), type: $("m-type").value, venue: $("m-venue").value,
    start: new Date($("m-start").value).getTime(), len: parseInt($("m-len").value, 10), host: $("m-host").value.trim(),
    style: $("m-look").value, graphic: $("m-graphic").value, hasManager: $("m-hasgm").checked, manager: $("m-gm").value.trim()
  };
}
// The values the editor opened with: the applied ones if this activity already has applied changes.
var editorShown = null;
var editorArea = {
  name: "Activity editor", statusId: "m-status", shown: function () { return adminShown() && !$("m-editor").hidden && !!editorShown; },
  dirty: function () { return !!editorShown && !same(editorValues(), editorShown); },
  pending: function () { return editorArea.shown() && editorArea.dirty(); },
  applied: function () { return 0; },
  discard: function () { closeEditor(); },
  // The editor keeps its own Apply and Cancel; it just shows whether there are changes to apply.
  mark: function () {
    var st = $("m-status"), d = editorArea.dirty();
    $("m-editor").classList.toggle("dirty", d);
    if (d && !st.classList.contains("bad")) { st.textContent = "Press Apply to use these changes."; st.classList.add("unsaved"); }
    if (!d && st.classList.contains("unsaved")) { st.textContent = ""; st.classList.remove("unsaved"); }
  }
};
areas.push(editorArea);

// ---- Activities: changes applied in the editor wait here until Save all ----
// key (an activity's id, or "new…" for one not saved yet) → { kind: "new" | "edit" | "delete", ... }
var actStage = {}, editingKey = null;
function effActs() {
  var out = acts.filter(function (a) { var st = actStage[a.id]; return !(st && st.kind === "delete"); })
    .map(function (a) { var st = actStage[a.id]; return st && st.kind === "edit" ? Object.assign({}, a, st.act, { id: a.id }) : a; });
  Object.keys(actStage).forEach(function (k) { var st = actStage[k]; if (st.kind === "new") out.push(Object.assign({}, st.act, { id: k })); });
  return out;
}
var actStageArea = {
  name: "Activities", statusId: "m-done", shown: adminShown,
  dirty: function () { return Object.keys(actStage).length > 0; },
  pending: function () { return false; }, applied: function () { return Object.keys(actStage).length; },
  discard: function () { actStage = {}; }, redraw: function () { renderActList(); }, mark: function () {}
};
areas.push(actStageArea);
function setEditorValues(v) {
  $("m-title").value = v.title; $("m-tag").value = v.tag; $("m-type").value = v.type; fillVenueOptions(v.venue);
  $("m-start").value = toLocalInput(v.start); $("m-len").value = v.len; $("m-host").value = v.host;
  $("m-hasgm").checked = v.hasManager; $("m-gm").value = v.manager; $("m-gm-field").hidden = !v.hasManager;
  $("m-look").value = v.style; fillGraphics(v.graphic);
}
// Opening another activity while this one has changes not applied yet asks first (rule 4).
function openEditorSafely(a, key) {
  if (editorArea.shown() && editorArea.dirty()) askLeave(function () { openEditor(a, key); }, [editorArea]);
  else openEditor(a, key);
}
function openEditor(a, key) {
  isNew = !a;
  editing = a || null; editingKey = key || null;
  delArmed = false; $("m-delete").textContent = "Delete"; $("m-delete").hidden = isNew && !editingKey;
  $("m-form-title").textContent = isNew ? "New activity" : "Edit activity";
  $("m-title").value = a ? a.title : "";
  $("m-tag").value = a ? a.tag : "";
  // Only one 50/50: offer the type only when no other activity already is the 50/50.
  var taken = otherDraw(a);
  var drawOpt = $("m-type").querySelector('option[value="draw"]');
  drawOpt.disabled = !!taken;
  drawOpt.textContent = taken ? "50/50 (already: " + taken.title + ")" : "50/50 (special, only one)";
  $("m-type").querySelector('option[value="tickets"]').textContent = "Draws (special, gets its own menu link)";
  $("m-type").value = a ? a.type : "game";
  fillVenueOptions(a ? a.venue : VENUES.stage ? "stage" : "");
  $("m-start").value = toLocalInput(a ? startOf(a) : Math.ceil(Date.now() / (15 * MIN)) * 15 * MIN);
  $("m-len").value = a ? a.len : 30;
  $("m-host").value = a ? a.host : "";
  $("m-hasgm").checked = !!(a && a.hasManager);
  $("m-gm").value = a ? a.manager || "" : "";
  $("m-gm-field").hidden = !$("m-hasgm").checked;
  $("m-look").value = a ? a.style : STYLES[acts.length % STYLES.length].id;
  fillGraphics(a ? a.graphic || "suggest" : "suggest");
  $("m-status").classList.remove("unsaved"); ok("m-status", "");
  panelIn($("m-editor"));
  // A new activity counts as unsaved from the start: leaving would lose it.
  editorBase = isNew ? {} : editorValues();
  // Changes already applied (not saved yet) open in the editor.
  var staged = actStage[editingKey || (a && a.id)];
  if (staged && staged.values) setEditorValues(staged.values);
  editorShown = staged && staged.values ? editorValues() : editorBase;
  renderPreview(); renderActList(); editorArea.mark();
  $("m-editor").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  $("m-title").focus({ preventScroll: true });
}
function closeEditor() { panelOut($("m-editor")); $("m-editor").classList.remove("dirty"); editing = null; isNew = false; editorBase = null; editorShown = null; editingKey = null; renderActList(); markPageBars(); }
$("m-add").addEventListener("click", function () { openEditorSafely(null); });
$("m-hasgm").addEventListener("change", function () { $("m-gm-field").hidden = !$("m-hasgm").checked; if ($("m-hasgm").checked) $("m-gm").focus(); });
// Cancel throws the draft away (rule 4).
$("m-cancel").addEventListener("click", closeEditor);
["m-title", "m-tag", "m-start", "m-len", "m-host", "m-gm"].forEach(function (id) { $(id).addEventListener("input", function () { renderPreview(); editorArea.mark(); }); });
["m-venue", "m-look", "m-graphic", "m-hasgm"].forEach(function (id) { $(id).addEventListener("change", function () { renderPreview(); editorArea.mark(); }); });
// Name and type drive the suggestion: refresh its label, keep whatever the admin picked.
$("m-title").addEventListener("input", function () { fillGraphics($("m-graphic").value); renderPreview(); });
$("m-type").addEventListener("change", function () { fillGraphics($("m-graphic").value); renderPreview(); editorArea.mark(); });
// Saves only the fields the editor shows and the admin changed (rule 5), so a winner or ticket
// added on a game screen while the editor was open is never wiped out.
var EDITOR_FIELDS = { title: "title", tag: "tag", type: "type", venue: "venue", host: "host", style: "style", graphic: "graphic", hasManager: "hasManager", manager: "manager" };
$("m-form").addEventListener("submit", function (e) {
  e.preventDefault();
  if (!$("m-title").value.trim()) { setStatus("m-status", "Give the activity a name.", true); return; }
  if (!isFinite(new Date($("m-start").value).getTime())) { setStatus("m-status", "Pick a start date and time.", true); return; }
  if ($("m-type").value === "draw" && otherDraw(editing)) { setStatus("m-status", "There's already a 50/50 (" + otherDraw(editing).title + "). There can only be one.", true); return; }
  if ($("m-hasgm").checked && !$("m-gm").value.trim()) { setStatus("m-status", "Add the game manager's name, or switch the game manager off.", true); return; }
  var len = parseInt($("m-len").value, 10);
  if (!(len >= 5 && len <= 720)) { setStatus("m-status", "Length must be between 5 and 720 minutes (12 hours).", true); return; }
  var ns = new Date($("m-start").value).getTime(), wp = isNew ? windowProblem(null, null, ns, ns + len * MIN) : windowProblem(startOf(editing), endOf(editing), ns, ns + len * MIN);
  if (wp) { setStatus("m-status", wp + " Change the event times on the run sheet first if the night is longer.", true); return; }
  var v = editorValues(), key, staged;
  // Making an activity the 50/50 claims the 50/50 slot in the same save (LOGIC-RULES TYPE-1).
  if (isNew) {
    var f = formActivity(); f.schedLen = null;
    key = editingKey || "new" + Date.now().toString(36);
    staged = { kind: "new", values: v, act: f, doc: toDoc(f), becomesDraw: v.type === "draw", title: v.title };
  } else {
    var fields = {};
    Object.keys(EDITOR_FIELDS).forEach(function (k) { if (v[k] !== editorBase[k]) fields[EDITOR_FIELDS[k]] = k === "title" ? v[k].slice(0, 60) : k === "tag" ? v[k].slice(0, 80) : v[k]; });
    // A new start or length is a new schedule, so any "moved on the night" note goes.
    if (v.start !== editorBase.start) fields.start = Timestamp.fromMillis(v.start);
    if (v.len !== editorBase.len) fields.length = v.len;
    if (fields.start || fields.length) { fields.schedLength = deleteField(); fields.schedStart = deleteField(); }
    // Turning an activity into a Draws gives it a numbered prize list if it has none.
    if (fields.type === "tickets" && !(byId(editing.id) || editing).slots.length) fields.slots = newSlots(10);
    key = editing.id;
    staged = Object.keys(fields).length ? { kind: "edit", id: editing.id, values: v, act: formActivity(), fields: fields, becomesDraw: v.type === "draw" && editorBase.type !== "draw", title: v.title } : null;
  }
  if (staged) actStage[key] = staged; else delete actStage[key];
  closeEditor();
  ok("m-done", staged ? "Applied “" + v.title + "”. Press Save all at the bottom to save." : "No changes left for “" + v.title + "”.");
  glow($("m-done"));
});
// Delete is deliberate (rule 6): two taps, then it waits for Save all like any other change.
$("m-delete").addEventListener("click", function () {
  if (!editing && !editingKey) return;
  if (!delArmed) { delArmed = true; $("m-delete").textContent = "Tap again to delete"; return; }
  if (editingKey) { var nm = actStage[editingKey].title; delete actStage[editingKey]; closeEditor(); ok("m-done", "Removed “" + nm + "” (it was never saved)."); return; }
  var name = editing.title;
  actStage[editing.id] = { kind: "delete", id: editing.id, title: name };
  closeEditor();
  ok("m-done", "“" + name + "” will be deleted when you press Save all. Undo on its row keeps it.");
});

// Two-tap confirm for the big buttons: the first tap arms it, the second does it.
var armed = {};
function confirmTap(id, label, armedLabel) {
  if (!armed[id]) {
    armed[id] = true; $(id).textContent = armedLabel;
    setTimeout(function () { armed[id] = false; $(id).textContent = label; }, 5000);
    return false;
  }
  armed[id] = false; $(id).textContent = label;
  return true;
}
// A sample night timed around now, so something is live straight away. "at" is minutes after the first activity.
function sampleNight(now) {
  var base = Math.round((now - 172 * MIN) / (5 * MIN)) * (5 * MIN);
  var slotsEarly = [{ label: "Grand prize: weekend getaway", ticket: "004217", claimed: true }, { label: "Gift basket", ticket: "001388", claimed: false }, { label: "Bar tab $50", ticket: "003902", claimed: true }]
    .concat(["000417", "002561", "004090", "001744", "003318", "000925", "002208"].map(function (t) { return { label: "", ticket: t, claimed: false }; }));
  return [
    { at: 0, len: 45, title: "Welcome Mixer", tag: "Wristbands, hellos and your first 50/50 tickets.", type: "social", venue: "lobby", host: "The LIVENITE crew", style: "wave", graphic: "auto" },
    { at: 45, len: 60, title: "Neon Bingo", tag: "Glow daubers. Three rounds. One blackout.", type: "game", venue: "stage", host: "DJ Marla", style: "marquee", hasManager: true, manager: "DJ Marla", winners: ["Priya S.", "Tom R. (blackout)"] },
    { at: 60, len: 60, title: "Shuffleboard Showdown", tag: "Pairs, pucks and string lights on deck.", type: "challenge", venue: "deck", host: "Captain Rob", style: "bloom", graphic: "auto" },
    { at: 100, len: 20, title: "Early Bird Prize Draw", tag: "Ten prizes. Check your stub below.", type: "tickets", venue: "lobby", host: "The LIVENITE crew", style: "bloom", hasManager: true, manager: "Sam", resultsFinal: true, slots: slotsEarly },
    { at: 110, len: 45, title: "Name That Tune", tag: "Three notes. Four teams. One buzzer.", type: "music", venue: "lounge", host: "Priya on the keys", style: "sunset", hasManager: true, manager: "Priya", winners: ["Table 4: The Encores"] },
    { at: 165, len: 45, title: "Minute to Win It", tag: "Sixty seconds. Cups, cookies, chaos.", type: "challenge", venue: "stage", host: "DJ Marla", style: "neon", graphic: "auto" },
    { at: 175, len: 45, title: "Lounge Pub Quiz", tag: "Five rounds and a picture round to argue about.", type: "game", venue: "lounge", host: "Quizmaster Jo", style: "studio", hasManager: true, manager: "Quizmaster Jo" },
    { at: 215, len: 10, title: "50/50 Draw", tag: "One ticket. Half the pot. Live on the big screen.", type: "draw", venue: "stage", host: "The whole crowd", style: "marquee" },
    { at: 230, len: 60, title: "Glow Karaoke", tag: "Grab a glow mic and own the room.", type: "music", venue: "lounge", host: "Priya & the house band", style: "sunset" },
    { at: 245, len: 60, title: "Midnight Snack Bar", tag: "Sliders, fries and hot chocolate under the lights.", type: "social", venue: "deck", host: "The galley team", style: "wave" },
    { at: 250, len: 15, title: "Last Call Raffle", tag: "Five prizes before the lights come up.", type: "tickets", venue: "lobby", host: "The LIVENITE crew", style: "neon", hasManager: true, manager: "Sam", slots: [{ label: "Signed guitar", ticket: "", claimed: false }].concat(newSlots(4)) },
    { at: 290, len: 70, title: "Last Call Dance Party", tag: "Requests open. Lights down. Everybody up.", type: "music", venue: "stage", host: "DJ Marla", style: "neon" }
  ].map(function (a) { a.start = base + a.at * MIN; return a; });
}
function adminHasChanges() { return PAGES[0].areas().some(function (o) { return o.dirty() || pendingOf(o); }); }
$("m-sample").addEventListener("click", function () {
  if (adminHasChanges()) { setStatus("m-done", "Save all or Cancel your changes at the bottom first.", true); return; }
  var hasDraw = !!draw();
  if (acts.length && !confirmTap("m-sample", "Load sample night", "Adds 12 more. Tap again")) return;
  var batch = writeBatch(db);
  // Only one 50/50, so the sample skips its own if there's one already.
  var sample = sampleNight(Date.now()).filter(function (a) { return !(hasDraw && a.type === "draw"); });
  sample.forEach(function (a) {
    var r = doc(collection(db, "activities"));
    batch.set(r, toDoc(a));
    if (a.type === "draw") batch.set(doc(db, "site", "fiftyFifty"), { activityId: r.id, updatedAt: serverTimestamp() });
  });
  // The sample comes with its own event times (saved in the same step), so the event-hours rules accept it.
  var evS = Math.min.apply(null, sample.map(function (a) { return a.start; })), evE = Math.max.apply(null, sample.map(function (a) { return a.start + a.len * MIN; }));
  var ef = { eventStart: Timestamp.fromMillis(evS), eventEnd: Timestamp.fromMillis(evE), updatedAt: serverTimestamp() }, sref = doc(db, "site", "settings");
  if (settingsExists) batch.update(sref, ef);
  else batch.set(sref, Object.assign({ mark: settings.mark, eyebrow: settings.eyebrow, brand: settings.brand, tagline: settings.tagline, bulbs: settings.bulbs, nav: cleanNav(settings.nav), venues: cleanVenues(settings.venues) }, ef));
  ok("m-done", "Loading the sample night…");
  batch.commit().then(function () { ok("m-done", "Sample night loaded, with event times to match. It's timed around now so something is live."); }, function (err) { bad("m-done", "Could not load the sample (" + errText(err) + ")."); });
});
$("m-clear").addEventListener("click", function () {
  if (adminHasChanges()) { setStatus("m-done", "Save all or Cancel your changes at the bottom first.", true); return; }
  if (!confirmTap("m-clear", "Clear all", "Deletes all " + acts.length + ". Tap again")) return;
  var batch = writeBatch(db);
  acts.forEach(function (a) { batch.delete(doc(db, "activities", a.id)); });
  batch.commit().then(function () { closeEditor(); ok("m-done", "All activities cleared."); }, function (err) { bad("m-done", "Could not clear (" + errText(err) + ")."); });
});

// ---------- Game management ----------
// Each panel keeps a draft until its Save button (DATA-RULES.md, rule 4). Ticking Claimed is the one
// exception: it marks a finished task, so it saves straight away.
var gmId = null;
function gmGame() { return byId(gmId); }
function gmShown(panelId) { return function () { return !$("view-gm").hidden && !$(panelId).hidden; }; }
function actRef(a) { return doc(db, "activities", a.id); }
function liveNow(a) { var now = Date.now(); return now >= startOf(a) && now < endOf(a); }

// Start and end time: Start now, -5 / +5 / +10, End now and Set only change the draft until Save.
var timeDraft = null; // { id, start, len }
function draftStart(a) { return timeDraft && timeDraft.id === a.id ? timeDraft.start : startOf(a); }
function draftLen(a) { return timeDraft && timeDraft.id === a.id ? timeDraft.len : a.len; }
function setTimes(a, start, len) {
  if (len < 1 || len > 720) gmGlowNext = false;
  if (len < 1) { setStatus("gm-time-status", "The end time can't be before the start (" + clock(start) + ").", true); return; }
  if (len > 720) { setStatus("gm-time-status", "That's more than 12 hours after the start. Pick an earlier end time.", true); return; }
  $("gm-time-status").classList.remove("bad");
  timeDraft = { id: a.id, start: start, len: len };
  renderTime(a); markArea(timeArea);
}
function moveEnd(a, len) { setTimes(a, draftStart(a), len); }
var timeArea = editArea({
  check: function () { var a = gmGame(), d = timeDraft; return windowProblem(startOf(a), endOf(a), d.start, d.start + d.len * MIN); },
  name: "Time", draft: function () { return timeDraft; },
  boxId: "gm-time-box", saveId: "gm-time-save", cancelId: "gm-time-cancel", statusId: "gm-time-status", shown: gmShown("gm-time-box"),
  dirty: function () { var a = gmGame(); return !!(a && timeDraft && timeDraft.id === a.id && (timeDraft.len !== a.len || timeDraft.start !== startOf(a))); },
  discard: function () { timeDraft = null; },
  redraw: function () { var a = gmGame(); if (a) renderTime(a); },
  save: function () {
    var a = gmGame(), d = timeDraft, f = { updatedAt: serverTimestamp() };
    // Only what changed is saved (rule 5). The first change on the night keeps the original length as the schedule.
    if (d.start !== startOf(a)) f.start = Timestamp.fromMillis(d.start);
    if (d.len !== a.len) f.length = d.len;
    Object.assign(f, rememberSchedule(a));
    timeArea.savedText = "Saved. It now runs " + clock(d.start) + " – " + clock(d.start + d.len * MIN) + " everywhere.";
    return updateDoc(actRef(a), f);
  }
});
var gmGlowNext = false; // set by the time buttons, so only a tap (not a database update) makes the times glow
function renderTime(a) {
  var now = Date.now(), start = draftStart(a), len = draftLen(a), end = start + len * MIN;
  var tapped = gmGlowNext; gmGlowNext = false;
  if (tapped && $("gm-start").textContent !== clock(start)) glowText($("gm-start"));
  if (tapped && $("gm-end").textContent !== clock(end)) glowText($("gm-end"));
  $("gm-start").textContent = clock(start);
  $("gm-end").textContent = clock(end);
  // These notes keep their space even when empty, so the buttons below never shift between taps (MOTION-RULES rule 6).
  $("gm-start-was").classList.toggle("unseen", start === startOf(a));
  $("gm-start-was").textContent = "Saved: " + clock(startOf(a));
  // Show the saved end next to a changed one, and the original slot if times were moved on the night.
  var sch = scheduleOf(a), was = [];
  if (end !== endOf(a)) was.push("Saved: " + clock(endOf(a)));
  if (sch && (sch.s !== start || sch.e !== end)) was.push("Scheduled: " + clock(sch.s) + " – " + clock(sch.e));
  $("gm-was").classList.toggle("unseen", !was.length); $("gm-was").textContent = was.length ? was.join(" · ") : "\u00a0";
  var left = endOf(a) - now;
  $("gm-left").textContent = now < startOf(a) ? "Starts in " + words(startOf(a) - now) + "." : left > 0 ? words(left) + " to go" : "Finished";
  // End now only makes sense once the (draft) start has passed and before the end.
  $("gm-end-now").disabled = !(now >= start && now < end);
  if (document.activeElement !== $("gm-set")) $("gm-set").value = hhmm(end);
  markArea(timeArea);
}
// Start now: the start moves to this minute and the game keeps its length, so the end moves with it.
$("gm-start-now").addEventListener("click", function () {
  var a = gmGame(); if (!a) return;
  var start = Math.floor(Date.now() / MIN) * MIN;
  gmGlowNext = true; setTimes(a, start, draftLen(a));
});
document.querySelectorAll("[data-adjust]").forEach(function (btn) {
  btn.addEventListener("click", function () { var a = gmGame(); if (a) { gmGlowNext = true; moveEnd(a, draftLen(a) + Number(btn.getAttribute("data-adjust"))); } });
});
$("gm-end-now").addEventListener("click", function () {
  var a = gmGame(); if (!a) return;
  var start = draftStart(a);
  if (Date.now() < start) { setStatus("gm-time-status", "This game hasn't started yet (it starts at " + clock(start) + ").", true); return; }
  // Round down so the game ends this minute, not the next one.
  gmGlowNext = true; moveEnd(a, Math.max(1, Math.floor((Date.now() - start) / MIN)));
});
$("gm-set-form").addEventListener("submit", function (e) {
  e.preventDefault();
  var a = gmGame(); if (!a) return;
  var p = ($("gm-set").value || "").split(":"); if (p.length < 2) return;
  var start = draftStart(a), d = new Date(start); d.setHours(parseInt(p[0], 10), parseInt(p[1], 10), 0, 0);
  if (d.getTime() < start) d.setDate(d.getDate() + 1);
  gmGlowNext = true; moveEnd(a, Math.round((d.getTime() - start) / MIN));
});

// Winners: Add to list and × change the draft; Save applies them to the latest saved list, so winners
// someone else added meanwhile are kept (rule 5).
var winDraft = null; // { id, adds: [names], removes: [names] }
function editWins(a) { if (!winDraft || winDraft.id !== a.id) winDraft = { id: a.id, adds: [], removes: [] }; return winDraft; }
var winArea = editArea({
  name: "Winners", draft: function () { return winDraft; },
  boxId: "gm-win-panel", saveId: "gm-win-save", cancelId: "gm-win-cancel", statusId: "gm-win-status", shown: gmShown("gm-win-panel"),
  dirty: function () { var a = gmGame(); return !!(a && winDraft && winDraft.id === a.id && (winDraft.adds.length || winDraft.removes.length)); },
  discard: function () { winDraft = null; },
  redraw: function () { var a = gmGame(); if (a) renderWinners(a); },
  check: function () { var a = gmGame(); return (a.winners.length - winDraft.removes.length + winDraft.adds.length) > 50 ? "That's more than 50 winners, the most one game can list." : ""; },
  save: function () {
    var d = winDraft, ref = actRef(gmGame());
    return runTransaction(db, function (t) {
      return t.get(ref).then(function (snap) {
        var list = (snap.data() && snap.data().winners) || [];
        d.removes.forEach(function (w) { var i = list.indexOf(w); if (i >= 0) list.splice(i, 1); });
        t.update(ref, { winners: list.concat(d.adds), updatedAt: serverTimestamp() });
      });
    });
  }
});
function renderWinners(a) {
  var list = $("gm-win-list"); list.replaceChildren();
  var d = winDraft && winDraft.id === a.id ? winDraft : { adds: [], removes: [] };
  var toRemove = d.removes.slice(), n = 0;
  a.winners.forEach(function (w) {
    var i = toRemove.indexOf(w), removing = i >= 0;
    if (removing) toRemove.splice(i, 1);
    var li = el("li", "win-row" + (removing ? " removing" : "")); li.append(el("span", null, (++n) + ". " + w));
    var x = el("button", "icon-btn", removing ? "↺" : "×"); x.type = "button"; x.setAttribute("aria-label", (removing ? "Keep " : "Remove ") + w);
    x.addEventListener("click", function () {
      var dd = editWins(a), at = dd.removes.indexOf(w);
      if (removing) dd.removes.splice(at, 1); else dd.removes.push(w);
      renderWinners(a); markArea(winArea);
    });
    li.append(x); list.append(li);
  });
  d.adds.forEach(function (w, i) {
    var li = el("li", "win-row adding"); li.append(el("span", null, (++n) + ". " + w));
    var x = el("button", "icon-btn", "×"); x.type = "button"; x.setAttribute("aria-label", "Remove " + w);
    x.addEventListener("click", function () { editWins(a).adds.splice(i, 1); renderWinners(a); markArea(winArea); });
    li.append(x); list.append(li);
  });
  if (!n) list.append(el("li", "meta", "No winners yet."));
  markArea(winArea);
}
$("gm-win-form").addEventListener("submit", function (e) {
  e.preventDefault();
  var a = gmGame(); if (!a) return;
  var name = $("gm-win-name").value.trim();
  var ticketNo = a.type === "draw" ? $("gm-ticketno").value.trim() : "";
  if (name && ticketNo) name += " (ticket #" + ticketNo.replace(/^#/, "") + ")";
  if (!name) { setStatus("gm-win-status", "Type the winner's name first.", true); return; }
  $("gm-win-status").classList.remove("bad");
  editWins(a).adds.push(name.slice(0, 80));
  $("gm-win-name").value = ""; $("gm-ticketno").value = "";
  renderWinners(a); markArea(winArea);
  var added = $("gm-win-list").querySelectorAll(".win-row.adding"); glow(added[added.length - 1]);
  $("gm-win-name").focus();
});

// 50/50 pot: the pot record belongs to this panel alone, so Save writes it whole.
var potDraft = null; // { amt, price } as typed
function potSaved() { return { amt: pot == null ? "" : String(pot), price: ticketPrice }; }
var potArea = editArea({
  name: "50/50 pot", draft: function () { return potDraft; },
  boxId: "gm-pot-panel", saveId: "gm-pot-save", cancelId: "gm-pot-cancel", statusId: "gm-pot-status", shown: gmShown("gm-pot-panel"),
  dirty: function () { return !!potDraft && !same(potDraft, potSaved()); },
  discard: function () { potDraft = null; },
  redraw: function () { renderPot(true); },
  check: function () { return parseAmount(potDraft.amt) === null ? "Enter the pot as a number, like 1240 or 1,240." : ""; },
  save: function () {
    var n = parseAmount(potDraft.amt);
    // The public prize record never holds an email; who saved it goes only in the admins-only history.
    var prize = { amount: n, ticketPrice: (potDraft.price.trim() || ticketPrice).slice(0, 40), drawTime: potDrawTime.slice(0, 40), updatedAt: serverTimestamp() };
    var batch = writeBatch(db);
    batch.set(doc(db, "games", GAME_ID), prize);
    batch.set(doc(collection(db, "games", GAME_ID, "history")), Object.assign({}, prize, { updatedBy: user ? user.email : "" }));
    potArea.savedText = "Saved. The pot is " + money(n) + " on every screen.";
    return batch.commit();
  }
});
function renderPot(force) {
  $("gm-pot-now").textContent = money(pot);
  $("gm-pot-updated").textContent = potSetAt ? "Updated " + clock(potSetAt) : "Not set yet";
  if (force || !potDraft) { var s = potSaved(); $("gm-pot-amt").value = s.amt; $("gm-ticket").value = s.price; }
  markArea(potArea);
}
["gm-pot-amt", "gm-ticket"].forEach(function (id) {
  $(id).addEventListener("input", function () { potDraft = { amt: $("gm-pot-amt").value, price: $("gm-ticket").value }; $("gm-pot-status").classList.remove("bad"); markArea(potArea); });
});
$("gm-pot-form").addEventListener("submit", function (e) { e.preventDefault(); applyArea(potArea); });

// Draws: prize labels, ticket numbers, added or removed prizes and "All tickets drawn" wait for Save.
// Claimed saves on the tick (a finished task) and only ever touches that one prize's tick.
var slotsDraft = null; // { id, rows: [{ label, ticket, orig }], final }
function editSlots(a) {
  if (!slotsDraft || slotsDraft.id !== a.id) slotsDraft = { id: a.id, final: a.resultsFinal, rows: a.slots.map(function (s, i) { return { label: s.label, ticket: s.ticket, name: s.name, orig: i }; }) };
  return slotsDraft;
}
function slotRows(a) { return slotsDraft && slotsDraft.id === a.id ? slotsDraft.rows : a.slots.map(function (s, i) { return { label: s.label, ticket: s.ticket, name: s.name, orig: i }; }); }
var slotsArea = editArea({
  name: "Winning tickets", draft: function () { return slotsDraft; },
  boxId: "gm-draws-panel", saveId: "gm-draws-save", cancelId: "gm-draws-cancel", statusId: "gm-draws-status", shown: gmShown("gm-draws-panel"),
  dirty: function () {
    var a = gmGame(); if (!a || !slotsDraft || slotsDraft.id !== a.id) return false;
    var base = a.slots.map(function (s, i) { return { label: s.label, ticket: s.ticket, name: s.name, orig: i }; });
    return slotsDraft.final !== a.resultsFinal || !same(slotsDraft.rows, base);
  },
  discard: function () { slotsDraft = null; },
  redraw: function () { var a = gmGame(); if (a) renderSlots(a, true); },
  save: function () {
    var a = gmGame(), d = slotsDraft, ref = actRef(a), endNow = d.final && !a.resultsFinal && liveNow(a);
    slotsArea.savedText = d.final && !a.resultsFinal ? "Saved. Results are showing; guests can search them now." : "Saved. Guests see the list now.";
    return runTransaction(db, function (t) {
      return t.get(ref).then(function (snap) {
        var latest = (snap.data() && snap.data().slots) || [];
        // Claimed ticks always come from the latest saved list, never from the draft.
        var slots = d.rows.map(function (r) { return { label: r.label.slice(0, 60), ticket: r.ticket.trim().slice(0, 12), name: (r.name || "").trim().slice(0, 60), claimed: r.orig != null && latest[r.orig] ? !!latest[r.orig].claimed : false }; });
        var f = { slots: slots, resultsFinal: d.final, updatedAt: serverTimestamp() };
        // Marking all tickets drawn mid-draw ends the draw, so the card switches to SEARCH DRAW RESULTS.
        if (endNow) { Object.assign(f, rememberSchedule(a)); f.length = Math.max(1, Math.floor((Date.now() - startOf(a)) / MIN)); }
        t.update(ref, f);
      });
    });
  }
});
function slotCount(a) {
  var rows = slotRows(a), drawn = rows.filter(function (x) { return cleanNo(x.ticket); }).length;
  var claimed = a.slots.filter(function (x) { return x.claimed; }).length;
  var fin = slotsDraft && slotsDraft.id === a.id ? slotsDraft.final : a.resultsFinal;
  $("gm-draws-count").textContent = drawn + " of " + rows.length + " drawn · " + claimed + " claimed" + (fin ? " · results showing" : "");
}
// The little "Saving… / Saved" note beside each Claimed tick, kept here so a list refresh doesn't wipe it.
var claimNotes = {};
function claimNote(a, orig, text, isBad) {
  var key = a.id + ":" + orig;
  claimNotes[key] = { text: text, bad: !!isBad };
  var cb = document.querySelector('#gm-slots input[data-orig="' + orig + '"]');
  if (cb) { var n = cb.parentNode.querySelector(".tick-saved"); n.textContent = text; n.classList.toggle("bad", !!isBad); }
  if (text === "Saved") setTimeout(function () { if (claimNotes[key] && claimNotes[key].text === "Saved") claimNote(a, orig, ""); }, 2500);
}
// Instant save for one Claimed tick: reads the latest list and changes just that prize.
function saveClaim(a, orig, value, cb) {
  var ref = actRef(a);
  claimNote(a, orig, "Saving…");
  runTransaction(db, function (t) {
    return t.get(ref).then(function (snap) {
      var latest = (snap.data() && snap.data().slots) || [];
      if (!latest[orig]) throw { code: "prize-removed" };
      latest[orig].claimed = value;
      t.update(ref, { slots: latest, updatedAt: serverTimestamp() });
    });
  }).then(function () { claimNote(a, orig, "Saved"); }, function (err) {
    var box = document.querySelector('#gm-slots input[data-orig="' + orig + '"]') || cb;
    box.checked = !value; box.closest("li").classList.toggle("claimed", !value);
    claimNote(a, orig, "Not saved (" + errText(err) + ")", true);
  });
}
function renderSlots(a, force) {
  var list = $("gm-slots"), editingThis = slotsDraft && slotsDraft.id === a.id;
  $("gm-final").checked = editingThis ? slotsDraft.final : a.resultsFinal;
  slotCount(a); markArea(slotsArea);
  // While a draft is on screen, keep its boxes exactly as typed (rule 2); only refresh the Claimed ticks.
  if (!force && editingThis && list.getAttribute("data-for") === a.id) {
    list.querySelectorAll("input[data-orig]").forEach(function (cb) {
      var s = a.slots[Number(cb.getAttribute("data-orig"))];
      if (s && document.activeElement !== cb) { cb.checked = s.claimed; cb.closest("li").classList.toggle("claimed", s.claimed); }
    });
    return;
  }
  list.setAttribute("data-for", a.id);
  list.replaceChildren();
  slotRows(a).forEach(function (r, i) {
    var saved = r.orig != null ? a.slots[r.orig] : null;
    var li = el("li", "slot-row" + (saved && saved.claimed ? " claimed" : "") + (r.orig == null ? " adding" : ""));
    var lab = el("input"); lab.type = "text"; lab.value = r.label; lab.placeholder = "#" + (i + 1); lab.maxLength = 60; lab.setAttribute("aria-label", "Label for prize " + (i + 1));
    lab.addEventListener("input", function () { editSlots(a).rows[i].label = lab.value; slotCount(a); markArea(slotsArea); });
    var tno = el("input", "tno"); tno.type = "text"; tno.value = r.ticket; tno.placeholder = "Ticket #"; tno.maxLength = 12; tno.inputMode = "numeric"; tno.setAttribute("aria-label", "Winning ticket for prize " + (i + 1));
    tno.addEventListener("input", function () { editSlots(a).rows[i].ticket = tno.value; slotCount(a); markArea(slotsArea); });
    tno.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); var next = list.querySelectorAll("input.tno")[i + 1]; if (next) next.focus(); } });
    var cl = el("label", "check"); var cb = el("input"); cb.type = "checkbox"; cb.checked = !!(saved && saved.claimed);
    var note = el("span", "tick-saved"), kept = r.orig != null && claimNotes[a.id + ":" + r.orig];
    if (kept) { note.textContent = kept.text; note.classList.toggle("bad", kept.bad); }
    if (r.orig == null) { cb.disabled = true; cl.title = "Save the list first, then tick Claimed"; }
    else {
      cb.setAttribute("data-orig", r.orig);
      cb.addEventListener("change", function () { li.classList.toggle("claimed", cb.checked); saveClaim(a, r.orig, cb.checked, cb); });
    }
    cl.append(cb, document.createTextNode("Claimed"), note);
    var rm = el("button", "icon-btn", "×"); rm.type = "button"; rm.setAttribute("aria-label", "Remove prize " + (i + 1));
    rm.addEventListener("click", function () { editSlots(a).rows.splice(i, 1); renderSlots(a, true); markArea(slotsArea); });
    var wn = el("input", "wname-in"); wn.type = "text"; wn.value = r.name || ""; wn.placeholder = "Winner's name (optional)"; wn.maxLength = 60; wn.setAttribute("aria-label", "Winner's name for prize " + (i + 1));
    wn.addEventListener("input", function () { editSlots(a).rows[i].name = wn.value; markArea(slotsArea); });
    li.append(el("span", "n", String(i + 1)), lab, tno, wn, cl, rm);
    list.append(li);
  });
}
$("gm-final").addEventListener("change", function () { var a = gmGame(); if (!a) return; editSlots(a).final = $("gm-final").checked; slotCount(a); markArea(slotsArea); });
function addSlots(n) {
  var a = gmGame(); if (!a) return;
  var d = editSlots(a);
  if (d.rows.length + n > 200) { setStatus("gm-draws-status", "That's more than 200 prizes, the most one list holds.", true); return; }
  for (var i = 0; i < n; i++) d.rows.push({ label: "", ticket: "", name: "", orig: null });
  renderSlots(a, true); markArea(slotsArea);
  var rows = $("gm-slots").querySelectorAll(".slot-row"); for (var j = rows.length - n; j < rows.length; j++) glow(rows[j]);
}
$("gm-add-slot").addEventListener("click", function () { addSlots(1); var t = $("gm-slots").querySelectorAll("input.tno"); if (t.length) t[t.length - 1].focus(); });
$("gm-add-5").addEventListener("click", function () { addSlots(5); });

// Step-by-step guide for draws, so managers know what guests see and what to do next.
// Each step: what's happening, what guests see on the card, and what to do. The current one is highlighted.
function renderGuide(a) {
  var isT = a.type === "tickets", isDraw = a.type === "draw";
  $("gm-guide").hidden = !(isT || isDraw);
  if (!isT && !isDraw) return;
  var now = Date.now(), st = stateOf(a, now), s = clock(startOf(a)), e = clock(endOf(a)), steps, at;
  if (isT) {
    $("gm-guide-title").textContent = "How this draw works";
    $("gm-guide-intro").textContent = "What guests see on the card depends on the draw's start and end times and on the \u201cAll tickets drawn\u201d tick. This draw runs " + s + " \u2013 " + e + (/\.$/.test(e) ? "" : ".");
    steps = [
      ["Before " + s, "Card shows \u201cDraw at " + s + "\u201d.", "Get the prize list ready: add prizes and type their labels, then press Apply and Save all. Need to start early or late? Use Start now or the time buttons, then Apply and Save all."],
      ["Drawing (" + s + " \u2013 " + e + ")", "Card shows a blinking DRAWING NOW.", "Type each winning ticket number (and the winner\u2019s name if you have it), then press Apply and Save all. Guests can search the saved tickets straight away."],
      ["All tickets drawn", "Card shows SEARCH DRAW RESULTS.", "Tick \u201cAll tickets drawn\u201d then press Apply and Save all. If the draw is still running, this ends it right away."],
      ["End time passed but not all drawn yet", "Card shows \u201cResults so far\u201d if any tickets are saved, otherwise \u201cResults soon\u201d.", "Keep entering tickets and saving. When you\u2019re done, tick \u201cAll tickets drawn\u201d, then Apply and Save all."],
      ["Prizes collected (any time)", "The ticket is crossed off on the guest list.", "Tick Claimed when someone collects their prize. It saves the moment you tick it; no Save needed."]
    ];
    at = a.resultsFinal ? 2 : st === "upcoming" ? 0 : st === "live" ? 1 : 3;
  } else {
    $("gm-guide-title").textContent = "How the 50/50 works";
    $("gm-guide-intro").textContent = "Guests see the pot and a countdown everywhere, including the floating badge. The draw is at " + s + (/\.$/.test(s) ? "" : ".");
    steps = [
      ["Before " + s, "Card and badge show the pot and \u201cDraw in\u201d countdown.", "Update the pot as tickets sell: type the amount, then press Apply and Save all. Every screen shows the new amount."],
      ["Drawing (" + s + " \u2013 " + e + ")", "Card shows a blinking DRAWING NOW; the badge says DRAWING.", "Draw the ticket. Need to start early or late? Use Start now or the time buttons, then Apply and Save all."],
      ["Winner drawn", "Once the draw ends, the card shows the winner.", "Type the winner\u2019s name and ticket number, press Add to list, then Apply and Save all."],
      ["After " + e, "Card shows \u201cFinished\u201d with the winner.", "Nothing more to do. To finish early, press End now, then Apply and Save all."]
    ];
    at = st === "upcoming" ? 0 : st === "live" ? (a.winners.length ? 2 : 1) : 3;
  }
  var list = $("gm-guide-steps"); list.replaceChildren();
  steps.forEach(function (x, i) {
    var li = el("li", i === at ? "now" : "");
    var head = el("span"); head.append(el("b", null, x[0]), document.createTextNode(" \u00b7 "), el("span", "shows", x[1]));
    li.append(head, el("span", null, x[2]));
    list.append(li);
  });
}
function renderGM(a) {
  if (gmId !== a.id) { timeDraft = winDraft = slotsDraft = potDraft = null; }
  gmId = a.id;
  var now = Date.now();
  $("gm-title").textContent = a.title;
  $("gm-who").textContent = (a.hasManager ? "Game manager: " + a.manager : "Run by admins") + " · " + (VENUES[a.venue] || a.venue) + (now < startOf(a) ? " · starts " : " · started ") + clock(startOf(a));
  renderTime(a);
  var isDraw = a.type === "draw", isT = a.type === "tickets";
  $("gm-draws-panel").hidden = !isT;
  $("gm-win-panel").hidden = isT;
  if (isT) renderSlots(a); else renderWinners(a);
  $("gm-pot-title").textContent = a.title + " pot";
  $("gm-pot-panel").hidden = !isDraw;
  $("gm-ticketno-field").hidden = !isDraw;
  if (isDraw) renderPot();
  $("gm-card").replaceChildren(cardFor(a, now, { static: true, heading: "h3" }));
  $("gm-page").href = "#a-" + a.id;
  renderGuide(a);
}

// ---------- Event times and window rules ----------
// Event start and end live in the site settings. Once set, activities must stay inside them:
// a move can't take an activity outside, and one already outside may only move closer (DATA-RULES.md, rule 8).
var EVENT_MAX_MIN = 12 * 60;
function eventWin() { return settings.eventStart && settings.eventEnd ? { s: settings.eventStart, e: settings.eventEnd } : null; }
// Times in ms. Returns "" when allowed, otherwise why not.
function windowProblem(oldS, oldE, s, e, win) {
  win = win || eventWin();
  if (!win) return "";
  var ok = (s >= win.s || (oldS != null && s >= oldS)) && (e <= win.e || (oldE != null && e <= oldE));
  return ok ? "" : "That would put it outside event hours (" + fullWhen(win) + ").";
}
function fullWhen(w) {
  var ds = new Date(w.s).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
  var t = function (ms) { return clock(ms).replace("p.m.", "PM").replace("a.m.", "AM"); };
  return ds + " · " + t(w.s) + " – " + t(w.e);
}

// ---------- Run sheet (admins) ----------
// Run sheet rows mix bold names and times, so they're built from markup; names are escaped first.
function esc(t) { return String(t).replace(/[&<>"']/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]; }); }
function elh(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; n.innerHTML = html; return n; }

// Laptop: a timeline with a row per venue across the whole event; phones: a list in time order.
// Every change is a draft until Save all, which saves only start, length and venue for the activities changed.
var RS = { selected: null, open: null, drafts: {}, late: null, evDraft: null, showDone: false, exactOpen: {} };
var MIN_MS = 60000;
function rsDay0() {
  if (RS.day0 && (Object.keys(RS.drafts).length || RS.evDraft)) return RS.day0;
  var w = eventWin(), first = sorted()[0]; var d = new Date(w ? w.s : first ? first.start : Date.now()); d.setHours(0, 0, 0, 0);
  return (RS.day0 = d.getTime());
}
// The run sheet works in minutes from midnight of the event's first day.
function toM(ms) { return Math.round((ms - rsDay0()) / MIN_MS); }
function toMs(m) { return rsDay0() + m * MIN_MS; }
function rsNow() { return toM(Date.now()); }
function rsEv() { var w = eventWin(); return w ? { s: toM(w.s), e: toM(w.e) } : null; }
function rsActs() {
  return acts.filter(function (a) { return a.start; }).map(function (a) {
    var sch = scheduleOf(a);
    return { id: a.id, t: a.title, v: a.venue, s: toM(a.start), e: toM(endOf(a)), style: a.style, type: TYPES[a.type], sched: sch ? { s: toM(sch.s), e: toM(sch.e) } : null };
  });
}
function rsVName(id) { return VENUES[id] || id; }
function rsCur(a) { return RS.drafts[a.id] || { s: a.s, e: a.e, v: a.v }; }
function rsChanged(a) { var d = RS.drafts[a.id]; return !!d && (d.s !== a.s || d.e !== a.e || d.v !== a.v); }
function rsState(a) { var n = rsNow(); return n >= a.e ? "done" : n >= a.s ? "live" : "next"; }
function rsOutside(c, ev) { ev = ev || rsEvNow(); return !!ev && (c.s < ev.s || c.e > ev.e); }
function rsInWindow(c, ev) { ev = ev || rsEvNow(); return !ev || (c.e > ev.s && c.s < ev.e); }
function rsOutsideText(c) { var ev = rsEvNow(); return c.e <= ev.s || c.s >= ev.e ? "Outside event hours" : c.s < ev.s ? "Starts before the event starts" : "Ends after the event ends"; }
function hm(m) { return clock(toMs(m)); }
function hmU(m) { return hm(m).replace("p.m.", "PM").replace("a.m.", "AM"); }
function hmShort(m) { return hm(m).replace(/ [ap]\.m\./, ""); }
function rsDayName(m) { return new Date(toMs(m)).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" }); }
function rsToast(t) { var n = $("rs-toast"); n.textContent = t; n.hidden = false; if (/^(Blocked|The end can|Pick a date)/.test(t)) shake(n); clearTimeout(rsToast.t); rsToast.t = setTimeout(function () { n.hidden = true; }, 3200); }
function rsByIdIn(list, id) { return list.filter(function (a) { return a.id === id; })[0]; }

// slide: true for one-off changes (Use these times). Repeat-tap buttons (+/−, Start now, End now) change instantly (MOTION-RULES rule 5).
function rsSetDraft(a, s, e, v, slide) {
  var c = rsCur(a); v = v || c.v;
  if (e - s < 1) { rsToast("The end can't be before the start."); return; }
  var ev = rsEvNow(); // the applied event times, saved or not
  // Single moves can't go outside event hours; one already outside may only move closer.
  if (ev && (s < Math.min(c.s, ev.s) || e > Math.max(c.e, ev.e))) {
    rsToast("Blocked: that would put " + a.t + " outside event hours (" + hmU(ev.s) + " – " + hmU(ev.e) + "). Change the event times first if the night is longer.");
    return;
  }
  RS.drafts[a.id] = { s: s, e: e, v: v };
  if (!rsChanged(a)) delete RS.drafts[a.id];
  rsTap({ ctl: { id: a.id, prev: c }, instant: !slide });
}

// ---- Date and time picker: a date box plus hour, minute and AM/PM dropdowns (nothing rolls over) ----
function pad2(n) { return (n < 10 ? "0" : "") + n; }
function mToInput(m) { var d = new Date(toMs(m)); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes()); }
function inputToM(v) { var t = new Date(v).getTime(); return isFinite(t) ? toM(t) : null; }
function dateTimePick(m, label, onChange) {
  var wrap = el("span", "dtpick");
  var d = el("input", "sel-box"); d.type = "date"; d.setAttribute("aria-label", label + " date");
  var h = el("select", "sel-box"), mi = el("select", "sel-box"), ap = el("select", "sel-box");
  h.setAttribute("aria-label", label + " hour"); mi.setAttribute("aria-label", label + " minute"); ap.setAttribute("aria-label", label + " AM or PM");
  for (var i = 1; i <= 12; i++) h.append(new Option(String(i), String(i)));
  ap.append(new Option("AM", "AM"), new Option("PM", "PM"));
  function fillMinutes(extra) {
    mi.replaceChildren();
    var list = []; for (var k = 0; k < 60; k += 5) list.push(k);
    if (extra != null && list.indexOf(extra) < 0) { list.push(extra); list.sort(function (x, y) { return x - y; }); }
    list.forEach(function (k) { mi.append(new Option(pad2(k), String(k))); });
  }
  wrap.set = function (v) {
    var dt = new Date(toMs(v));
    d.value = mToInput(v).slice(0, 10);
    var hr = dt.getHours(), mn = dt.getMinutes();
    fillMinutes(mn);
    h.value = String(hr % 12 || 12); mi.value = String(mn); ap.value = hr >= 12 ? "PM" : "AM";
  };
  wrap.get = function () {
    if (!d.value) return null;
    var hr = Number(h.value) % 12 + (ap.value === "PM" ? 12 : 0);
    return inputToM(d.value + "T" + pad2(hr) + ":" + pad2(Number(mi.value)));
  };
  wrap.limitDates = function (min, max) { d.min = min; d.max = max; };
  [d, h, mi, ap].forEach(function (x) { x.addEventListener("change", function () { if (onChange) onChange(); }); });
  var t = el("span", "tsel"); t.append(h, el("span", "colon", ":"), mi, ap);
  wrap.append(d, t);
  if (m != null) wrap.set(m);
  return wrap;
}

// ---- Event times panel ----
function rsEvNow() { return RS.evDraft || rsEv(); }
function rsEvCheck(d) {
  if (!d || d.s == null || d.e == null) return "Pick both a start and an end.";
  if (d.e <= d.s) return "The end has to be after the start.";
  if (d.e - d.s > EVENT_MAX_MIN) { var len = d.e - d.s; return "That's " + Math.floor(len / 60) + " h" + (len % 60 ? " " + len % 60 + " min" : "") + ". An event can run at most 12 hours."; }
  return "";
}
var evStartPick = null, evEndPick = null;
function evPicked() { return evStartPick ? { s: evStartPick.get(), e: evEndPick.get() } : null; }
function sameEv(x, y) { return !!x && !!y && x.s === y.s && x.e === y.e; }
// Times picked but not applied yet.
function evPending() { var p = evPicked(); return !!RS.evPickTouched && !!p && p.s != null && p.e != null && !sameEv(p, rsEvNow()); }
// Applied event times that differ from the saved ones (they save with Save all).
function evStaged() { var saved = rsEv(); return !!RS.evDraft && !sameEv(RS.evDraft, saved); }
function evChanged() { RS.evPickTouched = true; $("ev-status").classList.remove("bad"); renderEventPanel(); }
function renderEventPanel(force) {
  if (!evStartPick) {
    evStartPick = dateTimePick(null, "Event start", evChanged); evEndPick = dateTimePick(null, "Event end", evChanged);
    $("ev-start").append(evStartPick); $("ev-end").append(evEndPick);
  }
  var saved = rsEv(), d = rsEvNow();
  // Not set yet: suggest the evening of the first activity, 7:00 PM to 1:00 AM.
  var shown = d || { s: Math.floor((sorted()[0] ? toM(sorted()[0].start) : 0) / 1440) * 1440 + 19 * 60, e: 0 };
  if (!d) shown.e = shown.s + 6 * 60;
  // Until someone changes the pickers, they follow the applied (or saved) times as those arrive.
  if (force) RS.evPickTouched = false;
  if (!RS.evPickTouched) { evStartPick.set(shown.s); evEndPick.set(shown.e); }
  var pending = evPending(), staged = evStaged();
  $("ev-box").classList.toggle("dirty", pending || staged);
  $("ev-apply").disabled = !pending && !!d;
  var st = $("ev-status");
  if (st.classList.contains("bad")) { /* a refusal stays until the times are changed */ }
  else if (pending) { st.className = "ev-status unsaved"; st.textContent = "Press Apply to use these times."; }
  else if (staged) { st.className = "ev-status unsaved"; st.textContent = "Applied. Press Save all at the bottom to save them."; }
  else if (!saved) { st.className = "ev-status unsaved"; st.textContent = "Not set yet. Pick the event times, then press Apply."; }
  else if (st.className.indexOf("ok") < 0) { st.className = "ev-status"; st.textContent = ""; }
  var len = d ? d.e - d.s : 0;
  $("ev-summary").textContent = d ? rsDayName(d.s) + ", " + hmU(d.s) + " → " + rsDayName(d.e) + ", " + hmU(d.e) + " · " + Math.floor(len / 60) + " h" + (len % 60 ? " " + len % 60 + " min" : "") + (staged ? " · unsaved" : "") : "";
  $("ev-guest").textContent = saved ? fullWhen(eventWin()) : "nothing yet";
}
// Apply: times that can never work (end before start, longer than 12 hours) are refused on the spot and nothing is
// staged until they're fixed. Anything else is staged, and Save all at the bottom saves it with the activity changes.
$("ev-apply").addEventListener("click", function () {
  var d = evPicked(), p = rsEvCheck(d), st = $("ev-status");
  if (p) { st.className = "ev-status bad"; st.textContent = "Can't apply: " + p; shake(st); return; }
  RS.evDraft = sameEv(d, rsEv()) ? null : d; RS.evPickTouched = false;
  st.className = "ev-status";
  rsTap({ instant: true, force: true });
});

// ---- Running late ----
function rsLateMoves(list) {
  if (!RS.late) return [];
  var after = RS.late.after === "now" ? rsNow() : rsCur(rsByIdIn(list, RS.late.after) || { s: rsNow() }).s;
  return list.filter(function (a) { return rsState(a) === "next" && rsInWindow(rsCur(a)) && (rsCur(a).s > after || a.id === RS.late.after); })
    .sort(function (x, y) { return rsCur(x).s - rsCur(y).s; });
}
function renderLate(box, list) {
  var moves = rsLateMoves(list), skip = list.filter(function (a) { return rsInWindow(rsCur(a)) && rsState(a) !== "next"; }), ev = rsEvNow();
  box.append(el("p", "eyebrow", "Running late"), el("h3", null, "Push the rest of the night"));
  var f1 = el("label", "field", "Move everything starting after");
  var sel = el("select", "sel-box"); sel.append(new Option("Now (" + hm(rsNow()) + ")", "now"));
  list.filter(function (a) { return rsState(a) === "next" && rsInWindow(rsCur(a)); }).sort(function (p, q) { return rsCur(p).s - rsCur(q).s; })
    .forEach(function (a) { sel.append(new Option(a.t + " (" + hmShort(rsCur(a).s) + ") and after", a.id)); });
  sel.value = RS.late.after; sel.addEventListener("change", function () { RS.late.after = sel.value; rsTap({ instant: true }); });
  f1.append(sel); box.append(f1);
  var f2 = el("div", "field", "By"), seg = el("div", "seg");
  [5, 10, 15, 30, 60].forEach(function (n) { var b = el("span", RS.late.by === n ? "on" : "", n + (n === 60 ? " min" : "")); b.addEventListener("click", function () { RS.late.by = n; rsTap({ instant: true }); }); seg.append(b); });
  f2.append(seg); box.append(f2);
  box.append(el("span", "rs-h moving", moves.length + " WILL MOVE"));
  var ul = el("ul", "late-list");
  moves.forEach(function (a) { var c = rsCur(a); ul.append(elh("li", null, "<span>" + esc(a.t) + "</span><span class='to'><s>" + hmShort(c.s) + "</s>→ " + hmShort(c.s + RS.late.by) + "</span>")); });
  if (!moves.length) ul.append(elh("li", null, "<span class='meta'>Nothing coming up to move.</span>"));
  box.append(ul);
  // Past the end: warn (allowed while staging), with a one-step fix.
  var past = ev ? moves.filter(function (a) { return rsCur(a).e + RS.late.by > ev.e; }) : [];
  if (past.length) {
    var w = el("div", "warn-box", "⚠ " + past.map(function (a) { return a.t; }).join(", ") + " would end after the event's " + hmU(ev.e) + " finish. You can still add the change, but Save all will need the event extended.");
    var need = Math.ceil(Math.max.apply(null, past.map(function (a) { return rsCur(a).e + RS.late.by; })) / 15) * 15;
    var x = el("button", "btn small", "Extend the event to " + hmU(need)); x.type = "button"; x.style.marginTop = "8px";
    if (need - rsEvNow().s > EVENT_MAX_MIN) { x.disabled = true; w.append(el("div", null, "Extending to " + hmU(need) + " would make the event longer than 12 hours.")); }
    x.addEventListener("click", function () { RS.evDraft = { s: rsEvNow().s, e: need }; rsToast("Event end set to " + hmU(need) + " in Event times. It saves with Save all."); rsTap({ instant: true, force: true }); });
    w.append(el("br"), x); box.append(w);
  }
  box.append(el("span", "rs-h", "SKIPPED: LIVE OR FINISHED"));
  var ul2 = el("ul", "late-list skip");
  skip.forEach(function (a) { ul2.append(elh("li", null, "<span>" + esc(a.t) + "</span><span class='meta'>" + (rsState(a) === "live" ? "LIVE" : "Finished") + "</span>")); });
  box.append(ul2);
  var row = el("div", "rs-row");
  var add = el("button", "btn", "Add to changes"); add.type = "button"; add.disabled = !moves.length;
  add.addEventListener("click", function () { var by = RS.late.by; moves.forEach(function (a) { var c = rsCur(a); RS.drafts[a.id] = { s: c.s + by, e: c.e + by, v: c.v }; }); RS.late = null; rsToast(moves.length + " activities staged. Press Save all to apply."); rsTap({ flash: moves.map(function (a) { return a.id; }) }); });
  var cancel = el("button", "btn ghost", "Cancel"); cancel.type = "button"; cancel.addEventListener("click", function () { RS.late = null; rsTap(); });
  row.append(add, cancel); box.append(row, el("p", "meta", "Nothing moves for guests until you press Save all."));
}

// ---- Editing controls (laptop side panel and phone row) ----
function rsSuggestedStart(a) {
  var c = rsCur(a), ev = rsEvNow(); if (!ev || !rsOutside(c)) return c.s;
  var tod = ((c.s % 1440) + 1440) % 1440;
  for (var d = Math.floor(ev.s / 1440); d <= Math.floor(ev.e / 1440); d++) { var s0 = d * 1440 + tod; if (s0 >= ev.s && s0 + (c.e - c.s) <= ev.e) return s0; }
  return ev.s;
}
function rsControls(a, list) {
  var c = rsCur(a), box = el("div", "rs-controls"), ev = rsEvNow(), now = rsNow();
  box.setAttribute("data-ctl", a.id);
  function row(which) {
    var r = el("div", "time-row"); r.setAttribute("data-row", which);
    var val = which === "s" ? c.s : c.e, was = which === "s" ? a.s : a.e;
    r.append(el("span", "lbl", which === "s" ? "Start" : "End"), elh("span", null, "<span class='time-big" + (val !== was ? " changed" : "") + "'>" + hm(val) + "</span>" + (val !== was ? " <span class='was'>was " + hmShort(was) + "</span>" : "")));
    var br = el("div", "btn-row");
    [-5, 5, 10].forEach(function (d) {
      var b = el("button", "btn ghost small", (d > 0 ? "+" : "−") + Math.abs(d)); b.type = "button";
      b.addEventListener("click", function () { var k = rsCur(a); which === "s" ? rsSetDraft(a, k.s + d, k.e + d) : rsSetDraft(a, k.s, k.e + d); });
      br.append(b);
    });
    var n = el("button", which === "s" ? "btn ghost small" : "danger small", which === "s" ? "Start now" : "End now"); n.type = "button";
    if (which === "e") n.disabled = !(now >= rsCur(a).s && now < rsCur(a).e);
    n.addEventListener("click", function () { var k = rsCur(a); which === "s" ? rsSetDraft(a, now, now + (k.e - k.s)) : rsSetDraft(a, k.s, now); });
    br.append(n); r.append(br); return r;
  }
  box.append(row("s"), row("e"));
  // Venue: a draft like the times.
  var vr = el("div", "time-row"), vs = el("select", "sel-box"); vr.setAttribute("data-row", "v");
  settings.venues.forEach(function (v) { vs.append(new Option(v.name || "Untitled venue", v.id)); });
  if (!VENUES[c.v]) vs.append(new Option(c.v + " (removed)", c.v));
  vs.value = c.v; vs.setAttribute("aria-label", "Venue");
  vs.addEventListener("change", function () { var k = rsCur(a); RS.drafts[a.id] = { s: k.s, e: k.e, v: vs.value }; if (!rsChanged(a)) delete RS.drafts[a.id]; rsTap({ ctl: { id: a.id, prev: k } }); });
  var vcell = el("span"); vcell.append(vs);
  if (c.v !== a.v) vcell.append(el("span", "was", "was " + rsVName(a.v)));
  vr.append(el("span", "lbl", "Venue"), vcell); box.append(vr);
  // Exact date and time: must land fully inside the event. The section folds; it starts open only for an activity
  // outside event hours, where picking a time inside the event is the fix. Its open/closed state is kept per activity.
  var s0 = rsSuggestedStart(a), len = c.e - c.s, wrap = el("div", "exact");
  if (RS.exactOpen[a.id] == null) RS.exactOpen[a.id] = !!(ev && rsOutside(c));
  var open = RS.exactOpen[a.id];
  var headRow = el("div", "exact-headrow");
  var head = el("button", "exact-head", (open ? "▾ " : "▸ ") + (ev && rsOutside(c) ? "Set the date and time (suggested to fit the event)" : "Or set an exact date and time"));
  head.type = "button"; head.setAttribute("aria-expanded", String(open));
  head.addEventListener("click", function () { RS.exactOpen[a.id] = !open; rsTap({ instant: true }); });
  headRow.append(head);
  // "Unsaved change" sits on the heading's line, so it shows whether the section is open or folded.
  if (rsChanged(a)) headRow.append(el("span", "unsaved", "Unsaved change"));
  wrap.append(headRow);
  if (open) {
    var sp = dateTimePick(s0, "Start", function () { var ns = sp.get(); if (ns != null) ep.set(ns + len); });
    var ep = dateTimePick(s0 + len, "End");
    if (ev) [sp, ep].forEach(function (p) { p.limitDates(mToInput(ev.s).slice(0, 10), mToInput(ev.e).slice(0, 10)); });
    var l1 = el("div", "field", "Starts"), l2 = el("div", "field", "Ends"); l1.append(sp); l2.append(ep);
    var go = el("button", "btn small soft", "Apply"); go.type = "button";
    go.addEventListener("click", function () {
      var ns = sp.get(), ne = ep.get();
      if (ns == null || ne == null) { rsToast("Pick a date and time for both start and end."); return; }
      if (ev && rsOutside({ s: ns, e: ne })) { rsToast("Blocked: pick times within the event (" + rsDayName(ev.s) + " " + hmU(ev.s) + " – " + rsDayName(ev.e) + " " + hmU(ev.e) + ")."); return; }
      rsSetDraft(a, ns, ne, null, true);
    });
    var acts = el("div", "rs-row"); acts.append(go);
    if (rsChanged(a)) {
      var undo = el("button", "btn ghost small", "Undo"); undo.type = "button";
      undo.addEventListener("click", function () { var k = rsCur(a); delete RS.drafts[a.id]; rsTap({ ctl: { id: a.id, prev: k } }); });
      acts.append(undo);
    }
    var g = el("div", "exact-grid"); g.append(l1, l2); wrap.append(g, acts);
  }
  box.append(wrap);
  if (ev && rsOutside(c)) box.append(el("div", "block-box", "⏰ " + rsOutsideText(c) + "."));
  return box;
}

// ---- Laptop timeline ----
function renderTimeline(list) {
  var tl = $("rs-tl"); tl.replaceChildren();
  var ev = rsEvNow(), inEv = list.filter(function (a) { return rsInWindow(rsCur(a)); });
  // The whole event (with 30 min either side), or every activity when event times aren't set.
  var t0 = ev ? ev.s - 30 : Math.min.apply(null, inEv.map(function (a) { return rsCur(a).s; }).concat([rsNow()])) - 30;
  var t1 = ev ? ev.e + 30 : Math.max.apply(null, inEv.map(function (a) { return rsCur(a).e; }).concat([rsNow() + 60])) + 30;
  if (!isFinite(t0) || t1 <= t0) { t0 = rsNow() - 60; t1 = rsNow() + 300; }
  var x = function (m) { return ((m - t0) / (t1 - t0)) * 100; };
  var moving = rsLateMoves(list).map(function (a) { return a.id; });
  var step = t1 - t0 > 16 * 60 ? 180 : t1 - t0 > 9 * 60 ? 120 : 60;
  tl.append(el("div", "row-label", ""));
  var axis = el("div", "axis");
  for (var m = Math.ceil(t0 / step) * step; m <= t1; m += step) { var sp = el("span", null, hm(m).replace(":00", "")); sp.style.left = x(m) + "%"; axis.append(sp); }
  tl.append(axis);
  var venueIds = settings.venues.map(function (v) { return v.id; });
  inEv.forEach(function (a) { var v = rsCur(a).v; if (venueIds.indexOf(v) < 0) venueIds.push(v); });
  venueIds.forEach(function (vid) {
    var here = inEv.filter(function (a) { return rsCur(a).v === vid; }).sort(function (p, q) { return rsCur(p).s - rsCur(q).s; });
    var lanes = [];
    here.forEach(function (a) { var c = rsCur(a), i = 0; while (lanes[i] && lanes[i].some(function (b) { var o = rsCur(b); return o.s < c.e && c.s < o.e; })) i++; (lanes[i] = lanes[i] || []).push(a); a.lane = i; });
    var lab = el("div", "row-label", rsVName(vid));
    if (!here.length) lab.append(el("span", "none", ev ? "Nothing during the event" : "Nothing scheduled"));
    tl.append(lab);
    var box = el("div", "lane-box"); box.style.height = Math.max(1, lanes.length) * 52 + 12 + "px";
    box.style.setProperty("--hour", (step / (t1 - t0)) * 100 + "%"); box.style.backgroundPosition = x(Math.ceil(t0 / step) * step) + "% 0";
    here.forEach(function (a) {
      var st = rsState(a), c = rsCur(a), top = 6 + a.lane * 52 + "px";
      var b = el("div", "bar s-" + a.style + (rsOutside(c) ? " outside" : "") + (RS.selected === a.id ? " sel" : "") + (st === "done" ? " done" : ""));
      b.setAttribute("data-id", a.id);
      var bs = Math.max(a.s, t0), be = Math.min(a.e, t1);
      if (c.v !== a.v) { bs = Math.max(c.s, t0); be = Math.min(c.e, t1); }
      b.style.left = x(bs) + "%"; b.style.width = "calc(" + Math.max(0.4, x(be) - x(bs)) + "% - 3px)"; b.style.top = top;
      // The block's width as a share of the row, so the selected stripe can be a third of the block itself.
      b.style.setProperty("--bw", Math.max(0.4, x(be) - x(bs)));
      var label = "<b>" + esc(a.t) + (c.v !== a.v ? " ↳" : "") + "</b><span class='tag'>" + (st === "live" ? "LIVE · " : st === "done" ? "Finished · " : "") + hmShort(c.s) + "–" + hmShort(c.e) + "</span>";
      var pickA = function () { RS.selected = a.id; RS.late = null; rsTap({ instant: true }); };
      b.addEventListener("click", pickA);
      if (be - bs < 40) { b.classList.add("narrow"); var sl = elh("div", "side-label", label); sl.setAttribute("data-lid", a.id); sl.style.left = "calc(" + x(Math.min(t1, Math.max(a.e, c.e))) + "% + 8px)"; sl.style.top = top; sl.addEventListener("click", pickA); box.append(b, sl); }
      else { b.innerHTML = label; box.append(b); }
      if (rsChanged(a) && (c.s !== a.s || c.e !== a.e)) { var g = el("div", "ghost-bar"); g.style.left = x(Math.max(c.s, t0)) + "%"; g.style.width = "calc(" + (x(Math.min(c.e, t1)) - x(Math.max(c.s, t0))) + "% - 3px)"; g.style.top = top; box.append(g); }
      if (moving.indexOf(a.id) >= 0) { var mv = el("div", "moved-bar"); var ms = c.s + RS.late.by, me = Math.min(c.e + RS.late.by, t1); mv.style.left = x(ms) + "%"; mv.style.width = "calc(" + (x(me) - x(ms)) + "% - 3px)"; mv.style.top = top; box.append(mv); }
    });
    tl.append(box);
  });
  if (ev) {
    var lead = el("div", "edge"); lead.style.left = "150px"; lead.style.width = "calc((100% - 150px) * " + x(ev.s) / 100 + ")"; tl.append(lead);
    var tail = el("div", "edge"); tail.style.left = "calc(150px + (100% - 150px) * " + x(ev.e) / 100 + ")"; tail.style.right = "0"; tl.append(tail);
  }
  for (var mid = Math.ceil((t0 + 1) / 1440) * 1440; mid < t1; mid += 1440) { var mk = el("div", "midnight"); mk.setAttribute("data-m", mid); mk.setAttribute("data-label", "Midnight · " + rsDayName(mid)); mk.style.left = "calc(150px + (100% - 150px) * " + x(mid) / 100 + ")"; tl.append(mk); }
  var now = rsNow();
  // Keep the Now and Midnight labels (in the strip above the timeline) apart: the one on the left flips its label leftwards.
  tl.querySelectorAll(".midnight").forEach(function (mk) { var mid = Number(mk.getAttribute("data-m")); if (now > mid && x(now) - x(mid) < 14) mk.classList.add("flip"); });
  var nowFlip = false; for (var mm = Math.ceil((t0 + 1) / 1440) * 1440; mm < t1; mm += 1440) if (now < mm && x(mm) - x(now) < 14) nowFlip = true;
  if (now > t0 && now < t1) { var nl = el("div", "now-line" + (nowFlip ? " flip" : "")); nl.setAttribute("data-label", "NOW " + hmShort(now)); nl.style.left = "calc(150px + (100% - 150px) * " + x(now) / 100 + ")"; tl.append(nl); }
  // Activities entirely outside event hours, flagged below.
  var away = list.filter(function (a) { return !rsInWindow(rsCur(a)); }), holder = $("rs-away"); holder.replaceChildren();
  if (away.length) {
    var ol = el("div", "outside-list");
    ol.append(el("span", "out-flag", "⚠ OUTSIDE EVENT HOURS (" + away.length + "): guests still see these. Move them into the event or delete them."));
    away.forEach(function (a) {
      var c = rsCur(a), it = elh("div", "oi" + (RS.selected === a.id ? " sel" : ""), "<span><b>" + esc(a.t) + "</b> · " + esc(rsVName(c.v)) + "</span><span class='meta'>" + rsDayName(c.s) + " " + hmShort(c.s) + "–" + hmShort(c.e) + "</span>");
      it.setAttribute("data-id", a.id);
      it.addEventListener("click", function () { RS.selected = a.id; RS.late = null; rsTap({ instant: true }); });
      ol.append(it);
    });
    holder.append(ol);
  }
}
function renderRsSide(list) {
  var side = $("rs-side"); side.replaceChildren();
  if (RS.late) { renderLate(side, list); return; }
  var a = RS.selected && rsByIdIn(list, RS.selected);
  if (!a) { side.append(el("p", "meta", "Click an activity on the timeline to change its time or venue.")); return; }
  var st = rsState(a);
  var info = el("p", "meta rs-info", rsVName(rsCur(a).v) + " · " + a.type + " · " + rsDayName(rsCur(a).s) + " · " + (st === "live" ? "LIVE now" : st === "done" ? "Finished" : "Coming up"));
  info.style.margin = "0";
  var schedNote = a.sched && (a.sched.s !== rsCur(a).s || a.sched.e !== rsCur(a).e) ? el("p", "meta sched-note", "Originally scheduled " + hmShort(a.sched.s) + " – " + hmShort(a.sched.e)) : null;
  side.append(el("h3", null, a.t), info);
  if (schedNote) side.append(schedNote);
  side.append(el("p", "meta rs-hint", "Moving the start keeps the length the same. Use Running late to move several at once."), rsControls(a, list));
}
// ---- Phone list ----
function renderRsPhone(list) {
  var pl = $("rs-list"); pl.replaceChildren();
  var ev = rsEvNow(), sortedList = list.slice().sort(function (p, q) { return rsCur(p).s - rsCur(q).s; });
  function item(a) {
    var st = rsState(a), c = rsCur(a), open = RS.open === a.id;
    var it = el("div", "pitem s-" + a.style + (open ? " open" : "") + (rsChanged(a) ? " moved" : ""));
    it.setAttribute("data-rs", a.id);
    var head = elh("div", null, "<b>" + esc(a.t) + "</b><br><span class='t'>" + hmShort(c.s) + " – " + hmShort(c.e) + "</span> <span class='v'>· " + esc(rsVName(c.v)) + "</span>");
    var toggle = function () { RS.open = open ? null : a.id; rsTap(); };
    var sw = el("span", "sw s-" + a.style), tag = el("span", "st " + (st === "live" ? "live" : ""), st === "live" ? "LIVE" : st === "done" ? "✓ Done" : a.type);
    var ph = el("div", "phead"); ph.append(sw, head, tag); ph.addEventListener("click", toggle);
    it.append(ph);
    if (ev && rsOutside(c)) it.append(el("span", "out", "⏰ " + rsOutsideText(c)));
    if (a.sched && (a.sched.s !== c.s || a.sched.e !== c.e)) it.append(el("span", "sch", "Originally " + hmShort(a.sched.s) + " – " + hmShort(a.sched.e)));
    if (rsChanged(a) && !open) it.append(el("span", "mv", "Changed from " + hmShort(a.s) + " – " + hmShort(a.e) + (c.v !== a.v ? " at " + rsVName(a.v) : "") + " (unsaved)"));
    if (open) { var ed = el("div", "edit"); ed.append(rsControls(a, list)); it.append(ed); }
    return it;
  }
  var inEv = sortedList.filter(function (a) { return rsInWindow(rsCur(a)); }), away = sortedList.filter(function (a) { return !rsInWindow(rsCur(a)); });
  var done = inEv.filter(function (a) { return rsState(a) === "done"; }), live = inEv.filter(function (a) { return rsState(a) === "live"; }), next = inEv.filter(function (a) { return rsState(a) === "next"; });
  var eh = el("div", "group-h clickable", "Earlier · " + done.length + " finished " + (RS.showDone ? "▾" : "▸"));
  eh.addEventListener("click", function () { RS.showDone = !RS.showDone; rsTap(); });
  pl.append(eh);
  if (RS.showDone) done.forEach(function (a) { pl.append(item(a)); });
  pl.append(el("div", "group-h now", "On now · " + hm(rsNow())));
  live.forEach(function (a) { pl.append(item(a)); });
  if (!live.length) pl.append(el("p", "meta", "Nothing on right now."));
  pl.append(el("div", "group-h", "Coming up"));
  var lastDay = Math.floor(rsNow() / 1440);
  next.forEach(function (a) { var dday = Math.floor(rsCur(a).s / 1440); if (dday > lastDay) { pl.append(el("div", "group-h", "Midnight · " + rsDayName(dday * 1440))); lastDay = dday; } pl.append(item(a)); });
  if (away.length) { var oh = el("div", "group-h out-h", "⚠ Outside event hours (" + away.length + ")"); pl.append(oh); away.forEach(function (a) { pl.append(item(a)); }); }
}
function renderRsSheet(list) {
  var h = $("rs-sheet"); h.replaceChildren();
  if (!RS.late || innerWidth > 760) return;
  var dim = el("div", "dim"); dim.addEventListener("click", function () { RS.late = null; rsTap(); });
  var sheet = el("div", "sheet"); renderLate(sheet, list);
  // It slides up from the bottom when it opens (not on every redraw while it's open).
  if (RS.sheetOpening && canMove()) { sheet.classList.add("sheet-in"); dim.classList.add("dim-in"); }
  h.append(dim, sheet);
}

// ---- Save all ----
function rsViolations(list, win) {
  return list.filter(function (a) { if (!rsChanged(a)) return false; var d = RS.drafts[a.id]; return d.s < Math.min(a.s, win.s) || d.e > Math.max(a.e, win.e); });
}
function rsSaveAll(list, newEv) {
  var changed = list.filter(rsChanged), batch = writeBatch(db);
  changed.forEach(function (a) {
    var d = RS.drafts[a.id], f = { updatedAt: serverTimestamp() };
    if (d.s !== a.s) f.start = Timestamp.fromMillis(toMs(d.s));
    if (d.e - d.s !== a.e - a.s) f.length = d.e - d.s;
    if (f.start || f.length) Object.assign(f, rememberSchedule(byId(a.id)));
    if (d.v !== a.v) f.venue = d.v;
    batch.update(doc(db, "activities", a.id), f);
  });
  // New event times save in the same step, so neither can land without the other (rule 8).
  if (newEv) {
    var ref = doc(db, "site", "settings"), ef = { eventStart: Timestamp.fromMillis(toMs(newEv.s)), eventEnd: Timestamp.fromMillis(toMs(newEv.e)), updatedAt: serverTimestamp() };
    if (settingsExists) batch.update(ref, ef);
    else batch.set(ref, Object.assign({ mark: settings.mark, eyebrow: settings.eyebrow, brand: settings.brand, tagline: settings.tagline, bulbs: settings.bulbs, nav: cleanNav(settings.nav), venues: cleanVenues(settings.venues) }, ef));
  }
  var n = changed.length, st = $("rs-status");
  st.textContent = "Saving…"; st.className = "unsaved";
  var slow = setTimeout(function () { st.textContent = "Still saving… check your signal. Your changes are kept and save when you're back online."; st.className = "bar-block"; }, 8000);
  batch.commit().then(function () {
    clearTimeout(slow);
    // Clear the drafts we just saved; the database snapshot redraws the timeline.
    changed.forEach(function (a) { delete RS.drafts[a.id]; });
    if (newEv) RS.evDraft = null;
    rsToast((n ? "Saved " + n + " change" + (n > 1 ? "s" : "") + (newEv ? " and the new event times" : "") : "Saved the new event times") + ". Every screen shows it now.");
    renderRunSheet(true);
  }, function (err) { clearTimeout(slow); st.textContent = "Could not save (" + errText(err) + "). Your changes are still here; try again."; st.className = "bar-block"; shake(st); });
}
function renderRsSaveBar() {
  var list = rsActs(), n = list.filter(rsChanged).length, bar = $("rs-savebar"); bar.replaceChildren();
  var saved = rsEv(), ev = rsEvNow(), evDirty = evStaged(), any = n || evDirty;
  // Changed activities must sit inside the applied event hours (one already outside may only move closer), and new
  // event times can't leave activities that are inside the saved hours outside (rule 8, checked from both sides).
  var moved = ev ? rsViolations(list, ev) : [];
  var stranded = evDirty && saved ? list.filter(function (a) { var c = rsCur(a); return moved.indexOf(a) < 0 && !rsOutside(c, saved) && rsOutside(c, ev); }) : [];
  var bad = moved.concat(stranded);
  var status = el("span", "unsaved"); status.id = "rs-status";
  if (bad.length) {
    status.className = "bar-block";
    if (!RS.blocked) setTimeout(function () { shake($("rs-status")); }, 0);
    status.textContent = "⏰ Can't save: " + bad.map(function (a) { return a.t; }).join(", ") + " would be outside event hours (" + hmU(ev.s) + " – " + hmU(ev.e) + ").";
    bar.append(status);
    var pos = bad.map(rsCur);
    var need = { s: Math.floor(Math.min(ev.s, Math.min.apply(null, pos.map(function (c) { return c.s; }))) / 15) * 15, e: Math.ceil(Math.max(ev.e, Math.max.apply(null, pos.map(function (c) { return c.e; }))) / 15) * 15 };
    if (need.e - need.s <= EVENT_MAX_MIN) {
      var ext = el("button", "btn", (need.s < ev.s ? "Start event at " + hmU(need.s) + (need.e > ev.e ? ", end at " + hmU(need.e) : "") : "Extend event to " + hmU(need.e)) + " & save all"); ext.type = "button";
      ext.addEventListener("click", function () { rsSaveAll(list, need); });
      bar.append(ext);
    } else bar.append(el("span", "bar-block", "Extending would make the event longer than 12 hours. Move them back instead."));
  } else {
    status.textContent = n ? n + " unsaved change" + (n > 1 ? "s" : "") + (evDirty ? " + new event times" : "") : evDirty ? "New event times (unsaved)" : "No unsaved changes";
    bar.append(status);
    var save = el("button", "btn", "Save all"); save.type = "button"; save.disabled = !any;
    save.addEventListener("click", function () { rsSaveAll(list, evDirty ? RS.evDraft : null); });
    bar.append(save);
  }
  var cancel = el("button", "btn ghost", "Cancel"); cancel.type = "button"; cancel.disabled = !any;
  cancel.addEventListener("click", function () { var was = Object.keys(RS.drafts); RS.drafts = {}; RS.evDraft = null; rsTap({ flash: was, force: true }); });
  bar.append(cancel);
  bar.toggleAttribute("data-clean", !any);
  RS.blocked = !!bad.length;
}

// The run sheet counts as one edit area for the "unsaved changes" guard.
var rsArea = {
  statusId: "rs-status", shown: function () { return !$("view-runsheet").hidden; },
  dirty: function () { var list = rsActs(); return list.some(rsChanged) || evStaged() || evPending(); },
  discard: function () { RS.drafts = {}; RS.evDraft = null; RS.late = null; RS.evPickTouched = false; },
  redraw: function () { renderRunSheet(true); },
  mark: function () {}
};
areas.push(rsArea);

function placeRsToolbar() {
  var tb = $("rs-toolbar"), wide = innerWidth > 760;
  if (wide && tb.parentNode !== $("rs-tl-panel")) { $("rs-tl-panel").prepend(tb); tb.classList.add("in-tl"); }
  if (!wide && tb.parentNode === $("rs-tl-panel")) { $("rs-list").before(tb); tb.classList.remove("in-tl"); }
}
function renderRunSheet(forceEvent) {
  if ($("view-runsheet").hidden) return;
  // Drafts for activities that no longer exist are dropped.
  var list = rsActs();
  Object.keys(RS.drafts).forEach(function (id) { if (!rsByIdIn(list, id)) delete RS.drafts[id]; });
  placeRsToolbar();
  renderEventPanel(forceEvent);
  // Until event times are saved, the run sheet stays blank apart from the Event times panel (LOGIC-RULES EVT-2).
  var blank = !rsEvNow();
  $("rs-empty").hidden = !blank;
  ["rs-toolbar", "rs-list", "rs-savebar"].forEach(function (id) { $(id).hidden = blank; });
  document.querySelector("#view-runsheet .rs-layout").hidden = blank;
  if (blank) { RS.late = null; $("rs-sheet").replaceChildren(); return; }
  $("rs-now").textContent = "● Now " + hm(rsNow());
  renderTimeline(list); renderRsSide(list); renderRsPhone(list); renderRsSheet(list); renderRsSaveBar();
}

// ---- Motion on taps (MOTION-RULES.md) ----
// Taps that move things slide to the new layout, then what changed glows. The slide moves the real blocks and list items
// from where they were to where they are now (each is matched by its activity id), so taps keep working while they move.
// Repeat-tap buttons and selecting change instantly. Database updates, Save and window resizes redraw instantly.
// o: { instant, force, flash: [activity ids whose block or list item glows], ctl: { id, prev } (the editing controls glow) }
var RS_SLIDE_MS = 250;
function rsKeyed() {
  var out = {};
  document.querySelectorAll("#rs-tl .bar[data-id], #rs-tl .side-label[data-lid], #rs-away .oi[data-id], #rs-list .pitem[data-rs]").forEach(function (n) {
    var k = n.getAttribute("data-id") ? (n.closest("#rs-away") ? "o" : "b") + n.getAttribute("data-id") : n.getAttribute("data-lid") ? "l" + n.getAttribute("data-lid") : "p" + n.getAttribute("data-rs");
    if (n.getClientRects().length) out[k] = n;
  });
  return out;
}
// Where an item sits inside its own list (timeline, outside-hours list or phone list), not on the screen.
function rsPlace(n) {
  var box = n.closest("#rs-tl, #rs-away, #rs-list"), r = n.getBoundingClientRect(), c = box ? box.getBoundingClientRect() : { left: 0, top: 0 };
  return { left: r.left - c.left, top: r.top - c.top };
}
function rsTap(o) {
  o = o || {};
  var follow = o.ctl ? o.ctl.id : o.flash && o.flash.length ? o.flash[0] : null;
  var draw = function () { renderRunSheet(o.force); if (!follow) follow = RS.open; };
  if (o.instant || !canMove()) { draw(); rsGlow(o); rsFollow(follow); return; }
  // First: where everything is now, and whether the Running late panel and phone editors are open.
  var before = {}, was = rsKeyed();
  Object.keys(was).forEach(function (k) { before[k] = rsPlace(was[k]); });
  var oldSheet = $("rs-sheet").querySelector(".sheet"), openBefore = document.querySelector("#rs-list .pitem.open");
  RS.sheetOpening = !oldSheet;
  var sheetGhost = oldSheet ? $("rs-sheet").cloneNode(true) : null;
  draw();
  RS.sheetOpening = false;
  // Last, invert, play: each item starts where it was and slides to where it is now.
  var now = rsKeyed();
  Object.keys(now).forEach(function (k) {
    var n = now[k], r = rsPlace(n), b = before[k];
    if (!b) { if (Object.keys(before).length) replayClass(n, "panel-in"); return; }
    var dx = b.left - r.left, dy = b.top - r.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    n.style.transition = "none"; n.style.transform = "translate(" + dx + "px, " + dy + "px)";
    void n.offsetWidth;
    n.style.transition = "transform " + RS_SLIDE_MS + "ms ease-in-out"; n.style.transform = "";
    setTimeout(function () { n.style.transition = ""; }, RS_SLIDE_MS + 20);
  });
  // A phone editor that just opened slides in.
  var openNow = document.querySelector("#rs-list .pitem.open .edit");
  if (openNow && (!openBefore || openBefore.getAttribute("data-rs") !== openNow.parentNode.getAttribute("data-rs"))) replayClass(openNow, "panel-in");
  // The Running late panel slides back down when it closes: a copy of it plays the slide, then goes.
  if (sheetGhost && !$("rs-sheet").querySelector(".sheet")) {
    sheetGhost.removeAttribute("id"); sheetGhost.className = "rs-sheet-out";
    document.querySelector("#view-runsheet").append(sheetGhost);
    setTimeout(function () { sheetGhost.remove(); }, RS_SLIDE_MS);
  }
  // Slide first, then glow (rule 6).
  setTimeout(function () { rsGlow(o); rsFollow(follow); }, RS_SLIDE_MS);
}
// The glow appears where you were working (rule 4): the editing controls' changed rows, or the moved blocks and list items.
function rsGlow(o) {
  (o.flash || []).forEach(function (id) {
    document.querySelectorAll('#rs-tl .bar[data-id="' + id + '"], #rs-away .oi[data-id="' + id + '"], #rs-list .pitem[data-rs="' + id + '"]').forEach(glow);
  });
  if (o.ctl) {
    var a = rsByIdIn(rsActs(), o.ctl.id); if (!a) return;
    var c = rsCur(a), p = o.ctl.prev;
    // The glow is on the changed time itself. A venue change doesn't glow: you're already looking at the dropdown.
    [["s", c.s !== p.s], ["e", c.e !== p.e]].forEach(function (r) {
      if (r[1]) document.querySelectorAll('[data-ctl="' + a.id + '"] [data-row="' + r[0] + '"] .time-big').forEach(glowText);
    });
  }
}
// On a phone, keep the activity being edited in view if the list re-sorted it off screen.
function rsFollow(id) {
  if (!id || innerWidth > 760) return;
  var it = $("rs-list").querySelector('[data-rs="' + id + '"]'); if (!it) return;
  var r = it.getBoundingClientRect();
  if (r.top < 60 || r.top > innerHeight - 100) it.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
}
$("rs-late-btn").addEventListener("click", function () { RS.late = { after: "now", by: 15 }; RS.selected = null; rsTap(); });
addEventListener("resize", function () { if (!$("view-runsheet").hidden) renderRunSheet(); });

// ---------- Bulbs ----------
function fillBulbs() {
  document.querySelectorAll(".bulbs").forEach(function (row) {
    // A hidden sign has no width; leave its bulbs alone until it's on screen again.
    if (!row.clientWidth) return;
    var size = Math.max(8, Math.min(16, window.innerWidth * 0.008));
    var want = Math.max(6, Math.floor(row.clientWidth / (size * 2.4)) + 1);
    if (row.children.length === want) return;
    row.replaceChildren();
    for (var i = 0; i < want; i++) row.append(document.createElement("i"));
  });
}

// ---------- Floating badge ----------
var fpClosed = false;
function updateFloat(now) {
  var d = draw(), box = $("float-pot"), h = (location.hash || "").slice(1);
  var onPage = $("view-admin").hidden && $("view-gm").hidden && $("view-runsheet").hidden && !(d && h === "a-" + d.id);
  var soon = d && startOf(d) - now <= 10 * MIN;
  var show = !!(d && now < endOf(d) && onPage && (!fpClosed || soon));
  box.hidden = !show; if (!show) return;
  $("fp-link").href = "#a-" + d.id;
  $("fp-label").textContent = d.title;
  $("fp-label").style.setProperty("--lchars", Math.max(d.title.length, 5));
  $("fp-amt").textContent = money(pot);
  $("fp-amt").style.setProperty("--chars", Math.max(money(pot).length, 5));
  $("fp-when").textContent = now >= startOf(d) ? "DRAWING" : badgeTime(startOf(d) - now);
}
$("fp-close").addEventListener("click", function () { fpClosed = true; updateFloat(Date.now()); });

// The pot counts up to its new amount when an admin raises it.
function animatePot(from, to) {
  var nums = document.querySelectorAll("[data-pot]"), j = $("pot-jump");
  if (j && to > from) { j.textContent = "+" + money(to - from); j.hidden = false; setTimeout(function () { j.hidden = true; }, 3500); }
  var show = function (v) { nums.forEach(function (n) { n.textContent = money(v); }); };
  if (reduceMotion || from == null || to <= from) { show(to); return; }
  var t0 = performance.now();
  (function step(t) { var p = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - p, 3); show(Math.round(from + (to - from) * e)); if (p < 1) requestAnimationFrame(step); })(t0);
}

// ---------- Routing ----------
var view = "";
function route(scroll) {
  var h = (location.hash || "").slice(1);
  var a = h.indexOf("a-") === 0 ? byId(h.slice(2)) : null;
  var wantsAdmin = h === "admin" || h.indexOf("gm-") === 0 || h === "runsheet";
  var rs = isAdmin && h === "runsheet";
  var gm = isAdmin && h.indexOf("gm-") === 0 ? acts.filter(function (x) { return x.id === h.slice(3) && (x.hasManager || SPECIAL[x.type]); })[0] : null;
  // Admin pages need a login; the game screen shows the login until then.
  var showAdmin = wantsAdmin && !gm && !rs;
  var next = a ? "detail:" + a.id : gm ? "gm:" + gm.id : rs ? "runsheet" : showAdmin ? "admin" : "home";
  $("view-home").hidden = next !== "home";
  $("view-detail").hidden = !a;
  $("view-admin").hidden = !showAdmin;
  $("view-gm").hidden = !gm;
  $("view-runsheet").hidden = !rs;
  $("admin-login").hidden = !(showAdmin && authKnown && !user);
  $("admin-denied").hidden = !(showAdmin && user && !isAdmin);
  $("admin-app").hidden = !(showAdmin && isAdmin);
  $("signed-in").hidden = $("admin-app").hidden; // "Logged in as … Log out" sits above the tabs on both Admin pages
  var changedView = next !== view;
  view = next;
  if (a) renderDetail(a);
  if (showAdmin && isAdmin) { if (changedView) renderAdmin(); else { fillTitleInputs(); renderNavRows(); renderVenueRows(); if (!editing || byId(editing.id)) renderActList(); else closeEditor(); } }
  if (rs) renderRunSheet(changedView);
  if (gm) { renderGM(gm); if (changedView) ["gm-time-status", "gm-win-status", "gm-pot-status", "gm-draws-status"].forEach(function (id) { ok(id, ""); }); }
  markPageBars();
  fillBulbs();
  if (scroll) {
    if (h === "programme") $("programme").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    else window.scrollTo(0, 0);
  }
  highlight();
  updateFloat(Date.now());
}
function highlight() {
  var h = (location.hash || "").slice(1), d = draw();
  var key = h === "" ? "home" : h === "admin" || h === "runsheet" || h.indexOf("gm-") === 0 ? "admin" : d && h === "a-" + d.id ? "draw" : h === "programme" ? "programme" : ticketsActs().some(function (t) { return h === "a-" + t.id; }) ? "tickets-" + h.slice(2) : "";
  document.querySelectorAll("[data-nav]").forEach(function (n) { if (n.getAttribute("data-nav") === key) n.setAttribute("aria-current", "page"); else n.removeAttribute("aria-current"); });
  if ($("draws-btn")) $("draws-btn").classList.toggle("current", key.indexOf("tickets-") === 0);
}

// Redraw everything that shows data; called on every database change and when a game starts or ends.
var lastSig = "";
function sig(now) { return acts.map(function (a) { return a.id + stateOf(a, now); }).join("|"); }
function refresh() {
  lastSig = sig(Date.now());
  renderChrome();
  renderCards();
  route(false);
}
function tick() {
  var now = Date.now();
  if (sig(now) !== lastSig) refresh();
  document.querySelectorAll("[data-until]").forEach(function (n) {
    var left = Number(n.getAttribute("data-until")) - now, f = n.getAttribute("data-fmt");
    n.textContent = f === "words-ends" ? " ends in " + words(left) : f === "words-starts" ? "Starts in " + words(left) : f === "draw" ? "Draw in " + digits(left) : digits(left);
  });
  if (view.indexOf("gm:") === 0) { var g = gmGame(); if (g) { var left = endOf(g) - now; $("gm-left").textContent = now < startOf(g) ? "Starts in " + words(startOf(g) - now) + "." : left > 0 ? words(left) + " to go" : "Finished"; var ds = draftStart(g), de = ds + draftLen(g) * MIN; $("gm-end-now").disabled = !(now >= ds && now < de); } }
  updateFloat(now);
}

// ---------- Live connections ----------
// They pause while the page is hidden, to keep database reads (and costs) low.
var stops = [];
function connect() {
  if (stops.length) return;
  stops.push(onSnapshot(query(collection(db, "activities"), orderBy("start")), function (snap) {
    acts = snap.docs.map(toActivity).filter(function (a) { return a.start; });
    loaded = true; note("");
    refresh();
  }, function (err) {
    // No activity rules published yet reads as an empty line-up rather than an error.
    loaded = true;
    if (err && err.code === "permission-denied") { acts = []; refresh(); }
    else note("Lost connection. Reload the page.");
  }));
  stops.push(onSnapshot(doc(db, "site", "settings"), function (snap) {
    // Drafts on screen are kept apart from this (rule 2), so saved settings can always be applied.
    settingsExists = snap.exists();
    var d = snap.exists() ? snap.data() : null;
    settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    if (d) {
      ["mark", "eyebrow", "brand", "tagline"].forEach(function (k) { if (typeof d[k] === "string") settings[k] = d[k]; });
      if (typeof d.bulbs === "boolean") settings.bulbs = d.bulbs;
      settings.eventStart = toMillis(d.eventStart); settings.eventEnd = toMillis(d.eventEnd);
      if (Array.isArray(d.venues) && d.venues.length) settings.venues = d.venues.map(function (v) { return { id: String(v.id || ""), name: String(v.name || "") }; });
      if (Array.isArray(d.nav) && d.nav.length) settings.nav = d.nav.map(function (n) { return { id: String(n.id || ""), label: String(n.label || ""), href: String(n.href || ""), show: !!n.show, auto: !!n.auto }; });
    }
    setVenues(settings.venues);
    refresh();
  }, function () {}));
  stops.push(onSnapshot(doc(db, "games", GAME_ID), function (snap) {
    var d = snap.exists() ? snap.data({ serverTimestamps: "estimate" }) : null;
    var from = pot;
    pot = d && typeof d.amount === "number" ? d.amount : null;
    ticketPrice = (d && d.ticketPrice) || "";
    potDrawTime = (d && d.drawTime) || "";
    potSetAt = d ? toMillis(d.updatedAt) : null;
    refresh();
    if (from != null && pot != null && pot !== from) animatePot(from, pot);
  }, function () {}));
}
function disconnect() { stops.forEach(function (s) { s(); }); stops = []; }

// ---------- Login ----------
var authKnown = false;
function loginError(err) {
  var code = (err && err.code) || "";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found" || code === "auth/invalid-email") return "Email or password is wrong.";
  if (code === "auth/too-many-requests") return "Too many tries. Wait a few minutes and try again.";
  if (code === "auth/network-request-failed") return "No internet connection. Check your signal and try again.";
  return "Could not log in (" + (code || "error") + ").";
}

if (!configured) {
  note("This site isn't connected to its database yet (see SETUP.md).");
} else {
  var auth = getAuth(app);
  onAuthStateChanged(auth, function (u) {
    user = u; isAdmin = false; authKnown = true;
    if (!u) { route(false); return; }
    $("who").textContent = $("rs-who").textContent = u.email || "";
    $("denied-email").textContent = u.email || "";
    getDoc(doc(db, "managers", u.uid)).then(function (me) { isAdmin = me.exists(); route(false); }, function () {
      bad("login-status", "Could not check your access. Try again.");
      route(false);
    });
  });
  $("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    $("login-btn").disabled = true;
    ok("login-status", "Logging in…");
    signInWithEmailAndPassword(auth, $("l-email").value.trim(), $("l-password").value).then(function () {
      $("l-password").value = ""; ok("login-status", "");
    }, function (err) { bad("login-status", loginError(err)); }).then(function () { $("login-btn").disabled = false; });
  });
  // Logging out with unsaved changes asks first, like leaving the page (DATA-RULES rule 4).
  var doLogout = function () { closeEditor(); signOut(auth); };
  ["logout", "denied-logout", "rs-logout"].forEach(function (id) { $(id).addEventListener("click", function () { if (dirtyAreas().length) askLeave(doLogout); else doLogout(); }); });
  connect();
  document.addEventListener("visibilitychange", function () { if (document.hidden) disconnect(); else connect(); });
}

renderChrome();
renderCards();
route(true);
setInterval(tick, 1000);
// Leaving a screen with unsaved changes asks first (rule 4); Stay puts the address back.
var lastHash = location.hash;
window.addEventListener("hashchange", function () {
  if (dirtyAreas().length) {
    var target = location.hash;
    history.replaceState(null, "", lastHash || location.pathname + location.search);
    askLeave(function () { lastHash = target; location.hash = target; });
    return;
  }
  lastHash = location.hash;
  route(true);
});
window.addEventListener("resize", fillBulbs);
