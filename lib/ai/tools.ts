// ============================================================================
// MaitreAI — Customer-agent order-building tools (Sprint 8, slice 2)
// The model calls these tools; the EXECUTOR computes every price/total from the
// menu — the model never sets money (Amendment 03 §G). Unknown items / zones
// return is_error so the model asks or escalates (§G5). All logic is pure and
// adapter-agnostic; the engine (respond.ts) owns the loop, callers own
// persistence.
// ============================================================================

import type { DeliveryArea, MenuItem, Modifier } from "../types";
import { recomputeOrderPricing } from "@/lib/order-pricing";
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
  deliveryFee: number;
  subtotal: number;
  tax: number; // VAT amount (0 when tax-inclusive)
  taxRate: number; // applied rate (0 when inclusive)
  total: number;
  currency: string;
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
    | "unknown_question";
  detail: Record<string, unknown>;
}

// Bug #1 Defect B — wording that signals a (fabricated) technical/system fault.
// The tools NEVER produce such a fault (real exceptions are handled upstream as
// agent_error, not via the model's escalate_to_human tool), so an escalation
// reason matching this is always model-fabricated → blocked + routed to recovery.
const FABRICATED_TECH_ERROR_RE =
  /تقني|تقنية|عطل|خلل|بايظ|باظ|(النظام|السيستم)\s*(لا|مش|رفض|ما)|technical|glitch|\bbug\b|system\s*(error|fault|issue|down)/i;

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
    deliveryFee: 0,
    subtotal: 0,
    tax: 0,
    taxRate: 0,
    total: 0,
    currency,
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
    description: "Show the payment-method button(s) — الدفع عند الاستلام (COD). Use when collecting how the customer will pay.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

/** Subset available when order-building is disabled (closed / non-order modes). */
export const NON_ORDER_TOOLS: LlmToolDef[] = ORDER_TOOLS.filter(
  (t) => t.name === "escalate_to_human" || t.name === "send_item_photos"
);

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
      if (type === "delivery") {
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
    case "get_order_summary": {
      const notice = recompute(ctx);
      if (notice) return { content: notice };
      return { content: summary(d) };
    }
    case "finalize_draft": {
      if (!d.lines.length) return { content: "لا يمكن تأكيد طلب فارغ.", isError: true };
      if (!d.fulfillment) return { content: "لا يمكن تأكيد الطلب قبل اختيار الاستلام أو التوصيل.", isError: true };
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
      ctx.presentation = {
        kind: "buttons",
        buttons: [{ id: "pay_cod", title: truncate("الدفع عند الاستلام", BUTTON_TITLE_MAX) }],
      };
      return { content: "تم عرض طريقة الدفع (الدفع عند الاستلام) للعميل." };
    }
    default:
      return { content: `أداة غير معروفة: ${name}`, isError: true };
  }
}
