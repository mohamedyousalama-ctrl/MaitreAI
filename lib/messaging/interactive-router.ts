// ============================================================================
// MaitreAI — S6 deterministic interactive-reply router (PURE).
// When a customer taps a WhatsApp reply button / list row, Meta sends the control
// ID we minted (e.g. "pay_cod"), but only the button TITLE text reaches the agent
// today — which the LLM can MISREAD (a localized title is conversational, the id
// is not). This maps a KNOWN control id → an explicit, unambiguous canonical
// directive so the tap routes by the id we control, not by free-text guessing.
//
// SAFE AUGMENTATION: the canonical text still flows through the EXACT same gated
// agent pipeline (allergen input+output gate in runCustomerTurn/respond; the
// SYSTEM_HOLD / ownership / mode gates already ran upstream in respond-and-send).
// This only disambiguates the input; it does not bypass any gate or tool.
//
// Input-control: ONLY ids in the controlled set (or the qty:N shape) are routed.
// An unknown / arbitrary id (or genuine free text) falls through to the raw text
// unchanged — never trust an arbitrary client id to mean an action we didn't send.
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
  /** The message text to feed the agent (canonical when routed, else the raw title). */
  text: string;
  /** The control id we recognized + routed, or null when we fell through. */
  routedId: string | null;
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
  if (!id) return { text: fallbackText, routedId: null };

  // Fixed single-meaning controls.
  if (Object.prototype.hasOwnProperty.call(FIXED_INTERACTIVE_CONTROLS, id)) {
    return { text: FIXED_INTERACTIVE_CONTROLS[id], routedId: id };
  }

  // Parametric quantity: qty:N (1..99, matching the quantity() clamp downstream).
  const qty = /^qty:(\d{1,3})$/.exec(id);
  if (qty) {
    const n = Number(qty[1]);
    if (Number.isInteger(n) && n >= 1 && n <= 99) {
      return { text: `الكمية ${n}.`, routedId: id };
    }
  }

  // Unknown / unrouted id (e.g. item:<uuid> menu selection, or anything we didn't
  // mint) → fall through to the raw title text, exactly as today. No regression.
  return { text: fallbackText, routedId: null };
}
