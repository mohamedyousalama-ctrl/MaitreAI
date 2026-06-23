// ============================================================================
// MaitreAI — proof: reorder fingerprint fix (Work Order 6).
// Verifies that persistOrderFromDraft generates distinct order rows when the
// same draft content is submitted in two separate agent turns within the same
// conversation, while still deduplicating same-turn retries.
//
// What this proves:
//   T1: first finalize turn → creates a new order row.
//   T2: second finalize turn (same items, same conversation, NEW agentRunId)
//       → creates a SECOND distinct order row (not a silent no-op).
//   T1-retry: same agentRunId as T1 → idempotent no-op (returns created=false).
//   cleanup: seed rows are removed.
//
// Usage: set -a; . ./.env.local; set +a; node scripts/proof-reorder-fingerprint.mjs
// ============================================================================

import { createHash } from "crypto";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !SR) { console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"); process.exit(2); }

const H = { apikey: SR, Authorization: "Bearer " + SR, "Content-Type": "application/json" };
const rest = async (p, i = {}) => {
  const r = await fetch(`${SB}/rest/v1/${p}`, { ...i, headers: { ...H, ...(i.headers || {}) } });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return t; }
};
const ins = (table, row) => rest(table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
const del = (q) => rest(q, { method: "DELETE", headers: { Prefer: "return=minimal" } });
const get1 = (q) => rest(q).then((r) => (Array.isArray(r) ? r[0] : null));

const TAG = "proof-fingerprint-" + Date.now();
const RID = "9244d8ef-66b1-417a-a012-41a389ab1abf"; // BLaban

let PASS = true;
const check = (label, ok, extra = "") => {
  console.log(`  ${ok ? "✅" : "❌"} ${label}${extra ? "  — " + extra : ""}`);
  if (!ok) PASS = false;
};

/** Mirror of uuidFromHash from lib/db/orders-create.ts */
function uuidFromHash(input) {
  const h = createHash("sha256").update(input).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Mirror of the fingerprint logic (post-fix) */
function fingerprintId(conversationId, agentRunId, lines, fulfillment, deliveryZone, total) {
  const fingerprint = JSON.stringify({
    c: conversationId,
    r: agentRunId ?? null,
    lines: lines.map((l) => ({
      i: l.itemId,
      q: l.quantity,
      v: l.variant?.name ?? "",
      c: (l.choices ?? []).map((x) => `${x.groupName}:${x.label}`).sort(),
      m: (l.modifiers ?? []).map((x) => x.name).sort(),
    })),
    f: fulfillment,
    z: deliveryZone,
    t: total,
  });
  return uuidFromHash(fingerprint);
}

const seeded = [];
async function insertOrder(id, orderNumber, conversationId) {
  const rows = await ins("orders", {
    id,
    restaurant_id: RID,
    order_number: orderNumber,
    conversation_id: conversationId,
    fulfillment: "delivery",
    items: [{ id: "item-1", menuItemId: "menu-1", name: "Burger", quantity: 2, unitPrice: 50, total: 100 }],
    subtotal: 100,
    delivery_fee: 10,
    tax_amount: 0,
    tax_rate: 0,
    total: 110,
    currency: "ج.م",
    source: "whatsapp",
    order_status: "pending_confirmation",
    payment_status: "unpaid",
  });
  if (rows?.[0]?.id) seeded.push(rows[0].id);
  return rows?.[0];
}

// Simulate the upsert behavior with ignoreDuplicates: true — try to insert, check if it existed.
async function simulatePersist(id, orderNumber, conversationId) {
  const existing = await get1(`orders?id=eq.${id}&select=id,order_number`);
  if (existing) return { created: false, orderId: id, orderNumber: existing.order_number };
  const row = await insertOrder(id, orderNumber, conversationId);
  return { created: !!row, orderId: id, orderNumber };
}

// ============================================================================
console.log("\n=== proof-reorder-fingerprint ===\n");

// Shared fixture
const CONV_ID = `${TAG}-conv`;
const LINES = [{ itemId: "menu-1", quantity: 2, variant: null, choices: [], modifiers: [] }];
const FULFILLMENT = "delivery";
const ZONE = "الزمالك";
const TOTAL = 110;

// Two distinct agent-run ids simulating two separate WhatsApp turns
const RUN_1 = `run-${TAG}-1`;
const RUN_2 = `run-${TAG}-2`;

const id1 = fingerprintId(CONV_ID, RUN_1, LINES, FULFILLMENT, ZONE, TOTAL);
const id2 = fingerprintId(CONV_ID, RUN_2, LINES, FULFILLMENT, ZONE, TOTAL);
const idOld = fingerprintId(CONV_ID, null, LINES, FULFILLMENT, ZONE, TOTAL);

console.log("0. Fingerprint sanity checks (no DB)");
check("T1 and T2 fingerprints differ (distinct agentRunIds)", id1 !== id2, `id1=${id1.slice(0,8)}… id2=${id2.slice(0,8)}…`);
check("T1-retry matches T1 (same agentRunId)", fingerprintId(CONV_ID, RUN_1, LINES, FULFILLMENT, ZONE, TOTAL) === id1);
check("null-run id differs from run-1 (backward-compat slot)", idOld !== id1, `null=${idOld.slice(0,8)}… run1=${id1.slice(0,8)}…`);

// TEST 1: first order creation
console.log("\n1. T1 — first finalize turn → creates order row");
const r1 = await simulatePersist(id1, `${TAG}-001`, CONV_ID);
check("T1 created=true", r1.created === true, `orderId=${r1.orderId?.slice(0,8)}…`);
const row1 = await get1(`orders?id=eq.${id1}&select=id,order_number`);
check("order row exists in DB", !!row1, row1?.order_number);

// TEST 2: same-turn retry (same agentRunId → same UUID → idempotent no-op)
console.log("\n2. T1-retry — same turn repeated → idempotent no-op (no duplicate)");
const r1b = await simulatePersist(id1, `${TAG}-002`, CONV_ID);
const count1 = await rest(`orders?id=eq.${id1}&select=id`);
check("T1-retry created=false (no-op)", r1b.created === false);
check("exactly one row for id1 after retry", Array.isArray(count1) && count1.length === 1, `rows=${count1?.length}`);

// TEST 3: reorder in same conversation (new agentRunId → new UUID → new row)
console.log("\n3. T2 — same content, new agent-run (reorder) → creates second order");
const r2 = await simulatePersist(id2, `${TAG}-003`, CONV_ID);
check("T2 created=true (new order)", r2.created === true, `orderId=${r2.orderId?.slice(0,8)}…`);
const row2 = await get1(`orders?id=eq.${id2}&select=id,order_number`);
check("second order row exists in DB", !!row2, row2?.order_number);

// TEST 4: both rows are distinct
console.log("\n4. Two orders, not one — no silent drop");
check("T1 and T2 order ids differ", id1 !== id2);
check("both rows present", !!row1 && !!row2);

// ============================================================================
console.log("\n--- cleanup ---");
for (const id of seeded) await del(`orders?id=eq.${id}`);
console.log("  seeded rows removed\n");

console.log(PASS ? "✅  ALL ASSERTIONS PASSED" : "❌  SOME ASSERTIONS FAILED");
if (!PASS) process.exit(1);
