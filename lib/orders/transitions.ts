import type { OrderStatusKey } from "@/lib/types";

export const ORDER_STATUSES = [
  "draft",
  "pending_confirmation",
  "pending_payment",
  "paid",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const satisfies readonly OrderStatusKey[];

const ORDER_STATUS_SET = new Set<string>(ORDER_STATUSES);

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatusKey, readonly OrderStatusKey[]> = {
  draft: ["pending_confirmation", "pending_payment", "cancelled"],
  pending_confirmation: ["pending_payment", "paid", "preparing", "cancelled"],
  pending_payment: ["paid", "preparing", "cancelled"],
  paid: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["out_for_delivery", "delivered", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export type OrderTransitionError = "illegal_transition" | "payment_required_for_paid";

export function isOrderStatus(value: string): value is OrderStatusKey {
  return ORDER_STATUS_SET.has(value);
}

export function isLegalOrderStatusTransition(from: OrderStatusKey, to: OrderStatusKey): boolean {
  return from === to || ORDER_STATUS_TRANSITIONS[from].includes(to);
}

export function validateOrderStatusTransition(args: {
  from: OrderStatusKey;
  to: OrderStatusKey;
  paymentStatus: string | null;
}): { ok: true } | { ok: false; error: OrderTransitionError } {
  if (!isLegalOrderStatusTransition(args.from, args.to)) {
    return { ok: false, error: "illegal_transition" };
  }
  if (args.to === "paid" && args.paymentStatus !== "paid") {
    return { ok: false, error: "payment_required_for_paid" };
  }
  return { ok: true };
}
