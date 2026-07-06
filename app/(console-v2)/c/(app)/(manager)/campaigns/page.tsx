"use client";

// ============================================================================
// console_v2 item 16 — Campaigns (shell). "Recipes, not blasts — every send
// passes Approvals."
//
// Scope (guardian ruling): the campaigns ENGINE (recipes, targeting, send funnel,
// holdout lift, composer) is UNBUILT → honest SOON. What is REAL and rendered:
//
//  • Capacity chip — GET /api/capacity → { tier, quality, source, remaining_est }.
//    remaining_est is an ESTIMATE we own (tier − our 24h template-send count), so
//    it renders through <Est> («تقديري / est.») — Meta's counter is authoritative,
//    ours is the honest approximation. tier null / no sync → GATHERING (never a
//    guessed number).
//  • Template registry — GET /api/settings/templates → the 0068 message_templates
//    rows, each with its CATEGORY-TRUTH chip (content decides the category, not
//    intent: any offer/discount/purchase-nudge is MARKETING). Migration 0068 is
//    unapplied today, so the read returns empty/unavailable → GATHERING, honestly.
//
// RED = safety only. A low Meta quality or a paused template is a messaging-health
// alert (amber/slate), NEVER structural red. XSS: dictionary text nodes + <Bdi>/
// <Num>/<Est> only; no dangerouslySetInnerHTML.
// ============================================================================

import { useEffect, useState } from "react";
import { Megaphone, Radio, Loader2, ShieldCheck, type LucideIcon } from "lucide-react";
import { TruthChip } from "@/components/console-v2";
import { Est } from "@/components/console-v2/Est";
import { Num, Bdi } from "@/components/kivo";
import { useT } from "@/lib/i18n/lang";
import type { DictKey } from "@/lib/i18n/dictionary";

// ---- capacity ---------------------------------------------------------------
interface Capacity { tier: string | null; quality: string; source: string | null; sent_24h: number; remaining_est: number | null }
const QUALITY_LABEL: Record<string, DictKey> = { green: "cmp.cap.q.green", yellow: "cmp.cap.q.yellow", red: "cmp.cap.q.red", unknown: "cmp.cap.q.unknown" };
// green → emerald · yellow/red → amber (a messaging-health alert, NEVER safety-red) · unknown → slate
const QUALITY_DOT: Record<string, string> = { green: "var(--kv-primary)", yellow: "var(--kv-amber)", red: "var(--kv-amber)", unknown: "var(--kv-faint)" };

