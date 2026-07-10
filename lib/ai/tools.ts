// ============================================================================
// MaitreAI — Customer-agent order-building tools (Sprint 8, slice 2)
// The model calls these tools; the EXECUTOR computes every price/total from the
// menu — the model never sets money (Amendment 03 §G). Unknown items / zones
// return is_error so the model asks or escalates (§G5). All logic is pure and
// adapter-agnostic; the engine (respond.ts) owns the loop, callers own
// persistence.
// ============================================================================

import type { Branch, DeliveryArea, MenuItem, Modifier } from "../types";
import { recomputeOrderPricing } from "@/lib/order-pricing";
import type { PaymentConfig } from "@/lib/payments/config";
import type { LlmToolDef } from "./llm/types";

export interface DraftModifier {
  name: string;
  priceImpact: number;
}
export interface DraftVariant {
  name: string;
  price: number;
}
export interface DraftChoice {
  groupName: string;
  label: string;
  priceDelta: number;
}
export interface DraftLine {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number; // variant/base + choice deltas + modifier impacts, from the menu
  variant?: DraftVariant;
  choices: DraftChoice[];
  modifiers: DraftModifier[];
  lineTotal: number;
}
export interface OrderDraft {
  lines: DraftLine[];
  fulfillment: "pickup" | "delivery" | null;
  deliveryZone: string | null;
  /** Customer's written street address for delivery (null for pickup or not yet provided). */
  address: string | null;
  deliveryFee: number;
  // WO-DELIVERY-D1 (delivery_geo_routing) — additive, optional, and only ever set
  // when the flag is ON. Absent on every legacy draft → flag-off serialization is
  // unchanged. branchId: the branch this order routes to (from the pin-matched zone,
  // or the customer's chosen pickup branch). deliveryPin: the raw location pin.
  branchId?: string | null;
  deliveryPin?: { lat: number; lng: number } | null;
  subtotal: number;
  tax: number; // VAT amount (0 when tax-inclusive)
  taxRate: number; // applied rate (0 when inclusive)
  total: number;
  currency: string;
  /** Chosen payment method (F1.2/F1.6): "cod" | "vodafone_cash" | null (not yet
   *  chosen). Persisted to orders.payment_method at creation; null → "cod" default. */
  paymentMethod: string | null;
  finalized: boolean;
}

export interface ToolSignal {
  type:
    | "off_menu"
    | "missing_data"
    | "money_mismatch"
    | "escalation"
    | "blocked_escalation"
    | "low_confidence"
    | "unknown_question"
    | "callback_requested";
  detail: Record<string, unknown>;
}

// Bug #1 Defect B — blocks ONLY an INVENTED technical/system fault used as an
// escalation reason. The tools NEVER produce such a fault (real exceptions are
// handled upstream as agent_error, not via escalate_to_human), so a reason
// claiming one is always model-fabricated → blocked + routed to recovery.
// It keys STRICTLY on the FABRICATION framing — a claimed technical error, or
// "the system rejected / won't accept the (valid) choices" — and MUST NEVER
// match a bare complaint / quality / refund / allergy word (بايظ/باظ/سيء/وحش/
// حساسية…). Those are genuine human-needs that escalate normally: when unsure,
// the guard errs toward LETTING the escalation through (a missed block is just a
// slightly-odd handoff reason; a wrong block would swallow a real complaint).
const FABRICATED_TECH_ERROR_RE =
  /خطأ\s*تقني|مشكلة\s*تقني|عطل(?!ة)|خلل|(?:النظام|السيستم)\s*(?:لا|لم|ما|مش|رفض)|technical\s*(?:error|issue|fault|problem)|system\s*(?:error|fault|issue|down)|won'?t\s*accept|reject(?:ed|s)?\s*(?:the\s+|valid\s+|correct\s+)*choices|\bglitch\b|\bbug\b/i;

export interface PhotoRequest {
  itemId: string;
  name: string;
  imageUrl: string;
  caption: string;
}

export interface ToolContext {
  menuItems: MenuItem[];
  modifiers: Modifier[];
  deliveryAreas: DeliveryArea[];
  /** Tenant branches — used for the geo-routing pickup-branch selection. */
  branches: Branch[];
  /** WO-DELIVERY-D1: when true, set_fulfillment accepts a pickup branch_name and
   *  routes the order to it. Default false → set_fulfillment behaves exactly as before. */
  geoRouting: boolean;
  draft: OrderDraft;
  signals: ToolSignal[];
  escalation: { reason: string } | null;
  /** Last interactive presentation the model asked to show (WhatsApp, S9-2). */
  presentation: Presentation | null;
  /** Image messages to send after the text/interactive reply. */
  photoRequests: PhotoRequest[];
  /** Tax mode + rate (Sprint 10). "added" → a VAT line; "inclusive" → no change. */
  taxMode: string;
  taxRate: number;
  /** Per-tenant payment config (F1.2/F1.6). Gates which methods Karim offers — VF
   *  Cash is offered ONLY when paymentConfig.vodafone_cash.enabled. */
  paymentConfig: PaymentConfig;
  /** Set to true by resend_receipt tool; triggers receipt re-send in respond-and-send. */
  resendReceipt: boolean;
}

