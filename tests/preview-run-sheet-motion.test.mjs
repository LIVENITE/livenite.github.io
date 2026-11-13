// Run sheet motion on taps: taps glide (View Transitions), what changed glows, the phone panel slides up,
// the edited activity stays in view, the preview-only speed switch works, and none of it is in the live site's files.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PREVIEW, SHOTS, REPO, launch } from "./lib.mjs";
const b = await launch([], { motion: true });
const errs = []; let fail = 0; const ck = (ok, n) => { console.log(ok ? "PASS" : "FAIL", n); if (!ok) fail++; };
async function pick(p, root, date, hh, mm, ap) { const r = p.locator(root); await r.locator("input[type=date]").fill(date); await r.locator("input[type=date]").dispatchEvent("change"); await r.locator("select").nth(0).selectOption(String(hh)); await r.locator("select").nth(1).selectOption(String(mm)); await r.locator("select").nth(2).selectOption(ap); }
// Count every glide the page starts.
const count = () => { window.__vt = 0; const o = Document.prototype.startViewTransition; if (o) Document.prototype.startViewTransition = function (cb) { window.__vt++; return o.call(this, cb); }; };
async function open(viewport, opts = {}) {
  const ctx = await b.newContext({ viewport, ignoreHTTPSErrors: true, timezoneId: "America/Toronto", ...opts });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message));
  await p.addInitScript(count);
  await p.clock.setFixedTime(new Date("2026-10-29T21:20:00-04:00"));
  await p.goto(PREVIEW + "#runsheet", { waitUntil: "load" }); await p.waitForTimeout(600);
  await setTimes(p);
  return p;
}
// Reloading the preview starts again from its copy of the data, so event times are set each time.
async function setTimes(p) {
  await pick(p, "#ev-start .dtpick", "2026-10-29", 7, 0, "PM"); await pick(p, "#ev-end .dtpick", "2026-10-30", 2, 0, "AM");
  await p.click("#ev-save"); await p.waitForTimeout(400);
}
const vt = (p) => p.evaluate(() => window.__vt);

