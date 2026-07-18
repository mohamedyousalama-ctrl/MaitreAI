// ============================================================================
// MaitreAI — typed WhatsApp interactive actions (WO-S0-TYPED).
// Explicit-only feature path for button/list reply ids already registered in
// lib/messaging/interactive-router.ts. These handlers never ask the customer
// agent to interpret a tap. They either update safe draft state with existing
// server tools, emit a fixed Karim-voice reply, or delegate confirm_order to the
// existing deterministic confirm/allergy gate.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBrain } from "@/lib/db/brain";
import { loadResolvedPaymentMethods } from "@/lib/payments/resolve";
import { DEFAULT_PAYMENT_CONFIG } from "@/lib/payments/config";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
import {
  emptyDraft,
  executeTool,
  type OrderDraft,
  type Presentation,
  type ToolContext,
  type ToolSignal,
} from "@/lib/ai/tools";
import { FIXED_INTERACTIVE_CONTROLS } from "./interactive-router";

export type TypedInteractiveActionKind =
  | "set_pickup"
  | "set_delivery"
  | "confirm_order"
  | "add_more"
  | "cancel_order"
  | "pay_cod"
  | "pay_vodafone_cash"
  | "pay_counter"
  | "qty";

export type TypedInteractiveActionResult =
  | {
      kind: "handled";
      id: string;
      action: TypedInteractiveActionKind;
      reply: string;
      replyMessageId: string | null;
      presentation: Presentation | null;
      signals: ToolSignal[];
      toolNames: string[];
    }
  | {
      kind: "confirm_gate";
      id: "confirm_order";
      userMessage: string;
    };

type Dialect = "egyptian" | "saudi" | string;

export const TYPED_ACTION_STRINGS = Object.freeze({
  set_pickup: {
    egyptian: "تمام، استلام من الفرع. تحب أأكد الطلب ولا تضيف حاجة؟",
    saudi: "تمام، استلام من الفرع. تبي أأكد الطلب ولا تضيف شي؟",
  },
  set_delivery: {
    egyptian: "تمام، التوصيل. ابعت عنوان التوصيل الكامل عشان نكمل الطلب.",
    saudi: "تمام، التوصيل. ارسل عنوان التوصيل الكامل عشان نكمل الطلب.",
  },
  confirm_order: {
    egyptian: FIXED_INTERACTIVE_CONTROLS.confirm_order,
    saudi: FIXED_INTERACTIVE_CONTROLS.confirm_order,
  },
  add_more: {
    egyptian: "تمام، قولّي الصنف اللي تحب تضيفه.",
    saudi: "تمام، قل لي الصنف اللي تبي تضيفه.",
  },
  cancel_order: {
    egyptian: "تمام، مسحت الطلب الحالي. تحب تبدأ بإيه؟",
    saudi: "تمام، مسحت الطلب الحالي. وش تحب تبدأ به؟",
  },
  pay_cod: {
    egyptian: "تمام، الدفع عند الاستلام.",
    saudi: "تمام، الدفع عند الاستلام.",
  },
  pay_vodafone_cash: {
    egyptian: "تمام، اخترت فودافون كاش. هنثبت طريقة الدفع ونكمل تأكيد الطلب.",
    saudi: "تمام، اخترت فودافون كاش. نثبت طريقة الدفع ونكمل تأكيد الطلب.",
  },
  pay_vodafone_cash_unavailable: {
    egyptian: "فودافون كاش مش متاح حالياً. نكمل بالدفع عند الاستلام؟",
    saudi: "فودافون كاش غير متاح حالياً. نكمل بالدفع عند الاستلام؟",
  },
  pay_counter: {
    egyptian: "تمام، الدفع كاش عند الاستلام من الفرع.",
    saudi: "تمام، الدفع كاش عند الاستلام من الفرع.",
  },
  qty: {
    egyptian: (n: number) => `تمام، ضبطت الكمية على ${n}.`,
    saudi: (n: number) => `تمام، ضبطت الكمية على ${n}.`,
  },
  qty_needs_item: {
    egyptian: "تمام، قولّي الصنف والكمية مع بعض عشان أضبطها صح.",
    saudi: "تمام، قل لي الصنف والكمية مع بعض عشان أضبطها صح.",
  },
});

const FIXED_ACTIONS: Record<string, Exclude<TypedInteractiveActionKind, "qty">> = {
  set_pickup: "set_pickup",
  set_delivery: "set_delivery",
  confirm_order: "confirm_order",
  add_more: "add_more",
  cancel_order: "cancel_order",
  pay_cod: "pay_cod",
  pay_vodafone_cash: "pay_vodafone_cash",
  pay_counter: "pay_counter",
};

