// Manager page: log in, then update the prize. Only people listed in the
// database's "managers" collection can save (enforced by firestore.rules).
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { doc, getDoc, onSnapshot, writeBatch, collection, serverTimestamp, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { app, db, configured } from "./firebase-init.js";
import { GAME_ID } from "./config.js";
import { money, clock, parseAmount, toMillis } from "./format.js";

const $ = (id) => document.getElementById(id);
let unsub = null;
let filled = false;

function show(view) {
  for (const id of ["view-setup", "view-login", "view-denied", "view-form"]) $(id).hidden = id !== view;
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
    $("now-updated").textContent = at ? "Last updated " + clock(at) + (d.updatedBy ? " by " + d.updatedBy : "") : "";
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
    filled = false;
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
    show("view-form");
    status("save-status", "");
    watchCurrent();
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
    const entry = {
      amount,
      ticketPrice: $("f-price").value.trim().slice(0, 40),
      drawTime: $("f-time").value.trim().slice(0, 40),
      updatedAt: serverTimestamp(),
      updatedBy: user.email
    };
    $("save").disabled = true;
    status("save-status", "Saving…");
    try {
      // The prize and its history entry are saved together, or not at all.
      const batch = writeBatch(db);
      batch.set(doc(db, "games", GAME_ID), entry);
      batch.set(doc(collection(db, "games", GAME_ID, "history")), entry);
      await batch.commit();
      status("save-status", "Saved. Screens update within a few seconds.");
      loadHistory();
    } catch (err) {
      status("save-status", "Could not save (" + ((err && err.code) || "error") + "). Try again.", true);
    }
    $("save").disabled = false;
  });
}
