"use client";

// ============================================================================
// console_v2 item 7 — Outcomes (v35 dark-glass rebuild). The written-once verdict
// on every closed conversation: ordered / lost / question / complaint, plus
// coverage (rows ÷ closed).
//
// LAW (and current reality): the outcomes table is queued in the KSA-window track
// (WO-1) — it is NOT live for any tenant, and there is no /api/outcomes or
// coverage endpoint. So the page renders the FULL designed Ledger shell in its
// honest GATHERING state — the real stat tiles, insight lane, ledger and coverage
// chrome — with NO fabricated numbers. Chromatic Truth: "a green day-one dashboard
// is a lie" → GATHERING is never colored, so the ORDERED (gold) / LOST (coral) /
// CONVERSION (blue) tiles render neutral-shimmer until real data flows; the vivid
// tier fills return only when the aggregate is real. LOST, when live, floors at
// coral (#ff9440) — NEVER safety-red (red = safety only). The coverage DOCTRINE is
// copy, not data, so it renders now. Lights up when WO-1 lands.
// ============================================================================

import { useState } from "react";
import { Target, TrendingDown, Percent, CheckCircle2, Sparkles, Send, X } from "lucide-react";
import {
  HeaderRow, PageGrid, Panel, SectionHeader, TruthChip, MiniModal, Toasts, pushToast,
} from "@/components/console-v2/kit";
import { useT } from "@/lib/i18n/lang";
import type { DictKey } from "@/lib/i18n/dictionary";

const FILTERS: DictKey[] = ["out.filter.all", "out.filter.ordered", "out.filter.lost", "out.filter.questions", "out.filter.complaints"];
const PERIODS: DictKey[] = ["out.pd.today", "out.pd.week", "out.pd.month"];

export default function OutcomesPage() {
  const t = useT();
  const [filter, setFilter] = useState(0);
  const [period, setPeriod] = useState(0);
  const [coverageOpen, setCoverageOpen] = useState(false);

  return (
    <>
      <HeaderRow
        title={t("out.title")}
        jobLine={t("out.sub")}
        right={
          <>
            <div style={pillGroup}>
              {PERIODS.map((k, i) => (
                <button key={k} onClick={() => setPeriod(i)} style={period === i ? pillOn : pillOff}>{t(k)}</button>
              ))}
            </div>
            <button onClick={() => setCoverageOpen(true)} style={coverageChip} title={t("out.coverage")}>
              {t("out.coverage")} <TruthChip state="gather" />
            </button>
          </>
        }
      />

      <PageGrid
        context={
          <>
            {/* LEFT — summary tiles + Karim-noticed lane. All GATHERING (no live aggregate). */}
            <Panel>
              <SectionHeader icon={<Target size={15} />} tier="gold" title={t("out.today")} sub={t("out.summaryGathering")} right={<TruthChip state="gather" />} />
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                <GatherTile icon={<CheckCircle2 size={15} />} label={t("out.ordered")} />
                <GatherTile icon={<TrendingDown size={15} />} label={t("out.lost")} />
                <GatherTile icon={<Percent size={15} />} label={t("out.conversion")} />
              </div>
              {/* Send report — no report job wired for console_v2 yet → SOON. */}
              <button onClick={() => pushToast(t("out.soonHint"), "blue")} style={reportBtn}>
                <Send size={13} /> {t("out.report")} <TruthChip state="soon" />
              </button>
            </Panel>

            <Panel>
              <SectionHeader icon={<Sparkles size={15} />} tier="violet" title={t("out.karimNoticed")} sub={t("out.soonHint")} right={<TruthChip state="gather" />} />
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <GatherLine /><GatherLine /><GatherLine />
              </div>
            </Panel>
          </>
        }
        hero={
          <Panel style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <SectionHeader icon={<Target size={15} />} tier="gold" title={t("out.ledger.title")} sub={t("out.ledger.sub")} right={<TruthChip state="gather" />} />

            {/* Filter tabs — render, inert until data. */}
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
              {FILTERS.map((k, i) => (
                <button key={k} onClick={() => setFilter(i)} aria-pressed={filter === i} style={filter === i ? tabOn : tabOff}>{t(k)}</button>
              ))}
            </div>

            {/* The Ledger — GATHERING shell (no rows fabricated). */}
            <div style={ledgerGather}>
              <div style={{ display: "inline-flex", marginBottom: 12, width: 46, height: 46, borderRadius: 14, background: "var(--inset)", alignItems: "center", justifyContent: "center", color: "var(--dim)" }}>
                <Target size={22} />
              </div>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}><TruthChip state="gather" /></div>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: "var(--txt)", margin: "0 0 8px" }}>{t("out.gatheringTitle")}</h2>
              <p style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.8, maxWidth: 520, margin: "0 auto" }}>{t("out.gatheringBody")}</p>
              <p style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 10 }}>{t("out.replaySoon")}</p>
            </div>

            {/* The coverage DOCTRINE — real copy, not data. */}
            <div style={doctrineCard}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--dim)", marginBottom: 8 }}>{t("out.covDoctrineTitle")}</div>
              <p style={{ fontSize: 11.5, color: "var(--dim)", lineHeight: 1.9, margin: 0 }}>{t("out.covDoctrine")}</p>
            </div>
          </Panel>
        }
      />

      {/* Coverage modal — the written-once law (copy, renders now). */}
      <MiniModal open={coverageOpen} onClose={() => setCoverageOpen(false)}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 17 }}>🧾</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: "var(--txt)", flex: 1 }}>{t("out.covDoctrineTitle")}</span>
          <TruthChip state="gather" />
          <button onClick={() => setCoverageOpen(false)} style={modalX}><X size={15} /></button>
        </div>
        <p style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.9 }}>{t("out.covDoctrine")}</p>
        <p style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 12, textAlign: "center" }}>{t("out.soonHint")}</p>
      </MiniModal>

      <Toasts />
    </>
  );
}

