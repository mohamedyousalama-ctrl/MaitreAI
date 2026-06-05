import { cn } from "@/lib/utils";
import type { OrderStatusKey, PaymentStatusKey } from "@/lib/types";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_STYLES,
} from "@/lib/orders";

export function OrderStatusBadge({ status, className }: { status: OrderStatusKey; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        ORDER_STATUS_STYLES[status],
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}

export function OrderPaymentBadge({ status, className }: { status: PaymentStatusKey; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        PAYMENT_STATUS_STYLES[status],
        className
      )}
    >
      {PAYMENT_STATUS_LABELS[status]}
    </span>
  );
}
