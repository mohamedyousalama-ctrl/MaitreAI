// ============================================================================
// MaitreAI — WO-SAFE-1: order/payment ↔ safety-hold guard (server only)
// A SYSTEM_HOLD on a conversation means an UNRESOLVED allergy/safety/medical
// concern (set by the deterministic allergen gate or a human). An order linked to
// that conversation MUST NOT be committed — advanced to paid / preparing / ready /
// out_for_delivery / delivered — while the hold is active: doing so would push a
// possibly-unsafe order to the kitchen/customer before the concern is resolved.
//
// The guard blocks the transition with 409 + a reason. RELEASE is an explicit
// operator next-action: resolve the SYSTEM_HOLD (the deliberate human release on
// the conversation, SYSTEM_HOLD → HUMAN_ACTIVE/AI_ACTIVE) THEN retry the advance.
//
// `isSafetyHeld` is pure (testable); `checkOrderSafetyHold` reads the order's
// linked conversation. Fail-CLOSED on a read error: if we cannot prove the order
// is NOT held, we treat it as held (safety over convenience).
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSafetyHeld } from "@/lib/db/safety-hold";

export { COMMITTED_ORDER_STATUSES, isCommittedStatus, isSafetyHeld } from "@/lib/db/safety-hold";

export interface SafetyHoldCheck {
  held: boolean;
  reason: string | null;
  conversationId: string | null;
}

/**
 * Check whether the order's linked conversation is under an active safety hold.
 * A web/standalone order with no conversation is never held. Fail-CLOSED: a read
 * error → held=true (we could not prove it safe).
 */
export async function checkOrderSafetyHold(
  admin: SupabaseClient,
  restaurantId: string,
  orderId: string,
): Promise<SafetyHoldCheck> {
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("conversation_id")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (orderErr) {
    return { held: true, reason: "safety_hold_check_failed", conversationId: null };
  }
  const conversationId = (order as { conversation_id?: string | null } | null)?.conversation_id ?? null;
  if (!conversationId) return { held: false, reason: null, conversationId: null };

  const { data: conv, error: convErr } = await admin
    .from("conversations")
    .select("ownership_state, is_safety_hold")
    .eq("id", conversationId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (convErr) {
    return { held: true, reason: "safety_hold_check_failed", conversationId };
  }
  const held = isSafetyHeld(conv as { ownership_state?: string | null; is_safety_hold?: boolean | null } | null);
  return {
    held,
    reason: held ? "active_safety_hold" : null,
    conversationId,
  };
}
