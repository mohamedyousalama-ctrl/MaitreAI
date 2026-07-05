"use client";

// ============================================================================
// console_v2 item 7 — Outcomes (v7 spec). The written-once verdict on every closed
// conversation: ordered / lost / question / complaint, plus coverage (rows ÷ closed).
//
// LAW (and current reality): the outcomes table is queued in the KSA-window track —
// it is NOT live for any tenant yet, and there is no /api/outcomes or coverage
// endpoint. So EVERY metric renders honest GATHERING — never a placeholder number.
// The page is the real structure + the real coverage DOCTRINE (which is copy, not
// data), ready to wire when WO-1 lands. Estimates, when they arrive, always render
// through <Est> so they are labelled «تقديري / est.» and never read as authoritative.
// ============================================================================

import { useState } from "react";
import { Target, TrendingDown, Percent } from "lucide-react";
import { TruthChip } from "@/components/console-v2";
import { useT } from "@/lib/i18n/lang";
import type { DictKey } from "@/lib/i18n/dictionary";

const FILTERS: DictKey[] = ["out.filter.all", "out.filter.ordered", "out.filter.lost", "out.filter.questions", "out.filter.complaints"];

export default function OutcomesPage() {
  const t = useT();
  const [filter, setFilter] = useState(0);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      {/* Header + coverage chip (GATHERING — no % until the table is live). */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--kv-text)", margin: 0, flex: 1 }}>{t("out.title")}</h1>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, color: "var(--kv-muted)" }}>
          {t("out.coverage")} <TruthChip state="gathering" />
        </span>
      </div>
      <p style={{ fontSize: 13, color: "var(--kv-muted)", margin: "0 0 20px", lineHeight: 1.7 }}>{t("out.sub")}</p>

      {/* Summary cards — LOST (with est. value) + CONVERSION. Both GATHERING. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14, marginBottom: 20 }}>
        <SummaryCard icon={<TrendingDown size={16} />} label={t("out.lost")} tone="#b9822a">
          {/* When live, the lost VALUE is an estimate → <Est>. For now: gathering. */}
          <GatheringRows />
        </SummaryCard>
        <SummaryCard icon={<Percent size={16} />} label={t("out.conversion")} tone="#0A8A5F">
          <GatheringRows />
        </SummaryCard>
      </div>

      {/* Filter tabs (render, inert until data). */}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
        {FILTERS.map((k, i) => (
          <button key={k} onClick={() => setFilter(i)} style={{ height: 32, padding: "0 13px", borderRadius: "var(--kv-r-pill)", border: filter === i ? 0 : "1px solid var(--kv-border)", background: filter === i ? "var(--kv-grad-brand)" : "var(--kv-card)", color: filter === i ? "#fff" : "var(--kv-muted)", fontFamily: "var(--kv-font)", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
            {t(k)}
          </button>
        ))}
      </div>

      {/* Outcome list — GATHERING (table not live: no rows fabricated). */}
      <div style={{ border: "1.5px dashed rgba(100,116,139,.28)", borderRadius: "var(--kv-r-lg)", background: "var(--kv-card-soft)", padding: 28, textAlign: "center" }}>
        <div style={{ display: "inline-flex", marginBottom: 12, width: 46, height: 46, borderRadius: 14, background: "rgba(154,167,184,.16)", alignItems: "center", justifyContent: "center", color: "var(--kv-slate)" }}>
          <Target size={22} />
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}><TruthChip state="gathering" /></div>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: "var(--kv-text)", margin: "0 0 8px" }}>{t("out.gatheringTitle")}</h2>
        <p style={{ fontSize: 13, color: "var(--kv-muted)", lineHeight: 1.8, maxWidth: 520, margin: "0 auto" }}>{t("out.gatheringBody")}</p>
      </div>

      {/* The coverage DOCTRINE — real copy, not data: the written-once law + gaps-never-invented. */}
      <div style={{ marginTop: 20, border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-md-lg)", background: "var(--kv-card)", padding: "16px 18px" }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--kv-muted)", marginBottom: 8 }}>{t("out.covDoctrineTitle")}</div>
        <p style={{ fontSize: 12.5, color: "var(--kv-muted)", lineHeight: 1.9, margin: 0 }}>{t("out.covDoctrine")}</p>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, tone, children }: { icon: React.ReactNode; label: string; tone: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--kv-card)", border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-md-lg)", boxShadow: "var(--kv-shadow-card)", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ color: tone, display: "inline-flex" }}>{icon}</span>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--kv-text)", flex: 1 }}>{label}</span>
        <TruthChip state="gathering" />
      </div>
      {children}
    </div>
  );
}

function GatheringRows() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="kv-skeleton" style={{ height: 22, borderRadius: 7, width: "55%" }} />
      <div className="kv-skeleton" style={{ height: 12, borderRadius: 7, width: "80%" }} />
      <div className="kv-skeleton" style={{ height: 12, borderRadius: 7, width: "40%" }} />
    </div>
  );
}
