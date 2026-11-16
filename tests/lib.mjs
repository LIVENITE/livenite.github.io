// Shared settings for the LIVENITE tests: where the repository, the built preview and the browser are.
import { mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

export const TESTS = dirname(fileURLToPath(import.meta.url));
export const REPO = join(TESTS, "..");
export const OUT = join(TESTS, ".out");
export const SHOTS = join(OUT, "shots");
mkdirSync(SHOTS, { recursive: true });
// The design preview, built by run.sh (python3 -I preview-tools/build.py . tests/.out/livenite-design.html).
export const PREVIEW = pathToFileURL(join(OUT, "livenite-design.html")).href;

// Chromium: CHROME_PATH if set, else the copy Playwright installed.
const CHROME = process.env.CHROME_PATH || (existsSync("/opt/pw-browsers/chromium-1243/chrome-linux64/chrome") ? "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome" : undefined);
// Animations are switched off (the browser reports "reduce motion", so changes are instant) so tests check
// behaviour, not timing. Pass { motion: true } to keep them, as preview-motion does.
export async function launch(extraArgs = [], { motion = false } = {}) {
  const args = [...extraArgs];
  if (process.env.HTTPS_PROXY) args.push("--proxy-server=" + process.env.HTTPS_PROXY, "--proxy-bypass-list=127.0.0.1;localhost");
  const browser = await chromium.launch({ executablePath: CHROME, args });
  // Admin panels start folded for a new visitor; tests open them all unless they pass { folds: "default" }.
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (opts = {}) => {
    const { folds, ...rest } = opts;
    const ctx = await newContext(motion ? rest : { reducedMotion: "reduce", ...rest });
    if (folds !== "default") await ctx.addInitScript(() => { try { if (!localStorage.getItem("livenite-folds")) localStorage.setItem("livenite-folds", JSON.stringify({ "t-box": true, "n-box": true, "demo-box": true, "v-box": true, "acts-box": true })); } catch (e) {} });
    return ctx;
  };
  browser.newPage = async (opts) => (await browser.newContext(opts)).newPage();
  return browser;
}

// Presses Save all in the save bar of the screen being shown (DATA-RULES rule 4: Apply, then Save all).
export async function saveAll(p) {
  await p.locator(".page-bar:visible button, #rs-savebar:visible button", { hasText: /^Save all$/ }).first().click();
  await p.waitForTimeout(300);
}
