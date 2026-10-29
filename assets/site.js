// LIVENITE: the card line-up, activity pages, Admin and game screens, all on one page.
// Everyone reads tonight's activities, the site settings and the 50/50 pot live from the database.
// Only admins (people on the "managers" list) can save; firestore.rules enforces that.
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { doc, getDoc, onSnapshot, collection, query, orderBy, setDoc, updateDoc, addDoc, deleteDoc, writeBatch, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { app, db, configured } from "./firebase-init.js";
import { GAME_ID } from "./config.js";
import { money as fmtMoney, parseAmount, toMillis } from "./format.js";

var MIN = 60000;
var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
var $ = function (id) { return document.getElementById(id); };

var STYLES = [
  { id: "marquee", name: "Marquee (sunflower)" },
  { id: "sunset", name: "Sunset (tangerine)" },
  { id: "wave", name: "Wave (aqua)" },
  { id: "bloom", name: "Bloom (rose)" },
  { id: "neon", name: "Neon (dark, glowing)" },
  { id: "studio", name: "Studio (dark, gold)" }
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
  [/bingo/i, "bingo"], [/karaoke|\bmic/i, "microphone"], [/tune|song|band|music|choir/i, "notes"],
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
var VENUES = { lobby: "Grand Lobby", stage: "Main Stage", lounge: "Starlight Lounge", deck: "Lido Deck" };
// "draw" is the 50/50: a special type there can only ever be one of.
// "tickets" is Draws: a ticket draw with a searchable winning-ticket list. Any number allowed; only one 50/50.
var TYPES = { game: "Game", music: "Music", social: "Social", challenge: "Challenge", draw: "50/50", tickets: "Draws" };
var SPECIAL = { draw: "50/50", tickets: "Draws" };
function otherOfType(type, except) { return acts.filter(function (x) { return x.type === type && (!except || x.id !== except.id); })[0] || null; }
function otherDraw(except) { return otherOfType("draw", except); }
function ticketsActs() { return acts.filter(function (x) { return x.type === "tickets"; }).sort(function (x, y) { return x.start - y.start; }); }
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
// Ticket numbers typed on a game screen are saved a moment after typing stops; until then this copy wins.
var slotDraft = null;

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
    host: d.host || "",
    style: d.style || "marquee",
    graphic: d.graphic || "suggest",
    hasManager: !!d.hasManager,
    manager: d.manager || "",
    winners: Array.isArray(d.winners) ? d.winners.slice() : [],
    slots: Array.isArray(d.slots) ? d.slots.map(function (s) { return { label: String(s.label || ""), ticket: String(s.ticket || ""), claimed: !!s.claimed }; }) : [],
    resultsFinal: !!d.resultsFinal
  };
  if (slotDraft && slotDraft.id === a.id) a.slots = slotDraft.slots;
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
function errText(err) { return (err && err.code) || "error"; }
function note(text) { $("conn-note").textContent = text; $("conn-note").hidden = !text; }
// Saves some fields of one activity. Every screen updates when the database confirms.
function saveFields(a, fields, statusId) {
  var f = Object.assign({}, fields, { updatedAt: serverTimestamp() });
  return updateDoc(doc(db, "activities", a.id), f).catch(function (err) {
    if (statusId) bad(statusId, "Could not save (" + errText(err) + "). Check your connection and try again.");
    throw err;
  });
}
function bad(id, text) { $(id).textContent = text; $(id).classList.add("bad"); }
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
      btn.addEventListener("click", function (e) { e.stopPropagation(); toggleDraws(menu.hidden); });
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
  menu.hidden = !open;
  if (!open) return;
  var bar = document.querySelector(".topbar").getBoundingClientRect(), r = btn.getBoundingClientRect();
  var left = Math.max(16, Math.min(r.left, innerWidth - menu.offsetWidth - 16));
  menu.style.left = (left - bar.left) + "px"; menu.style.top = (r.bottom - bar.top + 6) + "px";
}
document.addEventListener("click", function (e) { if (!$("draws-menu").hidden && !$("draws-menu").contains(e.target)) toggleDraws(false); });
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
  var widths = { marquee: 0.74, sunset: 0.66, wave: 0.62, bloom: 0.88, neon: 0.84, studio: 0.66 };
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
  else if (a.type === "tickets") { s.textContent = st === "done" ? "Results soon" : "Draw at " + clock(startOf(a)); }
  else if (a.type === "draw" && st !== "done") { s.textContent = "Draw in " + digits(startOf(a) - now); s.setAttribute("data-until", startOf(a)); s.setAttribute("data-fmt", "draw"); }
  else if (st === "next") { s.textContent = "Starts in " + words(startOf(a) - now); s.setAttribute("data-until", startOf(a)); s.setAttribute("data-fmt", "words-starts"); }
  else if (st === "done") s.textContent = "Finished";
  else s.textContent = a.len + " min";
  foot.append(s, el("span", "c-type", TYPES[a.type]));
  c.append(top, mid, foot);
  return c;
}