// ---- Laptop ----
let p = await open({ width: 1280, height: 1000 });
ck(await p.evaluate(() => typeof document.startViewTransition) === "function", "this browser has the View Transitions feature");
ck(await p.evaluate(() => [...document.querySelectorAll("#rs-tl .bar")].every((x) => x.style.viewTransitionName.startsWith("rsb-"))), "every timeline block is tagged so the browser can follow it");
let n0 = await vt(p);
await p.locator("#rs-tl .bar", { hasText: "Buffet" }).click(); await p.waitForTimeout(400);
ck(await vt(p) === n0 + 1, "selecting an activity glides");
ck((await p.textContent("#rs-side")).includes("Buffet"), "the side panel shows the selected activity");
await p.waitForFunction(() => !document.documentElement.classList.contains("rs-moving"), null, { timeout: 3000 }).catch(() => {});
ck(await p.evaluate(() => !document.documentElement.classList.contains("rs-moving")), "the glide tidies up after itself");
await p.locator("#rs-side button", { hasText: "+10" }).first().click(); await p.waitForTimeout(80);
ck(await p.locator("#rs-tl .bar.rs-flash", { hasText: "Buffet" }).count() === 1, "the block that changed glows");
ck(await p.locator("#rs-tl .bar.rs-flash").count() === 1, "only the changed block glows");
await p.screenshot({ path: SHOTS + "/motion-laptop-glow.png" });
await p.waitForTimeout(500);
// Database-style redraws (window resize) don't glide.
n0 = await vt(p); await p.setViewportSize({ width: 1200, height: 1000 }); await p.waitForTimeout(300);
ck(await vt(p) === n0, "a redraw that isn't a tap (resize) doesn't glide");
// Quick taps: the second cancels the first glide, without a page error.
await p.locator("#rs-tl .bar", { hasText: "PLINKO" }).click({ noWaitAfter: true });
await p.locator("#rs-tl .bar", { hasText: "Buffet" }).click({ noWaitAfter: true, force: true });
await p.waitForTimeout(600);
ck(!errs.length, "quick taps cause no page errors" + (errs.length ? ": " + errs.join(" | ") : ""));
// Cancel brings it back, gliding, and the reverted block glows.
n0 = await vt(p); await p.locator("#rs-savebar button", { hasText: "Cancel" }).click(); await p.waitForTimeout(80);
ck(await vt(p) === n0 + 1 && await p.locator("#rs-tl .bar.rs-flash", { hasText: "Buffet" }).count() === 1, "Cancel glides back and the reverted block glows");
await p.waitForTimeout(500);
// The preview-only speed switch.
await p.goto(PREVIEW + "#admin"); await p.waitForTimeout(400);
ck(await p.isVisible("#motion-box"), "Admin shows the preview-only Animation speed panel");
ck(await p.isChecked('input[name="motion-speed"][value="normal"]'), "speed starts at Normal");
await p.check('input[name="motion-speed"][value="off"]');
await p.goto(PREVIEW + "#runsheet"); await p.waitForTimeout(400);
n0 = await vt(p); await p.locator("#rs-tl .bar", { hasText: "PLINKO" }).click(); await p.waitForTimeout(200);
ck(await vt(p) === n0 && (await p.textContent("#rs-side")).includes("PLINKO"), "Off: taps change instantly");
await p.reload(); await p.waitForTimeout(500);
await p.goto(PREVIEW + "#admin"); await p.waitForTimeout(300);
ck(await p.isChecked('input[name="motion-speed"][value="off"]'), "the chosen speed is remembered after a reload");
await p.check('input[name="motion-speed"][value="slow"]');
await p.goto(PREVIEW + "#runsheet"); await p.waitForTimeout(400); await setTimes(p); await p.waitForTimeout(900);
await p.locator("#rs-tl .bar", { hasText: "Buffet" }).click({ noWaitAfter: true }); await p.waitForTimeout(60);
ck(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--rs-motion").trim()) === "700ms", "Slow: glides take ¾ second");
await p.waitForTimeout(900);
await p.context().close();

// ---- Phone ----
p = await open({ width: 390, height: 844 }, { isMobile: true, hasTouch: true });
n0 = await vt(p);
await p.click("#rs-late-btn"); await p.waitForTimeout(80);
ck(await vt(p) === n0 + 1 && await p.evaluate(() => document.getElementById("rs-sheet").classList.contains("enter")), "Running late panel slides up when it opens");
await p.waitForTimeout(400);
await p.locator("#rs-sheet .seg span", { hasText: /^10/ }).click(); await p.waitForTimeout(400);
ck(await p.evaluate(() => !document.getElementById("rs-sheet").classList.contains("enter")), "it doesn't slide up again on every tap inside it");
await p.locator("#rs-sheet button", { hasText: "Cancel" }).click(); await p.waitForTimeout(400);
// Open the first upcoming item and move it to the end of the night: the list re-sorts and follows it.
const first = p.locator("#rs-list .pitem").filter({ hasNotText: "Done" }).filter({ hasNotText: "LIVE" }).first();
const id = await first.getAttribute("data-rs");
await first.locator("b").click(); await p.waitForTimeout(400);
ck(await p.locator('#rs-list .pitem.open[data-rs="' + id + '"]').count() === 1, "tapping an activity opens its editor");
const item = p.locator('#rs-list .pitem[data-rs="' + id + '"]');
await pick(p, '#rs-list .pitem[data-rs="' + id + '"] .exact-grid .field:nth-child(1) .dtpick', "2026-10-30", 1, 0, "AM");
await item.locator(".exact button").click(); await p.waitForTimeout(1200);
const box = await p.locator('#rs-list .pitem[data-rs="' + id + '"]').boundingBox();
ck(box && box.y > 0 && box.y < 844, "after re-sorting, the edited activity is still on screen (top at " + (box && Math.round(box.y)) + "px)");

await p.screenshot({ path: SHOTS + "/motion-phone-follow.png" });
await p.context().close();

// ---- Reduce motion: still works, glow still shows ----
p = await open({ width: 1280, height: 1000 }, { reducedMotion: "reduce" });
await p.locator("#rs-tl .bar", { hasText: "Buffet" }).click(); await p.waitForTimeout(400);
await p.locator("#rs-side button", { hasText: "+10" }).first().click(); await p.waitForTimeout(80);
ck(await p.locator("#rs-tl .bar.rs-flash", { hasText: "Buffet" }).count() === 1 && (await p.textContent("#rs-savebar")).includes("1 unsaved"), "reduce motion: the change applies and still glows");
await p.context().close();

// ---- The live site's files don't contain the speed switch ----
const site = readFileSync(join(REPO, "assets/site.js"), "utf8") + readFileSync(join(REPO, "index.html"), "utf8");
ck(!site.includes("livenite-motion") && !site.includes("motion-speed"), "the speed switch isn't in the live site's files");

ck(!errs.length, "no page errors" + (errs.length ? ": " + errs.join(" | ") : ""));
await b.close();
console.log(fail ? fail + " failed" : "all passed");
process.exit(fail ? 1 : 0);
