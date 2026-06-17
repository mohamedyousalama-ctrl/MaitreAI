// ============================================================================
// MaitreAI — Persist an order from a finalized Brain draft (Sprint 9, S9-4.5)
// SERVER ONLY. The keystone link: when the Customer Agent finalizes a draft in
// the WhatsApp flow, write a real `orders` row so it lands in الطلبات and the
// S9-3 auto-receipt can fire. Two invariants:
//   • IDEMPOTENCY — one finalized draft = exactly one row. The order id is a
//     deterministic hash of (conversation + line items + fulfillment + total),
//     so a retry / duplicate webhook / double-tap upserts the SAME id (no dupe).
//   • MONEY INTEGRITY — totals are copied verbatim from the tool-computed draft
//     (draft.subtotal/deliveryFee/total + per-line lineTotal); nothing is
//     re-derived or model-written. The row total == what the customer was shown.
// ============================================================================

import "server-only";
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderDraft } from "@/lib/ai/tools";

/** Deterministic UUID from a string (stable id ⇒ idempotent insert). */
export function uuidFromHash(input: string): string {
  const h = createHash("sha256").update(input).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Best-effort next human-friendly order number for the tenant (pilot scale). */
export async function nextOrderNumber(admin: SupabaseClient, restaurantId: string): Promise<string> {
  const { data } = await admin.from("orders").select("order_number").eq("restaurant_id", restaurantId);
  let max = 1000;
  for (const r of (data ?? []) as { order_number: string }[]) {
    const n = parseInt(String(r.order_number).replace(/\D/g, ""), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return String(max + 1);
}

export interface PersistOrderResult {
  created: boolean; // false = idempotent no-op (already persisted)
  orderId: string | null;
  orderNumber: string | null;
}

export async function persistOrderFromDraft(
  admin: SupabaseClient,
  args: { restaurantId: string; conversationId: string; customerId: string | null; draft: OrderDraft }
): Promise<PersistOrderResult> {
  const { restaurantId, conversationId, customerId, draft } = args;
  if (!draft.finalized || !draft.lines.length) return { created: false, orderId: null, orderNumber: null };

  // Idempotency key: the finalized draft content within this conversation.
  const fingerprint = JSON.stringify({
    c: conversationId,
    lines: draft.lines.map((l) => ({
      i: l.itemId,
      q: l.quantity,
      v: l.variant?.name ?? "",
      c: l.choices.map((x) => `${x.groupName}:${x.label}`).sort(),
      m: l.modifiers.map((x) => x.name).sort(),
    })),
    f: draft.fulfillment,
    z: draft.deliveryZone,
    t: draft.total,
  });
  const id = uuidFromHash(fingerprint);

  // Items + money: copied verbatim from the tool-computed draft.
  const items = draft.lines.map((l, idx) => ({
    id: `${l.itemId}-${idx}`,
    menuItemId: l.itemId,
    name: l.name,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    variant: l.variant?.name,
    choices: l.choices.map((c) => `${c.groupName}: ${c.label}`),
    modifiers: l.modifiers.map((m) => m.name),
    total: l.lineTotal,
  }));

  const orderNumber = await nextOrderNumber(admin, restaurantId);

  const { data, error } = await admin
    .from("orders")
    .upsert(
      {
        id,
        restaurant_id: restaurantId,
        order_number: orderNumber,
        conversation_id: conversationId,
        customer_id: customerId,
        fulfillment: draft.fulfillment ?? "pickup",
        items,
        subtotal: draft.subtotal,
        delivery_fee: draft.deliveryFee,
        tax_amount: draft.tax,
        tax_rate: draft.taxRate,
        total: draft.total,
        currency: draft.currency,
        order_status: "pending_confirmation",
        payment_status: "unpaid",
      },
      { onConflict: "id", ignoreDuplicates: true }
    )
    .select("id, order_number");
  if (error) throw error;

  const created = (data?.length ?? 0) > 0;
  if (created) {
    await admin.from("conversations").update({ status: "بانتظار التأكيد" }).eq("id", conversationId);
    return { created: true, orderId: id, orderNumber };
  }

  // Idempotent no-op: return the already-persisted row's number.
  const { data: ex } = await admin.from("orders").select("order_number").eq("id", id).maybeSingle();
  return { created: false, orderId: id, orderNumber: (ex?.order_number as string) ?? null };
}
