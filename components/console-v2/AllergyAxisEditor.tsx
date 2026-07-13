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
import { ShieldCheck, AlertTriangle, Loader2, Check } from "lucide-react";
import { ALLERGENS, canonicalToArLabel } from "@/lib/ai/allergen-vocab";
import { CROSS_CONTACT_TAGS, PREP_STATUSES, ISOLATE_VALUES, crossContactLabelAr, prepStatusLabelAr, kitchenCanIsolateLabelAr } from "@/lib/ai/allergen-prep-vocab";
// WO-ALLERGEN-EDITOR — the pure, race-closed state model (proven in
// scripts/proof-allergen-editor-races.test.ts). The component is a thin view over it:
// server-authoritative per-axis apply (no refetch to race) + advisory dirty detection.
import { mergeAxisResponse, isAxisDirty, type AllergyData, type Axis } from "@/lib/console-v2/allergy-editor-state";

type State = AllergyData;

const coral = "#c0492f";
const label: React.CSSProperties = { fontSize: 9, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--faint)", fontWeight: 700 };
const chip = (on: boolean): React.CSSProperties => ({
  padding: "5px 11px", borderRadius: 999, fontSize: 12, cursor: "pointer", border: "1px solid",
  borderColor: on ? coral : "rgba(255,255,255,.14)", background: on ? "rgba(192,73,47,.18)" : "transparent",
  color: on ? "#f4b9ab" : "var(--dim)", fontWeight: on ? 700 : 500,
});
const inputStyle: React.CSSProperties = { background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, padding: "8px 10px", color: "var(--txt)", fontSize: 13, width: "100%" };
// FR-020 — a native <select>'s OPEN option list is OS-painted (white-on-light,
// unreadable on the dark console). Give the control an OPAQUE dark base + colorScheme,
// and each <option> an explicit dark bg / light text, so the prep-status + isolate
// dropdowns (safety-sensitive) are legible. Styling ONLY — no logic/state change.
const selectStyle: React.CSSProperties = { ...inputStyle, background: "#141924", colorScheme: "dark" };
const optionStyle: React.CSSProperties = { backgroundColor: "#141924", color: "#f2f5f9" };
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

type AxisMsg = "saved" | "error" | "not_provisioned" | null;
const parseIngredients = (text: string) => text.split(/[،,]/).map((x) => x.trim()).filter(Boolean);