function renderCards() {
  var now = Date.now(), box = $("cards"); box.replaceChildren();
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
  live.forEach(function (a) { box.append(cardFor(a, now)); });
  rest.slice(0, 1).forEach(function (a) { box.append(cardFor(a, now)); });
  if (d && isD(d)) box.append(cardFor(d, now));
  rest.slice(1).forEach(function (a) { box.append(cardFor(a, now)); });
  done.forEach(function (a) { box.append(cardFor(a, now)); });
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
  if (isT) { $("d-count-k").textContent = "Status"; c.removeAttribute("data-until"); c.textContent = st === "live" ? "Drawing now" : a.resultsFinal ? "Results posted" : st === "done" ? "Results soon" : "Draw at " + clock(startOf(a)); }
}

// Numbered winning-ticket list with a search that finds your ticket.
function renderTickets(a, query) {
  var q = cleanNo(query), list = $("d-tix"), hit = null;
  var slots = a.slots || [];
  var drawn = slots.filter(function (sl) { return cleanNo(sl.ticket); }).length;
  $("d-draws-state").textContent = a.resultsFinal ? "All tickets drawn. " + drawn + " winning tickets." : drawn ? "Drawing in progress: " + drawn + " of " + slots.length + " drawn so far." : "No tickets drawn yet.";
  list.replaceChildren();
  slots.forEach(function (sl, i) {
    var t = cleanNo(sl.ticket);
    var li = el("li", sl.claimed ? "claimed" : "");
    li.append(el("span", "lbl2", slotLabel(sl, i)), t ? el("span", "num", sl.ticket) : el("span", "pending", "not drawn yet"));
    if (q && t && t === q) { li.classList.add("hit"); hit = { sl: sl, i: i }; }
    list.append(li);
  });
  var msg = $("d-search-msg");
  msg.classList.toggle("win", !!hit);
  if (!q) msg.textContent = "";
  else if (hit) msg.textContent = "Ticket " + hit.sl.ticket + " is a winner! " + slotLabel(hit.sl, hit.i) + (hit.sl.claimed ? ". This prize has been claimed." : ". Collect it at the prize desk.");
  else msg.textContent = "Ticket " + query.trim() + " isn't on the list" + (a.resultsFinal ? "." : " yet. More tickets are still being drawn.");
}
$("d-search").addEventListener("input", function () { var h = (location.hash || "").slice(1); var a = h.indexOf("a-") === 0 ? byId(h.slice(2)) : null; if (a) renderTickets(a, $("d-search").value); });
$("d-search-form").addEventListener("submit", function (e) { e.preventDefault(); });

