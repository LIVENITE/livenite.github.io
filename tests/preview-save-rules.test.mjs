// DATA-RULES checklist against the design preview (single page; multi-phone and offline run on the emulator).
import { PREVIEW, SHOTS, launch } from "./lib.mjs";
const f = PREVIEW;
const b = await launch();
const errs = []; let fail = 0; const ck = (ok, n) => { console.log(ok ? "PASS" : "FAIL", n); if (!ok) fail++; };
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); p.on("pageerror", (e) => errs.push(e.message));
const txt = (s) => p.textContent(s);
await p.goto(f + "#admin", { waitUntil: "load" }); await p.waitForTimeout(500);

// Title section: two fields in a row, nothing saves until Save (items 1, 8).
ck(await p.isDisabled("#t-save"), "Save starts disabled with no changes");
await p.fill("#a-eyebrow", "Saturday Night"); await p.fill("#a-brand", "M & D");
ck((await txt("#t-status")) === "Unsaved changes" && !(await p.isDisabled("#t-save")), "unsaved changes shown, Save lights up");
ck((await txt("#brand")) === "Marissa & Dan", "page title unchanged before Save");
await p.click("#t-save"); await p.waitForTimeout(200);
ck((await txt("#t-status")).startsWith("Saved") && (await txt("#brand")) === "M & D" && (await txt("#eyebrow")) === "Saturday Night", "both title fields saved together");
// Cancel puts back what's saved (item 2).
await p.fill("#a-brand", "Oops"); await p.click("#t-cancel");
ck((await p.inputValue("#a-brand")) === "M & D" && (await txt("#t-status")) === "", "Cancel restores the saved title");

// Menu: rename two items and move one, then Save.
const navIn = p.locator("#a-nav li input[type=text]");
await navIn.nth(0).fill("Home"); await navIn.nth(2).fill("Fifty Fifty");
await p.locator("#a-nav li").nth(2).locator("button", { hasText: "↑" }).click();
ck((await txt("#n-status")) === "Unsaved changes", "menu edits wait for Save");
await p.click("#n-save"); await p.waitForTimeout(200);
const top = await p.$$eval("#nav a", (l) => l.map((a) => a.textContent).join(","));
ck(top.startsWith("Home,Fifty Fifty"), "menu rename + move saved: " + top);

// Venues: edit several, add one, Save; blank name blocked; in-use can't be removed (item 7).
const vIn = p.locator("#a-venues li input");
await vIn.nth(0).fill("Front Hall"); await vIn.nth(3).fill("Patio");
await p.click("#a-add-venue"); await p.keyboard.type("Garden");
ck(await p.locator("#a-venues li").nth(0).locator("button").isDisabled(), "venue in use can't be removed");
await p.click("#v-save"); await p.waitForTimeout(200);
const names = await vIn.evaluateAll((l) => l.map((i) => i.value));
ck(names.join() === "Front Hall,Main Stage,Starlight Lounge,Patio,Garden", "all venue edits saved: " + names.join(", "));
await p.click("#a-add-venue"); await p.click("#v-save");
ck((await txt("#v-status")).includes("name"), "blank venue name blocked: " + await txt("#v-status"));
await p.click("#v-cancel");

// Leaving with unsaved changes asks; Stay keeps them; Leave discards (item 2).
await p.fill("#a-tagline", "Draft tagline");
await p.click("#view-admin a.back"); await p.waitForTimeout(200);
ck(await p.isVisible("#leave-bar") && (await p.evaluate(() => location.hash)) === "#admin", "leaving asks first and stays put");
await p.click("#leave-stay");
ck((await p.inputValue("#a-tagline")) === "Draft tagline", "Stay keeps the draft");
await p.click("#view-admin a.back"); await p.click("#leave-go"); await p.waitForTimeout(300);
ck(!(await p.isVisible("#view-admin")) && (await txt("#tagline")) !== "Draft tagline", "Leave without saving discards and leaves");

