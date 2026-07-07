// WO-UI-FIX-6 — onboarding shot (demo, mocked whatsapp-health for stage content).
// Usage: node scripts/uifix6-shot.mjs <label>
import { chromium } from "playwright";
const label = process.argv[2];
const HEALTH = { rollup: "unknown", probes: [
  { id: "access_token", status: "pass" }, { id: "phone_number_id", status: "pass" },
  { id: "verify_token", status: "pass" }, { id: "app_secret", status: "pass" },
  { id: "inbound_webhook", status: "pass" }, { id: "outbound_delivery", status: "pass" },
  { id: "recent_send_failure", status: "unknown" }, { id: "agent_replies_enabled", status: "unknown" },
]};
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 2 });
await ctx.route("**/api/settings/whatsapp-health**", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(HEALTH) }));
const page = await ctx.newPage();
await page.goto("http://localhost:3100/c/onboarding", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `reports/uifix6/${label}.png`, fullPage: false });
console.log("saved reports/uifix6/" + label + ".png");
await browser.close();
