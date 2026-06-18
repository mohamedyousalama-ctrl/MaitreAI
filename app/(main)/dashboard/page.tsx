"use client";

// ============================================================================
// MaitreAI — Operator Home (الرئيسية) — "Bright Corporate" redesign, Layer 1.
// Full role-adaptive home. REAL (DB-backed via the existing stores / routes):
//   • KPI pulse row (revenue / orders / AOV / late) from today's orders
//   • live-orders rail with قبول / تقدّم / طباعة (updateOrderStatus → Postgres,
//     print via the resvg image route)
//   • manager control strip (مفتوح/مغلق + المساعد) → /api/settings/ops, locked
//     for the operation role; the route rejects non-managers server-side
//   • escalations from real conversations · WhatsApp status · role via useRole
// PRESENTATIONAL (clearly inert / «قريبًا», Layer 2 wires the Brain): the كريم
// briefing thread, advisor nudge, مراجعة اليوم, ASK, report cards, readiness
// ring, command bar, top-bar popovers, and the revenue drawer charts.
// Truth rule: no fabricated targets/▲-deltas — only figures we can compute.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOrderStore } from "@/lib/order-store";
import { useConversationStore } from "@/lib/conversation-store";
import { useRestaurantStore } from "@/lib/store";
import { useOpsStore } from "@/lib/ops-store";
import { useRole } from "@/lib/use-role";
import type { LocalOrder, OrderStatusKey } from "@/lib/types";
import { Lock, X, Printer, Send } from "lucide-react";

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

const ACTIVE: OrderStatusKey[] = ["pending_confirmation", "pending_payment", "paid", "preparing", "ready", "out_for_delivery"];
const isNew = (s: OrderStatusKey) => s === "pending_confirmation" || s === "pending_payment" || s === "paid";
const LATE_MS = 30 * 60 * 1000;
/** The next pipeline status when advancing an order. */
function nextStatus(s: OrderStatusKey): OrderStatusKey | null {
  if (isNew(s)) return "preparing";
  if (s === "preparing") return "ready";
  if (s === "ready") return "out_for_delivery";
  if (s === "out_for_delivery") return "delivered";
  return null;
}
const STATUS_AR: Record<string, string> = {
  pending_confirmation: "جديدة", pending_payment: "جديدة", paid: "جديدة",
  preparing: "قيد التحضير", ready: "جاهزة", out_for_delivery: "خرجت", delivered: "مكتملة", cancelled: "ملغاة",
};

type WaStatus = { configured: boolean; mode: string } | null;

