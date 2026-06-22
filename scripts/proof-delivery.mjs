// ============================================================================
// MaitreAI — Delivery module proof (run against a FLAG-ON build/server).
// Drives the real chain: finalize a delivery order (→ deliveries row via the
// flag-gated hook), assign a driver (mints one-time tokens + links), then
// exercises the REAL public token endpoints a native driver app would use:
// driver page, status (picked_up → on_the_way → delivered), location push, and
// the customer tracking poll (live dot + truth-driven freshness + token expiry).
// Cleans up all test rows. Assignment mirrors lib/db/delivery.assignDriver via
// the service role because the HTTP assign route is session-gated (operator UI).
//
// Usage: set -a; . ./.env.local; set +a; BASE_URL=http://127.0.0.1:3403 node scripts/proof-delivery.mjs
// ============================================================================

import { randomBytes } from "crypto";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3403";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: SR, Authorization: "Bearer " + SR, "Content-Type": "application/json" };
const PHONE = "20111" + Math.floor(Math.random() * 1e7).toString().padStart(7, "0");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tok = () => randomBytes(24).toString("base64url");
const rest = async (p, i = {}) => {
  const r = await fetch(`${SB}/rest/v1/${p}`, { ...i, headers: { ...H, ...(i.headers || {}) } });
  const t = await r.text(); try { return JSON.parse(t); } catch { return t; }
};
const code = async (path, init) => (await fetch(`${BASE}${path}`, init)).status;
const pass = (b) => (b ? "✅" : "❌");

