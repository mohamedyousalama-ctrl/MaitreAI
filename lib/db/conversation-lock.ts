// ============================================================================
// MaitreAI — per-conversation Brain-turn mutex (Pillar 3)
//
// withConversationLock(admin, conversationId, fn) runs fn() with exclusive
// per-conversation serialization. Two invocations for the SAME conversation
// are queued strictly one-after-another; invocations for DIFFERENT
// conversations run fully in parallel — no global serialization.
//
// Mechanism: distributed mutex via INSERT ON CONFLICT DO NOTHING on the
// conversation_locks table. This is atomic at any Postgres isolation level
// and works correctly through pgBouncer in transaction mode (where
// session-level pg_advisory_lock cannot survive across separate HTTP calls).
//
// Acquire strategy:
//   1. Expire stale locks (> LOCK_TTL_S seconds old) — self-healing.
//   2. INSERT our token; if 0 rows → retry with RETRY_DELAY_MS backoff up to
//      MAX_RETRIES times, then fall through (never drop the message).
//   3. Run fn() with the lock held.
//   4. Release in finally (DELETE WHERE token matches — prevents double-release).
//
// Deadlock safety: no two-phase locking, no lock ordering, single-row scope.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const LOCK_TTL_S = 60;       // stale-lock expiry — well beyond any Brain turn
const MAX_RETRIES = 8;       // total wait ≤ ~12 s (covers a 5-10 s Brain turn)
const RETRY_DELAY_MS = 1500; // 1.5 s per retry

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Run `fn` with an exclusive per-conversation lock.
 *
 * Acquires the lock before calling fn and releases it in a finally block.
 * If the lock cannot be acquired after retries (another turn is still running),
 * falls through and calls fn anyway — per the "never drop a message" guardrail.
 * A fallthrough is logged so it can be monitored.
 */
export async function withConversationLock<T>(
  admin: SupabaseClient,
  conversationId: string,
  fn: () => Promise<T>
): Promise<T> {
  const token = randomUUID();
  let lockHeld = false;

  // Expire any stale locks for this conversation first (self-healing).
  const ttlCutoff = new Date(Date.now() - LOCK_TTL_S * 1000).toISOString();
  await admin
    .from("conversation_locks")
    .delete()
    .eq("conversation_id", conversationId)
    .lt("locked_at", ttlCutoff);

  // Try to acquire — INSERT ON CONFLICT DO NOTHING is atomic.
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS);

    // Also sweep stale locks on each retry (the holder may have crashed).
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
    // error.code 23505 = unique_violation (conflict) — another turn holds the lock.
    // Any other error is unexpected; log and fall through immediately.
    if (error.code !== "23505") {
      console.error("[conv-lock] unexpected acquire error", error);
      break;
    }
  }

  if (!lockHeld) {
    // Graceful degradation: we exhausted retries or hit an unexpected error.
    // Process anyway — never drop a customer message.
    console.warn("[conv-lock] could not acquire lock for", conversationId, "— processing without lock (graceful fallthrough)");
  }

  try {
    return await fn();
  } finally {
    if (lockHeld) {
      const { error: relErr } = await admin
        .from("conversation_locks")
        .delete()
        .eq("conversation_id", conversationId)
        .eq("lock_token", token);
      if (relErr) {
        console.error("[conv-lock] release error (lock will expire via TTL)", relErr);
      }
    }
  }
}
