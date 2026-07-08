// WO-TEAM-POLISH — Team & Roles (10) shot (demo mode, honest empty roster).
// In demo (Supabase unconfigured) the roster stays empty — the honest empty-state —
// and NOTHING is fabricated. The permission matrix + grouped command chips render
// regardless of roster, so this captures the polish faithfully.
// Usage: node scripts/teampolish-shot.mjs <label>
import { chromium } from "playwright";
const label = process.argv[2];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1200 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto("http://localhost:3100/c/team", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `reports/teampolish/${label}.png`, fullPage: true });
console.log("saved reports/teampolish/" + label + ".png");
await browser.close();