const DRAFT_FRESHNESS_MS = 45 * 60 * 1000;

function cleanInteractiveId(id: string | null | undefined): string {
  return typeof id === "string" ? id.trim() : "";
}

function qtyFromId(id: string): number | null {
  const m = /^qty:(\d{1,3})$/.exec(id);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
}

export function typedInteractiveActionKind(id: string | null | undefined): TypedInteractiveActionKind | null {
  const clean = cleanInteractiveId(id);
  const fixed = FIXED_ACTIONS[clean];
  if (fixed) return fixed;
  return qtyFromId(clean) != null ? "qty" : null;
}

export function isTypedInteractiveActionId(id: string | null | undefined): boolean {
  return typedInteractiveActionKind(id) != null;
}

function stringFor(
  action: keyof typeof TYPED_ACTION_STRINGS,
  dialect: Dialect,
  qty?: number
): string {
  const key = dialect === "saudi" ? "saudi" : "egyptian";
  const value = TYPED_ACTION_STRINGS[action][key];
  return typeof value === "function" ? value(qty ?? 0) : value;
}

function orderActionsPresentation(): Presentation {
  return {
    kind: "buttons",
    buttons: [
      { id: "confirm_order", title: "تأكيد الطلب" },
      { id: "add_more", title: "إضافة صنف" },
      { id: "cancel_order", title: "إلغاء" },
    ],
  };
}

function fulfillmentPresentation(): Presentation {
  return {
    kind: "buttons",
    buttons: [
      { id: "set_pickup", title: "استلام من الفرع" },
      { id: "set_delivery", title: "توصيل" },
    ],
  };
}

function shouldOfferOrderActions(draft: OrderDraft): boolean {
  return draft.lines.length > 0 && !!draft.fulfillment;
}

function isOpenDraft(value: unknown): value is OrderDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<OrderDraft>;
  return Array.isArray(draft.lines) && draft.finalized !== true;
}

async function loadLatestOpenDraft(
  admin: SupabaseClient,
  conversationId: string,
  currency: string
): Promise<OrderDraft> {
  const { data: priorDraftRows } = await admin
    .from("messages")
    .select("meta, created_at")
    .eq("conversation_id", conversationId)
    .eq("sender", "ai")
    .order("created_at", { ascending: false })
    .limit(8);
  const firstWithDraft = (priorDraftRows ?? []).find((message) => {
    const d = (message.meta as Record<string, unknown> | null)?.draft;
    return isOpenDraft(d);
  });
  if (!firstWithDraft) return emptyDraft(currency);
  const ageMs = Date.now() - new Date(firstWithDraft.created_at as string).getTime();
  if (ageMs > DRAFT_FRESHNESS_MS) return emptyDraft(currency);
  return structuredClone((firstWithDraft.meta as Record<string, unknown>).draft as OrderDraft);
}

function buildToolContext(args: {
  brain: Awaited<ReturnType<typeof loadBrain>>;
  draft: OrderDraft;
  features: Record<string, unknown> | null;
  taxMode: string;
  taxRate: number;
  paymentConfig: ToolContext["paymentConfig"];
}): ToolContext {
  return {
    menuItems: args.brain.menuItems,
    modifiers: args.brain.modifiers,
    deliveryAreas: args.brain.deliveryAreas,
    branches: args.brain.branches,
    geoRouting: isFeatureExplicitlyEnabled("delivery_geo_routing", args.features),
    draft: args.draft,
    signals: [],
    escalation: null,
    presentation: null,
    photoRequests: [],
    taxMode: args.taxMode,
    taxRate: args.taxRate,
    paymentConfig: args.paymentConfig,
    resendReceipt: false,
    userConfirmed: false,
    explicitHuman: false,
  };
}

