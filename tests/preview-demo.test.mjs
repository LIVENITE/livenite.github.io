import { PREVIEW, SHOTS, launch } from "./lib.mjs";
const f = PREVIEW;
const b = await launch();
const errs = []; let fail = 0; const ck = (ok, n) => { console.log(ok ? "PASS" : "FAIL", n); if (!ok) fail++; };
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, ignoreHTTPSErrors: true, timezoneId: "America/Toronto" });
const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push("desk: " + e.stack.split("\n").slice(0, 3).join(" < ")));
const t = (s) => p.textContent(s);
const state = (title) => p.evaluate((x) => { const c = [...document.querySelectorAll("#cards > a")].find((a) => a.querySelector(".c-title").textContent === x); return c ? c.querySelector(".c-state").textContent : "?"; }, title);
await p.goto(f + "#", { waitUntil: "load" }); await p.waitForTimeout(800);
ck((await state("Penny Raffle")) !== "DRAWING NOW" && await p.isHidden("#demo-banner"), "real time: Penny Raffle not live, no banner");
await p.goto(f + "#admin"); await p.waitForTimeout(400);
const picked = await p.evaluate(() => { const r = document.querySelector("#demo-when .dtpick"); return [r.querySelector("input").value, ...[...r.querySelectorAll("select")].map((s) => s.value)].join(" "); });
ck(picked === "2026-10-29 9 20 PM", "demo time defaults to 9:20 PM Oct 29: " + picked);
await p.check("#demo-on"); await p.waitForTimeout(300);
ck(await p.isVisible("#demo-banner") && (await t("#demo-banner")).includes("Oct 29") && (await t("#demo-banner")).includes("9:20"), "banner shows: " + (await t("#demo-banner")).trim());
await p.goto(f + "#"); await p.waitForTimeout(400);
ck((await state("Penny Raffle")) === "DRAWING NOW", "Penny Raffle now DRAWING NOW: " + await state("Penny Raffle"));
ck((await state("PLINKO")).startsWith("LIVE"), "PLINKO LIVE: " + await state("PLINKO"));
ck((await state("Buffet Dinner")).startsWith("Starts in"), "Buffet counts down: " + await state("Buffet Dinner"));
await p.goto(f + "#runsheet"); await p.waitForTimeout(400);
// The run sheet waits for event times (EVT-2): set 7:30 PM – 2:00 AM.
for (const [root, date, hh, mm, ap] of [["#ev-start .dtpick", "2026-10-29", "7", "30", "PM"], ["#ev-end .dtpick", "2026-10-30", "2", "0", "AM"]]) {
  const r = p.locator(root); await r.locator("input[type=date]").fill(date); await r.locator("input[type=date]").dispatchEvent("change");
  await r.locator("select").nth(0).selectOption(hh); await r.locator("select").nth(1).selectOption(mm); await r.locator("select").nth(2).selectOption(ap);
}
await p.click("#ev-save"); await p.waitForTimeout(300);
ck((await t("#rs-now")).includes("9:2"), "run sheet now line at 9:20: " + await t("#rs-now"));
await p.click("#rs-late-btn"); ck(!(await p.isDisabled("#rs-side button:has-text('Add to changes')")), "Running late has things to move");
await p.locator("#rs-side button", { hasText: "Cancel" }).click();
// Reload keeps demo mode on (this browser only).
await p.reload(); await p.waitForTimeout(1500);
ck(await p.isVisible("#demo-banner"), "demo mode survives a reload");
// Pick another time while on.
await p.goto(f + "#admin"); await p.waitForTimeout(300);
await p.locator("#demo-when select").nth(0).selectOption("11"); await p.waitForTimeout(300);
await p.goto(f + "#"); await p.waitForTimeout(300);
ck((await state("Buffet Dinner")).startsWith("LIVE") || (await state("Door Prize")) !== "?", "changing the demo time moves the night: Buffet " + await state("Buffet Dinner"));
// Turn off.
await p.goto(f + "#admin"); await p.waitForTimeout(300); await p.uncheck("#demo-on"); await p.waitForTimeout(300);
await p.goto(f + "#"); await p.waitForTimeout(300);
ck(await p.isHidden("#demo-banner") && (await state("PLINKO")) === "Finished", "off: back to real time");
const q = await (await b.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true })).newPage(); q.on("pageerror", (e) => errs.push("phone: " + e.stack.split("\n").slice(0, 3).join(" < ")));
await q.goto(f + "#admin", { waitUntil: "load" }); await q.waitForTimeout(600);
ck((await q.inputValue("#demo-when input[type=date]")) === "2026-10-29", "phone: default date is the event's day: " + await q.inputValue("#demo-when input[type=date]"));
await q.check("#demo-on"); await q.waitForTimeout(300);
ck(!(await q.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "phone: no sideways scroll with demo on");
await q.screenshot({ path: SHOTS + "/demo-phone.png" });
await q.locator("#demo-box").screenshot({ path: SHOTS + "/demo-box.png" });
ck(errs.length === 0, "no page errors " + errs.join(" | "));
console.log(fail ? fail + " failed" : "all passed"); await b.close();
