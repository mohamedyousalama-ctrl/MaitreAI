"use client";

// ============================================================================
// console_v2 item 11 — Customers / the Regulars Wall (v35 dark-glass rebuild).
// "Every direct guest, remembered honestly." Presentation rebuilt onto the shared
// kit (PageGrid, SectionHeader, StatTile, LeaderRow, Spotlight, LoyaltyCard,
// AuroraDrawer); all data + truth logic UNCHANGED from the shipped page.
//
// THE MEMORY LAW: facts (حقائق) come only from real orders; Karim's readings
// (استنتاج) are always labeled and never mixed with facts.
//
//  • REAL — facts strip, segment counts, top-by-spend leaderboard, slipping-away
//    spotlight, and the loyalty-card wall's SPEND + ORDER COUNT all derive from
//    GET /api/customers/aggregates (the single source of truth — never re-derived
//    here). A card's TIER is derived from real order count (loyal ≥5 → VIP ·
//    returning 2–4 → repeat · new ≤1) or risk (in the at-risk set) — derived,
//    never invented (the same ratified segment formula). Money is displayed,
//    never computed in the UI.
//  • DATA-BLOCKED (rendered as the FULL designed component in GATHERING/SOON, never
//    a flat box, never a fabricated number):
//      - loyalty RING (tier-progress %) · per-guest VISITS · USUAL item — no data
//        source yet → ring omitted + honest wall note.
//      - Karim MEMORY (استنتاج) — flag-gated customer_memory, 0 rows → GATHERING.
//      - dossier TIMELINE — no per-guest order-history read route → GATHERING.
//      - win-back / merge / opt-out / chat / reorder ACTIONS — no backend → SOON.
//
// Colour: identity hues per segment (gold VIP / green repeat / blue new / coral
// at-risk); NO red (at-risk is coral, not red — red = safety only). XSS:
// dictionary text nodes + <Bdi>/<Num> only.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { Star, Trophy, Clock3, Brain, Users, Search, AlertTriangle } from "lucide-react";
import {
  HeaderRow, PageGrid, SectionHeader, StatTile, LeaderRow, Spotlight, LoyaltyCard,
  TruthChip, AuroraDrawer, type Tier,
} from "@/components/console-v2/kit";
import { useRestaurantStore } from "@/lib/store";
import { useT } from "@/lib/i18n/lang";
import { Bdi, Num } from "@/components/kivo";

interface Facts { totalCustomers: number; totalOrders: number; totalRevenue: number; avgOrderValue: number; avgOrdersPerCustomer: number }
interface TopRow { id: string; name: string | null; phone: string | null; ltv: number; orders_count: number }
interface RiskRow { id: string; name: string | null; phone: string | null; last_seen_at: string | null; days_since: number }
interface Aggregates { facts: Facts; segments: { new: number; returning: number; loyal: number }; topBySpend: TopRow[]; atRisk: RiskRow[] }

type Seg = "all" | "vip" | "reg" | "new" | "risk";
type CardTier = "vip" | "reg" | "new" | "risk";

