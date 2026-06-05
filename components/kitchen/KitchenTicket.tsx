"use client";

import type { LocalOrder } from "@/lib/types";
import { useOrderStore } from "@/lib/order-store";
import { formatOrderId, minutesAgo, cn } from "@/lib/utils";
import { OrderPaymentBadge } from "@/components/orders/OrderStatusBadges";
import { Clock, Truck, ShoppingBag, StickyNote, ChefHat, CheckCircle2, PackageCheck } from "lucide-react";

/** A kitchen ticket — compact paid-order view for the prep board. */
export function KitchenTicket({ order }: { order: LocalOrder }) {
  const updateKitchenStatus = useOrderStore((s) => s.updateKitchenStatus);
  const mins = minutesAgo(order.createdAt);
  const urgent = mins >= 20;
  const warn = mins >= 10 && mins < 20;

  const action =
    order.kitchenStatus === "new"
      ? { label: "بدء التحضير", icon: ChefHat, run: () => updateKitchenStatus(order.id, "preparing") }
      : order.kitchenStatus === "preparing"
      ? { label: "تجهيز كجاهز", icon: CheckCircle2, run: () => updateKitchenStatus(order.id, "ready") }
      : { label: "إكمال الطلب", icon: PackageCheck, run: () => updateKitchenStatus(order.id, "completed") };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="font-bold text-slate-900">{formatOrderId(order.orderNumber)}</span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold",
            urgent ? "bg-red-50 text-red-600" : warn ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
          )}
        >
          <Clock className="h-3 w-3" /> {mins} د
        </span>
      </div>

      <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
        <ShoppingBag className="h-3.5 w-3.5" /> {order.customerName}
      </p>

      <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
        {order.items.map((it) => (
          <li key={it.id} className="text-sm">
            <span className="font-semibold text-slate-800">
              {it.quantity}× {it.name}
            </span>
            {it.modifiers.length > 0 && <p className="text-xs text-orange-600">↳ {it.modifiers.join("، ")}</p>}
          </li>
        ))}
      </ul>

      {order.notes && (
        <p className="mt-2 flex items-start gap-1 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
          <StickyNote className="mt-0.5 h-3 w-3 shrink-0" /> {order.notes}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <OrderPaymentBadge status={order.paymentStatus} className="scale-90 origin-right" />
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
          <Truck className="h-3.5 w-3.5" /> {order.fulfillmentType === "delivery" ? "توصيل" : "استلام"}
        </span>
      </div>

      <button
        onClick={action.run}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-kitchen px-3 py-2 text-sm font-semibold text-white shadow-card transition hover:opacity-90"
      >
        <action.icon className="h-4 w-4" /> {action.label}
      </button>
    </div>
  );
}
