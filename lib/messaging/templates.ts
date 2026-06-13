// ============================================================================
// MaitreAI — WhatsApp template registry (Sprint 9, S9-4) — FOUNDATION ONLY
// Pre-approved message templates are the ONLY way to message a customer outside
// the 24-hour customer-service window (and later the rail for §T promotions —
// NOT built here). This module is the registry + typed parameter→components
// builders; the send-path lives in outbound.ts. Actual delivery requires the
// template to be APPROVED in Meta on the verified account (pending-owner).
// ============================================================================

/** A single template parameter (positional, maps to {{1}}, {{2}}, …). */
export interface TemplateParameter {
  type: "text";
  text: string;
}
export interface TemplateComponent {
  type: "body" | "header" | "button";
  parameters: TemplateParameter[];
  // for button components Meta also needs sub_type/index — not needed yet.
}

export interface TemplateDef<P> {
  /** Exact template name as registered/approved in Meta. */
  name: string;
  /** BCP-47 language code of the approved template (e.g. "ar"). */
  language: string;
  /** Meta category — utility (transactional) vs marketing (promotions, §T). */
  category: "utility" | "marketing";
  /** Human-readable body with {{n}} placeholders — used for Meta submission/docs. */
  bodyText: string;
  /** Build the WhatsApp `components` array from typed params. */
  build: (params: P) => TemplateComponent[];
}

const text = (t: string): TemplateParameter => ({ type: "text", text: t });

/** Arabic labels for order statuses surfaced in templates. */
export const ORDER_STATUS_AR: Record<string, string> = {
  pending_confirmation: "بانتظار التأكيد",
  pending_payment: "بانتظار الدفع",
  paid: "تم الدفع",
  preparing: "قيد التحضير",
  ready: "جاهز",
  out_for_delivery: "خرج للتوصيل",
  delivered: "تم التسليم",
  cancelled: "ملغي",
};

// --- registry ---------------------------------------------------------------
// Seed template: notify a customer of an order-status change outside the window.
export const orderStatusUpdate: TemplateDef<{ orderNumber: string; status: string }> = {
  name: "order_status_update",
  language: "ar",
  category: "utility",
  bodyText: "تحديث طلبك {{1}}: الحالة الآن «{{2}}». شكراً لطلبك من لدينا 🙏",
  build: ({ orderNumber, status }) => [
    { type: "body", parameters: [text(orderNumber), text(ORDER_STATUS_AR[status] ?? status)] },
  ],
};

/** All registered templates, keyed by name. Add new templates here. */
export const TEMPLATES = {
  order_status_update: orderStatusUpdate,
} as const;

export type TemplateName = keyof typeof TEMPLATES;
