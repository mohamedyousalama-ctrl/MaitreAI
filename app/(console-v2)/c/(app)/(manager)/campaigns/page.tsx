"use client";

// ============================================================================
// console_v2 item 16 — Campaigns (v35 dark-glass rebuild). "Recipes, not blasts —
// every send passes Approvals." Presentation rebuilt onto the shared kit; all
// data + truth logic UNCHANGED from the shipped page.
//
// Scope (guardian ruling): the campaigns ENGINE (recipes, targeting, send funnel,
// holdout lift, composer, and its editor/picker/schedule/results modals) is
// UNBUILT → honest SOON, rendered as the designed component chrome in its SOON
// state (never a fake recipe with fabricated funnel/attribution). What is REAL:
//
//  • Capacity strip — GET /api/capacity → { tier, quality, source, remaining_est }.
//    remaining_est is an ESTIMATE we own (tier − our 24h template-send count) →
//    rendered through <Est> («تقديري / est.»); Meta's counter is authoritative.
//    quality is Meta's real rating. tier null / no sync → GATHERING (never guessed).
//    Market-rules card is a fixed Meta reference (not tenant data).
//  • Template registry — GET /api/settings/templates → 0068 message_templates rows,
//    each with its CATEGORY-TRUTH chip (content decides the category, not intent:
//    any offer/discount is MARKETING). Migration 0068 unapplied today → GATHERING.
//
// RED = safety only. A low Meta quality or a paused template is a messaging-health
// alert (amber/slate), NEVER structural red. XSS: dictionary text nodes + <Bdi>/
// <Num>/<Est> only; no dangerouslySetInnerHTML.
// ============================================================================

import { useEffect, useState } from "react";
import { Megaphone, Radio, Loader2, ShieldCheck, BarChart3, Signal, Globe, LayoutGrid } from "lucide-react";
import { HeaderRow, SectionHeader, Panel, TruthChip } from "@/components/console-v2/kit";
import { Est } from "@/components/console-v2/Est";
import { Num, Bdi } from "@/components/kivo";
import { useT } from "@/lib/i18n/lang";
import type { DictKey } from "@/lib/i18n/dictionary";

// ---- capacity ---------------------------------------------------------------
interface Capacity { tier: string | null; quality: string; source: string | null; sent_24h: number; remaining_est: number | null }
const QUALITY_LABEL: Record<string, DictKey> = { green: "cmp.cap.q.green", yellow: "cmp.cap.q.yellow", red: "cmp.cap.q.red", unknown: "cmp.cap.q.unknown" };
// green → teal · yellow/red → amber (a messaging-health alert, NEVER safety-red) · unknown → slate
const QUALITY_DOT: Record<string, string> = { green: "var(--teal)", yellow: "var(--amber)", red: "var(--amber)", unknown: "var(--faint)" };

// ---- template registry ------------------------------------------------------
interface Template { name: string; language: string; variant: string; category: string; meta_status: string; quality_rating: string; body_text: string }
const CAT_LABEL: Record<string, DictKey> = { marketing: "cmp.cat.marketing", utility: "cmp.cat.utility", authentication: "cmp.cat.authentication" };
const CAT_STYLE: Record<string, React.CSSProperties> = {
  marketing: { color: "#d4bcff", background: "rgba(168,120,240,.14)", border: "1px solid rgba(168,120,240,.4)" },
  utility: { color: "#8ce8cc", background: "rgba(46,204,154,.12)", border: "1px solid rgba(46,204,154,.4)" },
  authentication: { color: "#a9d4ff", background: "rgba(75,139,255,.12)", border: "1px solid rgba(75,139,255,.4)" },
};
const STATUS_LABEL: Record<string, DictKey> = {
  approved: "cmp.st.approved", pending: "cmp.st.pending", rejected: "cmp.st.rejected",
  paused: "cmp.st.paused", disabled: "cmp.st.disabled", unknown: "cmp.st.unknown",
};
// approved → emerald · paused/rejected → amber (non-safety alert) · pending/disabled/unknown → slate
const STATUS_TONE: Record<string, { color: string; bg: string }> = {
  approved: { color: "#8ce8cc", bg: "rgba(46,204,154,.12)" },
  paused: { color: "#ffcf8d", bg: "rgba(232,180,90,.16)" },
  rejected: { color: "#ffcf8d", bg: "rgba(232,180,90,.16)" },
  pending: { color: "var(--dim)", bg: "var(--inset2)" },
  disabled: { color: "var(--faint)", bg: "var(--inset2)" },
  unknown: { color: "var(--faint)", bg: "var(--inset2)" },
};