// --- interactive presentations (S9-2) ---------------------------------------
// The model ROUTES (decides to present options); the system COMPUTES the option
// set — menu rows come from the DB (never the LLM), fixed flows are constants.
// The channel renders these as WhatsApp reply buttons / lists, degrading to
// numbered text when interactive send isn't available.
export interface PresentationButton {
  id: string;
  title: string;
}
export interface PresentationRow {
  id: string;
  title: string;
  description?: string;
}
export interface PresentationSection {
  title?: string;
  rows: PresentationRow[];
}
export type Presentation =
  | { kind: "buttons"; buttons: PresentationButton[]; header?: string }
  | { kind: "list"; button: string; sections: PresentationSection[]; header?: string };

// WhatsApp interactive limits (truncate to stay valid).
const MAX_BUTTONS = 3;
const MAX_ROWS = 10;
const BUTTON_TITLE_MAX = 20;
const ROW_TITLE_MAX = 24;
const ROW_DESC_MAX = 72;
const LIST_BUTTON_MAX = 20;
const SECTION_TITLE_MAX = 24;

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

export interface ToolResult {
  content: string;
  isError?: boolean;
}

export function emptyDraft(currency: string): OrderDraft {
  return {
    lines: [],
    fulfillment: null,
    deliveryZone: null,
    address: null,
    deliveryFee: 0,
    subtotal: 0,
    tax: 0,
    taxRate: 0,
    total: 0,
    currency,
    paymentMethod: null,
    finalized: false,
  };
}

