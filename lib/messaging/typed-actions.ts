// ============================================================================
// MaitreAI — typed WhatsApp interactive actions.
// A WhatsApp tap is a command id, not free text. These handlers never ask the
// customer agent to interpret a known tap. They either update safe draft state
// with existing server tools, emit a fixed Karim-voice reply, or delegate
// confirm_order to the existing deterministic confirm/allergy gate.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBrain } from "@/lib/db/brain";
import { loadResolvedPaymentMethods } from "@/lib/payments/resolve";
import { DEFAULT_PAYMENT_CONFIG } from "@/lib/payments/config";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
import {
  draftFromQuantityPrompt,
  parseBareQuantityAnswer,
  quantityFromInteractiveId,
} from "@/lib/messaging/quantity-fill";
import {
  emptyDraft,
  executeTool,
  type OrderDraft,
  type Presentation,
  type ToolContext,
  type ToolSignal,
} from "@/lib/ai/tools";
import {
  RECOVERY_CHOICE_CONTINUE,
  RECOVERY_CHOICE_REALERT,
} from "@/lib/ai/allergen-companion-flow";
import { FIXED_INTERACTIVE_CONTROLS } from "./interactive-router";
import { asPricingTaxMode, type PricingTaxMode } from "@/lib/order-pricing";

type ActiveMenuItem = Awaited<ReturnType<typeof loadBrain>>["menuItems"][number];

export type TypedInteractiveActionKind =
  | "set_pickup"
  | "set_delivery"
  | "confirm_order"
  | "add_more"
  | "cancel_order"
  | "pay_cod"
  | "pay_vodafone_cash"
  | "pay_counter"
  | "qty"
  | "select_item"
  | "select_category"
  | "allergy_recovery_continue"
  | "allergy_recovery_realert";

export type InteractiveCommand =
  | { kind: "set_fulfillment"; action: "set_pickup" | "set_delivery"; id: "set_pickup" | "set_delivery"; fulfillment: "pickup" | "delivery" }
  | { kind: "confirm_order"; action: "confirm_order"; id: "confirm_order" }
  | { kind: "add_more"; action: "add_more"; id: "add_more" }
  | { kind: "cancel_order"; action: "cancel_order"; id: "cancel_order" }
  | { kind: "set_payment_method"; action: "pay_cod" | "pay_vodafone_cash" | "pay_counter"; id: "pay_cod" | "pay_vodafone_cash" | "pay_counter"; method: "cod" | "vodafone_cash" }
  | { kind: "choose_quantity"; action: "qty"; id: string; quantity: number }
  | { kind: "select_item"; action: "select_item"; id: string; itemId: string }
  | { kind: "select_category"; action: "select_category"; id: string; categoryIdOrName: string }
  | { kind: "allergy_recovery"; action: "allergy_recovery_continue" | "allergy_recovery_realert"; id: typeof RECOVERY_CHOICE_CONTINUE | typeof RECOVERY_CHOICE_REALERT; choice: "continue" | "realert" };

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

export type UnknownInteractiveCommandResult = {
  kind: "unknown";
  id: string;
  reply: string;
  replyMessageId: string | null;
};

export type TypedQuantityFillResult =
  | Extract<TypedInteractiveActionResult, { kind: "handled" }>
  | {
      kind: "pass_through";
      reason: "non_numeric" | "no_pending_quantity" | "ambiguous_draft";
    };

type Dialect = "egyptian" | "saudi" | string;

