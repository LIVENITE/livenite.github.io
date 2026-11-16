// MOTION-RULES.md checklist, run against the design preview with motion on:
// press-in, hover, selected look, glow where you were working, repeat-tap buttons instant and every tap counting,
// slides then glow, nothing else moving, panels sliding, errors shaking, reduce motion, and cards glowing as they go LIVE.
import { PREVIEW, SHOTS, launch, saveAll } from "./lib.mjs";
const b = await launch([], { motion: true });
const errs = []; let fail = 0; const ck = (ok, n) => { console.log(ok ? "PASS" : "FAIL", n); if (!ok) fail++; };
async function pick(p, root, date, hh, mm, ap) { const r = p.locator(root); await r.locator("input[type=date]").fill(date); await r.locator("input[type=date]").dispatchEvent("change"); await r.locator("select").nth(0).selectOption(String(hh)); await r.locator("select").nth(1).selectOption(String(mm)); await r.locator("select").nth(2).selectOption(ap); }
// Count slides on the run sheet: blocks and list items moving (their inline 250 ms transition), and panels sliding in or out.
// (Press-in also changes transform, but through the stylesheet, so it isn't counted.)
const count = () => {
  window.__vt = 0;
  document.addEventListener("transitionrun", (e) => { if (e.propertyName === "transform" && e.target.style && e.target.style.transition.includes("250ms") && e.target.closest("#view-runsheet")) window.__vt++; }, true);
  document.addEventListener("animationstart", (e) => { if (["panel-in", "slide-up", "slide-down"].includes(e.animationName) && e.target.closest && e.target.closest("#view-runsheet")) window.__vt++; }, true);
};
async function open(viewport, opts = {}, hash = "#runsheet", time = "2026-10-29T21:20:00-04:00") {
  const ctx = await b.newContext({ viewport, ignoreHTTPSErrors: true, timezoneId: "America/Toronto", ...opts });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message));
  await p.addInitScript(count);
  await p.clock.install({ time: new Date(time) });
  await p.goto(PREVIEW + hash, { waitUntil: "load" }); await p.waitForTimeout(600);
  if (hash === "#runsheet") await setTimes(p);
  return p;
}
async function setTimes(p) {
  await pick(p, "#ev-start .dtpick", "2026-10-29", 7, 0, "PM"); await pick(p, "#ev-end .dtpick", "2026-10-30", 2, 0, "AM");
  await p.click("#ev-apply"); await p.waitForTimeout(400); await p.locator("#rs-savebar button", { hasText: /^Save all$/ }).click(); await p.waitForTimeout(400);
}
const vt = (p) => p.evaluate(() => window.__vt);
const settle = (p) => p.waitForTimeout(350); // a slide takes 250 ms, then the glow starts
const has = (p, sel, cls) => p.evaluate(([s, c]) => [...document.querySelectorAll(s)].some((n) => n.classList.contains(c)), [sel, cls]);
const PLINKO = "a4GoYqZ75BN9fHN0nOx9";

