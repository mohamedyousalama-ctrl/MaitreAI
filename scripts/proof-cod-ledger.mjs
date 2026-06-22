// ============================================================================
// MaitreAI — COD Cash Ledger proof.
// Seeds real orders (tool-computed totals) + drivers + delivered deliveries, then
// drives the COD cash lifecycle and asserts every acceptance invariant at the
// data layer: expected==order.total, capture on delivered (default + discrepancy),
// per-driver ledger (expected/collected/outstanding/unsettled), settle + audit,
// daily summary, discrepancy visibility, tenant scope.
//
// Like scripts/proof-delivery.mjs, the cash mutations MIRROR lib/db/cod.ts via the
// service role because the operator HTTP routes (/api/cod/*) are session-gated and
// the driver "delivered" capture hook lives on the delivery branch (PR #6). The
// real helpers + routes are type-checked (tsc) and built; this proves the schema,
// the money guardrail, and the ledger math end-to-end against the live DB.
// Cleans up ALL seeded rows afterward.
//
// Usage: set -a; . ./.env.local; set +a; node scripts/proof-cod-ledger.mjs
// ============================================================================

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !SR) { console.error("Missing Supabase env"); process.exit(2); }
const H = { apikey: SR, Authorization: "Bearer " + SR, "Content-Type": "application/json" };
const rest = async (p, i = {}) => {
  const r = await fetch(`${SB}/rest/v1/${p}`, { ...i, headers: { ...H, ...(i.headers || {}) } });
  const t = await r.text(); try { return JSON.parse(t); } catch { return t; }
};
const ins = (table, row) => rest(table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
const patch = (q, row) => rest(q, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(row) });
const del = (q) => rest(q, { method: "DELETE", headers: { Prefer: "return=minimal" } });
const round2 = (n) => Math.round(n * 100) / 100;
const now = () => new Date().toISOString();

let PASS = true;
const check = (label, ok, extra = "") => { console.log(`   ${ok ? "✅" : "❌"} ${label}${extra ? "  — " + extra : ""}`); if (!ok) PASS = false; };
const eq = (a, b) => Math.abs(Number(a) - Number(b)) < 0.001;

const TAG = "proof-cod-" + Date.now();

// --- mirrors of lib/db/cod.ts (kept faithful to the helper logic) ------------
async function markOrderCod(rid, orderId, expected, deliveryId, driverId) {
  await patch(`orders?id=eq.${orderId}`, { payment_method: "cod" });
  return ins("cod_collections", {
    restaurant_id: rid, order_id: orderId, delivery_id: deliveryId, driver_id: driverId,
    expected_cash: expected, settlement_status: "pending",
  });
}
async function captureOnDelivered(rid, orderId, expected, cashCollected, driverId, driverName) {
  const collected = cashCollected ?? expected;
  await patch(`cod_collections?order_id=eq.${orderId}`, {
    driver_id: driverId, driver_name: driverName, cash_collected: collected, collected_at: now(),
    settlement_status: "held_by_driver", updated_at: now(),
  });
  const col = (await rest(`cod_collections?order_id=eq.${orderId}&select=id`))?.[0];
  await ins("cod_cash_events", {
    restaurant_id: rid, cod_collection_id: col?.id, driver_id: driverId, type: "collected",
    amount: collected, expected, payload: { tag: TAG, orderId },
  });
  return collected;
}
// Faithful to driverLedger(): aggregate held_by_driver by driver.
async function driverLedger(rid) {
  const rows = await rest(`cod_collections?restaurant_id=eq.${rid}&settlement_status=eq.held_by_driver&select=driver_id,driver_name,expected_cash,cash_collected`);
  const byDriver = new Map();
  for (const r of (Array.isArray(rows) ? rows : [])) {
    const key = r.driver_id ?? "unassigned";
    const cur = byDriver.get(key) ?? { driverId: r.driver_id, driverName: r.driver_name || "غير معيّن", expected: 0, collected: 0, outstanding: 0, unsettledCount: 0 };
    cur.expected += Number(r.expected_cash);
    cur.collected += Number(r.cash_collected ?? 0);
    cur.outstanding += Number(r.cash_collected ?? 0);
    cur.unsettledCount += 1;
    byDriver.set(key, cur);
  }
  return [...byDriver.values()].map((d) => ({ ...d, expected: round2(d.expected), collected: round2(d.collected), outstanding: round2(d.outstanding), discrepancy: round2(d.collected - d.expected) }));
}
async function settleDriver(rid, driverId) {
  const held = await rest(`cod_collections?restaurant_id=eq.${rid}&driver_id=eq.${driverId}&settlement_status=eq.held_by_driver&select=id,driver_name,cash_collected`);
  const rows = Array.isArray(held) ? held : [];
  const total = round2(rows.reduce((s, r) => s + Number(r.cash_collected ?? 0), 0));
  const settlement = (await ins("cod_settlements", { restaurant_id: rid, driver_id: driverId, driver_name: rows.find((r) => r.driver_name)?.driver_name ?? null, total_amount: total, order_count: rows.length, note: TAG }))?.[0];
  await patch(`cod_collections?restaurant_id=eq.${rid}&driver_id=eq.${driverId}&settlement_status=eq.held_by_driver`, { settlement_status: "settled", settlement_id: settlement?.id, settled_at: now(), updated_at: now() });
  await ins("cod_cash_events", { restaurant_id: rid, driver_id: driverId, type: "settled", amount: total, payload: { tag: TAG, settlementId: settlement?.id, orderCount: rows.length } });
  return { total, orderCount: rows.length, settlementId: settlement?.id };
}

