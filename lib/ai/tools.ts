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

function recompute(d: OrderDraft): void {
  d.subtotal = d.lines.reduce((s, l) => s + l.lineTotal, 0);
  d.total = d.subtotal + (d.fulfillment === "delivery" ? d.deliveryFee : 0);
}

function summary(d: OrderDraft): string {
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
  return `${lines}${fee}\nالإجمالي: ${d.total} ${d.currency}`;
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
      recompute(d);
      return { content: `أضفت ${qty}× ${item.name}.\n${summary(d)}` };
    }
    case "remove_from_order": {
      const itemName = String(input.item_name ?? "");
      const idx = d.lines.findIndex((l) => norm(l.name) === norm(itemName) || norm(l.name).includes(norm(itemName)));
      if (idx === -1) return { content: `«${itemName}» غير موجود في السلة.`, isError: true };
      d.lines.splice(idx, 1);
      recompute(d);
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
          recompute(d);
          return {
            content: `منطقة التوصيل «${zoneName}» غير معروفة. اسأل العميل عن منطقته من المناطق المتاحة أو صعّد.`,
            isError: true,
          };
        }
        d.deliveryZone = zone.name;
        d.deliveryFee = zone.deliveryFee;
      }
      recompute(d);
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
    default:
      return { content: `أداة غير معروفة: ${name}`, isError: true };
  }
}
