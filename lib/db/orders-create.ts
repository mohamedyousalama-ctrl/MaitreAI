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
import type { DraftChoice, DraftLine, DraftModifier, DraftVariant, OrderDraft } from "@/lib/ai/tools";
import { loadBrain } from "@/lib/db/brain";
import type { MenuItem, Modifier } from "@/lib/types";

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

function norm(s: string): string {
  return s
    .replace(/[ً-ْـ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function findActiveModifier(modifiers: Modifier[], allowedIds: string[], name: string): Modifier | null {
  const allowed = new Set(allowedIds);
  return modifiers.find((m) => m.active && allowed.has(m.id) && norm(m.name) === norm(name)) ?? null;
}

function recomputeLineFromMenu(item: MenuItem, modifiers: Modifier[], line: DraftLine): DraftLine {
  if (!item.available) throw new Error(`menu_item_unavailable:${item.name}`);
  const qty = Math.max(1, Math.floor(Number(line.quantity)) || 1);

  const activeVariants = (item.variants ?? []).filter((v) => v.active);
  let variant: DraftVariant | undefined;
  let basePrice = item.price;
  if (activeVariants.length) {
    const selectedVariant = line.variant?.name ?? "";
    const row = activeVariants.find((v) => norm(v.name) === norm(selectedVariant));
    if (!row) throw new Error(`variant_required:${item.name}`);
    variant = { name: row.name, price: Number(row.price) };
    basePrice = Number(row.price);
  }

  const requestedChoices = [...(line.choices ?? [])];
  const choices: DraftChoice[] = [];
  for (const group of (item.choiceGroups ?? []).filter((g) => g.options.some((o) => o.active))) {
    const selectedForGroup = requestedChoices.filter((choice) => norm(choice.groupName) === norm(group.name));
    if (selectedForGroup.length < group.minSelect || selectedForGroup.length > group.maxSelect) {
      throw new Error(`choice_count_invalid:${item.name}:${group.name}`);
    }
    for (const selected of selectedForGroup) {
      const option = group.options.find((o) => o.active && norm(o.label) === norm(selected.label));
      if (!option) throw new Error(`choice_invalid:${item.name}:${group.name}:${selected.label}`);
      choices.push({ groupName: group.name, label: option.label, priceDelta: Number(option.priceDelta) });
    }
  }
  for (const selected of requestedChoices) {
    const group = item.choiceGroups?.find((g) => norm(g.name) === norm(selected.groupName));
    if (!group) throw new Error(`choice_group_invalid:${item.name}:${selected.groupName}`);
  }

  const lineModifiers: DraftModifier[] = [];
  for (const selected of line.modifiers ?? []) {
    const modifier = findActiveModifier(modifiers, item.modifierIds, selected.name);
    if (!modifier) throw new Error(`modifier_invalid:${item.name}:${selected.name}`);
    lineModifiers.push({ name: modifier.name, priceImpact: Number(modifier.priceImpact) });
  }

  const unitPrice = money(
    Number(basePrice) +
      choices.reduce((sum, choice) => sum + Number(choice.priceDelta), 0) +
      lineModifiers.reduce((sum, modifier) => sum + Number(modifier.priceImpact), 0)
  );
  return {
    itemId: item.id,
    name: item.name,
    quantity: qty,
    unitPrice,
    variant,
    choices,
    modifiers: lineModifiers,
    lineTotal: money(unitPrice * qty),
  };
}

async function recomputeDraftFromDb(
  admin: SupabaseClient,
  args: { restaurantId: string; draft: OrderDraft }
): Promise<OrderDraft> {
  const brain = await loadBrain(admin, args.restaurantId);
  const verifiedLines = args.draft.lines.map((line) => {
    const item = brain.menuItems.find((row) => row.id === line.itemId);
    if (!item) throw new Error(`menu_item_missing:${line.itemId}`);
    return recomputeLineFromMenu(item, brain.modifiers, line);
  });

  const subtotal = money(verifiedLines.reduce((sum, line) => sum + line.lineTotal, 0));
  let deliveryZone: string | null = null;
  let deliveryFee = 0;
  if (args.draft.fulfillment === "delivery") {
    const zone = brain.deliveryAreas.find(
      (row) => row.active && row.name && norm(row.name) === norm(args.draft.deliveryZone ?? "")
    );
    if (!zone) throw new Error(`delivery_zone_invalid:${args.draft.deliveryZone ?? ""}`);
    if (subtotal < Number(zone.minOrder)) throw new Error(`delivery_min_order:${zone.name}`);
    deliveryZone = zone.name;
    deliveryFee = money(Number(zone.deliveryFee));
  }

  const taxRate = Number(args.draft.taxRate) || 0;
  const tax = args.draft.tax > 0 && taxRate > 0 ? money(subtotal * (taxRate / 100)) : 0;
  return {
    ...args.draft,
    lines: verifiedLines,
    deliveryZone,
    deliveryFee,
    subtotal,
    tax,
    taxRate: tax > 0 ? taxRate : 0,
    total: money(subtotal + deliveryFee + tax),
    currency: brain.profile.currency || args.draft.currency,
    finalized: args.draft.finalized,
  };
}

export async function persistOrderFromDraft(
  admin: SupabaseClient,
  args: { restaurantId: string; conversationId: string; customerId: string | null; draft: OrderDraft }
): Promise<PersistOrderResult> {
  const { restaurantId, conversationId, customerId, draft } = args;
  if (!draft.finalized || !draft.lines.length) return { created: false, orderId: null, orderNumber: null };
  const verifiedDraft = await recomputeDraftFromDb(admin, { restaurantId, draft });

  // Idempotency key: the finalized draft content within this conversation.
  const fingerprint = JSON.stringify({
    c: conversationId,
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
