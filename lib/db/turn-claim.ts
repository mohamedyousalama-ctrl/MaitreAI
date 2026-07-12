// ============================================================================
// MaitreAI — WO-LIVE6-TURN-LOCK: atomic per-conversation Brain-turn claim.
//
// Concurrent inbound webhooks for the SAME conversation otherwise both read the
// post-success `last_answered_inbound_at` watermark BEFORE either stamps it, so both run
// the LLM and BOTH reply (live dup: conv 68966859, 15:19 — two turns 56ms apart on
// identical input; the conversation_locks table-mutex did not serialize them). A single
// ATOMIC compare-and-set on `conversations.turn_claimed_at` is immune to whatever defeats
// the table-lock.
//
// SERIALIZE, never drop: the claim is BLOCKING. The winner (1 row updated) runs the turn;
// a concurrent caller BLOCKS until the winner releases, then re-reads the freshly-stamped
// watermark and the existing coalescing (coalesceInbound) either finds the burst already
// covered → returns null → the caller stays silent (the "loser exits silently" outcome),
// or finds a mid-turn straggler (> the new watermark) → answers it (the winner's follow-up
// via coalescing). So NOTHING is dropped and NOTHING is answered twice. A stale claim
// (older than the turn-max TTL — a crashed turn) is reclaimable, so a conversation never
// wedges. `last_answered_inbound_at` stays a strictly post-SUCCESS truth — this marker
// never advances it, so a crashed turn never loses the message.
//
// Deploy-safe: while the 0086 column is absent (42703) — or on any transient error — the
// claim is a no-op that PROCEEDS (claimed:true, deployed:false). "Never drop a message"
// outranks "never duplicate": a missing column / transient DB blip must not silence a
// customer; it degrades to today's (pre-lock) behavior, which is what ships until the
// ceremony lane applies the migration and the coalescing flag is on.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** A crashed/hung turn is reclaimable after this window so a conversation never wedges.
 *  Well beyond any real Brain turn (~5-10s) yet short enough that a genuine crash frees
 *  the next arrival quickly. */
export const TURN_CLAIM_TTL_MS = 90_000;
const BLOCK_MAX_WAIT_MS = 12_000; // total blocking wait ≈ a slow Brain turn (then proceed)
const BLOCK_RETRY_MS = 1_500;

export interface TurnClaimResult {
  /** True → this caller may proceed (it owns the turn, or the claim is inert/degraded).
   *  Callers never "drop" on false — the blocking claimTurn only returns false when it is
   *  certain a fresh claim is held AND the wait budget is exhausted; see claimTurn. */
  claimed: boolean;
  /** False when the 0086 column is absent (claim inert) or a transient error made the
   *  claim a proceed-anyway no-op. Callers should NOT release() a non-deployed claim. */
  deployed: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * ONE atomic compare-and-set claim attempt. `nowMs` is injected (not Date.now()) so this
 * is deterministic and unit-testable. Returns claimed:true iff the UPDATE set the marker
 * (no fresh claim was held); deployed:false when the column is absent / a transient error
 * (→ proceed-anyway, never drop).
 */
export async function claimTurnOnce(
  admin: SupabaseClient,
  conversationId: string,
  opts: { nowMs: number; ttlMs?: number }
): Promise<TurnClaimResult> {
  const ttlMs = opts.ttlMs ?? TURN_CLAIM_TTL_MS;
  const nowIso = new Date(opts.nowMs).toISOString();
  const staleCutoffIso = new Date(opts.nowMs - ttlMs).toISOString();
  const { data, error } = await admin
    .from("conversations")
    .update({ turn_claimed_at: nowIso })
    .eq("id", conversationId)
    // claimable only when NO fresh claim is held: never claimed, or the last claim is stale.
    .or(`turn_claimed_at.is.null,turn_claimed_at.lt.${staleCutoffIso}`)
    .select("id");
  if (error) {
    if (error.code !== "42703" && !/does not exist/i.test(error.message ?? "")) {
      console.error("[turn-claim] claim error — proceeding without the lock (non-blocking)", error);
    }
    return { claimed: true, deployed: false }; // column absent / transient → proceed, never drop
  }
  return { claimed: (data?.length ?? 0) > 0, deployed: true };
}

/**
 * BLOCKING claim: retry claimTurnOnce until acquired or the wait budget is spent. A losing
 * caller blocks here while the winner runs, then the caller re-reads the (now advanced)
 * watermark and coalescing decides silent-skip vs straggler-follow-up. On budget exhaustion
 * (a turn slower than the whole window — rare) it PROCEEDS anyway (claimed:true) rather than
 * drop the message. Uses real time internally; a non-deployed result short-circuits.
 */
export async function claimTurn(
  admin: SupabaseClient,
  conversationId: string,
  opts?: { ttlMs?: number; maxWaitMs?: number; retryMs?: number }
): Promise<TurnClaimResult> {
  const maxWaitMs = opts?.maxWaitMs ?? BLOCK_MAX_WAIT_MS;
  const retryMs = opts?.retryMs ?? BLOCK_RETRY_MS;
  const started = Date.now();
  // First attempt immediately.
  let res = await claimTurnOnce(admin, conversationId, { nowMs: Date.now(), ttlMs: opts?.ttlMs });
  if (res.claimed || !res.deployed) return res;
  // Contended: block-retry until acquired or the budget is spent.
  while (Date.now() - started < maxWaitMs) {
    await sleep(retryMs);
    res = await claimTurnOnce(admin, conversationId, { nowMs: Date.now(), ttlMs: opts?.ttlMs });
    if (res.claimed || !res.deployed) return res;
  }
  // Budget exhausted (winner turn longer than the whole window) → proceed anyway (never drop).
  console.warn("[turn-claim] wait budget exhausted for", conversationId, "— proceeding (rare)");
  return { claimed: true, deployed: res.deployed };
}

/**
 * Clear the claim after the turn so a legitimate follow-up isn't delayed by the TTL.
 * Best-effort — a missed release just waits out TURN_CLAIM_TTL_MS. Only call for a claim
 * that was actually `deployed`.
 */
export async function releaseTurn(admin: SupabaseClient, conversationId: string): Promise<void> {
  try {
    await admin.from("conversations").update({ turn_claimed_at: null }).eq("id", conversationId);
  } catch (e) {
    console.error("[turn-claim] release error (claim will expire via TTL)", e);
  }
}
