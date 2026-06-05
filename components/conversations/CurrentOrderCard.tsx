import type { Order } from "@/lib/types";
import { formatCurrency, formatOrderId } from "@/lib/utils";
import { PaymentStatusBadge } from "@/components/ui/PaymentStatusBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ShoppingBag } from "lucide-react";

export function CurrentOrderCard({ order }: { order: Order }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orders text-white">
            <ShoppingBag className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs text-slate-500">الطلب الحالي</p>
            <p className="font-bold text-slate-900">{formatOrderId(order.id)}</p>
          </div>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
        {order.items.map((it, i) => (
          <li key={i} className="flex items-start justify-between text-sm">
            <div>
              <span className="font-medium text-slate-700">
                {it.name} <span className="text-slate-400">×{it.qty}</span>
              </span>
              {it.modifiers && it.modifiers.length > 0 && (
                <p className="text-xs text-slate-400">{it.modifiers.join("، ")}</p>
              )}
            </div>
            <span className="text-slate-600">{formatCurrency(it.price * it.qty)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-sm font-semibold text-slate-700">الإجمالي</span>
        <span className="text-lg font-bold text-slate-900">{formatCurrency(order.total)}</span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <PaymentStatusBadge status={order.paymentStatus} />
        <span className="text-xs text-slate-500">{order.fulfillment}</span>
      </div>
    </div>
  );
}
