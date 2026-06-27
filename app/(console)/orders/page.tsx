"use client";

// ============================================================================
// Kivo — الطلبات (Orders). SPEC 02. First real-data page; sets the pattern.
//
// Real per-tenant data via the EXISTING DB-backed order store (useOrderStore:
// realtime stream; updateOrderStatus writes through to Postgres + fires the
// already-wired COD capture on `delivered`). Money/totals come from the order
// ROW only — never recomputed in the UI. Print is wired to the EXISTING
// /api/orders/[id]/image endpoint. Truth-states: COD live, wallet/instapay/card
// coming-soon. Avg-completion is computed live from real order timestamps.
//
// NOTE (flagged for review): the pipeline + status pills use the REAL
// order_status lifecycle the repo actually advances through
// (pending_confirmation → paid → preparing → ready → out_for_delivery →
// delivered, + cancelled) — these map 1:1 to the mockup's five columns. See PR
// notes re: the earlier "no preparing/ready" guidance, which the repo contradicts.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, MessageCircle, X } from "lucide-react";
import { useOrderStore } from "@/lib/order-store";
import { useConversationStore } from "@/lib/conversation-store";
import { useHasHydrated } from "@/lib/store";
import { CountUp, useRiseIn } from "@/components/kivo";
import { useConsoleUi } from "@/components/console/console-ui-store";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";
import type { LocalOrder, OrderStatusKey } from "@/lib/types";

// ── helpers (Arabic digits + money; money is display-only, value from the row) ─
const AR = "٠١٢٣٤٥٦٧٨٩";
const toAr = (n: number | string) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const grp = (n: number) => {
  const s = String(Math.round(n));
  let o = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) o += "٬";
    o += s[i];
  }
  return o;
};
const money = (n: number) => toAr(grp(Number(n || 0)));
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const LATE_MS = 30 * 60 * 1000;
const ACTIVE: OrderStatusKey[] = ["pending_confirmation", "pending_payment", "paid", "preparing", "ready", "out_for_delivery"];
const DONE: OrderStatusKey[] = ["delivered", "cancelled"];

function minutesAgo(ms: number): string {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 1) return "الآن";
  if (m < 60) return `${toAr(m)} د`;
  const d = new Date(ms);
  return `${toAr(d.getHours() % 12 || 12)}:${toAr(String(d.getMinutes()).padStart(2, "0"))}`;
}

type SMeta = { label: string; dot: string; bg: string; fg: string };
function statusMeta(s: OrderStatusKey): SMeta {
  switch (s) {
    case "pending_confirmation": return { label: "جديد", dot: "var(--kv-primary)", bg: "rgba(14,159,110,.12)", fg: "#0a8a5f" };
    case "pending_payment": return { label: "بانتظار الدفع", dot: "var(--kv-amber)", bg: "rgba(201,138,31,.16)", fg: "#9a6a14" };
    case "paid": return { label: "مؤكد", dot: "var(--kv-primary)", bg: "rgba(14,159,110,.12)", fg: "#0a8a5f" };
    case "preparing": return { label: "بيتجهّز", dot: "var(--kv-amber)", bg: "rgba(201,138,31,.16)", fg: "#9a6a14" };
    case "ready": return { label: "جاهز", dot: "var(--kv-ready)", bg: "rgba(43,143,181,.14)", fg: "#1d6f8e" };
    case "out_for_delivery": return { label: "خرج للتوصيل", dot: "var(--kv-delivery)", bg: "rgba(124,92,208,.14)", fg: "#6243b0" };
    case "delivered": return { label: "تمّ", dot: "#94a3b8", bg: "rgba(100,116,139,.14)", fg: "#51637a" };
    case "cancelled": return { label: "ملغي", dot: "var(--kv-red)", bg: "rgba(192,73,47,.12)", fg: "#c0492f" };
    default: return { label: "مسودة", dot: "#94a3b8", bg: "rgba(100,116,139,.14)", fg: "#51637a" };
  }
}

// Pipeline columns mapped to the REAL statuses (1:1 with the mockup's five).
const PIPE: { key: string; label: string; dot: string; statuses: OrderStatusKey[]; todayOnly?: boolean }[] = [
  { key: "new", label: "جديد", dot: "var(--kv-primary)", statuses: ["pending_confirmation", "pending_payment", "paid"] },
  { key: "preparing", label: "بيتجهّز", dot: "var(--kv-amber)", statuses: ["preparing"] },
  { key: "ready", label: "جاهز", dot: "var(--kv-ready)", statuses: ["ready"] },
  { key: "out", label: "خرج للتوصيل", dot: "var(--kv-delivery)", statuses: ["out_for_delivery"] },
  { key: "done", label: "تمّ النهارده", dot: "#94a3b8", statuses: ["delivered"], todayOnly: true },
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
  preparing: "أكّد وابدأ التحضير", ready: "علّم كجاهز", out_for_delivery: "خرج للتوصيل", delivered: "تم التسليم",
};

