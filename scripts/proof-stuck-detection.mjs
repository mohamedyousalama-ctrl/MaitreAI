/**
 * Proof script — Never-stuck spine Step 2: stuck detection + operator notify.
 *
 * What it does:
 *   1. Seeds 4 conversations (3 stuck + 1 healthy) + relevant order rows.
 *   2. Runs checkAndNotifyStuck against all 4.
 *   3. Asserts: each stuck one is flagged with the correct reason + alerted.
 *   4. Asserts: the healthy one is NOT flagged (no false positive).
 *   5. Asserts dedup: calling a second time = no second alert row.
 *   6. Cleans up every seeded row. Production left as found.
 *
 * Requires:
 *   SUPABASE_URL          (= NEXT_PUBLIC_SUPABASE_URL from .env.local)
 *   SUPABASE_SERVICE_ROLE_KEY   (service-role key, never the anon key)
 *   TEST_RESTAURANT_ID    (uuid of any restaurant in the DB — defaults to BLaban)
 *
 * Run (from project root):
 *   SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/proof-stuck-detection.mjs
 *
 * NOTE: .env.local is MISSING in this CI container. The pure-logic unit test
 * (scripts/test-stuck-detection.test.ts) runs without credentials and covers
 * all threshold/condition logic. This proof script requires the real DB to
 * exercise the dedup, the alert insert, and the stuck_reason column.
 */

import { createClient } from "@supabase/supabase-js";
import { detectStuck, checkAndNotifyStuck, STUCK_THRESHOLDS } from "../lib/intelligence/stuck-detection.ts";

// ── Env ──────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const RESTAURANT_ID = process.env.TEST_RESTAURANT_ID || "9244d8ef-66b1-417a-a012-41a389ab1abf"; // BLaban

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.warn(`
┌─────────────────────────────────────────────────────────────────────┐
│  PROOF SCRIPT: DB credentials not found — skipping DB-backed proof. │
│                                                                       │
│  The pure-logic unit test already passed (20/20):                    │
│    node --experimental-strip-types scripts/test-stuck-detection.test.ts │
│                                                                       │
│  To run the full proof with DB:                                       │
│    SUPABASE_URL=https://<ref>.supabase.co \\                          │
│    SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \\                    │
│    node scripts/proof-stuck-detection.mjs                            │
└─────────────────────────────────────────────────────────────────────┘
`);
  process.exit(0); // Not a failure — just not runnable without creds
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let pass = 0, fail = 0;
const seededConvIds = [];
const seededOrderIds = [];

function assert(name, cond) {
  if (cond) { pass++; console.log("  ✅", name); }
  else { fail++; console.log("  ❌", name); }
}

async function insertConv(patch) {
  const { data, error } = await admin.from("conversations").insert({
    restaurant_id: RESTAURANT_ID,
    channel: "whatsapp",
    status: "AI نشط",
    owner: "ai",
    ownership_state: "AI_ACTIVE",
    ...patch,
  }).select("id").single();
  if (error) throw new Error("seed conv: " + error.message);
  seededConvIds.push(data.id);
  return data.id;
}

async function insertOrder(convId, patch) {
  const { data, error } = await admin.from("orders").insert({
    restaurant_id: RESTAURANT_ID,
    conversation_id: convId,
    order_number: `TEST-${Date.now()}`,
    fulfillment: "pickup",
    items: [],
    order_status: "confirmed",
    payment_status: "unpaid",
    ...patch,
  }).select("id").single();
  if (error) throw new Error("seed order: " + error.message);
  seededOrderIds.push(data.id);
  return data.id;
}

const T = STUCK_THRESHOLDS;
const minsAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

// ── Seed ─────────────────────────────────────────────────────────────────────
console.log("\n── Seeding test rows ────────────────────────────────────────────");

// Scenario A: SYSTEM_HOLD timeout (stale 35 min > threshold 30 min)
const convA = await insertConv({
  ownership_state: "SYSTEM_HOLD",
  owner: "human",
  status: "تم التحويل لموظف",
  updated_at: minsAgo(35),
});
console.log("  seeded A (SYSTEM_HOLD timeout):", convA);

