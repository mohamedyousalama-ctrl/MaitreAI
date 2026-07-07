// WO-UI-FIX-2 — Settings screenshot capture (demo mode). Usage: node scripts/uifix2-shot.mjs <label>
import { chromium } from "playwright";
const label = process.argv[2] || "shot";
const url = "http://localhost:3100/c/settings";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 }).then(c => c.newPage());
page.on("pageerror", e => console.log("PAGEERR:", e.message));
await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(3500); // let demo DataBootstrap + count-ups settle
await page.screenshot({ path: `reports/uifix2/${label}.png`, fullPage: false });
console.log("saved reports/uifix2/" + label + ".png");
await browser.close();
