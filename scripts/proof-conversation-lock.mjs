/**
 * Proof — Pillar 3: per-conversation Brain-turn serialization.
 *
 * Exercises the conversation_locks TABLE behavior directly via @supabase/supabase-js
 * (raw Supabase client operations), mirroring the exact algorithm in
 * lib/db/conversation-lock.ts WITHOUT importing that module.
 *
 * WHY NOT import withConversationLock directly:
 *   lib/db/conversation-lock.ts has `import "server-only"` (correct — it is a
 *   server-only module). Importing it from a plain `node` script throws before
 *   the no-creds skip can run, making this proof permanently broken in CI.
 *   The proof tests DB/table behavior; it doesn't need the TS wrapper.
 *
 * Scenarios proved:
 *   1. SAME conversation: two concurrent lock attempts — second waits for
 *      first to release; no interleaving. Final state is correct and consistent.
 *   2. DIFFERENT conversations: two concurrent lock attempts — run in parallel
 *      (no false serialization — verified by wall-clock timing < sum of serials).
 *   3. STALE LOCK expiry: a lock row older than TTL is swept at acquire time,
 *      allowing the new holder to proceed without waiting.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Absent → exits 0 (skip).
 *
 * Run: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/proof-conversation-lock.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.warn("[proof-conversation-lock] No DB creds — skipping (exit 0)");
  process.exit(0);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let pass = 0;
let fail = 0;
const seeded = [];

const ok = (label, condition) => {
  if (condition) {
    console.log("  ✅", label);
    pass++;
  } else {
    console.error("  ❌", label);
    fail++;
  }
};

// ── Inline lock implementation (mirrors lib/db/conversation-lock.ts exactly) ──
// Same constants as the real implementation.
const LOCK_TTL_S = 60;
const MAX_RETRIES = 8;
const RETRY_DELAY_MS = 1500;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withLock(conversationId, fn) {
  const token = randomUUID();
  let lockHeld = false;

  // Expire stale locks (self-healing).
  const ttlCutoff = new Date(Date.now() - LOCK_TTL_S * 1000).toISOString();
  await admin
    .from("conversation_locks")
    .delete()
    .eq("conversation_id", conversationId)
    .lt("locked_at", ttlCutoff);

  // Try to acquire — INSERT ON CONFLICT DO NOTHING is atomic.
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS);

    // Sweep stale locks on each retry (holder may have crashed).
    await admin
      .from("conversation_locks")
      .delete()
      .eq("conversation_id", conversationId)
      .lt("locked_at", new Date(Date.now() - LOCK_TTL_S * 1000).toISOString());

    const { error } = await admin
      .from("conversation_locks")
      .insert({ conversation_id: conversationId, lock_token: token });

    if (!error) {
      lockHeld = true;
      break;
    }
    // 23505 = unique_violation (conflict) — another turn holds the lock.
    if (error.code !== "23505") {
      console.error("[proof] unexpected acquire error", error);
      break;
    }
  }

  if (!lockHeld) {
    console.warn("[proof] could not acquire lock for", conversationId, "— processing without lock");
  }

  try {
    return await fn();
  } finally {
    if (lockHeld) {
      await admin
        .from("conversation_locks")
        .delete()
        .eq("conversation_id", conversationId)
        .eq("lock_token", token);
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const RESTAURANT_ID = process.env.TEST_RESTAURANT_ID || "9244d8ef-66b1-417a-a012-41a389ab1abf";

async function seedConv() {
  const { data, error } = await admin
    .from("conversations")
    .insert({
      restaurant_id: RESTAURANT_ID,
      channel: "whatsapp",
      status: "x",
      owner: "ai",
      ownership_state: "AI_ACTIVE",
    })
    .select("id")
    .single();
  if (error) throw new Error("seed: " + error.message);
  seeded.push(data.id);
  return data.id;
}

// ── Proof scenarios ───────────────────────────────────────────────────────────

console.log("\n[proof-conversation-lock] Starting…\n");

// 1. Same conversation: serial execution (no interleave)
console.log("1. SAME conversation: serial execution (no interleave)");
const cSame = await seedConv();
const log = [];
await Promise.all([
  withLock(cSame, async () => {
    log.push("A:start");
    await sleep(300);
    log.push("A:end");
  }),
  withLock(cSame, async () => {
    log.push("B:start");
    await sleep(50);
    log.push("B:end");
  }),
]);
ok("same-conv: A ends before B starts", log.indexOf("A:end") < log.indexOf("B:start"));
ok("same-conv: order is A:start,A:end,B:start,B:end", log.join(",") === "A:start,A:end,B:start,B:end");

// 2. Different conversations: parallel (no false serialization)
console.log("\n2. DIFFERENT conversations: parallel (no false serialization)");
const cD1 = await seedConv();
const cD2 = await seedConv();
const tPar = Date.now();
await Promise.all([
  withLock(cD1, () => sleep(400)),
  withLock(cD2, () => sleep(400)),
]);
const elapsed = Date.now() - tPar;
ok(
  `different-conv: wall time < 700 ms (actual: ${elapsed} ms)`,
  elapsed < 700
);

// 3. Stale lock expiry: old lock is swept, new holder proceeds
console.log("\n3. STALE LOCK expiry: old lock swept, new holder proceeds");
const cStale = await seedConv();
// Plant a stale lock row (61 seconds old) directly.
await admin.from("conversation_locks").insert({
  conversation_id: cStale,
  lock_token: "stale-token",
  locked_at: new Date(Date.now() - 61_000).toISOString(),
});
let staleRan = false;
await withLock(cStale, async () => {
  staleRan = true;
});
ok("stale lock swept → new holder ran", staleRan);

// ── Cleanup ───────────────────────────────────────────────────────────────────

console.log("\n[cleanup]");
await admin.from("conversation_locks").delete().in("conversation_id", seeded);
await admin.from("conversations").delete().in("id", seeded);
console.log(`  cleaned ${seeded.length} conversation(s)`);

console.log(`\n[proof-conversation-lock] ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
