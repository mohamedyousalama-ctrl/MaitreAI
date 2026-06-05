// ============================================================================
// MaitreAI — Local order engine helpers: Arabic labels, status colors, totals,
// status transitions, and customer-facing tracking text. Pure functions only.
// ============================================================================

import type {
  Brain,
} from "./ai/engine";
import type {
  DraftOrder,
  KitchenStatusKey,
  LocalOrder,
  LocalOrderItem,
  OrderStatusKey,
  PaymentStatusKey,
} from "./types";

// ---------------------------------------------------------------------------
// Arabic labels
// ---------------------------------------------------------------------------
export const ORDER_STATUS_LABELS: Record<OrderStatusKey, string> = {
  draft: "مسودة",
  pending_confirmation: "بانتظار التأكيد",
  pending_payment: "بانتظار الدفع",
  paid: "مدفوع",
  preparing: "قيد التحضير",
  ready: "جاهز",
  out_for_delivery: "خرج للتوصيل",
  delivered: "تم التسليم",
  cancelled: "ملغي",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatusKey, string> = {
  unpaid: "غير مدفوع",
  payment_link_sent: "تم إرسال الرابط",
  paid: "مدفوع",
  failed: "فشل الدفع",
  refunded: "مسترجع",
};

export const KITCHEN_STATUS_LABELS: Record<KitchenStatusKey, string> = {
  new: "جديد",
  preparing: "قيد التحضير",
  ready: "جاهز",
  completed: "مكتمل",
};

// ---------------------------------------------------------------------------
// Status colors (tailwind ring/bg/text triplets)
// ---------------------------------------------------------------------------
export const ORDER_STATUS_STYLES: Record<OrderStatusKey, string> = {
  draft: "bg-slate-50 text-slate-600 ring-slate-200",
  pending_confirmation: "bg-blue-50 text-blue-700 ring-blue-200",
  pending_payment: "bg-amber-50 text-amber-700 ring-amber-200",
  paid: "bg-purple-50 text-purple-700 ring-purple-200",
  preparing: "bg-orange-50 text-orange-700 ring-orange-200",
  ready: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  out_for_delivery: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  delivered: "bg-green-50 text-green-700 ring-green-200",
  cancelled: "bg-red-50 text-red-700 ring-red-200",
};

export const PAYMENT_STATUS_STYLES: Record<PaymentStatusKey, string> = {
  unpaid: "bg-slate-50 text-slate-600 ring-slate-200",
  payment_link_sent: "bg-blue-50 text-blue-700 ring-blue-200",
  paid: "bg-purple-50 text-purple-700 ring-purple-200",
  failed: "bg-red-50 text-red-700 ring-red-200",
  refunded: "bg-red-50 text-red-700 ring-red-200",
};

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------
/** Sum of price impacts for the given modifier names, looked up in the brain. */
export function modifiersImpact(modifierNames: string[], brain: Brain): number {
  return modifierNames.reduce((sum, name) => {
    const mod = brain.modifiers.find((m) => m.name === name);
    return sum + (mod?.priceImpact ?? 0);
  }, 0);
}

export function buildOrderItems(draft: DraftOrder, brain: Brain, idFn: () => string): LocalOrderItem[] {
  return draft.items.map((it) => {
    const menu = brain.menuItems.find((m) => m.name === it.name);
    const unitPrice = menu?.price ?? it.price ?? 0;
    const impact = modifiersImpact(it.modifiers, brain);
    const total = (unitPrice + impact) * it.quantity;
    return {
      id: idFn(),
      menuItemId: menu?.id,
      name: it.name,
      quantity: it.quantity,
      unitPrice,
      modifiers: it.modifiers,
      total,
    };
  });
}

export function computeTotals(items: LocalOrderItem[], deliveryFee: number) {
  const subtotal = items.reduce((sum, it) => sum + it.total, 0);
  return { subtotal, total: subtotal + deliveryFee };
}

// ---------------------------------------------------------------------------
// Kitchen ⇄ order status mapping
// ---------------------------------------------------------------------------
export function orderStatusForKitchen(kitchen: KitchenStatusKey): OrderStatusKey {
  switch (kitchen) {
    case "new":
      return "paid";
    case "preparing":
      return "preparing";
    case "ready":
      return "ready";
    case "completed":
      return "delivered";
  }
}

// ---------------------------------------------------------------------------
// Customer-facing tracking reply for the order_tracking intent
// ---------------------------------------------------------------------------
export function trackingReply(order: { orderNumber: string; orderStatus: OrderStatusKey }): string {
  const n = order.orderNumber;
  switch (order.orderStatus) {
    case "pending_payment":
    case "pending_confirmation":
    case "draft":
      return `طلبك #${n} جاهز للتأكيد، والمتبقي إرسال رابط الدفع أو إتمام الدفع.`;
    case "paid":
      return `تم تأكيد طلبك #${n} وهو الآن بانتظار بدء التحضير.`;
    case "preparing":
      return `طلبك #${n} قيد التحضير الآن.`;
    case "ready":
      return `طلبك #${n} جاهز للاستلام / التوصيل.`;
    case "out_for_delivery":
      return `طلبك #${n} خرج للتوصيل.`;
    case "delivered":
      return `تم تسليم طلبك #${n}. بالعافية!`;
    case "cancelled":
      return `طلبك #${n} ملغي. هل ترغب بإنشاء طلب جديد؟`;
  }
}

// ---------------------------------------------------------------------------
// Conversation system messages on order status change (Phase 6 / Phase 7)
// ---------------------------------------------------------------------------
export function orderStatusMessage(order: LocalOrder, status: OrderStatusKey): string | undefined {
  const n = order.orderNumber;
  switch (status) {
    case "preparing":
      return `طلبك #${n} قيد التحضير الآن.`;
    case "ready":
      return `طلبك #${n} جاهز.`;
    case "out_for_delivery":
      return `طلبك #${n} خرج للتوصيل.`;
    case "delivered":
      return `تم تسليم طلبك #${n}. بالعافية!`;
    case "cancelled":
      return `تم إلغاء طلبك #${n}.`;
    default:
      return undefined;
  }
}