export default function CustomersPage() {
  const t = useT();
  const currency = useRestaurantStore((s) => s.profile.currency);
  const [data, setData] = useState<Aggregates | null>(null);
  const [error, setError] = useState(false);
  const [seg, setSeg] = useState<Seg>("all");
  const [q, setQ] = useState("");
  const [dossier, setDossier] = useState<WallGuest | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/customers/aggregates", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Aggregates) => { if (alive) setData(d); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);

  const money = (n: number) => <span><Num>{Math.round(n).toLocaleString("en-US")}</Num> <span style={{ fontSize: 11, color: "var(--dim)" }}>{currency}</span></span>;
  const repeatCount = data ? data.segments.returning + data.segments.loyal : 0;

  // Wall guests = the real top-by-spend guests (they carry ltv + order count).
  // Tier derived from real order count; at-risk flag if the guest is in the
  // at-risk set. NEVER fabricate a guest or a spend figure.
  const guests: WallGuest[] = useMemo(() => {
    if (!data) return [];
    const riskIds = new Set(data.atRisk.map((r) => r.id));
    return data.topBySpend.map((c) => {
      const atRisk = riskIds.has(c.id);
      const tier: CardTier = atRisk ? "risk" : c.orders_count >= 5 ? "vip" : c.orders_count >= 2 ? "reg" : "new";
      return { id: c.id, name: c.name, phone: c.phone, ltv: c.ltv, orders: c.orders_count, tier, atRisk };
    });
  }, [data]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return guests.filter((g) => (seg === "all" || g.tier === seg) && (!needle || (g.name ?? "").toLowerCase().includes(needle) || (g.phone ?? "").includes(needle)));
  }, [guests, seg, q]);

  const TIER_LABEL: Record<CardTier, string> = { vip: t("cu.tier.vip"), reg: t("cu.tier.reg"), new: t("cu.tier.new"), risk: t("cu.tier.risk") };
  const SEG_TABS: { key: Seg; label: string }[] = [
    { key: "all", label: t("cu.seg.all") }, { key: "vip", label: t("cu.tier.vip") },
    { key: "reg", label: t("cu.tier.reg") }, { key: "new", label: t("cu.tier.new") }, { key: "risk", label: t("cu.tier.risk") },
  ];

  // Per-widget truth chip — each context card tells its OWN truth (never collapse
  // into one page-level chip). data → LIVE · load failed → DEGRADED · loading → GATHERING.
  const widgetChip = data ? <TruthChip state="live" /> : error ? <TruthChip state="degraded" /> : <TruthChip state="gather" />;
  // Top-regulars tells its OWN truth too — LIVE only with rows, else DEGRADED
  // (load failed) / GATHERING (loading). Never a gather chip on a load error.
  const topReady = !!data && data.topBySpend.length > 0;
  const topChip = topReady ? <TruthChip state="live" /> : error ? <TruthChip state="degraded" /> : <TruthChip state="gather" />;

  const context = (
    <>
      {/* Guest book — derived segment tiles (never invented). A proper card. */}
      <div style={ctxCard}>
        <SectionHeader tier="blue" icon={<Users size={15} />} title={t("cu.derived")} sub={t("cu.sub")} right={widgetChip} />
        {data ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <StatTile tier="gold" label={t("cu.seg.vip")} value="" countUp={data.segments.loyal} fact={t("cu.seg.vipHint")} />
            <StatTile tier="green" label={t("cu.seg.repeat")} value="" countUp={data.segments.returning} fact={t("cu.seg.repeatHint")} />
            <StatTile tier="blue" label={t("cu.seg.new")} value="" countUp={data.segments.new} fact={t("cu.seg.newHint")} />
            <StatTile tier="coral" label={t("cu.seg.risk")} value="" countUp={data.atRisk.length} fact={t("cu.seg.riskHint")} />
          </div>
        ) : error ? (
          <div style={ctxNote}>{t("cu.loadError")}</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[0, 1, 2, 3].map((i) => <div key={i} className="kv-skeleton" style={{ height: 62, borderRadius: 14 }} />)}
          </div>
        )}
      </div>

      {/* Top regulars — real spend, crown leaderboard. A proper card. */}
      <div style={ctxCard}>
        <SectionHeader tier="gold" icon={<Trophy size={15} />} title={t("cu.top.title")} sub={t("cu.top.sub")} right={topChip} />
        {data && data.topBySpend.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {data.topBySpend.slice(0, 5).map((c, i) => (
              <LeaderRow key={c.id} rank={i + 1} avatar={<Bdi>{(c.name || "؟").slice(0, 1)}</Bdi>}
                name={<Bdi>{c.name || "—"}</Bdi>} meta={<><Num>{c.orders_count}</Num> {t("cu.top.orders")}</>}
                value={money(c.ltv)} />
            ))}
          </div>
        ) : error ? (
          // Load failed → honest note (NOT EmptyLine's gather chip — the header
          // already carries the DEGRADED chip).
          <div style={ctxNote}>{t("cu.loadError")}</div>
        ) : <EmptyLine>{t("cu.top.empty")}</EmptyLine>}
      </div>

      {/* Slipping away — at-risk spotlight (real days silent). Win-back = SOON. */}
      {data && data.atRisk.length > 0 && (
        <Spotlight>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
            <Clock3 size={16} style={{ color: "var(--ink)" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: "var(--ink)" }}>{t("cu.slip.title")}</div>
              <div style={{ fontSize: 9, color: "var(--ink-soft)" }}>{t("cu.slip.sub")}</div>
            </div>
            <span style={{ fontSize: 9, fontWeight: 900, color: "var(--ink)", background: "rgba(0,0,0,.16)", borderRadius: 8, padding: "3px 9px" }}>
              <Num>{data.atRisk.length}</Num> {t("cu.guests")}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {data.atRisk.slice(0, 5).map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, fontWeight: 700, color: "var(--ink)" }}>
                <Bdi>{c.name || "—"}</Bdi>
                <span style={{ marginInlineStart: "auto", fontWeight: 900 }}><Num>{c.days_since}</Num> {t("cu.slip.days")}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9 }}>
            <TruthChip state="soon" />
            <span style={{ fontSize: 9.5, fontWeight: 800, color: "var(--ink-soft)" }}>{t("cu.slip.winback")}</span>
          </div>
        </Spotlight>
      )}

      {/* Memory law — copy, not data. */}
      <div style={{ border: "1px dashed var(--stroke2)", borderRadius: 14, background: "var(--inset)", padding: "11px 13px", fontSize: 10.5, color: "var(--dim)", lineHeight: 1.75 }}>
        💡 {t("cu.law")}
      </div>
    </>
  );

  const hero = (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
      {/* Wall header */}
      <SectionHeader tier="gold" icon={<Star size={15} />} title={t("cu.wall.title")} sub={t("cu.wall.sub")}
        right={data && shown.length > 0 ? <TruthChip state="live" /> : undefined} />

      {/* Toolbar — filter pills + search in one RTL-aligned bar under the header. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "var(--panel)", border: "1px solid var(--stroke)", borderRadius: 14, padding: 8, backdropFilter: "blur(12px)" }}>
        <div style={{ display: "flex", background: "var(--inset2)", border: "1px solid var(--stroke)", borderRadius: 999, padding: 3, gap: 2, flexWrap: "wrap" }}>
          {SEG_TABS.map((s) => (
            <button key={s.key} onClick={() => setSeg(s.key)} aria-pressed={seg === s.key}
              style={{ fontSize: 10.5, fontWeight: 800, color: seg === s.key ? "var(--ink)" : "var(--dim)", background: seg === s.key ? "var(--g-blue)" : "transparent", border: 0, borderRadius: 999, padding: "6px 13px", cursor: "pointer", fontFamily: "var(--kvx-font-ar)" }}>
              {s.label}
            </button>
          ))}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--inset2)", border: "1px solid var(--stroke)", borderRadius: 999, padding: "8px 13px", flex: 1, minWidth: 160, marginInlineStart: "auto" }}>
          <Search size={13} style={{ color: "var(--faint)", flex: "none" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("cu.search")} dir="auto"
            style={{ flex: 1, minWidth: 0, background: "none", border: 0, outline: "none", color: "var(--txt)", fontSize: 11.5, fontFamily: "var(--kvx-font-ar)" }} />
        </label>
      </div>

      {error ? (
        // DEGRADED — honest load-failure signal, NOT softened. Premium, intentional.
        <HeroState tone="degraded" chip={<TruthChip state="degraded" />} icon={<AlertTriangle size={26} strokeWidth={2.2} />}
          title={t("cu.loadError")} body={t("cu.wall.degradedBody")} />
      ) : data === null ? (
        // Loading — skeleton loyalty-card grid (no fabricated data).
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 12 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="kv-skeleton" style={{ height: 150, borderRadius: 17 }} />)}
        </div>
      ) : guests.length === 0 ? (
        // Genuinely no confirmed customers — premium HONEST empty-state (no fake guests).
        <HeroState chip={<TruthChip state="gather" />} icon={<Users size={26} strokeWidth={2.2} />}
          title={t("cu.wall.emptyTitle")} body={t("cu.wall.emptyBody")} />
      ) : shown.length === 0 ? (
        // Real customers exist, but the filter/search matched none.
        <HeroState icon={<Search size={24} strokeWidth={2.2} />} title={t("cu.wall.noMatch")} />
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 12 }}>
            {shown.map((g) => (
              <button key={g.id} type="button" onClick={() => setDossier(g)} style={{ border: 0, padding: 0, background: "none", cursor: "pointer", textAlign: "start" }}>
                <LoyaltyCard
                  tier={g.tier}
                  avatar={<Bdi>{(g.name || "؟").slice(0, 1)}</Bdi>}
                  name={<Bdi>{g.name || "—"}</Bdi>}
                  phone={g.phone ? <span dir="ltr">{g.phone}</span> : undefined}
                  tierLabel={TIER_LABEL[g.tier]}
                  orders={<Num>{g.orders}</Num>}
                  visits="—"
                  spend={money(g.ltv)}
                  spendLabel={t("cu.top.lifetime")}
                  atRisk={g.atRisk}
                />
              </button>
            ))}
          </div>
          {/* Scope honesty — the wall is the top-by-spend slice, not the full
              roster (aggregates topN=10); search + tabs scope to it. */}
          <div style={{ fontSize: 10.5, color: "var(--faint)", lineHeight: 1.6, padding: "0 2px" }}>{t("cu.wall.scope")}</div>
          {/* Data-blocked ring/visits/usual — honest wall note (hard-rule #1). */}
          <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 10.5, color: "var(--faint)", lineHeight: 1.6 }}>
            <TruthChip state="gather" /> {t("cu.wall.ringGather")}
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      <HeaderRow
        title={t("cu.title")}
        jobLine={t("cu.sub")}
        right={data ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 700, color: "var(--dim)", background: "var(--inset2)", border: "1px solid var(--stroke)", borderRadius: 99, padding: "5px 11px", whiteSpace: "nowrap" }}>
            <Users size={12} /> <Num>{data.facts.totalCustomers}</Num> {t("cu.guests")} · ↺ <Num>{repeatCount}</Num> {t("cu.repeat")}
          </span>
        ) : undefined}
      />
      <PageGrid context={context} hero={hero} />

      {/* Dossier drawer — real facts + GATHERING memory/timeline + SOON actions. */}
      <AuroraDrawer open={dossier !== null} onClose={() => setDossier(null)}>
        {dossier && <Dossier g={dossier} money={money} tierLabel={TIER_LABEL[dossier.tier]} onClose={() => setDossier(null)} />}
      </AuroraDrawer>
    </>
  );
}