export default function AllergyAxisEditor({ itemId }: { itemId: string }) {
  const [s, setS] = useState<State | null>(null);
  // Last SERVER-applied values, per axis — the baseline the advisory dirty indicator
  // compares against (WO-ALLERGEN-EDITOR).
  const [baseline, setBaseline] = useState<State | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [ingredientsText, setIngredientsText] = useState("");
  const [msg, setMsg] = useState<{ ingredient: AxisMsg; prep: AxisMsg }>({ ingredient: null, prep: null });

  async function load() {
    const r = await fetch(`/api/menu/${itemId}/allergy-data`, { credentials: "include" }).then((x) => x.json()).catch(() => null);
    if (!r || !r.enabled) { setEnabled(false); return; }
    setEnabled(true); setS(r); setBaseline(r);
    setNotes(r.preparationNotes ?? ""); setIngredientsText((r.ingredients ?? []).join("، "));
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [itemId]);

  if (enabled === false) return null;
  if (!s || !baseline) return <div style={{ padding: 16, color: "var(--faint)", fontSize: 12 }}><Loader2 size={13} className="spin" /> …</div>;

  // The current EDITABLE data (s + the text-field mirrors) — used for advisory dirty
  // detection against the per-axis baseline.
  const current: State = { ...s, ingredients: parseIngredients(ingredientsText), preparationNotes: notes };
  const dirty = (axis: Axis) => isAxisDirty(current, baseline, axis);

  // ONE write, end to end (WO-ALLERGEN-EDITOR): SERIALIZED (refused while busy), and the
  // authoritative post-write row is applied PER-AXIS — the other axis's unsaved edits are
  // never touched, and there is NO refetch to race. busy is cleared in `finally`, AFTER
  // the response is applied, so a second action can't interleave the apply.
  async function post(body: Record<string, unknown>, key: string, axis: Axis) {
    if (busy) return;
    setBusy(key);
    setMsg((m) => ({ ...m, [axis]: null }));
    try {
      const r = await fetch(`/api/menu/${itemId}/allergy-data`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (r.status === 409) { setMsg((m) => ({ ...m, [axis]: "not_provisioned" })); return; }
      if (!r.ok) { setMsg((m) => ({ ...m, [axis]: "error" })); return; }
      const row = (await r.json()) as AllergyData;
      // Server-authoritative, per-axis: apply ONLY this axis from the response; sync its
      // text mirror; leave the other axis's local (possibly-unsaved) edits intact.
      setS((p) => (p ? mergeAxisResponse(p, axis, row) : p));
      setBaseline((p) => (p ? mergeAxisResponse(p, axis, row) : p));
      if (axis === "ingredient") setIngredientsText((row.ingredients ?? []).join("، "));
      else setNotes(row.preparationNotes ?? "");
      setMsg((m) => ({ ...m, [axis]: "saved" }));
    } catch {
      setMsg((m) => ({ ...m, [axis]: "error" }));
    } finally {
      setBusy(null);
    }
  }

  // Local, unsaved edits — clear this axis's saved/error signal so it never lingers stale.
  const editIngredient = (patch: Partial<State>) => { setS((p) => p && ({ ...p, ...patch })); setMsg((m) => ({ ...m, ingredient: null })); };
  const editPrep = (patch: Partial<State>) => { setS((p) => p && ({ ...p, ...patch })); setMsg((m) => ({ ...m, prep: null })); };
  const toggleAllergen = (k: string) => editIngredient({ allergens: s.allergens.includes(k) ? s.allergens.filter((x) => x !== k) : [...s.allergens, k] });
  const toggleTag = (k: string) => editPrep({ crossContactRisks: s.crossContactRisks.includes(k) ? s.crossContactRisks.filter((x) => x !== k) : [...s.crossContactRisks, k] });

  return (
    <div style={{ marginTop: 16, borderTop: `1px solid ${coral}44`, paddingTop: 14 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: "#f4b9ab", marginBottom: 4 }}>⚠️ بيانات الحساسية (محورين)</div>
      <div style={{ fontSize: 10.5, color: "var(--faint)", marginBottom: 12 }}>تعديل البيانات يلغي «تمّت المراجعة» — لازم تأكيد جديد بعد أي تغيير.</div>

      {/* ── Axis 1 — ingredients + allergens ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8 }}>
        <span style={label}>المحور ١ — المكونات والحساسية</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <AxisStatus dirty={dirty("ingredient")} msg={msg.ingredient} />
          <VerifiedBadge at={s.ingredientVerifiedAt} />
        </span>
      </div>
      <label style={{ display: "block", marginBottom: 8 }}>
        <span style={{ ...label, display: "block", marginBottom: 4 }}>المكونات (افصل بفاصلة)</span>
        <input value={ingredientsText} onChange={(e) => { setIngredientsText(e.target.value); setMsg((m) => ({ ...m, ingredient: null })); }} dir="rtl" style={inputStyle} placeholder="دجاج، رز، بهارات" />
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {ALLERGENS.map((a) => (
          <span key={a.key} onClick={() => toggleAllergen(a.key)} style={chip(s.allergens.includes(a.key))}>{a.arLabel}</span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button disabled={!!busy} style={btn("save")} onClick={() => post({ action: "save_ingredient", ingredients: parseIngredients(ingredientsText), allergens: s.allergens }, "si", "ingredient")}>حفظ المكونات</button>
        <button disabled={!!busy} style={btn("verify")} onClick={() => post({ action: "verify_ingredient" }, "vi", "ingredient")}>تأكيد المراجعة</button>
      </div>

      {/* ── Axis 2 — preparation ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8 }}>
        <span style={label}>المحور ٢ — التحضير والتلامس</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <AxisStatus dirty={dirty("prep")} msg={msg.prep} />
          <VerifiedBadge at={s.prepVerifiedAt} />
        </span>
      </div>
      <label style={{ display: "block", marginBottom: 8 }}>
        <span style={{ ...label, display: "block", marginBottom: 4 }}>حالة التحضير</span>
        <select value={s.prepStatus ?? "unknown"} onChange={(e) => editPrep({ prepStatus: e.target.value })} dir="rtl" style={selectStyle}>
          {PREP_STATUSES.map((v) => <option key={v} value={v} style={optionStyle}>{prepStatusLabelAr(v)}</option>)}
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
        <select value={s.kitchenCanIsolate ?? "unknown"} onChange={(e) => editPrep({ kitchenCanIsolate: e.target.value })} dir="rtl" style={selectStyle}>
          {ISOLATE_VALUES.map((v) => <option key={v} value={v} style={optionStyle}>{kitchenCanIsolateLabelAr(v)}</option>)}
        </select>
      </label>
      <label style={{ display: "block", marginBottom: 8 }}>
        <span style={{ ...label, display: "block", marginBottom: 4 }}>ملاحظات التحضير</span>
        <textarea value={notes} onChange={(e) => { setNotes(e.target.value); setMsg((m) => ({ ...m, prep: null })); }} dir="rtl" rows={2} style={{ ...inputStyle, resize: "vertical" }} />
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button disabled={!!busy} style={btn("save")} onClick={() => post({ action: "save_prep", prepStatus: s.prepStatus ?? "unknown", crossContactRisks: s.crossContactRisks, kitchenCanIsolate: s.kitchenCanIsolate ?? "unknown", preparationNotes: notes }, "sp", "prep")}>حفظ التحضير</button>
        <button disabled={!!busy} style={btn("verify")} onClick={() => post({ action: "verify_prep" }, "vp", "prep")}>تأكيد المراجعة</button>
      </div>
    </div>
  );
}

// Advisory per-axis status: an unsaved-edit dot «● تغييرات غير محفوظة» (NEVER a blocker —
// the operator can always save), a «تم الحفظ ✓» confirmation on a successful write (the
// positive safety signal the surface previously never gave), or an honest error line.
function AxisStatus({ dirty, msg }: { dirty: boolean; msg: AxisMsg }) {
  if (msg === "saved" && !dirty)
    return <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: "#7fd3a0", fontWeight: 700 }}><Check size={11} /> تم الحفظ</span>;
  if (msg === "error")
    return <span style={{ fontSize: 10, color: "#e8b45a", fontWeight: 700 }}>تعذّر الحفظ — حاول مجددًا</span>;
  if (msg === "not_provisioned")
    return <span style={{ fontSize: 10, color: "#e8b45a", fontWeight: 700 }}>الميزة غير مفعّلة بعد</span>;
  if (dirty)
    return <span style={{ fontSize: 10, color: "#e8b45a", fontWeight: 700 }}>● تغييرات غير محفوظة</span>;
  return null;
}