function applyTypedAction(ctx: ToolContext, action: TypedInteractiveActionKind, id: string): { replyKey: keyof typeof TYPED_ACTION_STRINGS; qty?: number; toolNames: string[] } {
  if (action === "set_pickup") {
    executeTool("set_fulfillment", { type: "pickup" }, ctx);
    return { replyKey: "set_pickup", toolNames: ["set_fulfillment"] };
  }
  if (action === "set_delivery") {
    const wasDelivery = ctx.draft.fulfillment === "delivery";
    ctx.draft.fulfillment = "delivery";
    if (!wasDelivery) {
      ctx.draft.deliveryZone = null;
      ctx.draft.deliveryFee = 0;
      if (ctx.geoRouting) ctx.draft.branchId = null;
    }
    return { replyKey: "set_delivery", toolNames: [] };
  }
  if (action === "cancel_order") {
    executeTool("clear_order", {}, ctx);
    return { replyKey: "cancel_order", toolNames: ["clear_order"] };
  }
  if (action === "pay_cod" || action === "pay_counter") {
    executeTool("set_payment_method", { method: "cod" }, ctx);
    return { replyKey: action, toolNames: ["set_payment_method"] };
  }
  if (action === "pay_vodafone_cash") {
    const out = executeTool("set_payment_method", { method: "vodafone_cash" }, ctx);
    if (out.isError) return { replyKey: "pay_vodafone_cash_unavailable", toolNames: ["set_payment_method"] };
    return { replyKey: "pay_vodafone_cash", toolNames: ["set_payment_method"] };
  }
  if (action === "qty") {
    const qty = qtyFromId(id);
    if (qty == null) return { replyKey: "qty_needs_item", toolNames: [] };
    const lastLine = ctx.draft.lines.at(-1);
    if (!lastLine || ctx.draft.lines.length !== 1) return { replyKey: "qty_needs_item", toolNames: [] };
    executeTool("add_to_order", { item_name: lastLine.name, quantity: qty, mode: "set" }, ctx);
    return { replyKey: "qty", qty, toolNames: ["add_to_order"] };
  }
  return { replyKey: "add_more", toolNames: [] };
}

export async function handleTypedInteractiveAction(
  admin: SupabaseClient,
  args: {
    restaurantId: string;
    conversationId: string;
    interactiveId: string;
    features: Record<string, unknown> | null;
    safetyProbe: Record<string, unknown>;
  }
): Promise<TypedInteractiveActionResult> {
  const id = cleanInteractiveId(args.interactiveId);
  const action = typedInteractiveActionKind(id);
  if (!action) throw new Error(`unregistered typed interactive id: ${id}`);

  if (action === "confirm_order") {
    return { kind: "confirm_gate", id: "confirm_order", userMessage: FIXED_INTERACTIVE_CONTROLS.confirm_order };
  }

  const { data: r } = await admin
    .from("restaurants")
    .select("dialect,currency,tax_mode,tax_rate,payment_config,feature_flags")
    .eq("id", args.restaurantId)
    .single();
  const restaurant = (r ?? {}) as Record<string, unknown>;
  const dialect = String(restaurant.dialect ?? "egyptian");
  const currency = String(restaurant.currency ?? "ج.م");
  const features = (restaurant.feature_flags as Record<string, unknown> | null) ?? args.features;
  const brain = await loadBrain(admin, args.restaurantId);
  const payments = await loadResolvedPaymentMethods(admin, args.restaurantId, {
    paymentConfig: restaurant.payment_config ?? DEFAULT_PAYMENT_CONFIG,
    featureFlags: features,
  });
  const draft = await loadLatestOpenDraft(admin, args.conversationId, currency);
  const ctx = buildToolContext({
    brain,
    draft,
    features,
    taxMode: String(restaurant.tax_mode ?? "inclusive"),
    taxRate: Number(restaurant.tax_rate ?? 0),
    paymentConfig: payments.config,
  });
  const applied = applyTypedAction(ctx, action, id);
  const reply = stringFor(applied.replyKey, dialect, applied.qty);
  const presentation =
    shouldOfferOrderActions(ctx.draft) && action !== "add_more"
      ? orderActionsPresentation()
      : ctx.draft.lines.length > 0 && !ctx.draft.fulfillment && action === "qty"
        ? fulfillmentPresentation()
        : null;

  const { data: msg } = await admin
    .from("messages")
    .insert({
      restaurant_id: args.restaurantId,
      conversation_id: args.conversationId,
      direction: "outbound",
      sender: "ai",
      text: reply,
      status: "sent",
      meta: {
        model: "deterministic_typed_action",
        typedAction: { id, action, safetyProbe: args.safetyProbe },
        draft: ctx.draft,
        presentation,
        photoRequests: [],
      },
    })
    .select("id")
    .single();
  await admin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", args.conversationId);
  if (ctx.signals.length) {
    await admin.from("conversation_signals").insert(
      ctx.signals.map((s) => ({
        restaurant_id: args.restaurantId,
        conversation_id: args.conversationId,
        type: s.type,
        detail: s.detail,
      }))
    );
  }

  return {
    kind: "handled",
    id,
    action,
    reply,
    replyMessageId: (msg?.id as string) ?? null,
    presentation,
    signals: ctx.signals,
    toolNames: applied.toolNames,
  };
}
