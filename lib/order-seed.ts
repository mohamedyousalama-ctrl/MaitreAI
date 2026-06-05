// ============================================================================
// MaitreAI — Seed local orders (first-run data for the order store)
// Converts the legacy Arabic-status mock orders into the Sprint-4 LocalOrder
// shape so the Orders / Kitchen / Dashboard pages have realistic data on load.
// ============================================================================

import { orders as legacyOrders } from "./mock-data";
import { seedMenuItems } from "./seed-data";
import type {
  FulfillmentKey,
  KitchenStatusKey,
  LocalOrder,
  OrderStatusKey,
  PaymentStatusKey,
} from "./types";

const STATUS_MAP: Record<string, OrderStatusKey> = {
  "جديد": "pending_payment",
  "بانتظار الدفع": "pending_payment",
  "مدفوع": "paid",
  "قيد التحضير": "preparing",
  "جاهز": "ready",
  "خرج للتوصيل": "out_for_delivery",
  "مكتمل": "delivered",
  "ملغي": "cancelled",
};

const PAYMENT_MAP: Record<string, PaymentStatusKey> = {
  "مدفوع": "paid",
  "بانتظار الدفع": "unpaid",
  "غير مدفوع": "unpaid",
  "مسترجع": "refunded",
};

function kitchenForOrder(status: OrderStatusKey): KitchenStatusKey {
  switch (status) {
    case "preparing":
      return "preparing";
    case "ready":
      return "ready";
    case "delivered":
    case "out_for_delivery":
      return "completed";
    default:
      return "new";
  }
}

// Conversations seeded with linkedOrderId in mock-data.
const CONVERSATION_LINKS: Record<string, string> = {
  "1042": "conv1",
  "1041": "conv3",
};

export function buildSeedOrders(): LocalOrder[] {
  const now = Date.now();
  return legacyOrders.map((o) => {
    const orderStatus = STATUS_MAP[o.status] ?? "pending_payment";
    const paymentStatus = PAYMENT_MAP[o.paymentStatus] ?? "unpaid";
    const fulfillmentType: FulfillmentKey = o.fulfillment === "استلام" ? "pickup" : "delivery";
    const createdAt = now - o.createdAtMinutesAgo * 60_000;

    const items = o.items.map((it, idx) => {
      const menu = seedMenuItems.find((m) => m.name === it.name);
      return {
        id: `${o.id}-i${idx}`,
        menuItemId: menu?.id,
        name: it.name,
        quantity: it.qty,
        unitPrice: it.price,
        modifiers: it.modifiers ?? [],
        total: it.price * it.qty,
      };
    });
    const subtotal = items.reduce((s, it) => s + it.total, 0);

    return {
      id: `seed-${o.id}`,
      orderNumber: o.id,
      conversationId: CONVERSATION_LINKS[o.id],
      customerName: o.customer,
      customerPhone: o.customerPhone,
      source: "whatsapp",
      branchName: o.branch,
      fulfillmentType,
      items,
      subtotal,
      deliveryFee: o.total - subtotal > 0 ? o.total - subtotal : 0,
      total: o.total,
      currency: "ر.س",
      paymentStatus,
      orderStatus,
      kitchenStatus: kitchenForOrder(orderStatus),
      notes: o.notes,
      createdAt,
      updatedAt: createdAt,
      events: [
        { id: `${o.id}-e0`, type: "created", label: "تم إنشاء الطلب", timestamp: createdAt, actor: "system" as const },
      ],
    };
  });
}