// ---------- Admin: title section and menu ----------
var settingsTimer = null;
function saveSettingsSoon() {
  clearTimeout(settingsTimer);
  ok("a-status", "Saving…");
  settingsTimer = setTimeout(function () {
    var s = {
      mark: settings.mark.slice(0, 24), eyebrow: settings.eyebrow.slice(0, 40), brand: settings.brand.slice(0, 24),
      tagline: settings.tagline.slice(0, 80), bulbs: !!settings.bulbs,
      nav: settings.nav.map(function (n) { var o = { id: n.id, label: String(n.label).slice(0, 20), href: n.href || "", show: !!n.show }; if (n.auto) o.auto = true; return o; }),
      updatedAt: serverTimestamp()
    };
    setDoc(doc(db, "site", "settings"), s).then(function () { ok("a-status", "Saved. Every screen shows it now."); }, function (err) { bad("a-status", "Could not save (" + errText(err) + "). Try again."); });
  }, 700);
}
function fillSettingsInputs() {
  [["a-eyebrow", "eyebrow"], ["a-brand", "brand"], ["a-tagline", "tagline"], ["a-mark", "mark"]].forEach(function (p) {
    if (document.activeElement !== $(p[0])) $(p[0]).value = settings[p[1]];
  });
  $("a-bulbs").checked = settings.bulbs;
}
function renderNavRows() {
  var list = $("a-nav");
  if (list.contains(document.activeElement)) return; // don't pull the box out from under someone typing
  list.replaceChildren();
  settings.nav.forEach(function (item, i) {
    var li = el("li", "nav-row");
    var show = el("input"); show.type = "checkbox"; show.checked = item.show; show.setAttribute("aria-label", "Show " + item.label);
    show.style.cssText = "width:22px;height:22px;accent-color:var(--bulb);margin:0 6px";
    show.addEventListener("change", function () { item.show = show.checked; renderChrome(); saveSettingsSoon(); });
    var name = el("input"); name.type = "text"; name.value = item.label; name.maxLength = 20; name.setAttribute("aria-label", "Menu label");
    name.addEventListener("input", function () { item.label = name.value || "Untitled"; renderChrome(); saveSettingsSoon(); });
    if (item.auto) { name.value = "Draws (one link each, uses its name)"; name.disabled = true; }
    var up = el("button", "icon-btn", "↑"); up.type = "button"; up.setAttribute("aria-label", "Move up"); up.disabled = i === 0;
    up.addEventListener("click", function () { var t = settings.nav[i - 1]; settings.nav[i - 1] = item; settings.nav[i] = t; renderChrome(); renderNavRows(); saveSettingsSoon(); });
    var down = el("button", "icon-btn", "↓"); down.type = "button"; down.setAttribute("aria-label", "Move down"); down.disabled = i === settings.nav.length - 1;
    down.addEventListener("click", function () { var t = settings.nav[i + 1]; settings.nav[i + 1] = item; settings.nav[i] = t; renderChrome(); renderNavRows(); saveSettingsSoon(); });
    li.append(show, name, up, down); list.append(li);
  });
}
function renderAdmin() { fillSettingsInputs(); renderNavRows(); renderActList(); }
[["a-eyebrow", "eyebrow"], ["a-brand", "brand"], ["a-tagline", "tagline"], ["a-mark", "mark"]].forEach(function (p) {
  $(p[0]).addEventListener("input", function () { settings[p[1]] = $(p[0]).value; renderChrome(); saveSettingsSoon(); });
});
$("a-bulbs").addEventListener("change", function () { settings.bulbs = $("a-bulbs").checked; renderChrome(); saveSettingsSoon(); });

