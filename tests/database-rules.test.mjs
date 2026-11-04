import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc, updateDoc, writeBatch, collection, serverTimestamp, query, orderBy, limit, getDocs, Timestamp, addDoc } from "firebase/firestore";

const env = await initializeTestEnvironment({
  projectId: "demo-prize",
  firestore: { rules: readFileSync(process.argv[2], "utf8"), host: "127.0.0.1", port: 8080 }
});

await env.withSecurityRulesDisabled(async (ctx) => {
  const admin = ctx.firestore();
  await setDoc(doc(admin, "managers/mgr1"), { name: "Manager One" });
  await setDoc(doc(admin, "games/5050/history/old"), { amount: 1, ticketPrice: "", drawTime: "", updatedAt: Timestamp.now(), updatedBy: "a@x.ca" });
});

const anon = env.unauthenticatedContext().firestore();
const stranger = env.authenticatedContext("u2", { email: "stranger@x.ca" }).firestore();
const mgr = env.authenticatedContext("mgr1", { email: "mgr@x.ca" }).firestore();

const entry = (over = {}) => ({ amount: 1240, ticketPrice: "$5", drawTime: "9:30 pm", updatedAt: serverTimestamp(), updatedBy: "mgr@x.ca", ...over });
// Same shape the manager page sends: no email in the public record, email in the history.
function saveBoth(db, e) {
  const { updatedBy, ...prize } = e;
  const b = writeBatch(db);
  b.set(doc(db, "games/5050"), prize);
  b.set(doc(collection(db, "games/5050/history")), e);
  return b.commit();
}

const act = (over = {}) => ({ title: "Neon Bingo", type: "game", venue: "stage", start: Timestamp.fromMillis(Date.now() + 3600000), length: 60, host: "DJ Marla", blurb: "Glow daubers.", updatedAt: serverTimestamp(), ...over });

const card = (over = {}) => { const { blurb, ...base } = act(); return { ...base, tag: "Glow daubers.", style: "marquee", graphic: "suggest", hasManager: true, manager: "DJ Marla", winners: [], slots: [], resultsFinal: false, ...over }; };
const settings = (over = {}) => ({ mark: "LIVENITE", eyebrow: "Tonight", brand: "LIVENITE", tagline: "", bulbs: true, nav: [{ id: "home", label: "Tonight", href: "#", show: true }], updatedAt: serverTimestamp(), ...over });

const M = 60000, EV0 = Date.UTC(2026, 9, 29, 23, 30), T = (ms) => Timestamp.fromMillis(ms);
await env.withSecurityRulesDisabled(async (ctx) => {
  // An activity from before event times existed, sitting outside the event.
  await setDoc(doc(ctx.firestore(), "activities/old1"), { title: "Old", type: "game", venue: "lounge", start: T(EV0 - 120 * M), length: 60, host: "", updatedAt: Timestamp.now() });
});

