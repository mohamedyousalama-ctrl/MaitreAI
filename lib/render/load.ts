// ============================================================================
// MaitreAI — Order → ReceiptData loader (Sprint 9, S9-3) — SERVER ONLY
// Maps a persisted order row (+ joined customer/branch/restaurant) to the
// renderer's ReceiptData. Every figure is read straight from the order row;
// nothing here is model-authored.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReceiptData, ReceiptItem } from "./receipt";

interface RawItem {
  name?: unknown;
  quantity?: unknown;
  modifiers?: unknown;
  variant?: unknown;
  choices?: unknown;
  total?: unknown;
  notes?: unknown;
}

export async function loadReceiptData(client: SupabaseClient, orderId: string): Promise<ReceiptData | null> {
  const { data: o } = await client
    .from("orders")
    .select("*, customers(name,phone), branches(name), restaurants(name,currency,tax_registration_no), conversations(is_safety_hold,ownership_state), delivery_zones(name)")
    .eq("id", orderId)
    .single();
  if (!o) return null;
  const row = o as Record<string, unknown>;

  // Best-effort driver name (if a delivery row with an assigned driver exists).
  // Read-only + isolated so a missing/!exists relationship never breaks the load.
  let driverName: string | undefined;
  try {
    const { data: del } = await client
      .from("deliveries")
      .select("drivers(name)")
      .eq("order_id", orderId)
      .maybeSingle();
    const dn = (del as { drivers?: { name?: string } | null } | null)?.drivers?.name;
    if (dn) driverName = String(dn);
  } catch {
    /* no delivery row / no driver — leave undefined */
  }

  const rawItems = Array.isArray(row.items) ? (row.items as RawItem[]) : [];
  const items: ReceiptItem[] = rawItems.map((it) => ({
    name: String(it.name ?? ""),
    quantity: Number(it.quantity ?? 1),
    modifiers: Array.isArray(it.modifiers) ? (it.modifiers as unknown[]).map(String) : [],
    variant: it.variant ? String(it.variant) : undefined,
    choices: Array.isArray(it.choices) ? (it.choices as unknown[]).map(String) : [],
    total: Number(it.total ?? 0),
    notes: it.notes ? String(it.notes) : undefined,
  }));

  const rest = (row.restaurants as { name?: string; currency?: string; tax_registration_no?: string } | null) ?? {};
  const cust = (row.customers as { name?: string; phone?: string } | null) ?? {};
  const branch = (row.branches as { name?: string } | null) ?? {};
  const conv = (row.conversations as { is_safety_hold?: boolean; ownership_state?: string } | null) ?? {};
  const zone = (row.delivery_zones as { name?: string } | null) ?? {};
  const orderNumber = String(row.order_number ?? "");
  // Allergy/safety hold = the linked conversation is currently held for review.
  const safetyHold = conv.is_safety_hold === true || conv.ownership_state === "SYSTEM_HOLD";

  return {
    restaurantName: rest.name ?? "",
    orderNumber: orderNumber.startsWith("#") ? orderNumber : `#${orderNumber}`,
    fulfillment: row.fulfillment === "delivery" ? "delivery" : "pickup",
    items,
    subtotal: Number(row.subtotal ?? 0),
    deliveryFee: Number(row.delivery_fee ?? 0),
    discountTotal: Number(row.discount_total ?? 0),
    taxAmount: Number(row.tax_amount ?? 0),
    taxRate: Number(row.tax_rate ?? 0),
    taxRegNo: rest.tax_registration_no ?? undefined,
    total: Number(row.total ?? 0),
    currency: String(row.currency ?? rest.currency ?? "ر.س"),
    paymentStatus: row.payment_status ? String(row.payment_status) : undefined,
    paymentMethod: row.payment_method ? String(row.payment_method) : undefined,
    source: row.source ? String(row.source) : undefined,
    safetyHold,
    customerName: cust.name ?? undefined,
    customerPhone: cust.phone ?? undefined,
    address: row.address ? String(row.address) : undefined,
    zoneName: zone.name ?? undefined,
    driverName,
    branchName: branch.name ?? undefined,
    createdAt: row.created_at ? String(row.created_at) : undefined,
  };
}