// ================= Laptop run sheet =================
let p = await open({ width: 1280, height: 1000 });
const bar = (id) => `#rs-tl .bar[data-id="${id}"]`;
// Rule 3: selecting is instant and the block turns white with its own-colour stripe.
let n0 = await vt(p);
await p.locator(bar(PLINKO)).click(); await p.waitForTimeout(150);
const look = await p.evaluate((s) => { const n = document.querySelector(s), cs = getComputedStyle(n); return { bg: cs.backgroundImage, color: cs.color, sel: n.classList.contains("sel") }; }, bar(PLINKO));
ck(await vt(p) === n0, "selecting a block changes instantly (no slide)");
ck(look.sel && look.bg.includes("linear-gradient") && look.bg.includes("255, 255, 255") && look.color === "rgb(11, 42, 46)", "selected block is white with a stripe of its own colour, dark text");
// Rule 2: strong hover on blocks and main buttons (computers only).
const fine = await p.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches);
if (fine) {
  await p.hover(bar("MeBxoJbmr1iSLrR9Qeyd")); await p.waitForTimeout(200);
  ck(await p.evaluate((s) => getComputedStyle(document.querySelector(s)).transform !== "none", bar("MeBxoJbmr1iSLrR9Qeyd")), "hovering a block lifts it");
} else console.log("SKIP hover (this browser reports no mouse)");
// Rule 1: press-in.
await p.locator("#rs-late-btn").scrollIntoViewIfNeeded(); const sv = await p.locator("#rs-late-btn").boundingBox();
await p.mouse.move(sv.x + 10, sv.y + 10); await p.mouse.down(); await p.waitForTimeout(150);
ck(await p.evaluate(() => getComputedStyle(document.getElementById("rs-late-btn")).transform.startsWith("matrix(0.95")), "a button presses in while held");
await p.mouse.move(5, 5); await p.mouse.up(); await p.waitForTimeout(150);
// Rules 4 and 5: +5 in the side panel is instant, its row glows, the timeline block doesn't, other blocks stay still.
const others = () => p.evaluate((id) => [...document.querySelectorAll("#rs-tl .bar")].filter((n) => n.dataset.id !== id).map((n) => { const r = n.getBoundingClientRect(); return Math.round(r.x) + "," + Math.round(r.y) + "," + Math.round(r.width); }).join("|"), PLINKO);
const before = await others();
n0 = await vt(p);
const plus5 = p.locator('#rs-side [data-row="s"] button', { hasText: "+5" });
await plus5.click(); await p.waitForTimeout(80);
ck(await vt(p) === n0, "+5 changes instantly (no slide)");
ck(await has(p, '#rs-side [data-row="s"] .time-big', "glow-text") && await has(p, '#rs-side [data-row="e"] .time-big', "glow-text"), "the side panel's new Start and End times glow");
ck(!(await has(p, bar(PLINKO), "glow")), "the timeline block doesn't glow (the glow is where you were working)");
ck(await others() === before, "nothing else on the timeline moved or resized");
// Quick-tap check: 5 fast taps all count (8:35 after the first, so 9:00 after 5 more).
const bx = await plus5.boundingBox();
for (let i = 0; i < 5; i++) { await p.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2); await p.waitForTimeout(60); }
await p.waitForTimeout(200);
const startNow = await p.locator('#rs-side [data-row="s"] .time-big').textContent();
ck(startNow.startsWith("9:00"), "quick-tap check: 6 taps of +5 moved the start 30 minutes (" + startNow + ")");
// Rule 6: a venue change slides, then the venue row glows.
n0 = await vt(p);
const venues = await p.locator('#rs-side [data-row="v"] select option').evaluateAll((o) => o.map((x) => x.value));
const curV = await p.locator('#rs-side [data-row="v"] select').inputValue();
const t0 = Date.now();
await p.locator('#rs-side [data-row="v"] select').selectOption(venues.find((v) => v !== curV));
await p.waitForTimeout(60);
ck(await vt(p) > n0, "changing the venue slides");
await settle(p);
ck(Date.now() - t0 < 900, "the slide is quick (finished in " + (Date.now() - t0) + " ms, including test overhead)");
ck(!(await has(p, '#rs-side [data-row="v"]', "glow")), "a venue change doesn't glow (you're already looking at the dropdown)");
// Running late: Add to changes slides, then the moved blocks glow.
await p.locator("#rs-savebar button", { hasText: "Cancel" }).click(); await settle(p); await p.waitForTimeout(300);
ck(await has(p, bar(PLINKO), "glow"), "Cancel slides back and the reverted block glows");
await p.click("#rs-late-btn"); await settle(p);
n0 = await vt(p);
await p.locator("#rs-side button", { hasText: "Add to changes" }).click(); await settle(p); await p.waitForTimeout(50);
ck(await vt(p) > n0 && await has(p, bar("MeBxoJbmr1iSLrR9Qeyd"), "glow"), "Running late: Add to changes slides, then the moved blocks glow");
await p.screenshot({ path: SHOTS + "/motion-laptop.png" });
// Taps keep working while things slide: Save all pressed straight after Apply (mid-slide) saves.
await p.locator('#rs-away .oi', { hasText: "STRONG" }).click(); await p.waitForTimeout(200);
await p.evaluate(() => window.__slidNames = []);
await p.evaluate(() => document.addEventListener("transitionrun", (e) => { if (e.propertyName === "transform" && e.target.style.transition.includes("250ms")) window.__slidNames.push(e.target.textContent); }, true));
await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await p.locator("#rs-side .exact button", { hasText: "Apply" }).click({ noWaitAfter: true });
await p.waitForTimeout(40);
// A real click at the button's spot, with the page scrolled to the bottom, so anything covering the bar would catch it.
await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
const svb = await p.locator("#rs-savebar button", { hasText: /^Save all$/ }).boundingBox();
ck(await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.textContent.trim() === "Save all", [svb.x + 20, svb.y + 15]), "nothing covers Save all at the bottom of the page (the footer used to)");
await p.mouse.click(svb.x + 20, svb.y + 15); await p.waitForTimeout(400);
ck((await p.textContent("#rs-savebar")).includes("No unsaved") && await p.locator('#rs-away .oi', { hasText: "STRONG" }).count() === 0, "Save all straight after Apply (while sliding) saves");
ck(!(await p.evaluate(() => window.__slidNames.some((t) => /Penny|PLINKO|Check-in/.test(t)))), "only items that really moved slid (a page scroll doesn't make everything slide)");
// Rule 11: a blocked change shakes its message.
await p.locator(bar("MeBxoJbmr1iSLrR9Qeyd")).click();
ck(!(await p.isVisible("#rs-side .exact-grid")) && (await p.textContent("#rs-side .exact-head")).startsWith("▸"), "the exact date and time section starts folded");
await p.locator("#rs-side .exact-head").click(); await p.waitForTimeout(60);
await pick(p, "#rs-side .exact-grid .field:nth-child(1) .dtpick", "2026-10-30", 3, 0, "AM");
await p.locator("#rs-side .exact button", { hasText: "Apply" }).click(); await p.waitForTimeout(60);
ck(await has(p, "#rs-toast", "shake"), "a blocked change shakes its message");
const cx = p.locator("#rs-savebar button", { hasText: "Cancel" }); if (await cx.isEnabled()) { await cx.click(); await settle(p); }
await p.context().close();