// --- tool definitions (sent to the model) ----------------------------------
export const ORDER_TOOLS: LlmToolDef[] = [
  {
    name: "send_item_photos",
    description:
      "Send real dish photos from the menu — when the customer asks (صورة/شكل/صور/images), AND PROACTIVELY when you recommend a dish, show a category's standout items, or confirm a notable item (a picture sells). " +
      "Pass exact menu item names when items are named; for a broad photo/menu or category sample, omit item_names or pass a category; the system caps images (max 4) to avoid spam. " +
      "Only real menu image_url photos are sent; if none exist, explain briefly and offer the menu.",
    input_schema: {
      type: "object",
      properties: {
        item_names: { type: "array", items: { type: "string" }, description: "Exact menu item names to send photos for" },
        category: { type: "string", description: "Optional category to sample photos from" },
        max_count: { type: "integer", minimum: 1, maximum: 5, description: "Maximum photos to send; system caps at 4" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "add_to_order",
    description:
      "Add a menu item to the customer's order draft, OR set its exact quantity. Use the exact item name from the menu. " +
      "If the item has sizes, pass the selected size. Options/picks and modifiers must be listed for that item. " +
      "mode: \"add\" (default) increases the quantity by `quantity`; \"set\" makes the matching line's quantity EXACTLY `quantity`. " +
      "When the customer states the TOTAL they want («سندوتشين» = 2، «خليها ٣») use mode=\"set\"; only «زود واحد كمان» (one more) uses \"add\". Returns the updated draft and total.",
    input_schema: {
      type: "object",
      properties: {
        item_name: { type: "string", description: "Exact menu item name" },
        quantity: { type: "integer", minimum: 1 },
        mode: { type: "string", enum: ["add", "set"], description: "\"add\" (default) adds to the current quantity; \"set\" makes the quantity exactly this" },
        size: { type: "string", description: "Selected size/variant name when the item requires one" },
        options: { type: "array", items: { type: "string" }, description: "Selected choice/pick option labels" },
        picks: { type: "array", items: { type: "string" }, description: "Alias for selected choice/pick option labels" },
        modifiers: { type: "array", items: { type: "string" } },
      },
      required: ["item_name", "quantity"],
      additionalProperties: false,
    },
  },
  {
    name: "remove_from_order",
    description: "Remove a previously added item from the draft by its exact name.",
    input_schema: {
      type: "object",
      properties: { item_name: { type: "string" } },
      required: ["item_name"],
      additionalProperties: false,
    },
  },
  {
    name: "set_fulfillment",
    description:
      "Set pickup or delivery. For delivery, pass the delivery zone name from the zones list " +
      "so the fee is applied.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["pickup", "delivery"] },
        zone_name: { type: "string" },
      },
      required: ["type"],
      additionalProperties: false,
    },
  },
  {
    name: "set_delivery_address",
    description:
      "Store the customer's written street address for a delivery order. " +
      "Call this as soon as the customer types their address (منطقة + شارع + علامة مميزة). " +
      "Required before finalize_draft can succeed for a delivery order. " +
      "Do NOT call for pickup orders.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "The customer's full written delivery address" },
      },
      required: ["address"],
      additionalProperties: false,
    },
  },
  {
    name: "get_order_summary",
    description:
      "Return the current draft with its computed total. Call this before confirming money with the customer.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "finalize_draft",
    description:
      "Place the order for the restaurant to confirm. Only after the customer has explicitly confirmed the items and total.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "clear_order",
    description:
      "Empty the current order DRAFT and start fresh. Use when the customer wants to start over / clear the basket " +
      "(«ابدأ من جديد»، «امسح الطلب»، «الغِ كل ده»، «من الأول»). This only resets the in-progress draft — it never " +
      "touches an already-placed order. After clearing, build the new order from scratch. NEVER say the items can't be cleared.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "escalate_to_human",
    description:
      "Hand the conversation to a human — a LAST resort, used sparingly, ONLY for a genuine human-need: " +
      "the customer explicitly asks for a human; a real complaint / anger / refund request / billing dispute; " +
      "allergy or medical uncertainty you can't resolve from the menu data; the customer has restated the same " +
      "need ~twice with no resolution; or a blocking tool/system failure you can't work around. " +
      "Do NOT use it for a question you can answer honestly (including 'no offers today'), an unavailable or " +
      "off-menu item (acknowledge and pivot instead), or a fact you simply don't have (say so and offer the menu).",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
      additionalProperties: false,
    },
  },
  // --- interactive presentations (WhatsApp tap-first UX, S9-2) --------------
  {
    name: "present_menu",
    description:
      "Show the menu to the customer as a tappable WhatsApp list. With no category, shows the categories to pick from; " +
      "with a category, shows that category's items. The system builds the rows from the live menu (you never write item names/prices here). " +
      "Pair it with a short friendly sentence. Use when the customer wants to browse or asks what's available.",
    input_schema: {
      type: "object",
      properties: { category: { type: "string", description: "Optional category name to show its items" } },
      additionalProperties: false,
    },
  },
  {
    name: "present_quantity",
    description: "Show quick quantity buttons (1 / 2 / 3) for the item being added. Use after the customer picks an item.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "present_order_actions",
    description:
      "Show the order-action buttons (تأكيد الطلب / إضافة صنف / إلغاء) so the customer can confirm in one tap. " +
      "Use right after reading back the order summary and total.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "present_payment_methods",
    description:
      "Show the payment-method buttons available for THIS order (built from the restaurant's payment config + fulfillment): " +
      "الدفع عند الاستلام (COD) and فودافون كاش when enabled; for pickup, فودافون كاش (prepay) vs الدفع عند الاستلام من الفرع. " +
      "Use when collecting how the customer will pay.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "set_payment_method",
    description:
      "Record the customer's chosen payment method on the order. method=\"cod\" (الدفع عند الاستلام / counter cash) " +
      "or \"vodafone_cash\" (ONLY when offered/enabled). For vodafone_cash it returns the transfer number + amount + " +
      "instructions to show the customer; the order stays UNPAID until an operator confirms — NEVER tell the customer " +
      "the payment was received.",
    input_schema: {
      type: "object",
      properties: { method: { type: "string", enum: ["cod", "vodafone_cash"] } },
      required: ["method"],
      additionalProperties: false,
    },
  },
  {
    name: "resend_receipt",
    description:
      "Re-send the receipt for the most recently confirmed order in this conversation. " +
      "Use ONLY when the customer asks where their receipt is («فين الايصال»، «ابعتلي الإيصال»، «الفاتورة»، «ما جاش الإيصال»). " +
      "NEVER use escalate_to_human for receipt requests — call this tool instead.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

/** Subset available when order-building is disabled (closed / non-order modes). */
export const NON_ORDER_TOOLS: LlmToolDef[] = ORDER_TOOLS.filter(
  (t) => t.name === "escalate_to_human" || t.name === "send_item_photos" || t.name === "resend_receipt"
);

/** WO-DELIVERY-D1: the order tools with set_fulfillment augmented to accept a pickup
 *  `branch_name` when delivery_geo_routing is ON. Flag OFF → returns ORDER_TOOLS by
 *  reference (identical object), so the tool definitions the model sees are
 *  byte-identical to before (snapshot-safe). */
export function orderToolsWithGeo(geoRouting: boolean): LlmToolDef[] {
  if (!geoRouting) return ORDER_TOOLS;
  return ORDER_TOOLS.map((t) =>
    t.name === "set_fulfillment"
      ? {
          ...t,
          description:
            "Set pickup or delivery. For delivery, pass the delivery zone name from the zones list so the fee is applied " +
            "(the customer's location pin is matched to a zone by the system automatically). " +
            "For pickup, pass branch_name = the branch the customer chose, so the order routes to that branch.",
          input_schema: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["pickup", "delivery"] },
              zone_name: { type: "string", description: "For delivery: the delivery zone name" },
              branch_name: { type: "string", description: "For pickup: the branch the customer chose" },
            },
            required: ["type"],
            additionalProperties: false,
          },
        }
      : t
  );
}

