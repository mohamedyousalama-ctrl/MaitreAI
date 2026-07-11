"use client";
// ============================================================================
// MaitreAI — console_v2 two-axis allergy editor (WO-COMPANION W2). The dashboard
// DIRECT-write surface (ruling A): an authenticated manager IS the reviewer. Two
// axes, symmetric — ingredient/allergen and preparation/cross-contact — each with a
// VERIFIED badge that a content EDIT clears (the server nulls the stamp on save) and
// a VERIFY action re-stamps. Companion-gated: it fetches /api/menu/[id]/allergy-data;
// if the flag is OFF the endpoint says {enabled:false} and this renders nothing, so a
// flag-off console is byte-identical.
//
// Safety design: this NEVER shows a "safe" verdict — it edits DATA. The truth model
// (computeDishTruthState) turns that data into honest customer-facing statements.
// ============================================================================

import { useEffect, useState } from "react";
import { ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";
import { ALLERGENS, canonicalToArLabel } from "@/lib/ai/allergen-vocab";
import { CROSS_CONTACT_TAGS, PREP_STATUSES, ISOLATE_VALUES, crossContactLabelAr, prepStatusLabelAr, kitchenCanIsolateLabelAr } from "@/lib/ai/allergen-prep-vocab";

interface State {
  ingredients: string[]; allergens: string[]; ingredientVerifiedAt: string | null;
  prepStatus: string | null; crossContactRisks: string[]; kitchenCanIsolate: string | null;
  preparationNotes: string | null; prepVerifiedAt: string | null;
}

const coral = "#c0492f";
const label: React.CSSProperties = { fontSize: 9, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--faint)", fontWeight: 700 };
const chip = (on: boolean): React.CSSProperties => ({
  padding: "5px 11px", borderRadius: 999, fontSize: 12, cursor: "pointer", border: "1px solid",
  borderColor: on ? coral : "rgba(255,255,255,.14)", background: on ? "rgba(192,73,47,.18)" : "transparent",
  color: on ? "#f4b9ab" : "var(--dim)", fontWeight: on ? 700 : 500,
});
const inputStyle: React.CSSProperties = { background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, padding: "8px 10px", color: "var(--txt)", fontSize: 13, width: "100%" };
const btn = (kind: "save" | "verify"): React.CSSProperties => ({
  height: 34, padding: "0 14px", borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: "1px solid",
  borderColor: kind === "verify" ? "rgba(74,167,110,.5)" : "rgba(255,255,255,.16)",
  background: kind === "verify" ? "rgba(74,167,110,.16)" : "rgba(255,255,255,.05)",
  color: kind === "verify" ? "#7fd3a0" : "var(--txt)",
});

function VerifiedBadge({ at }: { at: string | null }) {
  return at
    ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "#7fd3a0", fontWeight: 700 }}><ShieldCheck size={12} /> تمّت المراجعة</span>
    : <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "#e8b45a", fontWeight: 700 }}><AlertTriangle size={12} /> لم تُراجع</span>;
}

