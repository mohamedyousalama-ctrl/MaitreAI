"use client";

// ============================================================================
// MaitreAI — الطلبات (Orders) — Terracotta table + detail + order notifications.
// Reuses the existing DB-backed order store (useOrderStore: orders stream in via
// realtime; updateOrderStatus writes through to Postgres), the proven
// accept/advance handler (advance → updateOrderStatus, +send-receipt on confirm),
// and the existing print flow (printTicket → resvg image, printReceipt → browser).
// Money/totals come from the order ROW (server-computed) — never recomputed here.
// FOLD-IN: new-order notifications (chime + toast + live badge) off the same
// realtime stream, seeded on first load so existing orders never fire.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useOrderStore } from "@/lib/order-store";
import { useHasHydrated } from "@/lib/store";
import type { LocalOrder, OrderStatusKey } from "@/lib/types";
import { Printer, Search, Plus, X, Clock, MessageCircle, Bell, Volume2, VolumeX, Check } from "lucide-react";

// ---- helpers (Arabic digits + money; money is display-only, value from the row)
const AR = "٠١٢٣٤٥٦٧٨٩";
const toAr = (n: number | string) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const grp = (n: number) => { const s = String(Math.round(n)); let o = ""; for (let i = 0; i < s.length; i++) { if (i > 0 && (s.length - i) % 3 === 0) o += "٬"; o += s[i]; } return o; };
const money = (n: number) => toAr(grp(Number(n || 0)));
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const LATE_MS = 30 * 60 * 1000;
const DONE: OrderStatusKey[] = ["delivered", "cancelled"];
// Statuses an operator may cancel/reject (mirrors OrderCard lifecycleActions):
// NOT ready / out_for_delivery / delivered / already-cancelled.
const CANCELABLE: OrderStatusKey[] = ["pending_payment", "pending_confirmation", "paid", "preparing"];
const ACTIVE: OrderStatusKey[] = ["pending_confirmation", "pending_payment", "paid", "preparing", "ready", "out_for_delivery"];

function minutesAgo(ms: number): string {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 1) return "الآن";
  if (m < 60) return `${toAr(m)} د`;
  const d = new Date(ms);
  return `${toAr(d.getHours() % 12 || 12)}:${toAr(String(d.getMinutes()).padStart(2, "0"))}`;
}

// per-status pill (label + Terracotta colors + the row's right-border accent)
type Meta = { label: string; dot: string; bg: string; border: string; fg: string; rail: string };
function statusMeta(o: LocalOrder): Meta {
  switch (o.orderStatus) {
    case "pending_payment": return { label: "بانتظار الدفع", dot: "#BE5238", bg: "#FBEAE5", border: "#F1D2C8", fg: "#A8472F", rail: "#BE5238" };
    case "preparing": return { label: "قيد التحضير", dot: "#C5871F", bg: "#FBF1DD", border: "#EFDDB6", fg: "#946312", rail: "#C5871F" };
    case "ready": return { label: "جاهز", dot: "#3E807A", bg: "#E1EEEC", border: "#C5E0DC", fg: "#2C625D", rail: "#3E807A" };
    case "out_for_delivery": return { label: "خرج للتوصيل", dot: "#5E6FA0", bg: "#E7EAF2", border: "#D2D8E8", fg: "#475584", rail: "#5E6FA0" };
    case "delivered": return { label: "✓ مكتمل", dot: "#9A8E7E", bg: "#EFEAE0", border: "#E2D8C7", fg: "#7C7163", rail: "#C9BFAE" };
    case "cancelled": return { label: "✕ ملغي", dot: "#9A8E7E", bg: "#F4EEE9", border: "#E4D9CD", fg: "#9A8E7E", rail: "#C9BFAE" };
    default: return { label: "جديد", dot: "#5C8A6B", bg: "#EAF1E9", border: "#CFE2D3", fg: "#436B50", rail: "#5C8A6B" }; // pending_confirmation / paid
  }
}