interface WallGuest { id: string; name: string | null; phone: string | null; ltv: number; orders: number; tier: CardTier; atRisk: boolean }

function Dossier({ g, money, tierLabel, onClose }: { g: WallGuest; money: (n: number) => React.ReactNode; tierLabel: string; onClose: () => void }) {
  const t = useT();
  const TIER_GRAD: Record<CardTier, string> = { vip: "var(--g-gold)", reg: "var(--g-green)", new: "var(--g-blue)", risk: "var(--g-coral)" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header — tier-filled, dark ink. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, background: TIER_GRAD[g.tier], color: "var(--ink)", borderRadius: 16, padding: "14px 16px" }}>
        <span style={{ width: 46, height: 46, borderRadius: "50%", background: "rgba(0,0,0,.16)", display: "grid", placeItems: "center", fontWeight: 900, fontSize: 18, color: "var(--ink)", flex: "none" }}><Bdi>{(g.name || "؟").slice(0, 1)}</Bdi></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 900, fontFamily: "var(--kvx-font-ar)" }}><Bdi>{g.name || "—"}</Bdi></div>
          {g.phone && <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-soft)" }} dir="ltr">{g.phone}</div>}
        </div>
        <span style={{ fontSize: 9, fontWeight: 900, background: "var(--ink-chip)", borderRadius: 8, padding: "3px 9px" }}>{tierLabel}</span>
        <button onClick={onClose} aria-label={t("cu.dossier.close")} style={{ width: 30, height: 30, borderRadius: 10, border: 0, background: "rgba(0,0,0,.16)", color: "var(--ink)", cursor: "pointer", flex: "none" }}>✕</button>
      </div>

      {/* Real facts. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Fact label={t("cu.dossier.facts")} value={money(g.ltv)} tier="gold" />
        <Fact label={t("cu.top.orders")} value={<Num>{g.orders}</Num>} tier="blue" />
      </div>

      {/* Karim memory — GATHERING (flag-gated). */}
      <div style={{ background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 14, padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Brain size={15} style={{ color: "#c4b1ff" }} />
          <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--txt)", flex: 1 }}>{t("cu.mem.title")}</span>
          <TruthChip state="gather" />
        </div>
        <div style={{ fontSize: 11, color: "var(--faint)", lineHeight: 1.6 }}>{t("cu.dossier.memGather")}</div>
      </div>

      {/* Timeline — GATHERING (no per-guest read route). */}
      <div style={{ background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 14, padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--txt)", flex: 1 }}>{t("cu.top.title")}</span>
          <TruthChip state="gather" />
        </div>
        <div style={{ fontSize: 11, color: "var(--faint)", lineHeight: 1.6 }}>{t("cu.dossier.timelineGather")}</div>
      </div>

      {/* Actions — SOON (no backend). */}
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <TruthChip state="soon" />
        <span style={{ fontSize: 11, color: "var(--faint)", lineHeight: 1.6 }}>{t("cu.dossier.actionsSoon")}</span>
      </div>
    </div>
  );
}

