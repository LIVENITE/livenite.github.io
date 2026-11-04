import { PREVIEW, SHOTS, launch } from "./lib.mjs";
const f = PREVIEW;
const b = await launch();
const errs = []; let fail = 0; const ck = (ok, n) => { console.log(ok ? "PASS" : "FAIL", n); if (!ok) fail++; };
for (const [n, vp] of [["desk", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
  const p = await (await b.newContext({ viewport: vp, ignoreHTTPSErrors: true })).newPage(); p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(f, { waitUntil: "load" }); await p.waitForTimeout(800);
  const pr = await p.evaluate(() => [...document.querySelectorAll("a")].find((a) => a.textContent.includes("Penny Raffle")).getAttribute("href"));
  await p.goto(f + "#gm-" + pr.split("a-")[1]); await p.waitForTimeout(300);
  const row = p.locator("#gm-slots li").nth(1);
  await row.locator("input.wname-in").fill("Jamie L.");
  ck((await p.textContent("#gm-draws-status")) === "Unsaved changes", n + " winner's name waits for Save");
  await p.locator("#gm-draws-panel").screenshot({ path: SHOTS + "/wname-" + n + ".png" });
  await p.click("#gm-draws-save"); await p.waitForTimeout(300);
  await p.goto(f + pr); await p.waitForTimeout(300);
  ck((await p.locator("#d-tix li").nth(1).innerText()).includes("Jamie L."), n + " guest list shows the name");
  ck(!(await p.locator("#d-tix li").nth(2).innerText()).includes("undefined"), n + " prizes without a name show nothing extra");
  await p.fill("#d-search", "1388"); ck((await p.textContent("#d-search-msg")).includes("won by Jamie L."), n + " search names the winner: " + await p.textContent("#d-search-msg"));
  ck(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), n + " no sideways scroll");
}
ck(errs.length === 0, "no page errors " + errs.join(" | "));
console.log(fail ? fail + " failed" : "all passed"); await b.close();
