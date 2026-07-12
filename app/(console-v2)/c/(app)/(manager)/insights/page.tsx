"use client";

// ============================================================================
// console_v2 item 12 — Insights (v35 dark-glass rebuild). "The money story —
// never a fake metric." Presentation rebuilt onto the shared kit; the truth
// logic is UNCHANGED from the shipped page — a strict tri-state surface:
// LIVE (a real aggregate) · GATHERING (real metric, no basis yet) · SOON (engine
// unbuilt). Carved-in rules, all preserved:
//
//  1) TREND deltas render ONLY with two comparable periods, ALWAYS with baseline
//     text. pctDelta() returns null with no prior basis → no trend shown. A
//     colored trend without a baseline is a defect. Down-trend floors at coral,
//     NEVER red (red = safety only).
//  2) MARGIN HERO stays GATHERING: no aggregator-rate config exists, a rate is
//     never assumed.
//  3) EVERY LIVE number is a real order aggregate over DB_READY data. In DEMO/
//     loading the store holds seed data → LIVE cards render GATHERING, never
//     seed-as-real (the L1 data-truth law). A true zero is shown; unloaded is
//     GATHERING — different truths.
//  4) FUNNEL / KARIM performance need the outcomes table (flag-OFF) → rendered as
//     the FULL designed component in its GATHERING state (shimmer chrome, honest
//     copy), never a flat placeholder, never a fabricated rate.
//  5) DO-NEXT = SOON: the Brain proposes, it never acts; the decision layer isn't
//     built → SOON panel with honest copy.
//  6) SCOPE: no "late deliveries" card (delivery is out of scope) — ops shows COD
//     share + completion (real) + kitchen misses (GATHERING).
//
// Money aggregates come from the pure, unit-tested lib/insights/order-kpis. Order
// sources come from the real GET /api/insights/order-sources.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { Wallet, Bot, Cog, TrendingUp, Radio, GitBranch, Lightbulb } from "lucide-react";
import {
  HeaderRow, SectionHeader, Panel, TruthChip, type Tier,
} from "@/components/console-v2/kit";
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

  const money = (n: number) => <span><Num>{Math.round(n).toLocaleString("en-US")}</Num> <span style={{ fontSize: 11, color: "var(--dim)" }}>{currency}</span></span>;
  const pct = (n: number) => <span><Num>{Math.round(n * 100)}</Num><span style={{ fontSize: 12, color: "var(--dim)" }}>%</span></span>;
  const baseKey = RANGE_BASE[range];
  // A LIVE card only when the data is real; otherwise honest GATHERING (rule 3).
  const live = (valueNode: React.ReactNode, delta: number | null, tier: Tier): CardModel =>
    isReal ? { kind: "live", valueNode, delta, tier } : { kind: "gather", msg: "ins.gather.outcomes" };

  return (
    <>
      <HeaderRow
        title={t("ins.title")}
        jobLine={<>{t("ins.sub")} · {t("ins.exclTest")}</>}
        right={
          <>
            <div style={{ display: "flex", gap: 3, background: "var(--inset2)", border: "1px solid var(--stroke)", borderRadius: 11, padding: 3 }}>
              {(["today", "week", "month"] as Range[]).map((r) => (
                <button key={r} onClick={() => setRange(r)} aria-pressed={range === r}
                  style={{ height: 28, padding: "0 12px", borderRadius: 8, border: 0, cursor: "pointer", fontFamily: "var(--kvx-font-ui)", fontSize: 11, fontWeight: 800,
                    background: range === r ? "linear-gradient(135deg,#12b57e,#0E9F6E)" : "transparent",
                    color: range === r ? "#fff" : "var(--dim)" }}>
                  {t(`ins.range.${r}` as DictKey)}
                </button>
              ))}
            </div>
            {/* Export is not wired yet → disabled + SOON, never a no-op that
                claims to have exported (honest-states law). */}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <button disabled aria-disabled title={t("ins.export.soon")}
                style={{ height: 34, padding: "0 13px", borderRadius: 11, border: "1px solid var(--stroke)", background: "rgba(255,255,255,.03)", color: "var(--faint)", fontFamily: "var(--kvx-font-ui)", fontSize: 11, fontWeight: 800, cursor: "not-allowed" }}>
                {t("ins.export")}
              </button>
              <TruthChip state="soon" />
            </span>
          </>
        }
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 8 }}>
        {/* ── THE MONEY STORY ─────────────────────────────────────────── */}
        <SectionHeader tier="gold" icon={<Wallet size={15} />} title={t("ins.sec.money")} />
        {/* Hero — commission/margin recovered: no rate config anywhere → GATHERING (rule 2). */}
        <MarginHero title={t("ins.hero.title")} sub={t("ins.hero.sub")} msg={t("ins.hero.gathering")} chip={<TruthChip state="gather" />} />
        <Grid>
          <KpiCard title={t("ins.revenue")} model={live(money(ins.current.revenue), pctDelta(ins.current.revenue, ins.prior.revenue), "gold")} baseKey={baseKey} priorHasData={ins.prior.hasData} />
          <KpiCard title={t("ins.orders")} model={live(<Num>{ins.current.orders}</Num>, pctDelta(ins.current.orders, ins.prior.orders), "blue")} baseKey={baseKey} priorHasData={ins.prior.hasData} />
          <KpiCard title={t("ins.aov")} model={live(money(ins.current.aov), pctDelta(ins.current.aov, ins.prior.aov), "green")} baseKey={baseKey} priorHasData={ins.prior.hasData} />
          {/* FR-006 — orders awaiting confirmation, shown SEPARATELY (a promise, not
              revenue). Revenue above counts committed orders only; cancelled never. */}
          <KpiCard title={t("ins.pendingConfirmation")} model={live(<Num>{ins.current.pendingConfirmationOrders}</Num>, null, "blue")} baseKey={baseKey} priorHasData={ins.prior.hasData} />
        </Grid>

        {/* ── THE FUNNEL — chat to order (needs outcomes → GATHERING shell) ─ */}
        <SectionHeader tier="blue" icon={<GitBranch size={15} />} title={t("ins.sec.funnel")} right={<TruthChip state="gather" />} />
        <FunnelShell
          stages={[t("ins.funnel.convos"), t("ins.funnel.intent"), t("ins.funnel.quoted"), t("ins.funnel.ordered")]}
          note={t("ins.funnel.gather")}
        />

        {/* ── KARIM'S PERFORMANCE (needs outcomes → GATHERING tiles) ────── */}
        <SectionHeader tier="blue" icon={<Bot size={15} />} title={t("ins.sec.karim")} right={<TruthChip state="gather" />} />
        <Grid n={4}>
          <GatherTile title={t("ins.karim.handled")} />
          <GatherTile title={t("ins.karim.escalated")} />
          <GatherTile title={t("ins.karim.holds")} />
          <GatherTile title={t("ins.karim.reply")} />
        </Grid>
        <Hint>{t("ins.karim.gather")}</Hint>

        {/* ── OPERATIONS (COD + completion real; misses GATHERING) ──────── */}
        <SectionHeader tier="green" icon={<Cog size={15} />} title={t("ins.sec.ops")} />
        <Grid>
          <KpiCard title={t("ins.cod")} model={live(pct(ins.current.codShare), null, "green")} baseKey={baseKey} priorHasData={ins.prior.hasData} />
          <KpiCard title={t("ins.completion")} model={live(pct(ins.current.completionRate), null, "green")} baseKey={baseKey} priorHasData={ins.prior.hasData} />
          <KpiCard title={t("ins.misses")} model={{ kind: "gather", msg: "ins.gather.timing" }} baseKey={baseKey} priorHasData={ins.prior.hasData} />
        </Grid>

        {/* ── GROWTH (top item real; repeat GATHERING; redeem SOON) ─────── */}
        <SectionHeader tier="gold" icon={<TrendingUp size={15} />} title={t("ins.sec.growth")} />
        <Grid>
          {isReal && ins.current.topItem ? (
            <div style={cardStyle}>
              <CardHead title={t("ins.topItem")} tier="gold" right={<TruthChip state="live" />} />
              <div style={{ fontSize: 17, fontWeight: 800, color: "var(--gold)", fontFamily: "var(--kvx-font-ar)" }}><Bdi>{ins.current.topItem.name}</Bdi></div>
              <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 4 }}>{money(ins.current.topItem.revenue)} · {t("ins.byRevenue")}</div>
            </div>
          ) : isReal ? (
            // Real window with no top item = a TRUE zero (shown LIVE), NOT
            // unloaded GATHERING — different truths (rule 3).
            <div style={cardStyle}>
              <CardHead title={t("ins.topItem")} right={<TruthChip state="live" />} />
              <div style={{ fontSize: 11.5, color: "var(--faint)", lineHeight: 1.6, marginTop: 2 }}>{t("ins.topItem.empty")}</div>
            </div>
          ) : <KpiCard title={t("ins.topItem")} model={{ kind: "gather", msg: "ins.gather.outcomes" }} baseKey={baseKey} priorHasData={ins.prior.hasData} />}
          <KpiCard title={t("ins.repeat")} model={{ kind: "gather", msg: "ins.gather.periods" }} baseKey={baseKey} priorHasData={ins.prior.hasData} />
          <SoonCard title={t("ins.redeem")} msg={t("ins.soon.campaigns")} />
        </Grid>

        {/* ── ORDER SOURCES — real server aggregate ─────────────────────── */}
        <SectionHeader tier="blue" icon={<Radio size={15} />} title={t("ins.sec.sources")} right={sources && sources.total > 0 ? <TruthChip state="live" /> : undefined} />
        {sourcesErr || sources === null ? (
          <GatherPanel msg={sourcesErr ? t("ins.loadError") : ""} />
        ) : sources.total === 0 ? (
          <Panel><div style={{ fontSize: 12.5, color: "var(--faint)" }}>{t("ins.sources.empty")}</div></Panel>
        ) : (
          <Panel>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <SourceBar label={t("ins.sources.whatsapp")} n={sources.whatsapp} total={sources.total} color="var(--g-green)" />
              <SourceBar label={t("ins.sources.web")} n={sources.web} total={sources.total} color="var(--g-blue)" />
              {sources.unknown > 0 && <SourceBar label={t("ins.sources.unknown")} n={sources.unknown} total={sources.total} color="rgba(255,255,255,.22)" />}
            </div>
          </Panel>
        )}

        {/* ── DO NEXT — Brain proposes, never acts → SOON ───────────────── */}
        <SectionHeader tier="violet" icon={<Lightbulb size={15} />} title={t("ins.sec.donext")} right={<TruthChip state="soon" />} />
        <div style={{ ...cardStyle, background: "linear-gradient(150deg,rgba(168,120,240,.12),transparent 60%),var(--inset)", border: "1px solid rgba(168,120,240,.3)" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--txt)", marginBottom: 6 }}>{t("ins.donext.title")}</div>
          <div style={{ fontSize: 11.5, color: "var(--faint)", lineHeight: 1.65 }}>{t("ins.donext.soon")}</div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
type CardModel =
  | { kind: "live"; valueNode: React.ReactNode; delta: number | null; tier: Tier }
  | { kind: "gather"; msg: DictKey };

const TIER_COLOR: Record<Tier, string> = {
  gold: "var(--gold)", green: "#7ce8c0", blue: "#a9d4ff", coral: "var(--coral)", violet: "#d4bcff",
};

function KpiCard({ title, model, baseKey, priorHasData }: { title: string; model: CardModel; baseKey: DictKey; priorHasData: boolean }) {
  const t = useT();
  if (model.kind === "gather") {
    return (
      <div style={cardStyle}>
        <CardHead title={title} right={<TruthChip state="gather" />} />
        <div className="kv-skeleton" style={{ height: 20, borderRadius: 8, width: "45%", margin: "2px 0 8px" }} />
        <div style={{ fontSize: 11, color: "var(--faint)", lineHeight: 1.6 }}>{t(model.msg)}</div>
      </div>
    );
  }
  return (
    <div style={cardStyle}>
      <CardHead title={title} tier={model.tier} right={<TruthChip state="live" />} />
      <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-.02em", color: TIER_COLOR[model.tier], fontFamily: "var(--kvx-font-ui)" }}>{model.valueNode}</div>
      {/* Rule 1: a trend shows ONLY with two comparable periods AND a real prior basis, ALWAYS with baseline text. */}
      {model.delta !== null && priorHasData ? <Trend delta={model.delta} baseline={t(baseKey)} /> : <div style={{ height: 16 }} />}
    </div>
  );
}

function Trend({ delta, baseline }: { delta: number; baseline: string }) {
  // Up = teal, down = coral (the trend FLOOR — never red, red is safety), flat = slate.
  const color = delta > 0 ? "#8ce8cc" : delta < 0 ? "var(--coral)" : "var(--faint)";
  const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
  return (
    <div style={{ fontSize: 11, marginTop: 5 }}>
      <span style={{ color, fontWeight: 800 }}>{arrow} <Num>{Math.abs(delta)}</Num>%</span>
      <span style={{ color: "var(--faint)" }}> {baseline}</span>
    </div>
  );
}

function CardHead({ title, tier, right }: { title: string; tier?: Tier; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
      {tier && <span style={{ width: 8, height: 8, borderRadius: 3, background: TIER_COLOR[tier] }} />}
      <span style={{ fontSize: 11, fontWeight: 800, color: "var(--dim)", flex: 1, letterSpacing: ".02em" }}>{title}</span>
      {right}
    </div>
  );
}

// Margin/commission hero — GATHERING, never colored as a verdict (rule 2/5).
function MarginHero({ title, sub, msg, chip }: { title: string; sub: string; msg: string; chip: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 20, padding: "18px 20px", position: "relative", overflow: "hidden",
      background: "linear-gradient(150deg,rgba(255,212,126,.12),rgba(255,212,126,.02) 60%),var(--inset)", border: "1px solid rgba(255,212,126,.28)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, background: "var(--g-gold)", display: "grid", placeItems: "center", color: "var(--ink)", fontSize: 19, flex: "none" }}>💰</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--txt)" }}>{title}</div>
          <div style={{ fontSize: 9.5, color: "var(--faint)", marginTop: 2 }}>{sub}</div>
        </div>
        {chip}
      </div>
      <div className="kv-skeleton" style={{ height: 34, width: "45%", borderRadius: 10, margin: "14px 0 8px" }} />
      <div style={{ fontSize: 9.5, color: "var(--faint)", lineHeight: 1.6, maxWidth: 620 }}>{msg}</div>
    </div>
  );
}

