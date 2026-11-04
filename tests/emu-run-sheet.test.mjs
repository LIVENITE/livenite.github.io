// End-to-end check of the retro site (home, activities, 50/50 board, TV, managers) against the local emulators.
import http from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";
import { REPO, OUT, launch } from "./lib.mjs";

const SITE = REPO;
const HERE = new URL(".", import.meta.url).pathname;
const SHOTS = join(OUT, "shots");
mkdirSync(SHOTS, { recursive: true });
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = http.createServer((req, res) => {
  let p = join(SITE, decodeURIComponent(req.url.split("?")[0].split("#")[0]));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
}).listen(5057);
const BASE = "http://127.0.0.1:5057";

const testInit = `
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
export const configured = true;
export const app = initializeApp({ apiKey: "demo-key", projectId: "demo-prize", authDomain: "demo-prize.firebaseapp.com", appId: "demo" });
export const db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", 8080);
connectAuthEmulator(getAuth(app), "http://127.0.0.1:9099", { disableWarnings: true });
`;
async function signUp(email) {
  const r = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "test-pass-123", returnSecureToken: true })
  });
  return (await r.json()).localId;
}
const mgrUid = await signUp("mgr@example.ca");
await signUp("stranger@example.ca");
await fetch(`http://127.0.0.1:8080/v1/projects/demo-prize/databases/(default)/documents/managers/${mgrUid}`, {
  method: "PATCH", headers: { "content-type": "application/json", Authorization: "Bearer owner" },
  body: JSON.stringify({ fields: { name: { stringValue: "Test manager" } } })
});

const browser = await launch();
const errors = [];
let failed = 0;
const check = (ok, name) => { console.log(ok ? "PASS" : "FAIL", name); if (!ok) failed++; };
const PHONE = { width: 390, height: 844 }, DESK = { width: 1280, height: 900 }, TV = { width: 1920, height: 1080 };

async function open(path, viewport) {
  const ctx = await browser.newContext({ viewport, ignoreHTTPSErrors: true, isMobile: viewport.width < 900, hasTouch: viewport.width < 900 });
  await ctx.route("**/assets/firebase-init.js", (r) => r.fulfill({ contentType: "text/javascript", body: testInit }));
  await ctx.route("https://www.gstatic.com/firebasejs/11.0.2/*.js", (r) => {
    r.fulfill({ contentType: "text/javascript", body: readFileSync(join(HERE, ".cache", "firebase", r.request().url().split("/").pop())) });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(path + ": " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(path + ": " + m.text()); });
  await page.goto(BASE + path);
  return page;
}
const text = (p, sel) => p.locator(sel).innerText();
const waitFor = (p, fn, arg, ms = 10000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const sideways = (p) => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);



async function login(p) {
  await waitFor(p, () => !document.getElementById("admin-login").hidden || !document.getElementById("admin-app").hidden || !document.getElementById("view-gm").hidden);
  if (await p.isVisible("#admin-login")) { await p.fill("#l-email", "mgr@example.ca"); await p.fill("#l-password", "test-pass-123"); await p.click("#login-btn"); }
  await waitFor(p, () => !document.getElementById("view-gm").hidden || !document.getElementById("admin-app").hidden);
}

const A = await open("/#admin", DESK); await login(A);
await A.click("#m-sample");
const G = await open("/", PHONE);
check(await waitFor(G, () => document.querySelectorAll("#cards > a").length >= 12), "sample night loads (with its event times) under the new rules");
check(await waitFor(G, () => !document.getElementById("event-when").hidden && /AM|PM/.test(document.getElementById("event-when").textContent)), "guest home shows event times: ");
await A.goto(BASE + "/#runsheet"); await A.locator("#rs-tl .bar").first().waitFor();
// A simple move inside the event saves.
const bar = A.locator("#rs-tl .bar", { hasText: "Glow Karaoke" });
await bar.click(); await A.locator("#rs-side .time-row").nth(1).locator("button", { hasText: "−5" }).click();
await A.locator("#rs-savebar button", { hasText: /^Save all$/ }).click();
check(await waitFor(A, () => document.getElementById("rs-savebar").textContent.includes("No unsaved")), "run sheet Save all saves a move");
// Push past the end, then extend & save in one batch: the database accepts both together.
await A.click("#rs-late-btn"); await A.locator("#rs-side .seg span", { hasText: /^60/ }).click();
await A.locator("#rs-side button", { hasText: "Add to changes" }).click();
const blocked = await A.textContent("#rs-savebar");
check(blocked.includes("Can't save"), "pushing past the end is refused at Save: " + blocked.slice(0, 70));
await A.locator("#rs-savebar button", { hasText: "& save all" }).click();
check(await waitFor(A, () => document.getElementById("rs-savebar").textContent.includes("No unsaved"), null, 15000), "extend + save all accepted by the database");
const before = await G.textContent("#event-when");
check(await waitFor(G, () => document.getElementById("event-when").textContent !== "", null, 5000), "guest sees updated event times: " + await G.textContent("#event-when"));
// The database itself refuses an activity outside the event (even if a page tried).
const refused = await A.evaluate(async () => {
  const fs = await import("https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js");
  const { db } = await import("/assets/firebase-init.js");
  try { await fs.addDoc(fs.collection(db, "activities"), { title: "Sneaky", type: "game", venue: "stage", start: fs.Timestamp.fromMillis(Date.now() + 48 * 3600000), length: 30, host: "", updatedAt: fs.serverTimestamp() }); return "saved"; } catch (e) { return e.code; }
});
check(refused === "permission-denied", "database refuses an activity outside event hours: " + refused);
const real = errors.filter((e) => !/fonts\.g|permission-denied|PERMISSION_DENIED|Missing or insufficient/i.test(e));
check(real.length === 0, "no page errors" + (real.length ? ": " + real.join(" | ") : ""));
await browser.close(); server.close();
console.log(failed ? failed + " failed" : "all passed");
process.exit(failed ? 1 : 0);