// ---- template registry ------------------------------------------------------
interface Template { name: string; language: string; variant: string; category: string; meta_status: string; quality_rating: string; body_text: string }
const CAT_LABEL: Record<string, DictKey> = { marketing: "cmp.cat.marketing", utility: "cmp.cat.utility", authentication: "cmp.cat.authentication" };
const CAT_STYLE: Record<string, React.CSSProperties> = {
  marketing: { color: "#7d4fd0", background: "rgba(168,120,240,.14)", border: "1px solid rgba(168,120,240,.4)" },
  utility: { color: "var(--kv-deep)", background: "var(--kv-primary-tint)", border: "1px solid rgba(14,159,110,.4)" },
  authentication: { color: "#2f6fd0", background: "rgba(75,139,255,.12)", border: "1px solid rgba(75,139,255,.4)" },
};
const STATUS_LABEL: Record<string, DictKey> = {
  approved: "cmp.st.approved", pending: "cmp.st.pending", rejected: "cmp.st.rejected",
  paused: "cmp.st.paused", disabled: "cmp.st.disabled", unknown: "cmp.st.unknown",
};
// approved → emerald · paused/rejected → amber (non-safety alert) · pending/disabled/unknown → slate
const STATUS_TONE: Record<string, { color: string; bg: string }> = {
  approved: { color: "var(--kv-deep)", bg: "var(--kv-primary-tint)" },
  paused: { color: "#b9822a", bg: "rgba(232,180,90,.18)" },
  rejected: { color: "#b9822a", bg: "rgba(232,180,90,.18)" },
  pending: { color: "var(--kv-muted)", bg: "var(--kv-card-soft)" },
  disabled: { color: "var(--kv-faint)", bg: "var(--kv-card-soft)" },
  unknown: { color: "var(--kv-faint)", bg: "var(--kv-card-soft)" },
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

  const capReady = cap && (cap.tier != null || cap.remaining_est != null);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header + capacity chip */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--kv-text)", margin: "0 0 6px" }}>{t("cmp.title")}</h1>
          <div style={{ fontSize: 13, color: "var(--kv-muted)", fontWeight: 600 }}>{t("cmp.subtitle")}</div>
        </div>
        <CapacityChip cap={cap} loading={capLoading} ready={!!capReady} />
      </div>

      {/* Doctrine intro */}
      <div style={{ fontSize: 12, color: "var(--kv-muted)", lineHeight: 1.65, padding: "12px 15px", background: "rgba(75,139,255,.06)", border: "1px solid rgba(75,139,255,.28)", borderRadius: 13 }}>
        {t("cmp.intro")}
      </div>

      {/* Template registry — REAL (0068) */}
      <Section titleKey="cmp.reg.title" subKey="cmp.reg.sub" icon={Megaphone}>
        {regLoading ? (
          <Loading labelKey="cmp.reg.loading" />
        ) : !templates || templates.length === 0 ? (
          <Gathering labelKey="cmp.reg.gathering" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {templates.map((tpl) => (
              <div key={`${tpl.name}:${tpl.language}:${tpl.variant}`} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "11px 13px", background: "var(--kv-card-soft)", border: "1px solid var(--kv-border)", borderRadius: 12 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--kv-text)", fontFamily: "var(--kv-font-mono)" }}><Bdi>{tpl.name}</Bdi></span>
                <span style={{ fontSize: 10, color: "var(--kv-faint)", fontWeight: 700 }}><Bdi>{tpl.language}</Bdi></span>
                <Chip label={t(CAT_LABEL[tpl.category] ?? "cmp.cat.utility")} style={CAT_STYLE[tpl.category] ?? CAT_STYLE.utility} />
                <span style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                  <QualityDot rating={tpl.quality_rating} />
                  <StatusChip status={tpl.meta_status} />
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 11, color: "var(--kv-faint)", lineHeight: 1.6, marginTop: 10 }}>{t("cmp.reg.catLaw")}</div>
      </Section>

      {/* Recipes — SOON (engine unbuilt) */}
      <Section titleKey="cmp.recipes.title" subKey={null} icon={Radio} soon>
        <SoonBody labelKey="cmp.recipes.soon" />
      </Section>

      {/* Composer — SOON */}
      <Section titleKey="cmp.composer.title" subKey={null} icon={ShieldCheck} soon>
        <SoonBody labelKey="cmp.composer.soon" />
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
function CapacityChip({ cap, loading, ready }: { cap: Capacity | null; loading: boolean; ready: boolean }) {
  const t = useT();
  const base: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 14,
    background: "var(--kv-card)", border: "1px solid var(--kv-border)", flex: "none",
  };
  if (loading) return <div style={base}><Loader2 size={14} className="kv-spin" /><span style={{ fontSize: 11.5, color: "var(--kv-muted)" }}>{t("cmp.cap.loading")}</span></div>;
  if (!ready || !cap) {
    return (
      <div style={base}>
        <TruthChip state="gathering" />
        <span style={{ fontSize: 11, color: "var(--kv-muted)", maxWidth: 240, lineHeight: 1.5 }}>{t("cmp.cap.gathering")}</span>
      </div>
    );
  }
  const q = cap.quality || "unknown";
  return (
    <div style={base}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          {cap.tier != null && (
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--kv-text)" }}>
              <Num>{cap.tier}</Num> <span style={{ fontSize: 10, fontWeight: 700, color: "var(--kv-faint)" }}>{t("cmp.cap.tier")}</span>
            </span>
          )}
          {cap.remaining_est != null && (
            <span style={{ fontSize: 12, color: "var(--kv-muted)", fontWeight: 700 }}>
              · <Est value={cap.remaining_est} /> {t("cmp.cap.remaining")}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--kv-faint)", fontWeight: 700 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: QUALITY_DOT[q] ?? "var(--kv-faint)" }} />
          {t("cmp.cap.quality")}: {t(QUALITY_LABEL[q] ?? "cmp.cap.q.unknown")}
          {cap.source && <span>· {t(cap.source === "meta_sync" ? "cmp.cap.source.meta" : "cmp.cap.source.manual")}</span>}
        </div>
      </div>
    </div>
  );
}

function Section({ titleKey, subKey, icon: Icon, soon, children }: { titleKey: DictKey; subKey: DictKey | null; icon: LucideIcon; soon?: boolean; children: React.ReactNode }) {
  const t = useT();
  return (
    <div style={{ background: "var(--kv-card)", border: "1px solid var(--kv-border)", borderRadius: 16, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: subKey ? 4 : 12 }}>
        <Icon size={16} strokeWidth={2.1} style={{ color: "var(--kv-muted)" }} />
        <h2 style={{ fontSize: 15, fontWeight: 800, color: "var(--kv-text)", margin: 0 }}>{t(titleKey)}</h2>
        {soon && <span style={{ marginInlineStart: "auto" }}><TruthChip state="soon" /></span>}
      </div>
      {subKey && <div style={{ fontSize: 11.5, color: "var(--kv-muted)", marginBottom: 12 }}>{t(subKey)}</div>}
      {children}
    </div>
  );
}

function Chip({ label, style }: { label: string; style: React.CSSProperties }) {
  return <span style={{ fontSize: 9.5, fontWeight: 800, borderRadius: 7, padding: "3px 9px", ...style }}>{label}</span>;
}
function StatusChip({ status }: { status: string }) {
  const t = useT();
  const tone = STATUS_TONE[status] ?? STATUS_TONE.unknown;
  return <Chip label={t(STATUS_LABEL[status] ?? "cmp.st.unknown")} style={{ color: tone.color, background: tone.bg, border: "1px solid var(--kv-border)" }} />;
}
function QualityDot({ rating }: { rating: string }) {
  return <span title={rating} style={{ width: 8, height: 8, borderRadius: "50%", background: QUALITY_DOT[rating] ?? "var(--kv-faint)", flex: "none" }} />;
}
function Loading({ labelKey }: { labelKey: DictKey }) {
  const t = useT();
  return <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--kv-muted)", padding: "10px 0" }}><Loader2 size={14} className="kv-spin" /> {t(labelKey)}</div>;
}
function Gathering({ labelKey }: { labelKey: DictKey }) {
  const t = useT();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: "var(--kv-card-soft)", border: "1px solid var(--kv-border)", borderRadius: 12 }}>
      <TruthChip state="gathering" />
      <span style={{ fontSize: 12, color: "var(--kv-muted)", lineHeight: 1.55 }}>{t(labelKey)}</span>
    </div>
  );
}
function SoonBody({ labelKey }: { labelKey: DictKey }) {
  const t = useT();
  return <div style={{ fontSize: 12, color: "var(--kv-muted)", lineHeight: 1.65 }}>{t(labelKey)}</div>;
}