function Fact({ label, value, tier }: { label: string; value: React.ReactNode; tier: Tier }) {
  const grad: Record<Tier, string> = { gold: "var(--g-gold)", green: "var(--g-green)", blue: "var(--g-blue)", coral: "var(--g-coral)", violet: "var(--g-violet)" };
  return (
    <div style={{ background: grad[tier], color: "var(--ink)", borderRadius: 13, padding: "11px 13px" }}>
      <div style={{ fontSize: 18, fontWeight: 900, fontFamily: "var(--kvx-font-ui)" }}>{value}</div>
      <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: ".05em", color: "var(--ink-soft)", textTransform: "uppercase", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 2px" }}>
      <TruthChip state="gather" />
      <span style={{ fontSize: 12, color: "var(--faint)", lineHeight: 1.6 }}>{children}</span>
    </div>
  );
}

// Premium, intentional hero state — fills the wall area for empty / no-match /
// DEGRADED (load-failure). Honest: it never fabricates a customer; the DEGRADED
// variant keeps the DEGRADED chip + message (not softened away).
function HeroState({ icon, title, body, chip, tone }: { icon: React.ReactNode; title: string; body?: string; chip?: React.ReactNode; tone?: "degraded" }) {
  const degraded = tone === "degraded";
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center",
      gap: 12, minHeight: 360, padding: "44px 24px", borderRadius: 20,
      background: degraded ? "rgba(255,107,94,.05)" : "var(--inset)",
      border: degraded ? "1px solid rgba(255,107,94,.28)" : "1px dashed var(--stroke2)",
    }}>
      <span style={{ width: 56, height: 56, borderRadius: 16, display: "grid", placeItems: "center", flex: "none",
        background: degraded ? "rgba(255,107,94,.12)" : "var(--inset2)", color: degraded ? "#ffb3a8" : "var(--faint)" }}>{icon}</span>
      {chip}
      <div style={{ fontSize: 15, fontWeight: 800, color: "var(--txt)" }}>{title}</div>
      {body && <div style={{ fontSize: 12, color: "var(--faint)", lineHeight: 1.75, maxWidth: 440 }}>{body}</div>}
    </div>
  );
}

const ctxCard: React.CSSProperties = {
  background: "var(--panel)", border: "1px solid var(--stroke)", borderRadius: 18, padding: 15, backdropFilter: "blur(12px)",
};
const ctxNote: React.CSSProperties = {
  fontSize: 11.5, color: "var(--faint)", lineHeight: 1.6, padding: "2px 2px",
};