// Activity editor: Save only changes edited fields; switching away while edited asks.
await p.goto(f + "#admin"); await p.waitForTimeout(300);
await p.locator(".act-row", { hasText: "PLINKO" }).getByRole("button", { name: "Edit" }).click();
await p.fill("#m-tag", "Win a vacuum!");
await p.locator(".act-row", { hasText: "CORNHOLE" }).getByRole("button", { name: "Edit" }).click();
ck(await p.isVisible("#leave-bar"), "opening another activity with unsaved edits asks first");
await p.click("#leave-stay"); await p.click("#m-form button[type=submit]"); await p.waitForTimeout(200);
ck((await txt("#m-done")).startsWith("Saved"), "editor Save works");
await p.goto(f + "#"); await p.waitForTimeout(200);
const plinko = await p.locator("#cards a", { hasText: "PLINKO" }).innerText();
ck(plinko.includes("Win a vacuum!") && plinko.includes("Priya S."), "edited tagline saved, winners untouched");

// Game screen: +5 waits for Save; Cancel undoes; Add winner waits for Save.
const pl = await p.evaluate(() => [...document.querySelectorAll("#cards a")].find((a) => a.textContent.includes("PLINKO")).getAttribute("href"));
await p.goto(f + pl.replace("a-", "gm-")); await p.waitForTimeout(300);
const end0 = await txt("#gm-end");
await p.click("[data-adjust='5']");
ck((await txt("#gm-end")) !== end0 && (await txt("#gm-time-status")) === "Unsaved changes", "+5 changes the draft only");
await p.click("#gm-time-cancel");
ck((await txt("#gm-end")) === end0, "Cancel puts the end time back");
await p.click("[data-adjust='10']"); await p.click("#gm-time-save"); await p.waitForTimeout(200);
ck((await txt("#gm-time-status")).startsWith("Saved"), "end time saved: " + await txt("#gm-time-status"));
await p.fill("#gm-win-name", "Alex P."); await p.click("#gm-win-form button[type=submit]");
ck((await txt("#gm-win-status")) === "Unsaved changes", "added winner waits for Save");
await p.locator("#gm-win-list li").nth(0).locator("button").click();
await p.click("#gm-win-save"); await p.waitForTimeout(200);
await p.goto(f + pl); await p.waitForTimeout(200);
const wins = await p.$$eval("#d-winners li", (l) => l.map((x) => x.textContent).join(","));
ck(wins === "Tom R. (blackout),Alex P.", "winner add + remove saved together: " + wins);

// Draws: ticket typing waits for Save; Claimed saves instantly (item 8).
const pr = await p.evaluate(() => [...document.querySelectorAll("a")].find((a) => a.textContent.includes("Penny Raffle")).getAttribute("href"));
await p.goto(f + "#gm-" + pr.split("a-")[1]); await p.waitForTimeout(300);
const row = (i) => p.locator("#gm-slots li").nth(i);
await row(3).locator("input.tno").fill("123456"); await row(4).locator("input").first().fill("Pizza");
ck((await txt("#gm-draws-status")) === "Unsaved changes", "ticket edits wait for Save");
await row(5).locator("input[type=checkbox]").check(); await p.waitForTimeout(300);
ck((await row(5).locator(".tick-saved").textContent()) === "Saved", "Claimed saves instantly");
ck((await p.inputValue("#gm-slots li:nth-child(4) input.tno")) === "123456", "instant claim didn't disturb the draft");
await p.click("#gm-add-slot"); 
ck(await p.locator("#gm-slots li").last().locator("input[type=checkbox]").isDisabled(), "new unsaved prize can't be claimed yet");
await p.click("#gm-draws-save"); await p.waitForTimeout(300);
await p.goto(f + pr); await p.waitForTimeout(200);
const tix = await p.$$eval("#d-tix li", (l) => l.map((x) => x.className + ":" + x.textContent));
ck(tix.length === 11 && tix[3].includes("123456") && tix[4].includes("Pizza") && tix[5].startsWith("claimed"), "ticket list saved with the instant claim kept");
await p.fill("#d-search", "123456"); ck((await txt("#d-search-msg")).includes("winner"), "saved ticket is searchable");

// Delete: two taps (item 7 covered by venues above).
await p.goto(f + "#admin"); await p.waitForTimeout(200);
await p.locator(".act-row", { hasText: "Buffet Dinner" }).getByRole("button", { name: "Edit" }).click();
await p.click("#m-delete");
ck((await txt("#m-delete")) === "Tap again to delete", "delete needs a second tap");
await p.click("#m-delete"); await p.waitForTimeout(200);
ck(await p.locator(".act-row", { hasText: "Buffet Dinner" }).count() === 0, "second tap deletes");

ck(errs.length === 0, "no page errors " + errs.join(" | "));
console.log(fail ? fail + " failed" : "all passed"); await b.close();