// ================= Phone run sheet =================
p = await open({ width: 390, height: 844 }, { isMobile: true, hasTouch: true });
const item = (id) => `#rs-list .pitem[data-rs="${id}"]`;
n0 = await vt(p);
await p.locator(item("MeBxoJbmr1iSLrR9Qeyd") + " .phead").click(); await settle(p);
ck(await vt(p) > n0, "opening an item's editor slides");
ck(await p.evaluate((s) => getComputedStyle(document.querySelector(s + " .phead")).backgroundImage.includes("255, 255, 255"), item("MeBxoJbmr1iSLrR9Qeyd")), "the open item's header is white with its own-colour stripe");
n0 = await vt(p);
await p.locator(item("MeBxoJbmr1iSLrR9Qeyd") + ' [data-row="e"] button', { hasText: "+10" }).click(); await p.waitForTimeout(80);
ck(await vt(p) === n0 && await has(p, item("MeBxoJbmr1iSLrR9Qeyd") + ' [data-row="e"] .time-big', "glow-text"), "+10 in the phone editor is instant and the new End time glows");
ck(await p.isVisible(item("MeBxoJbmr1iSLrR9Qeyd") + " .exact-headrow .unsaved"), "\"Unsaved change\" shows while the exact section is folded");
await p.locator(item("MeBxoJbmr1iSLrR9Qeyd") + " .exact-head").click(); await p.waitForTimeout(60);
await p.locator(item("MeBxoJbmr1iSLrR9Qeyd") + ' .exact button', { hasText: /^Undo$/ }).click(); await settle(p);
n0 = await vt(p);
await p.click("#rs-late-btn"); await p.waitForTimeout(60);
ck(await vt(p) > n0 && await p.evaluate(() => document.querySelector("#rs-sheet .sheet")?.classList.contains("sheet-in")), "Running late panel slides up");
await settle(p);
n0 = await vt(p);
await p.locator("#rs-sheet .seg span", { hasText: /^10/ }).click(); await p.waitForTimeout(80);
ck(await vt(p) === n0, "the By choices change instantly (repeat-tap)");
await p.locator("#rs-sheet button", { hasText: "Cancel" }).click(); await p.waitForTimeout(60);
ck(await vt(p) > n0, "Cancel slides the panel down");
await settle(p);
// Re-sorting keeps the edited activity in view.
const first = p.locator("#rs-list .pitem").filter({ hasNotText: "Done" }).filter({ hasNotText: "LIVE" }).first();
const id = await first.getAttribute("data-rs");
if (!(await first.evaluate((n) => n.classList.contains("open")))) { await first.locator(".phead").click(); await settle(p); }
if (!(await p.isVisible(item(id) + " .exact-grid"))) { await p.locator(item(id) + " .exact-head").click(); await p.waitForTimeout(60); }
await pick(p, item(id) + " .exact-grid .field:nth-child(1) .dtpick", "2026-10-30", 1, 0, "AM");
await p.locator(item(id) + " .exact button", { hasText: "Apply" }).click(); await settle(p); await p.waitForTimeout(900);
const box = await p.locator(item(id)).boundingBox();
ck(box && box.y + box.height > 0 && box.y < 844, "after re-sorting, the edited activity is still on screen");
await p.screenshot({ path: SHOTS + "/motion-phone.png" });
await p.context().close();

