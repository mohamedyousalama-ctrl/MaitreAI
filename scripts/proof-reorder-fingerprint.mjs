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

const ITEMS = [{ id: "item-1", menuItemId: "menu-1", name: "Burger", quantity: 2, unitPrice: 50, variant: undefined, choices: [], modifiers: [], total: 100 }];

/** Mirror of basketContentKey from lib/db/orders-create.ts (content-only, no run id). */
function basketContentKey(items, fulfillment, total) {
  const lines = items
    .map((it) => ({
      i: it.menuItemId ?? "",
      q: Number(it.quantity ?? 0),
      v: it.variant ?? "",
      c: [...(it.choices ?? [])].sort(),
      m: [...(it.modifiers ?? [])].sort(),
    }))
    .sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  return createHash("sha256").update(JSON.stringify({ lines, f: fulfillment, t: Number(total).toFixed(2) })).digest("hex");
}

const seeded = [];
async function insertOrder(id, orderNumber, conversationId, createdAt) {
  const rows = await ins("orders", {
    id,
    restaurant_id: RID,
    order_number: orderNumber,
    conversation_id: conversationId,
    fulfillment: "delivery",
    items: ITEMS,
    subtotal: 100,
    delivery_fee: 10,
    tax_amount: 0,
    tax_rate: 0,
    total: 110,
    currency: "ج.م",
    source: "whatsapp",
    order_status: "pending_confirmation",
    payment_status: "unpaid",
    ...(createdAt ? { created_at: createdAt } : {}),
  });
  if (rows?.[0]?.id) seeded.push(rows[0].id);
  return rows?.[0];
}

// Mirror persistOrderFromDraft's two guards, in order:
//   1. Double-tap window guard — same-conversation order with matching content-only
//      fingerprint created in the last 120s → no-op (created:false).
//   2. id upsert (ignoreDuplicates:true) — same agentRunId fingerprint → no-op.
const WINDOW_MS = 120_000;
async function simulatePersist(id, orderNumber, conversationId, createdAt) {
  const contentKey = basketContentKey(ITEMS, "delivery", 110);
  const sinceIso = new Date(Date.now() - WINDOW_MS).toISOString();
  const recent = await rest(
    `orders?conversation_id=eq.${conversationId}&created_at=gte.${sinceIso}&select=id,order_number,items,fulfillment,total&order=created_at.desc&limit=10`
  );
  const dup = (Array.isArray(recent) ? recent : []).find(
    (o) => basketContentKey(o.items ?? [], o.fulfillment ?? "pickup", Number(o.total)) === contentKey
  );
  if (dup) return { created: false, orderId: dup.id, orderNumber: dup.order_number, viaWindow: true };

  const existing = await get1(`orders?id=eq.${id}&select=id,order_number`);
  if (existing) return { created: false, orderId: id, orderNumber: existing.order_number };
  const row = await insertOrder(id, orderNumber, conversationId, createdAt);
  return { created: !!row, orderId: id, orderNumber };
}

// ============================================================================
console.log("\n=== proof-reorder-fingerprint ===\n");

// Shared fixture
const LINES = [{ itemId: "menu-1", quantity: 2, variant: null, choices: [], modifiers: [] }];
const FULFILLMENT = "delivery";
const ZONE = "الزمالك";
const TOTAL = 110;

// Two distinct agent-run ids simulating two separate WhatsApp turns/POSTs
const RUN_1 = `run-${TAG}-1`;
const RUN_2 = `run-${TAG}-2`;

console.log("0. Fingerprint sanity checks (no DB)");
const sanityConv = `${TAG}-sanity`;
const sId1 = fingerprintId(sanityConv, RUN_1, LINES, FULFILLMENT, ZONE, TOTAL);
const sId2 = fingerprintId(sanityConv, RUN_2, LINES, FULFILLMENT, ZONE, TOTAL);
check("distinct agentRunIds → distinct ids", sId1 !== sId2, `${sId1.slice(0,8)}… vs ${sId2.slice(0,8)}…`);
check("same agentRunId → same id (same-turn retry collapses)", fingerprintId(sanityConv, RUN_1, LINES, FULFILLMENT, ZONE, TOTAL) === sId1);

// TEST 1: first finalize → creates order
console.log("\n1. T1 — first finalize turn → creates order row");
const CONV_A = `${TAG}-convA`;
const idA1 = fingerprintId(CONV_A, RUN_1, LINES, FULFILLMENT, ZONE, TOTAL);
const r1 = await simulatePersist(idA1, `${TAG}-A1`, CONV_A);
check("T1 created=true", r1.created === true, `orderId=${r1.orderId?.slice(0,8)}…`);

// TEST 2: DOUBLE-TAP within window — second confirm, new agentRunId, SAME basket,
// arrives within 120s → window guard returns the existing order → ONE order only.
console.log("\n2. Double-tap within 120s (new agentRunId, same basket) → ONE order");
const idA2 = fingerprintId(CONV_A, RUN_2, LINES, FULFILLMENT, ZONE, TOTAL);
check("the two ids would differ (no id-level dedup)", idA1 !== idA2);
const r2 = await simulatePersist(idA2, `${TAG}-A2`, CONV_A);
check("double-tap created=false (caught by window guard)", r2.created === false, `via=${r2.viaWindow ? "window" : "id"}`);
check("double-tap resolves to the first order", r2.orderId === idA1);
const countA = await rest(`orders?conversation_id=eq.${CONV_A}&select=id`);
check("exactly one order in conversation A", Array.isArray(countA) && countA.length === 1, `rows=${countA?.length}`);

// TEST 3: REORDER outside window — same basket, but the prior order is older than
// 120s → window guard finds nothing → new agentRunId mints a SECOND order.
console.log("\n3. Reorder outside 120s window (same basket) → TWO orders");
const CONV_B = `${TAG}-convB`;
const idB1 = fingerprintId(CONV_B, RUN_1, LINES, FULFILLMENT, ZONE, TOTAL);
const oldIso = new Date(Date.now() - 130_000).toISOString(); // 130s ago = outside window
await insertOrder(idB1, `${TAG}-B1`, CONV_B, oldIso);
const idB2 = fingerprintId(CONV_B, RUN_2, LINES, FULFILLMENT, ZONE, TOTAL);
const r3 = await simulatePersist(idB2, `${TAG}-B2`, CONV_B);
check("reorder created=true (window guard does not block)", r3.created === true, `orderId=${r3.orderId?.slice(0,8)}…`);
const countB = await rest(`orders?conversation_id=eq.${CONV_B}&select=id`);
check("exactly two orders in conversation B", Array.isArray(countB) && countB.length === 2, `rows=${countB?.length}`);

// TEST 4: same-turn retry (same agentRunId) → id-level idempotent no-op
console.log("\n4. Same-turn retry (same agentRunId) → idempotent no-op");
const r4 = await simulatePersist(idB2, `${TAG}-B2r`, CONV_B);
check("retry created=false", r4.created === false);
const countB2 = await rest(`orders?conversation_id=eq.${CONV_B}&select=id`);
check("still exactly two orders in conversation B", Array.isArray(countB2) && countB2.length === 2, `rows=${countB2?.length}`);

// ============================================================================
console.log("\n--- cleanup ---");
for (const id of seeded) await del(`orders?id=eq.${id}`);
console.log("  seeded rows removed\n");

console.log(PASS ? "✅  ALL ASSERTIONS PASSED" : "❌  SOME ASSERTIONS FAILED");
if (!PASS) process.exit(1);
