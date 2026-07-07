// WO-UI-FIX-5 — /c/select shot. Usage: node scripts/uifix5-shot.mjs <label> <list|error>
import { chromium } from "playwright";
const label = process.argv[2], mode = process.argv[3] || "list";
const MEMBERSHIPS = { memberships: [
  { restaurantId: "r1", role: "manager", name: "وصاية · Wesaya" },
  { restaurantId: "r2", role: "operation", name: "مطعم الهرم" },
]};
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
if (mode === "list") {
  await ctx.route("**/api/session/memberships**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MEMBERSHIPS) }));
} else {
  await ctx.route("**/api/session/memberships**", (route) => route.fulfill({ status: 500, body: "err" }));
}
const page = await ctx.newPage();
await page.goto("http://localhost:3100/c/select", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: `reports/uifix5/${label}.png`, fullPage: false });
console.log("saved reports/uifix5/" + label + ".png");
await browser.close();