export const TYPED_ACTION_STRINGS = Object.freeze({
  set_pickup: {
    egyptian: "تمام، استلام من الفرع. أجهّزلك الطلب؟ ولا تضيف حاجة؟",
    saudi: "تمام، استلام من الفرع. أجهّزلك الطلب؟ ولا تضيف شي؟",
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
  select_item_unavailable: {
    egyptian: "معلش، الاختيار ده مش متاح دلوقتي. اختار صنف تاني من المنيو أو اكتبلي طلبك.",
    saudi: "المعذرة، الاختيار هذا غير متاح حالياً. اختر صنف ثاني من القائمة أو اكتب لي طلبك.",
  },
  select_item_needs_variant: {
    egyptian: (item: string, options: string) => `اختار حجم «${item}»: ${options}.`,
    saudi: (item: string, options: string) => `اختر حجم «${item}»: ${options}.`,
  },
  select_item_needs_choice: {
    egyptian: (item: string, group: string, options: string) => `اختار «${group}» لـ«${item}»: ${options}.`,
    saudi: (item: string, group: string, options: string) => `اختر «${group}» لـ«${item}»: ${options}.`,
  },
  select_category: {
    egyptian: (category: string) => `دي أصناف «${category}» 👇`,
    saudi: (category: string) => `هذه أصناف «${category}» 👇`,
  },
  select_category_unavailable: {
    egyptian: "معلش، التصنيف ده مش متاح دلوقتي. اختار من التصنيفات الحالية أو اكتبلي طلبك.",
    saudi: "المعذرة، التصنيف هذا غير متاح حالياً. اختر من التصنيفات الحالية أو اكتب لي طلبك.",
  },
  recovery_wrong_context: {
    egyptian: "معلش، الاختيار ده مش مرتبط بخطوة مفتوحة دلوقتي. اكتبلي طلبك أو اختار من آخر أزرار بعتها.",
    saudi: "المعذرة، الاختيار هذا غير مرتبط بخطوة مفتوحة حالياً. اكتب لي طلبك أو اختر من آخر أزرار أرسلتها.",
  },
  unknown_interactive: {
    egyptian: "معلش، الاختيار ده مش واضح عندي دلوقتي. اختار من آخر أزرار بعتها أو اكتبلي طلبك.",
    saudi: "المعذرة، الاختيار هذا غير واضح عندي حالياً. اختر من آخر أزرار أرسلتها أو اكتب لي طلبك.",
  },
});

const FIXED_COMMANDS: Record<string, InteractiveCommand> = {
  set_pickup: { kind: "set_fulfillment", action: "set_pickup", id: "set_pickup", fulfillment: "pickup" },
  set_delivery: { kind: "set_fulfillment", action: "set_delivery", id: "set_delivery", fulfillment: "delivery" },
  confirm_order: { kind: "confirm_order", action: "confirm_order", id: "confirm_order" },
  add_more: { kind: "add_more", action: "add_more", id: "add_more" },
  cancel_order: { kind: "cancel_order", action: "cancel_order", id: "cancel_order" },
  pay_cod: { kind: "set_payment_method", action: "pay_cod", id: "pay_cod", method: "cod" },
  pay_vodafone_cash: { kind: "set_payment_method", action: "pay_vodafone_cash", id: "pay_vodafone_cash", method: "vodafone_cash" },
  pay_counter: { kind: "set_payment_method", action: "pay_counter", id: "pay_counter", method: "cod" },
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

export function interactiveCommandFromId(id: string | null | undefined): InteractiveCommand | null {
  const clean = cleanInteractiveId(id);
  if (!clean) return null;
  const fixed = FIXED_COMMANDS[clean];
  if (fixed) return fixed;
  const qty = qtyFromId(clean);
  if (qty != null) return { kind: "choose_quantity", action: "qty", id: clean, quantity: qty };
  if (clean.startsWith("item:")) {
    const itemId = clean.slice("item:".length).trim();
    if (itemId) return { kind: "select_item", action: "select_item", id: clean, itemId };
    return null;
  }
  if (clean.startsWith("cat:")) {
    const categoryIdOrName = clean.slice("cat:".length).trim();
    if (categoryIdOrName) return { kind: "select_category", action: "select_category", id: clean, categoryIdOrName };
    return null;
  }
  if (clean === RECOVERY_CHOICE_CONTINUE) {
    return { kind: "allergy_recovery", action: "allergy_recovery_continue", id: RECOVERY_CHOICE_CONTINUE, choice: "continue" };
  }
  if (clean === RECOVERY_CHOICE_REALERT) {
    return { kind: "allergy_recovery", action: "allergy_recovery_realert", id: RECOVERY_CHOICE_REALERT, choice: "realert" };
  }
  return null;
}

export function typedInteractiveActionKind(id: string | null | undefined): TypedInteractiveActionKind | null {
  return interactiveCommandFromId(id)?.action ?? null;
}

export function isTypedInteractiveActionId(id: string | null | undefined): boolean {
  return typedInteractiveActionKind(id) != null;
}

function stringFor(
  action: keyof typeof TYPED_ACTION_STRINGS,
  dialect: Dialect,
  ...args: (string | number)[]
): string {
  const key = dialect === "saudi" ? "saudi" : "egyptian";
  const value = TYPED_ACTION_STRINGS[action][key];
  return typeof value === "function"
    ? (value as (...inner: (string | number)[]) => string)(...args)
    : value;
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

async function loadLatestPendingQuantityDraft(
  admin: SupabaseClient,
  conversationId: string
): Promise<OrderDraft | null> {
  const { data: priorDraftRows } = await admin
    .from("messages")
    .select("text, meta, created_at")
    .eq("conversation_id", conversationId)
    .eq("sender", "ai")
    .order("created_at", { ascending: false })
    .limit(1);
  const latest = (priorDraftRows ?? [])[0] as
    | { text: string | null; meta: Record<string, unknown> | null; created_at: string }
    | undefined;
  if (!latest) return null;
  const draft = draftFromQuantityPrompt(latest);
  if (!draft) return null;
  const ageMs = Date.now() - new Date(latest.created_at).getTime();
  if (ageMs > DRAFT_FRESHNESS_MS) return null;
  return structuredClone(draft as OrderDraft);
}

function buildToolContext(args: {
  brain: Awaited<ReturnType<typeof loadBrain>>;
  draft: OrderDraft;
  features: Record<string, unknown> | null;
  taxMode: PricingTaxMode;
  taxRate: number;
  paymentConfig: ToolContext["paymentConfig"];
  /** KIV-304 — the tenant dialect. `select_item` relays add_to_order's tool result to
   *  the customer verbatim (replyKey "add_more" carries `out.content`), so an unset
   *  dialect here would answer a Saudi guest in Cairene. Optional → Egyptian default. */
  dialect?: string | null;
}): ToolContext {
  return {
    menuCategories: args.brain.menuCategories,
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
    dialect: args.dialect,
    resendReceipt: false,
    userConfirmed: false,
    explicitHuman: false,
  };
}

function activeRequiredChoice(item: ActiveMenuItem): { group: string; options: string[] } | null {
  const group = (item.choiceGroups ?? []).find((g) => g.minSelect > 0 && g.options.some((o) => o.active));
  if (!group) return null;
  return { group: group.name, options: group.options.filter((o) => o.active).map((o) => o.label) };
}

function resolveCategoryName(ctx: ToolContext, categoryIdOrName: string): string | null {
  const clean = categoryIdOrName.trim();
  if (!clean) return null;
  const byId = ctx.menuCategories?.find((c) => c.id === clean);
  if (byId?.name) return byId.name;
  const byName = ctx.menuCategories?.find((c) => c.name === clean);
  if (byName?.name) return byName.name;
  const fromItems = ctx.menuItems.find((item) => item.category === clean);
  return fromItems?.category ?? null;
}

function applyTypedAction(
  ctx: ToolContext,
  command: InteractiveCommand
): {
  replyKey: keyof typeof TYPED_ACTION_STRINGS;
  replyArgs?: (string | number)[];
  reply?: string;
  toolNames: string[];
  action: TypedInteractiveActionKind;
} {
  const { action, id } = command;
  if (action === "set_pickup") {
    executeTool("set_fulfillment", { type: "pickup" }, ctx);
    return { replyKey: "set_pickup", toolNames: ["set_fulfillment"], action };
  }
  if (action === "set_delivery") {
    const wasDelivery = ctx.draft.fulfillment === "delivery";
    ctx.draft.fulfillment = "delivery";
    if (!wasDelivery) {
      ctx.draft.deliveryZone = null;
      ctx.draft.deliveryFee = 0;
      if (ctx.geoRouting) ctx.draft.branchId = null;
    }
    return { replyKey: "set_delivery", toolNames: [], action };
  }
  if (action === "cancel_order") {
    executeTool("clear_order", {}, ctx);
    return { replyKey: "cancel_order", toolNames: ["clear_order"], action };
  }
  if (action === "pay_cod" || action === "pay_counter") {
    executeTool("set_payment_method", { method: "cod" }, ctx);
    return { replyKey: action, toolNames: ["set_payment_method"], action };
  }
  if (action === "pay_vodafone_cash") {
    const out = executeTool("set_payment_method", { method: "vodafone_cash" }, ctx);
    if (out.isError) return { replyKey: "pay_vodafone_cash_unavailable", toolNames: ["set_payment_method"], action };
    return { replyKey: "pay_vodafone_cash", toolNames: ["set_payment_method"], action };
  }
  if (action === "qty") {
    const qty = command.kind === "choose_quantity" ? command.quantity : qtyFromId(id);
    if (qty == null) return { replyKey: "qty_needs_item", toolNames: [], action };
    const lastLine = ctx.draft.lines.at(-1);
    if (!lastLine || ctx.draft.lines.length !== 1) return { replyKey: "qty_needs_item", toolNames: [], action };
    executeTool("add_to_order", { item_name: lastLine.name, quantity: qty, mode: "set" }, ctx);
    return { replyKey: "qty", replyArgs: [qty], toolNames: ["add_to_order"], action };
  }
  if (command.kind === "select_item") {
    const item = ctx.menuItems.find((m) => m.id === command.itemId && m.available);
    if (!item) return { replyKey: "select_item_unavailable", toolNames: [], action };
    const activeVariants = (item.variants ?? []).filter((v) => v.active);
    if (activeVariants.length) {
      return {
        replyKey: "select_item_needs_variant",
        replyArgs: [item.name, activeVariants.map((v) => v.name).join("، ")],
        toolNames: [],
        action,
      };
    }
    const requiredChoice = activeRequiredChoice(item);
    if (requiredChoice) {
      return {
        replyKey: "select_item_needs_choice",
        replyArgs: [item.name, requiredChoice.group, requiredChoice.options.join("، ")],
        toolNames: [],
        action,
      };
    }
    const out = executeTool("add_to_order", { item_id: item.id, item_name: item.name, quantity: 1 }, ctx);
    if (out.isError) return { replyKey: "select_item_unavailable", toolNames: ["add_to_order"], action };
    return { replyKey: "add_more", reply: out.content, toolNames: ["add_to_order"], action };
  }
  if (command.kind === "select_category") {
    const category = resolveCategoryName(ctx, command.categoryIdOrName);
    if (!category) return { replyKey: "select_category_unavailable", toolNames: [], action };
    const out = executeTool("present_menu", { category }, ctx);
    if (out.isError) return { replyKey: "select_category_unavailable", toolNames: ["present_menu"], action };
    return { replyKey: "select_category", replyArgs: [category], toolNames: ["present_menu"], action };
  }
  if (command.kind === "allergy_recovery") {
    return { replyKey: "recovery_wrong_context", toolNames: [], action };
  }
  return { replyKey: "add_more", toolNames: [], action };
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
  const command = interactiveCommandFromId(id);
  if (!command) throw new Error(`unregistered typed interactive id: ${id}`);

  if (command.kind === "confirm_order") {
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
    taxMode: asPricingTaxMode(restaurant.tax_mode),
    taxRate: Number(restaurant.tax_rate ?? 0),
    paymentConfig: payments.config,
    dialect,
  });
  const applied = applyTypedAction(ctx, command);
  const action = applied.action;
  const reply = applied.reply ?? stringFor(applied.replyKey, dialect, ...(applied.replyArgs ?? []));
  const presentation =
    shouldOfferOrderActions(ctx.draft) && action !== "add_more"
      ? orderActionsPresentation()
      : ctx.draft.lines.length > 0 && !ctx.draft.fulfillment && (action === "qty" || action === "select_item")
        ? fulfillmentPresentation()
        : ctx.presentation;

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
        typedAction: { id, action, command, safetyProbe: args.safetyProbe },
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

export async function handleUnknownInteractiveCommand(
  admin: SupabaseClient,
  args: {
    restaurantId: string;
    conversationId: string;
    interactiveId: string;
    fallbackText: string;
  }
): Promise<UnknownInteractiveCommandResult> {
  const id = cleanInteractiveId(args.interactiveId);
  const { data: r } = await admin
    .from("restaurants")
    .select("dialect")
    .eq("id", args.restaurantId)
    .single();
  const dialect = String((r as { dialect?: string | null } | null)?.dialect ?? "egyptian");
  const reply = stringFor("unknown_interactive", dialect);

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
        kind: "unknown_interactive_id",
        model: "deterministic_unknown_interactive",
        interactiveId: id,
      },
    })
    .select("id")
    .single();

  await admin.from("messages").insert({
    restaurant_id: args.restaurantId,
    conversation_id: args.conversationId,
    direction: "outbound",
    sender: "system",
    text: "Unknown WhatsApp interactive id received; customer was asked to retry using the current choices.",
    status: "sent",
    meta: { kind: "unknown_interactive_id", interactiveId: id, fallbackText: args.fallbackText },
  });
  await admin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", args.conversationId);
  console.warn("[interactive-command] unknown id rejected", {
    restaurantId: args.restaurantId,
    conversationId: args.conversationId,
    interactiveId: id,
  });

  return { kind: "unknown", id, reply, replyMessageId: (msg?.id as string) ?? null };
}