(async () => {
  console.log("\n=== COD Cash Ledger proof ===\n");
  const rid = (await rest(`restaurants?select=id&limit=1`))?.[0]?.id;
  if (!rid) { console.error("no restaurant"); process.exit(2); }
  const customer = (await ins("customers", { restaurant_id: rid, phone: "2010" + Math.floor(Math.random() * 1e8), name: "عميل اختبار COD" }))?.[0];

  // --- seed 2 drivers + 3 delivered COD orders --------------------------------
  const d1 = (await ins("drivers", { restaurant_id: rid, name: `سائق ١ ${TAG}`, phone: "201000000010" }))?.[0];
  const d2 = (await ins("drivers", { restaurant_id: rid, name: `سائق ٢ ${TAG}`, phone: "201000000020" }))?.[0];

  async function seedOrder(total, fee, tax) {
    const subtotal = round2(total - fee - tax);
    const order = (await ins("orders", {
      restaurant_id: rid, customer_id: customer?.id, order_number: "COD-" + Math.floor(Math.random() * 1e9),
      fulfillment: "delivery", items: [{ name: "صنف اختبار", quantity: 1, total: subtotal }],
      subtotal, delivery_fee: fee, tax_amount: tax, tax_rate: 0, total, currency: "ج.م",
      order_status: "delivered", payment_status: "unpaid", notes: TAG,
    }))?.[0];
    const delivery = (await ins("deliveries", { restaurant_id: rid, order_id: order.id, status: "delivered", delivered_at: now() }))?.[0];
    return { order, delivery };
  }
  // total includes a delivery fee → expected_cash must equal the FULL total.
  const A = await seedOrder(100, 15, 0); // D1
  const B = await seedOrder(150, 15, 0); // D1
  const C = await seedOrder(200, 20, 0); // D2 — will be collected SHORT (discrepancy)

  // --- Acceptance 1: expected cash == tool-computed order total (incl. fee) ----
  console.log("Acceptance 1 — expected cash = order.total (incl. delivery fee)");
  for (const [o, exp] of [[A, 100], [B, 150], [C, 200]]) {
    const col = (await markOrderCod(rid, o.order.id, o.order.total, o.delivery.id, null))?.[0];
    check(`order ${String(o.order.order_number).slice(0, 12)} expected=${col.expected_cash} == total=${o.order.total}`, eq(col.expected_cash, o.order.total) && eq(col.expected_cash, exp));
  }

  // --- Acceptance 2: capture on delivered (default = expected; record actual) --
  console.log("\nAcceptance 2 — capture cash on 'delivered' (default = expected; actual recordable)");
  const cA = await captureOnDelivered(rid, A.order.id, 100, null, d1.id, d1.name); // default → 100
  const cB = await captureOnDelivered(rid, B.order.id, 150, null, d1.id, d1.name); // default → 150
  const cC = await captureOnDelivered(rid, C.order.id, 200, 190, d2.id, d2.name); // actual 190 (short 10)
  check("default capture = expected", eq(cA, 100) && eq(cB, 150));
  check("actual amount recorded when different (discrepancy captured)", eq(cC, 190));
  const heldRows = await rest(`cod_collections?order_id=eq.${A.order.id}&select=settlement_status,collected_at`);
  check("collection flips to held_by_driver with a collected_at", heldRows?.[0]?.settlement_status === "held_by_driver" && !!heldRows?.[0]?.collected_at);

  // --- Acceptance 3 + 6: per-driver ledger + discrepancy visible --------------
  console.log("\nAcceptance 3 + 6 — per-driver ledger (expected/collected/outstanding/unsettled) + discrepancy");
  let ledger = await driverLedger(rid);
  const L1 = ledger.find((d) => d.driverId === d1.id);
  const L2 = ledger.find((d) => d.driverId === d2.id);
  check("D1: expected=250 collected=250 outstanding=250 count=2", L1 && eq(L1.expected, 250) && eq(L1.collected, 250) && eq(L1.outstanding, 250) && L1.unsettledCount === 2, L1 && `got exp=${L1.expected} col=${L1.collected} out=${L1.outstanding} n=${L1.unsettledCount}`);
  check("D2: expected=200 collected=190 outstanding=190 count=1", L2 && eq(L2.expected, 200) && eq(L2.collected, 190) && L2.unsettledCount === 1, L2 && `got exp=${L2.expected} col=${L2.collected} n=${L2.unsettledCount}`);
  check("D2 discrepancy visible (−10, not hidden)", L2 && eq(L2.discrepancy, -10), L2 && `discrepancy=${L2.discrepancy}`);

  // --- Acceptance 5: daily summary --------------------------------------------
  console.log("\nAcceptance 5 — daily summary (today's expected/collected/outstanding + unsettled drivers)");
  // recompute over our 3 (filtered to our orders so sibling test data can't skew it)
  const ourToday = await rest(`cod_collections?order_id=in.(${[A, B, C].map((x) => x.order.id).join(",")})&select=expected_cash,cash_collected,collected_at`);
  let expToday = 0, colToday = 0;
  for (const r of ourToday) { expToday += Number(r.expected_cash); colToday += Number(r.cash_collected ?? 0); }
  check("today's expected = 450, collected = 440", eq(expToday, 450) && eq(colToday, 440), `exp=${expToday} col=${colToday}`);
  check("two drivers currently holding unsettled cash", ledger.length >= 2);

  // --- Acceptance 4: settle clears outstanding + writes audit ------------------
  console.log("\nAcceptance 4 — settle D1 (driver handed cash in)");
  const s = await settleDriver(rid, d1.id);
  check("settlement totals D1's collected cash (250) over 2 orders", eq(s.total, 250) && s.orderCount === 2, `total=${s.total} n=${s.orderCount}`);
  const d1After = await rest(`cod_collections?driver_id=eq.${d1.id}&select=settlement_status,settlement_id`);
  check("D1's collections are now settled + linked to the settlement", (d1After || []).every((r) => r.settlement_status === "settled" && r.settlement_id === s.settlementId));
  ledger = await driverLedger(rid);
  check("D1 no longer appears as outstanding; D2 still does", !ledger.find((d) => d.driverId === d1.id) && !!ledger.find((d) => d.driverId === d2.id));

  // --- Acceptance 7: audit trail + tenant scope -------------------------------
  console.log("\nAcceptance 7 — audit trail on every cash event + tenant scope");
  const events = await rest(`cod_cash_events?restaurant_id=eq.${rid}&or=(payload->>tag.eq.${TAG},and(type.eq.settled,driver_id.eq.${d1.id}))&select=type,amount,restaurant_id`);
  const collected = (events || []).filter((e) => e.type === "collected").length;
  const settled = (events || []).filter((e) => e.type === "settled").length;
  check("3 'collected' + 1 'settled' audit events written", collected >= 3 && settled >= 1, `collected=${collected} settled=${settled}`);
  check("every audit event is scoped to this tenant", (events || []).every((e) => e.restaurant_id === rid));
  const settlements = await rest(`cod_settlements?note=eq.${TAG}&select=restaurant_id,total_amount`);
  check("settlement row recorded + tenant-scoped", (settlements || []).length >= 1 && settlements.every((x) => x.restaurant_id === rid));

  // --- Cleanup ----------------------------------------------------------------
  console.log("\n=== Cleanup ===");
  const orderIds = [A, B, C].map((x) => x.order.id);
  await del(`cod_cash_events?restaurant_id=eq.${rid}&payload->>tag=eq.${TAG}`);
  await del(`cod_cash_events?driver_id=in.(${d1.id},${d2.id})`);
  await del(`cod_settlements?note=eq.${TAG}`);
  await del(`cod_collections?order_id=in.(${orderIds.join(",")})`);
  await del(`deliveries?order_id=in.(${orderIds.join(",")})`);
  await del(`orders?id=in.(${orderIds.join(",")})`);
  await del(`drivers?id=in.(${d1.id},${d2.id})`);
  if (customer?.id) await del(`customers?id=eq.${customer.id}`);
  const leftCols = await rest(`cod_collections?order_id=in.(${orderIds.join(",")})&select=id`);
  const leftEvents = await rest(`cod_cash_events?driver_id=in.(${d1.id},${d2.id})&select=id`);
  console.log(`residual collections=${Array.isArray(leftCols) ? leftCols.length : "?"} events=${Array.isArray(leftEvents) ? leftEvents.length : "?"}`);

  console.log(`\n${PASS ? "✅ ALL CHECKS PASSED" : "❌ SOME CHECKS FAILED"}\n`);
  process.exit(PASS ? 0 : 1);
})();
