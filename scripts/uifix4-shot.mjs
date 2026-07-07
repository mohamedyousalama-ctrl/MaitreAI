// WO-UI-FIX-4 — screenshot capture (demo). Usage: node scripts/uifix4-shot.mjs <label> <path>
import { chromium } from "playwright";
const label = process.argv[2], path = process.argv[3];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 }).then(c => c.newPage());
page.on("pageerror", e => console.log("PAGEERR:", e.message));
await page.goto("http://localhost:3100" + path, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(2500); // catch the shimmer mid-sweep
await page.screenshot({ path: `reports/uifix4/${label}.png`, fullPage: false });
console.log("saved reports/uifix4/" + label + ".png");
await browser.close();
