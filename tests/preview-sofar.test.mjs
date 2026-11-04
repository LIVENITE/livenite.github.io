import { PREVIEW, SHOTS, launch } from "./lib.mjs";
const f = PREVIEW;
const b = await launch();
const errs = []; let fail = 0; const ck = (ok, n) => { console.log(ok ? "PASS" : "FAIL", n); if (!ok) fail++; };
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); p.on("pageerror", (e) => errs.push(e.message));
await p.goto(f, { waitUntil: "load" }); await p.waitForTimeout(500);
const state = (t) => p.locator("#cards a").filter({ has: p.locator(".c-title", { hasText: t }) }).locator(".c-state").textContent();
// Penny Raffle has tickets in and isn't marked all drawn; Door Prize has none.
ck((await state("Penny Raffle")) === "Results so far", "finished draw with tickets: " + await state("Penny Raffle"));
ck((await state("Door Prize")) === "Results soon", "finished draw with no tickets: " + await state("Door Prize"));
const pr = await p.evaluate(() => [...document.querySelectorAll("#cards a")].find((a) => a.textContent.includes("Penny Raffle")).getAttribute("href"));
await p.goto(f + pr); await p.waitForTimeout(200);
ck((await p.textContent("#d-count")) === "Results so far" && (await p.textContent("#d-draws-state")).startsWith("Results so far: 10 of 10"), "draw page says results so far: " + await p.textContent("#d-draws-state"));
// Marking all drawn switches to SEARCH DRAW RESULTS.
await p.goto(f + pr.replace("#a-", "#gm-")); await p.waitForTimeout(200); await p.check("#gm-final"); await p.click("#gm-draws-save"); await p.waitForTimeout(300);
await p.goto(f + "#"); await p.waitForTimeout(200);
ck((await state("Penny Raffle")) === "SEARCH DRAW RESULTS", "all drawn still shows SEARCH DRAW RESULTS");
ck(errs.length === 0, "no page errors " + errs.join(" | "));
console.log(fail ? fail + " failed" : "all passed"); await b.close();
