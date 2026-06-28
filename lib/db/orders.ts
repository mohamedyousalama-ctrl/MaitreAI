// ============================================================================
// MaitreAI — Sprint 7 Pass 2 — orders data layer
// Loads the tenant's orders (with customer + branch) mapped to the UI LocalOrder
// type, write-through helpers, and a realtime subscription. The app's own status
// keys are stored directly in the text columns. kitchen_status was removed from
// the schema (Amendment 01) — the kitchen view derives it from order_status.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  KitchenStatusKey,
  LocalOrder,
  LocalOrderItem,
  OrderStatusKey,
  PaymentStatusKey,
  FulfillmentKey,
} from "@/lib/types";

export function kitchenFromOrderStatus(status: OrderStatusKey): KitchenStatusKey {
  switch (status) {
    case "preparing":
      return "preparing";
    case "ready":
      return "ready";
    case "out_for_delivery":
    case "delivered":
    case "cancelled":
      return "completed";
    default:
      return "new";
  }
}

interface OrderRowJoined extends Record<string, unknown> {
  id: string;
  order_number: string;
  conversation_id: string | null;
  customer_id: string | null;
  branch_id: string | null;
  fulfillment: string;
  items: LocalOrderItem[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  currency: string;
  source?: string | null;
  is_test?: boolean | null;
  order_status: string;
  payment_status: string;
  payment_method: string | null;
  address: string | null;
  zone_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  customers?: { name?: string; phone?: string } | null;
  branches?: { name?: string } | null;
}

function mapOrder(r: OrderRowJoined): LocalOrder {
  const createdAt = new Date(r.created_at).getTime();
  const orderStatus = r.order_status as OrderStatusKey;
  return {
    id: r.id,
    orderNumber: r.order_number,
    conversationId: r.conversation_id ?? undefined,
    customerId: r.customer_id ?? undefined,
    customerName: r.customers?.name || r.customers?.phone || "عميل",
    customerPhone: r.customers?.phone || "",
    source: r.source === "web" ? "web" : "whatsapp",
    branchId: r.branch_id ?? undefined,
    branchName: r.branches?.name || "",
    fulfillmentType: r.fulfillment as FulfillmentKey,
    deliveryAreaId: r.zone_id ?? undefined,
    deliveryAddress: r.address ?? undefined,
    items: Array.isArray(r.items) ? r.items : [],
    subtotal: Number(r.subtotal),
    deliveryFee: Number(r.delivery_fee),
    total: Number(r.total),
    currency: r.currency,
    paymentStatus: r.payment_status as PaymentStatusKey,
    paymentMethod: r.payment_method ?? null,
    orderStatus,
    kitchenStatus: kitchenFromOrderStatus(orderStatus),
    // UI4 — test marker. loadOrders selects "*", so this is null/absent (→ false)
    // until migration 0044 is applied — deploy-safe with or without the column.
    isTest: r.is_test === true,
    notes: r.notes ?? undefined,
    createdAt,
    updatedAt: new Date(r.updated_at).getTime(),
    // The event log is not persisted (Pass 2) — show a synthetic creation entry.
    events: [{ id: `ev_${r.id}`, type: "created", label: "تم إنشاء الطلب", timestamp: createdAt, actor: "ai" }],
  };
}

export async function loadOrders(s: SupabaseClient, restaurantId: string): Promise<LocalOrder[]> {
  const { data } = await s
    .from("orders")
    .select("*, customers(name, phone), branches(name)")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as OrderRowJoined[]).map(mapOrder);
}

const isUuid = (v?: string) =>
  !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Ensure a customer row exists for this phone; returns its id. */
export async function ensureCustomerId(
  s: SupabaseClient,
  restaurantId: string,
  phone: string,
  name?: string
): Promise<string | null> {
  if (!phone) return null;
  const { data } = await s
    .from("customers")
    .upsert(
      { restaurant_id: restaurantId, phone, ...(name ? { name } : {}) },
      { onConflict: "restaurant_id,phone" }
    )
    .select("id")
    .single();
  return (data?.id as string) ?? null;
}

/** Insert an order using its client-generated UUID id (realtime dedupes by id). */
export async function insertOrderDb(
  s: SupabaseClient,
  restaurantId: string,
  order: LocalOrder,
  customerId: string | null
): Promise<void> {
  await s.from("orders").insert({
    id: order.id,
    restaurant_id: restaurantId,
    order_number: order.orderNumber,
    conversation_id: isUuid(order.conversationId) ? order.conversationId : null,
    customer_id: customerId,
    branch_id: isUuid(order.branchId) ? order.branchId : null,
    fulfillment: order.fulfillmentType,
    items: order.items,
    subtotal: order.subtotal,
    delivery_fee: order.deliveryFee,
    total: order.total,
    currency: order.currency,
    source: order.source ?? "whatsapp",
    order_status: order.orderStatus,
    payment_status: order.paymentStatus,
    address: order.deliveryAddress ?? null,
    zone_id: isUuid(order.deliveryAreaId) ? order.deliveryAreaId : null,
    notes: order.notes ?? null,
  });
}

export async function updateOrderDb(
  s: SupabaseClient,
  id: string,
  patch: { order_status?: OrderStatusKey; payment_status?: PaymentStatusKey }
): Promise<void> {
  await s.from("orders").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}

export function subscribeOrders(s: SupabaseClient, restaurantId: string, onChange: () => void): () => void {
  const ch = s
    .channel(`orders-${restaurantId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, onChange)
    .subscribe((status) => {
      // LIVE0 reconnect-reload guardrail (retrofit, mirrors lib/db/restaurant-settings.ts):
      // on (re)subscribe — including recovery after a drop — trigger the store's
      // (debounced) reload so changes missed while offline are caught instead of
      // leaving the orders board silently stale.
      if (status === "SUBSCRIBED") {
        onChange();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        console.warn("[realtime:orders] channel status:", status); // fail quietly; Supabase retries
      }
    });
  return () => {
    void s.removeChannel(ch);
  };
}
