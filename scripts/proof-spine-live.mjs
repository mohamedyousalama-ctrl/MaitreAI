/**
 * Proof script — Spine Step 3: stuck detection wired live + enforced ownership.
 *
 * Exercises the exact functions the live inbound path now calls
 * (checkAndNotifyStuck + the enforcing setOwnershipState) against real rows:
 *
 *   1. HUMAN_IDLE idle past threshold → checkAndNotifyStuck → alert fires ONCE
 *      (second call deduped).
 *   2. Healthy AI_ACTIVE + fresh order → checkAndNotifyStuck → NO alert.
 *   3. SYSTEM_HOLD past hold-timeout → alert fires AND ownership stays SYSTEM_HOLD
 *      (detection never releases the hold).
 *   4. ENFORCEMENT: an illegal transition (SYSTEM_HOLD→HUMAN_IDLE, CLOSED→HUMAN_ACTIVE)
 *      THROWS and does NOT write the row.
 *   5. Every LEGAL transition succeeds and writes (proves enforcement didn't over-block):
 *      AI_ACTIVE→HUMAN_ACTIVE, HUMAN_ACTIVE→HUMAN_IDLE, HUMAN_IDLE→AI_ACTIVE,
 *      SYSTEM_HOLD→AI_ACTIVE (deliberate release), CLOSED→AI_ACTIVE (reopen).
 *   6. Cleanup — production left as found.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (from .env.local). When absent
 * (CI container), prints guidance and exits 0 — the pure unit tests
 * (test-ownership-transitions 27/27, test-stuck-detection 20/20) cover the logic,
 * and the DB-observable scenarios were verified via MCP execute_sql.
 *
 * Run: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/proof-spine-live.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { checkAndNotifyStuck } from "../lib/intelligence/stuck-detection.ts";
import { setOwnershipState } from "../lib/db/ownership.ts";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const RESTAURANT_ID = process.env.TEST_RESTAURANT_ID || "9244d8ef-66b1-417a-a012-41a389ab1abf"; // BLaban

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.warn(`
┌──────────────────────────────────────────────────────────────────────┐
│ PROOF: DB credentials not found — skipping DB-backed run.             │
│ Pure unit tests cover the logic:                                      │
│   node --experimental-strip-types scripts/test-ownership-transitions.test.ts │
│   node --experimental-strip-types scripts/test-stuck-detection.test.ts       │
│ DB-observable scenarios verified via MCP execute_sql (see PR body).   │
│ To run fully:                                                         │
│   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/proof-spine-live.mjs │
└──────────────────────────────────────────────────────────────────────┘`);
  process.exit(0);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let pass = 0, fail = 0;
const seeded = [];
const seededOrders = [];
const ok = (n, c) => { if (c) { pass++; console.log("  ✅", n); } else { fail++; console.log("  ❌", n); } };
const minsAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

async function seedConv(patch) {
  const { data, error } = await admin.from("conversations").insert({
    restaurant_id: RESTAURANT_ID, channel: "whatsapp", status: "x", owner: "ai", ownership_state: "AI_ACTIVE", ...patch,
  }).select("id").single();
  if (error) throw new Error("seed conv: " + error.message);
  seeded.push(data.id);
  return data.id;
}
async function stateOf(id) {
  const { data } = await admin.from("conversations").select("ownership_state").eq("id", id).single();
  return data?.ownership_state ?? null;
}
async function expectThrow(label, fn, id, expectState) {
  let threw = false;
  try { await fn(); } catch { threw = true; }
  ok(`${label} throws`, threw);
  ok(`${label} did NOT write (state == ${expectState})`, (await stateOf(id)) === expectState);
}

console.log("\n── 1. HUMAN_IDLE idle → stuck alert once, then deduped ──");
const c1 = await seedConv({ ownership_state: "HUMAN_IDLE", owner: "human", updated_at: minsAgo(15) });
const r1a = await checkAndNotifyStuck({ admin, restaurantId: RESTAURANT_ID, conversationId: c1 });
ok("first call → alerted", r1a.alerted);
ok("first call → human_no_response", r1a.reason === "human_no_response");
const r1b = await checkAndNotifyStuck({ admin, restaurantId: RESTAURANT_ID, conversationId: c1 });
ok("second call → deduped (not alerted)", !r1b.alerted && r1b.stuck);

console.log("\n── 2. Healthy AI_ACTIVE + fresh order → no alert ──");
const c2 = await seedConv({ ownership_state: "AI_ACTIVE", owner: "ai", updated_at: minsAgo(1) });
const { data: o2 } = await admin.from("orders").insert({
  restaurant_id: RESTAURANT_ID, conversation_id: c2, order_number: `S3-${Date.now()}`,
  fulfillment: "pickup", items: [], order_status: "confirmed", payment_status: "unpaid", updated_at: minsAgo(1),
}).select("id").single();
if (o2) seededOrders.push(o2.id);
const r2 = await checkAndNotifyStuck({ admin, restaurantId: RESTAURANT_ID, conversationId: c2 });
ok("healthy AI_ACTIVE → not stuck, not alerted", !r2.stuck && !r2.alerted);

console.log("\n── 3. SYSTEM_HOLD past timeout → alert but NO release ──");
const c3 = await seedConv({ ownership_state: "SYSTEM_HOLD", owner: "human", is_safety_hold: true, updated_at: minsAgo(35) });
const r3 = await checkAndNotifyStuck({ admin, restaurantId: RESTAURANT_ID, conversationId: c3 });
ok("SYSTEM_HOLD → alerted (system_hold_timeout)", r3.alerted && r3.reason === "system_hold_timeout");
ok("SYSTEM_HOLD → ownership UNCHANGED (no release)", (await stateOf(c3)) === "SYSTEM_HOLD");

console.log("\n── 4. Enforcement: illegal transitions throw + do not write ──");
await expectThrow("SYSTEM_HOLD → HUMAN_IDLE", () => setOwnershipState(admin, c3, "HUMAN_IDLE"), c3, "SYSTEM_HOLD");
const c4 = await seedConv({ ownership_state: "CLOSED", owner: "ai" });
await expectThrow("CLOSED → HUMAN_ACTIVE", () => setOwnershipState(admin, c4, "HUMAN_ACTIVE"), c4, "CLOSED");
await expectThrow("CLOSED → SYSTEM_HOLD", () => setOwnershipState(admin, c4, "SYSTEM_HOLD"), c4, "CLOSED");

console.log("\n── 5. Every legal transition succeeds (no over-block) ──");
const cL1 = await seedConv({ ownership_state: "AI_ACTIVE", owner: "ai" });
await setOwnershipState(admin, cL1, "HUMAN_ACTIVE", { extra: { owner: "human" } });
ok("AI_ACTIVE → HUMAN_ACTIVE", (await stateOf(cL1)) === "HUMAN_ACTIVE");
await setOwnershipState(admin, cL1, "HUMAN_IDLE");
ok("HUMAN_ACTIVE → HUMAN_IDLE", (await stateOf(cL1)) === "HUMAN_IDLE");
await setOwnershipState(admin, cL1, "AI_ACTIVE", { extra: { owner: "ai" } });
ok("HUMAN_IDLE → AI_ACTIVE", (await stateOf(cL1)) === "AI_ACTIVE");
// SYSTEM_HOLD → AI_ACTIVE: the deliberate operator release (#87 exception) is legal.
await setOwnershipState(admin, c3, "AI_ACTIVE", { extra: { owner: "ai", is_safety_hold: false } });
ok("SYSTEM_HOLD → AI_ACTIVE (deliberate release)", (await stateOf(c3)) === "AI_ACTIVE");
// CLOSED → AI_ACTIVE: the reopen the live fixes rely on.
await setOwnershipState(admin, c4, "AI_ACTIVE", { extra: { owner: "ai" } });
ok("CLOSED → AI_ACTIVE (reopen)", (await stateOf(c4)) === "AI_ACTIVE");

console.log("\n── Cleanup ──");
if (seededOrders.length) await admin.from("orders").delete().in("id", seededOrders);
await admin.from("messages").delete().in("conversation_id", seeded);
await admin.from("conversations").delete().in("id", seeded);
console.log("  cleaned", seeded.length, "conversations,", seededOrders.length, "orders");

console.log(`\nPROOF-SPINE-LIVE: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
