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
const A = await open("/#admin", PHONE); await login(A);
const B = await open("/#admin", PHONE); await login(B);
await A.click("#m-sample");
check(await waitFor(B, () => document.querySelectorAll("#m-list .act-row").length === 12), "both phones see the sample night");
const hrefOf = (p, title) => p.evaluate((t) => [...document.querySelectorAll("#m-list .act-row")].find((r) => r.textContent.includes(t)).querySelector("a.btn").getAttribute("href"), title);

// 4a. Editor open on one phone while the other adds a winner: the winner survives.
await A.locator(".act-row", { hasText: "Neon Bingo" }).getByRole("button", { name: "Edit" }).click();
await A.fill("#m-tag", "Edited on phone A");
const bingo = await hrefOf(B, "Neon Bingo");
await B.goto(BASE + "/" + bingo); await B.locator("#gm-win-panel").waitFor();
await B.fill("#gm-win-name", "Added on phone B"); await B.click("#gm-win-form button[type=submit]"); await B.click("#gm-win-save");
check(await waitFor(B, () => document.getElementById("gm-win-status").textContent.startsWith("Saved")), "phone B saves a winner");
await A.click("#m-form button[type=submit]");
check(await waitFor(A, () => document.getElementById("m-done").textContent.startsWith("Saved")), "phone A saves the editor");
const G = await open("/" + bingo.replace("gm-", "a-"), DESK);
check(await waitFor(G, () => [...document.querySelectorAll("#d-winners li")].some((l) => l.textContent === "Added on phone B") && document.querySelector("#d-card .c-tag")?.textContent === "Edited on phone A"), "both changes kept: B's winner and A's tagline");

// 4b. Two admins save different settings panels at once.
await A.goto(BASE + "/#admin"); await B.goto(BASE + "/#admin"); await A.waitForTimeout(500);
await A.fill("#a-brand", "From A"); await B.locator("#a-venues li input").nth(0).fill("From B");
await Promise.all([A.click("#t-save"), B.click("#v-save")]);
check(await waitFor(A, () => document.querySelector("#a-venues li input")?.value === "From B") && await waitFor(B, () => document.getElementById("a-brand").value === "From A"), "title from A and venue from B both kept");

// 4c. Draws: A drafts ticket numbers while B ticks Claimed; A's Save keeps B's claim.
const early = await hrefOf(A, "Early Bird Prize Draw");
await A.goto(BASE + "/" + early); await B.goto(BASE + "/" + early); await A.locator("#gm-slots li").first().waitFor(); await B.locator("#gm-slots li").first().waitFor();
await A.locator("#gm-slots li").nth(4).locator("input.tno").fill("555555");
await B.locator("#gm-slots li").nth(6).locator("input[type=checkbox]").check();
check(await waitFor(B, () => document.querySelectorAll("#gm-slots li")[6].querySelector(".tick-saved").textContent === "Saved"), "phone B's Claimed saves instantly");
check(await waitFor(A, () => document.querySelectorAll("#gm-slots li")[6].querySelector("input[type=checkbox]").checked) && (await A.inputValue("#gm-slots li:nth-child(5) input.tno")) === "555555", "phone A sees B's claim and keeps its own typing");
await A.click("#gm-draws-save");
check(await waitFor(G, () => true) && await waitFor(A, () => document.getElementById("gm-draws-status").textContent.startsWith("Saved")), "phone A saves its ticket list");
await G.goto(BASE + "/" + early.replace("gm-", "a-"));
check(await waitFor(G, () => { const l = [...document.querySelectorAll("#d-tix li")]; return l[4] && l[4].textContent.includes("555555") && l[6].classList.contains("claimed"); }), "guest sees A's ticket and B's claim");

// 5. Offline: a save shows it's waiting, never a false Saved, then saves once back online.
await A.goto(BASE + "/#admin"); await B.goto(BASE + "/#admin"); await A.waitForTimeout(500);
await A.context().setOffline(true);
await A.fill("#a-eyebrow", "Saved while offline"); await A.click("#t-save");
await A.waitForTimeout(9000);
const off = await A.textContent("#t-status");
check(!off.startsWith("Saved"), "offline save never says Saved: " + off);
await A.context().setOffline(false);
check(await waitFor(A, () => document.getElementById("t-status").textContent.startsWith("Saved"), null, 30000), "saves once back online");
check(await waitFor(B, () => document.getElementById("a-eyebrow").value === "Saved while offline", null, 15000), "the other phone gets it");

// 6. Reload mid-edit: nothing half-saved.
await A.fill("#a-tagline", "Never saved"); await A.reload(); await login(A); await A.waitForTimeout(800);
check((await A.inputValue("#a-tagline")) !== "Never saved", "reload mid-edit leaves nothing half-saved");

const real = errors.filter((e) => !/fonts\.g|net::ERR_INTERNET_DISCONNECTED|Could not reach Cloud Firestore|offline|409 \(Conflict\)/i.test(e));
check(real.length === 0, "no page errors" + (real.length ? ": " + real.join(" | ") : ""));
await browser.close(); server.close();
console.log(failed ? failed + " failed" : "all passed");
process.exit(failed ? 1 : 0);
