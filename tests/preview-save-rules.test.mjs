// DATA-RULES checklist against the design preview (single page; multi-phone and offline run on the emulator).
// Every box has Apply (stages its changes) and Undo; the save bar at the bottom has Save all and Cancel (rule 4).
import { PREVIEW, launch, saveAll } from "./lib.mjs";
const f = PREVIEW;
const b = await launch();
const errs = []; let fail = 0; const ck = (ok, n) => { console.log(ok ? "PASS" : "FAIL", n); if (!ok) fail++; };
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); p.on("pageerror", (e) => errs.push(e.message));
const txt = (s) => p.textContent(s);
const bar = () => txt("#admin-savebar");
const saveBtn = (id) => p.locator("#" + id + " button", { hasText: /^Save all$/ });
await p.goto(f + "#admin", { waitUntil: "load" }); await p.waitForTimeout(500);

// Title section: two fields in a row; Apply stages them, nothing saves until Save all (items 1, 8, 10).
ck(await p.isDisabled("#t-save") && (await bar()).includes("No unsaved changes"), "Apply starts disabled, nothing to save");
await p.fill("#a-eyebrow", "Saturday Night"); await p.fill("#a-brand", "M & D");
ck((await txt("#t-status")).startsWith("Press Apply") && !(await p.isDisabled("#t-save")), "typed changes ask for Apply");
ck((await bar()).includes("Apply or undo the changes in Title section") && await saveBtn("admin-savebar").isDisabled(), "Save all waits until the box is applied");
await p.click("#t-save");
ck((await txt("#t-status")).startsWith("Applied") && (await bar()).includes("1 unsaved change") && (await txt("#brand")) === "Marissa & Dan", "Apply stages: nothing saved yet");
await saveAll(p);
ck((await txt("#brand")) === "M & D" && (await txt("#eyebrow")) === "Saturday Night" && (await bar()).includes("Saved 1 change"), "Save all saves both title fields together");
// Undo puts back what's saved (item 2); a change after Apply needs Apply again.
await p.fill("#a-brand", "Oops"); await p.click("#t-cancel");
ck((await p.inputValue("#a-brand")) === "M & D" && (await txt("#t-status")) === "", "Undo restores the saved title");
await p.fill("#a-brand", "First"); await p.click("#t-save"); await p.fill("#a-brand", "Second");
ck((await txt("#t-status")).startsWith("Press Apply") && await saveBtn("admin-savebar").isDisabled(), "a change after Apply needs Apply again before Save all");
await p.click("#t-cancel");
// Cancel in the save bar drops everything applied.
await p.fill("#a-tagline", "Dropped"); await p.click("#t-save");
await p.locator("#admin-savebar button", { hasText: "Cancel" }).click();
ck((await p.inputValue("#a-tagline")) !== "Dropped" && (await bar()).includes("No unsaved"), "Cancel at the bottom drops applied changes");

// Menu: rename two items and move one, Apply, Save all.
const navIn = p.locator("#a-nav li input[type=text]");
await navIn.nth(0).fill("Home"); await navIn.nth(2).fill("Fifty Fifty");
await p.locator("#a-nav li").nth(2).locator("button", { hasText: "↑" }).click();
ck((await txt("#n-status")).startsWith("Press Apply"), "menu edits wait for Apply");
await p.click("#n-save"); await saveAll(p);
const top = await p.$$eval("#nav a", (l) => l.map((a) => a.textContent).join(","));
ck(top.startsWith("Home,Fifty Fifty"), "menu rename + move saved: " + top);

// Venues: edit several, add one; blank name refused at Apply; in-use can't be removed (item 7).
const vIn = p.locator("#a-venues li input");
await vIn.nth(0).fill("Front Hall"); await vIn.nth(3).fill("Patio");
await p.click("#a-add-venue"); await p.keyboard.type("Garden");
ck(await p.locator("#a-venues li").nth(0).locator("button").isDisabled(), "venue in use can't be removed");
await p.click("#v-save"); await saveAll(p);
const names = await vIn.evaluateAll((l) => l.map((i) => i.value));
ck(names.join() === "Front Hall,Main Stage,Starlight Lounge,Patio,Garden", "all venue edits saved: " + names.join(", "));
await p.click("#a-add-venue"); await p.click("#v-save");
ck((await txt("#v-status")).includes("Can't apply") && (await txt("#v-status")).includes("name"), "blank venue name refused at Apply: " + await txt("#v-status"));
await p.click("#v-cancel");

