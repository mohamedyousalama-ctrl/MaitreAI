// WO-SIGNUP-FRONTEND — screenshots of the console_v2 واتساب step's Embedded
// Signup card in its three honest states.
//   node scripts/signup-frontend-shot.mjs <unconfigured|ready|error>
// Renders the REAL page (demo mode). For ready/error the dev server must run with
// NEXT_PUBLIC_WHATSAPP_APP_ID / NEXT_PUBLIC_WHATSAPP_CONFIG_ID set; a stub FB SDK
// is injected so we never depend on connect.facebook.net (blocked in CI).
import { chromium } from "playwright";

const state = process.argv[2] || "unconfigured";
const PORT = process.env.SHOT_PORT || "3100";

// Same 8-probe demo payload the other onboarding shots use — keeps the truth
// board honest (not all-pass) so the card is the focus, not a fake-green board.
const HEALTH = { rollup: "unknown", probes: [
  { id: "access_token", status: "unknown" }, { id: "phone_number_id", status: "unknown" },
  { id: "verify_token", status: "unknown" }, { id: "app_secret", status: "unknown" },
  { id: "inbound_webhook", status: "unknown" }, { id: "outbound_delivery", status: "unknown" },
  { id: "recent_send_failure", status: "unknown" }, { id: "agent_replies_enabled", status: "unknown" },
]};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 }, deviceScaleFactor: 2 });

await ctx.route("**/api/settings/whatsapp-health**", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(HEALTH) }));

// Inject a stub Facebook SDK so FbSdkLoader reports "ready" without the real
// script. login() simulates a user CANCEL (no auth code) → drives the honest
// amber error path for the "error" shot.
if (state !== "unconfigured") {
  await ctx.addInitScript(() => {
    window.__kvFbReady = true;
    window.FB = {
      init() {},
      login(cb) { setTimeout(() => cb({ authResponse: null }), 150); },
    };
  });
}

const page = await ctx.newPage();
await page.goto(`http://localhost:${PORT}/c/onboarding`, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(2000);

if (state === "error") {
  // Click the connect button, then the popup-cancel resolves → amber error + retry.
  const btn = page.getByRole("button", { name: /Connect WhatsApp|ربط واتساب/ });
  await btn.first().click();
  await page.waitForTimeout(900);
}

await page.screenshot({ path: `reports/signup-frontend/${state}.png`, fullPage: false });
console.log(`saved reports/signup-frontend/${state}.png`);
await browser.close();