// ---------------------------------------------------------------------------
// A summary tile in its GATHERING state — the tile footprint (icon + metric
// label) with a shimmer where the number will be. Never a colored/fake figure.
// ---------------------------------------------------------------------------
function GatherTile({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={gatherTileBox}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ color: "var(--dim)", display: "inline-flex" }}>{icon}</span>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--txt)", flex: 1 }}>{label}</span>
        <TruthChip state="gather" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ background: "rgba(255,255,255,.06)", height: 22, borderRadius: 7, width: "55%" }} />
        <div style={{ background: "rgba(255,255,255,.06)", height: 11, borderRadius: 7, width: "80%" }} />
      </div>
    </div>
  );
}
function GatherLine() {
  return (
    <div style={{ background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 12, padding: "11px 13px", display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ background: "rgba(255,255,255,.06)", height: 12, borderRadius: 6, width: "70%" }} />
      <div style={{ background: "rgba(255,255,255,.06)", height: 10, borderRadius: 6, width: "45%" }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
const pillGroup: React.CSSProperties = { display: "flex", gap: 4, background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 12, padding: 3 };
const pillOn: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, color: "var(--ink)", background: "var(--g-blue)", border: 0, borderRadius: 9, padding: "6px 13px", cursor: "pointer" };
const pillOff: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: "var(--dim)", background: "transparent", border: 0, borderRadius: 9, padding: "6px 13px", cursor: "pointer", fontFamily: "var(--kvx-font-ar)" };
const coverageChip: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 700, color: "var(--dim)", background: "var(--panel)", border: "1px solid var(--stroke)", borderRadius: 99, padding: "5px 11px", cursor: "pointer", fontFamily: "var(--kvx-font-ar)" };
const gatherTileBox: React.CSSProperties = { background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 15, padding: 14 };
const reportBtn: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", marginTop: 12, height: 38, borderRadius: 12, border: "1px solid var(--stroke)", background: "var(--inset)", color: "var(--dim)", fontFamily: "var(--kvx-font-ar)", fontSize: 12, fontWeight: 800, cursor: "pointer" };
const tabOn: React.CSSProperties = { height: 32, padding: "0 13px", borderRadius: 99, border: 0, background: "var(--g-blue)", color: "var(--ink)", fontFamily: "var(--kvx-font-ar)", fontSize: 12, fontWeight: 800, cursor: "pointer" };
const tabOff: React.CSSProperties = { height: 32, padding: "0 13px", borderRadius: 99, border: "1px solid var(--stroke)", background: "transparent", color: "var(--dim)", fontFamily: "var(--kvx-font-ar)", fontSize: 12, fontWeight: 800, cursor: "pointer" };
const ledgerGather: React.CSSProperties = { border: "1.5px dashed var(--stroke2)", borderRadius: 16, background: "var(--inset2)", padding: 28, textAlign: "center" };
const doctrineCard: React.CSSProperties = { marginTop: 16, border: "1px solid var(--stroke)", borderRadius: 14, background: "var(--inset)", padding: "16px 18px" };
const modalX: React.CSSProperties = { width: 30, height: 30, borderRadius: 10, background: "var(--inset)", border: "1px solid var(--stroke)", color: "var(--dim)", cursor: "pointer", display: "grid", placeItems: "center", flex: "none" };