export default function AllergyAxisEditor({ itemId }: { itemId: string }) {
  const [s, setS] = useState<State | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [ingredientsText, setIngredientsText] = useState("");

  async function load() {
    const r = await fetch(`/api/menu/${itemId}/allergy-data`, { credentials: "include" }).then((x) => x.json()).catch(() => null);
    if (!r || !r.enabled) { setEnabled(false); return; }
    setEnabled(true); setS(r);
    setNotes(r.preparationNotes ?? ""); setIngredientsText((r.ingredients ?? []).join("، "));
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [itemId]);

  if (enabled === false) return null;
  if (!s) return <div style={{ padding: 16, color: "var(--faint)", fontSize: 12 }}><Loader2 size={13} className="spin" /> …</div>;

  async function post(body: Record<string, unknown>, key: string) {
    setBusy(key);
    const r = await fetch(`/api/menu/${itemId}/allergy-data`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(null);
    if (r && r.ok) await load();
  }

  const toggleAllergen = (k: string) => setS((p) => p && ({ ...p, allergens: p.allergens.includes(k) ? p.allergens.filter((x) => x !== k) : [...p.allergens, k] }));
  const toggleTag = (k: string) => setS((p) => p && ({ ...p, crossContactRisks: p.crossContactRisks.includes(k) ? p.crossContactRisks.filter((x) => x !== k) : [...p.crossContactRisks, k] }));

  return (
    <div style={{ marginTop: 16, borderTop: `1px solid ${coral}44`, paddingTop: 14 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: "#f4b9ab", marginBottom: 4 }}>⚠️ بيانات الحساسية (محورين)</div>
      <div style={{ fontSize: 10.5, color: "var(--faint)", marginBottom: 12 }}>تعديل البيانات يلغي «تمّت المراجعة» — لازم تأكيد جديد بعد أي تغيير.</div>

      {/* ── Axis 1 — ingredients + allergens ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={label}>المحور ١ — المكونات والحساسية</span>
        <VerifiedBadge at={s.ingredientVerifiedAt} />
      </div>
      <label style={{ display: "block", marginBottom: 8 }}>
        <span style={{ ...label, display: "block", marginBottom: 4 }}>المكونات (افصل بفاصلة)</span>
        <input value={ingredientsText} onChange={(e) => setIngredientsText(e.target.value)} dir="rtl" style={inputStyle} placeholder="دجاج، رز، بهارات" />
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {ALLERGENS.map((a) => (
          <span key={a.key} onClick={() => toggleAllergen(a.key)} style={chip(s.allergens.includes(a.key))}>{a.arLabel}</span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button disabled={!!busy} style={btn("save")} onClick={() => post({ action: "save_ingredient", ingredients: ingredientsText.split(/[،,]/).map((x) => x.trim()).filter(Boolean), allergens: s.allergens }, "si")}>حفظ المكونات</button>
        <button disabled={!!busy} style={btn("verify")} onClick={() => post({ action: "verify_ingredient" }, "vi")}>تأكيد المراجعة</button>
      </div>

      {/* ── Axis 2 — preparation ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={label}>المحور ٢ — التحضير والتلامس</span>
        <VerifiedBadge at={s.prepVerifiedAt} />
      </div>
      <label style={{ display: "block", marginBottom: 8 }}>
        <span style={{ ...label, display: "block", marginBottom: 4 }}>حالة التحضير</span>
        <select value={s.prepStatus ?? "unknown"} onChange={(e) => setS((p) => p && ({ ...p, prepStatus: e.target.value }))} dir="rtl" style={inputStyle}>
          {PREP_STATUSES.map((v) => <option key={v} value={v}>{prepStatusLabelAr(v)}</option>)}
        </select>
      </label>
      <div style={{ ...label, marginBottom: 4 }}>مخاطر التلامس المشترك</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {CROSS_CONTACT_TAGS.map((tag) => (
          <span key={tag} onClick={() => toggleTag(tag)} style={chip(s.crossContactRisks.includes(tag))}>{crossContactLabelAr(tag)}</span>
        ))}
      </div>
      <label style={{ display: "block", marginBottom: 8 }}>
        <span style={{ ...label, display: "block", marginBottom: 4 }}>هل يقدر المطبخ يعزل؟</span>
        <select value={s.kitchenCanIsolate ?? "unknown"} onChange={(e) => setS((p) => p && ({ ...p, kitchenCanIsolate: e.target.value }))} dir="rtl" style={inputStyle}>
          {ISOLATE_VALUES.map((v) => <option key={v} value={v}>{kitchenCanIsolateLabelAr(v)}</option>)}
        </select>
      </label>
      <label style={{ display: "block", marginBottom: 8 }}>
        <span style={{ ...label, display: "block", marginBottom: 4 }}>ملاحظات التحضير</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} dir="rtl" rows={2} style={{ ...inputStyle, resize: "vertical" }} />
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button disabled={!!busy} style={btn("save")} onClick={() => post({ action: "save_prep", prepStatus: s.prepStatus ?? "unknown", crossContactRisks: s.crossContactRisks, kitchenCanIsolate: s.kitchenCanIsolate ?? "unknown", preparationNotes: notes }, "sp")}>حفظ التحضير</button>
        <button disabled={!!busy} style={btn("verify")} onClick={() => post({ action: "verify_prep" }, "vp")}>تأكيد المراجعة</button>
      </div>
    </div>
  );
}