// Print → EXISTING wired endpoint (kitchen ticket PNG), opened for browser print.
function printTicket(orderId: string) {
  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) return;
  const url = `/api/orders/${orderId}/image?kind=ticket&w=80mm`;
  w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><title>تذكرة المطبخ</title><style>@page{margin:6mm}body{margin:0}img{width:100%;display:block}</style></head><body><img src="${url}" onload="window.focus();window.print();"></body></html>`);
  w.document.close();
}

// delivered timestamp for completion math: prefer the delivered event, else updatedAt.
function deliveredAt(o: LocalOrder): number {
  const ev = [...o.events].reverse().find((e) => e.type === "status" && e.label.includes("تسليم"));
  return ev ? ev.timestamp : o.updatedAt;
}

export default function OrdersPage() {
  const hydrated = useHasHydrated();
  const orders = useOrderStore((s) => s.orders);
  const updateOrderStatus = useOrderStore((s) => s.updateOrderStatus);
  const conversations = useConversationStore((s) => s.conversations);

  const query = useConsoleUi((s) => s.query);
  const dateScope = useConsoleUi((s) => s.dateScope);

  const [tab, setTab] = useState<"all" | "active" | "late">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // deeplink: /orders?o=<id> pre-selects that order (from Conversations/Customers)
  const deepRef = useRef(false);
  const deepId = useRef<string | null>(null);

  const head = useRiseIn(0);
  const pipe = useRiseIn(1);
  const grid = useRiseIn(2);

  const escalatedConvIds = useMemo(
    () => new Set(conversations.filter((c) => c.owner === "human" || c.status === "يحتاج تدخل موظف" || c.status === "تم التحويل لموظف").map((c) => c.id)),
    [conversations]
  );
  const isEscalated = (o: LocalOrder) => !!(o.conversationId && escalatedConvIds.has(o.conversationId));

  const since = startOfToday();
  const inScope = (o: LocalOrder) => dateScope === "all" || o.createdAt >= since;

  const scoped = useMemo(
    () => (hydrated ? [...orders].filter(inScope).sort((a, b) => b.createdAt - a.createdAt) : []),
    [orders, hydrated, dateScope] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── header stats (real) ──
  const activeCount = scoped.filter((o) => ACTIVE.includes(o.orderStatus)).length;
  const needHuman = scoped.filter((o) => isEscalated(o) && ACTIVE.includes(o.orderStatus)).length;
  const doneToday = orders.filter((o) => o.orderStatus === "delivered" && deliveredAt(o) >= since).length;
  const avgMin = useMemo(() => {
    const done = scoped.filter((o) => o.orderStatus === "delivered");
    const durs = done.map((o) => (deliveredAt(o) - o.createdAt) / 60000).filter((m) => m > 0 && m < 24 * 60);
    if (!durs.length) return null;
    return Math.round(durs.reduce((a, b) => a + b, 0) / durs.length);
  }, [scoped]);

  // ── pipeline counts (real) ──
  const pipeCounts = PIPE.map((p) => ({
    ...p,
    n: scoped.filter((o) => p.statuses.includes(o.orderStatus) && (!p.todayOnly || deliveredAt(o) >= since)).length,
  }));

  // ── daily payments summary ──
  // COD MONEY is NOT recomputed here: it's read from the EXISTING codDailySummary()
  // via GET /api/cod/ledger — the same source the /cod ledger page uses — so the
  // orders-page figure and the ledger can never drift. The per-order paymentMethod
  // field (newly surfaced from orders.payment_method) is used ONLY for the method
  // counts and the Vodafone Cash amount (no COD-ledger equivalent exists for VF).
  const [codSummary, setCodSummary] = useState<{ expectedToday: number; collectedToday: number; outstanding: number } | null>(null);
  const [codLoaded, setCodLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/cod/ledger", { cache: "no-store" });
        if (r.ok) { const j = await r.json(); if (alive && j?.summary) setCodSummary(j.summary); }
      } catch { /* flag off / not configured → gathering state */ }
      finally { if (alive) setCodLoaded(true); }
    })();
    return () => { alive = false; };
  }, []);

  // Today's orders (count + value + method split) — real, from the loaded store
  // (cancelled excluded). Method split uses the new per-order paymentMethod field.
  const todayOrders = useMemo(
    () => (hydrated ? orders.filter((o) => o.createdAt >= since && o.orderStatus !== "cancelled") : []),
    [orders, hydrated] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const todayCount = todayOrders.length;
  const todayValue = todayOrders.reduce((s, o) => s + Number(o.total || 0), 0);
  const dayCurrency = todayOrders[0]?.currency ?? "ج.م";
  const codCount = todayOrders.filter((o) => o.paymentMethod === "cod").length;
  const vfOrders = todayOrders.filter((o) => o.paymentMethod === "vodafone_cash");
  const vfCount = vfOrders.length;
  const vfAmount = vfOrders.reduce((s, o) => s + Number(o.total || 0), 0);
  const unspecifiedCount = todayOrders.filter((o) => o.paymentMethod !== "cod" && o.paymentMethod !== "vodafone_cash").length;

  // ── table list (filter + search) ──
  const list = useMemo(() => {
    const q = query.trim();
    return scoped.filter((o) => {
      if (tab === "active" && !ACTIVE.includes(o.orderStatus)) return false;
      if (tab === "late" && !(ACTIVE.includes(o.orderStatus) && o.createdAt < Date.now() - LATE_MS)) return false;
      if (q && !(`${o.orderNumber}`.includes(q) || o.customerName.includes(q))) return false;
      return true;
    });
  }, [scoped, tab, query]);

  // deeplink: apply ?o=<id> once (overrides the auto-first selection below).
  useEffect(() => {
    if (deepRef.current || !hydrated) return;
    const id = new URLSearchParams(window.location.search).get("o");
    if (id && orders.some((o) => o.id === id)) {
      deepId.current = id;
      setSelectedId(id);
    }
    deepRef.current = true;
  }, [hydrated, orders]);

  // auto-select first row so the drawer always has context (but never clobber a
  // valid deeplinked order that's merely filtered out of the current view).
  useEffect(() => {
    // don't auto-pick the first row while a deeplink owns the selection (else the
    // race between this and the deeplink effect clobbers ?o=).
    if (!selectedId && !deepId.current && list.length) setSelectedId(list[0].id);
    if (selectedId && !list.some((o) => o.id === selectedId) && selectedId !== deepId.current) {
      setSelectedId(list[0]?.id ?? null);
    }
  }, [list, selectedId]);

  // fall back to the full order set so a deeplinked order opens in the drawer
  // even when it's outside the current date scope / tab filter.
  const selected = scoped.find((o) => o.id === selectedId) ?? orders.find((o) => o.id === selectedId) ?? null;
  // Guard: a delivery order must have an assigned driver before it can be marked
  // "delivered", else COD capture attributes to no driver (cod_collections.driver_id
  // = null → «غير معيّن», breaking per-driver reconciliation). UI-only guard — it
  // blocks the advance and points to the existing «تعيين مندوب» control; it never
  // touches the capture/money path. Only blocks when a delivery row EXISTS without
  // a driver (historical orders with no delivery row aren't strandable here).
  const [noDriverBlock, setNoDriverBlock] = useState<string | null>(null);
  const advance = async (o: LocalOrder) => {
    const n = nextStatus(o);
    if (!n) return;
    if (ENABLE_DELIVERY_TRACKING && n === "delivered" && o.fulfillmentType === "delivery") {
      try {
        const res = await fetch("/api/deliveries", { cache: "no-store" });
        if (res.ok) {
          const rows = ((await res.json()).deliveries ?? []) as Array<{ driver_id: string | null; orders: { order_number: string | null } | null }>;
          const row = rows.find((x) => String(x.orders?.order_number ?? "") === String(o.orderNumber));
          if (row && !row.driver_id) { setNoDriverBlock(o.id); return; } // delivery row exists, unassigned → block
        }
      } catch { /* fail-open on network error — never strand the operator */ }
    }
    setNoDriverBlock(null);
    const isConfirm = ["pending_confirmation", "pending_payment", "paid"].includes(o.orderStatus) && n === "preparing";
    updateOrderStatus(o.id, n, "human"); // existing handler → DB write-through (+COD capture on delivered)
    if (isConfirm) void fetch(`/api/orders/${o.id}/send-receipt`, { method: "POST" }).catch(() => {});
  };

  const COL = "64px 1.4fr 70px 88px 90px";

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", color: "var(--kv-text)" }}>
      {/* ── Header row ── */}
      <div style={{ ...head.style, display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 11px", borderRadius: 99, background: "var(--kv-primary-tint)", color: "var(--kv-deep)", fontSize: 11, fontWeight: 800 }}>
            طلبات كريم · حقائق POS
          </span>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: "8px 0 0" }}>الطلبات</h1>
        </div>
        <div style={{ marginInlineStart: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
          <StatTile label="طلب نشط" value={activeCount} />
          <StatTile label="محتاج تدخّل" value={needHuman} urgent />
          <StatTile label="متوسط الإكمال" value={avgMin} suffix=" د" placeholder="—" />
          <StatTile label="تمّت النهارده" value={doneToday} primary />
        </div>
      </div>

      {/* ── Pipeline summary ── */}
      <div style={{ ...pipe.style, display: "grid", gridTemplateColumns: `repeat(${PIPE.length},1fr)`, gap: 12, marginTop: 18 }}>
        {pipeCounts.map((p) => (
          <div key={p.key} style={{ background: "var(--kv-card)", border: "1px solid var(--kv-border)", borderRadius: 14, padding: "12px 14px", boxShadow: "var(--kv-shadow-panel)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: p.dot, flex: "none" }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--kv-muted)" }}>{p.label}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{toAr(p.n)}</div>
          </div>
        ))}
      </div>

      {/* ── Daily payments summary strip ──
          COD money (collected / outstanding) reuses codDailySummary() via
          /api/cod/ledger — never recomputed here. Counts + Vodafone Cash amount come
          from the loaded orders' real paymentMethod field. Orders with no method are
          surfaced honestly as "غير محدد" — never folded into a method. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginTop: 18 }}>
        <SumCard label="طلبات النهارده" value={hydrated ? toAr(todayCount) : "…"} />
        <SumCard label="قيمة الطلبات" value={hydrated ? `${money(todayValue)} ${dayCurrency}` : "…"} />
        <SumCard
          label="COD محصّل النهارده"
          value={codLoaded ? (codSummary ? `${money(codSummary.collectedToday)} ${dayCurrency}` : null) : "…"}
          sub={hydrated ? `${toAr(codCount)} طلب${codSummary ? ` · معلّق ${money(codSummary.outstanding)}` : ""}` : undefined}
          tone="primary"
        />
        <SumCard
          label="فودافون كاش"
          value={hydrated ? `${money(vfAmount)} ${dayCurrency}` : "…"}
          sub={hydrated ? `${toAr(vfCount)} طلب` : undefined}
          tone="vodafone"
        />
        <SumCard
          label="غير محدد الدفع"
          value={hydrated ? toAr(unspecifiedCount) : "…"}
          sub={hydrated ? "طلب بدون طريقة دفع" : undefined}
        />
      </div>

      {/* ── Table + Drawer ── */}
      <div style={{ ...grid.style, display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 16, marginTop: 18, alignItems: "start" }}>
        {/* TABLE */}
        <div style={{ background: "var(--kv-card)", border: "1px solid var(--kv-border)", borderRadius: 16, boxShadow: "var(--kv-shadow-card)", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", borderBottom: "1px solid var(--kv-border)" }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, flex: 1 }}>قائمة الطلبات</h2>
            {([["all", "الكل"], ["active", "نشط"], ["late", "متأخر"]] as const).map(([k, lbl]) => (
              <button key={k} onClick={() => setTab(k)} style={{
                height: 30, padding: "0 13px", borderRadius: 99, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 800,
                border: tab === k ? "0" : "1px solid var(--kv-border)",
                background: tab === k ? "var(--kv-primary)" : "var(--kv-card)",
                color: tab === k ? "#fff" : "var(--kv-muted)",
              }}>{lbl}</button>
            ))}
          </div>

          {/* column header */}
          <div style={{ display: "grid", gridTemplateColumns: COL, gap: 12, padding: "10px 18px", borderBottom: "1px solid var(--kv-border)", fontSize: 11, fontWeight: 800, color: "var(--kv-faint)" }}>
            <span>الطلب</span><span>العميل والأصناف</span><span>الإجمالي</span><span>الدفع</span><span>الحالة</span>
          </div>

          {/* rows */}
          <div className="kv-scroll" style={{ maxHeight: 430, overflowY: "auto" }}>
            {!hydrated || list.length === 0 ? (
              <div style={{ padding: "56px 18px", textAlign: "center", color: "var(--kv-faint)", fontSize: 13, fontWeight: 600 }}>
                {hydrated ? "مفيش طلبات في النطاق ده لسه" : "بنحمّل…"}
              </div>
            ) : (
              list.map((o) => {
                const sel = o.id === selectedId;
                const esc = isEscalated(o);
                const m = statusMeta(o.orderStatus);
                const itemsSummary = o.items.length ? `${o.items[0].name}${o.items.length > 1 ? ` +${toAr(o.items.length - 1)} صنف` : ""}` : "—";
                return (
                  <button key={o.id} onClick={() => setSelectedId(o.id)} style={{
                    display: "grid", gridTemplateColumns: COL, gap: 12, alignItems: "center", width: "100%", textAlign: "start",
                    padding: "11px 18px", border: 0, cursor: "pointer", borderBottom: "1px solid var(--kv-border)", fontFamily: "inherit",
                    background: sel ? "linear-gradient(90deg,rgba(14,159,110,.07),transparent)" : "transparent",
                    borderRight: sel ? "3px solid var(--kv-primary)" : "3px solid transparent",
                    opacity: DONE.includes(o.orderStatus) ? 0.72 : 1,
                  }}>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: sel ? "var(--kv-deep)" : "var(--kv-text)" }}>#{toAr(o.orderNumber)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.customerName}</span>
                      <span style={{ display: "block", fontSize: 9.5, color: "var(--kv-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{itemsSummary}</span>
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 800 }}>{money(o.total)}</span>
                    <span><PaymentPill o={o} /></span>
                    <span>{esc ? <Pill label="تدخّل" dot="var(--kv-red)" bg="rgba(192,73,47,.12)" fg="#c0492f" /> : <Pill label={m.label} dot={m.dot} bg={m.bg} fg={m.fg} />}</span>
                  </button>
                );
              })
            )}
          </div>

          {/* payment truth legend */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "12px 18px", borderTop: "1px solid var(--kv-border)", background: "var(--kv-card-soft)" }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "var(--kv-faint)" }}>طرق الدفع:</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 99, background: "rgba(14,159,110,.10)", color: "#0a8a5f", fontSize: 10.5, fontWeight: 800 }}>
              <span className="kv-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--kv-primary)" }} />
              الدفع عند الاستلام · شغّال
            </span>
            {["محفظة", "إنستاباي", "كارت"].map((m) => (
              <span key={m} style={{ padding: "3px 10px", borderRadius: 99, border: "1px dashed rgba(100,116,139,.35)", color: "#6b7a88", fontSize: 10.5, fontWeight: 800 }}>{m} · قريباً</span>
            ))}
          </div>
        </div>

        {/* DRAWER */}
        <div style={{ background: "var(--kv-card)", border: "1px solid var(--kv-border)", borderRadius: 16, boxShadow: "var(--kv-shadow-card)", overflow: "hidden", position: "sticky", top: 0 }}>
          {selected ? <OrderDrawer key={selected.id} o={selected} escalated={isEscalated(selected)} onAdvance={advance} blockedNoDriver={noDriverBlock === selected.id} /> : (
            <div style={{ padding: "56px 18px", textAlign: "center", color: "var(--kv-faint)", fontSize: 13, fontWeight: 600 }}>اختر طلب لعرض تفاصيله</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── pieces ──
function StatTile({ label, value, suffix = "", primary, urgent, placeholder }: { label: string; value: number | null; suffix?: string; primary?: boolean; urgent?: boolean; placeholder?: string }) {
  const color = urgent ? "var(--kv-red)" : primary ? "var(--kv-primary)" : "var(--kv-text)";
  const pulse = urgent && (value ?? 0) > 0;
  return (
    <div className={pulse ? "kv-urgent" : undefined} style={{ minWidth: 96, height: 50, padding: "0 14px", display: "flex", flexDirection: "column", justifyContent: "center", borderRadius: 13, background: "var(--kv-card)", border: `1px solid ${urgent ? "rgba(192,73,47,.3)" : "var(--kv-border)"}` }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: "var(--kv-faint)" }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 800, color }}>
        {value == null ? (placeholder ?? "—") : <><CountUp value={value} format={(n) => toAr(Math.round(n))} />{suffix}</>}
      </span>
    </div>
  );
}

// Compact daily-summary card. A null value renders an honest "قيد التجميع" state
// (e.g. COD money before the ledger responds) — never a fabricated number.
function SumCard({ label, value, sub, tone }: { label: string; value?: string | null; sub?: string; tone?: "primary" | "vodafone" }) {
  const isGathering = value == null;
  const isLoading = value === "…";
  const color = tone === "primary" ? "var(--kv-primary)" : tone === "vodafone" ? "#c40000" : "var(--kv-text)";
  return (
    <div style={{ minHeight: 58, padding: "10px 14px", display: "flex", flexDirection: "column", justifyContent: "center", borderRadius: 13, background: "var(--kv-card)", border: "1px solid var(--kv-border)", boxShadow: "var(--kv-shadow-panel)" }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--kv-faint)" }}>{label}</span>
      {isGathering ? (
        <span style={{ marginTop: 4, display: "inline-flex", alignSelf: "flex-start", padding: "2px 8px", borderRadius: 99, border: "1px dashed rgba(100,116,139,.35)", color: "#6b7a88", fontSize: 10, fontWeight: 800 }}>
          قيد التجميع
        </span>
      ) : (
        <>
          <span style={{ fontSize: 15.5, fontWeight: 800, color, marginTop: 2 }}>{isLoading ? "…" : value}</span>
          {sub && !isLoading && <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--kv-faint)", marginTop: 1 }}>{sub}</span>}
        </>
      )}
    </div>
  );
}

function Pill({ label, dot, bg, fg }: { label: string; dot: string; bg: string; fg: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 9px", borderRadius: 99, background: bg, color: fg, fontSize: 10.5, fontWeight: 800, whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flex: "none" }} />
      {label}
    </span>
  );
}

function PaymentPill({ o }: { o: LocalOrder }) {
  // Vodafone Cash is a distinct method — show it apart from COD (red brand tint).
  if (o.paymentMethod === "vodafone_cash") return <Pill label="فودافون كاش" dot="#e60000" bg="rgba(230,0,0,.10)" fg="#c40000" />;
  if (o.paymentStatus === "paid") return <Pill label="مدفوع" dot="var(--kv-primary)" bg="rgba(14,159,110,.12)" fg="#0a8a5f" />;
  if (o.fulfillmentType === "delivery") return <Pill label="COD مؤكد" dot="var(--kv-primary)" bg="rgba(14,159,110,.12)" fg="#0a8a5f" />;
  return <Pill label="بانتظار الدفع" dot="var(--kv-amber)" bg="rgba(201,138,31,.16)" fg="#9a6a14" />;
}

// ── driver assignment (delivery orders) ──
// Wires the EXISTING dispatch backend into the orders drawer: the drivers list
// comes from GET /api/drivers and the assignment posts to the SAME endpoint the
// /deliveries page uses (POST /api/deliveries/[deliveryId]/assign), which mints
// the tokens and WhatsApps the driver. We map this order to its delivery row via
// the order number returned by GET /api/deliveries — no new mechanism, no new API.
type DeliveryRow = {
  id: string;
  status: string;
  driver_id: string | null;
  drivers: { name: string; phone: string } | null;
  orders: { order_number: string | number | null } | null;
};
type DriverRow = { id: string; name: string; phone: string; active: boolean };
const ASSIGNABLE: OrderStatusKey[] = ["ready", "out_for_delivery"];

function DriverAssign({ o }: { o: LocalOrder }) {
  const [delivery, setDelivery] = useState<DeliveryRow | null>(null);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    try {
      const [dRes, drRes] = await Promise.all([
        fetch("/api/deliveries", { cache: "no-store" }),
        fetch("/api/drivers", { cache: "no-store" }),
      ]);
      if (dRes.ok) {
        const rows = ((await dRes.json()).deliveries ?? []) as DeliveryRow[];
        setDelivery(rows.find((x) => String(x.orders?.order_number ?? "") === String(o.orderNumber)) ?? null);
      }
      if (drRes.ok) setDrivers(((await drRes.json()).drivers ?? []).filter((d: DriverRow) => d.active));
    } catch {
      /* flag off / not configured → render nothing */
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    setLoaded(false);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.id]);

  async function assign() {
    if (!delivery || !pick) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/deliveries/${delivery.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId: pick }),
      });
      if (r.ok) { setPick(""); await load(); }
    } finally {
      setBusy(false);
    }
  }

  if (!ENABLE_DELIVERY_TRACKING || !loaded) return null;

  // Already assigned → show the driver on the order (any status).
  if (delivery?.driver_id && delivery.drivers?.name) {
    return (
      <div style={{ padding: 18, borderBottom: "1px solid var(--kv-border)" }}>
        <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>المندوب</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: 12, background: "rgba(124,92,208,.08)", border: "1px solid rgba(124,92,208,.22)", padding: "10px 13px" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--kv-delivery)", flex: "none" }} />
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>{delivery.drivers.name}</span>
          {delivery.drivers.phone && <span style={{ fontSize: 11, color: "var(--kv-faint)", marginInlineStart: "auto" }} dir="ltr">{delivery.drivers.phone}</span>}
        </div>
      </div>
    );
  }

  // Unassigned + order is ready / out for delivery + a delivery row exists → offer assignment.
  if (!delivery || !ASSIGNABLE.includes(o.orderStatus)) return null;

  return (
    <div style={{ padding: 18, borderBottom: "1px solid var(--kv-border)" }}>
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>تعيين مندوب</div>
      {drivers.length === 0 ? (
        <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--kv-faint)" }}>
          لا يوجد مندوبون نشطون — أضِف مندوبًا من صفحة التوصيل.
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            style={{ flex: 1, height: 38, borderRadius: 10, border: "1px solid var(--kv-border)", background: "var(--kv-card)", padding: "0 10px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: "var(--kv-text)" }}
          >
            <option value="">اختر مندوباً…</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>{d.name} — {d.phone}</option>
            ))}
          </select>
          <button
            onClick={assign}
            disabled={!pick || busy}
            style={{ height: 38, padding: "0 16px", border: 0, borderRadius: 10, background: pick && !busy ? "var(--kv-grad-brand)" : "var(--kv-card-soft)", color: pick && !busy ? "#fff" : "var(--kv-faint)", fontFamily: "inherit", fontSize: 12.5, fontWeight: 800, cursor: pick && !busy ? "pointer" : "default" }}
          >
            {busy ? "..." : "تعيين"}
          </button>
        </div>
      )}
    </div>
  );
}

const RANK: Record<string, number> = { pending_confirmation: 0, pending_payment: 0, paid: 1, preparing: 2, ready: 3, out_for_delivery: 4, delivered: 5 };
function OrderDrawer({ o, escalated, onAdvance, blockedNoDriver }: { o: LocalOrder; escalated: boolean; onAdvance: (o: LocalOrder) => void; blockedNoDriver?: boolean }) {
  const m = statusMeta(o.orderStatus);
  const n = nextStatus(o);
  const rank = RANK[o.orderStatus] ?? 0;
  const cancelled = o.orderStatus === "cancelled";
  const isVf = o.paymentMethod === "vodafone_cash";
  const isCod = !isVf && o.fulfillmentType === "delivery" && o.paymentStatus !== "paid";
  const area = o.deliveryAddress || o.branchName || "";

  const steps: { key: string; label: string; rank: number }[] = [
    { key: "received", label: "تم استلام الطلب", rank: 0 },
    { key: "paid", label: "تم التأكيد", rank: 1 },
    { key: "preparing", label: "قيد التحضير", rank: 2 },
    { key: "ready", label: "جاهز", rank: 3 },
    ...(o.fulfillmentType === "delivery" ? [{ key: "out", label: "خرج للتوصيل", rank: 4 }] : []),
    { key: "delivered", label: "تم التسليم", rank: 5 },
  ];

  return (
    <div className="kv-scroll" style={{ maxHeight: "calc(100vh - 140px)", overflowY: "auto" }}>
      {/* header */}
      <div style={{ padding: 18, borderBottom: "1px solid var(--kv-border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>طلب #{toAr(o.orderNumber)}</span>
          {escalated ? <Pill label="تدخّل" dot="var(--kv-red)" bg="rgba(192,73,47,.12)" fg="#c0492f" /> : <Pill label={m.label} dot={m.dot} bg={m.bg} fg={m.fg} />}
        </div>
        <div style={{ fontSize: 12, color: "var(--kv-faint)", fontWeight: 600, marginTop: 6 }}>
          {o.customerId ? <Link href={`/customers?c=${o.customerId}`} style={{ color: "var(--kv-deep)", fontWeight: 700, textDecoration: "none" }}>{o.customerName}</Link> : o.customerName}
          {area ? ` · ${area}` : ""}
          {o.source === "whatsapp" ? " · من محادثة واتساب" : ""}
        </div>
      </div>

      {/* items */}
      <div style={{ padding: 18, borderBottom: "1px solid var(--kv-border)" }}>
        <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10 }}>الأصناف</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {o.items.map((it, i) => {
            const sub = [it.variant, ...(it.choices ?? []), ...(it.modifiers ?? [])].filter(Boolean).join(" · ");
            return (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{it.name} ×{toAr(it.quantity)}</div>
                  {sub && <div style={{ fontSize: 10.5, color: "var(--kv-muted)", marginTop: 1 }}>— {sub}</div>}
                  {it.notes && <div style={{ fontSize: 10.5, color: "var(--kv-muted)", marginTop: 1 }}>— {it.notes}</div>}
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>{money(it.total)}</span>
              </div>
            );
          })}
        </div>
        {/* totals — from the order row only */}
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed var(--kv-border)", display: "flex", flexDirection: "column", gap: 5 }}>
          <Row label="المجموع" value={`${money(o.subtotal)} ${o.currency}`} />
          {o.deliveryFee > 0 && <Row label="رسوم التوصيل" value={`${money(o.deliveryFee)} ${o.currency}`} />}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 800 }}>الإجمالي (من POS)</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--kv-primary)" }}>{money(o.total)} {o.currency}</span>
          </div>
        </div>
      </div>

      {/* Vodafone Cash card — distinct from COD (red brand tint). */}
      {isVf && (
        <div style={{ padding: 18, borderBottom: "1px solid var(--kv-border)" }}>
          <div style={{ borderRadius: 13, background: "rgba(230,0,0,.05)", border: "1px solid rgba(230,0,0,.2)", padding: "12px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#c40000" }}>فودافون كاش</div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--kv-muted)", marginTop: 3 }}>{money(o.total)} {o.currency} · تحويل على المحفظة</div>
          </div>
        </div>
      )}

      {/* COD card */}
      {isCod && (
        <div style={{ padding: 18, borderBottom: "1px solid var(--kv-border)" }}>
          <div style={{ borderRadius: 13, background: "rgba(14,159,110,.06)", border: "1px solid rgba(14,159,110,.2)", padding: "12px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--kv-deep)" }}>الدفع عند الاستلام</div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--kv-muted)", marginTop: 3 }}>{money(o.total)} {o.currency} تتحصّل وقت التسليم · مؤكد</div>
          </div>
        </div>
      )}

      {/* driver assignment (delivery orders only) — reuses the SAME drivers list
          (/api/drivers) and assign endpoint (POST /api/deliveries/[id]/assign) as
          the /deliveries page; this is UI wiring, no new backend. */}
      {o.fulfillmentType === "delivery" && <DriverAssign o={o} />}

      {/* status timeline */}
      <div style={{ padding: 18, borderBottom: "1px solid var(--kv-border)" }}>
        <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10 }}>مسار الحالة</div>
        {cancelled ? (
          <div style={{ borderRadius: 11, background: "rgba(192,73,47,.08)", padding: "10px 12px", fontSize: 12, fontWeight: 700, color: "#c0492f" }}>✕ تم إلغاء الطلب</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {steps.map((s, i) => {
              const done = rank > s.rank;
              const current = rank === s.rank;
              return (
                <div key={s.key}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: done || current ? 1 : 0.45 }}>
                    <span className={current ? "kv-urgent" : undefined} style={{ width: 22, height: 22, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", background: done ? "var(--kv-primary)" : current ? "var(--kv-amber)" : "transparent", border: done || current ? "0" : "2px solid #d8e0db" }}>
                      {(done || current) && <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4 10-10" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </span>
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: current || done ? 700 : 600, color: current ? "#946312" : done ? "var(--kv-text)" : "var(--kv-faint)" }}>{current ? `${s.label} الآن` : s.label}</span>
                    <span style={{ fontSize: 10.5, color: "var(--kv-faint)" }}>{s.key === "received" ? minutesAgo(o.createdAt) : current ? minutesAgo(o.createdAt) : ""}</span>
                  </div>
                  {i < steps.length - 1 && <div style={{ width: 2, height: 12, marginInlineStart: 10, background: rank > s.rank ? "var(--kv-primary)" : current ? "var(--kv-amber)" : "var(--kv-border)" }} />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* actions */}
      <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
        {blockedNoDriver && (
          <div style={{ borderRadius: 11, background: "rgba(192,73,47,.08)", border: "1px solid rgba(192,73,47,.3)", padding: "10px 12px", fontSize: 12, fontWeight: 700, color: "#c0492f", lineHeight: 1.5 }}>
            عيّن مندوبًا أولاً قبل «تم التسليم» — وإلا الكاش مش هيتنسب لمندوب. استخدم «تعيين مندوب» بالأعلى.
          </div>
        )}
        {n ? (
          <button onClick={() => onAdvance(o)} style={{ height: 44, border: 0, borderRadius: 12, background: "var(--kv-grad-brand)", color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 14px 26px -16px rgba(14,159,110,.7)" }}>
            {ADVANCE_LABEL[n] ?? "قدّم الحالة"} <ArrowLeft size={16} />
          </button>
        ) : (
          <div style={{ height: 44, borderRadius: 12, background: "var(--kv-card-soft)", color: "var(--kv-faint)", fontSize: 13, fontWeight: 700, display: "grid", placeItems: "center" }}>
            {cancelled ? "ملغي" : "تمّ التسليم"}
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => printTicket(o.id)} style={{ flex: 1, height: 40, borderRadius: 12, border: "1px solid var(--kv-border)", background: "var(--kv-card)", color: "var(--kv-muted)", fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            <Printer size={15} /> طباعة
          </button>
          {o.conversationId ? (
            <Link href={`/conversations?c=${o.conversationId}`} style={{ flex: 1, height: 40, borderRadius: 12, border: "1px solid var(--kv-border)", background: "var(--kv-card)", color: "var(--kv-muted)", fontSize: 12.5, fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <MessageCircle size={15} /> المحادثة
            </Link>
          ) : (
            <span style={{ flex: 1, height: 40, borderRadius: 12, border: "1px solid var(--kv-border)", background: "var(--kv-card-soft)", color: "var(--kv-faint)", fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <X size={14} /> لا محادثة
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ fontSize: 12, color: "var(--kv-muted)", fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700 }}>{value}</span>
    </div>
  );
}
