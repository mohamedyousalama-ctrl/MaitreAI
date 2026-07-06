"use client";

// ============================================================================
// console_v2 item 11 — Customers (CRM). "The regulars wall — every direct guest,
// remembered honestly." The last of the seven pages.
//
// THE MEMORY LAW: facts (حقائق) come only from real orders; Karim's readings
// (استنتاج) are always labeled and never mixed with facts.
//
//  • REAL — facts strip, segment counts, top-by-spend, slipping-away all come from
//    GET /api/customers/aggregates, which derives from the customers table's own
//    maintained counters via the pure computeCustomerAggregates (the single source of
//    truth — this page NEVER re-derives). Segments follow the ratified formula
//    (new ≤1 · returning 2–4 · loyal ≥5); at-risk = ordered ≥1 but silent 30+ days.
//    When the tenant is unconfigured / has no customers, every surface renders honest
//    GATHERING — never a fabricated guest or number.
//  • SOON — customer_memory inference (استنتاج labels) is flag-gated (customer_memory)
//    and 0 rows until Pro is explicitly on → the memory card is SOON, never faked. The
//    win-back / merge / opt-out write actions (Growth/Decision-Layer + consent
//    machinery) have no backend yet → SOON.
//
// Colour: identity hues per segment; NO red (at-risk is amber, not red — red = safety
// only). XSS: dictionary text nodes + <Bdi>/<Num> only.
// ============================================================================

import { useEffect, useState } from "react";
import { Star, Repeat, Sparkles, Clock3, Trophy, Brain, Users } from "lucide-react";
import { TruthChip } from "@/components/console-v2";
import { useRestaurantStore } from "@/lib/store";
import { useT } from "@/lib/i18n/lang";
import { Bdi, Num } from "@/components/kivo";

interface Facts { totalCustomers: number; totalOrders: number; totalRevenue: number; avgOrderValue: number; avgOrdersPerCustomer: number }
interface TopRow { id: string; name: string | null; phone: string | null; ltv: number; orders_count: number }
interface RiskRow { id: string; name: string | null; phone: string | null; last_seen_at: string | null; days_since: number }
interface Aggregates { facts: Facts; segments: { new: number; returning: number; loyal: number }; topBySpend: TopRow[]; atRisk: RiskRow[] }

