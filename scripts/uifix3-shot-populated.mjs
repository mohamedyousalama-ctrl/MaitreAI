// WO-UI-FIX-3 — POPULATED after-shot. Intercepts /api/customers/aggregates with
// realistic mock data (SCREENSHOT-ONLY via page.route — never shipped) to show the
// loyalty wall + populated context cards. Usage: node scripts/uifix3-shot-populated.mjs
import { chromium } from "playwright";
const AGG = {
  facts: { totalCustomers: 212, totalOrders: 840, totalRevenue: 61200, avgOrderValue: 246, avgOrdersPerCustomer: 4 },
  segments: { new: 23, returning: 57, loyal: 14 },
  topBySpend: [
    { id: "1", name: "رنا محمود", phone: "+20100•••871", ltv: 2210, orders_count: 9 },
    { id: "2", name: "سارة م.", phone: "+20111•••204", ltv: 1580, orders_count: 6 },
    { id: "3", name: "هبة ناصر", phone: "+20128•••560", ltv: 1195, orders_count: 5 },
    { id: "4", name: "أحمد كمال", phone: null, ltv: 720, orders_count: 3 },
    { id: "5", name: "منى س.", phone: null, ltv: 340, orders_count: 1 },
  ],
  atRisk: [
    { id: "2", name: "سارة م.", phone: null, last_seen_at: null, days_since: 34 },
    { id: "9", name: "خالد ع.", phone: null, last_seen_at: null, days_since: 41 },
  ],
};
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
await ctx.route("**/api/customers/aggregates**", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(AGG) }));
const page = await ctx.newPage();
await page.goto("http://localhost:3100/c/customers", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(3500);
await page.screenshot({ path: "reports/uifix3/03-customers-after-populated.png", fullPage: false });
console.log("saved populated shot");
await browser.close();
