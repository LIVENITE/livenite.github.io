import { PREVIEW, SHOTS, launch } from "./lib.mjs";
const f = PREVIEW;
const b = await launch();
const errs = []; let fail = 0; const ck = (ok, n) => { console.log(ok ? "PASS" : "FAIL", n); if (!ok) fail++; };
async function pick(p, root, date, hh, mm, ap) { const r = p.locator(root); await r.locator("input[type=date]").fill(date); await r.locator("input[type=date]").dispatchEvent("change"); await r.locator("select").nth(0).selectOption(String(hh)); await r.locator("select").nth(1).selectOption(String(mm)); await r.locator("select").nth(2).selectOption(ap); }
const p = await (await b.newContext({ viewport: { width: 1280, height: 1000 }, ignoreHTTPSErrors: true, timezoneId: "America/Toronto" })).newPage(); p.on("pageerror", (e) => errs.push(e.message));
// Pretend it's 9:20 PM on the night of the event.
await p.clock.install({ time: new Date("2026-10-29T21:20:00-04:00") });
const t = (s) => p.textContent(s);
await p.goto(f + "#admin", { waitUntil: "load" }); await p.waitForTimeout(800);
ck(await p.isVisible("#rs-open"), "Admin has an Open the run sheet button");
await p.click("#rs-open"); await p.waitForTimeout(500);
ck(await p.isVisible("#view-runsheet") && (await t("#ev-summary")) === "", "run sheet opens; event times not set yet");
ck((await t("#ev-status")).startsWith("Not set yet"), "asks for event times");
ck(await p.isVisible("#rs-empty") && !(await p.isVisible("#rs-tl-panel")) && !(await p.isVisible("#rs-toolbar")) && !(await p.isVisible("#rs-savebar")), "run sheet is blank until event times are set");
// EVT-1: Apply refuses times that can never work, on the spot, and stages nothing.
await pick(p, "#ev-start .dtpick", "2026-10-29", 7, 0, "PM"); await pick(p, "#ev-end .dtpick", "2026-10-30", 8, 30, "AM");
await p.click("#ev-apply"); await p.waitForTimeout(200);
ck((await t("#ev-status")).includes("Can't apply") && (await t("#ev-status")).includes("12 hours") && await p.isVisible("#rs-empty"), "Apply refuses 13 h 30 min and stages nothing: " + await t("#ev-status"));
// Set event times 7:30 PM Oct 29 → 2:00 AM Oct 30: Apply stages them, Save all saves them.
await pick(p, "#ev-start .dtpick", "2026-10-29", 7, 30, "PM"); await pick(p, "#ev-end .dtpick", "2026-10-30", 2, 0, "AM");
ck((await t("#ev-status")).includes("Press Apply"), "picked but not applied: asks for Apply");
await p.click("#ev-apply"); await p.waitForTimeout(300);
ck((await t("#ev-summary")).includes("7:30 PM") && (await t("#ev-summary")).includes("6 h 30 min") && (await t("#ev-summary")).includes("unsaved"), "event times applied, not saved yet: " + await t("#ev-summary"));
ck((await t("#ev-status")).includes("Save all") && (await t("#rs-savebar")).includes("New event times"), "the bottom bar offers Save all for the new event times");
ck(!(await p.isVisible("#rs-empty")) && await p.isVisible("#rs-tl-panel"), "the run sheet appears once event times are applied");
ck(await p.locator("#rs-away .oi").count() === 3, "3 activities listed outside event hours");
await p.locator("#rs-savebar button", { hasText: /^Save all$/ }).click(); await p.waitForTimeout(300);
ck(!(await t("#ev-summary")).includes("unsaved") && (await t("#rs-savebar")).includes("No unsaved"), "Save all saves the event times");
// Guest home page shows them.
await p.goto(f + "#"); await p.waitForTimeout(300);
ck((await t("#event-when")).includes("7:30 PM – 2:00 AM"), "home shows event times: " + await t("#event-when"));
// Bring Cornhole in with the pickers, push past the end, Save all refused, extend & save.
await p.goto(f + "#runsheet"); await p.waitForTimeout(400);
await p.locator("#rs-away .oi", { hasText: "CORNHOLE" }).click();
await p.locator("#rs-side .exact button", { hasText: "Apply" }).click();
await p.locator("#rs-savebar button", { hasText: /^Save all$/ }).click(); await p.waitForTimeout(300);
ck(await p.locator("#rs-away .oi", { hasText: "CORNHOLE" }).count() === 0, "Cornhole brought into the event and saved");
await p.click("#rs-late-btn"); await p.locator("#rs-side .seg span", { hasText: /^30/ }).click();
await p.locator("#rs-side button", { hasText: "Add to changes" }).click();
ck((await t("#rs-savebar")).includes("Can't save"), "Save all refused past the end: " + (await t("#rs-savebar")).slice(0, 80));
await p.locator("#rs-savebar button", { hasText: "& save all" }).click(); await p.waitForTimeout(300);
ck((await t("#ev-summary")).includes("2:30 AM") && (await t("#rs-savebar")).includes("No unsaved"), "extended to 2:30 AM and saved together: " + await t("#ev-summary"));
// Moves follow the applied event times: with the end applied (not saved) at 3:00 AM, an activity can move to end at 2:45 AM.
await pick(p, "#ev-end .dtpick", "2026-10-30", 3, 0, "AM"); await p.click("#ev-apply"); await p.waitForTimeout(200);
await p.locator("#rs-tl .bar", { hasText: "Buffet" }).click();
await p.locator("#rs-side .exact-head").click();
await pick(p, "#rs-side .exact-grid .field:nth-child(1) .dtpick", "2026-10-30", 1, 45, "AM"); await pick(p, "#rs-side .exact-grid .field:nth-child(2) .dtpick", "2026-10-30", 2, 45, "AM");
await p.locator("#rs-side .exact button", { hasText: "Apply" }).click(); await p.waitForTimeout(200);
ck((await t("#rs-savebar")).includes("1 unsaved change + new event times"), "a move into the applied (unsaved) extra time is allowed: " + (await t("#rs-savebar")).slice(0, 60));
await p.locator("#rs-savebar button", { hasText: "Cancel" }).click(); await p.waitForTimeout(300);
ck((await t("#ev-summary")).includes("2:30 AM") && !(await t("#ev-summary")).includes("unsaved") && (await t("#rs-savebar")).includes("No unsaved"), "Cancel at the bottom drops the move and the applied event times");
// Shrinking the event can't strand activities: Apply allows it, Save all refuses.
await pick(p, "#ev-end .dtpick", "2026-10-29", 11, 0, "PM"); await p.click("#ev-apply"); await p.waitForTimeout(200);
ck((await t("#rs-savebar")).includes("Can't save") && (await t("#rs-savebar")).includes("Buffet"), "Save all refuses event times that leave activities outside: " + (await t("#rs-savebar")).slice(0, 90));
await p.locator("#rs-savebar button", { hasText: "Cancel" }).click(); await p.waitForTimeout(300);
// TIME-4: pushed activities remember where they were originally scheduled.
await p.locator("#rs-tl .bar", { hasText: "Buffet" }).click();
ck((await p.textContent("#rs-side")).includes("Originally scheduled 10:00 – 11:00"), "a pushed activity shows its original slot");
// Venue change through the run sheet shows on the guest card.
await p.locator("#rs-tl .bar", { hasText: "PLINKO" }).click();
await p.selectOption("#rs-side select[aria-label=Venue]", "lounge");
await p.locator("#rs-savebar button", { hasText: /^Save all$/ }).click(); await p.waitForTimeout(300);
await p.goto(f + "#"); await p.waitForTimeout(300);
ck((await p.locator("#cards a", { hasText: "PLINKO" }).innerText()).toUpperCase().includes("STARLIGHT LOUNGE"), "PLINKO's new venue shows on its card");
// Leaving with unsaved run sheet changes asks first.
await p.goto(f + "#runsheet"); await p.waitForTimeout(300);
await p.locator("#rs-tl .bar", { hasText: "Buffet" }).click();
await p.locator("#rs-side .time-row").nth(1).locator("button", { hasText: "+10" }).click();
await p.click("#view-runsheet a.back"); await p.waitForTimeout(200);
ck(await p.isVisible("#leave-bar"), "leaving with unsaved run sheet changes asks first");
await p.click("#leave-go"); await p.waitForTimeout(400);
console.log("  after leave:", await p.evaluate(() => location.hash), "admin shown:", await p.isVisible("#view-admin"), "rows:", await p.locator(".act-row").count(), "rs shown:", await p.isVisible("#view-runsheet"));
// Activity editor respects event hours.
await p.locator(".act-row", { hasText: "Buffet" }).getByRole("button", { name: "Edit" }).click();
await p.fill("#m-start", "2026-10-30T05:00"); await p.click("#m-form button[type=submit]");
ck((await t("#m-status")).includes("outside event hours"), "editor blocks a time outside the event: " + await t("#m-status"));
await p.click("#m-cancel");
const q = await (await b.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true, timezoneId: "America/Toronto" })).newPage(); q.on("pageerror", (e) => errs.push(e.message));
await q.clock.install({ time: new Date("2026-10-29T21:20:00-04:00") });
await q.goto(f + "#runsheet", { waitUntil: "load" }); await q.waitForTimeout(800);
ck(await q.isVisible("#rs-empty") && !(await q.isVisible("#rs-list")), "phone: blank until event times are set");
await pick(q, "#ev-start .dtpick", "2026-10-29", 7, 30, "PM"); await pick(q, "#ev-end .dtpick", "2026-10-30", 2, 0, "AM");
await q.click("#ev-apply"); await q.waitForTimeout(300);
await q.locator("#rs-savebar button", { hasText: /^Save all$/ }).click(); await q.waitForTimeout(300);
ck(await q.isVisible("#rs-list") && await q.locator("#rs-list .pitem").count() >= 1, "phone: run sheet list shows once times are saved");
ck(!(await q.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "phone: no sideways scroll");
await p.goto(f + "#runsheet"); await p.waitForTimeout(400); await p.evaluate(() => document.getElementById("rs-savebar").style.display = "none");
await p.screenshot({ path: SHOTS + "/rs-design.png", fullPage: true });
ck(errs.length === 0, "no page errors " + errs.join(" | "));
console.log(fail ? fail + " failed" : "all passed"); await b.close();
