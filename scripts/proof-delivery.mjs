// ============================================================================
// MaitreAI — Delivery module proof (run against a FLAG-ON build/server).
// Re-ported from the pre-divergence PR #6 onto current main and extended to
// assert the COD capture-on-delivered loop (#91 ledger) that #6 now wires.
//
// Exercises the REAL public token endpoints a native driver app would call —
// driver status (picked_up → on_the_way → delivered), location push, and the
// customer tracking poll — and asserts the deterministic, tool-enforced
// invariants (LLM-independent). The two SERVER-ONLY hooks are mirrored via the
// service role exactly as the original proof did, because their HTTP entries are
// session-gated (operator UI) / inside the webhook:
//   • createDeliveryForOrder  → REST upsert deliveries{status:pending} (+event)
//   • assignDriver            → mint one-time tokens + status=assigned
// Everything past assignment (status lifecycle + COD capture-on-delivered +
// customer tracking + token expiry) runs through the real routes.
//
// Tenant: بلبن (BLaban) — the COD/delivery proving ground.
// Usage: set -a; . ./.env.local; set +a; BASE_URL=http://127.0.0.1:3403 node scripts/proof-delivery.mjs
// ============================================================================

import { randomBytes } from "crypto";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3403";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !SR) { console.error("Missing Supabase env"); process.exit(2); }
const H = { apikey: SR, Authorization: "Bearer " + SR, "Content-Type": "application/json" };
const REP = { ...H, Prefer: "return=representation" };
const tok = () => randomBytes(24).toString("base64url");
const j = (r) => r.json();
const rest = async (p, i = {}) => {
  const r = await fetch(`${SB}/rest/v1/${p}`, { ...i, headers: { ...H, ...(i.headers || {}) } });
  const t = await r.text(); try { return JSON.parse(t); } catch { return t; }
};
const post = (path, body) => fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const BLABAN = "9244d8ef-66b1-417a-a012-41a389ab1abf";
const ITEM = { name: "أرز باللبن سادة", qty: 2, unit: 35 };
const DELIVERY_FEE = 15;
const TOTAL = ITEM.qty * ITEM.unit + DELIVERY_FEE; // 85

let pass = 0, fail = 0;
const ok = (n, c, note = "") => { if (c) pass++; else fail++; console.log(`  ${c ? "✅" : "❌"} ${n}${note ? " — " + note : ""}`); };

let orderId = null, deliveryId = null, driverId = null, custId = null, convId = null, driverTok = null, customerTok = null;

async function cleanup() {
  const cols = orderId ? await rest(`cod_collections?order_id=eq.${orderId}&select=id`) : [];
  for (const c of Array.isArray(cols) ? cols : []) await rest(`cod_cash_events?cod_collection_id=eq.${c.id}`, { method: "DELETE" });
  if (driverId) await rest(`cod_cash_events?driver_id=eq.${driverId}`, { method: "DELETE" });
  if (orderId) await rest(`cod_collections?order_id=eq.${orderId}`, { method: "DELETE" });
  if (deliveryId) {
    await rest(`delivery_locations?delivery_id=eq.${deliveryId}`, { method: "DELETE" });
    await rest(`delivery_events?delivery_id=eq.${deliveryId}`, { method: "DELETE" });
    await rest(`deliveries?id=eq.${deliveryId}`, { method: "DELETE" });
  }
  if (orderId) await rest(`orders?id=eq.${orderId}`, { method: "DELETE" });
  if (driverId) await rest(`drivers?id=eq.${driverId}`, { method: "DELETE" });
  if (convId) { await rest(`messages?conversation_id=eq.${convId}`, { method: "DELETE" }); await rest(`conversations?id=eq.${convId}`, { method: "DELETE" }); }
  if (custId) await rest(`customers?id=eq.${custId}`, { method: "DELETE" });
}