// ---------- Admin: activities editor ----------
var editing = null, isNew = false, delArmed = false;
function opt(sel, value, label) { var o = el("option", null, label); o.value = value; sel.append(o); }
Object.keys(TYPES).forEach(function (k) { opt($("m-type"), k, TYPES[k]); });
Object.keys(VENUES).forEach(function (k) { opt($("m-venue"), k, VENUES[k]); });
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
  sorted().forEach(function (a) {
    var li = el("li", "act-row" + (editing && editing.id === a.id ? " editing" : ""));
    var mini = el("div", "mini"); mini.append(cardFor(a, now, { static: true, heading: "h3" }));
    var n = el("div", "n");
    n.append(el("b", null, a.title), el("span", null, clock(startOf(a)) + " · " + (VENUES[a.venue] || a.venue) + " · " + a.len + " min"),
      el("span", null, (STYLES.filter(function (st) { return st.id === a.style; })[0] || { name: a.style }).name + " · " + graphicLabel(a)));
    if (a.hasManager) {
      var chipLine = el("span"); chipLine.style.marginTop = "6px";
      chipLine.append(el("span", "gm-chip", "Game manager: " + a.manager));
      if ((a.winners || []).length) chipLine.append(document.createTextNode("  " + a.winners.length + (a.winners.length === 1 ? " winner" : " winners")));
      n.append(chipLine);
    }
    var btns = el("div"); btns.style.cssText = "display:flex;flex-direction:column;gap:8px";
    var b = el("button", "btn ghost", "Edit"); b.type = "button";
    b.addEventListener("click", function () { openEditor(a); });
    btns.append(b);
    if (a.hasManager || SPECIAL[a.type]) { var g = el("a", "btn", SPECIAL[a.type] ? SPECIAL[a.type] + " screen" : "Game screen"); g.href = "#gm-" + a.id; btns.append(g); }
    li.append(mini, n, btns); list.append(li);
  });
  if (!acts.length) list.append(el("li", "meta", "No activities yet. Add one, or load the sample night to try things out."));
  $("m-clear").hidden = !acts.length;
}
function openEditor(a) {
  isNew = !a;
  editing = a || null;
  delArmed = false; $("m-delete").textContent = "Delete"; $("m-delete").hidden = isNew;
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
  $("m-venue").value = a ? a.venue : "stage";
  $("m-start").value = toLocalInput(a ? startOf(a) : Math.ceil(Date.now() / (15 * MIN)) * 15 * MIN);
  $("m-len").value = a ? a.len : 30;
  $("m-host").value = a ? a.host : "";
  $("m-hasgm").checked = !!(a && a.hasManager);
  $("m-gm").value = a ? a.manager || "" : "";
  $("m-gm-field").hidden = !$("m-hasgm").checked;
  $("m-look").value = a ? a.style : STYLES[acts.length % STYLES.length].id;
  fillGraphics(a ? a.graphic || "suggest" : "suggest");
  ok("m-status", "");
  $("m-editor").hidden = false;
  renderPreview(); renderActList();
  $("m-editor").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  $("m-title").focus({ preventScroll: true });
}
function closeEditor() { $("m-editor").hidden = true; editing = null; isNew = false; renderActList(); }
$("m-add").addEventListener("click", function () { openEditor(null); });
$("m-hasgm").addEventListener("change", function () { $("m-gm-field").hidden = !$("m-hasgm").checked; if ($("m-hasgm").checked) $("m-gm").focus(); });
$("m-cancel").addEventListener("click", closeEditor);
["m-title", "m-tag", "m-start", "m-len", "m-host"].forEach(function (id) { $(id).addEventListener("input", renderPreview); });
["m-venue", "m-look", "m-graphic"].forEach(function (id) { $(id).addEventListener("change", renderPreview); });
// Name and type drive the suggestion: refresh its label, keep whatever the admin picked.
$("m-title").addEventListener("input", function () { fillGraphics($("m-graphic").value); renderPreview(); });
$("m-type").addEventListener("change", function () { fillGraphics($("m-graphic").value); renderPreview(); });
$("m-form").addEventListener("submit", function (e) {
  e.preventDefault();
  if (!$("m-title").value.trim()) { bad("m-status", "Give the activity a name."); return; }
  if (!isFinite(new Date($("m-start").value).getTime())) { bad("m-status", "Pick a start date and time."); return; }
  if ($("m-type").value === "draw" && otherDraw(editing)) { bad("m-status", "There's already a 50/50 (" + otherDraw(editing).title + "). There can only be one."); return; }
  if ($("m-hasgm").checked && !$("m-gm").value.trim()) { bad("m-status", "Add the game manager's name, or switch the game manager off."); return; }
  var len = parseInt($("m-len").value, 10);
  if (!(len >= 5 && len <= 360)) { bad("m-status", "Length must be between 5 and 360 minutes."); return; }
  var f = formActivity();
  // A length typed in the editor is the new schedule.
  f.schedLen = null;
  var save = isNew ? addDoc(collection(db, "activities"), toDoc(f)) : setDoc(doc(db, "activities", editing.id), toDoc(f));
  ok("m-status", "Saving…");
  save.then(function () {
    closeEditor();
    ok("m-done", "Saved “" + f.title + "”. Every screen shows it now.");
  }, function (err) { bad("m-status", "Could not save (" + errText(err) + "). Try again."); });
});
$("m-delete").addEventListener("click", function () {
  if (!editing) return;
  if (!delArmed) { delArmed = true; $("m-delete").textContent = "Tap again to delete"; return; }
  var name = editing.title;
  deleteDoc(doc(db, "activities", editing.id)).then(function () {
    closeEditor();
    ok("m-done", "Deleted “" + name + "”.");
  }, function (err) { bad("m-status", "Could not delete (" + errText(err) + ")."); });
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
$("m-sample").addEventListener("click", function () {
  var hasDraw = !!draw();
  if (acts.length && !confirmTap("m-sample", "Load sample night", "Adds 12 more. Tap again")) return;
  var batch = writeBatch(db);
  // Only one 50/50, so the sample skips its own if there's one already.
  sampleNight(Date.now()).filter(function (a) { return !(hasDraw && a.type === "draw"); }).forEach(function (a) { batch.set(doc(collection(db, "activities")), toDoc(a)); });
  ok("m-done", "Loading the sample night…");
  batch.commit().then(function () { ok("m-done", "Sample night loaded. It's timed around now so something is live."); }, function (err) { bad("m-done", "Could not load the sample (" + errText(err) + ")."); });
});
$("m-clear").addEventListener("click", function () {
  if (!confirmTap("m-clear", "Clear all", "Deletes all " + acts.length + ". Tap again")) return;
  var batch = writeBatch(db);
  acts.forEach(function (a) { batch.delete(doc(db, "activities", a.id)); });
  batch.commit().then(function () { closeEditor(); ok("m-done", "All activities cleared."); }, function (err) { bad("m-done", "Could not clear (" + errText(err) + ")."); });
});

// ---------- Game management ----------
var gmId = null;
function gmGame() { return byId(gmId); }
function renderGM(a) {
  gmId = a.id;
  var now = Date.now();
  $("gm-title").textContent = a.title;
  $("gm-who").textContent = (a.hasManager ? "Game manager: " + a.manager : "Run by admins") + " · " + (VENUES[a.venue] || a.venue) + (now < startOf(a) ? " · starts " : " · started ") + clock(startOf(a));
  $("gm-start").textContent = clock(startOf(a));
  $("gm-end").textContent = clock(endOf(a));
  // If the end was moved on the night, keep the originally scheduled end in view.
  var schedEnd = startOf(a) + (a.schedLen || a.len) * MIN;
  $("gm-was").hidden = !a.schedLen || a.schedLen === a.len;
  $("gm-was").textContent = "Scheduled: " + clock(schedEnd);
  var left = endOf(a) - now;
  $("gm-left").textContent = now < startOf(a) ? "Starts in " + words(startOf(a) - now) + ". End now works once it's under way." : left > 0 ? words(left) + " to go" : "Finished";
  // End now only makes sense while the game is actually running.
  $("gm-end-now").disabled = !(now >= startOf(a) && now < endOf(a));
  if (document.activeElement !== $("gm-set")) $("gm-set").value = hhmm(endOf(a));
  var isDraw = a.type === "draw";
  var isT = a.type === "tickets";
  $("gm-draws-panel").hidden = !isT;
  $("gm-win-panel").hidden = isT;
  if (isT) renderSlots(a);
  $("gm-pot-title").textContent = a.title + " pot";
  $("gm-pot-panel").hidden = !isDraw;
  $("gm-ticketno-field").hidden = !isDraw;
  if (isDraw) {
    $("gm-pot-now").textContent = money(pot);
    $("gm-pot-updated").textContent = potSetAt ? "Updated " + clock(potSetAt) : "Not set yet";
    if (document.activeElement !== $("gm-pot-amt")) $("gm-pot-amt").value = pot == null ? "" : String(pot);
    if (document.activeElement !== $("gm-ticket")) $("gm-ticket").value = ticketPrice;
  }
  var list = $("gm-win-list"); list.replaceChildren();
  (a.winners || []).forEach(function (w, i) {
    var li = el("li", "win-row"); li.append(el("span", null, (i + 1) + ". " + w));
    var x = el("button", "icon-btn", "×"); x.type = "button"; x.setAttribute("aria-label", "Remove " + w);
    x.addEventListener("click", function () {
      var next = a.winners.slice(); next.splice(i, 1);
      saveFields(a, { winners: next }, "gm-win-status").then(function () { ok("gm-win-status", "Removed " + w + "."); });
    });
    li.append(x); list.append(li);
  });
  if (!(a.winners || []).length) list.append(el("li", "meta", "No winners yet."));
  $("gm-card").replaceChildren(cardFor(a, now, { static: true, heading: "h3" }));
  $("gm-page").href = "#a-" + a.id;
}
// Draws: one row per prize. Typing saves a moment after you stop, so nothing is lost mid-draw.
function slotCount(a) {
  var sl = a.slots || [], drawn = sl.filter(function (x) { return cleanNo(x.ticket); }).length, claimed = sl.filter(function (x) { return x.claimed; }).length;
  $("gm-draws-count").textContent = drawn + " of " + sl.length + " drawn · " + claimed + " claimed" + (a.resultsFinal ? " · results showing" : "");
}
var slotTimer = null;
function saveSlotsSoon(a, now) {
  slotDraft = { id: a.id, slots: a.slots };
  clearTimeout(slotTimer);
  ok("gm-draws-status", "Saving…");
  var run = function () {
    var draft = slotDraft; if (!draft) return;
    saveFields({ id: draft.id }, { slots: draft.slots }, "gm-draws-status").then(function () {
      if (slotDraft === draft) slotDraft = null;
      ok("gm-draws-status", "Saved. Guests see it now.");
    }, function () {});
  };
  if (now) run(); else slotTimer = setTimeout(run, 700);
}
function renderSlots(a) {
  $("gm-final").checked = !!a.resultsFinal;
  var list = $("gm-slots");
  slotCount(a);
  // While someone is typing in the list, leave the boxes alone; their own save brings it back in step.
  if (list.contains(document.activeElement) && list.getAttribute("data-for") === a.id) return;
  list.setAttribute("data-for", a.id);
  list.replaceChildren();
  a.slots.forEach(function (sl, i) {
    var li = el("li", "slot-row" + (sl.claimed ? " claimed" : ""));
    var lab = el("input"); lab.type = "text"; lab.value = sl.label; lab.placeholder = "#" + (i + 1); lab.maxLength = 60; lab.setAttribute("aria-label", "Label for prize " + (i + 1));
    lab.addEventListener("input", function () { sl.label = lab.value; saveSlotsSoon(a); refresh(); });
    var tno = el("input", "tno"); tno.type = "text"; tno.value = sl.ticket; tno.placeholder = "Ticket #"; tno.maxLength = 12; tno.inputMode = "numeric"; tno.setAttribute("aria-label", "Winning ticket for prize " + (i + 1));
    tno.addEventListener("input", function () { sl.ticket = tno.value.trim(); saveSlotsSoon(a); refresh(); slotCount(a); });
    tno.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); var next = list.querySelectorAll("input.tno")[i + 1]; if (next) next.focus(); } });
    var cl = el("label", "check"); var cb = el("input"); cb.type = "checkbox"; cb.checked = sl.claimed; cl.append(cb, document.createTextNode("Claimed"));
    cb.addEventListener("change", function () { sl.claimed = cb.checked; li.classList.toggle("claimed", cb.checked); saveSlotsSoon(a, true); refresh(); slotCount(a); });
    var rm = el("button", "icon-btn", "×"); rm.type = "button"; rm.setAttribute("aria-label", "Remove prize " + (i + 1));
    rm.addEventListener("click", function () { a.slots.splice(i, 1); list.removeAttribute("data-for"); saveSlotsSoon(a, true); renderSlots(a); refresh(); });
    li.append(el("span", "n", String(i + 1)), lab, tno, cl, rm);
    list.append(li);
  });
}
// Ticking "all drawn" mid-draw ends the draw now, so the card switches straight to SEARCH DRAW RESULTS.
$("gm-final").addEventListener("change", function () {
  var a = gmGame(); if (!a) return;
  var fields = { resultsFinal: $("gm-final").checked };
  var now = Date.now();
  if (fields.resultsFinal && stateOf(a, now) === "live") {
    fields.schedLength = a.schedLen || a.len;
    fields.length = Math.max(1, Math.floor((now - startOf(a)) / MIN));
  }
  saveFields(a, fields, "gm-draws-status").then(function () { ok("gm-draws-status", fields.resultsFinal ? "Results are showing. Guests can search them now." : "Results hidden again."); });
});
function addSlots(n) {
  var a = gmGame(); if (!a) return;
  a.slots = (a.slots || []).concat(newSlots(n));
  $("gm-slots").removeAttribute("data-for");
  saveSlotsSoon(a, true); renderSlots(a);
}
$("gm-add-slot").addEventListener("click", function () { addSlots(1); var t = $("gm-slots").querySelectorAll("input.tno"); t[t.length - 1].focus(); });
$("gm-add-5").addEventListener("click", function () { addSlots(5); });

