"use client";

// ============================================================================
// MaitreAI — WO-DELIVERY-D1 / WO-UI-1: the ONE reusable delivery-zone map editor.
// An RTL, Arabic-first bottom-sheet mounted in BOTH the Onboarding «التشغيل» step
// AND Settings→«التوصيل» (same component, same API — /api/onboarding/config/zones).
//
// Draw a zone as a CIRCLE (drag the center pin, drag the gold radius handle) and
// set its name / delivery fee / ETA-promise / branch. Money is NOT computed here —
// the fee is a plain number the operator types; the ordering engine reads it back.
//
// WO-UI-1 rebuild (console design language):
//  • PORTALED to document.body, wrapped in `.kvx` so it escapes the app shell's
//    backdrop-filter / overflow-hidden stacking traps and truly covers the viewport.
//    (Before: a bare position:fixed div nested in a card was contained + clipped by
//    `.kvx-device`'s backdrop-filter and could not overlay sibling cards.)
//  • OPAQUE elevated sheet over an OPAQUE backdrop — no page content bleeds through.
//  • Emerald quiet-luxury commit; gold (#e0b53a) map accents preserved.
//  • Arabic-Indic numerals shown in the fee/ETA fields; input is NORMALIZED so both
//    Arabic-Indic (٠-٩) AND Latin (0-9) digits are accepted. Root cause of the
//    fee=0/eta=null bug: JS `\d` matched ASCII only, so Arabic-Indic keystrokes were
//    stripped to "" → Number("")=0 slipped past the guard. Fee is now REQUIRED
//    non-empty; 0 can never be saved silently.
//
// The Leaflet map is split into ZoneMapCanvas and loaded via next/dynamic ssr:false
// (react-leaflet is client-only). This file has no direct leaflet import.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { MapPin, X, Plus, Trash2, LocateFixed, Loader2, Check } from "lucide-react";
import { Bdi } from "@/components/kivo";
import { DEFAULT_CENTER } from "./zone-constants";
import { roundRadiusKm, formatKm, parseRadiusKm, sanitizeRadiusInput } from "@/lib/delivery/zone-editor-geom";

const ZoneMapCanvas = dynamic(() => import("./ZoneMapCanvas"), {
  ssr: false,
  loading: () => <div style={{ height: "100%", width: "100%", background: "#0b0f16", display: "grid", placeItems: "center", color: "#7c8698", fontSize: 12 }}>…جارٍ تحميل الخريطة</div>,
});

export interface EditorBranch {
  id: string;
  name: string;
}
export interface EditorZone {
  id: string;
  name: string;
  deliveryFee: number;
  minOrder?: number;
  estimatedTime: string;
  branchId?: string;
  centerLat?: number;
  centerLng?: number;
  radiusKm?: number;
  active?: boolean;
}

// Arabic-Indic digits so figures match the console's own writing.
const AR = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
const toAr = (n: number | string) => String(n).replace(/[0-9]/g, (d) => AR[Number(d)]);
// Normalize any digits the operator types — Arabic-Indic (U+0660–0669), Eastern
// Arabic-Indic (U+06F0–06F9), and the Arabic decimal separator ٫ (U+066B) — to
// ASCII, so an Arabic keyboard's digit row is never silently discarded.
const toAscii = (s: string) =>
  s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .replace(/٬/g, "");
// Fee: digits + a single decimal point. ETA: digits only.
const sanitizeFee = (s: string) => toAscii(s).replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
const sanitizeEta = (s: string) => toAscii(s).replace(/[^\d]/g, "");

// ---- OPAQUE surface tokens (the D3 fix — no translucency, no bleed) ----------
const SHEET = "#161c28";
const HEAD = "#1a2230";
const FIELD_BG = "#0f141d";
const GOLD = "#e0b53a"; // preserved map accent (matches ZoneMapCanvas)
const EMERALD = "linear-gradient(135deg,#66e4b6,#2ecc9a)";

const label: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, color: "var(--dim, #9aa6ba)", marginBottom: 6, display: "block" };
const field: React.CSSProperties = { width: "100%", height: 44, padding: "0 14px", borderRadius: 12, border: "1px solid var(--stroke2, rgba(255,255,255,.2))", background: FIELD_BG, color: "var(--txt, #f2f5f9)", fontSize: 15, fontFamily: "inherit", outline: "none" };
const rowPanel: React.CSSProperties = { background: "rgba(255,255,255,.03)", border: "1px solid var(--stroke, rgba(255,255,255,.1))", borderRadius: 14 };

