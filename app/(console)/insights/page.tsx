"use client";

// ============================================================================
// Kivo — الرؤى (Insights). SPEC 04, the money story. Inside <ConsoleLayout>.
//
// TRUTH-SYSTEM IS THE WHOLE JOB. Every number traces to a real source or renders
// honestly as gathering/coming. Nothing from the mockup ships as-is.
//
// Resolved truth-states (audited — see PR notes):
//  LIVE (real from order-store + conversation-store):
//   • محادثات كريم (conversation count), طلبات قفلها كريم (delivered orders),
//     نسبة التحويل (delivered ÷ conversations), طلبات مش مكتملة (intent w/o
//     completed order), week trend (orders/day), funnel endpoints (بدأت/طلب تمّ),
//     أداء كريم: بدون تدخّل % + اتصعّدت % (countEscalations) + عملاء عائدون %
//     (repeat customers by customerId), satisfaction PROGRESS count.
//  GATHERING (real metric, not enough volume / not configured → skeleton, no #):
//   • الهامش المسترجَع (no aggregator-commission config — never hardcode 30%),
//     نبض رضا العملاء (volume-gated), momentum history, top-converter attribution,
//     funnel middle stages (مهتم/عمل سلة/أكّد — no intent-transition tracking),
//     متوسط زمن الرد (timestamps not reliable client-side).
//  COMING (engine not built → dashed قريباً, no #):
//   • ليه الطلبات ما بتكملش (leakage→action, V2), ذكاء المحادثة المتقدّم,
//     goal ring + milestone (no real goal/saved-conversation metric).
//  DELTAS/sparklines: only the delivered-orders prior-period delta is real here;
//  all other fabricated «+N٪» deltas are omitted.
//
// Range is a local Insights control (default 7d) — the shared shell topbar isn't
// modified. Order metrics scope by order.createdAt; conversation metrics scope by
// message createdAtMs when present, else count all (demo fallback).
// ============================================================================

import { useMemo, useState } from "react";
import { useOrderStore } from "@/lib/order-store";
import { useConversationStore } from "@/lib/conversation-store";
import { useHasHydrated } from "@/lib/store";
import { countEscalations } from "@/lib/escalation";
import { CountUp, useRiseIn, StatePill } from "@/components/kivo";
import type { LocalOrder, Conversation } from "@/lib/types";

const AR = "٠١٢٣٤٥٦٧٨٩";
const toAr = (n: number | string) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const sep = (n: number) => toAr(Math.round(n).toLocaleString("en-US")).replace(/,/g, "٬");
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const DAY_MS = 86400000;

type Range = "7d" | "30d" | "all";
const RANGE_DAYS: Record<Range, number | null> = { "7d": 7, "30d": 30, all: null };
const RANGE_LABEL: Record<Range, string> = { "7d": "آخر ٧ أيام", "30d": "آخر ٣٠ يوم", all: "كل الفترة" };

const SAT_THRESHOLD = 200; // satisfaction trend unlocks at this conversation volume

// a conversation's activity time = latest message epoch, when the data carries it
function convTime(c: Conversation): number | undefined {
  for (let i = c.messages.length - 1; i >= 0; i--) {
    const ms = c.messages[i].createdAtMs;
    if (ms) return ms;
  }
  return undefined;
}
// intent/cart signal without a completed order (best-effort, real fields only)
function hasOpenIntent(c: Conversation): boolean {
  return !!(c.draftOrder || c.linkedOrderId || c.status === "طلب قيد البناء" || c.status === "بانتظار الدفع");
}