function setEnd(endMs) {
  var a = gmGame(); if (!a) return;
  var len = Math.round((endMs - startOf(a)) / MIN);
  if (len < 1) { bad("gm-time-status", "The end time can't be before the start (" + clock(startOf(a)) + ")."); return; }
  if (len > 720) { bad("gm-time-status", "That's more than 12 hours after the start. Pick an earlier end time."); return; }
  saveFields(a, { length: len, schedLength: a.schedLen || a.len }, "gm-time-status").then(function () { ok("gm-time-status", "Now ends at " + clock(startOf(a) + len * MIN)); });
}
document.querySelectorAll("[data-adjust]").forEach(function (btn) {
  btn.addEventListener("click", function () { var a = gmGame(); if (a) setEnd(endOf(a) + Number(btn.getAttribute("data-adjust")) * MIN); });
});
$("gm-end-now").addEventListener("click", function () {
  var a = gmGame(); if (!a) return;
  var now = Date.now();
  if (now < startOf(a)) { bad("gm-time-status", "This game hasn't started yet (it starts at " + clock(startOf(a)) + ")."); return; }
  // Round down so the game ends this minute, not the next one.
  var len = Math.max(1, Math.floor((now - startOf(a)) / MIN));
  saveFields(a, { length: len, schedLength: a.schedLen || a.len }, "gm-time-status").then(function () { ok("gm-time-status", "Ended at " + clock(startOf(a) + len * MIN)); });
});
$("gm-set-form").addEventListener("submit", function (e) {
  e.preventDefault();
  var a = gmGame(); if (!a) return;
  var p = ($("gm-set").value || "").split(":"); if (p.length < 2) return;
  var d = new Date(startOf(a)); d.setHours(parseInt(p[0], 10), parseInt(p[1], 10), 0, 0);
  if (d.getTime() < startOf(a)) d.setDate(d.getDate() + 1);
  setEnd(d.getTime());
});
$("gm-pot-form").addEventListener("submit", function (e) {
  e.preventDefault();
  var n = parseAmount($("gm-pot-amt").value);
  if (n === null) { bad("gm-pot-status", "Enter the pot as a number, like 1240 or 1,240."); return; }
  if (!user) return;
  // The public prize record never holds an email; who saved it goes only in the admins-only history.
  var prize = { amount: n, ticketPrice: ($("gm-ticket").value.trim() || ticketPrice).slice(0, 40), drawTime: potDrawTime.slice(0, 40), updatedAt: serverTimestamp() };
  var batch = writeBatch(db);
  batch.set(doc(db, "games", GAME_ID), prize);
  batch.set(doc(collection(db, "games", GAME_ID, "history")), Object.assign({}, prize, { updatedBy: user.email }));
  ok("gm-pot-status", "Saving…");
  batch.commit().then(function () { ok("gm-pot-status", "Pot set to " + money(n) + ". Every screen shows it now."); }, function (err) { bad("gm-pot-status", "Could not save (" + errText(err) + "). Try again."); });
});
$("gm-win-form").addEventListener("submit", function (e) {
  e.preventDefault();
  var a = gmGame(); if (!a) return;
  var name = $("gm-win-name").value.trim();
  var ticketNo = a.type === "draw" ? $("gm-ticketno").value.trim() : "";
  if (name && ticketNo) name += " (ticket #" + ticketNo.replace(/^#/, "") + ")";
  if (!name) { bad("gm-win-status", "Type the winner's name first."); return; }
  if ((a.winners || []).length >= 50) { bad("gm-win-status", "That's 50 winners, the most one game can list."); return; }
  saveFields(a, { winners: (a.winners || []).concat([name.slice(0, 80)]) }, "gm-win-status").then(function () {
    $("gm-win-name").value = ""; $("gm-ticketno").value = "";
    ok("gm-win-status", "Added " + name + ". It shows on the game page now.");
    $("gm-win-name").focus();
  });
});

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
  var onPage = $("view-admin").hidden && $("view-gm").hidden && !(d && h === "a-" + d.id);
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
  var wantsAdmin = h === "admin" || h.indexOf("gm-") === 0;
  var gm = isAdmin && h.indexOf("gm-") === 0 ? acts.filter(function (x) { return x.id === h.slice(3) && (x.hasManager || SPECIAL[x.type]); })[0] : null;
  // Admin pages need a login; the game screen shows the login until then.
  var showAdmin = wantsAdmin && !gm;
  var next = a ? "detail:" + a.id : gm ? "gm:" + gm.id : showAdmin ? "admin" : "home";
  $("view-home").hidden = next !== "home";
  $("view-detail").hidden = !a;
  $("view-admin").hidden = !showAdmin;
  $("view-gm").hidden = !gm;
  $("admin-login").hidden = !(showAdmin && authKnown && !user);
  $("admin-denied").hidden = !(showAdmin && user && !isAdmin);
  $("admin-app").hidden = !(showAdmin && isAdmin);
  var changedView = next !== view;
  view = next;
  if (a) renderDetail(a);
  if (showAdmin && isAdmin) { if (changedView) renderAdmin(); else { fillSettingsInputs(); renderNavRows(); if (!editing || byId(editing.id)) renderActList(); else closeEditor(); } }
  if (gm) { renderGM(gm); if (changedView) ["gm-time-status", "gm-win-status", "gm-pot-status", "gm-draws-status"].forEach(function (id) { ok(id, ""); }); }
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
  var key = h === "" ? "home" : h === "admin" || h.indexOf("gm-") === 0 ? "admin" : d && h === "a-" + d.id ? "draw" : h === "programme" ? "programme" : ticketsActs().some(function (t) { return h === "a-" + t.id; }) ? "tickets-" + h.slice(2) : "";
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
  if (view.indexOf("gm:") === 0) { var g = gmGame(); if (g) { var left = endOf(g) - now; $("gm-left").textContent = now < startOf(g) ? "Starts in " + words(startOf(g) - now) + ". End now works once it's under way." : left > 0 ? words(left) + " to go" : "Finished"; $("gm-end-now").disabled = !(now >= startOf(g) && now < endOf(g)); } }
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
    var d = snap.exists() ? snap.data() : null;
    settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    if (d) {
      ["mark", "eyebrow", "brand", "tagline"].forEach(function (k) { if (typeof d[k] === "string") settings[k] = d[k]; });
      if (typeof d.bulbs === "boolean") settings.bulbs = d.bulbs;
      if (Array.isArray(d.nav) && d.nav.length) settings.nav = d.nav.map(function (n) { return { id: String(n.id || ""), label: String(n.label || ""), href: String(n.href || ""), show: !!n.show, auto: !!n.auto }; });
    }
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
    $("who").textContent = u.email || "";
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
  ["logout", "denied-logout"].forEach(function (id) { $(id).addEventListener("click", function () { closeEditor(); signOut(auth); }); });
  connect();
  document.addEventListener("visibilitychange", function () { if (document.hidden) disconnect(); else connect(); });
}

renderChrome();
renderCards();
route(true);
setInterval(tick, 1000);
window.addEventListener("hashchange", function () { route(true); });
window.addEventListener("resize", fillBulbs);