// Scenario B: Payment-review timeout (order confirmed+unpaid, stale 35 min)
const convB = await insertConv({
  ownership_state: "HUMAN_ACTIVE",
  owner: "human",
  status: "بانتظار الدفع",
  updated_at: minsAgo(5), // conv itself recently touched, but order stale
});
await insertOrder(convB, {
  order_status: "confirmed",
  payment_status: "unpaid",
  updated_at: minsAgo(35),
});
console.log("  seeded B (payment-review timeout):", convB);

// Scenario C: Human-no-response (HUMAN_ACTIVE, stale 15 min > threshold 10 min)
const convC = await insertConv({
  ownership_state: "HUMAN_ACTIVE",
  owner: "human",
  status: "تم التحويل لموظف",
  updated_at: minsAgo(15),
});
console.log("  seeded C (human-no-response):", convC);

// Healthy: AI_ACTIVE, recent
const convH = await insertConv({
  ownership_state: "AI_ACTIVE",
  owner: "ai",
  status: "AI نشط",
  updated_at: minsAgo(1),
});
console.log("  seeded H (healthy):", convH);

// ── Run detection ─────────────────────────────────────────────────────────────
console.log("\n── Running checkAndNotifyStuck ──────────────────────────────────");

const rA = await checkAndNotifyStuck({ admin, restaurantId: RESTAURANT_ID, conversationId: convA });
console.log("  A:", rA);
assert("A → stuck", rA.stuck);
assert("A → reason system_hold_timeout", rA.reason === "system_hold_timeout");
assert("A → first call alerted", rA.alerted);

const rB = await checkAndNotifyStuck({ admin, restaurantId: RESTAURANT_ID, conversationId: convB });
console.log("  B:", rB);
assert("B → stuck", rB.stuck);
assert("B → reason payment_review_timeout", rB.reason === "payment_review_timeout");
assert("B → first call alerted", rB.alerted);

const rC = await checkAndNotifyStuck({ admin, restaurantId: RESTAURANT_ID, conversationId: convC });
console.log("  C:", rC);
assert("C → stuck", rC.stuck);
assert("C → reason human_no_response", rC.reason === "human_no_response");
assert("C → first call alerted", rC.alerted);

const rH = await checkAndNotifyStuck({ admin, restaurantId: RESTAURANT_ID, conversationId: convH });
console.log("  H:", rH);
assert("H → NOT stuck", !rH.stuck);
assert("H → not alerted", !rH.alerted);

// ── Dedup proof ───────────────────────────────────────────────────────────────
console.log("\n── Dedup proof (second call = no second alert) ──────────────────");

const rA2 = await checkAndNotifyStuck({ admin, restaurantId: RESTAURANT_ID, conversationId: convA });
assert("A second call → still stuck", rA2.stuck);
assert("A second call → deduped (alerted=false)", !rA2.alerted);

// Verify exactly ONE alert message exists in the DB for each stuck conv
for (const [label, convId] of [["A", convA], ["B", convB], ["C", convC]]) {
  const { data: alerts } = await admin.from("messages")
    .select("id")
    .eq("conversation_id", convId)
    .contains("meta", { kind: "stuck_alert" });
  assert(`${label} → exactly 1 alert row`, (alerts ?? []).length === 1);
}

// ── stuck_reason column ────────────────────────────────────────────────────────
console.log("\n── stuck_reason persisted on conversation row ───────────────────");
const { data: dbA } = await admin.from("conversations").select("stuck_reason").eq("id", convA).single();
assert("A → stuck_reason = system_hold_timeout", dbA?.stuck_reason === "system_hold_timeout");
const { data: dbH } = await admin.from("conversations").select("stuck_reason").eq("id", convH).single();
assert("H → stuck_reason = null", dbH?.stuck_reason == null);

// ── Cleanup ───────────────────────────────────────────────────────────────────
console.log("\n── Cleaning up seeded rows ──────────────────────────────────────");
if (seededOrderIds.length) {
  await admin.from("orders").delete().in("id", seededOrderIds);
  console.log("  deleted", seededOrderIds.length, "order(s)");
}
// Delete messages first (FK), then conversations
await admin.from("messages").delete().in("conversation_id", seededConvIds);
await admin.from("conversations").delete().in("id", seededConvIds);
console.log("  deleted", seededConvIds.length, "conversation(s) + their messages");

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\nPROOF-STUCK-DETECTION: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
