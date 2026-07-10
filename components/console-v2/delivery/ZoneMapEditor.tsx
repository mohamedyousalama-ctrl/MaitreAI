"use client";

// ============================================================================
// MaitreAI — WO-DELIVERY-D1: the ONE reusable delivery-zone map editor (spec §1).
// A dark-glass, RTL, Arabic-first bottom-sheet. ONE implementation, mounted in BOTH
// the Onboarding «التشغيل» step AND Settings→«التوصيل» (same component, same API).
//
// Draw a zone as a CIRCLE (drag the center pin, drag the radius handle) and set its
// name / delivery fee / ETA-promise / branch. Money is NOT computed here — the fee is
// a plain number the operator types; the ordering engine reads it back (money law).
// Persists through the EXISTING zones API (/api/onboarding/config/zones) — no new
// machinery. Single-branch tenants: the branch field is hidden and the sole branch is
// auto-assigned (spec §1).
//
// The Leaflet map is split into ZoneMapCanvas and loaded via next/dynamic ssr:false
// (react-leaflet is client-only). This file has no direct leaflet import, so it is
// safe to render on the server shell until the canvas hydrates.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { MapPin, X, Plus, Trash2, LocateFixed, Loader2 } from "lucide-react";
import { DEFAULT_CENTER } from "./ZoneMapCanvas";

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

