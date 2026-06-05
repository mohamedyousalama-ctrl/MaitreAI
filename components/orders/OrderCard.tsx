"use client";

import type { LocalOrder } from "@/lib/types";
import { useOrderStore } from "@/lib/order-store";
import { formatCurrency, formatOrderId, formatClock, cn } from "@/lib/utils";
import { OrderStatusBadge, OrderPaymentBadge } from "./OrderStatusBadges";
import {
  MessageCircle,
  Store,
  Clock,
  Truck,
  ShoppingBag,
  Link2,
  CreditCard,
  ChefHat,
  CheckCircle2,
  XCircle,
} from "lucide-react";

/** Detailed order card with items, timeline, and status action buttons. */
export function OrderCard({ order }: { order: LocalOrder }) {
  const sendPaymentLinkMock = useOrderStore((s) => s.sendPaymentLinkMock);
  const markPaid = useOrderStore((s) => s.markPaid);
  const updateOrderStatus = useOrderStore((s) => s.updateOrderStatus);
  const cancelOrder = useOrderStore((s) => s.cancelOrder);

  const actions = orderActions(order, {
    sendPaymentLinkMock,
    markPaid,
    updateOrderStatus,
    cancelOrder,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xl font-bold text-slate-900">{formatOrderId(order.orderNumber)}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500">
            <Clock className="h-3.5 w-3.5" /> {formatClock(order.createdAt)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <OrderStatusBadge status={order.orderStatus} />
          <OrderPaymentBadge status={order.paymentStatus} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InfoTile icon={ShoppingBag} label="العميل" value={order.customerName} />
        <InfoTile icon={Store} label="الفرع" value={order.branchName} />
        <InfoTile icon={Truck} label="النوع" value={order.fulfillmentType === "delivery" ? "توصيل" : "استلام"} />
        <InfoTile icon={MessageCircle} label="المصدر" value="WhatsApp" />
      </div>

      {/* Items */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-sm font-semibold text-slate-700">الأصناف</p>
        <ul className="space-y-2">
          {order.items.map((it) => (
            <li key={it.id} className="flex items-start justify-between text-sm">
              <div>
                <span className="font-medium text-slate-700">
                  {it.name} <span className="text-slate-400">×{it.quantity}</span>
                </span>
                {it.modifiers.length > 0 && <p className="text-xs text-slate-400">{it.modifiers.join("، ")}</p>}
                {it.notes && <p className="text-xs text-amber-600">{it.notes}</p>}
              </div>
              <span className="text-slate-600">{formatCurrency(it.total)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
          <Row label="المجموع الفرعي" value={formatCurrency(order.subtotal)} />
          {order.deliveryFee > 0 && <Row label="رسوم التوصيل" value={formatCurrency(order.deliveryFee)} />}
          <div className="flex items-center justify-between pt-1">
            <span className="font-semibold text-slate-700">الإجمالي</span>
            <span className="text-lg font-bold text-slate-900">{formatCurrency(order.total)}</span>
          </div>
        </div>
      </div>

      {order.notes && (
        <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
          <p className="text-xs font-bold text-amber-700">ملاحظات</p>
          <p className="mt-1 text-sm text-slate-700">{order.notes}</p>
        </div>
      )}

      {/* Timeline */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-sm font-semibold text-slate-700">سجل الطلب</p>
        <ol className="space-y-3">
          {order.events.map((evt) => (
            <li key={evt.id} className="flex gap-3">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-orders" />
              <div className="flex-1">
                <p className="text-sm text-slate-700">{evt.label}</p>
                <p className="text-xs text-slate-400">{formatClock(evt.timestamp)} · {actorLabel(evt.actor)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Actions */}
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <button
              key={a.key}
              onClick={a.run}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold shadow-card transition hover:opacity-90",
                a.variant === "danger"
                  ? "border border-red-200 bg-white text-red-600 shadow-none hover:bg-red-50"
                  : a.variant === "muted"
                  ? "border border-slate-200 bg-white text-slate-700 shadow-none hover:bg-slate-50"
                  : "bg-orders text-white"
              )}
            >
              <a.icon className="h-4 w-4" />
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface OrderActionsApi {
  sendPaymentLinkMock: (id: string) => void;
  markPaid: (id: string) => void;
  updateOrderStatus: (id: string, status: LocalOrder["orderStatus"]) => void;
  cancelOrder: (id: string) => void;
}

type Variant = "primary" | "muted" | "danger";

function orderActions(order: LocalOrder, api: OrderActionsApi) {
  const id = order.id;
  const list: { key: string; label: string; icon: typeof CreditCard; variant: Variant; run: () => void }[] = [];
  const cancelAction = { key: "cancel", label: "إلغاء الطلب", icon: XCircle, variant: "danger" as Variant, run: () => api.cancelOrder(id) };

  switch (order.orderStatus) {
    case "pending_payment":
    case "pending_confirmation":
      if (order.paymentStatus !== "payment_link_sent")
        list.push({ key: "link", label: "إرسال رابط دفع تجريبي", icon: Link2, variant: "muted", run: () => api.sendPaymentLinkMock(id) });
      list.push({ key: "paid", label: "تأكيد الدفع", icon: CreditCard, variant: "primary", run: () => api.markPaid(id) });
      list.push(cancelAction);
      break;
    case "paid":
      list.push({ key: "prep", label: "بدء التحضير", icon: ChefHat, variant: "primary", run: () => api.updateOrderStatus(id, "preparing") });
      list.push(cancelAction);
      break;
    case "preparing":
      list.push({ key: "ready", label: "تجهيز كجاهز", icon: CheckCircle2, variant: "primary", run: () => api.updateOrderStatus(id, "ready") });
      list.push(cancelAction);
      break;
    case "ready":
      list.push({ key: "ofd", label: "خرج للتوصيل", icon: Truck, variant: "primary", run: () => api.updateOrderStatus(id, "out_for_delivery") });
      list.push({ key: "delivered", label: "تم التسليم", icon: CheckCircle2, variant: "muted", run: () => api.updateOrderStatus(id, "delivered") });
      break;
    case "out_for_delivery":
      list.push({ key: "delivered", label: "تم التسليم", icon: CheckCircle2, variant: "primary", run: () => api.updateOrderStatus(id, "delivered") });
      break;
  }
  return list;
}

function actorLabel(actor: string) {
  return actor === "ai" ? "الموظف الذكي" : actor === "human" ? "موظف" : "النظام";
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-slate-500">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
