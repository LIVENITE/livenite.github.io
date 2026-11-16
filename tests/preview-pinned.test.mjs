// Things pinned to the screen (save bars, the unsaved-changes bar, the floating 50/50 badge, notes) are never covered,
// on every screen, at the top and the very bottom of the page, on laptop and phone (DATA-RULES rule 4, MOTION-RULES rule 14).
import { PREVIEW, launch } from "./lib.mjs";
const b = await launch();
const errs = []; let fail = 0; const ck = (ok, n) => { console.log(ok ? "PASS" : "FAIL", n); if (!ok) fail++; };
async function pick(p, root, date, hh, mm, ap) { const r = p.locator(root); await r.locator("input[type=date]").fill(date); await r.locator("input[type=date]").dispatchEvent("change"); await r.locator("select").nth(0).selectOption(String(hh)); await r.locator("select").nth(1).selectOption(String(mm)); await r.locator("select").nth(2).selectOption(ap); }
// Every visible element pinned to the screen that can be tapped: is it what's under the pointer, all over it?
const covered = (p) => p.evaluate(() => {
  const out = [];
  document.querySelectorAll("body *").forEach((n) => {
    const cs = getComputedStyle(n);
    if (cs.position !== "fixed" || cs.pointerEvents === "none" || cs.visibility === "hidden" || !n.getClientRects().length) return;
    n.querySelectorAll("a, button, select, input").forEach((t) => {
      const r = t.getBoundingClientRect(); if (!r.width || !r.height || r.bottom <= 0 || r.top >= innerHeight) return;
      // The centre and four points just inside the corners: any of them covered counts.
      const pts = [[0.5, 0.5], [0.15, 0.2], [0.85, 0.2], [0.15, 0.8], [0.85, 0.8]].map(([fx, fy]) => [r.left + r.width * fx, r.top + r.height * fy]).filter(([x, y]) => y > 0 && y < innerHeight);
      let hit = null;
      // Parts of the same pinned item (like the 50/50 badge's own × button) don't count as covering it.
      for (const [x, y] of pts) { const h = document.elementFromPoint(x, y); if (!h || !n.contains(h)) { hit = h || document.body; break; } }
      if (hit) out.push((t.textContent || t.id || t.tagName).trim().slice(0, 24) + " covered by " + (hit ? hit.tagName.toLowerCase() + "." + String(hit.className).split(" ")[0] + " «" + (hit.textContent || "").trim().slice(0, 20) + "»" : "nothing"));
    });
  });
  return [...new Set(out)];
});
for (const [name, vp] of [["laptop", { width: 1280, height: 800 }], ["phone", { width: 390, height: 844 }]]) {
  const p = await (await b.newContext({ viewport: vp, timezoneId: "America/Toronto", isMobile: name === "phone", hasTouch: name === "phone" })).newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  await p.clock.install({ time: new Date("2026-10-29T21:20:00-04:00") });
  await p.goto(PREVIEW + "#runsheet"); await p.waitForTimeout(600);
  await pick(p, "#ev-start .dtpick", "2026-10-29", 7, 0, "PM"); await pick(p, "#ev-end .dtpick", "2026-10-30", 1, 0, "AM");
  await p.click("#ev-apply"); await p.waitForTimeout(300); // leave event times applied, so the save bar shows
  const screens = [["run sheet", "#runsheet"], ["home", "#"], ["a Draws page", "#a-QOhRZRzw8VNC7pJeXeow"], ["the 50/50 page", "#a-05E8WIFNQItRBoL4B4bx"], ["Admin", "#admin"], ["a game screen", "#gm-a4GoYqZ75BN9fHN0nOx9"], ["a Draws screen", "#gm-QOhRZRzw8VNC7pJeXeow"], ["the 50/50 screen", "#gm-05E8WIFNQItRBoL4B4bx"]];
  for (const [label, hash] of screens) {
    if (hash !== "#runsheet") { await p.evaluate((h) => { location.hash = h; }, hash); await p.waitForTimeout(400); if (await p.isVisible("#leave-bar")) { await p.click("#leave-go"); await p.waitForTimeout(400); } }
    for (const where of ["top", "bottom"]) {
      await p.evaluate((w) => window.scrollTo(0, w === "top" ? 0 : document.documentElement.scrollHeight), where); await p.waitForTimeout(150);
      const c = await covered(p);
      ck(!c.length, name + ", " + label + ", " + where + " of the page: nothing pinned is covered" + (c.length ? " (" + c.join("; ") + ")" : ""));
    }
  }
  // The unsaved-changes bar: make a change on Admin, try to leave, check its buttons at the top and bottom of the page.
  await p.evaluate(() => { location.hash = "#admin"; }); await p.waitForTimeout(400);
  await p.fill("#a-mark", "Testing"); await p.evaluate(() => { location.hash = "#"; }); await p.waitForTimeout(300);
  ck(await p.isVisible("#leave-bar"), name + ": the unsaved-changes bar shows");
  for (const where of ["top", "bottom"]) {
    await p.evaluate((w) => window.scrollTo(0, w === "top" ? 0 : document.documentElement.scrollHeight), where); await p.waitForTimeout(150);
    const c = await covered(p);
    ck(!c.length, name + ", unsaved-changes bar, " + where + " of the page: nothing pinned is covered" + (c.length ? " (" + c.join("; ") + ")" : ""));
  }
  await p.context().close();
}
ck(!errs.length, "no page errors" + (errs.length ? ": " + errs.join(" | ") : ""));
await b.close();
console.log(fail ? fail + " failed" : "all passed");
process.exit(fail ? 1 : 0);