// ================= Admin and game screens =================
p = await open({ width: 1280, height: 1000 }, {}, "#admin");
await p.locator("#m-list .act-row").first().locator("button", { hasText: "Edit" }).click(); await p.waitForTimeout(60);
ck(await has(p, "#m-editor", "panel-in"), "the activity editor slides in");
ck(await p.evaluate(() => getComputedStyle(document.querySelector("#m-list .act-row.editing")).backgroundColor === "rgb(255, 255, 255)"), "the activity being edited is shown selected (white)");
await p.click("#m-cancel"); await p.waitForTimeout(60);
ck(await has(p, "#m-editor", "panel-out") && await p.isVisible("#m-editor"), "the editor slides out when closed");
await p.waitForTimeout(400);
ck(!(await p.isVisible("#m-editor")), "then it's hidden");
// Header, footer and Admin editors.
const pressed = async (sel) => { await p.locator(sel).first().scrollIntoViewIfNeeded(); const bx = await p.locator(sel).first().boundingBox(); await p.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await p.mouse.down(); await p.waitForTimeout(150);
  const t = await p.locator(sel).first().evaluate((n) => getComputedStyle(n).transform); await p.mouse.move(2, 2); await p.mouse.up(); return t.startsWith("matrix(0.95"); };
ck(await pressed("#mark") && await pressed(".topbar .admin-link") && await pressed("footer a"), "header title, header Admin button and footer links press in");
await p.locator('#a-nav button[aria-label="Move down"]').first().click(); await p.waitForTimeout(60);
ck(await p.evaluate(() => document.querySelector("#a-nav").children[1].classList.contains("glow")), "Admin menu: a moved item glows in its new place");
await p.click("#a-add-venue"); await p.waitForTimeout(60);
ck(await p.evaluate(() => document.querySelector("#a-venues").lastElementChild.classList.contains("glow")), "Admin venues: a new venue row glows");
await p.click("#n-cancel").catch(() => {}); await p.click("#v-cancel").catch(() => {}); await p.waitForTimeout(100);
await p.goto(PREVIEW + "#gm-" + PLINKO); await p.waitForTimeout(500);
const endBefore = await p.textContent("#gm-end");
await p.locator('[data-adjust="5"]').scrollIntoViewIfNeeded(); const adj = await p.locator('[data-adjust="5"]').boundingBox();
for (let i = 0; i < 5; i++) { await p.mouse.click(adj.x + 20, adj.y + 15); await p.waitForTimeout(60); }
await p.waitForTimeout(80);
ck(await has(p, "#gm-end", "glow-text"), "game screen: the End time glows after +5 min");
const endAfter = await p.textContent("#gm-end");
ck(endBefore.startsWith("9:30") && endAfter.startsWith("9:55"), "game screen: 5 quick taps of +5 min all count (" + endBefore + " → " + endAfter + ")");
await p.click("#gm-time-cancel"); await p.waitForTimeout(100);
await p.locator("#gm-win-form button[type=submit]").click(); await p.waitForTimeout(60);
ck(await has(p, "#gm-win-status", "shake"), "game screen: an error message shakes");
await p.fill("#gm-win-name", "Sam"); await p.locator("#gm-win-form button[type=submit]").click(); await p.waitForTimeout(60);
ck(await has(p, "#gm-win-list .win-row.adding", "glow"), "game screen: a newly added winner glows");
await p.context().close();

