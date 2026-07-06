"use client";

// ============================================================================
// console_v2 item 12 — Insights. "The money story — never a fake metric." A strict
// TRI-STATE page: LIVE (a real aggregate) · GATHERING (real metric, no basis yet) ·
// SOON (engine unbuilt). Carved-in rules:
//
//  1) TREND deltas render ONLY with two comparable periods, ALWAYS with baseline text
//     («vs last week» …). pctDelta() returns null when the prior window has no basis →
//     no trend shown. A colored trend without a baseline is a defect — never emitted.
//  2) COMMISSION HERO stays GATHERING: no aggregator-rate config exists anywhere, and
//     a rate is never assumed. (When rates are entered it will carry «per the entered
//     rates» — the label is reserved here.)
//  3) EVERY LIVE number is a real order aggregate over DB_READY data. In DEMO/loading
//     the store holds seed data → the LIVE cards render GATHERING, never seed-as-real
//     (the L1 data-truth law). Zero orders in a real window is a TRUE zero (shown);
//     unloaded data is GATHERING — different truths.
//  4) DO-NEXT = SOON: the Brain proposes, it never acts; its proposals route to
//     Approvals — nothing else. The decision layer isn't built → SOON.
//  5) GATHERING is NEVER colored (existing law) — slate chip, skeleton, no number.
//
// Money aggregates come from the pure, unit-tested lib/insights/order-kpis. Order
// sources come from the real GET /api/insights/order-sources. Everything outcomes-
// derived (funnel, conversion, repeat) is GATHERING (outcomes table flag-OFF, 0 rows).
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { Wallet, Bot, Cog, TrendingUp, Radio, GitBranch, Lightbulb } from "lucide-react";
import { TruthChip } from "@/components/console-v2";
import { useOrderStore } from "@/lib/order-store";
import { useRestaurantStore } from "@/lib/store";
import { useConsoleDataStore } from "@/lib/console-data-state";
import { computeInsights, pctDelta } from "@/lib/insights/order-kpis";
import { useT } from "@/lib/i18n/lang";
import type { DictKey } from "@/lib/i18n/dictionary";
import { Bdi, Num } from "@/components/kivo";

type Range = "today" | "week" | "month";
const RANGE_DAYS: Record<Range, number> = { today: 1, week: 7, month: 30 };
const RANGE_BASE: Record<Range, DictKey> = { today: "ins.base.today", week: "ins.base.week", month: "ins.base.month" };

interface Sources { web: number; whatsapp: number; unknown: number; total: number }