function SoonCard({ title, msg }: { title: string; msg: string }) {
  return (
    <div style={{ ...cardStyle, borderStyle: "dashed" }}>
      <CardHead title={title} right={<TruthChip state="soon" />} />
      <div style={{ fontSize: 11.5, color: "var(--faint)", lineHeight: 1.6 }}>{msg}</div>
    </div>
  );
}

// Data-blocked KPI as a GATHERING tile (full designed chrome, shimmer, no number).
function GatherTile({ title }: { title: string }) {
  return (
    <div style={cardStyle}>
      <CardHead title={title} right={<TruthChip state="gather" />} />
      <div className="kv-skeleton" style={{ height: 22, width: "50%", borderRadius: 8, marginTop: 2 }} />
    </div>
  );
}

function GatherPanel({ msg }: { msg: string }) {
  return (
    <Panel>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <TruthChip state="gather" />
        {msg && <span style={{ fontSize: 12, color: "var(--faint)" }}>{msg}</span>}
      </div>
    </Panel>
  );
}

// The funnel — full designed chrome in GATHERING: 4 stage rows, shimmer tracks,
// NO fabricated percentages (a rate without a real basis is a lie).
function FunnelShell({ stages, note }: { stages: string[]; note: string }) {
  return (
    <Panel>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {stages.map((s) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <span style={{ width: 120, flex: "none", fontSize: 11, fontWeight: 700, color: "var(--dim)" }}>{s}</span>
            <span className="kv-skeleton" style={{ flex: 1, height: 28, borderRadius: 9 }} />
            <span style={{ width: 30, flex: "none" }}><TruthChip state="gather" label="—" /></span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: "var(--faint)", lineHeight: 1.6, marginTop: 11 }}>{note}</div>
    </Panel>
  );
}

function SourceBar({ label, n, total, color }: { label: string; n: number; total: number; color: string }) {
  const w = total > 0 ? Math.round((n / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", width: 90, flex: "none" }}>{label}</span>
      <div style={{ flex: 1, height: 11, borderRadius: 6, background: "var(--inset2)", overflow: "hidden" }}>
        <div style={{ width: `${w}%`, height: "100%", background: color, borderRadius: 6 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 900, color: "var(--txt)", width: 40, textAlign: "end", fontFamily: "var(--kvx-font-ui)" }}><Num>{n}</Num></span>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10.5, color: "var(--faint)", lineHeight: 1.6, padding: "0 2px" }}>{children}</div>;
}

function Grid({ children, n = 3 }: { children: React.ReactNode; n?: number }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit,minmax(${n === 4 ? 170 : 210}px,1fr))`, gap: 12 }}>{children}</div>;
}

const cardStyle: React.CSSProperties = {
  background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 16, padding: "14px 16px",
};
