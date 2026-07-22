// ============================================================================
// MaitreAI — legacy interactive-reply router (PURE).
// WO-FIX-INTERACTIVE moved live tap handling to lib/messaging/typed-actions.ts:
// known ids are typed commands, and unknown ids are rejected with a deterministic
// retry reply. This helper remains only as a defensive no-op for free-text callers;
// any non-empty interactive id is rejected instead of being turned into prompt text.
// ============================================================================

// Fixed control buttons Kivo emits (lib/ai/tools.ts present_* + respond.ts).
// id → canonical Arabic directive (explicit, single-meaning).
export const FIXED_INTERACTIVE_CONTROLS: Record<string, string> = {
  set_pickup: "تأكيد: استلام من الفرع.",
  set_delivery: "تأكيد: توصيل.",
  confirm_order: "تأكيد الطلب.",
  add_more: "إضافة صنف تاني للطلب.",
  cancel_order: "إلغاء الطلب.",
  pay_cod: "الدفع عند الاستلام (كاش).",
  pay_vodafone_cash: "الدفع بفودافون كاش.",
  pay_counter: "الدفع كاش عند الاستلام من الفرع.",
};

export const FIXED_INTERACTIVE_CONTROL_IDS = Object.freeze(
  Object.keys(FIXED_INTERACTIVE_CONTROLS)
);

export interface RoutedInteraction {
  /** The message text to feed the agent. Empty when an interactive id was rejected. */
  text: string;
  /** Retained for compatibility; ids are no longer routed to text here. */
  routedId: string | null;
  /** The interactive id rejected by this legacy helper, or null for free text. */
  rejectedId: string | null;
}

/**
 * Resolve an inbound interactive reply to the text the agent should act on.
 * @param interactiveId  meta.interactiveId of the tapped button/list row (or undefined).
 * @param fallbackText   the raw inbound text (button title / typed message) — used as-is
 *                       when the id isn't a known control (unknown id, item:<…>, free text).
 */
export function routeInteractive(
  interactiveId: string | null | undefined,
  fallbackText: string
): RoutedInteraction {
  const id = typeof interactiveId === "string" ? interactiveId.trim() : "";
  if (!id) return { text: fallbackText, routedId: null, rejectedId: null };
  return { text: "", routedId: null, rejectedId: id };
}