// Leaving with changes (applied or not) asks; Stay keeps them; Leave discards (item 2).
await p.fill("#a-tagline", "Draft tagline");
await p.click("#view-admin a.back"); await p.waitForTimeout(200);
ck(await p.isVisible("#leave-bar") && (await p.evaluate(() => location.hash)) === "#admin", "leaving asks first and stays put");
await p.click("#leave-stay");
ck((await p.inputValue("#a-tagline")) === "Draft tagline", "Stay keeps the draft");
await p.click("#view-admin a.back"); await p.click("#leave-go"); await p.waitForTimeout(300);
ck(!(await p.isVisible("#view-admin")) && (await txt("#tagline")) !== "Draft tagline", "Leave without saving discards and leaves");

// Activity editor: Apply stages only the edited fields; switching away with changes not applied asks.
await p.goto(f + "#admin"); await p.waitForTimeout(300);
await p.locator(".act-row", { hasText: "PLINKO" }).getByRole("button", { name: "Edit" }).click();
await p.fill("#m-tag", "Win a vacuum!");
await p.locator(".act-row", { hasText: "CORNHOLE" }).getByRole("button", { name: "Edit" }).click();
ck(await p.isVisible("#leave-bar"), "opening another activity with changes not applied asks first");
await p.click("#leave-stay"); await p.click("#m-apply"); await p.waitForTimeout(200);
ck((await txt("#m-done")).startsWith("Applied") && (await p.locator(".act-row", { hasText: "PLINKO" }).innerText()).includes("Unsaved change"), "editor Apply stages the change and marks the row");
// Applied activity changes save together with a title change.
await p.fill("#a-tagline", "Together"); await p.click("#t-save");
ck((await bar()).includes("2 unsaved changes"), "two applied changes counted: " + (await bar()).slice(0, 30));
await saveAll(p);
await p.goto(f + "#"); await p.waitForTimeout(200);
const plinko = await p.locator("#cards a", { hasText: "PLINKO" }).innerText();
ck(plinko.includes("Win a vacuum!") && plinko.includes("Priya S.") && (await txt("#tagline")) === "Together", "Save all saved the tagline and the activity, winners untouched");
// Reopening an activity with applied changes shows them; Undo on its row drops them.
await p.goto(f + "#admin"); await p.waitForTimeout(300);
await p.locator(".act-row", { hasText: "CORNHOLE" }).getByRole("button", { name: "Edit" }).click();
await p.fill("#m-title", "CORN TOSS"); await p.click("#m-apply"); await p.waitForTimeout(150);
await p.locator(".act-row", { hasText: "CORN TOSS" }).getByRole("button", { name: "Edit" }).click();
ck((await p.inputValue("#m-title")) === "CORN TOSS" && !(await txt("#m-status")).startsWith("Press"), "reopening shows the applied change");
await p.click("#m-cancel"); await p.waitForTimeout(300);
await p.locator(".act-row", { hasText: "CORN TOSS" }).getByRole("button", { name: "Undo" }).click();
ck(await p.locator(".act-row", { hasText: "CORNHOLE" }).count() === 1 && (await bar()).includes("No unsaved"), "Undo on the row drops the applied change");

// Game screen: +5 is a draft; Undo undoes; Apply then Save all saves. Add winner too.
const pl = await p.evaluate(() => [...document.querySelectorAll(".act-row a")].find((a) => a.closest(".act-row").textContent.includes("PLINKO")).getAttribute("href"));
await p.goto(f + pl); await p.waitForTimeout(300);
const end0 = await txt("#gm-end");
await p.click("[data-adjust='5']");
ck((await txt("#gm-end")) !== end0 && (await txt("#gm-time-status")).startsWith("Press Apply"), "+5 changes the draft only");
await p.click("#gm-time-cancel");
ck((await txt("#gm-end")) === end0, "Undo puts the end time back");
await p.click("[data-adjust='10']"); await p.click("#gm-time-save");
ck((await txt("#gm-savebar")).includes("1 unsaved change"), "applied time counted in the save bar");
await p.fill("#gm-win-name", "Alex P."); await p.click("#gm-win-form button[type=submit]");
ck((await txt("#gm-win-status")).startsWith("Press Apply"), "added winner waits for Apply");
await p.locator("#gm-win-list li").nth(0).locator("button").click();
await p.click("#gm-win-save"); await saveAll(p);
ck((await txt("#gm-time-status")).startsWith("Saved") && (await txt("#gm-win-status")).startsWith("Saved"), "Save all saved the time and the winners");
await p.goto(f + pl.replace("#gm-", "#a-")); await p.waitForTimeout(200);
const wins = await p.$$eval("#d-winners li", (l) => l.map((x) => x.textContent).join(","));
ck(wins === "Tom R. (blackout),Alex P.", "winner add + remove saved together: " + wins);

