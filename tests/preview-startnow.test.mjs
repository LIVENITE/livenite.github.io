import { PREVIEW, SHOTS, launch } from "./lib.mjs";
const f = PREVIEW;
const b = await launch();
const errs = []; let fail = 0; const ck = (ok, n) => { console.log(ok ? "PASS" : "FAIL", n); if (!ok) fail++; };
for (const [n, vp] of [["desk", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
  const p = await (await b.newContext({ viewport: vp, timezoneId: "America/Toronto" })).newPage(); p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(f, { waitUntil: "load" }); await p.waitForTimeout(500);
  const pl = await p.evaluate(() => [...document.querySelectorAll("#cards a")].find((a) => a.textContent.includes("PLINKO")).getAttribute("href"));
  ck((await p.locator("#cards a", { hasText: "PLINKO" }).locator(".c-state").textContent()) === "Finished", n + " PLINKO starts as Finished");
  await p.goto(f + pl.replace("a-", "gm-")); await p.waitForTimeout(300);
  const start0 = await p.textContent("#gm-start");
  await p.click("#gm-start-now");
  const nowClock = await p.evaluate(() => new Date(Math.floor(Date.now() / 60000) * 60000).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }));
  ck((await p.textContent("#gm-start")) === nowClock && (await p.textContent("#gm-start-was")).includes(start0), n + " Start now sets the draft start to now, saved one shown");
  ck((await p.textContent("#gm-time-status")) === "Unsaved changes", n + " Start now waits for Save");
  ck(!(await p.isDisabled("#gm-end-now")), n + " End now becomes available with the new start");
  await p.click("#gm-time-save"); await p.waitForTimeout(300);
  ck((await p.textContent("#gm-time-status")).includes("everywhere"), n + " saved: " + await p.textContent("#gm-time-status"));
  // TIME-4: the original slot is remembered and shown.
  ck((await p.textContent("#gm-was")).includes("Scheduled:") && (await p.textContent("#gm-was")).includes("8:30"), n + " game screen shows the original slot: " + await p.textContent("#gm-was"));
  await p.goto(f + "#"); await p.waitForTimeout(300);
  const card = p.locator("#cards a", { hasText: "PLINKO" });
  ck((await card.locator(".c-state").textContent()).startsWith("LIVE") && (await card.locator(".c-time").textContent()) === nowClock, n + " card shows LIVE at the new start time");
  await p.goto(f + pl); await p.waitForTimeout(200);
  ck((await p.textContent("#d-when")).startsWith(nowClock), n + " game page shows the new start: " + await p.textContent("#d-when"));
  await p.goto(f + "#admin"); await p.waitForTimeout(200);
  ck((await p.locator(".act-row", { hasText: "PLINKO" }).innerText()).includes(nowClock), n + " admin list shows the new start");
  if (n === "phone") { await p.goto(f + pl.replace("a-", "gm-")); await p.waitForTimeout(300); await p.locator("#gm-time-box").screenshot({ path: SHOTS + "/startnow-phone.png" }); }
}
{
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: "America/Toronto" })).newPage(); p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(f, { waitUntil: "load" }); await p.waitForTimeout(500);
  const pl = await p.evaluate(() => [...document.querySelectorAll("#cards a")].find((a) => a.textContent.includes("PLINKO")).getAttribute("href"));
  await p.goto(f + pl.replace("a-", "gm-")); await p.waitForTimeout(300);
  await p.click("#gm-start-now"); await p.click("#gm-time-save"); await p.waitForTimeout(300);
  await p.goto(f + "#admin"); await p.waitForTimeout(300);
  await p.locator(".act-row", { hasText: "PLINKO" }).getByRole("button", { name: "Edit" }).click();
  await p.fill("#m-len", "45"); await p.click("#m-form button[type=submit]"); await p.waitForTimeout(300);
  await p.goto(f + pl.replace("a-", "gm-")); await p.waitForTimeout(300);
  ck(!(await p.textContent("#gm-was")).includes("Scheduled"), "re-planning in the editor clears the original slot");
}
ck(errs.length === 0, "no page errors " + errs.join(" | "));
console.log(fail ? fail + " failed" : "all passed"); await b.close();
