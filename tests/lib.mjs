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
// Animations are switched off (as in a browser without the View Transitions feature) so tests check
// behaviour, not timing. Pass { motion: true } to keep them, as preview-run-sheet-motion does.
export async function launch(extraArgs = [], { motion = false } = {}) {
  const args = [...extraArgs];
  if (process.env.HTTPS_PROXY) args.push("--proxy-server=" + process.env.HTTPS_PROXY, "--proxy-bypass-list=127.0.0.1;localhost");
  const browser = await chromium.launch({ executablePath: CHROME, args });
  if (!motion) {
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (opts) => {
      const ctx = await newContext(opts);
      await ctx.addInitScript(() => { delete Document.prototype.startViewTransition; });
      return ctx;
    };
    const newPage = browser.newPage.bind(browser);
    browser.newPage = async (opts) => (await browser.newContext(opts)).newPage();
  }
  return browser;
}
