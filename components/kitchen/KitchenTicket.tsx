import type { Order } from "@/lib/types";
import { formatOrderId } from "@/lib/utils";
import { PaymentStatusBadge } from "@/components/ui/PaymentStatusBadge";
import { Clock, Truck, ShoppingBag, StickyNote } from "lucide-react";

/** A kitchen ticket — compact order view for the prep board. */
export function KitchenTicket({ order }: { order: Order }) {
  // Timer urgency colors based on how long the ticket has been open.
  const urgent = order.createdAtMinutesAgo >= 20;
  const warn = order.createdAtMinutesAgo >= 10 && order.createdAtMinutesAgo < 20;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="font-bold text-slate-900">{formatOrderId(order.id)}</span>
        <span
          className={[
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold",
            urgent ? "bg-red-50 text-red-600" : warn ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600",
          ].join(" ")}
        >
          <Clock className="h-3 w-3" /> {order.createdAtMinutesAgo} د
        </span>
      </div>

      <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
        <ShoppingBag className="h-3.5 w-3.5" /> {order.customer}
      </p>

      <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
        {order.items.map((it, i) => (
          <li key={i} className="text-sm">
            <span className="font-semibold text-slate-800">
              {it.qty}× {it.name}
            </span>
            {it.modifiers && it.modifiers.length > 0 && (
              <p className="text-xs text-orange-600">↳ {it.modifiers.join("، ")}</p>
            )}
          </li>
        ))}
      </ul>

      {order.notes && (
        <p className="mt-2 flex items-start gap-1 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
          <StickyNote className="mt-0.5 h-3 w-3 shrink-0" /> {order.notes}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <PaymentStatusBadge status={order.paymentStatus} className="scale-90 origin-right" />
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
          <Truck className="h-3.5 w-3.5" /> {order.fulfillment}
        </span>
      </div>
    </div>
  );
}