// --- helpers ----------------------------------------------------------------
function norm(s: string): string {
  return s
    .replace(/[ً-ْـ]/g, "") // strip tashkeel + tatweel
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findItem(menu: MenuItem[], name: string): MenuItem | undefined {
  const n = norm(name);
  return (
    menu.find((i) => norm(i.name) === n) ||
    menu.find((i) => norm(i.name).includes(n) || n.includes(norm(i.name)))
  );
}

function hasPhoto(item: MenuItem): boolean {
  return typeof item.imageUrl === "string" && item.imageUrl.trim().length > 0;
}

function photoCaption(item: MenuItem, currency: string): string {
  return `${item.name} — ${item.price} ${currency}`;
}

/** Canonical identity of a draft line (item + variant + ALL choices + ALL
 *  modifiers) so add_to_order can MERGE an identical line by bumping quantity
 *  instead of pushing a duplicate. Different variant/choices/modifiers → a
 *  different key → a separate line. */
function lineKey(l: { itemId: string; variant?: DraftVariant; choices: DraftChoice[]; modifiers: DraftModifier[] }): string {
  const v = l.variant?.name ?? "";
  const ch = l.choices.map((c) => `${c.groupName}=${c.label}`).sort().join("|");
  const md = l.modifiers.map((m) => m.name).sort().join("|");
  return `${l.itemId}§${v}§${ch}§${md}`;
}

/** Convert a KNOWN delivery-pricing throw into a graceful, data-sourced customer
 *  message (so كريم relays it instead of crashing to agent_error). Returns null
 *  for any unrecognized error so the caller re-throws (still surfaced, via Fix B).
 *  The min-order value + zone facts come from the real zone data — never invented. */
function deliveryNotice(err: unknown, ctx: ToolContext): string | null {
  const msg = err instanceof Error ? err.message : String(err);
  const cur = ctx.draft.currency;
  if (msg.startsWith("delivery_min_order:")) {
    const zoneName = msg.slice("delivery_min_order:".length);
    const zone = ctx.deliveryAreas.find((z) => z.name === zoneName);
    const min = zone ? Number(zone.minOrder) : 0;
    return `الحد الأدنى لطلب التوصيل لـ${zoneName} هو ${min} ${cur}. تحب تزوّد الطلب شوية ونكمّل؟`;
  }
  if (msg.startsWith("delivery_zone_invalid:")) {
    const z = msg.slice("delivery_zone_invalid:".length);
    return `للأسف ${z} مش ضمن مناطق التوصيل المتاحة دلوقتي 🙏 تحب استلام من الفرع، ولا أقولك المناطق اللي بنوصّلها؟`;
  }
  if (msg.startsWith("delivery_zone_branch_mismatch:")) {
    const z = msg.slice("delivery_zone_branch_mismatch:".length);
    return `منطقة ${z} بتتبع فرع تاني 🙏 نظبط الفرع المناسب، ولا تحب استلام من الفرع؟`;
  }
  return null;
}

/** Re-price the draft. Returns null on success, or a graceful customer-facing
 *  notice when a KNOWN delivery signal (min-order / invalid zone / branch
 *  mismatch) is hit — in which case the draft is left UNCHANGED (basket intact)
 *  and the caller relays the notice instead of crashing. */
function recompute(ctx: ToolContext): string | null {
  const d = ctx.draft;
  let priced;
  try {
    priced = recomputeOrderPricing({
      menuItems: ctx.menuItems,
      modifiers: ctx.modifiers,
      deliveryAreas: ctx.deliveryAreas,
      lines: d.lines.map((l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        variantName: l.variant?.name ?? null,
        choices: l.choices.map((c) => ({ groupName: c.groupName, label: c.label })),
        modifierNames: l.modifiers.map((m) => m.name),
      })),
      fulfillment: d.fulfillment ?? "pickup",
      deliveryZoneName: d.deliveryZone,
      taxMode: ctx.taxMode,
      taxRate: ctx.taxRate,
      currency: d.currency,
    });
  } catch (e) {
    const notice = deliveryNotice(e, ctx);
    if (notice) return notice; // known delivery signal → graceful, draft unchanged
    throw e; // unknown → still surfaces (now visibly, via Fix B)
  }
  d.lines = priced.lines.map((l) => ({
    itemId: l.itemId,
    name: l.name,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    variant: l.variant,
    choices: l.choices,
    modifiers: l.modifiers,
    lineTotal: l.lineTotal,
  }));
  d.deliveryZone = priced.deliveryZone?.name ?? null;
  d.deliveryFee = priced.deliveryFee;
  d.subtotal = priced.subtotal;
  d.tax = priced.taxAmount;
  d.taxRate = priced.taxRate;
  d.total = priced.total;
  d.currency = priced.currency;
  return null;
}

function lineOptionText(l: DraftLine): string[] {
  return [
    ...(l.variant ? [l.variant.name] : []),
    ...l.choices.map((c) => `${c.groupName}: ${c.label}`),
    ...l.modifiers.map((m) => m.name),
  ];
}

function summary(d: OrderDraft): string {
  if (!d.lines.length) return "السلة فارغة.";
  const lines = d.lines
    .map((l) => {
      const options = lineOptionText(l);
      const optionText = options.length ? ` (${options.join("، ")})` : "";
      return `${l.quantity}× ${l.name}${optionText} — ${l.lineTotal} ${d.currency}`;
    })
    .join("\n");
  const fee =
    d.fulfillment === "delivery" && d.deliveryFee
      ? `\nرسوم التوصيل: ${d.deliveryFee} ${d.currency}`
      : "";
  const tax = d.tax > 0 ? `\nضريبة القيمة المضافة (${d.taxRate}%): ${d.tax} ${d.currency}` : "";
  return `${lines}${fee}${tax}\nالإجمالي: ${d.total} ${d.currency}`;
}