interface DraftState {
  id: string | null; // null = new zone
  name: string;
  fee: string;
  eta: string;
  branchId: string;
  center: { lat: number; lng: number };
  radiusKm: number;
}

function emptyDraft(branches: EditorBranch[]): DraftState {
  return {
    id: null,
    name: "",
    fee: "",
    eta: "",
    branchId: branches.length === 1 ? branches[0].id : "",
    center: DEFAULT_CENTER,
    radiusKm: 3,
  };
}

export default function ZoneMapEditor({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Called after any successful create/update/delete so the host can refresh. */
  onSaved?: () => void;
}) {
  const [branches, setBranches] = useState<EditorBranch[]>([]);
  const singleBranch = branches.length <= 1;
  const [zones, setZones] = useState<EditorZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Portal target only exists on the client; gate the portal on mount so SSR/first
  // paint is inert (the component is used inside "use client" pages, but this keeps
  // it safe anywhere and avoids a hydration mismatch).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const loadZones = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [zRes, bRes] = await Promise.all([
        fetch("/api/onboarding/config/zones", { cache: "no-store" }),
        fetch("/api/onboarding/config/branches", { cache: "no-store" }),
      ]);
      const zData = await zRes.json().catch(() => ({}));
      if (!zRes.ok) throw new Error(zData?.detail || zData?.error || "fetch_failed");
      setZones((zData.zones ?? []) as EditorZone[]);
      if (bRes.ok) {
        const bData = await bRes.json().catch(() => ({}));
        setBranches((bData.branches ?? []) as EditorBranch[]);
      }
    } catch (e) {
      setError("تعذّر تحميل مناطق التوصيل.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Dismissal = FULL discard (D1). The editor is a persistently-mounted controlled
  // modal, so an unsaved draft would otherwise survive close→reopen and re-appear
  // with the dragged (unsaved) geometry. resetDraft wipes ALL editing state; every
  // dismissal path (X / backdrop / ESC) goes through handleClose, and closing the
  // sheet resets too — so reopening ALWAYS shows the last SAVED state.
  const resetDraft = useCallback(() => {
    setDraft(null);
    setFlyTarget(null);
    setError(null);
  }, []);
  const handleClose = useCallback(() => {
    resetDraft();
    onClose();
  }, [resetDraft, onClose]);

  useEffect(() => {
    if (!open) { resetDraft(); return; }
    void loadZones();
  }, [open, loadZones, resetDraft]);

  // Escape discards + closes; lock the page scroll while the sheet owns the screen.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, handleClose]);

  const startNew = () => {
    setError(null);
    setDraft(emptyDraft(branches));
    setFlyTarget(null);
  };
  const startEdit = (z: EditorZone) => {
    setError(null);
    const center = z.centerLat != null && z.centerLng != null ? { lat: z.centerLat, lng: z.centerLng } : DEFAULT_CENTER;
    setDraft({
      id: z.id,
      name: z.name,
      fee: z.deliveryFee != null ? String(z.deliveryFee) : "",
      eta: (z.estimatedTime || "").replace(/[^\d]/g, ""),
      branchId: z.branchId ?? (singleBranch && branches[0] ? branches[0].id : ""),
      center,
      radiusKm: z.radiusKm && z.radiusKm > 0 ? roundRadiusKm(z.radiusKm) : 3,
    });
    setFlyTarget(center);
  };

  const useMyLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation || !draft) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude };
        setDraft((d) => (d ? { ...d, center: next } : d));
        setFlyTarget(next);
      },
      () => setError("تعذّر تحديد موقعك — حرّك الدبوس يدوياً."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const canSave = useMemo(() => {
    if (!draft) return false;
    if (!draft.name.trim()) return false;
    // Fee is REQUIRED and non-empty — an empty field must NOT coerce to 0 and save
    // silently (the original defect). A real 0 fee still needs a typed "0".
    const feeStr = draft.fee.trim();
    if (feeStr === "") return false;
    const fee = Number(feeStr);
    if (!Number.isFinite(fee) || fee < 0) return false;
    if (!singleBranch && !draft.branchId) return false;
    return true;
  }, [draft, singleBranch]);

  const save = async () => {
    if (!draft || !canSave) return;
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = {
      name: draft.name.trim(),
      deliveryFee: Number(draft.fee.trim()),
      minOrder: 0,
      // eslint-disable-next-line local-rules/no-arabic-name-number-interpolation -- serialized API value, not rendered; the server stores and later reconstructs this exact "N دقيقة" string
      estimatedTime: draft.eta.trim() ? `${draft.eta.trim()} دقيقة` : "",
      branchId: draft.branchId || (singleBranch && branches[0] ? branches[0].id : undefined),
      centerLat: draft.center.lat,
      centerLng: draft.center.lng,
      // draft.radiusKm is ALREADY canonical (roundRadiusKm at every mutation), so the
      // saved value is byte-equal to what the operator sees — no toFixed re-round (D2).
      radiusKm: draft.radiusKm,
    };
    try {
      const url = draft.id ? `/api/onboarding/config/zones/${draft.id}` : "/api/onboarding/config/zones";
      const res = await fetch(url, {
        method: draft.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || data?.error || "save_failed");
      setDraft(null);
      await loadZones();
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error && e.message !== "save_failed" ? e.message : "تعذّر حفظ المنطقة.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (z: EditorZone) => {
    setError(null);
    try {
      const res = await fetch(`/api/onboarding/config/zones/${z.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete_failed");
      await loadZones();
      onSaved?.();
    } catch {
      setError("تعذّر حذف المنطقة.");
    }
  };

  if (!open || !mounted) return null;

  const sheet = (
    <div className="kvx" dir="rtl" style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center", fontFamily: "var(--kvx-font-ar)" }}>
      {/* OPAQUE backdrop — no page content bleeds through (D3). Near-solid ink over a
          blur: content is fully obscured (the .86 the reviewer flagged is raised to
          .96 so nothing is legible through it) while a whisper of depth is kept. */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(6,9,14,.96)", backdropFilter: "blur(8px)" }} onClick={handleClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="محرر مناطق التوصيل"
        style={{
          position: "relative", width: "100%", maxWidth: 460, maxHeight: "94vh", display: "flex", flexDirection: "column",
          overflow: "hidden", borderTopLeftRadius: 22, borderTopRightRadius: 22,
          background: SHEET, border: "1px solid var(--stroke2, rgba(255,255,255,.2))", borderBottom: 0,
          color: "var(--txt, #f2f5f9)", boxShadow: "0 -30px 90px rgba(0,0,0,.6)",
        }}
      >
        {/* grab handle */}
        <div style={{ width: 42, height: 5, borderRadius: 99, background: "var(--stroke2, rgba(255,255,255,.2))", margin: "9px auto 2px" }} />

        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px 14px", background: HEAD, borderBottom: "1px solid var(--stroke, rgba(255,255,255,.1))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: EMERALD, color: "#0b1a14", flex: "none" }}>
              <MapPin size={17} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{draft ? (draft.id ? "تعديل منطقة التوصيل" : "منطقة توصيل جديدة") : "مناطق التوصيل"}</div>
              <div style={{ fontSize: 10, letterSpacing: ".05em", color: "var(--faint, #66748a)", textTransform: "uppercase", marginTop: 2 }}>على الخريطة · مركز ونصف قطر</div>
            </div>
          </div>
          <button onClick={handleClose} aria-label="إغلاق" style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid var(--stroke, rgba(255,255,255,.1))", background: "transparent", color: "var(--dim, #9aa6ba)", cursor: "pointer", display: "grid", placeItems: "center" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: "16px 18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {error && <div style={{ ...rowPanel, borderColor: "rgba(232,180,90,.4)", background: "rgba(232,180,90,.12)", color: "#ffcf8d", padding: "9px 12px", fontSize: 12.5 }}>{error}</div>}

          {!draft && (
            <>
              <button onClick={startNew} style={{ height: 46, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontWeight: 900, borderRadius: 14, border: 0, color: "#0b1a14", background: EMERALD, cursor: "pointer", fontFamily: "inherit", fontSize: 14, boxShadow: "0 6px 18px rgba(46,204,154,.22)" }}>
                <Plus size={17} /> منطقة جديدة
              </button>
              {loading ? (
                <div style={{ ...rowPanel, padding: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--dim, #9aa6ba)", fontSize: 13 }}>
                  <Loader2 size={16} className="animate-spin" /> جارٍ التحميل…
                </div>
              ) : zones.length === 0 ? (
                <div style={{ ...rowPanel, padding: 18, color: "var(--dim, #9aa6ba)", fontSize: 13, textAlign: "center", lineHeight: 1.7 }}>لا توجد مناطق توصيل بعد.<br />أضف أول منطقة وارسمها على الخريطة.</div>
              ) : (
                zones.map((z) => (
                  <div key={z.id} style={{ ...rowPanel, padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <button onClick={() => startEdit(z)} style={{ flex: 1, textAlign: "start", background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontFamily: "inherit" }}>
                      <div style={{ fontWeight: 800, fontSize: 13.5 }}><Bdi>{z.name}</Bdi></div>
                      <div style={{ fontSize: 11.5, color: "var(--dim, #9aa6ba)", marginTop: 3 }}>
                        رسوم <Bdi>{toAr(z.deliveryFee)}</Bdi> ر.س
                        {z.estimatedTime ? <> · <Bdi>{toAr(z.estimatedTime)}</Bdi></> : null}
                        {z.radiusKm ? <> · نصف قطر <Bdi>{toAr(z.radiusKm)}</Bdi> كم</> : " · بدون خريطة بعد"}
                      </div>
                    </button>
                    <button onClick={() => remove(z)} aria-label="حذف المنطقة" style={{ width: 34, height: 34, borderRadius: 9, border: "1px solid rgba(255,107,94,.3)", background: "transparent", color: "#ff9d9d", cursor: "pointer", display: "grid", placeItems: "center", flex: "none" }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))
              )}
            </>
          )}

          {draft && (
            <>
              <div style={{ position: "relative", height: 224, borderRadius: 16, overflow: "hidden", border: "1px solid var(--stroke, rgba(255,255,255,.1))" }}>
                <ZoneMapCanvas
                  center={draft.center}
                  radiusKm={draft.radiusKm}
                  flyTarget={flyTarget}
                  onCenterChange={(lat, lng) => setDraft((d) => (d ? { ...d, center: { lat, lng } } : d))}
                  onRadiusChange={(km) => setDraft((d) => (d ? { ...d, radiusKm: roundRadiusKm(km) } : d))}
                />
                <div style={{ position: "absolute", insetBlockStart: 10, insetInlineStart: 10, zIndex: 500, pointerEvents: "none", fontSize: 11.5, fontWeight: 800, color: GOLD, background: "rgba(10,14,20,.72)", border: `1px solid rgba(224,181,58,.35)`, padding: "5px 10px", borderRadius: 9 }}>
                  نصف القطر {toAr(formatKm(draft.radiusKm))} كم
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: -4 }}>
                <span style={{ fontSize: 11.5, color: "var(--dim, #9aa6ba)" }}>اسحب الدبوس للمركز، والمقبض الذهبي لضبط نصف القطر.</span>
                <button onClick={useMyLocation} style={{ display: "flex", alignItems: "center", gap: 5, height: 30, padding: "0 11px", borderRadius: 9, border: `1px solid rgba(224,181,58,.3)`, background: "transparent", color: GOLD, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flex: "none" }}>
                  <LocateFixed size={13} /> موقعي
                </button>
              </div>

              {/* Numeric radius — the EXACT path (type ٣٫٥ and it applies exactly), two-way
                  with the drag handle. Both write the one canonical draft.radiusKm. */}
              <RadiusField radiusKm={draft.radiusKm} onRadiusChange={(km) => setDraft((d) => (d ? { ...d, radiusKm: km } : d))} />

              <div>
                <label style={label} htmlFor="zone-name">اسم المنطقة</label>
                <input id="zone-name" style={field} value={draft.name} onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))} placeholder="مثال: حي النخيل" onFocus={(e) => (e.currentTarget.style.borderColor = "var(--teal, #2ecc9a)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--stroke2, rgba(255,255,255,.2))")} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <NumberField id="zone-fee" label="رسوم التوصيل" unit="ر.س" inputMode="decimal" value={toAr(draft.fee)} placeholder="٠" onChange={(v) => setDraft((d) => (d ? { ...d, fee: sanitizeFee(v) } : d))} />
                <NumberField id="zone-eta" label="مدة التوصيل" unit="دقيقة" inputMode="numeric" value={toAr(draft.eta)} placeholder="٣٠" onChange={(v) => setDraft((d) => (d ? { ...d, eta: sanitizeEta(v) } : d))} />
              </div>
              {!singleBranch && (
                <div>
                  <label style={label} htmlFor="zone-branch">الفرع</label>
                  <select id="zone-branch" style={{ ...field }} value={draft.branchId} onChange={(e) => setDraft((d) => (d ? { ...d, branchId: e.target.value } : d))}>
                    <option value="">اختر الفرع…</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                <button onClick={() => setDraft(null)} style={{ flex: 1, height: 48, borderRadius: 14, background: "transparent", border: "1px solid var(--stroke2, rgba(255,255,255,.2))", color: "var(--dim, #9aa6ba)", fontWeight: 800, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>إلغاء</button>
                <button onClick={save} disabled={!canSave || saving} style={{ flex: 2, height: 48, borderRadius: 14, border: 0, background: canSave ? EMERALD : "rgba(46,204,154,.28)", color: "#0b1a14", fontWeight: 900, cursor: canSave && !saving ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: "inherit", fontSize: 14, boxShadow: canSave ? "0 6px 18px rgba(46,204,154,.25)" : "none" }}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.8} />} حفظ المنطقة
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}

// RTL-correct numeric field: the number is right-aligned and the unit sits as a
// fixed suffix at the inline-end, so figure and unit never collide in RTL. Display
// is Arabic-Indic; the parent normalizes keystrokes back to ASCII for storage.
function NumberField({ id, label: lbl, unit, value, placeholder, inputMode, onChange }: {
  id: string;
  label: string;
  unit: string;
  value: string;
  placeholder: string;
  inputMode: "decimal" | "numeric";
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label style={label} htmlFor={id}>{lbl}</label>
      <div style={{ position: "relative" }}>
        <input
          id={id}
          style={{ ...field, textAlign: "right", paddingInlineEnd: 52, fontVariantNumeric: "tabular-nums", letterSpacing: ".02em" }}
          inputMode={inputMode}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--teal, #2ecc9a)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--stroke2, rgba(255,255,255,.2))")}
        />
        <span style={{ position: "absolute", insetInlineEnd: 14, top: "50%", transform: "translateY(-50%)", fontSize: 11.5, fontWeight: 700, color: "var(--faint, #66748a)", pointerEvents: "none" }}>{unit}</span>
      </div>
    </div>
  );
}

// The numeric radius — the EXACT precision path alongside the drag handle. Both feed
// the one canonical draft.radiusKm, so the field, the map circle, the handle's live
// label, and the saved value are always the same number. While focused it shows what
// is being typed (Arabic-Indic accepted via the shared sanitizer); when blurred it
// mirrors the live radius the drag handle also writes — the two never disagree.
function RadiusField({ radiusKm, onRadiusChange }: { radiusKm: number; onRadiusChange: (km: number) => void }) {
  const [focused, setFocused] = useState(false);
  const [typed, setTyped] = useState("");
  const shown = focused ? typed : formatKm(radiusKm);
  return (
    <div>
      <label style={label} htmlFor="zone-radius">نصف القطر</label>
      <div style={{ position: "relative" }}>
        <input
          id="zone-radius"
          style={{ ...field, textAlign: "right", paddingInlineEnd: 52, fontVariantNumeric: "tabular-nums", letterSpacing: ".02em" }}
          inputMode="decimal"
          value={toAr(shown)}
          placeholder="٣"
          onChange={(e) => {
            const s = sanitizeRadiusInput(e.target.value);
            setTyped(s);
            const n = parseRadiusKm(s);
            if (n != null) onRadiusChange(n);
          }}
          onFocus={(e) => { setFocused(true); setTyped(formatKm(radiusKm)); e.currentTarget.style.borderColor = "var(--teal, #2ecc9a)"; }}
          onBlur={(e) => { setFocused(false); e.currentTarget.style.borderColor = "var(--stroke2, rgba(255,255,255,.2))"; }}
        />
        <span style={{ position: "absolute", insetInlineEnd: 14, top: "50%", transform: "translateY(-50%)", fontSize: 11.5, fontWeight: 700, color: "var(--faint, #66748a)", pointerEvents: "none" }}>كم</span>
      </div>
    </div>
  );
}