export default function CustomersPage() {
  const t = useT();
  const currency = useRestaurantStore((s) => s.profile.currency);
  const [data, setData] = useState<Aggregates | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/customers/aggregates", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Aggregates) => { if (alive) setData(d); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);

  const money = (n: number) => <span><Num>{Math.round(n).toLocaleString("en-US")}</Num> <span style={{ fontSize: 11, color: "var(--kv-muted)" }}>{currency}</span></span>;
  const repeatCount = data ? data.segments.returning + data.segments.loyal : 0;

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--kv-text)", margin: "0 0 6px" }}>{t("cu.title")}</h1>
          <p style={{ fontSize: 13, color: "var(--kv-muted)", margin: 0, lineHeight: 1.7 }}>{t("cu.sub")}</p>
        </div>
        {data && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11.5, fontWeight: 700, color: "var(--kv-muted)", background: "var(--kv-card)", border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-pill)", padding: "6px 12px", whiteSpace: "nowrap" }}>
            <Users size={13} /> <Num>{data.facts.totalCustomers}</Num> {t("cu.guests")} · ↺ <Num>{repeatCount}</Num> {t("cu.repeat")}
          </span>
        )}
      </div>

      {error ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><TruthChip state="gathering" /><span style={{ fontSize: 12.5, color: "var(--kv-faint)" }}>{t("cu.loadError")}</span></div>
      ) : data === null ? null : (
        <>
          {/* Facts strip — pure arithmetic from real orders. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
            <Fact label={t("cu.guests")} value={<Num>{data.facts.totalCustomers}</Num>} />
            <Fact label={t("cu.facts.orders")} value={<Num>{data.facts.totalOrders}</Num>} />
            <Fact label={t("cu.facts.revenue")} value={money(data.facts.totalRevenue)} />
            <Fact label={t("cu.facts.avgOrder")} value={money(data.facts.avgOrderValue)} />
          </div>

          {/* Segment tiles — derived, never invented. VIP=loyal, REPEAT=returning, NEW=new, RISK=at-risk. */}
          <section style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: "var(--kv-text)", flex: 1 }}>{t("cu.derived")}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 800, color: "#0A8A5F", background: "rgba(14,159,110,.12)", borderRadius: "var(--kv-r-pill)", padding: "4px 10px" }}>✓ {t("cu.derived")}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
              <SegTile icon={<Star size={15} />} accent="#c58b1f" label={t("cu.seg.vip")} hint={t("cu.seg.vipHint")} n={data.segments.loyal} />
              <SegTile icon={<Repeat size={15} />} accent="#3f7fe0" label={t("cu.seg.repeat")} hint={t("cu.seg.repeatHint")} n={data.segments.returning} />
              <SegTile icon={<Sparkles size={15} />} accent="#0E9F6E" label={t("cu.seg.new")} hint={t("cu.seg.newHint")} n={data.segments.new} />
              <SegTile icon={<Clock3 size={15} />} accent="#b9822a" label={t("cu.seg.risk")} hint={t("cu.seg.riskHint")} n={data.atRisk.length} />
            </div>
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16, alignItems: "start" }}>
            {/* Top regulars — by real spend. */}
            <section style={card}>
              <Head icon={<Trophy size={16} />} accent="#c58b1f" title={t("cu.top.title")} sub={t("cu.top.sub")} />
              {data.topBySpend.length === 0 ? <EmptyLine>{t("cu.top.empty")}</EmptyLine> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {data.topBySpend.map((c, i) => (
                    <div key={c.id} style={rowStyle}>
                      <span style={{ width: 22, fontSize: 12, fontWeight: 800, color: "var(--kv-faint)", textAlign: "center" }}><Num>{i + 1}</Num></span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--kv-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><Bdi>{c.name || "—"}</Bdi></div>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--kv-faint)", marginTop: 2 }}><Num>{c.orders_count}</Num> {t("cu.top.orders")}</div>
                      </div>
                      <span style={{ textAlign: "end" }}>
                        <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--kv-text)" }}>{money(c.ltv)}</div>
                        <div style={{ fontSize: 9, fontWeight: 800, color: "var(--kv-faint)" }}>{t("cu.top.lifetime")}</div>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Slipping away — at-risk (real days silent). Win-back = SOON. */}
            <section style={card}>
              <Head icon={<Clock3 size={16} />} accent="#b9822a" title={t("cu.slip.title")} sub={t("cu.slip.sub")} />
              {data.atRisk.length === 0 ? <EmptyLine>{t("cu.slip.empty")}</EmptyLine> : (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {data.atRisk.slice(0, 8).map((c) => (
                      <div key={c.id} style={rowStyle}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--kv-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><Bdi>{c.name || "—"}</Bdi></div>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#b9822a", whiteSpace: "nowrap" }}><Num>{c.days_since}</Num> {t("cu.slip.days")}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                    <TruthChip state="soon" />
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--kv-faint)" }}>{t("cu.slip.winback")}</span>
                  </div>
                </>
              )}
            </section>
          </div>

          {/* Karim's memory — inference. Flag-gated customer_memory, 0 rows → SOON. */}
          <section style={card}>
            <Head icon={<Brain size={16} />} accent="#a878f0" title={t("cu.mem.title")} sub={t("cu.mem.sub")} />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <TruthChip state="soon" />
              <span style={{ fontSize: 12.5, color: "var(--kv-faint)", lineHeight: 1.6 }}>{t("cu.mem.soon")}</span>
            </div>
          </section>
        </>
      )}

      {/* The memory law — copy, not data. */}
      <div style={{ border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-md-lg)", background: "var(--kv-card-soft)", padding: "12px 16px", fontSize: 12.5, color: "var(--kv-muted)", lineHeight: 1.85 }}>
        💡 {t("cu.law")}
      </div>
      {/* Customer write actions — no backend yet → honest SOON. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <TruthChip state="soon" />
        <span style={{ fontSize: 11.5, color: "var(--kv-faint)" }}>{t("cu.actionsSoon")}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ background: "var(--kv-card)", border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-md-lg)", padding: "12px 14px" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: "var(--kv-text)" }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--kv-muted)", marginTop: 2 }}>{label}</div>
    </div>
  );
}
function SegTile({ icon, accent, label, hint, n }: { icon: React.ReactNode; accent: string; label: string; hint: string; n: number }) {
  return (
    <div style={{ background: "var(--kv-card-soft)", border: "1px solid var(--kv-border)", borderTop: `3px solid ${accent}`, borderRadius: "var(--kv-r-md-lg)", padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
        <span style={{ color: accent, display: "inline-flex" }}>{icon}</span>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--kv-text)" }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: accent }}><Num>{n}</Num></div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--kv-faint)", marginTop: 2 }}>{hint}</div>
    </div>
  );
}
function Head({ icon, accent, title, sub }: { icon: React.ReactNode; accent: string; title: string; sub: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
      <span style={{ color: accent, display: "inline-flex", marginTop: 1 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: "var(--kv-text)", margin: 0 }}>{title}</h2>
        <p style={{ fontSize: 11.5, color: "var(--kv-faint)", margin: "3px 0 0", lineHeight: 1.6 }}>{sub}</p>
      </div>
    </div>
  );
}
function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 2px" }}>
      <TruthChip state="gathering" />
      <span style={{ fontSize: 12.5, color: "var(--kv-faint)", lineHeight: 1.6 }}>{children}</span>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "var(--kv-card)", border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-lg)",
  boxShadow: "var(--kv-shadow-card)", padding: "16px 20px",
};
const rowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, background: "var(--kv-card-soft)",
  border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-md)", padding: "10px 13px",
};