export default function InsightsPage() {
  const t = useT();
  const orders = useOrderStore((s) => s.orders);
  const currency = useRestaurantStore((s) => s.profile.currency);
  const dataState = useConsoleDataStore((s) => s.state);
  const isReal = dataState === "DB_READY"; // never render seed (DEMO) as a real metric
  const [range, setRange] = useState<Range>("week");
  const [sources, setSources] = useState<Sources | null>(null);
  const [sourcesErr, setSourcesErr] = useState(false);

  const ins = useMemo(() => computeInsights(orders, Date.now(), RANGE_DAYS[range]), [orders, range]);

  useEffect(() => {
    let alive = true;
    fetch("/api/insights/order-sources", { cache: "no-store", credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { ok?: boolean; sources?: Sources }) => { if (alive) setSources(d.sources ?? null); })
      .catch(() => { if (alive) setSourcesErr(true); });
    return () => { alive = false; };
  }, []);

  const money = (n: number) => <span><Num>{Math.round(n).toLocaleString("en-US")}</Num> <span style={{ fontSize: 11, color: "var(--kv-muted)" }}>{currency}</span></span>;
  const pct = (n: number) => <span><Num>{Math.round(n * 100)}</Num><span style={{ fontSize: 12, color: "var(--kv-muted)" }}>%</span></span>;
  // A LIVE card only when the data is real; otherwise honest GATHERING (rule 3).
  const live = (valueNode: React.ReactNode, delta: number | null, accent: string) =>
    isReal ? { kind: "live" as const, valueNode, delta, accent } : { kind: "gather" as const, msg: "ins.gather.outcomes" as DictKey };
  const baseKey = RANGE_BASE[range];

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header + range */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--kv-text)", margin: "0 0 6px" }}>{t("ins.title")}</h1>
          <p style={{ fontSize: 13, color: "var(--kv-muted)", margin: 0, lineHeight: 1.7 }}>{t("ins.sub")} · <span style={{ fontSize: 11.5 }}>{t("ins.exclTest")}</span></p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["today", "week", "month"] as Range[]).map((r) => (
            <button key={r} onClick={() => setRange(r)} aria-pressed={range === r}
              style={{ height: 32, padding: "0 13px", borderRadius: "var(--kv-r-pill)", border: range === r ? 0 : "1px solid var(--kv-border)", background: range === r ? "var(--kv-grad-brand)" : "var(--kv-card)", color: range === r ? "#fff" : "var(--kv-muted)", fontFamily: "var(--kv-font)", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              {t(`ins.range.${r}` as DictKey)}
            </button>
          ))}
        </div>
      </div>

      {/* THE MONEY STORY */}
      <SectionLabel icon={<Wallet size={14} />}>{t("ins.sec.money")}</SectionLabel>
      {/* Hero — commission saved: no rate config anywhere → GATHERING (rule 2). */}
      <GatheringCard title={t("ins.hero.title")} sub={t("ins.hero.sub")} msg={t("ins.hero.gathering")} big />
      <Grid>
        <Card title={t("ins.revenue")} card={live(money(ins.current.revenue), pctDelta(ins.current.revenue, ins.prior.revenue), "#c58b1f")} baseKey={baseKey} priorHasData={ins.prior.hasData} />
        <Card title={t("ins.orders")} card={live(<Num>{ins.current.orders}</Num>, pctDelta(ins.current.orders, ins.prior.orders), "#3f7fe0")} baseKey={baseKey} priorHasData={ins.prior.hasData} />
        <Card title={t("ins.aov")} card={live(money(ins.current.aov), pctDelta(ins.current.aov, ins.prior.aov), "#0A8A5F")} baseKey={baseKey} priorHasData={ins.prior.hasData} />
      </Grid>

      {/* KARIM — needs the outcomes/intelligence layer (flag-OFF) → GATHERING. */}
      <SectionLabel icon={<Bot size={14} />}>{t("ins.sec.karim")}</SectionLabel>
      <GatheringCard title={t("ins.karim.title")} msg={t("ins.gather.outcomes")} />

      {/* OPERATIONS */}
      <SectionLabel icon={<Cog size={14} />}>{t("ins.sec.ops")}</SectionLabel>
      <Grid>
        <Card title={t("ins.cod")} card={live(pct(ins.current.codShare), null, "#6b7688")} baseKey={baseKey} priorHasData={ins.prior.hasData} />
        <Card title={t("ins.completion")} card={live(pct(ins.current.completionRate), null, "#0A8A5F")} baseKey={baseKey} priorHasData={ins.prior.hasData} />
        <GatheringCard title={t("ins.misses")} msg={t("ins.gather.timing")} />
      </Grid>

      {/* GROWTH */}
      <SectionLabel icon={<TrendingUp size={14} />}>{t("ins.sec.growth")}</SectionLabel>
      <Grid>
        {isReal && ins.current.topItem ? (
          <div style={cardStyle}>
            <CardHead title={t("ins.topItem")} accent="#c58b1f" live={t("ins.live")} />
            <div style={{ fontSize: 17, fontWeight: 800, color: "#c58b1f", fontFamily: "var(--kv-font)" }}><Bdi>{ins.current.topItem.name}</Bdi></div>
            <div style={{ fontSize: 11, color: "var(--kv-muted)", marginTop: 4 }}>{money(ins.current.topItem.revenue)} · {t("ins.byRevenue")}</div>
          </div>
        ) : <GatheringCard title={t("ins.topItem")} msg={t("ins.gather.outcomes")} />}
        <GatheringCard title={t("ins.repeat")} msg={t("ins.gather.periods")} />
        <SoonCard title={t("ins.redeem")} msg={t("ins.soon.campaigns")} />
      </Grid>

      {/* ORDER SOURCES — real server aggregate. */}
      <SectionLabel icon={<Radio size={14} />}>{t("ins.sec.sources")}</SectionLabel>
      {sourcesErr || sources === null ? (
        <GatheringCard title={t("ins.sec.sources")} msg={sourcesErr ? t("ins.loadError") : ""} />
      ) : sources.total === 0 ? (
        <div style={cardStyle}><div style={{ fontSize: 12.5, color: "var(--kv-faint)" }}>{t("ins.sources.empty")}</div></div>
      ) : (
        <div style={cardStyle}>
          <CardHead title={t("ins.sec.sources")} accent="#3f7fe0" live={t("ins.live")} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
            <SourceBar label={t("ins.sources.whatsapp")} n={sources.whatsapp} total={sources.total} color="#0E9F6E" />
            <SourceBar label={t("ins.sources.web")} n={sources.web} total={sources.total} color="#4b8bff" />
            {sources.unknown > 0 && <SourceBar label={t("ins.sources.unknown")} n={sources.unknown} total={sources.total} color="#9aa7b8" />}
          </div>
        </div>
      )}

      {/* FUNNEL — needs outcomes for the middle stages → GATHERING. */}
      <SectionLabel icon={<GitBranch size={14} />}>{t("ins.sec.funnel")}</SectionLabel>
      <GatheringCard title={t("ins.sec.funnel")} msg={t("ins.gather.outcomes")} />

      {/* DO NEXT — Brain proposes, never acts → SOON. */}
      <SectionLabel icon={<Lightbulb size={14} />}>{t("ins.sec.donext")}</SectionLabel>
      <SoonCard title={t("ins.donext.title")} msg={t("ins.donext.soon")} />
    </div>
  );
}