export async function handleTypedQuantityFill(
  admin: SupabaseClient,
  args: {
    restaurantId: string;
    conversationId: string;
    userMessage: string;
    interactiveId?: string | null;
    features: Record<string, unknown> | null;
    safetyProbe: Record<string, unknown>;
  }
): Promise<TypedQuantityFillResult> {
  const qty = quantityFromInteractiveId(args.interactiveId) ?? parseBareQuantityAnswer(args.userMessage);
  if (qty == null) return { kind: "pass_through", reason: "non_numeric" };

  const draft = await loadLatestPendingQuantityDraft(admin, args.conversationId);
  if (!draft) return { kind: "pass_through", reason: "no_pending_quantity" };
  if (draft.lines.length !== 1) return { kind: "pass_through", reason: "ambiguous_draft" };

  const { data: r } = await admin
    .from("restaurants")
    .select("dialect,currency,tax_mode,tax_rate,payment_config,feature_flags")
    .eq("id", args.restaurantId)
    .single();
  const restaurant = (r ?? {}) as Record<string, unknown>;
  const dialect = String(restaurant.dialect ?? "egyptian");
  const features = (restaurant.feature_flags as Record<string, unknown> | null) ?? args.features;
  const brain = await loadBrain(admin, args.restaurantId);
  const payments = await loadResolvedPaymentMethods(admin, args.restaurantId, {
    paymentConfig: restaurant.payment_config ?? DEFAULT_PAYMENT_CONFIG,
    featureFlags: features,
  });
  const ctx = buildToolContext({
    brain,
    draft,
    features,
    taxMode: asPricingTaxMode(restaurant.tax_mode),
    taxRate: Number(restaurant.tax_rate ?? 0),
    paymentConfig: payments.config,
    dialect,
  });
  const id = `qty:${qty}`;
  const applied = applyTypedAction(ctx, { kind: "choose_quantity", action: "qty", id, quantity: qty });
  if (applied.replyKey !== "qty") return { kind: "pass_through", reason: "ambiguous_draft" };
  const reply = stringFor(applied.replyKey, dialect, ...(applied.replyArgs ?? []));
  const presentation = ctx.draft.lines.length > 0 && !ctx.draft.fulfillment ? fulfillmentPresentation() : orderActionsPresentation();

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
        model: "deterministic_typed_quantity_fill",
        typedAction: { id, action: "qty", source: "typed_quantity_fill", safetyProbe: args.safetyProbe },
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
    action: "qty",
    reply,
    replyMessageId: (msg?.id as string) ?? null,
    presentation,
    signals: ctx.signals,
    toolNames: applied.toolNames,
  };
}
