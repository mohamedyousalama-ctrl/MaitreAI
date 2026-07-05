// ============================================================================
// MaitreAI — WO-SAFE-1: safety-hold predicates (pure; browser+server safe)
// The pure decisions behind the order/payment safety-hold guard, split out from
// the server-only DB helper so they are unit-testable without `server-only`.
// ============================================================================

/** The order states that COMMIT an order toward money/kitchen/customer. A safety
 *  hold blocks a transition INTO any of these. draft / pending_* / cancelled are
 *  not commitments (cancelling a held order is always allowed). */
export const COMMITTED_ORDER_STATUSES: readonly string[] = [
  "paid", "preparing", "ready", "out_for_delivery", "delivered",
] as const;

export function isCommittedStatus(status: string): boolean {
  return COMMITTED_ORDER_STATUSES.includes(status);
}

/** A conversation is safety-held when its ownership_state is SYSTEM_HOLD OR the
 *  is_safety_hold flag is set. Pure. */
export function isSafetyHeld(conv: { ownership_state?: string | null; is_safety_hold?: boolean | null } | null): boolean {
  if (!conv) return false;
  return conv.ownership_state === "SYSTEM_HOLD" || conv.is_safety_hold === true;
}