const cases = [
  ["public can read activities", () => assertSucceeds(getDocs(query(collection(anon, "activities"), orderBy("start"))))],
  ["public cannot add an activity", () => assertFails(addDoc(collection(anon, "activities"), act()))],
  ["non-manager cannot add an activity", () => assertFails(addDoc(collection(stranger, "activities"), act()))],
  ["manager can add an activity", () => assertSucceeds(setDoc(doc(mgr, "activities/a1"), act()))],
  ["manager can edit an activity", () => assertSucceeds(setDoc(doc(mgr, "activities/a1"), act({ title: "Bingo Blackout", length: 45 })))],
  ["activity with an unknown type refused", () => assertFails(setDoc(doc(mgr, "activities/a2"), act({ type: "poker" })))],
  ["activity with a text start time refused", () => assertFails(setDoc(doc(mgr, "activities/a2"), act({ start: "9pm" })))],
  ["activity length 0 refused", () => assertFails(setDoc(doc(mgr, "activities/a2"), act({ length: 0 })))],
  ["activity length 13 hours refused", () => assertFails(setDoc(doc(mgr, "activities/a2"), act({ length: 780 })))],
  ["ended-early activity (1 min) allowed", () => assertSucceeds(setDoc(doc(mgr, "activities/a3"), act({ length: 1, schedLength: 45 })))],
  ["activity length 30.5 refused", () => assertFails(setDoc(doc(mgr, "activities/a2"), act({ length: 30.5 })))],
  ["activity with empty name refused", () => assertFails(setDoc(doc(mgr, "activities/a2"), act({ title: "" })))],
  ["activity with extra field refused", () => assertFails(setDoc(doc(mgr, "activities/a2"), act({ secret: 1 })))],
  ["activity missing host refused", () => { const { host, ...a } = act(); return assertFails(setDoc(doc(mgr, "activities/a2"), a)); }],
  ["activity with made-up timestamp refused", () => assertFails(setDoc(doc(mgr, "activities/a2"), act({ updatedAt: Timestamp.fromMillis(0) })))],
  ["full card activity saves", () => assertSucceeds(setDoc(doc(mgr, "activities/c1"), card()))],
  ["Draws with ticket list saves", () => assertSucceeds(setDoc(doc(mgr, "activities/c2"), card({ type: "tickets", slots: [{ label: "", ticket: "004217", claimed: false }], resultsFinal: true })))],
  ["admin can update just the winners", () => assertSucceeds(updateDoc(doc(mgr, "activities/c1"), { winners: ["Sam"], updatedAt: serverTimestamp() }))],
  ["stranger cannot update winners", () => assertFails(updateDoc(doc(stranger, "activities/c1"), { winners: ["Me"], updatedAt: serverTimestamp() }))],
  ["more than 50 winners refused", () => assertFails(setDoc(doc(mgr, "activities/c3"), card({ winners: Array(51).fill("x") })))],
  ["more than 200 prizes refused", () => assertFails(setDoc(doc(mgr, "activities/c3"), card({ slots: Array(201).fill({ label: "", ticket: "", claimed: false }) })))],
  ["tagline over 80 refused", () => assertFails(setDoc(doc(mgr, "activities/c3"), card({ tag: "x".repeat(81) })))],
  ["hasManager as text refused", () => assertFails(setDoc(doc(mgr, "activities/c3"), card({ hasManager: "yes" })))],
  ["public can read site settings", () => assertSucceeds(getDoc(doc(anon, "site/settings")))],
  ["admin can save site settings", () => assertSucceeds(setDoc(doc(mgr, "site/settings"), settings()))],
  ["stranger cannot save site settings", () => assertFails(setDoc(doc(stranger, "site/settings"), settings()))],
  ["public cannot save site settings", () => assertFails(setDoc(doc(anon, "site/settings"), settings()))],
  ["settings in another record refused", () => assertFails(setDoc(doc(mgr, "site/other"), settings()))],
  ["settings with extra field refused", () => assertFails(setDoc(doc(mgr, "site/settings"), settings({ evil: 1 })))],
  ["title over 24 letters refused", () => assertFails(setDoc(doc(mgr, "site/settings"), settings({ brand: "x".repeat(25) })))],
  ["admin can save venues", () => assertSucceeds(setDoc(doc(mgr, "site/settings"), settings({ venues: [{ id: "lobby", name: "Front Hall" }] })))],
  ["admin can update just the venues", () => assertSucceeds(updateDoc(doc(mgr, "site/settings"), { venues: [{ id: "deck", name: "Patio" }], updatedAt: serverTimestamp() }))],
  ["empty venue list refused", () => assertFails(setDoc(doc(mgr, "site/settings"), settings({ venues: [] })))],
  ["more than 20 venues refused", () => assertFails(setDoc(doc(mgr, "site/settings"), settings({ venues: Array(21).fill({ id: "x", name: "x" }) })))],
  ["stranger cannot change venues", () => assertFails(updateDoc(doc(stranger, "site/settings"), { venues: [{ id: "x", name: "x" }], updatedAt: serverTimestamp() }))],
  ["event times 7:30 PM–2 AM save", () => assertSucceeds(updateDoc(doc(mgr, "site/settings"), { eventStart: T(EV0), eventEnd: T(EV0 + 390 * M), updatedAt: serverTimestamp() }))],
  ["event of 12 h 5 min refused", () => assertFails(updateDoc(doc(mgr, "site/settings"), { eventStart: T(EV0), eventEnd: T(EV0 + 725 * M), updatedAt: serverTimestamp() }))],
  ["event ending before it starts refused", () => assertFails(updateDoc(doc(mgr, "site/settings"), { eventStart: T(EV0), eventEnd: T(EV0 - M), updatedAt: serverTimestamp() }))],
  ["event start without an end refused", () => assertFails(setDoc(doc(mgr, "site/settings"), settings({ eventStart: T(EV0) })))],
  ["activity inside the event saves", () => assertSucceeds(setDoc(doc(mgr, "activities/in1"), card({ start: T(EV0 + 60 * M), length: 60 })))],
  ["new activity outside the event refused", () => assertFails(setDoc(doc(mgr, "activities/out1"), card({ start: T(EV0 - 120 * M), length: 60 })))],
  ["moving an activity past the end refused", () => assertFails(updateDoc(doc(mgr, "activities/in1"), { start: T(EV0 + 380 * M), updatedAt: serverTimestamp() }))],
  ["old outside activity: saving winners is fine", () => assertSucceeds(updateDoc(doc(mgr, "activities/old1"), { winners: ["Sam"], updatedAt: serverTimestamp() }))],
  ["old outside activity: moving closer is fine", () => assertSucceeds(updateDoc(doc(mgr, "activities/old1"), { start: T(EV0 - 30 * M), updatedAt: serverTimestamp() }))],
  ["old outside activity: moving further out refused", () => assertFails(updateDoc(doc(mgr, "activities/old1"), { start: T(EV0 - 300 * M), updatedAt: serverTimestamp() }))],
  ["move past the end + extend the event in one save", () => { const b = writeBatch(mgr); b.update(doc(mgr, "activities/in1"), { start: T(EV0 + 380 * M), updatedAt: serverTimestamp() }); b.update(doc(mgr, "site/settings"), { eventEnd: T(EV0 + 450 * M), updatedAt: serverTimestamp() }); return assertSucceeds(b.commit()); }],
  ["first 50/50 saves when it claims the 50/50 slot", () => { const b = writeBatch(mgr); b.set(doc(mgr, "activities/ff1"), card({ type: "draw", start: T(EV0 + 30 * M), length: 10 })); b.set(doc(mgr, "site/fiftyFifty"), { activityId: "ff1", updatedAt: serverTimestamp() }); return assertSucceeds(b.commit()); }],
  ["a 50/50 that doesn't claim the slot is refused", () => assertFails(setDoc(doc(mgr, "activities/ff2"), card({ type: "draw", start: T(EV0 + 60 * M), length: 10 })))],
  ["a second 50/50 can't take the slot", () => { const b = writeBatch(mgr); b.set(doc(mgr, "activities/ff2"), card({ type: "draw", start: T(EV0 + 60 * M), length: 10 })); b.set(doc(mgr, "site/fiftyFifty"), { activityId: "ff2", updatedAt: serverTimestamp() }); return assertFails(b.commit()); }],
  ["turning a game into a second 50/50 is refused", () => { const b = writeBatch(mgr); b.update(doc(mgr, "activities/in1"), { type: "draw", updatedAt: serverTimestamp() }); b.set(doc(mgr, "site/fiftyFifty"), { activityId: "in1", updatedAt: serverTimestamp() }); return assertFails(b.commit()); }],
  ["the 50/50 itself still saves winners", () => assertSucceeds(updateDoc(doc(mgr, "activities/ff1"), { winners: ["Drew (ticket #1)"], updatedAt: serverTimestamp() }))],
  ["after the 50/50 is deleted, a new one can take the slot", async () => { await assertSucceeds(deleteDoc(doc(mgr, "activities/ff1"))); const b = writeBatch(mgr); b.set(doc(mgr, "activities/ff3"), card({ type: "draw", start: T(EV0 + 90 * M), length: 10 })); b.set(doc(mgr, "site/fiftyFifty"), { activityId: "ff3", updatedAt: serverTimestamp() }); return assertSucceeds(b.commit()); }],
  ["strangers can't touch the 50/50 slot", () => assertFails(setDoc(doc(stranger, "site/fiftyFifty"), { activityId: "x", updatedAt: serverTimestamp() }))],
  ["settings cannot be deleted", () => assertFails(deleteDoc(doc(mgr, "site/settings")))],
  ["non-manager cannot delete an activity", () => assertFails(deleteDoc(doc(stranger, "activities/a1")))],
  ["manager can load a batch of activities", () => { const b = writeBatch(mgr); for (let i = 0; i < 10; i++) b.set(doc(collection(mgr, "activities")), act({ title: "Sample " + i, start: T(EV0 + i * 20 * M), length: 30 })); return assertSucceeds(b.commit()); }],
  ["batch with an activity outside the event refused", () => { const b = writeBatch(mgr); b.set(doc(collection(mgr, "activities")), act({ title: "Too late" })); return assertFails(b.commit()); }],
  ["manager can delete an activity", () => assertSucceeds(deleteDoc(doc(mgr, "activities/a1")))],
  ["public can read the prize", () => assertSucceeds(getDoc(doc(anon, "games/5050")))],
  ["public cannot write the prize", () => assertFails(setDoc(doc(anon, "games/5050"), entry()))],
  ["logged-in non-manager cannot write", () => assertFails(saveBoth(stranger, entry({ updatedBy: "stranger@x.ca" })))],
  ["manager can save prize + history together", () => assertSucceeds(saveBoth(mgr, entry()))],
  ["manager can update again", () => assertSucceeds(saveBoth(mgr, entry({ amount: 1500.5 })))],
  ["manager cannot pretend to be someone else", () => assertFails(saveBoth(mgr, entry({ updatedBy: "boss@x.ca" })))],
  ["public record refuses an email", () => assertFails(setDoc(doc(mgr, "games/5050"), entry()))],
  ["history requires who saved it", () => { const { updatedBy, ...e } = entry(); return assertFails(setDoc(doc(collection(mgr, "games/5050/history")), e)); }],
  ["manager cannot add unknown fields", () => assertFails(saveBoth(mgr, entry({ extra: 1 })))],
  ["negative prize refused", () => assertFails(saveBoth(mgr, entry({ amount: -5 })))],
  ["text prize refused", () => assertFails(saveBoth(mgr, entry({ amount: "1240" })))],
  ["made-up timestamp refused", () => assertFails(saveBoth(mgr, entry({ updatedAt: Timestamp.fromMillis(0) })))],
  ["prize cannot be deleted", () => assertFails(deleteDoc(doc(mgr, "games/5050")))],
  ["history cannot be edited", () => assertFails(updateDoc(doc(mgr, "games/5050/history/old"), { amount: 999999 }))],
  ["history cannot be deleted", () => assertFails(deleteDoc(doc(mgr, "games/5050/history/old")))],
  ["public cannot read history", () => assertFails(getDocs(query(collection(anon, "games/5050/history"), orderBy("updatedAt", "desc"), limit(5))))],
  ["manager can read recent history", () => assertSucceeds(getDocs(query(collection(mgr, "games/5050/history"), orderBy("updatedAt", "desc"), limit(5))))],
  ["user can check own manager entry", () => assertSucceeds(getDoc(doc(stranger, "managers/u2")))],
  ["user cannot read someone else's manager entry", () => assertFails(getDoc(doc(stranger, "managers/mgr1")))],
  ["nobody can add themselves as manager", () => assertFails(setDoc(doc(stranger, "managers/u2"), { name: "me" }))]
];

let failed = 0;
for (const [name, run] of cases) {
  try { await run(); console.log("PASS", name); }
  catch (e) { failed++; console.log("FAIL", name, "-", e.message.split("\n")[0]); }
}
await env.cleanup();
console.log(failed ? `${failed} failed` : `all ${cases.length} passed`);
process.exit(failed ? 1 : 0);
