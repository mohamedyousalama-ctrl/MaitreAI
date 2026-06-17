"use client";

import { useState } from "react";
import Link from "next/link";
import type { LocalOrder, PaymentSession } from "@/lib/types";
import { useOrderStore } from "@/lib/order-store";
import { usePaymentStore, currentOrigin } from "@/lib/payment-store";
import { useRestaurantStore } from "@/lib/store";
import { PAYMENT_SESSION_LABELS, PAYMENT_SESSION_STYLES, PAYMENT_METHOD_LABELS, isSessionActive } from "@/lib/payments";
import { formatCurrency, formatOrderId, formatClock, cn } from "@/lib/utils";
import { OrderStatusBadge, OrderPaymentBadge } from "./OrderStatusBadges";
import {
  MessageCircle,
  Store,
  Clock,
  Truck,
  ShoppingBag,
  Link2,
  Copy,
  Check,
  ExternalLink,
  CreditCard,
  ChefHat,
  CheckCircle2,
  XCircle,
  RefreshCw,
  RotateCcw,
} from "lucide-react";

/** Detailed order card with items, payment session, timeline, and actions. */
export function OrderCard({ order }: { order: LocalOrder }) {
  const updateOrderStatus = useOrderStore((s) => s.updateOrderStatus);
  const cancelOrder = useOrderStore((s) => s.cancelOrder);
  const markPaidOverride = useOrderStore((s) => s.markPaid);
  const session = usePaymentStore((s) =>
    s.sessions.filter((x) => x.orderId === order.id).sort((a, b) => b.createdAt - a.createdAt)[0]
  );
  // Per-tenant currency: the order's own currency, falling back to the tenant profile.
  const profileCurrency = useRestaurantStore((s) => s.profile.currency);
  const currency = order.currency || profileCurrency;

  const lifecycle = lifecycleActions(order, { updateOrderStatus, cancelOrder });
  const showPayment = order.orderStatus === "pending_payment" || !!session;

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
                {[it.variant, ...(it.choices ?? []), ...it.modifiers].filter(Boolean).length > 0 && (
                  <p className="text-xs text-slate-400">
                    {[it.variant, ...(it.choices ?? []), ...it.modifiers].filter(Boolean).join("، ")}
                  </p>
                )}
              </div>
              <span className="text-slate-600">{formatCurrency(it.total, currency)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
          <Row label="المجموع الفرعي" value={formatCurrency(order.subtotal, currency)} />
          {order.deliveryFee > 0 && <Row label="رسوم التوصيل" value={formatCurrency(order.deliveryFee, currency)} />}
          <div className="flex items-center justify-between pt-1">
            <span className="font-semibold text-slate-700">الإجمالي</span>
            <span className="text-lg font-bold text-slate-900">{formatCurrency(order.total, currency)}</span>
          </div>
        </div>
      </div>

      {/* Payment */}
      {showPayment && (
        <PaymentSection
          order={order}
          session={session}
          onMarkPaidOverride={() => markPaidOverride(order.id, "human")}
        />
      )}

      {order.notes && (
        <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
          <p className="text-xs font-bold text-amber-700">ملاحظات</p>
          <p className="mt-1 text-sm text-slate-700">{order.notes}</p>
        </div>
      )}

      {/* Order timeline */}
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

      {/* Lifecycle actions */}
      {lifecycle.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {lifecycle.map((a) => (
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

function PaymentSection({
  order,
  session,
  onMarkPaidOverride,
}: {
  order: LocalOrder;
  session?: PaymentSession;
  onMarkPaidOverride: () => void;
}) {
  const sendPaymentLink = usePaymentStore((s) => s.sendPaymentLink);
  const cancelSession = usePaymentStore((s) => s.cancelSession);
  const refundSession = usePaymentStore((s) => s.refundSession);
  const simulateSuccess = usePaymentStore((s) => s.simulateSuccess);
  const profileCurrency = useRestaurantStore((s) => s.profile.currency);
  const currency = order.currency || profileCurrency;
  const [copied, setCopied] = useState(false);

  const active = session && isSessionActive(session.status);
  const isPaid = order.paymentStatus === "paid";

  const copy = () => {
    if (!session) return;
    navigator.clipboard?.writeText(session.checkoutUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const adminPaid = () => {
    if (active && session) simulateSuccess(session.id, "card");
    else onMarkPaidOverride();
  };

  return (
    <div className="rounded-2xl border border-promotions/20 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-promotions">
          <CreditCard className="h-4 w-4" /> الدفع
        </p>
        {session && (
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", PAYMENT_SESSION_STYLES[session.status])}>
            {PAYMENT_SESSION_LABELS[session.status]}
          </span>
        )}
      </div>

      <div className="space-y-1.5 text-sm">
        <Row label="المبلغ" value={formatCurrency(order.total, currency)} />
        {session && <Row label="ينتهي في" value={formatClock(session.expiresAt)} />}
        {session?.method && <Row label="طريقة الدفع" value={PAYMENT_METHOD_LABELS[session.method]} />}
      </div>

      {/* Checkout link */}
      {session && active && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 p-2">
          <span dir="ltr" className="flex-1 truncate text-xs text-slate-500">{session.checkoutUrl}</span>
          <button onClick={copy} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700" aria-label="نسخ">
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
          </button>
          <Link href={`/checkout/${session.id}`} target="_blank" className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-brain" aria-label="فتح">
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      )}

      {/* Payment events */}
      {session && session.events.length > 0 && (
        <ol className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          {session.events.map((e) => (
            <li key={e.id} className="flex items-center justify-between text-xs">
              <span className="text-slate-600">{e.label}</span>
              <span className="text-slate-400">{formatClock(e.timestamp)}</span>
            </li>
          ))}
        </ol>
      )}

      {/* Payment actions */}
      <div className="mt-3 flex flex-wrap gap-2">
        {!isPaid && order.orderStatus !== "cancelled" && (
          <button
            onClick={() => sendPaymentLink(order.id, currentOrigin())}
            className="inline-flex items-center gap-1.5 rounded-xl bg-promotions px-3 py-2 text-sm font-semibold text-white shadow-card hover:opacity-90"
          >
            {session && !active ? <RefreshCw className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
            {session && !active ? "إعادة إرسال الرابط" : "إرسال رابط الدفع"}
          </button>
        )}
        {!isPaid && order.orderStatus !== "cancelled" && (
          <button
            onClick={adminPaid}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <CheckCircle2 className="h-4 w-4" /> تأكيد الدفع يدوياً
          </button>
        )}
        {session && active && (
          <button
            onClick={() => cancelSession(session.id)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <XCircle className="h-4 w-4" /> إلغاء جلسة الدفع
          </button>
        )}
        {isPaid && session && session.status !== "refunded" && (
          <button
            onClick={() => refundSession(session.id)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            <RotateCcw className="h-4 w-4" /> استرجاع المبلغ
          </button>
        )}
      </div>
      <p className="mt-2 text-[10px] text-slate-400">* دفع تجريبي محلي — لا يوجد مزود دفع فعلي.</p>
    </div>
  );
}

interface LifecycleApi {
  updateOrderStatus: (id: string, status: LocalOrder["orderStatus"]) => void;
  cancelOrder: (id: string) => void;
}

type Variant = "primary" | "muted" | "danger";

function lifecycleActions(order: LocalOrder, api: LifecycleApi) {
  const id = order.id;
  const list: { key: string; label: string; icon: typeof CreditCard; variant: Variant; run: () => void }[] = [];
  const cancelAction = { key: "cancel", label: "إلغاء الطلب", icon: XCircle, variant: "danger" as Variant, run: () => api.cancelOrder(id) };

  switch (order.orderStatus) {
    case "pending_payment":
    case "pending_confirmation":
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