export default function OperatorHomePage() {
  const router = useRouter();
  const role = useRole();
  const isManager = role === "manager";

  const orders = useOrderStore((s) => s.orders);
  const updateOrderStatus = useOrderStore((s) => s.updateOrderStatus);
  const conversations = useConversationStore((s) => s.conversations);
  const profile = useRestaurantStore((s) => s.profile);
  const currency = profile?.currency || "ج.م";

  // ops state (real, manager-gated route) — seeded from DB, mirrored to ops-store
  const setOpsOpen = useOpsStore((s) => s.setOpen);
  const setOpsAsst = useOpsStore((s) => s.setAgentEnabled);
  const [isOpen, setIsOpen] = useState(true);
  const [asstOn, setAsstOn] = useState(true);
  const [confirm, setConfirm] = useState<null | "close" | "pause">(null);
  const [savingOps, setSavingOps] = useState(false);

  const [wa, setWa] = useState<WaStatus>(null);
  const [readyOpen, setReadyOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [showNumbers, setShowNumbers] = useState(true);

  useEffect(() => {
    fetch("/api/settings/ops").then((r) => r.json()).then((d) => {
      if (typeof d.isOpen === "boolean") { setIsOpen(d.isOpen); setOpsOpen(d.isOpen); }
      if (typeof d.assistantOn === "boolean") { setAsstOn(d.assistantOn); setOpsAsst(d.assistantOn); }
    }).catch(() => {});
    fetch("/api/channels/whatsapp/status").then((r) => r.json()).then((d) => setWa({ configured: !!d.configured, mode: d.mode })).catch(() => setWa(null));
  }, [setOpsOpen, setOpsAsst]);

  // ---- real derived KPIs (today) -------------------------------------------
  const k = useMemo(() => {
    const since = startOfToday();
    const today = orders.filter((o) => o.createdAt >= since);
    const paid = today.filter((o) => o.paymentStatus === "paid");
    const revenue = paid.reduce((s, o) => s + Number(o.total || 0), 0);
    const count = today.length;
    const aov = count ? revenue / count : 0;
    const active = orders.filter((o) => ACTIVE.includes(o.orderStatus));
    const now = Date.now();
    const late = active.filter((o) => now - o.createdAt > LATE_MS);
    const pipeline = {
      new: active.filter((o) => isNew(o.orderStatus)).length,
      preparing: active.filter((o) => o.orderStatus === "preparing").length,
      ready: active.filter((o) => o.orderStatus === "ready").length,
      out: active.filter((o) => o.orderStatus === "out_for_delivery").length,
    };
    return { revenue, count, aov, active, late, paidShare: count ? paid.length / count : 0, pipeline };
  }, [orders]);

  const escalations = useMemo(
    () => conversations.filter((c) => c.owner === "human" || c.status === "يحتاج تدخل موظف" || c.status === "تم التحويل لموظف"),
    [conversations]
  );

  const liveQueue = useMemo(
    () => [...k.active].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4),
    [k.active]
  );

  // mode (partial-real): closed → مغلق, assistant off → متوقف; else live
  const mode = !isOpen ? "closed" : !asstOn ? "paused" : "live";

  // ---- ops handlers (real) -------------------------------------------------
  async function persistOps(patch: { isOpen?: boolean; assistantOn?: boolean }) {
    setSavingOps(true);
    try {
      const res = await fetch("/api/settings/ops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!res.ok) { // revert on rejection (e.g. non-manager 403)
        if (typeof patch.isOpen === "boolean") { setIsOpen(!patch.isOpen); setOpsOpen(!patch.isOpen); }
        if (typeof patch.assistantOn === "boolean") { setAsstOn(!patch.assistantOn); setOpsAsst(!patch.assistantOn); }
      }
    } catch { /* keep optimistic */ } finally { setSavingOps(false); }
  }
  const toggleOpen = () => {
    if (!isManager) return;
    if (isOpen) { setConfirm("close"); return; } // confirm the consequential direction
    setIsOpen(true); setOpsOpen(true); void persistOps({ isOpen: true });
  };
  const toggleAsst = () => {
    if (!isManager) return;
    if (asstOn) { setConfirm("pause"); return; }
    setAsstOn(true); setOpsAsst(true); void persistOps({ assistantOn: true });
  };
  const confirmYes = () => {
    if (confirm === "close") { setIsOpen(false); setOpsOpen(false); void persistOps({ isOpen: false }); }
    if (confirm === "pause") { setAsstOn(false); setOpsAsst(false); void persistOps({ assistantOn: false }); }
    setConfirm(null);
  };

  const printOrder = (id: string) => window.open(`/api/orders/${id}/image?kind=ticket&w=80mm`, "_blank", "noopener");
  const advance = (o: LocalOrder) => { const n = nextStatus(o.orderStatus); if (n) updateOrderStatus(o.id, n, "human"); };

  const waConnected = wa?.configured === true;

  return (
    <div dir="rtl" style={{ fontFamily: "'IBM Plex Sans Arabic', var(--font-arabic), sans-serif" }} className="text-[#1E2530]">
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* MODE BANNER (partial-real: closed/paused driven by real state) */}
      {mode !== "live" && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border px-4 py-3"
          style={mode === "closed"
            ? { background: "#F1F5F9", borderColor: "#E2E8F0" }
            : { background: "#F1F5F9", borderColor: "#E2E8F0" }}>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#94A3B8" }} />
          <span className="text-[13px] font-bold text-[#475569]">{mode === "closed" ? "المطعم مغلق" : "المساعد متوقف"}</span>
          <span className="flex-1 text-[13px] text-[#64748B]">
            {mode === "closed" ? "لا يستقبل المطعم طلبات جديدة — المساعد يرد على الأسئلة فقط." : "كل المحادثات تذهب للفريق حتى إعادة تشغيل المساعد."}
          </span>
          {isManager && (
            <button onClick={mode === "closed" ? toggleOpen : toggleAsst}
              className="rounded-lg bg-[#475569] px-4 py-2 text-[12.5px] font-semibold text-white">
              {mode === "closed" ? "فتح المطعم" : "تشغيل المساعد"}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* ============ CENTER ============ */}
        <div className="order-1 min-w-0 flex-1 lg:order-2">

          {/* CONTROL STRIP */}
          <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-[13px] border border-[#E2E8F0] bg-white px-3 py-2">
            {isManager ? (
              <div className="flex flex-1 flex-wrap items-center gap-2.5">
                <Switch on={isOpen} onClick={toggleOpen} label={isOpen ? "مفتوح" : "مغلق"} disabled={savingOps} />
                <Switch on={asstOn} onClick={toggleAsst} label={`المساعد ${asstOn ? "يعمل" : "متوقف"}`} disabled={savingOps} />
                {!isOpen && <span className="text-[11px] text-[#94A3B8]">المساعد يرد على الأسئلة، لا يستقبل طلبات</span>}
              </div>
            ) : (
              <div className="flex flex-1 flex-wrap items-center gap-2.5">
                <LockedControl label="مفتوح" />
                <LockedControl label="المساعد يعمل" />
                <span className="text-[11px] text-[#94A3B8]">هذه الضوابط تتطلب صلاحية المدير</span>
              </div>
            )}
            {/* readiness chip (presentational — real readiness in Layer 2) */}
            <button onClick={() => setReadyOpen((v) => !v)}
              className="flex items-center gap-2 whitespace-nowrap rounded-[22px] border border-[#D6E2FE] bg-[#EEF3FF] px-3 py-1.5 text-[12px] font-semibold text-[#1D4ED8]">
              <span className="inline-flex h-2 w-2 rounded-full bg-[#2563EB]" /> جاهزية المساعد
              <span className="rounded bg-white px-1.5 text-[10px] text-[#2563EB]">قريبًا</span>
            </button>
          </div>
          {readyOpen && (
            <div className="mb-4 rounded-[13px] border border-[#E2E8F0] bg-white p-4 text-[12.5px] text-[#64748B]">
              قائمة جاهزية التشغيل (واتساب · المنيو · مناطق التوصيل · طلب اختبار) — <span className="font-semibold text-[#B45309]">تُحسب تلقائياً في التحديث القادم.</span>
            </div>
          )}

          {/* PULSE ROW (real KPIs) */}
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[11px] font-bold tracking-wide text-[#64748B]">نبض المطعم</span>
            <span className="h-px flex-1 bg-[#E2E8F0]" />
          </div>
          <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-[1.6fr_1fr_1fr_1fr_1fr]">
            {/* revenue */}
            <button onClick={() => setDrawer(true)} className="col-span-2 overflow-hidden rounded-[13px] p-3.5 text-right text-white md:col-span-3 xl:col-span-1"
              style={{ background: "linear-gradient(150deg,#2D6BF0,#1D4ED8)", boxShadow: "0 10px 22px rgba(37,99,235,.26)" }}>
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="text-[11.5px] opacity-85">إيراد اليوم</div>
                  <div className="mt-1 text-[25px] font-bold leading-tight">{money(k.revenue)} <span className="text-[14px] font-medium opacity-85">{currency}</span></div>
                  <div className="mt-1.5 text-[10.5px] opacity-80">{toAr(k.count)} طلب اليوم · نسبة المدفوع {toAr(Math.round(k.paidShare * 100))}٪</div>
                </div>
                <Ring pct={k.paidShare} />
              </div>
            </button>
            <Kpi label="طلبات اليوم" value={toAr(k.count)} sub={`${toAr(k.active.length)} قيد التنفيذ الآن`} />
            <Kpi label="تحتاج تدخّل" value={toAr(escalations.length)} valueColor={escalations.length ? "#F59E0B" : "#16A34A"}
              dot={escalations.length ? "#F59E0B" : "#16A34A"} sub={escalations.length ? "محادثات بانتظار موظف" : "كل المحادثات تحت السيطرة"} />
            <Kpi label="متأخرة" value={toAr(k.late.length)} valueColor={k.late.length ? "#E11D48" : "#16A34A"}
              dot={k.late.length ? "#E11D48" : "#16A34A"} sub={k.late.length ? "تجاوزت ٣٠ دقيقة" : "لا طلبات متأخرة"} />
            <Kpi label="متوسط قيمة الطلب" value={`${money(k.aov)}`} unit={currency} muted sub="لكل طلب اليوم" />
          </div>

          {/* ASSISTANT THREAD (presentational — Layer 2) */}
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[11px] font-bold tracking-wide text-[#64748B]">إحاطة المساعد</span>
            <span className="h-px flex-1 bg-[#E2E8F0]" />
            <span className="rounded bg-[#EEF3FF] px-2 py-0.5 text-[10px] font-semibold text-[#2563EB]">معاينة · قريبًا</span>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="min-w-0 space-y-3">
              <Bubble>
                صباح الخير 👋 — هذه إحاطة تجريبية. في التحديث القادم سيلخّص «كريم» يومك الحقيقي (الطلبات، التصعيدات، والفرص) ويقترح خطوات بنقرة واحدة.
              </Bubble>
              {/* advisor nudge */}
              <div className="rounded-[4px_16px_16px_16px] border border-[#D6E2FE] bg-[#EEF3FF] p-3.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-bold tracking-wide text-[#2563EB]">مستشار العروض</span>
                  <span className="rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-[#2563EB]">مثال</span>
                </div>
                <div className="text-[13.5px] leading-relaxed text-[#28354a]">تحليل أيامك الأضعف وأوقات الركود لاقتراح عرض مناسب — يصل قريبًا.</div>
                <div className="mt-2.5 flex justify-end">
                  <Link href="/maitre" className="rounded-lg bg-[#2563EB] px-3.5 py-1.5 text-[12px] font-semibold text-white">جرّب المساعد الآن</Link>
                </div>
              </div>
              {/* daily review */}
              <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white" style={{ boxShadow: "0 8px 22px rgba(20,32,60,.07)" }}>
                <div className="flex items-center gap-2 border-b border-[#EEF1F5] px-4 py-3">
                  <span className="text-[14px] font-bold">مراجعة اليوم — لاحظتُ…</span>
                  <span className="rounded bg-[#EEF3FF] px-2 py-0.5 text-[10px] font-semibold text-[#2563EB]">قريبًا</span>
                </div>
                <div className="px-4">
                  {["تكرار طلب صنف غير موجود", "تخلّي بعد رسوم توصيل منطقة", "صنف أكثر طلبًا بدون صورة"].map((t, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 border-b border-[#F4F6F9] py-2.5 last:border-0">
                      <span className="text-[13px] text-[#28354a]">{t} <span className="text-[#94A3B8]">(مثال)</span></span>
                      <button disabled className="cursor-not-allowed rounded-lg bg-[#F1F4F9] px-3 py-1.5 text-[12px] font-semibold text-[#94A3B8]">معاينة قريبًا</button>
                    </div>
                  ))}
                </div>
                <div className="bg-[#F8FAFC] px-4 py-2 text-[11px] text-[#94A3B8]">كل إجراء سيفتح معاينة قبل التنفيذ — لا تغيير دون تأكيدك. (يُفعّل في التحديث القادم)</div>
              </div>
              {/* ASK */}
              <div className="flex items-center gap-3 rounded-[4px_16px_16px_16px] border border-dashed border-[#D6E2FE] bg-white p-3">
                <span className="flex-1 text-[14px] text-[#28354a]">أسئلة المساعد الاستباقية (مثل رسائل الشكر للعملاء العائدين) — قريبًا.</span>
                <button disabled className="cursor-not-allowed rounded-lg bg-[#F1F4F9] px-4 py-1.5 text-[12.5px] font-semibold text-[#94A3B8]">قريبًا</button>
              </div>
            </div>
            {/* reports rail (presentational) */}
            <div className="space-y-3 rounded-2xl border border-[#EEF1F5] bg-[#FAFBFC] p-3.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#64748B]"><span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" />تقرير المساعد · اليوم <span className="rounded bg-[#EEF3FF] px-1.5 text-[10px] text-[#2563EB]">قريبًا</span></div>
              <div className="rounded-2xl border border-[#C6EFD4] bg-[#F0FBF4] p-4 text-[12.5px] text-[#3f6b4f]">
                <div className="mb-2 text-[14px] font-bold text-[#15803D]">جودة الخدمة اليوم</div>
                مقاييس جودة الردود (نسبة الرد ضمن المهلة · زمن أول رد · التصعيدات الآمنة) — تُعرض هنا قريبًا من بيانات حقيقية.
              </div>
              <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4 text-[12.5px] text-[#64748B]">
                <div className="mb-2 text-[14px] font-bold text-[#1E2530]">ملخص اليوم</div>
                محادثات تمّت · مبيعات بمساعدة المساعد · طلبات تعافت — ملخص حي قريبًا.
              </div>
            </div>
          </div>

          {/* command bar → preserved console */}
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-white p-2 pr-4" style={{ boxShadow: "0 4px 14px rgba(20,32,60,.05)" }}>
            <Link href="/maitre" className="flex-1 text-[14.5px] text-[#94A3B8]">اكتب أمرك للمساعد…</Link>
            <Link href="/maitre" className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2563EB] text-white"><Send className="h-5 w-5" /></Link>
          </div>
        </div>

        {/* ============ RIGHT RAIL ============ */}
        <aside className="order-2 space-y-3 rounded-2xl border border-[#E2E8F0] bg-white p-3.5 lg:order-1 lg:w-[248px] lg:flex-none">
          {/* live indicator */}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[11px] text-[#64748B]">
              <span className="relative h-2 w-2"><span className="hm-live-dot absolute inset-0 rounded-full" style={{ background: "#16A34A", animation: "livePulseDot 2.2s ease-in-out infinite" }} /></span>
              مباشر · آخر تحديث الآن
            </span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: mode === "live" ? "#15803D" : "#475569", background: mode === "live" ? "#DCFCE7" : "#F1F5F9" }}>{mode === "live" ? "مباشر" : mode === "closed" ? "مغلق" : "متوقف"}</span>
          </div>

          {/* needs you — escalations (real) */}
          <div>
            <div className="text-[13px] font-bold">يحتاجك الآن</div>
            <div className="mb-2 text-[11px] text-[#94A3B8]">{escalations.length ? `${toAr(escalations.length)} تصعيد` : "لا تصعيدات"} · {k.late.length ? `${toAr(k.late.length)} متأخر` : "لا تأخير"}</div>
            {escalations.slice(0, 3).map((c) => (
              <button key={c.id} onClick={() => router.push("/conversations")}
                className="mb-2 block w-full rounded-[13px] border border-[#FBE2C2] bg-[#FFF7ED] p-2.5 text-right">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold">{c.customer}</span>
                  <span className="rounded bg-[#FEF3E2] px-1.5 text-[9.5px] text-[#B45309]">{c.status === "تم التحويل لموظف" ? "محوّل" : "تصعيد"}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-[#94A3B8]">{c.escalationReason || c.lastMessage || "بانتظار رد الموظف"}</div>
                {/* suggested reply — PRESENTATIONAL (Layer 2 wires the Brain) */}
                <div className="mt-2 rounded-lg border border-dashed border-[#E2E8F0] bg-white p-2">
                  <div className="text-[10px] text-[#94A3B8]">رد مقترح من المساعد · قريبًا</div>
                  <div className="mt-1 flex gap-1.5">
                    <span className="rounded bg-[#F1F4F9] px-2.5 py-1 text-[11px] font-semibold text-[#94A3B8]">أرسل (قريبًا)</span>
                    <span className="rounded border border-[#E2E8F0] px-2.5 py-1 text-[11px] text-[#64748B]">افتح المحادثة</span>
                  </div>
                </div>
              </button>
            ))}
            {escalations.length === 0 && <div className="rounded-[13px] border border-[#D6F0DE] bg-[#F0FBF4] p-3 text-[12px] text-[#15803D]">كل المحادثات تحت السيطرة ✓</div>}
            {k.late.slice(0, 1).map((o) => (
              <div key={o.id} className="hm-breach mt-2 rounded-[13px] border border-[#FBD0D0] bg-[#FEF2F2] p-2.5" style={{ animation: "breachPulse 2s ease-in-out infinite" }}>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold text-[#BE123C]">طلب متأخر</span>
                  <span dir="ltr" className="text-[11.5px] text-[#94A3B8]">#{o.orderNumber}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-[#94A3B8]">متأخر +{toAr(Math.round((Date.now() - o.createdAt) / 60000))} د · {STATUS_AR[o.orderStatus]}</div>
              </div>
            ))}
          </div>

          {/* LIVE ORDERS (real: accept/advance/print) */}
          <div>
            <div className="mb-2 text-[11px] font-bold text-[#475569]">الطلبات المباشرة</div>
            <Pipeline p={k.pipeline} />
            {liveQueue.length === 0 && <div className="rounded-[11px] border border-[#EEF1F5] bg-[#F8FAFC] p-3 text-center text-[11.5px] text-[#94A3B8]">لا طلبات نشطة الآن</div>}
            {liveQueue.map((o) => (
              <div key={o.id} className="mb-2 rounded-[11px] border border-[#EEF1F5] bg-[#F8FAFC] p-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <span dir="ltr" className="text-[12px] font-bold">#{o.orderNumber}</span>
                  <span className="rounded bg-[#EEF3FF] px-1.5 py-0.5 text-[9.5px] text-[#2563EB]">{STATUS_AR[o.orderStatus]}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {isNew(o.orderStatus) && <button onClick={() => advance(o)} className="flex-1 rounded-md bg-[#2563EB] py-1.5 text-[11px] font-semibold text-white">قبول</button>}
                  {!isNew(o.orderStatus) && nextStatus(o.orderStatus) && <button onClick={() => advance(o)} className="flex-1 rounded-md border border-[#C9D8F7] bg-white py-1.5 text-[11px] font-semibold text-[#2563EB]">تقدّم</button>}
                  <button onClick={() => printOrder(o.id)} className="flex flex-[1.2] items-center justify-center gap-1 rounded-md border border-[#C9D8F7] bg-white py-1.5 text-[10.5px] font-semibold text-[#2563EB]"><Printer className="h-3 w-3" /> طباعة</button>
                </div>
                <div className="mt-1.5 text-[10px] text-[#94A3B8]">{o.customerName} · {money(o.total)} {currency}</div>
              </div>
            ))}
          </div>

          {/* today in numbers (collapsible, presentational) */}
          <div>
            <button onClick={() => setShowNumbers((v) => !v)} className="flex w-full items-center justify-between text-[11px] font-bold text-[#475569]">
              <span>اليوم في أرقام</span><span className="text-[10px] text-[#94A3B8]">{showNumbers ? "▾" : "◂"}</span>
            </button>
            {showNumbers && <div className="mt-2 rounded-[11px] border border-[#EEF1F5] bg-[#F8FAFC] p-2.5 text-[11.5px] text-[#94A3B8]">تفصيلات (أكثر صنف · أوقات الذروة · العائدون) — قريبًا.</div>}
          </div>

          {/* system status (real where available) */}
          <div>
            <div className="mb-2 text-[11px] font-bold text-[#475569]">حالة النظام</div>
            <div className="space-y-2 text-[12.5px]">
              <StatusDot color={isOpen ? "#16A34A" : "#94A3B8"} label={isOpen ? "المطعم مفتوح" : "المطعم مغلق"} />
              <StatusDot color={asstOn ? "#16A34A" : "#94A3B8"} label={asstOn ? "المساعد يعمل" : "المساعد متوقف"} />
              <div className="flex items-center justify-between rounded-lg border px-2.5 py-1.5"
                style={{ background: waConnected ? "#F0FBF4" : "#FFF7ED", borderColor: waConnected ? "#D6F0DE" : "#FBE2C2" }}>
                <span className="flex items-center gap-2" style={{ color: waConnected ? "#15803D" : "#B45309" }}><span className="h-2 w-2 rounded-full" style={{ background: waConnected ? "#16A34A" : "#F59E0B" }} />واتساب</span>
                <span className="text-[10.5px] font-semibold" style={{ color: waConnected ? "#15803D" : "#B45309" }}>{wa == null ? "…" : waConnected ? "متصل" : "غير مُهيأ"}</span>
              </div>
              {/* printer: no real health signal → honest "presentational" */}
              <div className="flex items-center justify-between rounded-lg border border-[#EEF1F5] bg-[#F8FAFC] px-2.5 py-1.5">
                <span className="flex items-center gap-2 text-[#64748B]"><span className="h-2 w-2 rounded-full bg-[#CBD5E1]" />الطابعة</span>
                <span className="text-[10.5px] text-[#94A3B8]">غير مُتتبَّعة</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* confirm dialog (real, consequential direction) */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirm(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-5">
            <div className="text-[15px] font-bold">{confirm === "close" ? "إغلاق المطعم؟" : "إيقاف المساعد؟"}</div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#64748B]">
              {confirm === "close" ? "لن يستقبل المطعم طلبات جديدة. سيظل المساعد يرد على الأسئلة فقط." : "كل المحادثات الواردة ستتحوّل إلى فريقك مباشرة حتى إعادة التشغيل."}
            </p>
            <div className="mt-4 flex gap-2">
              <button onClick={confirmYes} className="flex-1 rounded-lg py-2.5 text-[13px] font-semibold text-white" style={{ background: confirm === "close" ? "#E11D48" : "#475569" }}>
                {confirm === "close" ? "تأكيد الإغلاق" : "تأكيد الإيقاف"}
              </button>
              <button onClick={() => setConfirm(null)} className="flex-1 rounded-lg border border-[#E2E8F0] py-2.5 text-[13px] text-[#475569]">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* revenue drawer (real total; charts presentational) */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={() => setDrawer(false)} />
          <div className="hm-scroll w-[min(440px,90vw)] overflow-auto bg-white p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[12px] text-[#94A3B8]">تفاصيل الإيراد · اليوم</div>
                <div className="mt-1 text-[22px] font-bold">{money(k.revenue)} <span className="text-[14px] font-medium text-[#64748B]">{currency}</span></div>
              </div>
              <button onClick={() => setDrawer(false)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E8F0] text-[#64748B]"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <MiniStat label="طلبات اليوم" value={toAr(k.count)} />
              <MiniStat label="متوسط الطلب" value={`${money(k.aov)} ${currency}`} />
              <MiniStat label="قيد التنفيذ" value={toAr(k.active.length)} />
              <MiniStat label="متأخرة" value={toAr(k.late.length)} />
            </div>
            <p className="mt-5 rounded-xl border border-[#EEF1F5] bg-[#F8FAFC] p-3 text-[12px] text-[#94A3B8]">الرسوم البيانية التفصيلية (حسب الساعة · طريقة الاستلام · الدفع · أعلى الأصناف) تصل في التحديث القادم.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- small presentational pieces ------------------------------------------
function Switch({ on, onClick, label, disabled }: { on: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="flex items-center gap-2 rounded-[22px] border px-3 py-1.5 disabled:opacity-60"
      style={{ background: on ? "#ECFDF3" : "#F1F5F9", borderColor: on ? "#BBF7D0" : "#E2E8F0" }}>
      <span className="relative h-[18px] w-[30px] rounded-full" style={{ background: on ? "#16A34A" : "#CBD5E1" }}>
        <span className="absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow" style={on ? { left: 2 } : { right: 2 }} />
      </span>
      <span className="whitespace-nowrap text-[12.5px] font-semibold" style={{ color: on ? "#15803D" : "#64748B" }}>{label}</span>
    </button>
  );
}
function LockedControl({ label }: { label: string }) {
  return (
    <span title="صلاحية المدير" className="flex cursor-not-allowed items-center gap-1.5 rounded-[22px] border border-[#E2E8F0] bg-[#F1F4F9] px-3 py-1.5 text-[#94A3B8]">
      <Lock className="h-3 w-3" /><span className="text-[12.5px] font-semibold">{label}</span>
    </span>
  );
}
function Ring({ pct }: { pct: number }) {
  const C = 163.363, off = C * (1 - Math.max(0, Math.min(1, pct)));
  return (
    <svg width="48" height="48" viewBox="0 0 60 60" style={{ transform: "rotate(-90deg)", flex: "0 0 auto" }}>
      <circle cx="30" cy="30" r="26" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="6" />
      <circle cx="30" cy="30" r="26" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} />
    </svg>
  );
}
function Kpi({ label, value, unit, sub, valueColor, dot, muted }: { label: string; value: string; unit?: string; sub?: string; valueColor?: string; dot?: string; muted?: boolean }) {
  return (
    <div className="rounded-[13px] border p-3" style={{ background: muted ? "#F8FAFC" : "#fff", borderColor: muted ? "#EEF1F5" : "#E2E8F0" }}>
      <div className="text-[11.5px] text-[#64748B]">{label}</div>
      <div className="mt-1 flex items-center gap-1.5">
        {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}
        <span className="text-[20px] font-bold" style={{ color: valueColor || (muted ? "#334155" : "#1E2530") }}>{value}{unit && <span className="text-[12px] font-medium text-[#94A3B8]"> {unit}</span>}</span>
      </div>
      {sub && <div className="mt-1.5 text-[10.5px] text-[#94A3B8]">{sub}</div>}
    </div>
  );
}
function Pipeline({ p }: { p: { new: number; preparing: number; ready: number; out: number } }) {
  const total = Math.max(1, p.new + p.preparing + p.ready + p.out);
  const seg = (n: number, c: string) => <div style={{ flex: Math.max(0.4, n), }}><div className="h-1.5 rounded" style={{ background: c }} /></div>;
  return (
    <>
      <div className="mb-1.5 flex gap-1">{seg(p.new, "#2563EB")}{seg(p.preparing, "#60A5FA")}{seg(p.ready, "#16A34A")}{seg(p.out, "#CBD5E1")}</div>
      <div className="mb-2.5 flex justify-between text-[10.5px] text-[#94A3B8]">
        <span className="text-[#2563EB]">جديدة {toAr(p.new)}</span><span className="text-[#2563EB]">تحضير {toAr(p.preparing)}</span>
        <span className="text-[#16A34A]">جاهزة {toAr(p.ready)}</span><span>خرجت {toAr(p.out)}</span>
      </div>
    </>
  );
}
function StatusDot({ color, label }: { color: string; label: string }) {
  return <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: color }} />{label}</div>;
}
function Bubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl text-white" style={{ background: "linear-gradient(150deg,#2D6BF0,#1D4ED8)" }}>ك</div>
      <div className="rounded-[4px_16px_16px_16px] border border-[#E2E8F0] bg-white p-3.5 text-[14px] leading-loose text-[#28354a]">{children}</div>
    </div>
  );
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-[#EEF1F5] bg-[#F8FAFC] p-3"><div className="text-[19px] font-bold">{value}</div><div className="mt-0.5 text-[11px] text-[#94A3B8]">{label}</div></div>;
}