export default function InsightsPage() {
  const hydrated = useHasHydrated();
  const orders = useOrderStore((s) => s.orders);
  const conversations = useConversationStore((s) => s.conversations);
  const [range, setRange] = useState<Range>("7d");

  const m = useMemo(() => {
    const days = RANGE_DAYS[range];
    const now = Date.now();
    const since = days != null ? now - days * DAY_MS : 0;
    const prevSince = days != null ? since - days * DAY_MS : 0;

    const orderIn = (o: LocalOrder, from: number, to: number) => o.createdAt >= from && o.createdAt < to;
    const ordersInRange = orders.filter((o) => o.createdAt >= since);
    const deliveredInRange = ordersInRange.filter((o) => o.orderStatus === "delivered");
    const deliveredPrev = days != null ? orders.filter((o) => orderIn(o, prevSince, since) && o.orderStatus === "delivered").length : 0;

    // conversations: scope by activity time when the data has it; else count all (demo)
    const anyConvTs = conversations.some((c) => convTime(c) != null);
    const convInRange = conversations.filter((c) => {
      if (!anyConvTs) return true;
      const t = convTime(c);
      return t != null && t >= since;
    });

    const convCount = convInRange.length;
    const deliveredCount = deliveredInRange.length;
    const conversion = convCount > 0 ? Math.round((deliveredCount / convCount) * 100) : null;
    const incomplete = convInRange.filter((c) => {
      if (!hasOpenIntent(c)) return false;
      const linked = c.linkedOrderId ? orders.find((o) => o.id === c.linkedOrderId) : undefined;
      return !(linked && linked.orderStatus === "delivered");
    }).length;

    const escalated = countEscalations(convInRange);
    const handledPct = convCount > 0 ? Math.round(((convCount - escalated) / convCount) * 100) : null;
    const escalatedPct = convCount > 0 ? Math.round((escalated / convCount) * 100) : null;

    // returning customers from real order→customer linkage
    const byCustomer = new Map<string, number>();
    for (const o of ordersInRange) if (o.customerId) byCustomer.set(o.customerId, (byCustomer.get(o.customerId) ?? 0) + 1);
    const distinct = byCustomer.size;
    const returning = [...byCustomer.values()].filter((n) => n >= 2).length;
    const returningPct = distinct > 0 ? Math.round((returning / distinct) * 100) : null;

    // daily orders series (real) over the range (cap to 14 buckets for "all")
    const bucketDays = days ?? Math.min(14, Math.max(1, Math.ceil((now - (orders.reduce((min, o) => Math.min(min, o.createdAt), now))) / DAY_MS) || 1));
    const daily: { day: number; orders: number; delivered: number }[] = [];
    for (let i = bucketDays - 1; i >= 0; i--) {
      const from = now - (i + 1) * DAY_MS;
      const to = now - i * DAY_MS;
      const inDay = orders.filter((o) => o.createdAt >= from && o.createdAt < to);
      daily.push({ day: to, orders: inDay.length, delivered: inDay.filter((o) => o.orderStatus === "delivered").length });
    }
    const bestDay = daily.reduce((b, d) => (d.orders > b.orders ? d : b), daily[0] ?? { day: now, orders: 0, delivered: 0 });

    // period label from the real range
    const startD = new Date(since || (orders.length ? Math.min(...orders.map((o) => o.createdAt)) : now));
    const endD = new Date(now);
    const periodLabel = days != null
      ? `${toAr(startD.getDate())} — ${toAr(endD.getDate())} ${MONTHS[endD.getMonth()]}`
      : "كل الفترة";

    return {
      convCount, deliveredCount, conversion, incomplete, deliveredDelta: deliveredPrev > 0 ? Math.round(((deliveredCount - deliveredPrev) / deliveredPrev) * 100) : null,
      handledPct, escalatedPct, returningPct, daily, bestDay, periodLabel,
      satProgress: conversations.length, // real progress toward the satisfaction threshold
    };
  }, [orders, conversations, range]);

  const rHead = useRiseIn(0); const rKpi = useRiseIn(1); const rGoal = useRiseIn(2);
  const rChart = useRiseIn(3); const rLower = useRiseIn(4); const rGather = useRiseIn(5); const rComing = useRiseIn(6);

  if (!hydrated) {
    return <div style={{ maxWidth: 1400, margin: "0 auto", padding: 40, color: "var(--kv-faint)", fontWeight: 600 }}>بنحمّل…</div>;
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", color: "var(--kv-text)", display: "flex", flexDirection: "column", gap: 18 }}>
      {/* HEADER */}
      <header style={{ ...rHead.style, display: "flex", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
        <div>
          <span style={{ display: "inline-flex", alignItems: "center", height: 24, padding: "0 11px", borderRadius: 99, background: "rgba(14,159,110,.10)", color: "var(--kv-deep)", fontSize: 10.5, fontWeight: 800 }}>الرؤى · مؤشرات Kivo</span>
          <h1 style={{ fontSize: 25, fontWeight: 800, margin: "11px 0 0" }}>كريم هذا الأسبوع</h1>
          <p style={{ fontSize: 12.5, color: "var(--kv-muted)", fontWeight: 600, margin: "6px 0 0", maxWidth: 560, lineHeight: 1.6 }}>
            قصة أسبوع من شغل كريم — قد إيه رجّع لك، وفين الطلبات بتفلت. كل رقم هنا حقيقي ومن طلبات كريم بس؛ واللي لسه بنجمعه بيتعرض بأمانة.
          </p>
        </div>
        {/* period chip — cycles the REAL range; label is computed, not hardcoded */}
        <button
          onClick={() => setRange((r) => (r === "7d" ? "30d" : r === "30d" ? "all" : "7d"))}
          style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: 8, height: 32, padding: "0 13px", borderRadius: 99, background: "var(--kv-card)", border: "1px solid var(--kv-border)", cursor: "pointer", fontFamily: "inherit" }}
        >
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--kv-faint)" }}>{RANGE_LABEL[range]}</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: "#3e4b45", direction: "rtl" }}>{m.periodLabel}</span>
        </button>
      </header>

      {/* KPI STRIP */}
      <section style={{ ...rKpi.style, display: "grid", gridTemplateColumns: "1.28fr 1fr 1fr 1fr 1fr", gap: 13 }}>
        {/* margin recovered — GATHERING (no commission config; never hardcode) */}
        <div style={{ borderRadius: 16, padding: "15px 16px", background: "linear-gradient(155deg,#ffffff,#eef9f4)", border: "1px solid rgba(14,159,110,.22)", boxShadow: "0 14px 34px -28px rgba(14,159,110,.45)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "var(--kv-deep)" }}>الهامش المسترجَع</span>
            <StatePill state="gathering" />
          </div>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 7 }}>
            <KvSkeleton w="70%" h={18} />
            <div style={{ fontSize: 10, color: "var(--kv-faint)", fontWeight: 700, lineHeight: 1.5 }}>محتاج إعداد نسبة عمولة التطبيقات قبل ما نحسبه — مش هنخمّن رقم.</div>
          </div>
        </div>
        <KpiTile label="مؤشر تحويل تقريبي" value={m.conversion} suffix="٪" />
        <KpiTile label="محادثات كريم" value={m.convCount} />
        <KpiTile label="طلبات مكتملة عبر Kivo" value={m.deliveredCount} delta={m.deliveredDelta} />
        <KpiTile label="طلبات مش مكتملة" value={m.incomplete} />
      </section>

      {/* GOAL / MOMENTUM / MILESTONE */}
      <section style={{ ...rGoal.style, display: "grid", gridTemplateColumns: "1.05fr 1fr 1.25fr", gap: 13 }}>
        {/* goal ring — COMING (no real weekly goal config) */}
        <ComingCard title="هدف الأسبوع" body="هندّد هدف تحويل أسبوعي حقيقي تقدر تظبّطه — من غير رقم وهمي قبلها." />
        {/* momentum — GATHERING (no multi-week history yet) */}
        <div style={{ borderRadius: 16, padding: "14px 16px", background: "var(--kv-card)", border: "1px solid var(--kv-border)", boxShadow: "var(--kv-shadow-panel)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: "#3e4b45" }}>زخم التحسّن</span>
            <StatePill state="gathering" />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 34, marginTop: 14 }}>
            {[42, 60, 52, 74].map((h, i) => <div key={i} className="kv-skeleton" style={{ flex: 1, height: `${h}%`, borderRadius: "4px 4px 0 0" }} />)}
          </div>
          <div style={{ fontSize: 10, color: "var(--kv-faint)", fontWeight: 700, marginTop: 8 }}>محتاج تاريخ أسابيع كفاية قبل ما نعرض الاتجاه.</div>
        </div>
        {/* milestone — COMING (no saved-conversation spine metric) */}
        <ComingCard title="إنجاز الأسبوع" body="«كريم أنقذ N محادثة» هيتعرض أول ما المقياس ده يبقى حقيقي من السباين." />
      </section>

      {/* TREND + FUNNEL */}
      <section style={{ ...rChart.style, display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 13 }}>
        {/* week trend — orders/day LIVE */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <h2 style={{ fontSize: 14.5, fontWeight: 800, margin: 0 }}>حركة الأسبوع</h2>
            <Tag>حقائق</Tag>
            <div style={{ marginInlineStart: "auto", display: "flex", gap: 13 }}>
              <Legend color="var(--kv-primary)" label="طلبات/يوم" />
            </div>
          </div>
          <TrendChart daily={m.daily} />
          <div style={{ marginTop: 8, fontSize: 10.5, fontWeight: 700, color: "var(--kv-muted)" }}>
            أفضل يوم: {toAr(m.bestDay?.orders ?? 0)} طلب · {toAr(m.bestDay?.delivered ?? 0)} اتسلّم
          </div>
          <div style={{ marginTop: 6, fontSize: 9.5, color: "var(--kv-faint)", fontWeight: 600 }}>
            خط المحادثات/يوم هيتعرض أول ما تكون توقيتات المحادثات متاحة — مش هنرسم خط من غير داتا.
          </div>
        </Card>

        {/* funnel — endpoints LIVE, middle GATHERING */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <h2 style={{ fontSize: 14.5, fontWeight: 800, margin: 0, whiteSpace: "nowrap" }}>رحلة الطلب</h2>
            <span style={{ marginInlineStart: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, color: "var(--kv-muted)" }}>
              <span className="kv-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--kv-primary)" }} /> من {toAr(m.convCount)} محادثة
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <FunnelRow label="بدأت" value={m.convCount} pct={100} tone="primary" />
            {/* middle stages: no intent-transition tracking → gathering, no fabricated numbers */}
            <FunnelGatherRow label="مهتم" />
            <FunnelGatherRow label="عمل سلة" />
            <FunnelGatherRow label="أكّد" />
            <FunnelRow label="طلب تمّ" value={m.deliveredCount} pct={m.convCount > 0 ? Math.round((m.deliveredCount / m.convCount) * 100) : 0} tone="primary" />
          </div>
          <div style={{ marginTop: 13, borderRadius: 11, border: "1px dashed rgba(100,116,139,.3)", background: "rgba(100,116,139,.05)", padding: "9px 11px", fontSize: 10.5, color: "var(--kv-slate)", fontWeight: 600, lineHeight: 1.5 }}>
            مراحل النص (مهتم/سلة/أكّد) محتاجة تتبّع نوايا من السباين — بنعرضها فاضية لحد ما تبقى حقيقية، من غير أرقام مخمّنة.
          </div>
        </Card>
      </section>

      {/* LOWER GRID */}
      <section style={{ ...rLower.style, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 13 }}>
        {/* top converters — GATHERING (no per-item attribution) */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>أعلى الأصناف تحويلاً</h2>
            <span style={{ marginInlineStart: "auto" }}><StatePill state="gathering" /></span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 10px", borderRadius: 12, background: "var(--kv-card-soft)", border: "1px solid var(--kv-border)" }}>
                <div className="kv-skeleton" style={{ width: 28, height: 28, borderRadius: 9 }} />
                <div style={{ flex: 1 }}><KvSkeleton w="60%" h={10} /></div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, fontSize: 10, color: "var(--kv-faint)", fontWeight: 700, lineHeight: 1.5 }}>محتاج ربط التحويل بكل صنف من المنيو قبل العرض.</div>
        </Card>

        {/* leakage reasons — COMING (V2 leakage→action engine) */}
        <div style={{ position: "relative", overflow: "hidden", borderRadius: 16, border: "1.5px dashed rgba(100,116,139,.35)", background: "repeating-linear-gradient(135deg,rgba(100,116,139,.035),rgba(100,116,139,.035) 12px,transparent 12px,transparent 24px),#fbfcfc", padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: "#51637a" }}>ليه الطلبات ما بتكملش</h2>
            <span style={{ marginInlineStart: "auto" }}><StatePill state="coming" /></span>
          </div>
          <p style={{ fontSize: 11, color: "var(--kv-faint)", fontWeight: 600, lineHeight: 1.6, margin: 0 }}>
            تفصيل أسباب الفقد + إجراء مقترح لكل سبب (محرّك «الفقد→إجراء») لسه على خريطة الطريق. مفيش أرقام مخمّنة هنا — هتشتغل أول ما المحرّك يجهز.
          </p>
        </div>

        {/* performance — LIVE cells where countable, GATHERING for avg-response */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>أداء كريم</h2>
            <Tag>حقائق</Tag>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <PerfCell value={m.handledPct} suffix="٪" label="اتعاملت بدون تدخّل" />
            <PerfCell value={m.escalatedPct} suffix="٪" label="اتصعّدت للفريق" />
            <PerfGatherCell label="متوسط زمن الرد" />
            <PerfCell value={m.returningPct} suffix="٪" label="عملاء عائدون" />
          </div>
        </Card>
      </section>

      {/* SATISFACTION — GATHERING with real progress count */}
      <section style={{ ...rGather.style, borderRadius: 16, background: "var(--kv-card)", border: "1px solid var(--kv-border)", boxShadow: "0 16px 40px -34px rgba(16,60,44,.3)", padding: "18px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 6 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: "#3e4b45" }}>نبض رضا العملاء</h2>
          <StatePill state="gathering" />
          <span style={{ marginInlineStart: "auto", fontSize: 10.5, color: "var(--kv-faint)", fontWeight: 700 }}>{toAr(Math.min(m.satProgress, SAT_THRESHOLD))} / {toAr(SAT_THRESHOLD)} محادثة</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <p style={{ flex: 1, fontSize: 11.5, color: "var(--kv-faint)", fontWeight: 600, margin: 0, lineHeight: 1.6 }}>
            المعلومة دي حقيقية وموجودة في كريم، بس لسه محتاجين محادثات أكتر قبل ما نعرض اتجاه رضا موثوق. هتشتغل أول ما يكفي الحجم — من غير ما نخمّن أي رقم.
          </p>
          <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 8, height: 64 }}>
            {[42, 64, 53, 78, 58, 88].map((h, i) => <div key={i} className="kv-skeleton" style={{ flex: 1, height: `${h}%`, borderRadius: "5px 5px 0 0" }} />)}
          </div>
        </div>
      </section>

      {/* ADVANCED INTELLIGENCE — COMING */}
      <section style={{ ...rComing.style, position: "relative", overflow: "hidden", borderRadius: 16, border: "1.5px dashed rgba(100,116,139,.35)", background: "repeating-linear-gradient(135deg,rgba(100,116,139,.035),rgba(100,116,139,.035) 12px,transparent 12px,transparent 24px),#fbfcfc", padding: "18px 22px", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: 13, display: "grid", placeItems: "center", background: "rgba(100,116,139,.1)", color: "#6b7a88", flex: "none" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#51637a" }}>ذكاء المحادثة المتقدّم</div>
            <StatePill state="coming" label="قريباً · على خريطة الطريق" />
          </div>
          <div style={{ fontSize: 11, color: "var(--kv-faint)", fontWeight: 600, marginTop: 5, lineHeight: 1.55, maxWidth: 640 }}>
            اقتراحات تحسين تلقائية لكل نقطة فقد، وتجارب نصّية يقترحها كريم لرفع التحويل. المكان محجوز وهيتفعّل من غير ما نعرض أي رقم وهمي.
          </div>
        </div>
        <span style={{ height: 34, display: "inline-flex", alignItems: "center", padding: "0 15px", borderRadius: 99, background: "var(--kv-card)", border: "1px solid var(--kv-border)", color: "var(--kv-faint)", fontSize: 11.5, fontWeight: 800, flex: "none" }}>غير متاح</span>
      </section>
    </div>
  );
}

// ── atoms ──
function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ borderRadius: 16, background: "var(--kv-card)", border: "1px solid var(--kv-border)", boxShadow: "var(--kv-shadow-panel)", padding: "18px 20px" }}>{children}</div>;
}
function Tag({ children }: { children: React.ReactNode }) {
  return <span style={{ display: "inline-flex", alignItems: "center", height: 21, padding: "0 9px", borderRadius: 99, background: "rgba(14,159,110,.1)", color: "var(--kv-deep)", fontSize: 9.5, fontWeight: 800 }}>{children}</span>;
}
function Legend({ color, label }: { color: string; label: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 700, color: "var(--kv-faint)" }}><span style={{ width: 9, height: 3, borderRadius: 2, background: color }} />{label}</span>;
}
function KvSkeleton({ w, h }: { w: string | number; h: number }) {
  return <div className="kv-skeleton" style={{ width: w, height: h, borderRadius: 6 }} />;
}