// filter buckets → status sets (reuses the home/kanban mapping; no new statuses)
const FILTERS: { k: string; label: string; statuses: OrderStatusKey[] | null }[] = [
  { k: "all", label: "الكل", statuses: null },
  { k: "new", label: "جديد", statuses: ["pending_confirmation", "pending_payment", "paid"] },
  { k: "preparing", label: "قيد التحضير", statuses: ["preparing"] },
  { k: "ready", label: "جاهز", statuses: ["ready"] },
  { k: "out", label: "خرج للتوصيل", statuses: ["out_for_delivery"] },
  { k: "done", label: "مكتمل", statuses: ["delivered"] },
  { k: "cancelled", label: "ملغي", statuses: ["cancelled"] },
];

function nextStatus(o: LocalOrder): OrderStatusKey | null {
  switch (o.orderStatus) {
    case "pending_confirmation":
    case "pending_payment":
    case "paid": return "preparing";
    case "preparing": return "ready";
    case "ready": return o.fulfillmentType === "delivery" ? "out_for_delivery" : "delivered";
    case "out_for_delivery": return "delivered";
    default: return null;
  }
}
const ADVANCE_LABEL: Record<string, string> = {
  preparing: "ابدأ التحضير", ready: "تجهيز كجاهز", out_for_delivery: "خرج للتوصيل", delivered: "تم التسليم",
};

