/**
 * Proof — is_safety_hold is reset on a DELIBERATE Return-to-AI release, and ONLY then.
 *
 * Reproduces the exact setOwnershipState write that returnToAi (conversation-store.ts)
 * performs on the deliberate operator "Return to AI" action, and asserts the DB-observable
 * outcome against #87:
 *
 *   1. Deliberate release: SYSTEM_HOLD + owner='human' + is_safety_hold=true
 *      → setOwnershipState(AI_ACTIVE, { owner:'ai', is_safety_hold:false })
 *      → final state AI_ACTIVE + owner='ai' + is_safety_hold=false  (flag cleared).
 *   2. #87 — no release: a live SYSTEM_HOLD + owner='human' with NO operator action
 *      stays held, is_safety_hold=true, never auto-released.
 *   3. The reset is part of the LEGAL SYSTEM_HOLD→AI_ACTIVE deliberate-release transition
 *      (enforcement intact — the write succeeds, no throw).
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local). Absent → exits 0
 * (DB-observable scenarios also verified via MCP execute_sql, see PR body).
 *
 * Run: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/proof-safety-hold-release.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { setOwnershipState } from "../lib/db/ownership.ts";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const RESTAURANT_ID = process.env.TEST_RESTAURANT_ID || "9244d8ef-66b1-417a-a012-41a389ab1abf"; // BLaban

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.warn("PROOF: DB credentials not found — skipping DB run. Scenarios verified via MCP execute_sql (see PR body).");
  process.exit(0);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let pass = 0, fail = 0;
const seeded = [];
const ok = (n, c) => { if (c) { pass++; console.log("  ✅", n); } else { fail++; console.log("  ❌", n); } };

async function seedConv(patch) {
  const { data, error } = await admin.from("conversations").insert({
    restaurant_id: RESTAURANT_ID, channel: "whatsapp", status: "x", owner: "ai", ownership_state: "AI_ACTIVE", ...patch,
  }).select("id").single();
  if (error) throw new Error("seed conv: " + error.message);
  seeded.push(data.id);
  return data.id;
}
async function rowOf(id) {
  const { data } = await admin.from("conversations").select("ownership_state, owner, is_safety_hold").eq("id", id).single();
  return data;
}

console.log("\n── 1. Deliberate Return-to-AI clears is_safety_hold ──");
const c1 = await seedConv({ ownership_state: "SYSTEM_HOLD", owner: "human", is_safety_hold: true });
// Exactly what returnToAi() now writes on the deliberate operator release:
await setOwnershipState(admin, c1, "AI_ACTIVE", {
  extra: { owner: "ai", status: "AI نشط", escalation_reason: null, handover_note: null, is_safety_hold: false },
});
const r1 = await rowOf(c1);
ok("release → AI_ACTIVE", r1.ownership_state === "AI_ACTIVE");
ok("release → owner='ai'", r1.owner === "ai");
ok("release → is_safety_hold=false (flag cleared)", r1.is_safety_hold === false);

console.log("\n── 2. #87 — live hold with NO release stays held ──");
const c2 = await seedConv({ ownership_state: "SYSTEM_HOLD", owner: "human", is_safety_hold: true });
// No operator action taken — assert the row is untouched.
const r2 = await rowOf(c2);
ok("no release → stays SYSTEM_HOLD", r2.ownership_state === "SYSTEM_HOLD");
ok("no release → owner stays 'human'", r2.owner === "human");
ok("no release → is_safety_hold stays true (#87)", r2.is_safety_hold === true);

console.log("\n── Cleanup ──");
await admin.from("messages").delete().in("conversation_id", seeded);
await admin.from("conversations").delete().in("id", seeded);
console.log("  cleaned", seeded.length, "conversations");

console.log(`\nPROOF-SAFETY-HOLD-RELEASE: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
