"use client";

// ============================================================================
// MaitreAI — Operator Home (الرئيسية) — "Terracotta" redesign. Same proven data
// wiring as the prior home (DB-backed stores + /api/settings/ops), warm visual
// layer matching the mockup (web + responsive mobile).
// REAL: KPI band (revenue/orders/in-progress/AOV/completion) from today's orders,
//   live-orders kanban with قبول/تقدّم/طباعة (updateOrderStatus → Postgres, resvg
//   print), manager open/assistant controls (→ /api/settings/ops, manager-gated,
//   cashier-locked, confirm), escalations + late orders, top-items, WhatsApp status.
// PRESENTATIONAL (clearly «مثال»/«قريبًا», Layer 2): goal/streak/▲-deltas, كريم
//   advisor, drivers/peak, hourly/customers/ratings analytics. Truth rule: no
//   fabricated figure is shown as a live number the operator would act on.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOrderStore } from "@/lib/order-store";
import { useConversationStore } from "@/lib/conversation-store";
import { isEscalated } from "@/lib/escalation";
import { useRestaurantStore } from "@/lib/store";
import { useOpsStore } from "@/lib/ops-store";
import { useRole } from "@/lib/use-role";
import type { LocalOrder, OrderStatusKey } from "@/lib/types";
import { Lock, Printer, ChevronLeft, Sparkles, Mic, AlertTriangle, Tag } from "lucide-react";

// ---- helpers ---------------------------------------------------------------
const AR = "٠١٢٣٤٥٦٧٨٩";
const toAr = (n: number | string) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const grp = (n: number) => {
  const s = String(Math.round(n));
  let o = "";
  for (let i = 0; i < s.length; i++) { if (i > 0 && (s.length - i) % 3 === 0) o += "٬"; o += s[i]; }
  return o;
};
const money = (n: number) => toAr(grp(n));
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

const NEW: OrderStatusKey[] = ["pending_confirmation", "pending_payment", "paid"];
const ACTIVE: OrderStatusKey[] = [...NEW, "preparing", "ready", "out_for_delivery"];
const isNew = (s: OrderStatusKey) => NEW.includes(s);
const LATE_MS = 30 * 60 * 1000;
function nextStatus(s: OrderStatusKey): OrderStatusKey | null {
  if (isNew(s)) return "preparing";
  if (s === "preparing") return "ready";
  if (s === "ready") return "out_for_delivery";
  if (s === "out_for_delivery") return "delivered";
  return null;
}
// kanban columns
const COLS = [
  { key: "new", label: "جديد", color: "#5C8A6B", chip: "#E4EFE5", chipFg: "#436B50", match: (s: OrderStatusKey) => isNew(s) },
  { key: "kitchen", label: "المطبخ", color: "#C5871F", chip: "#F7EBD2", chipFg: "#946312", match: (s: OrderStatusKey) => s === "preparing" },
  { key: "ready", label: "جاهز", color: "#3E807A", chip: "#E1EEEC", chipFg: "#2C625D", match: (s: OrderStatusKey) => s === "ready" },
  { key: "out", label: "للتوصيل", color: "#5E6FA0", chip: "#E7EAF2", chipFg: "#475584", match: (s: OrderStatusKey) => s === "out_for_delivery" },
  { key: "done", label: "تم", color: "#9A8E7E", chip: "#EFEAE0", chipFg: "#7C7163", match: (s: OrderStatusKey) => s === "delivered" },
] as const;

