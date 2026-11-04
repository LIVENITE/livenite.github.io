import { PREVIEW, SHOTS, launch } from "./lib.mjs";
const f = PREVIEW;
const b = await launch();
const errs = []; let fail = 0; const ck = (ok, n) => { console.log(ok ? "PASS" : "FAIL", n); if (!ok) fail++; };
for (const [n, vp] of [["desk", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
  const p = await (await b.newContext({ viewport: vp, ignoreHTTPSErrors: true })).newPage(); p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(f, { waitUntil: "load" }); await p.waitForTimeout(800);
  const id = (t) => p.evaluate((t) => [...document.querySelectorAll("#cards a")].find((a) => a.querySelector(".c-title").textContent === t).getAttribute("href").slice(3), t);
  const now = () => p.textContent("#gm-guide-steps li.now b");
  const pr = await id("Penny Raffle"), dp = await id("Door Prize"), ff = await id("50/50"), pl = await id("PLINKO");
  await p.goto(f + "#gm-" + pr); await p.waitForTimeout(300);
  ck(await p.isVisible("#gm-guide") && (await p.locator("#gm-guide-steps li").count()) === 5, n + " Draws screen shows the 5-step guide");
  ck((await now()).startsWith("End time passed"), n + " finished, not all drawn → step 4 highlighted: " + await now());
  if (n === "phone") await p.locator("#gm-guide").screenshot({ path: SHOTS + "/guide-phone.png" });
  await p.click("#gm-start-now"); await p.click("#gm-time-save"); await p.waitForTimeout(300);
  ck((await now()).startsWith("Drawing"), n + " after Start now → Drawing step: " + await now());
  await p.check("#gm-final"); await p.click("#gm-draws-save"); await p.waitForTimeout(300);
  ck((await now()) === "All tickets drawn", n + " after All drawn → step 3");
  await p.goto(f + "#gm-" + ff); await p.waitForTimeout(300);
  ck(await p.isVisible("#gm-guide") && (await p.textContent("#gm-guide-title")) === "How the 50/50 works", n + " 50/50 screen shows its own guide, now at: " + await now());
  await p.goto(f + "#gm-" + pl); await p.waitForTimeout(300);
  ck(!(await p.isVisible("#gm-guide")), n + " regular games have no draw guide");
  await p.goto(f + "#gm-" + dp); await p.waitForTimeout(300);
  await p.click("#gm-guide summary"); ck(!(await p.isVisible("#gm-guide-steps")), n + " guide folds away");
  ck(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), n + " no sideways scroll");
}
ck(errs.length === 0, "no page errors " + errs.join(" | "));
console.log(fail ? fail + " failed" : "all passed"); await b.close();
