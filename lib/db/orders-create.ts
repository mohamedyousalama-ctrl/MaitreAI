// ============================================================================
// MaitreAI — Persist an order from a finalized Brain draft (Sprint 9, S9-4.5)
// SERVER ONLY. The keystone link: when the Customer Agent finalizes a draft in
// the WhatsApp flow, write a real `orders` row so it lands in الطلبات and the
// S9-3 auto-receipt can fire. Two invariants:
//   • IDEMPOTENCY — one finalized draft = exactly one row. The order id is a
//     deterministic hash of (conversation + line items + fulfillment + total),
//     so a retry / duplicate webhook / double-tap upserts the SAME id (no dupe).
//   • MONEY INTEGRITY — totals are copied verbatim from the tool-computed draft
//     after a server-side DB recompute verifies/rebuilds every amount from menu,
//     option, modifier, and delivery-zone rows. The row total == the verified
//     tool/server total, never a model-written amount.
// ============================================================================

import "server-only";
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderDraft } from "@/lib/ai/tools";
import { loadBrain } from "@/lib/db/brain";
import { recomputeOrderPricing } from "@/lib/order-pricing";
import { recordCriticalAlert } from "@/lib/alerts/record";

/** Deterministic UUID from a string (stable id ⇒ idempotent insert). */
export function uuidFromHash(input: string): string {
  const h = createHash("sha256").update(input).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Content-only basket fingerprint (NO conversation / run id) — used by the
 *  double-tap window guard. Derived from the STORED `items` shape so the current
 *  order and any candidate row hash identically (same builder on both sides). */
type FingerprintItem = { menuItemId?: string; quantity?: number; variant?: string | null; choices?: string[]; modifiers?: string[] };
export function basketContentKey(args: { items: FingerprintItem[]; fulfillment: string; total: number }): string {
  const lines = args.items
    .map((it) => ({
      i: it.menuItemId ?? "",
      q: Number(it.quantity ?? 0),
      v: it.variant ?? "",
      c: [...(it.choices ?? [])].sort(),
      m: [...(it.modifiers ?? [])].sort(),
    }))
    .sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  const norm = JSON.stringify({ lines, f: args.fulfillment, t: Number(args.total).toFixed(2) });
  return createHash("sha256").update(norm).digest("hex");
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

async function recomputeDraftFromDb(
  admin: SupabaseClient,
  args: { restaurantId: string; draft: OrderDraft }
): Promise<{ draft: OrderDraft; zoneId: string | null; branchId: string | null }> {
  const brain = await loadBrain(admin, args.restaurantId);
  const priced = recomputeOrderPricing({
    menuItems: brain.menuItems,
    modifiers: brain.modifiers,
    deliveryAreas: brain.deliveryAreas,
    lines: args.draft.lines.map((line) => ({
      itemId: line.itemId,
      quantity: line.quantity,
      variantName: line.variant?.name ?? null,
      choices: line.choices.map((choice) => ({ groupName: choice.groupName, label: choice.label })),
      modifierNames: line.modifiers.map((modifier) => modifier.name),
    })),
    fulfillment: args.draft.fulfillment ?? "pickup",
    deliveryZoneName: args.draft.deliveryZone,
    taxMode: brain.taxMode,
    taxRate: brain.taxRate,
    currency: brain.profile.currency || args.draft.currency,
  });
  return {
    draft: {
      ...args.draft,
      lines: priced.lines.map((line) => ({
        itemId: line.itemId,
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        variant: line.variant,
        choices: line.choices,
        modifiers: line.modifiers,
        lineTotal: line.lineTotal,
      })),
      deliveryZone: priced.deliveryZone?.name ?? null,
      deliveryFee: priced.deliveryFee,
      subtotal: priced.subtotal,
      tax: priced.taxAmount,
      taxRate: priced.taxRate,
      total: priced.total,
      currency: priced.currency,
      finalized: args.draft.finalized,
    },
    zoneId: priced.deliveryZone?.id ?? null,
    branchId: priced.deliveryZone?.branchId ?? null,
  };
}

export async function persistOrderFromDraft(
  admin: SupabaseClient,
  args: { restaurantId: string; conversationId: string; customerId: string | null; draft: OrderDraft; agentRunId?: string | null }
): Promise<PersistOrderResult> {
  const { restaurantId, conversationId, customerId, draft, agentRunId } = args;
  if (!draft.finalized || !draft.lines.length) return { created: false, orderId: null, orderNumber: null };
  const { draft: verifiedDraft, zoneId, branchId } = await recomputeDraftFromDb(admin, { restaurantId, draft });

  // Idempotency key: the finalized draft content + the agent-run that produced it.
  // agentRunId is unique per customer message (deduplicated at the webhook level on
  // channel_message_id), so same-conversation reorders of identical items now get
  // distinct fingerprints and land as separate orders. A same-turn retry still
  // produces the same agentRunId → same UUID → safe idempotent no-op.
  const fingerprint = JSON.stringify({
    c: conversationId,
    r: agentRunId ?? null,
    lines: verifiedDraft.lines.map((l) => ({
      i: l.itemId,
      q: l.quantity,
      v: l.variant?.name ?? "",
      c: l.choices.map((x) => `${x.groupName}:${x.label}`).sort(),
      m: l.modifiers.map((x) => x.name).sort(),
    })),
    f: verifiedDraft.fulfillment,
    z: verifiedDraft.deliveryZone,
    t: verifiedDraft.total,
  });
  const id = uuidFromHash(fingerprint);

  // Items + money: copied from the server-verified draft.
  const items = verifiedDraft.lines.map((l, idx) => ({
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

  // Double-tap window guard. The agentRunId in `id` lets a genuine reorder of the
  // same basket save as a NEW row — but it also means two confirm messages with
  // different channel_message_ids (separate, concurrently-processed webhook POSTs)
  // would mint two distinct ids for the SAME basket. Before inserting, look for an
  // order in this conversation with an identical content-only fingerprint created
  // in the last ~120s; if found, treat this as the same order (no new row, no
  // duplicate customer confirmation). A real reorder happens outside this window
  // (it requires a multi-message basket rebuild) so it is unaffected.
  // NOTE: a SELECT→INSERT guard is not fully atomic; two truly simultaneous inserts
  // could still both pass. Future hardening: a partial-unique index makes it atomic.
  const DOUBLE_TAP_WINDOW_MS = 120_000;
  const contentKey = basketContentKey({ items, fulfillment: verifiedDraft.fulfillment ?? "pickup", total: verifiedDraft.total });
  const sinceIso = new Date(Date.now() - DOUBLE_TAP_WINDOW_MS).toISOString();
  const { data: recent } = await admin
    .from("orders")
    .select("id, order_number, items, fulfillment, total")
    .eq("restaurant_id", restaurantId)
    .eq("conversation_id", conversationId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(10);
  const dup = (recent ?? []).find(
    (o) =>
      basketContentKey({
        items: (o.items as FingerprintItem[]) ?? [],
        fulfillment: (o.fulfillment as string) ?? "pickup",
        total: Number(o.total),
      }) === contentKey
  );
  if (dup) {
    return { created: false, orderId: dup.id as string, orderNumber: (dup.order_number as string) ?? null };
  }

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
        fulfillment: verifiedDraft.fulfillment ?? "pickup",
        branch_id: branchId,
        zone_id: zoneId,
        address: verifiedDraft.address ?? null,
        notes: null,
        items,
        subtotal: verifiedDraft.subtotal,
        delivery_fee: verifiedDraft.deliveryFee,
        tax_amount: verifiedDraft.tax,
        tax_rate: verifiedDraft.taxRate,
        total: verifiedDraft.total,
        currency: verifiedDraft.currency,
        source: "whatsapp",
        order_status: "pending_confirmation",
        payment_status: "unpaid",
        // F1.7 Fix 1 / F1.6 — stamp the payment method at birth so pending/pickup/
        // cancelled WhatsApp orders aren't born NULL (uncapturable later). Sources the
        // customer's chosen method from the draft (set_payment_method); falls back to
        // "cod" (the default-on path, mirroring the web path) when none was chosen.
        // T7 — the "cod" fallback is RETAINED here deliberately (downstream COD
        // capture/reconciliation already treats null AND "cod" identically, so this
        // value is the safe non-null default), but the unspecified case is no longer
        // SILENT: a payment_unspecified alert fires below so the operator resolves the
        // real method instead of it just looking like a cash order.
        payment_method: verifiedDraft.paymentMethod ?? "cod",
      },
      { onConflict: "id", ignoreDuplicates: true }
    )
    .select("id, order_number");
  if (error) throw error;

  const created = (data?.length ?? 0) > 0;
  if (created) {
    await admin.from("conversations").update({ status: "بانتظار التأكيد" }).eq("id", conversationId);

    // T7 — make an UNDETERMINED payment method visible instead of letting the "cod"
    // fallback silently present it as a cash order. Only on a genuinely-created row
    // (never on an idempotent no-op/double-tap), so a retry doesn't re-alert. The
    // order is NOT lost — it's persisted and flagged for the operator to resolve.
    if (!verifiedDraft.paymentMethod) {
      await recordCriticalAlert(admin, {
        restaurantId,
        type: "payment_unspecified",
        detail: `طلب رقم ${orderNumber} اتسجّل من غير طريقة دفع محددة — محتاج تحديد طريقة الدفع.`,
        conversationId,
        context: { orderId: id, orderNumber, storedFallback: "cod" },
      });
    }

    return { created: true, orderId: id, orderNumber };
  }

  // Idempotent no-op: return the already-persisted row's number.
  const { data: ex } = await admin.from("orders").select("order_number").eq("id", id).maybeSingle();
  return { created: false, orderId: id, orderNumber: (ex?.order_number as string) ?? null };
}
