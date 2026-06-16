// ============================================================================
// MaitreAI — Customer-agent order-building tools (Sprint 8, slice 2)
// The model calls these tools; the EXECUTOR computes every price/total from the
// menu — the model never sets money (Amendment 03 §G). Unknown items / zones
// return is_error so the model asks or escalates (§G5). All logic is pure and
// adapter-agnostic; the engine (respond.ts) owns the loop, callers own
// persistence.
// ============================================================================

import type { DeliveryArea, MenuItem, Modifier } from "../types";
import type { LlmToolDef } from "./llm/types";

export interface DraftModifier {
  name: string;
  priceImpact: number;
}
export interface DraftLine {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number; // base + modifier impacts, from the menu
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
    | "low_confidence"
    | "unknown_question";
  detail: Record<string, unknown>;
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
    name: "add_to_order",
    description:
      "Add a menu item to the customer's order draft. Use the exact item name from the menu. " +
      "Modifiers must be options listed for that item. Returns the updated draft and total.",
    input_schema: {
      type: "object",
      properties: {
        item_name: { type: "string", description: "Exact menu item name" },
        quantity: { type: "integer", minimum: 1 },
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
    name: "escalate_to_human",
    description:
      "Hand the conversation to a human. Use for anything off-menu, ambiguous after one clarifying question, " +
      "a money mismatch, complaints, refunds, discounts/promotions, or an upset customer.",
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
  (t) => t.name === "escalate_to_human"
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

export function recompute(ctx: ToolContext): void {
  const d = ctx.draft;
  d.subtotal = d.lines.reduce((s, l) => s + l.lineTotal, 0);
  const deliv = d.fulfillment === "delivery" ? d.deliveryFee : 0;
  // VAT only when the tenant runs tax-added; otherwise inclusive (no change).
  if (ctx.taxMode === "added" && ctx.taxRate > 0) {
    d.taxRate = ctx.taxRate;
    d.tax = Math.round(d.subtotal * (ctx.taxRate / 100) * 100) / 100;
  } else {
    d.taxRate = 0;
    d.tax = 0;
  }
  d.total = Math.round((d.subtotal + deliv + d.tax) * 100) / 100;
}

export function summary(d: OrderDraft): string {
  if (!d.lines.length) return "السلة فارغة.";
  const lines = d.lines
    .map((l) => {
      const mods = l.modifiers.length ? ` (${l.modifiers.map((m) => m.name).join("، ")})` : "";
      return `${l.quantity}× ${l.name}${mods} — ${l.lineTotal} ${d.currency}`;
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
    case "add_to_order": {
      const itemName = String(input.item_name ?? "");
      const qty = Math.max(1, Math.floor(Number(input.quantity ?? 1)) || 1);
      const item = findItem(ctx.menuItems, itemName);
      if (!item || !item.available) {
        ctx.signals.push({ type: "off_menu", detail: { requested: itemName } });
        return {
          content: `«${itemName}» غير متوفر في المنيو. لا تخترع عنصراً — اسأل العميل أو صعّد.`,
          isError: true,
        };
      }
      const allowed = new Set(
        item.modifierIds
          .map((id) => ctx.modifiers.find((m) => m.id === id && m.active))
          .filter((m): m is Modifier => !!m)
          .map((m) => norm(m.name))
      );
      const reqMods = Array.isArray(input.modifiers) ? (input.modifiers as unknown[]).map(String) : [];
      const mods: DraftModifier[] = [];
      for (const rm of reqMods) {
        const m = ctx.modifiers.find((x) => norm(x.name) === norm(rm) && allowed.has(norm(x.name)));
        if (m) mods.push({ name: m.name, priceImpact: m.priceImpact });
      }
      const unitPrice = item.price + mods.reduce((s, m) => s + m.priceImpact, 0);
      d.lines.push({
        itemId: item.id,
        name: item.name,
        quantity: qty,
        unitPrice,
        modifiers: mods,
        lineTotal: unitPrice * qty,
      });
      recompute(ctx);
      return { content: `أضفت ${qty}× ${item.name}.\n${summary(d)}` };
    }
    case "remove_from_order": {
      const itemName = String(input.item_name ?? "");
      const idx = d.lines.findIndex((l) => norm(l.name) === norm(itemName) || norm(l.name).includes(norm(itemName)));
      if (idx === -1) return { content: `«${itemName}» غير موجود في السلة.`, isError: true };
      d.lines.splice(idx, 1);
      recompute(ctx);
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
      recompute(ctx);
      const label = type === "delivery" ? `توصيل إلى ${d.deliveryZone}` : "استلام من الفرع";
      return { content: `${label}.\n${summary(d)}` };
    }
    case "get_order_summary":
      return { content: summary(d) };
    case "finalize_draft": {
      if (!d.lines.length) return { content: "لا يمكن تأكيد طلب فارغ.", isError: true };
      d.finalized = true;
      return {
        content: `تم تسجيل الطلب بانتظار تأكيد المطعم.\n${summary(d)}`,
      };
    }
    case "escalate_to_human": {
      const reason = String(input.reason ?? "");
      ctx.escalation = { reason };
      ctx.signals.push({ type: "escalation", detail: { reason } });
      return { content: "تم تحويل المحادثة لزميل من الفريق." };
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
