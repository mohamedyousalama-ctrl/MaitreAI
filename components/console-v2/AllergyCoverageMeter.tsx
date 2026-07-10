"use client";
// ============================================================================
// MaitreAI — Onboarding two-axis coverage nudge (WO-COMPANION W2). Self-gating: it
// fetches /api/onboarding/allergy-coverage; OFF (flag off) → renders nothing, so the
// onboarding page is byte-identical for flag-off tenants. Shows both axes' progress
// («٨ من ١٨ صنف مؤكّدة المكونات» / «… مؤكّدة التحضير») so the operator knows what's left.
// ============================================================================

import { useEffect, useState } from "react";

interface Coverage { total: number; ingredientVerified: number; prepVerified: number; bothVerified: number }
interface Resp { enabled: boolean; coverage?: Coverage; labels?: { ingredient: string; prep: string } }

function Bar({ n, total, tone, text }: { n: number; total: number; tone: string; text: string }) {
  const pct = total > 0 ? Math.round((n / total) * 100) : 0;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--dim)", marginBottom: 4 }}><span dir="rtl">{text}</span><span>{pct}%</span></div>
      <div style={{ height: 7, borderRadius: 999, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: tone, borderRadius: 999, transition: "width .4s" }} />
      </div>
    </div>
  );
}

export default function AllergyCoverageMeter() {
  const [r, setR] = useState<Resp | null>(null);
  useEffect(() => {
    fetch("/api/onboarding/allergy-coverage", { credentials: "include" }).then((x) => x.json()).then(setR).catch(() => setR({ enabled: false }));
  }, []);
  if (!r || !r.enabled || !r.coverage || !r.labels) return null;
  const c = r.coverage;
  return (
    <div style={{ marginTop: 14, background: "rgba(192,73,47,.08)", border: "1px solid rgba(192,73,47,.28)", borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: "#f4b9ab" }} dir="rtl">⚠️ تغطية بيانات الحساسية (محورين)</div>
      <Bar n={c.ingredientVerified} total={c.total} tone="#4aa76e" text={r.labels.ingredient} />
      <Bar n={c.prepVerified} total={c.total} tone="#e8b45a" text={r.labels.prep} />
      <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 8 }} dir="rtl">
        كل ما تأكّدت أصناف أكثر، كيفو يقدر يعطي إجابات أدق عن الحساسية بدل «ما أقدر أجزم».
      </div>
    </div>
  );
}