function KpiTile({ label, value, suffix = "", delta }: { label: string; value: number | null; suffix?: string; delta?: number | null }) {
  return (
    <div style={{ borderRadius: 16, padding: "15px 16px", background: "var(--kv-card)", border: "1px solid var(--kv-border)", boxShadow: "0 12px 30px -28px rgba(16,60,44,.32)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--kv-faint)" }}>{label}</div>
      {value == null ? (
        <div style={{ marginTop: 12 }}><KvSkeleton w="55%" h={16} /></div>
      ) : (
        <div style={{ fontSize: 27, fontWeight: 800, lineHeight: 1, marginTop: 12 }}>
          <CountUp value={value} format={(n) => toAr(Math.round(n))} />{suffix}
        </div>
      )}
      {delta != null && (
        <div style={{ marginTop: 11, fontSize: 10.5, fontWeight: 800, color: delta >= 0 ? "var(--kv-deep)" : "var(--kv-red)" }}>
          {delta >= 0 ? "▲ +" : "▼ "}{toAr(Math.abs(delta))}٪
        </div>
      )}
    </div>
  );
}

function ComingCard({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 16, border: "1.5px dashed rgba(100,116,139,.35)", background: "repeating-linear-gradient(135deg,rgba(100,116,139,.035),rgba(100,116,139,.035) 12px,transparent 12px,transparent 24px),#fbfcfc", padding: "14px 16px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "#51637a" }}>{title}</span>
        <span style={{ marginInlineStart: "auto" }}><StatePill state="coming" /></span>
      </div>
      <div style={{ fontSize: 10.5, color: "var(--kv-faint)", fontWeight: 600, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

function FunnelRow({ label, value, pct, tone }: { label: string; value: number; pct: number; tone: "primary" }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "62px 1fr 40px", alignItems: "center", gap: 9 }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: tone === "primary" ? "var(--kv-deep)" : "#3e4b45" }}>{label}</span>
      <div style={{ height: 11, borderRadius: 99, background: "rgba(14,159,110,.08)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.max(2, pct)}%`, borderRadius: 99, background: "linear-gradient(90deg,#0a8a5f,#1fb585)" }} />
      </div>
      <b style={{ fontSize: 11.5, textAlign: "left" }}>{toAr(value)}</b>
    </div>
  );
}
function FunnelGatherRow({ label }: { label: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "62px 1fr 40px", alignItems: "center", gap: 9 }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "var(--kv-faint)" }}>{label}</span>
      <div className="kv-skeleton" style={{ height: 11, borderRadius: 99 }} />
      <span style={{ fontSize: 10, textAlign: "left", color: "var(--kv-faint)", fontWeight: 800 }}>—</span>
    </div>
  );
}