export default function CampaignsPage() {
  const t = useT();
  const [cap, setCap] = useState<Capacity | null>(null);
  const [capLoading, setCapLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [regLoading, setRegLoading] = useState(true);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const res = await fetch("/api/capacity");
        const j = await res.json();
        if (!dead && res.ok) setCap(j as Capacity);
      } catch { /* GATHERING */ }
      finally { if (!dead) setCapLoading(false); }
    })();
    (async () => {
      try {
        const res = await fetch("/api/settings/templates");
        const j = await res.json();
        if (!dead && res.ok && Array.isArray(j.templates)) setTemplates(j.templates as Template[]);
      } catch { /* GATHERING */ }
      finally { if (!dead) setRegLoading(false); }
    })();
    return () => { dead = true; };
  }, []);

  const capReady = !!cap && (cap.tier != null || cap.remaining_est != null);

  return (
    <>
      <HeaderRow
        title={t("cmp.title")}
        jobLine={t("cmp.subtitle")}
        right={cap && cap.quality ? <TruthChip state={capReady ? "live" : "gather"} label={t(QUALITY_LABEL[cap.quality] ?? "cmp.cap.q.unknown")} /> : undefined}
      />

      <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16, paddingTop: 4 }}>
        {/* Doctrine intro */}
        <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.65, padding: "12px 15px", background: "rgba(75,139,255,.06)", border: "1px solid rgba(75,139,255,.28)", borderRadius: 13 }}>
          {t("cmp.intro")}
        </div>

        {/* CAPACITY STRIP — capacity + quality real; market rules fixed reference. */}
        <SectionHeader tier="blue" icon={<BarChart3 size={15} />} title={t("cmp.cap.title")} right={capReady ? <TruthChip state="live" /> : <TruthChip state="gather" />} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
          <StripCard tier="blue" icon={<BarChart3 size={14} />} title={t("cmp.cap.capTitle")} sub={t("cmp.cap.capSub")}>
            {capLoading ? <Loading /> : !capReady || !cap ? (
              <Gather label={t("cmp.cap.gathering")} />
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  {cap.remaining_est != null && <span style={{ fontSize: 22, fontWeight: 900, color: "var(--txt)", fontFamily: "var(--kvx-font-ui)" }}><Est value={cap.remaining_est} /></span>}
                  {cap.tier != null && <span style={{ fontSize: 12, color: "var(--faint)", fontWeight: 700 }}>/ <Num>{cap.tier}</Num> {t("cmp.cap.tier")}</span>}
                </div>
                <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 6 }}>{t("cmp.cap.remaining")}{cap.source && <> · {t(cap.source === "meta_sync" ? "cmp.cap.source.meta" : "cmp.cap.source.manual")}</>}</div>
              </>
            )}
          </StripCard>

          <StripCard tier="green" icon={<Signal size={14} />} title={t("cmp.cap.qTitle")} sub={t("cmp.cap.qSub")}>
            {capLoading ? <Loading /> : !cap || !cap.quality ? (
              <Gather label={t("cmp.cap.gathering")} />
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: QUALITY_DOT[cap.quality] ?? "var(--faint)" }} />
                <span style={{ fontSize: 15, fontWeight: 800, color: "var(--txt)" }}>{t(QUALITY_LABEL[cap.quality] ?? "cmp.cap.q.unknown")}</span>
              </div>
            )}
          </StripCard>

          <StripCard tier="gold" icon={<Globe size={14} />} title={t("cmp.cap.mktTitle")} sub={t("cmp.cap.mktSub")}>
            <div style={{ fontSize: 10.5, color: "var(--faint)", lineHeight: 1.6 }}>{t("cmp.cap.mktNote")}</div>
          </StripCard>
        </div>

        {/* TEMPLATE REGISTRY — REAL (0068) with category-truth chips. */}
        <SectionHeader tier="violet" icon={<Megaphone size={15} />} title={t("cmp.reg.title")} sub={t("cmp.reg.sub")} right={templates && templates.length > 0 ? <TruthChip state="live" /> : <TruthChip state="gather" />} />
        <Panel>
          {regLoading ? (
            <Loading label={t("cmp.reg.loading")} />
          ) : !templates || templates.length === 0 ? (
            <Gather label={t("cmp.reg.gathering")} block />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {templates.map((tpl) => (
                <div key={`${tpl.name}:${tpl.language}:${tpl.variant}`} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "11px 13px", background: "var(--inset2)", border: "1px solid var(--stroke)", borderRadius: 12 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--txt)", fontFamily: "var(--kvx-font-ui)" }}><Bdi>{tpl.name}</Bdi></span>
                  <span style={{ fontSize: 10, color: "var(--faint)", fontWeight: 700 }}><Bdi>{tpl.language}</Bdi></span>
                  <Chip label={t(CAT_LABEL[tpl.category] ?? "cmp.cat.utility")} style={CAT_STYLE[tpl.category] ?? CAT_STYLE.utility} />
                  <span style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                    <QualityDot rating={tpl.quality_rating} />
                    <StatusChip status={tpl.meta_status} />
                  </span>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: "var(--faint)", lineHeight: 1.6, marginTop: 10 }}>{t("cmp.reg.catLaw")}</div>
        </Panel>

        {/* RECIPES — SOON (engine unbuilt): full designed card chrome in SOON, no fake data. */}
        <SectionHeader tier="green" icon={<Radio size={15} />} title={t("cmp.recipes.title")} sub={t("cmp.recipes.sub")} right={<TruthChip state="soon" />} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
          <GhostRecipe /><GhostRecipe /><GhostRecipe />
        </div>
        <div style={{ fontSize: 11.5, color: "var(--faint)", lineHeight: 1.65, padding: "0 2px" }}>{t("cmp.recipes.soon")}</div>

        {/* FORMATS ARSENAL — SOON (arrives with the engine). */}
        <SectionHeader tier="blue" icon={<LayoutGrid size={15} />} title={t("cmp.formats.title")} right={<TruthChip state="soon" />} />
        <Panel style={{ borderStyle: "dashed" }}>
          <div style={{ fontSize: 12, color: "var(--faint)", lineHeight: 1.65 }}>{t("cmp.formats.soon")}</div>
        </Panel>

        {/* COMPOSER — SOON. */}
        <SectionHeader tier="violet" icon={<ShieldCheck size={15} />} title={t("cmp.composer.title")} right={<TruthChip state="soon" />} />
        <Panel style={{ borderStyle: "dashed" }}>
          <div style={{ fontSize: 12, color: "var(--faint)", lineHeight: 1.65 }}>{t("cmp.composer.soon")}</div>
        </Panel>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
const STRIP_GRAD: Record<"blue" | "green" | "gold", string> = { blue: "var(--g-blue)", green: "var(--g-green)", gold: "var(--g-gold)" };
function StripCard({ tier, icon, title, sub, children }: { tier: "blue" | "green" | "gold"; icon: React.ReactNode; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 16, padding: "14px 15px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: STRIP_GRAD[tier], color: "var(--ink)", display: "grid", placeItems: "center", flex: "none" }}>{icon}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--txt)" }}>{title}</div>
          <div style={{ fontSize: 8.5, color: "var(--faint)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", marginTop: 1 }}>{sub}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

// A recipe-card SHELL in SOON — the designed anatomy (badge, title line, stat
// slots, footer) rendered as shimmer, with NO fabricated eligible/safe/cost.
function GhostRecipe() {
  const t = useT();
  return (
    <div style={{ background: "var(--inset)", border: "1px dashed var(--stroke2)", borderRadius: 16, padding: 15, opacity: 0.85 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: "var(--inset2)", display: "grid", placeItems: "center", flex: "none" }}><Radio size={14} style={{ color: "var(--faint)" }} /></span>
        <span className="kv-skeleton" style={{ flex: 1, height: 12, borderRadius: 6 }} />
        <TruthChip state="soon" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[0, 1, 2, 3].map((i) => <span key={i} className="kv-skeleton" style={{ height: 34, borderRadius: 10 }} />)}
      </div>
    </div>
  );
}

function Chip({ label, style }: { label: string; style: React.CSSProperties }) {
  return <span style={{ fontSize: 9.5, fontWeight: 800, borderRadius: 7, padding: "3px 9px", ...style }}>{label}</span>;
}
function StatusChip({ status }: { status: string }) {
  const t = useT();
  const tone = STATUS_TONE[status] ?? STATUS_TONE.unknown;
  return <Chip label={t(STATUS_LABEL[status] ?? "cmp.st.unknown")} style={{ color: tone.color, background: tone.bg, border: "1px solid var(--stroke)" }} />;
}
function QualityDot({ rating }: { rating: string }) {
  return <span title={rating} style={{ width: 8, height: 8, borderRadius: "50%", background: QUALITY_DOT[rating] ?? "var(--faint)", flex: "none" }} />;
}
function Loading({ label }: { label?: string }) {
  const t = useT();
  return <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--dim)", padding: "6px 0" }}><Loader2 size={14} className="kv-spin" /> {label ?? t("cmp.cap.loading")}</div>;
}
function Gather({ label, block }: { label: string; block?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, ...(block ? { padding: "14px 16px", background: "var(--inset2)", border: "1px solid var(--stroke)", borderRadius: 12 } : {}) }}>
      <TruthChip state="gather" />
      <span style={{ fontSize: 11.5, color: "var(--dim)", lineHeight: 1.55 }}>{label}</span>
    </div>
  );
}
