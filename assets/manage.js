// Manager page: log in, then update the 50/50 prize or tonight's activities.
// Only people listed in the database's "managers" collection can save (enforced by firestore.rules).
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { doc, getDoc, onSnapshot, writeBatch, collection, serverTimestamp, query, orderBy, limit, getDocs, addDoc, setDoc, deleteDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { app, db, configured } from "./firebase-init.js";
import { GAME_ID, VENUES, TYPES } from "./config.js";
import { MIN, pad, money, clock, clockParts, parseAmount, toMillis } from "./format.js";
import { watchActivities, venueOf, sampleNight } from "./activities.js";
import { startBulbs, startClock } from "./ui.js";

const $ = (id) => document.getElementById(id);
let unsub = null;
let unsubActs = null;
let filled = false;
let acts = [];

function show(view) {
  for (const id of ["view-setup", "view-login", "view-denied", "view-app"]) $(id).hidden = id !== view;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// ---------- Tabs ----------
function selectTab(name) {
  for (const t of ["prize", "acts"]) {
    $("tab-" + t).setAttribute("aria-selected", String(t === name));
    $("panel-" + t).hidden = t !== name;
  }
}
$("tab-prize").addEventListener("click", () => selectTab("prize"));
$("tab-acts").addEventListener("click", () => selectTab("acts"));

// ---------- Activities ----------
let editing = null;
const armed = {};
// Two-tap confirm for destructive buttons: the first tap arms it, the second does it.
function confirmTap(id, label, armedLabel) {
  if (!armed[id]) {
    armed[id] = true;
    $(id).textContent = armedLabel;
    setTimeout(() => { armed[id] = false; $(id).textContent = label; }, 5000);
    return false;
  }
  armed[id] = false;
  $(id).textContent = label;
  return true;
}

function fillSelect(sel, items) {
  sel.replaceChildren();
  items.forEach(([value, label]) => { const o = el("option", null, label); o.value = value; sel.append(o); });
}
fillSelect($("m-type"), Object.entries(TYPES));
fillSelect($("m-venue"), VENUES.map((v) => [v.id, v.name]));

// datetime-local wants local "YYYY-MM-DDTHH:MM".
function toLocalInput(ms) {
  const d = new Date(ms);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

function renderActs() {
  const list = $("m-list");
  list.replaceChildren();
  acts.forEach((a) => {
    const li = el("li", "mgr-row");
    const n = el("div", "n");
    n.append(el("b", null, a.title), el("span", null, (TYPES[a.type] || a.type) + " · " + venueOf(a).name + " · " + a.length + " min"));
    const b = el("button", "btn ghost", "Edit");
    b.type = "button";
    b.addEventListener("click", () => openForm(a));
    const t = clockParts(a.start);
    li.append(el("span", "t", t[0] + " " + t[1]), n, b);
    list.append(li);
  });
  if (!acts.length) list.append(el("li", "empty", "No activities yet. Add one, or load the sample night to try things out."));
  $("m-clear").hidden = !acts.length;
}

function openForm(a) {
  editing = a;
  armed["m-delete"] = false;
  $("m-delete").textContent = "Delete";
  $("m-delete").hidden = !a;
  $("m-form-title").textContent = a ? "Edit activity" : "New activity";
  $("m-title").value = a ? a.title : "";
  $("m-type").value = a ? a.type : "game";
  $("m-venue").value = a ? a.venue : VENUES[0].id;
  $("m-start").value = toLocalInput(a ? a.start : Math.ceil(Date.now() / (15 * MIN)) * 15 * MIN);
  $("m-len").value = a ? a.length : 30;
  $("m-host").value = a ? a.host : "";
  $("m-blurb").value = a ? a.blurb : "";
  status("m-status", "");
  $("m-form").hidden = false;
  $("m-title").focus();
}
function closeForm() {
  $("m-form").hidden = true;
  editing = null;
}

function watchActs() {
  if (unsubActs) return;
  unsubActs = watchActivities((list) => {
    acts = list;
    renderActs();
    if (editing && !acts.some((a) => a.id === editing.id)) closeForm();
  }, () => status("acts-status", "Lost connection. Reload the page.", true));
}

function status(id, text, bad) {
  $(id).textContent = text;
  $(id).classList.toggle("bad", !!bad);
}

function loginError(err) {
  const code = (err && err.code) || "";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found" || code === "auth/invalid-email") return "Email or password is wrong.";
  if (code === "auth/too-many-requests") return "Too many tries. Wait a few minutes and try again.";
  if (code === "auth/network-request-failed") return "No internet connection. Check your signal and try again.";
  if (code === "auth/unauthorized-domain") return "This web address isn't approved in Firebase yet (see SETUP.md).";
  return "Could not log in (" + (code || "error") + ").";
}

function watchCurrent() {
  if (unsub) return;
  unsub = onSnapshot(doc(db, "games", GAME_ID), (snap) => {
    const d = snap.exists() ? snap.data({ serverTimestamps: "estimate" }) : null;
    const ok = d && typeof d.amount === "number";
    $("now-amount").textContent = ok ? money(d.amount) : "Not set yet";
    const at = d ? toMillis(d.updatedAt) : null;
    $("now-updated").textContent = at ? "Last updated " + clock(at) : "";
    // Fill the boxes once, so a live change never overwrites what a manager is typing.
    if (!filled) {
      filled = true;
      $("f-amount").value = ok ? String(d.amount) : "";
      $("f-price").value = (d && d.ticketPrice) || "";
      $("f-time").value = (d && d.drawTime) || "";
    }
  }, () => status("save-status", "Lost connection. Reload the page.", true));
}

async function loadHistory() {
  const list = $("history");
  list.replaceChildren();
  try {
    const q = query(collection(db, "games", GAME_ID, "history"), orderBy("updatedAt", "desc"), limit(5));
    const rows = await getDocs(q);
    rows.forEach((r) => {
      const d = r.data();
      const at = toMillis(d.updatedAt);
      const li = document.createElement("li");
      li.textContent = money(d.amount) + " · " + (at ? clock(at) : "") + " · " + (d.updatedBy || "");
      list.append(li);
    });
    if (!rows.size) {
      const li = document.createElement("li");
      li.textContent = "No updates yet.";
      list.append(li);
    }
  } catch (e) {
    const li = document.createElement("li");
    li.textContent = "Could not load recent updates.";
    list.append(li);
  }
}

if (!configured) {
  show("view-setup");
} else {
  const auth = getAuth(app);

  onAuthStateChanged(auth, async (user) => {
    if (unsub) { unsub(); unsub = null; }
    if (unsubActs) { unsubActs(); unsubActs = null; }
    filled = false;
    closeForm();
    if (!user) { show("view-login"); return; }
    $("who").textContent = user.email || "";
    try {
      const me = await getDoc(doc(db, "managers", user.uid));
      if (!me.exists()) { $("denied-email").textContent = user.email || ""; show("view-denied"); return; }
    } catch (e) {
      status("login-status", "Could not check your access. Try again.", true);
      show("view-login");
      return;
    }
    show("view-app");
    status("save-status", "");
    watchCurrent();
    watchActs();
    loadHistory();
  });

  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("login-btn").disabled = true;
    status("login-status", "Logging in…");
    try {
      await signInWithEmailAndPassword(auth, $("l-email").value.trim(), $("l-password").value);
      $("l-password").value = "";
      status("login-status", "");
    } catch (err) {
      status("login-status", loginError(err), true);
    }
    $("login-btn").disabled = false;
  });

  for (const id of ["logout", "denied-logout"]) $(id).addEventListener("click", () => signOut(auth));

  $("update-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const amount = parseAmount($("f-amount").value);
    if (amount === null) { status("save-status", "Enter the prize as a number, like 1240 or 1,240.50.", true); return; }
    const user = auth.currentUser;
    if (!user) return;
    // The public prize record never holds an email; who saved it goes only in the managers-only history.
    const prize = {
      amount,
      ticketPrice: $("f-price").value.trim().slice(0, 40),
      drawTime: $("f-time").value.trim().slice(0, 40),
      updatedAt: serverTimestamp()
    };
    $("save").disabled = true;
    status("save-status", "Saving…");
    try {
      // The prize and its history entry are saved together, or not at all.
      const batch = writeBatch(db);
      batch.set(doc(db, "games", GAME_ID), prize);
      batch.set(doc(collection(db, "games", GAME_ID, "history")), { ...prize, updatedBy: user.email });
      await batch.commit();
      status("save-status", "Saved. Screens update within a few seconds.");
      loadHistory();
    } catch (err) {
      status("save-status", "Could not save (" + ((err && err.code) || "error") + "). Try again.", true);
    }
    $("save").disabled = false;
  });

  $("m-add").addEventListener("click", () => openForm(null));
  $("m-cancel").addEventListener("click", closeForm);

  $("m-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = $("m-title").value.trim().slice(0, 60);
    const length = parseInt($("m-len").value, 10);
    const start = new Date($("m-start").value).getTime();
    if (!title) { status("m-status", "Give the activity a name.", true); return; }
    if (!isFinite(start)) { status("m-status", "Pick a start date and time.", true); return; }
    if (!(length >= 5 && length <= 360)) { status("m-status", "Length must be between 5 and 360 minutes.", true); return; }
    const data = {
      title,
      type: $("m-type").value,
      venue: $("m-venue").value,
      start: Timestamp.fromMillis(start),
      length,
      host: $("m-host").value.trim().slice(0, 60),
      blurb: $("m-blurb").value.trim().slice(0, 200),
      updatedAt: serverTimestamp()
    };
    $("m-save").disabled = true;
    status("m-status", "Saving…");
    try {
      if (editing) await setDoc(doc(db, "activities", editing.id), data);
      else await addDoc(collection(db, "activities"), data);
      closeForm();
      status("acts-status", "Saved. Every screen shows the change within a few seconds.");
    } catch (err) {
      status("m-status", "Could not save (" + ((err && err.code) || "error") + "). Try again.", true);
    }
    $("m-save").disabled = false;
  });

  $("m-delete").addEventListener("click", async () => {
    if (!editing || !confirmTap("m-delete", "Delete", "Tap again to delete")) return;
    try {
      await deleteDoc(doc(db, "activities", editing.id));
      closeForm();
      status("acts-status", "Deleted.");
    } catch (err) {
      status("m-status", "Could not delete (" + ((err && err.code) || "error") + ").", true);
    }
  });

  $("m-sample").addEventListener("click", async () => {
    if (acts.length && !confirmTap("m-sample", "Load sample night", "Adds 10 more. Tap again")) return;
    const batch = writeBatch(db);
    sampleNight(Date.now()).forEach((a) => {
      batch.set(doc(collection(db, "activities")), {
        title: a.title, type: a.type, venue: a.venue, start: Timestamp.fromMillis(a.start),
        length: a.length, host: a.host, blurb: a.blurb, updatedAt: serverTimestamp()
      });
    });
    status("acts-status", "Loading the sample night…");
    try {
      await batch.commit();
      status("acts-status", "Sample night loaded. It's timed around now so something is live.");
    } catch (err) {
      status("acts-status", "Could not load the sample (" + ((err && err.code) || "error") + ").", true);
    }
  });

  $("m-clear").addEventListener("click", async () => {
    if (!confirmTap("m-clear", "Clear all", "Deletes all " + acts.length + ". Tap again")) return;
    const batch = writeBatch(db);
    acts.forEach((a) => batch.delete(doc(db, "activities", a.id)));
    try {
      await batch.commit();
      closeForm();
      status("acts-status", "All activities cleared.");
    } catch (err) {
      status("acts-status", "Could not clear (" + ((err && err.code) || "error") + ").", true);
    }
  });
}

startBulbs();
startClock();
selectTab("prize");