// Draws: ticket typing waits for Apply; Claimed saves instantly (item 8).
const pr = await p.evaluate(() => [...document.querySelectorAll("a")].find((a) => a.textContent.includes("Penny Raffle")).getAttribute("href"));
await p.goto(f + "#gm-" + pr.split("a-")[1]); await p.waitForTimeout(300);
const row = (i) => p.locator("#gm-slots li").nth(i);
await row(3).locator("input.tno").fill("123456"); await row(4).locator("input").first().fill("Pizza");
ck((await txt("#gm-draws-status")).startsWith("Press Apply"), "ticket edits wait for Apply");
await row(5).locator("input[type=checkbox]").check(); await p.waitForTimeout(300);
ck((await row(5).locator(".tick-saved").textContent()) === "Saved", "Claimed saves instantly");
ck((await p.inputValue("#gm-slots li:nth-child(4) input.tno")) === "123456", "instant claim didn't disturb the draft");
await p.click("#gm-add-slot");
ck(await p.locator("#gm-slots li").last().locator("input[type=checkbox]").isDisabled(), "new unsaved prize can't be claimed yet");
await p.click("#gm-draws-save"); await saveAll(p);
await p.goto(f + pr); await p.waitForTimeout(200);
const tix = await p.$$eval("#d-tix li", (l) => l.map((x) => x.className + ":" + x.textContent));
ck(tix.length === 11 && tix[3].includes("123456") && tix[4].includes("Pizza") && tix[5].startsWith("claimed"), "ticket list saved with the instant claim kept");
await p.fill("#d-search", "123456"); ck((await txt("#d-search-msg")).includes("winner"), "saved ticket is searchable");

// Delete: two taps, then it waits for Save all (item 7 covered by venues above).
await p.goto(f + "#admin"); await p.waitForTimeout(200);
await p.locator(".act-row", { hasText: "Buffet Dinner" }).getByRole("button", { name: "Edit" }).click();
await p.click("#m-delete");
ck((await txt("#m-delete")) === "Tap again to delete", "delete needs a second tap");
await p.click("#m-delete"); await p.waitForTimeout(200);
ck((await p.locator(".act-row", { hasText: "Buffet Dinner" }).innerText()).includes("Will be deleted"), "second tap stages the delete");
await saveAll(p);
ck(await p.locator(".act-row", { hasText: "Buffet Dinner" }).count() === 0, "Save all deletes it");

// Admin panels fold: Activities starts open, the rest folded; a folded panel with changes says so; each browser remembers.
const q = await (await b.newContext({ viewport: { width: 1280, height: 900 }, folds: "default" })).newPage(); q.on("pageerror", (e) => errs.push(e.message));
await q.goto(f + "#admin"); await q.waitForTimeout(500);
const folded = (id) => q.evaluate((i) => document.getElementById(i).classList.contains("folded"), id);
ck(!(await folded("acts-box")) && await folded("t-box") && await folded("n-box") && await folded("v-box") && !(await q.isVisible("#a-brand")), "Activities starts open; Title, Navigation bar and Venues start folded");
await q.click("#t-title");
ck(!(await folded("t-box")) && await q.isVisible("#a-brand"), "tapping a heading unfolds the panel");
await q.fill("#a-brand", "Folded change"); await q.click("#t-title");
ck((await q.evaluate(() => getComputedStyle(document.getElementById("t-title"), "::after").content)).includes("Unsaved changes"), "a folded panel with changes says so on its heading");
await q.click("#t-title"); await q.click("#t-cancel");
await q.reload(); await q.waitForTimeout(500);
ck(!(await folded("t-box")), "the browser remembers which panels were left open");

ck(errs.length === 0, "no page errors " + errs.join(" | "));
console.log(fail ? fail + " failed" : "all passed"); await b.close();
