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
    .select("*, customers(name,phone), branches(name), restaurants(name,currency,tax_registration_no)")
    .eq("id", orderId)
    .single();
  if (!o) return null;
  const row = o as Record<string, unknown>;

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
  const orderNumber = String(row.order_number ?? "");

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
    customerName: cust.name ?? undefined,
    customerPhone: cust.phone ?? undefined,
    address: row.address ? String(row.address) : undefined,
    branchName: branch.name ?? undefined,
    createdAt: row.created_at ? String(row.created_at) : undefined,
  };
}