// --- executor ---------------------------------------------------------------
export function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): ToolResult {
  const d = ctx.draft;
  switch (name) {
    case "send_item_photos": {
      const requestedNames = Array.isArray(input.item_names) ? (input.item_names as unknown[]).map(String).filter((x) => x.trim()) : [];
      const category = String(input.category ?? "").trim();
      const maxCount = Math.min(4, Math.max(1, Math.floor(Number(input.max_count ?? 3)) || 3));
      const available = ctx.menuItems.filter((item) => item.available);
      const selected = requestedNames.length
        ? requestedNames.map((itemName) => findItem(available, itemName)).filter((item): item is MenuItem => !!item)
        : available.filter((item) => !category || norm(item.category) === norm(category) || norm(item.category).includes(norm(category)));
      const unique = [...new Map(selected.map((item) => [item.id, item])).values()];
      const withPhotos = unique.filter(hasPhoto).slice(0, maxCount);

      if (!withPhotos.length) {
        const missing = requestedNames.length ? ` لـ«${requestedNames[0]}»` : "";
        ctx.signals.push({ type: "missing_data", detail: { reason: "photo_missing", requested: requestedNames, category } });
        return {
          content: `للأسف مش لاقي صورة${missing} دلوقتي. أقدر أعرضلك المنيو أو أرشحلك أقرب صنف متاح.`,
          isError: true,
        };
      }

      ctx.photoRequests.push(
        ...withPhotos.map((item) => ({
          itemId: item.id,
          name: item.name,
          imageUrl: item.imageUrl.trim(),
          caption: photoCaption(item, d.currency),
        }))
      );
      const suffix = unique.length > withPhotos.length || selected.length > withPhotos.length ? " وبعتلك كام صورة بدل ما أزحم الشات." : ".";
      return { content: `تمام، هبعتلك ${withPhotos.length === 1 ? "الصورة" : `${withPhotos.length} صور`}${suffix}` };
    }
    case "add_to_order": {
      const itemName = String(input.item_name ?? "");
      const qty = Math.max(1, Math.floor(Number(input.quantity ?? 1)) || 1);
      const mode = input.mode === "set" ? "set" : "add";
      const item = findItem(ctx.menuItems, itemName);
      if (!item || !item.available) {
        ctx.signals.push({ type: "off_menu", detail: { requested: itemName } });
        return {
          content: `«${itemName}» غير متوفر في المنيو. لا تخترع عنصراً — اسأل العميل أو صعّد.`,
          isError: true,
        };
      }
      const allowedMods = item.modifierIds
        .map((id) => ctx.modifiers.find((m) => m.id === id && m.active))
        .filter((m): m is Modifier => !!m);
      const reqMods = Array.isArray(input.modifiers) ? (input.modifiers as unknown[]).map(String) : [];
      const activeVariants = (item.variants ?? []).filter((v) => v.active);
      let variant: DraftVariant | undefined;
      let basePrice = item.price;
      if (activeVariants.length) {
        const size = String(input.size ?? "");
        const v = activeVariants.find((x) => norm(x.name) === norm(size));
        if (!v) {
          ctx.signals.push({ type: "missing_data", detail: { item: item.name, required: "size", requested: size } });
          return {
            content: `«${item.name}» له أحجام وأسعار مختلفة. اسأل العميل يختار حجم من: ${activeVariants.map((x) => x.name).join("، ")}.`,
            isError: true,
          };
        }
        variant = { name: v.name, price: v.price };
        basePrice = v.price;
      }

      const requestedChoices = [
        ...(Array.isArray(input.options) ? (input.options as unknown[]).map(String) : []),
        ...(Array.isArray(input.picks) ? (input.picks as unknown[]).map(String) : []),
      ].filter((x) => x.trim());
      const remainingChoices = [...requestedChoices];
      const choices: DraftChoice[] = [];
      for (const group of (item.choiceGroups ?? []).filter((g) => g.options.some((o) => o.active))) {
        let selected = 0;
        while (selected < group.maxSelect) {
          const idx = remainingChoices.findIndex((label) =>
            group.options.some((o) => o.active && norm(o.label) === norm(label))
          );
          if (idx === -1) break;
          const label = remainingChoices.splice(idx, 1)[0];
          const option = group.options.find((o) => o.active && norm(o.label) === norm(label));
          if (!option) break;
          choices.push({ groupName: group.name, label: option.label, priceDelta: option.priceDelta });
          selected++;
        }
        if (selected < group.minSelect) {
          ctx.signals.push({ type: "missing_data", detail: { item: item.name, required: "choice", group: group.name } });
          return {
            content: `«${item.name}» يحتاج اختيار «${group.name}». اسأل العميل يختار من: ${group.options
              .filter((o) => o.active)
              .map((o) => o.label)
              .join("، ")}.`,
            isError: true,
          };
        }
      }
      if (remainingChoices.length) {
        ctx.signals.push({ type: "off_menu", detail: { item: item.name, choices: remainingChoices } });
        // RECOVERY CONTRACT (Bug #1 Defect B): hand the model THIS item's REAL
        // options so it offers them, and make explicit this is a normal "not on
        // this item" — NOT a technical fault and NOT a reason to escalate. (The old
        // "أو صعّد" wording let the model recast a benign mismatch as a system error
        // and hand off.)
        const realOpts = [
          ...(item.choiceGroups ?? [])
            .filter((g) => g.options.some((o) => o.active))
            .map((g) => `«${g.name}»: ${g.options.filter((o) => o.active).map((o) => o.label).join("، ")}`),
          ...(activeVariants.length ? [`الأحجام: ${activeVariants.map((v) => v.name).join("، ")}`] : []),
          ...(allowedMods.length ? [`إضافات: ${allowedMods.map((m) => m.name).join("، ")}`] : []),
        ];
        const realLine = realOpts.length
          ? `اختيارات «${item.name}» الحقيقية: ${realOpts.join(" — ")}.`
          : `«${item.name}» مالهوش اختيارات مذاق أو صوص — يتسجّل كما هو.`;
        return {
          content: `«${remainingChoices[0]}» مش من اختيارات «${item.name}» (ده طبيعي، مش عطل تقني). ${realLine} اعرض على العميل اختياراته الحقيقية وكمّل الطلب — متصعّدش لهذا السبب.`,
          isError: true,
        };
      }

      const mods: DraftModifier[] = [];
      for (const rm of reqMods) {
        const m = allowedMods.find((x) => norm(x.name) === norm(rm));
        if (m) mods.push({ name: m.name, priceImpact: m.priceImpact });
        else {
          ctx.signals.push({ type: "off_menu", detail: { item: item.name, modifier: rm } });
          return {
            content: `الإضافة «${rm}» غير متاحة مع «${item.name}». اسأل العميل أو صعّد.`,
            isError: true,
          };
        }
      }
      const unitPrice =
        basePrice +
        choices.reduce((s, c) => s + c.priceDelta, 0) +
        mods.reduce((s, m) => s + m.priceImpact, 0);
      const newLine = {
        itemId: item.id,
        name: item.name,
        quantity: qty,
        unitPrice,
        variant,
        choices,
        modifiers: mods,
        lineTotal: unitPrice * qty,
      };
      // Idempotent: if an identical line already exists (same item + variant +
      // choices + modifiers), update it instead of appending a duplicate. mode="set"
      // makes its quantity EXACTLY qty (restated total «سندوتشين»/«خليها ٣» — no
      // inflation); mode="add" bumps it (genuine «زود واحد كمان»). A different
      // variant/choice/modifier stays a separate line.
      const match = d.lines.find((l) => lineKey(l) === lineKey(newLine));
      if (match) match.quantity = mode === "set" ? qty : match.quantity + qty;
      else d.lines.push(newLine);
      {
        const notice = recompute(ctx);
        if (notice) return { content: notice };
      }
      const verb = mode === "set" ? "ضبطت الكمية على" : "أضفت";
      return { content: `${verb} ${match ? match.quantity : qty}× ${item.name}.\n${summary(d)}` };
    }
    case "clear_order": {
      // Reset the in-progress draft to empty (items + fulfillment) — a true "start
      // over". Re-ask fulfillment later as needed. Never touches a finalized order.
      ctx.draft = emptyDraft(d.currency);
      return { content: "تمام، مسحت الطلب ونبدأ من جديد. تحب تطلب إيه؟" };
    }
    case "resend_receipt": {
      ctx.resendReceipt = true;
      return { content: "طلبت إعادة إرسال إيصال آخر طلب." };
    }
    case "remove_from_order": {
      const itemName = String(input.item_name ?? "");
      const idx = d.lines.findIndex((l) => norm(l.name) === norm(itemName) || norm(l.name).includes(norm(itemName)));
      if (idx === -1) return { content: `«${itemName}» غير موجود في السلة.`, isError: true };
      d.lines.splice(idx, 1);
      {
        const notice = recompute(ctx);
        if (notice) return { content: notice };
      }
      return { content: `تم الحذف.\n${summary(d)}` };
    }
    case "set_fulfillment": {
      const type = input.type === "delivery" ? "delivery" : "pickup";
      d.fulfillment = type;
      d.deliveryZone = null;
      d.deliveryFee = 0;
      if (type === "pickup") {
        d.address = null;
        // WO-DELIVERY-D1 (geo routing ON): the customer picks a pickup branch and the
        // order routes to it. Off → branch_name ignored, behavior identical to before.
        if (ctx.geoRouting) {
          const branchName = String(input.branch_name ?? "").trim();
          if (branchName) {
            const b =
              ctx.branches.find((x) => norm(x.name) === norm(branchName)) ||
              ctx.branches.find((x) => norm(x.name).includes(norm(branchName)) || norm(branchName).includes(norm(x.name)));
            if (!b) {
              ctx.signals.push({ type: "missing_data", detail: { branch: branchName } });
              return {
                content: `الفرع «${branchName}» غير معروف. اعرض على العميل الفروع المتاحة: ${ctx.branches.map((x) => x.name).join("، ") || "لا توجد فروع"}.`,
                isError: true,
              };
            }
            d.branchId = b.id;
          }
        }
      }
      if (type === "delivery") {
        // Switching to delivery clears any prior pickup branch — the delivery branch
        // is derived from the matched zone at order creation. Gated so a flag-off
        // draft never gains a branchId key (serialization stays byte-identical).
        if (ctx.geoRouting) d.branchId = null;
        const zoneName = String(input.zone_name ?? "");
        const zone = ctx.deliveryAreas.find((z) => z.active && norm(z.name) === norm(zoneName)) ||
          ctx.deliveryAreas.find((z) => z.active && (norm(z.name).includes(norm(zoneName)) || norm(zoneName).includes(norm(z.name))));
        if (!zone) {
          ctx.signals.push({ type: "missing_data", detail: { zone: zoneName } });
          recompute(ctx);
          return {
            content: `منطقة التوصيل «${zoneName}» غير معروفة. اسأل العميل عن منطقته من المناطق المتاحة أو صعّد.`,
            isError: true,
          };
        }
        d.deliveryZone = zone.name;
        d.deliveryFee = zone.deliveryFee;
      }
      {
        // Bug A: below-minimum / invalid-zone now reply gracefully (real min-order
        // value from zone data) instead of crashing to agent_error. Basket intact.
        const notice = recompute(ctx);
        if (notice) return { content: notice };
      }
      const label = type === "delivery" ? `توصيل إلى ${d.deliveryZone}` : "استلام من الفرع";
      return { content: `${label}.\n${summary(d)}` };
    }
    case "set_delivery_address": {
      if (d.fulfillment !== "delivery") {
        return { content: "set_delivery_address يُستخدم فقط لطلبات التوصيل. اختر التوصيل أولاً.", isError: true };
      }
      const addr = String(input.address ?? "").trim();
      if (!addr) return { content: "العنوان فارغ — اطلب من العميل كتابة العنوان.", isError: true };
      d.address = addr;
      return { content: `تم تسجيل عنوان التوصيل: ${addr}` };
    }
    case "get_order_summary": {
      const notice = recompute(ctx);
      if (notice) return { content: notice };
      return { content: summary(d) };
    }
    case "finalize_draft": {
      if (!d.lines.length) return { content: "لا يمكن تأكيد طلب فارغ.", isError: true };
      if (!d.fulfillment) return { content: "لا يمكن تأكيد الطلب قبل اختيار الاستلام أو التوصيل.", isError: true };
      if (d.fulfillment === "delivery" && !d.address?.trim()) {
        return { content: "لم يتم تسجيل عنوان التوصيل. اطلب من العميل العنوان الكامل (المنطقة + الشارع + علامة مميزة) ثم استدعِ set_delivery_address.", isError: true };
      }
      {
        // Real-time 86ing guard: never finalize an order containing an item that has
        // been marked out-of-stock since it was added. Availability is the tool's
        // call, not the model's — block + name the item so the agent informs/swaps.
        const gone = d.lines.filter((l) => {
          const it = ctx.menuItems.find((i) => i.id === l.itemId);
          return !it || !it.available;
        });
        if (gone.length) {
          ctx.signals.push({ type: "off_menu", detail: { unavailable: gone.map((g) => g.name) } });
          return {
            content:
              `لا يمكن تأكيد الطلب: ${gone.map((g) => `«${g.name}»`).join("، ")} لم يعد متاحاً. ` +
              `أخبر العميل واعرض إزالته (remove_from_order) أو بديلاً متاحاً، ثم أكمل.`,
            isError: true,
          };
        }
      }
      {
        // Don't finalize a below-minimum / invalid-zone delivery — relay the notice.
        const notice = recompute(ctx);
        if (notice) return { content: notice, isError: true };
      }
      d.finalized = true;
      return {
        content: `تم تسجيل الطلب بانتظار تأكيد المطعم.\n${summary(d)}`,
      };
    }
    case "escalate_to_human": {
      const reason = String(input.reason ?? "");
      // HONESTY GUARD (Bug #1 Defect B): the tools NEVER surface a technical/system
      // fault — a real tool exception is handled upstream (customer-turn →
      // agent_error), not via this tool. So an escalation blaming a «عطل/خطأ تقني/
      // النظام لا يقبل» is FABRICATED: block it and route to recovery instead of a
      // false handoff. Genuine human-need escalations (complaint/refund/allergy/
      // human request) don't use this wording and pass through unchanged.
      if (FABRICATED_TECH_ERROR_RE.test(reason)) {
        ctx.signals.push({ type: "blocked_escalation", detail: { reason } });
        return {
          content:
            "مفيش أي عطل تقني. لو العميل طلب اختيار مش متاح لصنف، اعرض اختيارات الصنف الحقيقية وكمّل الطلب. التصعيد للشكاوى أو طلب المبالغ أو طلب موظف بشري أو الشك في الحساسية — مش لهذا.",
          isError: true,
        };
      }
      ctx.escalation = { reason };
      ctx.signals.push({ type: "escalation", detail: { reason } });
      return { content: "حوّلت محادثتك لفريق المطعم، وهيردّوا عليك في أقرب وقت 🙏" };
    }
    case "present_menu": {
      const avail = ctx.menuItems.filter((i) => i.available);
      if (!avail.length) return { content: "لا توجد أصناف متاحة حالياً.", isError: true };
      const cat = input.category ? String(input.category) : "";
      const cats = [...new Set(avail.map((i) => i.category).filter(Boolean))];

      // No category + several categories → let the customer pick a category first.
      if (!cat && cats.length > 1) {
        const rows: PresentationRow[] = cats.slice(0, MAX_ROWS).map((c) => ({
          id: `cat:${c}`,
          title: truncate(c, ROW_TITLE_MAX),
          description: `${avail.filter((i) => i.category === c).length} صنف`,
        }));
        ctx.presentation = { kind: "list", button: truncate("تصفّح المنيو", LIST_BUTTON_MAX), sections: [{ rows }] };
        return { content: `تم عرض ${rows.length} تصنيف للعميل كقائمة تفاعلية.` };
      }

      const items = cat
        ? avail.filter(
            (i) =>
              norm(i.category) === norm(cat) ||
              norm(i.category).includes(norm(cat)) ||
              norm(cat).includes(norm(i.category))
          )
        : avail;
      if (!items.length) {
        ctx.signals.push({ type: "off_menu", detail: { category: cat } });
        return { content: `لا توجد أصناف ضمن «${cat}». اعرض التصنيفات المتاحة أو اسأل العميل.`, isError: true };
      }
      const rows: PresentationRow[] = items.slice(0, MAX_ROWS).map((i) => ({
        id: `item:${i.id}`,
        title: truncate(i.name, ROW_TITLE_MAX),
        description: truncate(`${i.price} ${d.currency}${i.description ? ` · ${i.description}` : ""}`, ROW_DESC_MAX),
      }));
      ctx.presentation = {
        kind: "list",
        button: truncate("اختر صنف", LIST_BUTTON_MAX),
        sections: [{ title: cat ? truncate(cat, SECTION_TITLE_MAX) : undefined, rows }],
      };
      const more = items.length > MAX_ROWS ? ` (عرضت أول ${MAX_ROWS} من ${items.length})` : "";
      return { content: `تم عرض ${rows.length} صنف للعميل كقائمة تفاعلية${more}.` };
    }
    case "present_quantity": {
      ctx.presentation = {
        kind: "buttons",
        buttons: [
          { id: "qty:1", title: "1" },
          { id: "qty:2", title: "2" },
          { id: "qty:3", title: "3" },
        ].slice(0, MAX_BUTTONS),
      };
      return { content: "تم عرض أزرار الكمية (1/2/3) للعميل." };
    }
    case "present_order_actions": {
      // FULFILLMENT BEFORE CONFIRM: never offer «تأكيد» while pickup/delivery isn't
      // chosen — otherwise the customer taps confirm, finalize refuses, and the flow
      // loops. Present the pickup/delivery choice first instead.
      if (!d.fulfillment) {
        ctx.presentation = {
          kind: "buttons",
          buttons: [
            { id: "set_pickup", title: truncate("استلام من الفرع", BUTTON_TITLE_MAX) },
            { id: "set_delivery", title: truncate("توصيل", BUTTON_TITLE_MAX) },
          ],
        };
        return { content: "قبل التأكيد لازم العميل يختار الاستلام أو التوصيل — اعرض الخيارين (مش أزرار التأكيد)." };
      }
      ctx.presentation = {
        kind: "buttons",
        buttons: [
          { id: "confirm_order", title: truncate("تأكيد الطلب", BUTTON_TITLE_MAX) },
          { id: "add_more", title: truncate("إضافة صنف", BUTTON_TITLE_MAX) },
          { id: "cancel_order", title: truncate("إلغاء", BUTTON_TITLE_MAX) },
        ],
      };
      return { content: "تم عرض أزرار (تأكيد / إضافة / إلغاء) للعميل." };
    }
    case "present_payment_methods": {
      const cfg = ctx.paymentConfig;
      const buttons: PresentationButton[] = [];
      if (cfg.vodafone_cash.enabled) {
        // VF Cash available → tailor by fulfillment.
        if (d.fulfillment === "pickup") {
          // F1.6 pickup: prepay via VF, or pay cash at the counter.
          buttons.push({ id: "pay_vodafone_cash", title: truncate("فودافون كاش (تحويل)", BUTTON_TITLE_MAX) });
          buttons.push({ id: "pay_counter", title: truncate("الدفع عند الاستلام من الفرع", BUTTON_TITLE_MAX) });
        } else {
          // F1.2 delivery: COD vs VF Cash.
          if (cfg.cod_enabled) buttons.push({ id: "pay_cod", title: truncate("الدفع عند الاستلام", BUTTON_TITLE_MAX) });
          buttons.push({ id: "pay_vodafone_cash", title: truncate("فودافون كاش", BUTTON_TITLE_MAX) });
        }
      } else {
        // VF disabled (e.g. Wesaya today) → COD only; unchanged behavior.
        buttons.push({ id: "pay_cod", title: truncate("الدفع عند الاستلام", BUTTON_TITLE_MAX) });
      }
      ctx.presentation = { kind: "buttons", buttons };
      return { content: `تم عرض طرق الدفع المتاحة للعميل (${buttons.map((b) => b.title).join("، ")}).` };
    }
    case "set_payment_method": {
      const method = input.method === "vodafone_cash" ? "vodafone_cash" : "cod";
      const cfg = ctx.paymentConfig;
      // Gate VF strictly on config — never offer/record it when disabled.
      if (method === "vodafone_cash" && !cfg.vodafone_cash.enabled) {
        return { content: "فودافون كاش مش متاح حاليًا — الدفع عند الاستلام.", isError: true };
      }
      d.paymentMethod = method;
      if (method === "vodafone_cash") {
        const num = (cfg.vodafone_cash.number ?? "").trim();
        const extra = (cfg.vodafone_cash.instructions ?? "").trim();
        // HONESTY: never claim the payment was received — transfer + we'll confirm.
        const lines = [
          "تمام، اختَرت فودافون كاش 📱",
          `حوّل المبلغ (${d.total} ${d.currency}) على الرقم ده:`,
          num || "(رقم المحفظة هيتبعتلك من المطعم)",
          extra,
          "وابعتلنا لما تحوّل وهنأكد طلبك. (الدفع لسه ما اتأكدش لحد ما المطعم يراجعه.)",
        ].filter(Boolean);
        return { content: lines.join("\n") };
      }
      return { content: "تمام، الدفع عند الاستلام. هنأكد طلبك حالًا." };
    }
    default:
      return { content: `أداة غير معروفة: ${name}`, isError: true };
  }
}
