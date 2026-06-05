import type { Order } from "@/lib/types";
import { formatCurrency, formatOrderId } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PaymentStatusBadge } from "@/components/ui/PaymentStatusBadge";
import { MessageCircle, Store, Clock, Truck, ShoppingBag } from "lucide-react";

/** Detailed order card — used in the orders side panel. */
export function OrderCard({ order }: { order: Order }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xl font-bold text-slate-900">{formatOrderId(order.id)}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500">
            <Clock className="h-3.5 w-3.5" /> {order.time}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={order.status} />
          <PaymentStatusBadge status={order.paymentStatus} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InfoTile icon={ShoppingBag} label="العميل" value={order.customer} />
        <InfoTile icon={Store} label="الفرع" value={order.branch} />
        <InfoTile icon={Truck} label="النوع" value={order.fulfillment} />
        <InfoTile icon={MessageCircle} label="المصدر" value={order.source} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-sm font-semibold text-slate-700">الأصناف</p>
        <ul className="space-y-2">
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
          <span className="font-semibold text-slate-700">الإجمالي</span>
          <span className="text-lg font-bold text-slate-900">{formatCurrency(order.total)}</span>
        </div>
      </div>

      {order.notes && (
        <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
          <p className="text-xs font-bold text-amber-700">ملاحظات</p>
          <p className="mt-1 text-sm text-slate-700">{order.notes}</p>
        </div>
      )}
    </div>
  );
}

function InfoTile({ icon: Icon, label, value }: { icon: typeof Store; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