// Dark-glass tokens (console_v2 --kv-* palette used across the manager pages).
const panel: React.CSSProperties = { background: "var(--panel, rgba(20,26,38,.72))", border: "1px solid var(--stroke, rgba(255,255,255,.08))", borderRadius: 14 };
const label: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: "var(--dim, #9aa6ba)", marginBottom: 4, display: "block" };
const field: React.CSSProperties = { width: "100%", height: 38, padding: "0 12px", borderRadius: 10, border: "1px solid var(--stroke, rgba(255,255,255,.1))", background: "var(--inset2, rgba(10,13,20,.5))", color: "var(--txt, #e7ecf3)", fontSize: 13, fontFamily: "inherit" };

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

  useEffect(() => {
    if (open) void loadZones();
  }, [open, loadZones]);

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
      fee: String(z.deliveryFee ?? ""),
      eta: (z.estimatedTime || "").replace(/[^\d]/g, ""),
      branchId: z.branchId ?? (singleBranch && branches[0] ? branches[0].id : ""),
      center,
      radiusKm: z.radiusKm && z.radiusKm > 0 ? z.radiusKm : 3,
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
    const fee = Number(draft.fee);
    if (!draft.name.trim()) return false;
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
      deliveryFee: Number(draft.fee),
      minOrder: 0,
      estimatedTime: draft.eta.trim() ? `${draft.eta.trim()} دقيقة` : "",
      branchId: draft.branchId || (singleBranch && branches[0] ? branches[0].id : undefined),
      centerLat: draft.center.lat,
      centerLng: draft.center.lng,
      radiusKm: Number(draft.radiusKm.toFixed(3)),
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

  if (!open) return null;

  return (
    <div dir="rtl" style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", alignItems: "flex-end", justifyContent: "center" }} role="dialog" aria-modal="true">
      <div style={{ position: "absolute", inset: 0, background: "rgba(4,6,10,.55)", backdropFilter: "blur(2px)" }} onClick={onClose} />
      <div
        style={{
          position: "relative", width: "100%", maxWidth: 560, maxHeight: "92vh", display: "flex", flexDirection: "column",
          overflow: "hidden", borderTopLeftRadius: 20, borderTopRightRadius: 20,
          background: "var(--panel, rgba(14,18,27,.92))", backdropFilter: "blur(24px)",
          border: "1px solid var(--stroke, rgba(255,255,255,.08))", color: "var(--txt, #e7ecf3)",
        }}
      >
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--stroke, rgba(255,255,255,.08))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 15 }}>
            <MapPin size={18} style={{ color: "#e0b53a" }} /> مناطق التوصيل على الخريطة
          </div>
          <button onClick={onClose} aria-label="إغلاق" style={{ width: 34, height: 34, borderRadius: 9, border: "none", background: "transparent", color: "var(--dim, #9aa6ba)", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {error && <div style={{ ...panel, borderColor: "rgba(232,180,90,.4)", background: "rgba(232,180,90,.12)", color: "#ffcf8d", padding: "8px 12px", fontSize: 12.5 }}>{error}</div>}

          {!draft && (
            <>
              <button onClick={startNew} style={{ ...field, height: 40, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontWeight: 800, color: "#0b0f16", background: "#e0b53a", border: "none", cursor: "pointer" }}>
                <Plus size={16} /> منطقة جديدة
              </button>
              {loading ? (
                <div style={{ ...panel, padding: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--dim, #9aa6ba)", fontSize: 13 }}>
                  <Loader2 size={16} className="animate-spin" /> جارٍ التحميل…
                </div>
              ) : zones.length === 0 ? (
                <div style={{ ...panel, padding: 16, color: "var(--dim, #9aa6ba)", fontSize: 13, textAlign: "center" }}>لا توجد مناطق توصيل بعد. أضف أول منطقة وارسمها على الخريطة.</div>
              ) : (
                zones.map((z) => (
                  <div key={z.id} style={{ ...panel, padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <button onClick={() => startEdit(z)} style={{ flex: 1, textAlign: "start", background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontFamily: "inherit" }}>
                      <div style={{ fontWeight: 800, fontSize: 13.5 }}>{z.name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--dim, #9aa6ba)", marginTop: 2 }}>
                        رسوم {toAr(z.deliveryFee)}{z.estimatedTime ? ` · ${z.estimatedTime}` : ""}
                        {z.radiusKm ? ` · نصف قطر ${toAr(z.radiusKm)} كم` : " · بدون خريطة بعد"}
                      </div>
                    </button>
                    <button onClick={() => remove(z)} aria-label="حذف" style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--stroke, rgba(255,255,255,.1))", background: "transparent", color: "#ff9d9d", cursor: "pointer" }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))
              )}
            </>
          )}

          {draft && (
            <>
              <div style={{ height: 260, borderRadius: 14, overflow: "hidden", border: "1px solid var(--stroke, rgba(255,255,255,.1))" }}>
                <ZoneMapCanvas
                  center={draft.center}
                  radiusKm={draft.radiusKm}
                  flyTarget={flyTarget}
                  onCenterChange={(lat, lng) => setDraft((d) => (d ? { ...d, center: { lat, lng } } : d))}
                  onRadiusChange={(km) => setDraft((d) => (d ? { ...d, radiusKm: km } : d))}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 11.5, color: "var(--dim, #9aa6ba)" }}>اسحب الدبوس للمركز، والمقبض الذهبي لتغيير نصف القطر ({toAr(draft.radiusKm.toFixed(1))} كم).</span>
                <button onClick={useMyLocation} style={{ display: "flex", alignItems: "center", gap: 5, height: 30, padding: "0 10px", borderRadius: 8, border: "1px solid var(--stroke, rgba(255,255,255,.12))", background: "transparent", color: "#e0b53a", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  <LocateFixed size={13} /> موقعي
                </button>
              </div>

              <div>
                <label style={label}>اسم المنطقة</label>
                <input style={field} value={draft.name} onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))} placeholder="مثال: حي النخيل" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={label}>رسوم التوصيل</label>
                  <input style={field} inputMode="decimal" value={draft.fee} onChange={(e) => setDraft((d) => (d ? { ...d, fee: e.target.value.replace(/[^\d.]/g, "") } : d))} placeholder="0" />
                </div>
                <div>
                  <label style={label}>مدة التوصيل (دقيقة)</label>
                  <input style={field} inputMode="numeric" value={draft.eta} onChange={(e) => setDraft((d) => (d ? { ...d, eta: e.target.value.replace(/[^\d]/g, "") } : d))} placeholder="30" />
                </div>
              </div>
              {!singleBranch && (
                <div>
                  <label style={label}>الفرع</label>
                  <select style={{ ...field }} value={draft.branchId} onChange={(e) => setDraft((d) => (d ? { ...d, branchId: e.target.value } : d))}>
                    <option value="">اختر الفرع…</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button onClick={() => setDraft(null)} style={{ ...field, width: "auto", flex: 1, height: 42, background: "transparent", color: "var(--dim, #9aa6ba)", fontWeight: 800, cursor: "pointer" }}>إلغاء</button>
                <button onClick={save} disabled={!canSave || saving} style={{ ...field, width: "auto", flex: 2, height: 42, background: canSave ? "#e0b53a" : "rgba(224,181,58,.4)", color: "#0b0f16", border: "none", fontWeight: 900, cursor: canSave && !saving ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  {saving && <Loader2 size={15} className="animate-spin" />} حفظ المنطقة
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