async function run() {
  console.log(`\n=== Delivery module proof (BLaban, flag-ON) ===\nbase=${BASE}\n`);

  // -- seed a delivery order (mirror persistOrderFromDraft output shape) --------
  const phone = "20111" + Math.floor(Math.random() * 1e7).toString().padStart(7, "0");
  const cust = await rest(`customers`, { method: "POST", headers: REP, body: JSON.stringify({ restaurant_id: BLABAN, phone, name: "اختبار التوصيل" }) });
  custId = cust?.[0]?.id;
  const conv = await rest(`conversations`, { method: "POST", headers: REP, body: JSON.stringify({ restaurant_id: BLABAN, customer_id: custId, channel: "whatsapp" }) });
  convId = conv?.[0]?.id;
  const order = await rest(`orders`, {
    method: "POST", headers: REP,
    body: JSON.stringify({
      restaurant_id: BLABAN, conversation_id: convId, customer_id: custId,
      order_number: 900000 + Math.floor(Math.random() * 99999),
      items: [{ quantity: ITEM.qty, name: ITEM.name, unitPrice: ITEM.unit, lineTotal: ITEM.qty * ITEM.unit }],
      subtotal: ITEM.qty * ITEM.unit, delivery_fee: DELIVERY_FEE, total: TOTAL, currency: "ج.م",
      fulfillment: "delivery", address: "الياسمين - شارع ٩", order_status: "confirmed",
    }),
  });
  orderId = order?.[0]?.id;
  if (!orderId) { console.log("  ❌ could not seed order", JSON.stringify(order).slice(0, 200)); await cleanup(); process.exit(1); }
  console.log(`  seeded order ${order[0].order_number ?? orderId} — total ${TOTAL} ج.م (delivery)`);

  // -- Phase 1: finalize→delivery hook (mirror createDeliveryForOrder) ----------
  const up = await rest(`deliveries`, { method: "POST", headers: { ...REP, Prefer: "return=representation,resolution=merge-duplicates" }, body: JSON.stringify({ order_id: orderId, restaurant_id: BLABAN, status: "pending" }) });
  deliveryId = Array.isArray(up) ? up[0]?.id : null;
  await rest(`delivery_events`, { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ delivery_id: deliveryId, type: "created", payload: {} }) });
  ok("#1 finalize→delivery hook creates a pending delivery", !!deliveryId && up[0].status === "pending", `status=${up?.[0]?.status}`);

  // -- Phase 2: assign a driver (mirror assignDriver: mint one-time tokens) ------
  const drv = await rest(`drivers`, { method: "POST", headers: REP, body: JSON.stringify({ restaurant_id: BLABAN, name: "سائق الاختبار", phone: "201000000001" }) });
  driverId = drv?.[0]?.id;
  driverTok = tok(); customerTok = tok();
  await rest(`deliveries?id=eq.${deliveryId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ driver_id: driverId, status: "assigned", driver_token: driverTok, customer_token: customerTok, token_used: false, assigned_at: new Date().toISOString(), expires_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString() }) });
  ok("#2 assignment minted driver + customer tokens", !!driverId && !!driverTok && !!customerTok);

  // -- Phase 3: driver status lifecycle through the REAL token endpoints ---------
  const sPicked = await post(`/api/delivery/${driverTok}/status`, { status: "picked_up" });
  ok("#3 driver status → picked_up (200)", sPicked.status === 200, `http=${sPicked.status}`);
  const sWay = await post(`/api/delivery/${driverTok}/status`, { status: "on_the_way" });
  ok("#4 driver status → on_the_way (200)", sWay.status === 200, `http=${sWay.status}`);

  // -- Phase 4: location push + customer tracking poll (real routes) -------------
  const loc = await post(`/api/delivery/${driverTok}/location`, { lat: 30.0626, lng: 31.2497 });
  ok("#5 driver location push (200)", loc.status === 200, `http=${loc.status}`);
  const track = await fetch(`${BASE}/api/track/${customerTok}`).then(j);
  ok("#6 customer tracking reflects status + live dot", track.status === "on_the_way" && !!track.location && track.order?.total == TOTAL, `status=${track.status} loc=${!!track.location} total=${track.order?.total}`);

  // -- Phase 5: delivered → COD capture-on-delivered closes the #91 ledger loop --
  const sDel = await post(`/api/delivery/${driverTok}/status`, { status: "delivered" });
  ok("#7 driver status → delivered (200)", sDel.status === 200, `http=${sDel.status}`);
  const cols = await rest(`cod_collections?order_id=eq.${orderId}&select=expected_cash,cash_collected,settlement_status,driver_id`);
  const col = Array.isArray(cols) ? cols[0] : null;
  ok("#8 COD captured on delivered (expected==order.total, held_by_driver, driver linked)",
     !!col && Number(col.expected_cash) === TOTAL && Number(col.cash_collected) === TOTAL && col.settlement_status === "held_by_driver" && col.driver_id === driverId,
     `${JSON.stringify(col)}`);
  const collected = await rest(`cod_cash_events?driver_id=eq.${driverId}&type=eq.collected&select=id`);
  ok("#9 COD audit 'collected' event written", Array.isArray(collected) && collected.length >= 1, `events=${Array.isArray(collected) ? collected.length : "n/a"}`);

  // -- Phase 6: token expiry — the link closes once delivered --------------------
  const reuse = await post(`/api/delivery/${driverTok}/status`, { status: "delivered" });
  ok("#10 delivered token is closed (reuse → 410)", reuse.status === 410, `http=${reuse.status}`);

  await cleanup();
  const resid = orderId ? await rest(`deliveries?order_id=eq.${orderId}&select=id`) : [];
  ok("#11 cleanup: no residual rows", Array.isArray(resid) && resid.length === 0, `residual=${Array.isArray(resid) ? resid.length : "n/a"}`);

  console.log(`\n──────── DELIVERY PROOF: ${pass}/${pass + fail} ────────`);
  process.exit(fail === 0 ? 0 : 1);
}
run().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(2); });