function PerfCell({ value, suffix = "", label }: { value: number | null; suffix?: string; label: string }) {
  return (
    <div style={{ borderRadius: 12, background: "var(--kv-card-soft)", border: "1px solid var(--kv-border)", padding: "11px 12px" }}>
      {value == null ? <KvSkeleton w="50%" h={16} /> : <div style={{ fontSize: 20, fontWeight: 800, color: "var(--kv-text)" }}><CountUp value={value} format={(n) => toAr(Math.round(n))} />{suffix}</div>}
      <div style={{ fontSize: 9.5, color: "var(--kv-faint)", fontWeight: 700, marginTop: 3, lineHeight: 1.4 }}>{label}</div>
    </div>
  );
}
function PerfGatherCell({ label }: { label: string }) {
  return (
    <div style={{ borderRadius: 12, background: "var(--kv-card-soft)", border: "1px solid var(--kv-border)", padding: "11px 12px" }}>
      <KvSkeleton w="50%" h={16} />
      <div style={{ fontSize: 9.5, color: "var(--kv-faint)", fontWeight: 700, marginTop: 3, lineHeight: 1.4 }}>{label} · بنجمع بيانات</div>
    </div>
  );
}

// Real daily-orders trend line (no fabricated series).
function TrendChart({ daily }: { daily: { day: number; orders: number; delivered: number }[] }) {
  const max = Math.max(1, ...daily.map((d) => d.orders));
  const W = 600, H = 150, pad = 8;
  const pts = daily.map((d, i) => {
    const x = daily.length > 1 ? (i / (daily.length - 1)) * (W - pad * 2) + pad : W / 2;
    const y = H - pad - (d.orders / max) * (H - pad * 2);
    return [x, y] as const;
  });
  const path = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const allZero = daily.every((d) => d.orders === 0);
  return (
    <div style={{ position: "relative", height: 142 }}>
      {allZero ? (
        <div style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--kv-faint)", fontSize: 12, fontWeight: 600 }}>مفيش طلبات في الفترة دي لسه</div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%", overflow: "visible" }}>
          <line x1="0" y1="40" x2={W} y2="40" stroke="#eef2f0" strokeWidth="1" />
          <line x1="0" y1="80" x2={W} y2="80" stroke="#eef2f0" strokeWidth="1" />
          <line x1="0" y1="120" x2={W} y2="120" stroke="#eef2f0" strokeWidth="1" />
          <path d={path} fill="none" stroke="#0E9F6E" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.5" fill="#0E9F6E" stroke="#fff" strokeWidth="2" />)}
        </svg>
      )}
    </div>
  );
}