function inbound(text, i) {
  return { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: {
    contacts: [{ profile: { name: "اختبار التوصيل" }, wa_id: PHONE }],
    messages: [{ from: PHONE, id: `dlv-${PHONE}-${i}-${Date.now()}`, timestamp: `${Math.floor(Date.now()/1000)}`, type: "text", text: { body: text } }] } }] }] };
}
const deliver = (text, i) => fetch(`${BASE}/api/whatsapp/webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(inbound(text, i)) });

const TURNS = [
  "السلام عليكم، عايز اتنين برجر كلاسيك",
  "وكمان واحدة بطاطس كبيرة",
  "توصيل لمنطقة الياسمين",
  "تأكيد الطلب",
  "الدفع عند الاستلام",
  "تأكيد الطلب",
];

(async () => {
  console.log(`\n=== Delivery module proof ===\nbase=${BASE}  phone=${PHONE}\n`);
  const RID = (await rest(`restaurants?select=id&limit=1`))?.[0]?.id;

  // -- Phase 1: finalize a delivery order → deliveries row (the flag-gated hook)
  console.log("Phase 1 — finalize a delivery order (drives the real Brain chain)…");
  for (let i = 0; i < TURNS.length; i++) { await deliver(TURNS[i], i); await sleep(300); }
  await sleep(800);
  const cust = await rest(`customers?phone=eq.${PHONE}&select=id`);
  const customerId = cust?.[0]?.id;
  const conv = await rest(`conversations?customer_id=eq.${customerId}&select=id`);
  const conversationId = conv?.[0]?.id;
  const orders = await rest(`orders?conversation_id=eq.${conversationId}&select=id,order_number,total,currency,fulfillment&order=created_at.desc`);
  const order = Array.isArray(orders) ? orders[0] : null;
  console.log(`  order: ${order ? `#${order.order_number} total ${order.total} ${order.currency} (${order.fulfillment})` : "NONE — agent did not finalize"}`);
  let delivery = null;
  if (order) {
    const dl = await rest(`deliveries?order_id=eq.${order.id}&select=*`);
    delivery = Array.isArray(dl) ? dl[0] : null;
  }
  console.log(`  ${pass(!!delivery)} #1 deliveries row created: ${delivery ? `status=${delivery.status}` : "MISSING"}\n`);
  if (!delivery) { console.log("Cannot continue without a delivery. Cleaning up."); await cleanup(); return; }

  // -- Phase 2: assign a driver (mirror assignDriver: mint tokens + links) -----
  console.log("Phase 2 — assign a driver…");
  const driver = (await rest(`drivers`, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ restaurant_id: RID, name: "سائق الاختبار", phone: "201000000001" }) }))?.[0];
  const driverTok = tok(), custTok = tok();
  await rest(`deliveries?id=eq.${delivery.id}`, { method: "PATCH", body: JSON.stringify({
    driver_id: driver.id, status: "assigned", driver_token: driverTok, customer_token: custTok,
    token_used: false, assigned_at: new Date().toISOString(), expires_at: new Date(Date.now() + 12*3600*1000).toISOString() }) });
  await rest(`delivery_events`, { method: "POST", body: JSON.stringify({ delivery_id: delivery.id, type: "assigned", payload: { driverId: driver.id } }) });
  const driverLink = `${BASE}/d/${driverTok}`, customerLink = `${BASE}/t/${custTok}`;
  console.log(`  driver link:   ${driverLink}`);
  console.log(`  customer link: ${customerLink}`);
  const assignNoAuth = await code(`/api/deliveries/${delivery.id}/assign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ driverId: driver.id }) });
  console.log(`  ${pass(assignNoAuth === 401)} #2 assign HTTP route is auth-guarded (no session → ${assignNoAuth})\n`);

  // -- Phase 3: driver page + status progression --------------------------------
  console.log("Phase 3 — driver page + status…");
  const dPage = await fetch(driverLink); const dHtml = await dPage.text();
  console.log(`  ${pass(dPage.status === 200 && (dHtml.includes("صفحة المندوب") || dHtml.includes("التحصيل")))} #3 GET /d/<token> renders (status ${dPage.status})`);
  const sPick = await code(`/api/delivery/${driverTok}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "picked_up" }) });
  console.log(`  ${pass(sPick === 200)} #3 status → picked_up (${sPick})`);

  // -- Phase 4: location push + live tracking dot (truth-driven freshness) ------
  console.log("Phase 4 — GPS location + customer tracking dot…");
  for (const [lat, lng] of [[30.06, 31.33], [30.07, 31.34]]) {
    await code(`/api/delivery/${driverTok}/location`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat, lng }) });
  }
  let track = await (await fetch(`${BASE}/api/track/${custTok}`, { cache: "no-store" })).json();
  console.log(`  ${pass(!!track.location)} #4 tracking shows a live dot after fresh location: ${track.location ? `${track.location.lat},${track.location.lng}` : "none"}`);
  // Make the latest point stale → the dot must disappear (honest "paused").
  await rest(`delivery_locations?delivery_id=eq.${delivery.id}`, { method: "PATCH", body: JSON.stringify({ recorded_at: new Date(Date.now() - 60000).toISOString() }) });
  track = await (await fetch(`${BASE}/api/track/${custTok}`, { cache: "no-store" })).json();
  console.log(`  ${pass(track.location === null)} #4 stale location hidden (paused) → dot=${track.location === null ? "none (honest)" : "still shown ❌"}`);

  // -- Phase 5: customer tracking page ------------------------------------------
  console.log("Phase 5 — customer tracking page…");
  const tPage = await fetch(customerLink); const tHtml = await tPage.text();
  console.log(`  ${pass(tPage.status === 200 && tHtml.includes("تتبّع طلبك"))} #5 GET /t/<token> renders (status ${tPage.status})`);
  console.log(`     timeline: status=${track.status}, assigned_at set=${!!track.timeline.assigned_at}, picked_up set=${!!track.timeline.picked_up_at}`);

  // -- Phase 6: token scoping + expiry ------------------------------------------
  console.log("Phase 6 — token scoping + expiry…");
  await code(`/api/delivery/${driverTok}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "on_the_way" }) });
  const sDel = await code(`/api/delivery/${driverTok}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "delivered" }) });
  console.log(`  ${pass(sDel === 200)} status → delivered (${sDel})`);
  const reuse = await code(`/api/delivery/${driverTok}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "picked_up" }) });
  console.log(`  ${pass(reuse === 410)} #6 reusing the completed token is rejected (${reuse} Gone)`);
  const reLoc = await code(`/api/delivery/${driverTok}/location`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: 30, lng: 31 }) });
  console.log(`  ${pass(reLoc === 410)} #6 location after delivered rejected (${reLoc})`);
  const fin = await (await fetch(`${BASE}/api/track/${custTok}`, { cache: "no-store" })).json();
  console.log(`  ${pass(fin.status === "delivered")} #6 customer page shows delivered (status=${fin.status})`);
  const dDone = await (await fetch(driverLink)).text();
  console.log(`  ${pass(dDone.includes("تم إنهاء هذا التوصيل") || dDone.includes("تم التوصيل"))} #6 driver link shows "completed" on reopen`);

  await cleanup();
  console.log("\nDone.");

  async function cleanup() {
    console.log("\n=== Cleanup ===");
    if (order) await rest(`orders?id=eq.${order.id}`, { method: "DELETE" }); // cascades deliveries→locations/events
    if (conversationId) await rest(`conversations?id=eq.${conversationId}`, { method: "DELETE" });
    if (customerId) await rest(`customers?id=eq.${customerId}`, { method: "DELETE" });
    await rest(`drivers?name=eq.${encodeURIComponent("سائق الاختبار")}`, { method: "DELETE" });
    const resDl = await rest(`deliveries?select=id`);
    const resDr = await rest(`drivers?select=id`);
    console.log(`residual deliveries=${Array.isArray(resDl) ? resDl.length : resDl}  drivers=${Array.isArray(resDr) ? resDr.length : resDr}`);
  }
})();