type PrintWidth = "58mm" | "80mm" | "standard";
function printTicket(orderId: string, width: PrintWidth) {
  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) return;
  const url = `/api/orders/${orderId}/image?kind=ticket&w=${width}`;
  w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><title>تذكرة المطبخ</title><style>@page{margin:6mm}body{margin:0}img{width:100%;display:block}</style></head><body><img src="${url}" onload="window.focus();window.print();"></body></html>`);
  w.document.close();
}

const AVATAR = ["#2563eb", "#f97316", "#059669", "#9333ea", "#06b6d4", "#BE5238", "#C5871F"];
const avatarColor = (s: string) => AVATAR[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR.length];

// short two-tone chime via Web Audio (no asset / no dependency)
function playChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [[880, 0], [1320, 0.12]].forEach(([f, t]) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.frequency.value = f as number; osc.type = "sine";
      gain.gain.setValueAtTime(0.0001, now + (t as number));
      gain.gain.exponentialRampToValueAtTime(0.16, now + (t as number) + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (t as number) + 0.18);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now + (t as number)); osc.stop(now + (t as number) + 0.2);
    });
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch { /* autoplay blocked until a gesture — silent */ }
}

export default function OrdersPage() {
  const hydrated = useHasHydrated();
  const orders = useOrderStore((s) => s.orders);
  const updateOrderStatus = useOrderStore((s) => s.updateOrderStatus);
  const cancelOrder = useOrderStore((s) => s.cancelOrder);

  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [muted, setMuted] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; orderNumber: string }[]>([]);
  const [unseen, setUnseen] = useState(0);
  const [printWidth, setPrintWidth] = useState<PrintWidth>("standard");
  const [printerOnline, setPrinterOnline] = useState(true);
  const [autoPrint, setAutoPrint] = useState(false);

  const seenRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);
  const lastChimeRef = useRef(0);
  const mutedRef = useRef(false);

  useEffect(() => {
    const m = localStorage.getItem("maitreai-order-sound") === "off"; setMuted(m); mutedRef.current = m;
    setPrinterOnline(localStorage.getItem("maitreai-printer-offline") !== "1");
    fetch("/api/settings/print").then((r) => r.json()).then((d) => {
      if (typeof d.autoPrint === "boolean") setAutoPrint(d.autoPrint);
      if (d.printWidth) setPrintWidth(d.printWidth as PrintWidth);
    }).catch(() => {});
  }, []);
  const toggleMute = () => { setMuted((v) => { const n = !v; mutedRef.current = n; localStorage.setItem("maitreai-order-sound", n ? "off" : "on"); return n; }); };

  // New-order detection off the existing realtime stream. Seed the seen-set on
  // first load so pre-existing orders never fire; afterwards, a genuinely new
  // inbound order (agent/web, just created) → chime + toast + badge. Status
  // changes the operator makes don't fire (the id is already seen).
  useEffect(() => {
    if (!hydrated) return;
    if (!seededRef.current) { orders.forEach((o) => seenRef.current.add(o.id)); seededRef.current = true; return; }
    let fired = false;
    for (const o of orders) {
      if (seenRef.current.has(o.id)) continue;
      seenRef.current.add(o.id);
      const fresh = Date.now() - o.createdAt < 3 * 60 * 1000; // ignore backfill/reorders
      const inbound = o.source === "whatsapp" || o.source === "web";
      if (!fresh || !inbound) continue;
      setToasts((t) => [...t, { id: o.id, orderNumber: o.orderNumber }].slice(-4));
      setUnseen((n) => n + 1);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== o.id)), 6000);
      if (!fired && !mutedRef.current && Date.now() - lastChimeRef.current > 2000) { playChime(); lastChimeRef.current = Date.now(); fired = true; }
      if (autoPrint && printerOnline && o.orderStatus === "pending_confirmation") printTicket(o.id, printWidth);
    }
  }, [orders, hydrated, autoPrint, printerOnline, printWidth]);

  // ---- real derived data ----------------------------------------------------
  const sorted = useMemo(() => (hydrated ? [...orders].sort((a, b) => b.createdAt - a.createdAt) : []), [orders, hydrated]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: sorted.length };
    for (const f of FILTERS) if (f.statuses) c[f.k] = sorted.filter((o) => f.statuses!.includes(o.orderStatus)).length;
    return c;
  }, [sorted]);
  const since = startOfToday();
  const todayCount = sorted.filter((o) => o.createdAt >= since).length;
  const activeCount = sorted.filter((o) => ACTIVE.includes(o.orderStatus)).length;

  const list = useMemo(() => {
    const f = FILTERS.find((x) => x.k === filter);
    const q = search.trim();
    return sorted.filter((o) => {
      if (f?.statuses && !f.statuses.includes(o.orderStatus)) return false;
      if (q && !(`${o.orderNumber}`.includes(q) || o.customerName.includes(q))) return false;
      return true;
    });
  }, [sorted, filter, search]);

  const selected = sorted.find((o) => o.id === selectedId) ?? null;

  const advance = (o: LocalOrder) => {
    const n = nextStatus(o);
    if (!n) return;
    const isConfirm = ["pending_confirmation", "pending_payment", "paid"].includes(o.orderStatus) && n === "preparing";
    updateOrderStatus(o.id, n, "human"); // DB write-through (existing handler)
    if (isConfirm) void fetch(`/api/orders/${o.id}/send-receipt`, { method: "POST" }).catch(() => {});
  };
  const openOrder = (o: LocalOrder) => { setSelectedId(o.id); setUnseen(0); };
  // Explicit operator cancel/reject → existing DB-backed store action (status →
  // "cancelled", refunds if paid, adds a timeline event). Confirmed in OrderDetail.
  const cancel = (o: LocalOrder) => cancelOrder(o.id, "human");

  const GRID = "grid grid-cols-[68px_1.4fr_1fr_1.1fr_0.8fr_0.7fr] gap-3 items-center";

  return (
    <div dir="rtl" className="mx-auto max-w-[1320px]">
      {/* header */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-bold tracking-tight text-[#2A2019]">الطلبات</h1>
            {unseen > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#BE5238] px-2 py-0.5 text-[11px] font-bold text-white"><Bell className="h-3 w-3" />{toAr(unseen)} جديد</span>
            )}
          </div>
          <p className="mt-1 text-[12.5px] text-[#9A8E7E]">{toAr(todayCount)} طلب اليوم · {toAr(activeCount)} قيد التنفيذ</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleMute} title={muted ? "تشغيل صوت الطلبات" : "كتم صوت الطلبات"} className="flex h-9 w-9 items-center justify-center rounded-[11px] border border-[#EBE2D3] bg-white text-[#7C7163]">
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <div className="flex items-center gap-2 rounded-[11px] border border-[#EBE2D3] bg-white px-3 py-2">
            <Search className="h-4 w-4 text-[#A99D8D]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث برقم الطلب أو العميل" className="w-36 bg-transparent text-[12.5px] text-[#2A2019] outline-none placeholder:text-[#AEA391] md:w-48" />
          </div>
          <span title="إنشاء طلب يدوي قريبًا" className="flex cursor-not-allowed items-center gap-1.5 rounded-[11px] bg-[#BE5238]/55 px-4 py-2 text-[12.5px] font-bold text-white"><Plus className="h-4 w-4" /> طلب جديد <span className="rounded bg-white/25 px-1 text-[10px]">قريبًا</span></span>
        </div>
      </div>

      <div className="flex gap-4">
        {/* list */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-[18px] border border-[#ECE3D5] bg-white" style={{ boxShadow: "0 14px 30px -22px rgba(50,32,20,.25)" }}>
          {/* filter chips */}
          <div className="flex flex-wrap gap-1.5 border-b border-[#ECE3D5] p-3.5">
            {FILTERS.map((f) => {
              const active = filter === f.k;
              const n = f.k === "all" ? counts.all : counts[f.k] ?? 0;
              return (
                <button key={f.k} onClick={() => setFilter(f.k)}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition"
                  style={active ? { background: "#BE5238", color: "#fff" } : { background: "#fff", border: "1px solid #EBE2D3", color: "#514538" }}>
                  {f.label}<span className="text-[10.5px]" style={{ color: active ? "rgba(255,255,255,.85)" : "#9A8E7E" }}>{toAr(n)}</span>
                </button>
              );
            })}
          </div>

          {/* table head (lg+) */}
          <div className={`${GRID} hidden border-b border-[#ECE3D5] px-5 py-2.5 text-[11px] font-semibold text-[#9A8E7E] lg:grid`}>
            <span>الطلب</span><span>العميل</span><span>الحالة</span><span>التفاصيل</span><span>الإجمالي</span><span>الوقت</span>
          </div>

          {/* rows / cards */}
          <div className="max-h-[68vh] overflow-y-auto">
            {list.length === 0 && <div className="px-5 py-16 text-center text-[13px] text-[#A99D8D]">لا طلبات في هذا الفلتر.</div>}

            {/* lg+ table rows */}
            {list.map((o) => {
              const m = statusMeta(o);
              const sel = o.id === selectedId;
              const done = DONE.includes(o.orderStatus);
              return (
                <button key={o.id} onClick={() => openOrder(o)}
                  className={`${GRID} hidden w-full border-b border-[#F2EBE0] px-5 py-3 text-right transition hover:bg-[#FBF8F3] lg:grid`}
                  style={sel ? { background: "#FBF1ED", borderRight: "3px solid #BE5238" } : done ? { opacity: 0.72 } : {}}>
                  <span className="text-[13.5px] font-bold" style={{ color: sel ? "#BE5238" : done ? "#7C7163" : "#2A2019" }}>#{toAr(o.orderNumber)}</span>
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] text-[13px] font-bold text-white" style={{ background: avatarColor(o.customerName) }}>{o.customerName.trim().charAt(0) || "ع"}</span>
                    <span className="min-w-0 leading-tight"><span className="block truncate text-[13px] font-semibold text-[#2A2019]">{o.customerName}</span><span className="block text-[10.5px] text-[#9A8E7E]">{o.fulfillmentType === "delivery" ? "توصيل" : "استلام"}</span></span>
                  </span>
                  <span><StatusPill m={m} /></span>
                  <span className="truncate text-[12px] text-[#6B6055]">{toAr(o.items.length)} أصناف</span>
                  <span className="text-[13.5px] font-bold text-[#2A2019]">{money(o.total)} <span className="text-[10px] font-medium text-[#A99D8D]">{o.currency}</span></span>
                  <Timecell o={o} />
                </button>
              );
            })}

            {/* mobile cards */}
            {list.map((o) => {
              const m = statusMeta(o);
              return (
                <button key={`m-${o.id}`} onClick={() => openOrder(o)} className="block w-full border-b border-[#F2EBE0] px-3.5 py-3 text-right lg:hidden" style={{ borderRight: `3px solid ${m.rail}` }}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] text-[14px] font-bold text-white" style={{ background: avatarColor(o.customerName) }}>{o.customerName.trim().charAt(0) || "ع"}</span>
                      <span className="min-w-0 leading-tight"><span className="block truncate text-[14px] font-bold text-[#2A2019]">{o.customerName}</span><span className="block text-[11px] text-[#9A8E7E]">#{toAr(o.orderNumber)} · {o.fulfillmentType === "delivery" ? "توصيل" : "استلام"}</span></span>
                    </span>
                    <StatusPill m={m} />
                  </div>
                  <div className="flex items-center justify-between border-t border-dashed border-[#EBE2D3] pt-2">
                    <span className="text-[12px] text-[#6B6055]">{toAr(o.items.length)} أصناف · {minutesAgo(o.createdAt)}</span>
                    <span className="text-[15px] font-bold text-[#BE5238]">{money(o.total)} {o.currency}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* detail panel (xl side column) */}
        {selected && (
          <div className="hidden w-[332px] flex-none overflow-hidden rounded-[18px] border border-[#ECE3D5] bg-white xl:block" style={{ boxShadow: "0 14px 30px -22px rgba(50,32,20,.25)" }}>
            <OrderDetail key={selected.id} o={selected} onClose={() => setSelectedId(null)} onAdvance={advance} onCancel={cancel} printWidth={printWidth} />
          </div>
        )}
      </div>

      {/* detail overlay (< xl) */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center xl:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedId(null)} />
          <div className="relative max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl">
            <OrderDetail key={selected.id} o={selected} onClose={() => setSelectedId(null)} onAdvance={advance} onCancel={cancel} printWidth={printWidth} />
          </div>
        </div>
      )}

      {/* new-order toasts */}
      <div className="fixed bottom-5 left-5 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-[14px] border border-[#EFDDB6] bg-white px-4 py-3 shadow-[0_18px_40px_-18px_rgba(50,32,20,.5)]">
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#BE5238] text-white"><Bell className="h-4 w-4" /></span>
            <span className="text-[13px] font-bold text-[#2A2019]">طلب جديد · #{toAr(t.orderNumber)}</span>
            <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="mr-1 text-[#A99D8D] hover:text-[#BE5238]"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- pieces ----------------------------------------------------------------