export default function OperatorHomePage() {
  const router = useRouter();
  const role = useRole();
  const isManager = role === "manager";

  const orders = useOrderStore((s) => s.orders);
  const updateOrderStatus = useOrderStore((s) => s.updateOrderStatus);
  const conversations = useConversationStore((s) => s.conversations);
  const profile = useRestaurantStore((s) => s.profile);
  const currency = profile?.currency || "ج.م";

  const setOpsOpen = useOpsStore((s) => s.setOpen);
  const setOpsAsst = useOpsStore((s) => s.setAgentEnabled);
  const [isOpen, setIsOpen] = useState(true);
  const [asstOn, setAsstOn] = useState(true);
  const [confirm, setConfirm] = useState<null | "close" | "pause">(null);
  const [savingOps, setSavingOps] = useState(false);

  useEffect(() => {
    fetch("/api/settings/ops").then((r) => r.json()).then((d) => {
      if (typeof d.isOpen === "boolean") { setIsOpen(d.isOpen); setOpsOpen(d.isOpen); }
      if (typeof d.assistantOn === "boolean") { setAsstOn(d.assistantOn); setOpsAsst(d.assistantOn); }
    }).catch(() => {});
  }, [setOpsOpen, setOpsAsst]);

  // ---- real derived data ----------------------------------------------------
  const k = useMemo(() => {
    const since = startOfToday();
    const today = orders.filter((o) => o.createdAt >= since);
    const paid = today.filter((o) => o.paymentStatus === "paid");
    const revenue = paid.reduce((s, o) => s + Number(o.total || 0), 0);
    const count = today.length;
    // AOV = average paid invoice: paid revenue ÷ PAID order count (consistent
    // base). Dividing paid revenue by all orders understated it (S1).
    const aov = paid.length ? revenue / paid.length : 0;
    const completedToday = today.filter((o) => o.orderStatus === "delivered").length;
    const completion = count ? Math.round((completedToday / count) * 100) : 0;
    const active = orders.filter((o) => ACTIVE.includes(o.orderStatus));
    const now = Date.now();
    const late = active.filter((o) => now - o.createdAt > LATE_MS);
    const kitchen = active.filter((o) => o.orderStatus === "preparing").length;
    const out = active.filter((o) => o.orderStatus === "out_for_delivery").length;
    // real top items today (by quantity)
    const tally = new Map<string, number>();
    for (const o of today) for (const it of o.items ?? []) tally.set(it.name, (tally.get(it.name) ?? 0) + (it.quantity || 0));
    const topItems = [...tally.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 4);
    return { revenue, count, aov, completion, completedToday, active, late, kitchen, out, today, topItems };
  }, [orders]);

  const escalations = useMemo(() => conversations.filter(isEscalated), [conversations]);

  const byCol = useMemo(() => {
    const since = startOfToday();
    return COLS.map((c) => {
      const pool = c.key === "done" ? orders.filter((o) => o.createdAt >= since) : k.active;
      return { ...c, orders: pool.filter((o) => c.match(o.orderStatus)).sort((a, b) => b.createdAt - a.createdAt) };
    });
  }, [orders, k.active]);

  // ---- ops handlers (real) --------------------------------------------------
  async function persistOps(patch: { isOpen?: boolean; assistantOn?: boolean }) {
    setSavingOps(true);
    try {
      const res = await fetch("/api/settings/ops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!res.ok) {
        if (typeof patch.isOpen === "boolean") { setIsOpen(!patch.isOpen); setOpsOpen(!patch.isOpen); }
        if (typeof patch.assistantOn === "boolean") { setAsstOn(!patch.assistantOn); setOpsAsst(!patch.assistantOn); }
      }
    } catch { /* keep optimistic */ } finally { setSavingOps(false); }
  }
  const toggleOpen = () => { if (!isManager) return; if (isOpen) { setConfirm("close"); return; } setIsOpen(true); setOpsOpen(true); void persistOps({ isOpen: true }); };
  const toggleAsst = () => { if (!isManager) return; if (asstOn) { setConfirm("pause"); return; } setAsstOn(true); setOpsAsst(true); void persistOps({ assistantOn: true }); };
  const confirmYes = () => {
    if (confirm === "close") { setIsOpen(false); setOpsOpen(false); void persistOps({ isOpen: false }); }
    if (confirm === "pause") { setAsstOn(false); setOpsAsst(false); void persistOps({ assistantOn: false }); }
    setConfirm(null);
  };
  const printOrder = (id: string) => window.open(`/api/orders/${id}/image?kind=ticket&w=80mm`, "_blank", "noopener");
  const advance = (o: LocalOrder) => { const n = nextStatus(o.orderStatus); if (n) updateOrderStatus(o.id, n, "human"); };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "صباح الخير" : hour < 17 ? "نهارك سعيد" : "مساء الخير";
  const dateLabel = new Intl.DateTimeFormat("ar-EG", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <div dir="rtl" className="mx-auto max-w-[1180px]">
      {/* ===== page header ===== */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[23px] font-bold tracking-tight text-[#2A2019]">{greeting} يا كريم</h2>
          <p className="mt-1 text-[13px] text-[#9A8E7E]">{dateLabel} · {profile?.name || "مطعمك"} · {isOpen ? "المطعم مفتوح" : "المطعم مغلق"}</p>
        </div>
        <div className="flex gap-2">
          <span className="rounded-[11px] border border-[#EBE2D3] bg-white px-3 py-2 text-[13px] font-semibold text-[#514538]">اليوم</span>
          <span className="rounded-[11px] border border-[#EBE2D3] bg-white px-3 py-2 text-[13px] font-semibold text-[#A99D8D]">مقارنة بالأمس · مثال</span>
        </div>
      </div>

      {/* ===== manager control row (open/assistant) — kept here (mockup shows only the top-bar pill) ===== */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-[16px] border border-[#ECE3D5] bg-white px-3.5 py-2.5">
        {isManager ? (
          <>
            <TSwitch on={isOpen} onClick={toggleOpen} label={isOpen ? "مفتوح" : "مغلق"} disabled={savingOps} />
            <TSwitch on={asstOn} onClick={toggleAsst} label={`المساعد ${asstOn ? "يعمل" : "متوقف"}`} disabled={savingOps} />
            {!isOpen && <span className="text-[11px] text-[#A99D8D]">المساعد يرد على الأسئلة، لا يستقبل طلبات</span>}
          </>
        ) : (
          <>
            <TLocked label="مفتوح" /><TLocked label="المساعد يعمل" />
            <span className="text-[11px] text-[#A99D8D]">هذه الضوابط تتطلب صلاحية المدير</span>
          </>
        )}
        <span className="mr-auto rounded-full border border-[#EFDDB6] bg-[#FBF1DD] px-3 py-1 text-[11.5px] font-semibold text-[#946312]">جاهزية المساعد · قريبًا</span>
      </div>

      {/* ===== KPI BAND ===== */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-[1.55fr_1fr_1fr_1fr_1fr]">
        {/* revenue hero — REAL revenue; goal/streak/delta are illustrative */}
        <div className="relative col-span-2 overflow-hidden rounded-[18px] p-5 text-white md:col-span-3 lg:col-span-1"
          style={{ background: "linear-gradient(150deg,#BE5238 0%,#93381F 60%,#6E2A18 100%)", boxShadow: "0 20px 40px -24px rgba(110,42,24,.7)" }}>
          <div className="relative flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(246,237,223,.2)] bg-white/[.13] px-2.5 py-1 text-[11.5px] font-semibold text-[#F4E6C5]">إيراد اليوم</span>
            <span className="rounded-md bg-[rgba(245,236,218,.16)] px-2 py-0.5 text-[11px] font-bold text-[#F2E2BF]">▲ مثال عن أمس</span>
          </div>
          <div className="relative mt-3.5 flex items-baseline gap-2">
            <span className="text-[44px] font-bold leading-none tracking-tight">{money(k.revenue)}</span>
            <span className="text-[14px] text-[#E4B9A8]">/ ٥٬٠٠٠ {currency} · هدف تجريبي</span>
          </div>
          <div className="relative mt-3.5">
            <div className="h-2 overflow-hidden rounded-full bg-white/[.16]">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round((k.revenue / 5000) * 100))}%`, background: "linear-gradient(90deg,#E9CF82,#C79A4E)" }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11.5px]">
              <span className="text-[#E4B9A8]">التقدّم نحو هدف تجريبي</span>
              <span className="inline-flex items-center gap-1 font-semibold text-[#F2E2BF]">🔥 سلسلة فوق الهدف · مثال</span>
            </div>
          </div>
        </div>

        <TKpi label="طلبات اليوم" value={toAr(k.count)} sub="إجمالي اليوم" />
        <TKpi label="قيد التنفيذ الآن" value={toAr(k.active.length)} valueColor="#BE5238" live
          sub={`${toAr(k.kitchen)} بالمطبخ · ${toAr(k.out)} خرجوا · ${toAr(k.late.length)} متأخر`} border="#EDCFC2" />
        <TKpi label="متوسط الفاتورة" value={money(k.aov)} unit={currency} sub="لكل طلب اليوم" />
        <TKpi label="نسبة الإتمام" value={`${toAr(k.completion)}٪`} sub={`${toAr(k.completedToday)} من ${toAr(k.count)} طلب اكتمل`} />
      </div>

      {/* ===== BOARD + RAIL ===== */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_326px]">
        {/* live kanban */}
        <div className="rounded-[18px] border border-[#ECE3D5] bg-white p-4" style={{ boxShadow: "0 14px 30px -22px rgba(50,32,20,.25)" }}>
          <div className="mb-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-[16px] font-bold text-[#2A2019]">الطلبات مباشرة</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#CFE2D3] bg-[#EAF1E9] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#436B50]">
                <span className="t-live h-1.5 w-1.5 rounded-full bg-[#5C8A6B]" style={{ animation: "tLive 2.4s ease-in-out infinite" }} />تحديث حي
              </span>
            </div>
            <Link href="/orders" className="flex items-center gap-1 text-[12.5px] font-semibold text-[#BE5238]">كل الطلبات <ChevronLeft className="h-3.5 w-3.5" /></Link>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {byCol.map((c) => (
              <div key={c.key} className="rounded-[13px] bg-[#F6F0E7] p-2 pb-2.5">
                <div className="mb-2 flex items-center justify-between px-0.5">
                  <span className="flex items-center gap-1.5 text-[11.5px] font-bold text-[#2A2019]"><span className="h-[7px] w-[7px] rounded-full" style={{ background: c.color }} />{c.label}</span>
                  <span className="rounded-[7px] px-1.5 text-[11px] font-bold" style={{ background: c.chip, color: c.chipFg }}>{toAr(c.orders.length)}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {c.orders.slice(0, 6).map((o) => {
                    const done = c.key === "done";
                    return (
                      <div key={o.id} className="rounded-[9px] border bg-white p-2"
                        style={{ borderColor: "#EBE2D3", borderRightWidth: 3, borderRightColor: done ? "#C9BFAE" : c.color, opacity: done ? 0.85 : 1 }}>
                        <button onClick={() => router.push("/orders")} className="block w-full text-right">
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] font-bold" style={{ color: done ? "#7C7163" : "#2A2019" }} dir="ltr">#{o.orderNumber}</span>
                            {!done && c.key !== "new" && <span className="text-[9.5px] text-[#946312]">{toAr(Math.round((Date.now() - o.createdAt) / 60000))} د</span>}
                          </div>
                          <div className="mt-0.5 text-[10.5px] text-[#9A8E7E]">{done ? `${money(o.total)} ${currency} ✓` : `${o.customerName} · ${toAr((o.items ?? []).length)} أصناف`}</div>
                        </button>
                        {/* keep accept/advance/print reachable on the home */}
                        {!done && (
                          <div className="mt-1.5 flex items-center gap-1">
                            <button onClick={() => advance(o)} className="flex-1 rounded-[6px] bg-[#BE5238] py-1 text-[10px] font-bold text-white">{isNew(o.orderStatus) ? "قبول" : "تقدّم"}</button>
                            <button onClick={() => printOrder(o.id)} title="طباعة" className="flex h-[22px] w-[22px] items-center justify-center rounded-[6px] border border-[#EBE2D3] text-[#BE5238]"><Printer className="h-3 w-3" /></button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {c.orders.length === 0 && <div className="py-1 text-center text-[10.5px] text-[#A99D8D]">—</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT RAIL */}
        <div className="flex flex-col gap-3.5">
          {/* needs attention (REAL escalations + late) */}
          <RailCard title="محتاجك دلوقتي" badge={toAr(escalations.length + k.late.length)}>
            <div className="flex flex-col gap-2">
              {k.late.slice(0, 2).map((o) => (
                <div key={o.id} className="flex items-center gap-2.5 rounded-xl border border-[#F1D2C8] bg-[#FBEAE5] p-2.5">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-[#BE5238] text-white"><AlertTriangle className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1"><div className="text-[12.5px] font-bold text-[#2A2019]" dir="ltr">#{o.orderNumber}</div><div className="text-[11px] text-[#97766C]">متأخر {toAr(Math.round((Date.now() - o.createdAt) / 60000))} دقيقة</div></div>
                  <button onClick={() => router.push("/orders")} className="flex-none rounded-[9px] bg-[#BE5238] px-3 py-1.5 text-[11.5px] font-bold text-white">تابع</button>
                </div>
              ))}
              {escalations.slice(0, 3).map((c) => (
                <div key={c.id} className="flex items-center gap-2.5 rounded-xl border border-[#EFDDB6] bg-[#FBF1DD] p-2.5">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-[#C5871F] text-white"><Tag className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1"><div className="truncate text-[12.5px] font-bold text-[#2A2019]">تصعيد · {c.customer}</div><div className="truncate text-[11px] text-[#927D54]">{c.escalationReason || "بانتظار رد الموظف"}</div></div>
                  <button onClick={() => router.push("/conversations")} className="flex-none rounded-[9px] border border-[#E6D7B4] bg-white px-3 py-1.5 text-[11.5px] font-bold text-[#946312]">مراجعة</button>
                </div>
              ))}
              {escalations.length === 0 && k.late.length === 0 && (
                <div className="rounded-xl border border-[#CFE2D3] bg-[#EAF1E9] p-3 text-center text-[12px] font-semibold text-[#436B50]">كل شيء تحت السيطرة ✓</div>
              )}
            </div>
          </RailCard>

          {/* live pulse — kitchen load REAL; drivers/peak presentational */}
          <RailCard title="النبض المباشر">
            <div className="flex flex-col gap-2.5">
              <PulseRow tint="#F7EBD2" fg="#C5871F" label="حِمل المطبخ" value={`${toAr(k.kitchen)} طلبات`} />
              <PulseRow tint="#E7EAF2" fg="#5E6FA0" label="سائقين نشطين · مثال" value="—" muted />
              <PulseRow tint="#FBEAE5" fg="#BE5238" label="الذروة المتوقعة · قريبًا" value="—" muted />
            </div>
          </RailCard>

          {/* karim advisor — PRESENTATIONAL */}
          <div className="rounded-[18px] border border-[#EBE2D3] p-4" style={{ background: "linear-gradient(165deg,#FBF7F0,#F4EDE2)" }}>
            <div className="mb-2.5 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg text-white" style={{ background: "linear-gradient(150deg,#C25A3E,#8A3621)" }}><Sparkles className="h-3.5 w-3.5" /></span>
              <span className="text-[13.5px] font-bold text-[#2A2019]">كريم يقترح</span>
              <span className="mr-auto rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-[#BE5238]">قريبًا</span>
            </div>
            <p className="mb-3 text-[12.5px] leading-relaxed text-[#514538]">اقتراحات العروض الذكية في كريم — تصل في التحديث القادم.</p>
            <div className="mb-2.5 flex gap-2">
              <Link href="/maitre" className="flex-1 rounded-[10px] bg-[#BE5238] py-2 text-center text-[12.5px] font-bold text-white">جرّب المساعد</Link>
              <span className="rounded-[10px] border border-[#EBE2D3] bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#7C7163]">بعدين</span>
            </div>
            <div className="flex items-center gap-2 rounded-[11px] border border-[#EBE2D3] bg-white p-1.5 pr-3">
              <span className="flex-1 text-[12px] text-[#AEA391]">اتكلم مع كريم… (قريبًا)</span>
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[#BE5238] text-white opacity-70"><Mic className="h-3.5 w-3.5" /></span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== INSIGHTS BAND ===== */}
      <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* top items — REAL */}
        <InsightCard title="الأكثر مبيعاً اليوم">
          {k.topItems.length === 0 ? (
            <p className="text-[12px] text-[#A99D8D]">لا مبيعات بعد اليوم.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {k.topItems.map((it, i) => {
                const max = k.topItems[0].qty || 1;
                const colors = ["#BE5238", "#D17A53", "#C5871F", "#5C8A6B"];
                return (
                  <div key={it.name}>
                    <div className="mb-1 flex justify-between text-[12px]"><span className="font-semibold text-[#2A2019]">{it.name}</span><span className="text-[#9A8E7E]">{toAr(it.qty)}</span></div>
                    <div className="h-1.5 rounded-full bg-[#F2EBE0]"><div className="h-full rounded-full" style={{ width: `${Math.round((it.qty / max) * 100)}%`, background: colors[i] }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </InsightCard>
        {/* hourly — PRESENTATIONAL */}
        <InsightCard title="الإيراد بالساعة" tag="قريبًا">
          <div className="flex h-24 items-end gap-1.5">
            {[22, 34, 30, 52, 70, 100, 64, 40].map((h, i) => (
              <span key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: h === 100 ? "#BE5238" : h >= 52 ? "#E3A98D" : "#F0D9CF" }} />
            ))}
          </div>
          <div className="mt-1.5 text-[10px] text-[#A99D8D]">رسم توضيحي — يُحسب من الطلبات قريبًا</div>
        </InsightCard>
        {/* customers — PRESENTATIONAL */}
        <InsightCard title="العملاء اليوم" tag="قريبًا">
          <p className="text-[12px] leading-relaxed text-[#A99D8D]">نسبة العملاء الجدد مقابل العائدين — تصل قريبًا من بيانات حقيقية.</p>
        </InsightCard>
        {/* ratings — PRESENTATIONAL */}
        <InsightCard title="آخر التقييمات" tag="قريبًا">
          <p className="text-[12px] leading-relaxed text-[#A99D8D]">تقييمات العملاء وآراؤهم — تُعرض هنا عند تفعيل التقييمات.</p>
        </InsightCard>
      </div>

      {/* confirm dialog (real) */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirm(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-5">
            <div className="text-[15px] font-bold text-[#2A2019]">{confirm === "close" ? "إغلاق المطعم؟" : "إيقاف المساعد؟"}</div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#7C7163]">
              {confirm === "close" ? "لن يستقبل المطعم طلبات جديدة. سيظل المساعد يرد على الأسئلة فقط." : "كل المحادثات الواردة ستتحوّل إلى فريقك مباشرة حتى إعادة التشغيل."}
            </p>
            <div className="mt-4 flex gap-2">
              <button onClick={confirmYes} className="flex-1 rounded-lg bg-[#BE5238] py-2.5 text-[13px] font-semibold text-white">{confirm === "close" ? "تأكيد الإغلاق" : "تأكيد الإيقاف"}</button>
              <button onClick={() => setConfirm(null)} className="flex-1 rounded-lg border border-[#EBE2D3] py-2.5 text-[13px] text-[#7C7163]">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- pieces ----------------------------------------------------------------
function TSwitch({ on, onClick, label, disabled }: { on: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="flex items-center gap-2 rounded-full border px-3 py-1.5 disabled:opacity-60"
      style={{ background: on ? "#EAF1E9" : "#F7F2EA", borderColor: on ? "#CFE2D3" : "#EBE2D3" }}>
      <span className="relative h-[18px] w-[30px] rounded-full" style={{ background: on ? "#5C8A6B" : "#C9BFAE" }}>
        <span className="absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow" style={on ? { left: 2 } : { right: 2 }} />
      </span>
      <span className="whitespace-nowrap text-[12.5px] font-semibold" style={{ color: on ? "#436B50" : "#7C7163" }}>{label}</span>
    </button>
  );
}
function TLocked({ label }: { label: string }) {
  return <span title="صلاحية المدير" className="flex cursor-not-allowed items-center gap-1.5 rounded-full border border-[#EBE2D3] bg-[#F7F2EA] px-3 py-1.5 text-[#A99D8D]"><Lock className="h-3 w-3" /><span className="text-[12.5px] font-semibold">{label}</span></span>;
}
function TKpi({ label, value, unit, sub, valueColor, live, border }: { label: string; value: string; unit?: string; sub?: string; valueColor?: string; live?: boolean; border?: string }) {
  return (
    <div className="rounded-[16px] border bg-white p-3.5" style={{ borderColor: border || "#ECE3D5" }}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] text-[#7C7163]">{label}</span>
        {live && <span className="t-live h-2 w-2 rounded-full bg-[#BE5238]" style={{ animation: "tLive 1.8s ease-in-out infinite" }} />}
      </div>
      <div className="flex items-baseline gap-1.5"><span className="text-[27px] font-bold" style={{ color: valueColor || "#2A2019" }}>{value}</span>{unit && <span className="text-[12px] text-[#A99D8D]">{unit}</span>}</div>
      {sub && <div className="mt-1 text-[11px] text-[#A99D8D]">{sub}</div>}
    </div>
  );
}
function RailCard({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[18px] border border-[#ECE3D5] bg-white p-4" style={{ boxShadow: "0 14px 30px -22px rgba(50,32,20,.25)" }}>
      <div className="mb-3 flex items-center gap-2"><span className="text-[15px] font-bold text-[#2A2019]">{title}</span>{badge && badge !== "٠" && <span className="rounded-full bg-[#BE5238] px-2 py-0.5 text-[10.5px] font-bold text-white">{badge}</span>}</div>
      {children}
    </div>
  );
}
function PulseRow({ tint, fg, label, value, muted }: { tint: string; fg: string; label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px]" style={{ background: tint }}><span className="h-2 w-2 rounded-full" style={{ background: fg }} /></span>
      <span className="flex-1 text-[12.5px] text-[#7C7163]">{label}</span>
      <span className="text-[14px] font-bold" style={{ color: muted ? "#A99D8D" : "#2A2019" }}>{value}</span>
    </div>
  );
}
function InsightCard({ title, tag, children }: { title: string; tag?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[18px] border border-[#ECE3D5] bg-white p-4" style={{ boxShadow: "0 14px 30px -22px rgba(50,32,20,.25)" }}>
      <div className="mb-3 flex items-center justify-between"><span className="text-[13.5px] font-bold text-[#2A2019]">{title}</span>{tag && <span className="rounded bg-[#F7F2EA] px-2 py-0.5 text-[10px] font-semibold text-[#A99D8D]">{tag}</span>}</div>
      {children}
    </div>
  );
}