// ---------------------------------------------------------------------------
type CardModel =
  | { kind: "live"; valueNode: React.ReactNode; delta: number | null; accent: string }
  | { kind: "gather"; msg: DictKey };

function Card({ title, card, baseKey, priorHasData }: { title: string; card: CardModel; baseKey: DictKey; priorHasData: boolean }) {
  const t = useT();
  if (card.kind === "gather") return <GatheringCard title={title} msg={t(card.msg)} />;
  return (
    <div style={cardStyle}>
      <CardHead title={title} accent={card.accent} live={t("ins.live")} />
      <div style={{ fontSize: 22, fontWeight: 800, color: card.accent }}>{card.valueNode}</div>
      {/* Rule 1: a trend is shown ONLY with two comparable periods (delta ≠ null AND a
          real prior basis), ALWAYS with its baseline text. */}
      {card.delta !== null && priorHasData ? <Trend delta={card.delta} baseline={t(baseKey)} /> : <div style={{ height: 16 }} />}
    </div>
  );
}

function Trend({ delta, baseline }: { delta: number; baseline: string }) {
  // Up = emerald, down = amber (never red — red is safety only), flat = slate.
  const color = delta > 0 ? "#0A8A5F" : delta < 0 ? "#b9822a" : "#6b7688";
  const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
  return (
    <div style={{ fontSize: 11, marginTop: 4 }}>
      <span style={{ color, fontWeight: 800 }}>{arrow} <Num>{Math.abs(delta)}</Num>%</span>
      <span style={{ color: "var(--kv-faint)" }}> {baseline}</span>
    </div>
  );
}

function CardHead({ title, accent, live }: { title: string; accent: string; live: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <span style={{ width: 8, height: 8, borderRadius: 3, background: accent }} />
      <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--kv-muted)", flex: 1 }}>{title}</span>
      <span style={{ fontSize: 9.5, fontWeight: 800, color: "#0A8A5F" }}>{live}</span>
    </div>
  );
}

// GATHERING — never colored (rule 5): slate chip + skeleton + honest message, no number.
function GatheringCard({ title, sub, msg, big }: { title: string; sub?: string; msg: string; big?: boolean }) {
  return (
    <div style={{ ...cardStyle, ...(big ? { padding: "18px 20px" } : {}) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--kv-muted)", flex: 1 }}>{title}{sub ? <span style={{ fontWeight: 600, color: "var(--kv-faint)" }}> · {sub}</span> : null}</span>
        <TruthChip state="gathering" />
      </div>
      <div className="kv-skeleton" style={{ height: big ? 34 : 18, borderRadius: 8, width: "45%", marginBottom: 8 }} />
      {msg && <div style={{ fontSize: 11.5, color: "var(--kv-faint)", lineHeight: 1.6 }}>{msg}</div>}
    </div>
  );
}
function SoonCard({ title, msg }: { title: string; msg: string }) {
  return (
    <div style={{ ...cardStyle, borderStyle: "dashed" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--kv-muted)", flex: 1 }}>{title}</span>
        <TruthChip state="soon" />
      </div>
      <div style={{ fontSize: 11.5, color: "var(--kv-faint)", lineHeight: 1.6 }}>{msg}</div>
    </div>
  );
}
function SourceBar({ label, n, total, color }: { label: string; n: number; total: number; color: string }) {
  const w = total > 0 ? Math.round((n / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--kv-muted)", width: 90 }}>{label}</span>
      <div style={{ flex: 1, height: 10, borderRadius: 6, background: "var(--kv-card-soft)", overflow: "hidden" }}>
        <div style={{ width: `${w}%`, height: "100%", background: color, borderRadius: 6 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--kv-text)", width: 40, textAlign: "end" }}><Num>{n}</Num></span>
    </div>
  );
}
function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0 0" }}>
      <span style={{ color: "var(--kv-faint)", display: "inline-flex" }}>{icon}</span>
      <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: ".08em", color: "var(--kv-faint)" }}>{children}</span>
    </div>
  );
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>{children}</div>;
}
const cardStyle: React.CSSProperties = {
  background: "var(--kv-card)", border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-md-lg)",
  boxShadow: "var(--kv-shadow-card)", padding: "14px 16px",
};
