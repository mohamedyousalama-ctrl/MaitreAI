"use client";

// ============================================================================
// MaitreAI — الطلبات / orders pipeline (Amendment 04 §M5)
// Four glanceable stages (جديدة → قيد التحضير → جاهزة → خرجت للتوصيل) plus a
// collapsed مكتملة column. Big-button advance, browser-print receipt (F4
// fallback), COD/paid marker, fulfillment icon, and a late-order highlight that
// feeds the Pulse strip. Replaces the deleted kitchen board.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useOrderStore } from "@/lib/order-store";
import { usePaymentStore } from "@/lib/payment-store";
import { useHasHydrated } from "@/lib/store";
import type { LocalOrder, OrderStatusKey } from "@/lib/types";
import { ORDER_STATUS_LABELS } from "@/lib/orders";
import { Printer, Bike, ShoppingBag, ChevronDown, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";

function OrderDrawer({ o, onClose, onAdvance, onCancel, printWidth }: { o: LocalOrder; onClose: () => void; onAdvance: (o: LocalOrder) => void; onCancel: (o: LocalOrder) => void; printWidth: PrintWidth }) {
  const next = nextStatus(o);
  const closable = o.orderStatus !== "cancelled" && o.orderStatus !== "delivered";
  const [sending, setSending] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const openImage = (kind: "receipt" | "ticket") => window.open(`/api/orders/${o.id}/image?kind=${kind}&w=${printWidth}`, "_blank");
  async function sendReceipt() {
    setSending("loading");
    try {
      const r = await fetch(`/api/orders/${o.id}/send-receipt`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      setSending(r.ok ? (j.status === "skipped" ? "ok" : "ok") : "err");
    } catch {
      setSending("err");
    }
    setTimeout(() => setSending("idle"), 2500);
  }
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-[420px] lg:rounded-none">
        <div className="sticky top-0 flex items-center justify-between border-b border-[#ece0d2] bg-white px-4 py-3">
          <div>
            <p className="font-bold text-[#2a211b]">طلب #{o.orderNumber}</p>
            <p className="text-xs text-[#9b8b7c]">{ORDER_STATUS_LABELS[o.orderStatus]}</p>
          </div>
          <button onClick={onClose} className="text-[#9b8b7c]"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-4 text-[#2a211b]">
          <div className="text-sm">
            <p className="font-semibold">{o.customerName}</p>
            <p className="text-xs text-[#9b8b7c]">{o.customerPhone}</p>
            <p className="mt-1 text-xs text-[#6a5c4e]">
              {o.fulfillmentType === "delivery" ? `توصيل: ${o.deliveryAddress || "—"}` : "استلام من الفرع"}
            </p>
          </div>
          <div className="space-y-1 border-t border-[#ece0d2] pt-3">
            {o.items.map((i) => (
              <div key={i.id} className="flex justify-between text-sm">
                <span>
                  {i.quantity}× {i.name}
                  {[i.variant, ...(i.choices ?? []), ...i.modifiers].filter(Boolean).length
                    ? ` (${[i.variant, ...(i.choices ?? []), ...i.modifiers].filter(Boolean).join("، ")})`
                    : ""}
                  {i.notes ? ` — ${i.notes}` : ""}
                </span>
                <span className="text-[#6a5c4e]">{i.total} {o.currency}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-[#ece0d2] pt-2 text-sm">
            <div className="flex justify-between text-[#6a5c4e]"><span>المجموع الفرعي</span><span>{o.subtotal} {o.currency}</span></div>
            {o.deliveryFee > 0 && <div className="flex justify-between text-[#6a5c4e]"><span>التوصيل</span><span>{o.deliveryFee} {o.currency}</span></div>}
            <div className="mt-1 flex justify-between font-bold"><span>الإجمالي</span><span>{o.total} {o.currency}</span></div>
            <div className="mt-1 text-xs text-[#9b8b7c]">الدفع: {o.paymentStatus === "paid" ? "مدفوع" : o.paymentStatus === "refunded" ? "مُسترجع" : "غير مدفوع"}</div>
          </div>
          <div className="border-t border-[#ece0d2] pt-3">
            <p className="mb-1 text-xs font-semibold text-[#9b8b7c]">مسار الطلب</p>
            <div className="space-y-1">
              {o.events.map((e) => (
                <p key={e.id} className="flex items-center gap-1.5 text-xs text-[#6a5c4e]">
                  <Clock className="h-3 w-3" /> {e.label} · {new Date(e.timestamp).toLocaleTimeString("ar")}
                </p>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-[#ece0d2] pt-3">
            {next && (
              <button onClick={() => onAdvance(o)} className="rounded-lg bg-[#b5502e] px-3 py-2 text-xs font-semibold text-white hover:opacity-95">
                {ADVANCE_LABEL[next] ?? "التالي"}
              </button>
            )}
            <button onClick={() => printTicket(o.id, printWidth)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4d8c8] px-3 py-2 text-xs font-semibold text-[#6a5c4e] hover:bg-[#faf6ef]">
              <Printer className="h-3.5 w-3.5" /> تذكرة المطبخ
            </button>
            <button onClick={() => openImage("receipt")} className="rounded-lg border border-[#e4d8c8] px-3 py-2 text-xs font-semibold text-[#6a5c4e] hover:bg-[#faf6ef]">إيصال العميل</button>
            <button
              onClick={sendReceipt}
              disabled={sending === "loading"}
              className="rounded-lg border border-[#cde3d4] bg-[#f0f7f2] px-3 py-2 text-xs font-semibold text-[#3c7a52] hover:bg-[#e6f1ea] disabled:opacity-60"
            >
              {sending === "loading" ? "جارٍ الإرسال…" : sending === "ok" ? "تم الإرسال ✓" : sending === "err" ? "تعذّر الإرسال" : "إرسال الإيصال للعميل"}
            </button>
            <button onClick={() => printReceipt(o)} className="rounded-lg border border-[#e4d8c8] px-3 py-2 text-xs font-semibold text-[#6a5c4e] hover:bg-[#faf6ef]">طباعة سريعة</button>
            {closable && (
              <button onClick={() => onCancel(o)} className="rounded-lg border border-[#e7c9bf] px-3 py-2 text-xs font-semibold text-[#cc3a33] hover:bg-[#fbeee9]">إلغاء الطلب</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const LATE_MS = 30 * 60 * 1000;

type Stage = { key: string; label: string; statuses: OrderStatusKey[]; tint: string };
const STAGES: Stage[] = [
  { key: "new", label: "جديدة", statuses: ["pending_confirmation", "pending_payment", "paid"], tint: "#b5502e" },
  { key: "preparing", label: "قيد التحضير", statuses: ["preparing"], tint: "#e0912e" },
  { key: "ready", label: "جاهزة", statuses: ["ready"], tint: "#3c7a52" },
  { key: "out", label: "خرجت للتوصيل", statuses: ["out_for_delivery"], tint: "#4e9466" },
];
const DONE: OrderStatusKey[] = ["delivered", "cancelled"];

function nextStatus(o: LocalOrder): OrderStatusKey | null {
  switch (o.orderStatus) {
    case "pending_confirmation":
    case "pending_payment":
    case "paid":
      return "preparing";
    case "preparing":
      return "ready";
    case "ready":
      return o.fulfillmentType === "delivery" ? "out_for_delivery" : "delivered";
    case "out_for_delivery":
      return "delivered";
    default:
      return null;
  }
}
const ADVANCE_LABEL: Record<string, string> = {
  preparing: "ابدأ التحضير",
  ready: "جاهز",
  out_for_delivery: "خرج للتوصيل",
  delivered: "تم التسليم",
};

function printReceipt(o: LocalOrder) {
  const w = window.open("", "_blank", "width=380,height=640");
  if (!w) return;
  const rows = o.items
    .map((i) => `<tr><td>${i.quantity}× ${i.name}</td><td style="text-align:left">${i.total} ${o.currency}</td></tr>`)
    .join("");
  w.document.write(
    `<html dir="rtl"><head><meta charset="utf-8"><title>طلب #${o.orderNumber}</title></head>
     <body style="font-family:Tahoma,Arial,sans-serif;padding:14px;color:#2a211b">
       <h2 style="margin:0">${o.branchName || "المطعم"}</h2>
       <p style="margin:4px 0">طلب #${o.orderNumber} — ${o.customerName}</p>
       <hr><table style="width:100%;border-collapse:collapse">${rows}</table><hr>
       <p style="font-weight:bold">الإجمالي: ${o.total} ${o.currency}</p>
       <p>${o.fulfillmentType === "delivery" ? "توصيل: " + (o.deliveryAddress || "") : "استلام من الفرع"}</p>
     </body></html>`
  );
  w.document.close();
  w.focus();
  w.print();
}

type PrintWidth = "58mm" | "80mm" | "standard";

/** Open the server-rendered kitchen-ticket PNG and trigger the device-OS print
 *  dialog (no driver code — browser/share-sheet handles the actual printer). */
function printTicket(orderId: string, width: PrintWidth) {
  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) return;
  const url = `/api/orders/${orderId}/image?kind=ticket&w=${width}`;
  w.document.write(
    `<html dir="rtl"><head><meta charset="utf-8"><title>تذكرة المطبخ</title>
     <style>@page{margin:6mm}body{margin:0}img{width:100%;display:block}</style></head>
     <body><img src="${url}" onload="window.focus();window.print();"></body></html>`
  );
  w.document.close();
}

function OrderCard({ o, onAdvance, onSelect }: { o: LocalOrder; onAdvance: (o: LocalOrder) => void; onSelect: (o: LocalOrder) => void }) {
  const next = nextStatus(o);
  const paid = o.paymentStatus === "paid";
  const late = o.createdAt < Date.now() - LATE_MS && !DONE.includes(o.orderStatus);
  const mins = Math.max(0, Math.round((Date.now() - o.createdAt) / 60000));
  return (
    <div onClick={() => onSelect(o)} className={cn("cursor-pointer rounded-xl border bg-white p-3", late ? "border-[#cc3a33]" : "border-[#ece0d2]")}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-[#2a211b]">#{o.orderNumber}</span>
        <span className="flex items-center gap-1 text-[11px] text-[#9b8b7c]">
          {o.fulfillmentType === "delivery" ? <Bike className="h-3.5 w-3.5" /> : <ShoppingBag className="h-3.5 w-3.5" />}
          <Clock className="h-3 w-3" /> {mins}د
        </span>
      </div>
      <p className="mt-0.5 truncate text-sm text-[#4a3f36]">{o.customerName}</p>
      <p className="mt-1 truncate text-xs text-[#9b8b7c]">
        {o.items.reduce((s, i) => s + i.quantity, 0)} صنف · {o.total} {o.currency}
      </p>
      <div className="mt-2 flex items-center gap-1.5">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
            paid ? "bg-[#e7f1ea] text-[#3c7a52]" : "bg-[#fbefd9] text-[#9a6c1e]"
          )}
        >
          {paid ? "مدفوع" : "دفع عند الاستلام"}
        </span>
        {late && <span className="rounded-full bg-[#f7e3df] px-2 py-0.5 text-[10px] font-semibold text-[#cc3a33]">متأخر</span>}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        {next && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAdvance(o);
            }}
            className="flex-1 rounded-lg bg-[#b5502e] px-2 py-1.5 text-xs font-semibold text-white hover:opacity-95"
          >
            {ADVANCE_LABEL[next] ?? "التالي"}
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            printReceipt(o);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#e4d8c8] text-[#6a5c4e] hover:bg-[#faf6ef]"
          aria-label="طباعة"
          title="طباعة (متصفح)"
        >
          <Printer className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function OrdersPipeline() {
  const hydrated = useHasHydrated();
  const orders = useOrderStore((s) => s.orders);
  const updateOrderStatus = useOrderStore((s) => s.updateOrderStatus);
  const cancelOrder = useOrderStore((s) => s.cancelOrder);
  const sweepExpired = usePaymentStore((s) => s.sweepExpired);
  const [showDone, setShowDone] = useState(false);
  const [filter, setFilter] = useState<"all" | "delivery" | "pickup" | "late" | "unpaid">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedOrder = selectedId ? orders.find((o) => o.id === selectedId) : null;

  // S9-5 printing: per-tenant auto-print + paper width, device-level printer flag.
  const [autoPrint, setAutoPrint] = useState(false);
  const [printWidth, setPrintWidth] = useState<PrintWidth>("standard");
  const [printerOnline, setPrinterOnline] = useState(true);
  const seenRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);

  useEffect(() => {
    sweepExpired();
  }, [sweepExpired]);

  useEffect(() => {
    setPrinterOnline(localStorage.getItem("maitreai-printer-offline") !== "1");
    fetch("/api/settings/print")
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.autoPrint === "boolean") setAutoPrint(d.autoPrint);
        if (d.printWidth) setPrintWidth(d.printWidth as PrintWidth);
      })
      .catch(() => {});
  }, []);

  function togglePrinter() {
    setPrinterOnline((v) => {
      const next = !v;
      localStorage.setItem("maitreai-printer-offline", next ? "0" : "1");
      return next;
    });
  }

  // Auto-print newly-arrived orders once (seed seen-set on first load so existing
  // orders don't print). Suppressed when the printer is marked offline.
  useEffect(() => {
    if (!hydrated) return;
    if (!seededRef.current) {
      orders.forEach((o) => seenRef.current.add(o.id));
      seededRef.current = true;
      return;
    }
    for (const o of orders) {
      if (seenRef.current.has(o.id)) continue;
      seenRef.current.add(o.id);
      if (autoPrint && printerOnline && o.orderStatus === "pending_confirmation") {
        printTicket(o.id, printWidth);
      }
    }
  }, [orders, hydrated, autoPrint, printerOnline, printWidth]);

  const advance = (o: LocalOrder) => {
    const n = nextStatus(o);
    if (!n) return;
    // Accepting a new order (→ قيد التحضير) = confirm → send the receipt to the
    // customer over WhatsApp (S9-3). No-ops gracefully in test mode / no phone.
    const isConfirm = ["pending_confirmation", "pending_payment", "paid"].includes(o.orderStatus) && n === "preparing";
    updateOrderStatus(o.id, n, "human");
    if (isConfirm) void fetch(`/api/orders/${o.id}/send-receipt`, { method: "POST" }).catch(() => {});
  };

  const matchesFilter = (o: LocalOrder) => {
    if (filter === "delivery") return o.fulfillmentType === "delivery";
    if (filter === "pickup") return o.fulfillmentType === "pickup";
    if (filter === "late") return o.createdAt < Date.now() - LATE_MS && !DONE.includes(o.orderStatus);
    if (filter === "unpaid") return o.paymentStatus !== "paid";
    return true;
  };
  const FILTERS: { k: typeof filter; label: string }[] = [
    { k: "all", label: "الكل" },
    { k: "delivery", label: "توصيل" },
    { k: "pickup", label: "استلام" },
    { k: "late", label: "متأخرة" },
    { k: "unpaid", label: "غير مدفوعة" },
  ];

  const inStage = (s: Stage) => (hydrated ? orders.filter((o) => s.statuses.includes(o.orderStatus) && matchesFilter(o)) : []);
  const done = hydrated ? orders.filter((o) => DONE.includes(o.orderStatus)) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#2a211b]">الطلبات</h1>
        <span className="text-sm text-[#9b8b7c]">{hydrated ? orders.length : 0} طلب</span>
      </div>

      {/* Printing status (S9-5 / §O #5): auto-print info, or printer-offline
          degraded banner with a manual-print reminder + a re-enable control. */}
      {autoPrint && !printerOnline ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e7c9bf] bg-[#fbeee9] px-4 py-2.5 text-sm">
          <span className="font-semibold text-[#cc3a33]">⚠ الطابعة غير متصلة — اطبع الطلبات يدوياً من زر «تذكرة المطبخ».</span>
          <button onClick={togglePrinter} className="rounded-lg border border-[#cc3a33] px-3 py-1.5 text-xs font-semibold text-[#cc3a33] hover:bg-white">
            الطابعة متصلة الآن
          </button>
        </div>
      ) : autoPrint ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#cde3d4] bg-[#f0f7f2] px-4 py-2.5 text-sm">
          <span className="font-semibold text-[#3c7a52]">🖨️ الطباعة التلقائية مفعّلة · الطابعة متصلة</span>
          <button onClick={togglePrinter} className="rounded-lg border border-[#cde3d4] px-3 py-1.5 text-xs font-semibold text-[#3c7a52] hover:bg-white">
            تعطيل (الطابعة غير متصلة)
          </button>
        </div>
      ) : null}

      {/* Filters (§R3) */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              filter === f.k ? "border-[#b5502e] bg-[#b5502e] text-white" : "border-[#e4d8c8] bg-white text-[#6a5c4e] hover:bg-[#faf6ef]"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((s) => {
          const list = inStage(s);
          return (
            <div key={s.key} className="rounded-2xl bg-[#faf6ef] p-2.5">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="flex items-center gap-2 text-sm font-bold text-[#2a211b]">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.tint }} />
                  {s.label}
                </span>
                <span className="text-xs font-semibold text-[#9b8b7c]">{list.length}</span>
              </div>
              <div className="space-y-2">
                {list.map((o) => (
                  <OrderCard key={o.id} o={o} onAdvance={advance} onSelect={(x) => setSelectedId(x.id)} />
                ))}
                {list.length === 0 && <p className="px-1 py-6 text-center text-xs text-[#c2a98f]">لا توجد طلبات</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* مكتملة (collapsed) */}
      <div className="rounded-2xl border border-[#ece0d2] bg-white">
        <button
          onClick={() => setShowDone((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-[#4a3f36]"
        >
          <span>مكتملة ({done.length})</span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", showDone && "rotate-180")} />
        </button>
        {showDone && (
          <div className="grid grid-cols-1 gap-2 border-t border-[#ece0d2] p-3 sm:grid-cols-2 lg:grid-cols-4">
            {done.map((o) => (
              <div key={o.id} className="rounded-xl border border-[#ece0d2] bg-[#faf6ef] p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#2a211b]">#{o.orderNumber}</span>
                  <span className="text-[11px] text-[#9b8b7c]">
                    {o.orderStatus === "cancelled" ? "ملغي" : "تم التسليم"}
                  </span>
                </div>
                <p className="truncate text-xs text-[#9b8b7c]">
                  {o.customerName} · {o.total} {o.currency}
                </p>
              </div>
            ))}
            {done.length === 0 && <p className="col-span-full py-4 text-center text-xs text-[#c2a98f]">لا شيء بعد</p>}
          </div>
        )}
      </div>

      {selectedOrder && (
        <OrderDrawer
          o={selectedOrder}
          printWidth={printWidth}
          onClose={() => setSelectedId(null)}
          onAdvance={(o) => advance(o)}
          onCancel={(o) => {
            if (window.confirm(`إلغاء الطلب #${o.orderNumber}؟`)) cancelOrder(o.id, "human");
          }}
        />
      )}
    </div>
  );
}