// ================= Reduce motion =================
p = await open({ width: 1280, height: 1000 }, { reducedMotion: "reduce" });
n0 = await vt(p);
await p.locator(bar("MeBxoJbmr1iSLrR9Qeyd")).click(); await p.waitForTimeout(80);
await p.locator('#rs-side [data-row="v"] select').selectOption({ index: 1 }); await p.waitForTimeout(80);
ck(await vt(p) === n0, "reduce motion: nothing slides");
await p.locator('#rs-side [data-row="s"] button', { hasText: "+5" }).click(); await p.waitForTimeout(60);
ck(await has(p, '#rs-side [data-row="s"] .time-big', "glow-text"), "reduce motion: the glow still shows");
await p.locator("#rs-side .exact-head").click(); await p.waitForTimeout(60);
await pick(p, "#rs-side .exact-grid .field:nth-child(1) .dtpick", "2026-10-30", 3, 0, "AM");
await p.locator("#rs-side .exact button", { hasText: "Apply" }).click(); await p.waitForTimeout(60);
ck(await has(p, "#rs-toast", "err-flash") && !(await has(p, "#rs-toast", "shake")), "reduce motion: errors flash red instead of shaking");
await p.locator("#rs-savebar button", { hasText: "Cancel" }).scrollIntoViewIfNeeded(); const sv2 = await p.locator("#rs-savebar button", { hasText: "Cancel" }).boundingBox();
await p.mouse.move(sv2.x + 10, sv2.y + 10); await p.mouse.down(); await p.waitForTimeout(150);
ck(await p.evaluate(() => { const n = [...document.querySelectorAll("#rs-savebar button")].find((x) => x.textContent === "Cancel"); return getComputedStyle(n).transform === "none"; }), "reduce motion: buttons don't shrink when pressed");
await p.mouse.up();
await p.context().close();

// ================= Guest cards glow as they go LIVE =================
p = await open({ width: 1280, height: 1000 }, {}, "#", "2026-10-29T21:59:50-04:00");
const buffetLive = () => p.evaluate(() => [...document.querySelectorAll("#cards .card")].some((c) => c.textContent.includes("Buffet") && c.classList.contains("glow")));
ck(!(await buffetLive()), "before 10:00 PM, the Buffet card isn't glowing");
await p.clock.runFor(12000); await p.waitForTimeout(100);
ck(await buffetLive(), "at 10:00 PM, the Buffet card glows once as it goes LIVE");
await p.context().close();

ck(!errs.length, "no page errors" + (errs.length ? ": " + errs.join(" | ") : ""));
await b.close();
console.log(fail ? fail + " failed" : "all passed");
process.exit(fail ? 1 : 0);
