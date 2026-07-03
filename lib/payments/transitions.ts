// ============================================================================
// Kivo (KSA) — WO-3b: idempotent payment-session state transitions (server only).
//
// markPaymentSessionPaid is the DB-layer idempotency guard for settlement: it
// advances a session to 'paid' with an ATOMIC, condition-guarded UPDATE
// (`... WHERE id = ? AND status <> 'paid'`). Calling it twice for the same
// session moves money-state once — the second call matches zero rows and is a
// logged no-op. This is the create/settlement-layer half of idempotency; the
// (future) webhook route must ADDITIONALLY dedup by provider event id and no-op
// on an already-terminal session (acceptance criterion inherited from WO-3b).
//
// The admin client is INJECTED. Value imports are limited to `server-only`
// (react-server no-op under the unit runner) so this module is node-loadable and
// the guard can be tested directly against a fake admin; the type import erases.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface MarkPaidResult {
  /** true if THIS call performed the transition; false = already paid / missing. */
  changed: boolean;
}

/**
 * Transition a payment session to 'paid' exactly once. Idempotent: a repeat call
 * (session already 'paid') updates nothing and logs a no-op. Race-safe: the
 * `.neq("status","paid")` guard means two concurrent callers can't both win.
 */
export async function markPaymentSessionPaid(
  admin: SupabaseClient,
  sessionId: string
): Promise<MarkPaidResult> {
  const { data, error } = await admin
    .from("payment_sessions")
    .update({ status: "paid", updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .neq("status", "paid")
    .select("id");
  if (error) {
    // Surface nothing money-moving on error; caller/webhook can retry.
    console.error(`[payments] markPaymentSessionPaid failed for ${sessionId}: ${error.message ?? "error"}`);
    return { changed: false };
  }
  const changed = Array.isArray(data) && data.length > 0;
  if (!changed) {
    console.log(`[payments] markPaymentSessionPaid no-op: session ${sessionId} already paid or missing`);
  }
  return { changed };
}