function StatusPill({ m }: { m: Meta }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[11px] font-bold" style={{ background: m.bg, border: `1px solid ${m.border}`, color: m.fg }}>
      {!m.label.startsWith("✓") && !m.label.startsWith("✕") && <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.dot }} />}
      {m.label}
    </span>
  );
}
function Timecell({ o }: { o: LocalOrder }) {
  const late = o.createdAt < Date.now() - LATE_MS && !DONE.includes(o.orderStatus);
  const active = ACTIVE.includes(o.orderStatus);
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: late ? "#BE5238" : active ? "#946312" : "#A99D8D" }}>
      {active && <Clock className="h-3 w-3" />}{minutesAgo(o.createdAt)}
    </span>
  );
}

const RANK: Record<string, number> = { pending_confirmation: 0, pending_payment: 0, paid: 1, preparing: 2, ready: 3, out_for_delivery: 4, delivered: 5 };
function OrderDetail({ o, onClose, onAdvance, onCancel, printWidth }: { o: LocalOrder; onClose: () => void; onAdvance: (o: LocalOrder) => void; onCancel: (o: LocalOrder) => void; printWidth: PrintWidth }) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const m = statusMeta(o);
  const n = nextStatus(o);
  const rank = RANK[o.orderStatus] ?? 0;
  const cancelled = o.orderStatus === "cancelled";
  // truthful flow: received time = createdAt; current step shows live elapsed;
  // done/future steps carry no fabricated timestamp (truth rule).
  const steps: { key: string; label: string; rank: number }[] = [
    { key: "received", label: "تم استلام الطلب", rank: 0 },
    { key: "paid", label: "تم الدفع", rank: 1 },
    { key: "preparing", label: "قيد التحضير", rank: 2 },
    { key: "ready", label: "جاهز", rank: 3 },
    ...(o.fulfillmentType === "delivery" ? [{ key: "out", label: "خرج للتوصيل", rank: 4 }] : []),
    { key: "delivered", label: "تم التسليم", rank: 5 },
  ];

  return (
    <>
      <div className="flex items-start justify-between border-b border-[#F0E9DD] p-4">
        <div>
          <div className="flex items-center gap-2.5"><span className="text-[19px] font-bold text-[#2A2019]">#{toAr(o.orderNumber)}</span><StatusPill m={m} /></div>
          <p className="mt-1 text-[12px] text-[#9A8E7E]">{o.source === "whatsapp" ? "واتساب" : "ويب"} · {o.fulfillmentType === "delivery" ? "توصيل" : "استلام"}{o.branchName ? ` · ${o.branchName}` : ""} · {minutesAgo(o.createdAt)}</p>
        </div>
        <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#EBE2D3] text-[#9A8E7E]"><X className="h-4 w-4" /></button>
      </div>

      {/* status flow */}
      <div className="border-b border-[#F0E9DD] p-4">
        <div className="mb-3 text-[11.5px] font-bold text-[#2A2019]">مسار الطلب</div>
        {cancelled ? (
          <div className="rounded-[11px] bg-[#F4EEE9] px-3 py-2 text-[12px] font-semibold text-[#9A8E7E]">✕ تم إلغاء الطلب</div>
        ) : (
          <div className="flex flex-col">
            {steps.map((s, i) => {
              const done = rank > s.rank;
              const current = rank === s.rank;
              const paidOk = s.key === "paid" ? (o.paymentStatus === "paid" || rank > 1) : done;
              const isDone = s.key === "paid" ? paidOk : done;
              return (
                <div key={s.key}>
                  <div className="flex items-center gap-2.5" style={current ? {} : isDone ? {} : { opacity: 0.5 }}>
                    <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full" style={isDone ? { background: "#5C8A6B" } : current ? { background: "#C5871F", boxShadow: "0 0 0 4px #FBF1DD" } : { border: "2px solid #D8CDBC" }}>
                      {(isDone || current) && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                    </span>
                    <span className="text-[12.5px]" style={{ fontWeight: current || isDone ? 700 : 500, color: current ? "#946312" : isDone ? "#2A2019" : "#9A8E7E" }}>{current ? `${s.label} الآن` : s.label}</span>
                    <span className="mr-auto text-[10.5px] text-[#A99D8D]">{s.key === "received" ? minutesAgo(o.createdAt) : current ? minutesAgo(o.createdAt) : ""}</span>
                  </div>
                  {i < steps.length - 1 && <div className="my-0.5 mr-[11px] h-3 w-0.5" style={{ background: rank > s.rank ? "#5C8A6B" : current ? "#C5871F" : "#ECE3D5" }} />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* items — money from the order row, never recomputed */}
      <div className="border-b border-[#F0E9DD] p-4">
        <div className="mb-2.5 text-[11.5px] font-bold text-[#2A2019]">الأصناف</div>
        <div className="flex flex-col gap-2">
          {o.items.map((it, i) => (
            <div key={i} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold text-[#2A2019]">{it.name} ×{toAr(it.quantity)}</div>
                {(it.variant || (it.choices?.length ?? 0) > 0 || (it.modifiers?.length ?? 0) > 0) && (
                  <div className="mt-0.5 text-[10.5px] text-[#946312]">{[it.variant, ...(it.choices ?? []), ...(it.modifiers ?? [])].filter(Boolean).join(" · ")}</div>
                )}
              </div>
              <span className="text-[12.5px] font-semibold text-[#2A2019]">{money(it.total)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-dashed border-[#EBE2D3] pt-2.5">
            <span className="text-[13px] font-bold text-[#2A2019]">الإجمالي</span>
            <span className="text-[13px] font-bold text-[#BE5238]">{money(o.total)} {o.currency}</span>
          </div>
        </div>
      </div>

      {/* customer note */}
      {o.notes && (
        <div className="border-b border-[#F0E9DD] p-4">
          <div className="rounded-[11px] border border-[#EFDDB6] bg-[#FBF1DD] px-3 py-2.5">
            <div className="mb-1 text-[10.5px] font-bold text-[#946312]">ملاحظة العميل</div>
            <span className="text-[11.5px] text-[#6B5A33]">{o.notes}</span>
          </div>
        </div>
      )}

      {/* actions */}
      <div className="p-4">
        {n ? (
          <button onClick={() => onAdvance(o)} className="mb-2.5 w-full rounded-[11px] bg-[#BE5238] py-2.5 text-[13px] font-bold text-white shadow-[0_8px_18px_-8px_rgba(190,82,56,.5)] transition hover:bg-[#A8472F]">{ADVANCE_LABEL[n] ?? "تقدّم"}</button>
        ) : (
          <div className="mb-2.5 w-full rounded-[11px] bg-[#EFEAE0] py-2.5 text-center text-[13px] font-semibold text-[#9A8E7E]">{o.orderStatus === "cancelled" ? "ملغي" : "مكتمل"}</div>
        )}
        <div className="flex gap-2.5">
          <button onClick={() => printTicket(o.id, printWidth)} className="flex flex-1 items-center justify-center gap-1.5 rounded-[11px] border border-[#EBE2D3] bg-white py-2.5 text-[12.5px] font-semibold text-[#514538] transition hover:border-[#E0C4B6]"><Printer className="h-4 w-4" /> طباعة</button>
          {o.conversationId ? (
            <Link href={`/conversations?c=${o.conversationId}`} className="flex flex-1 items-center justify-center gap-1.5 rounded-[11px] border border-[#EBE2D3] bg-white py-2.5 text-[12.5px] font-semibold text-[#514538] transition hover:border-[#E0C4B6]"><MessageCircle className="h-4 w-4" /> فتح المحادثة</Link>
          ) : (
            <span className="flex flex-1 items-center justify-center gap-1.5 rounded-[11px] border border-[#EBE2D3] bg-[#F7F2EA] py-2.5 text-[12.5px] font-semibold text-[#A99D8D]">فتح المحادثة <span className="rounded bg-white px-1 text-[9px]">قريبًا</span></span>
          )}
        </div>

        {/* cancel/reject — operator-only, confirmed (no single-tap void). Calls the
            existing DB-backed cancelOrder; panel flips to «✕ تم إلغاء الطلب» via the
            realtime store. Hidden once delivered/cancelled. */}
        {CANCELABLE.includes(o.orderStatus) && (
          confirmCancel ? (
            <div className="mt-2.5 flex items-center gap-2 rounded-[11px] border border-[#E4D9CD] bg-[#F7F2EA] p-2.5">
              <span className="flex-1 text-[12px] font-semibold text-[#8A6A2E]">إلغاء الطلب؟ لا يمكن التراجع.</span>
              <button onClick={() => { onCancel(o); setConfirmCancel(false); }} className="rounded-[9px] bg-[#BE5238] px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#A8472F]">تأكيد الإلغاء</button>
              <button onClick={() => setConfirmCancel(false)} className="rounded-[9px] border border-[#EBE2D3] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#7C7163]">تراجع</button>
            </div>
          ) : (
            <button onClick={() => setConfirmCancel(true)} className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-[11px] border border-[#E6CFC8] bg-white py-2.5 text-[12.5px] font-semibold text-[#A8472F] transition hover:bg-[#FBEAE5]"><X className="h-4 w-4" /> إلغاء الطلب</button>
          )
        )}
      </div>
    </>
  );
}
