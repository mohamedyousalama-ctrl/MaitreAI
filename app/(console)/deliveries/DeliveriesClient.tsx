"use client";

// ============================================================================
// MaitreAI — Operator deliveries client (Kivo-styled). Live list of deliveries,
// driver assignment / reassignment, and a simple driver roster (add / activate /
// deactivate). LIVE0 L4: reads from the shared dispatch store (realtime) — the old
// 6s poll is removed. Operator-only (the page is flag-gated + session-guarded). No
// map. Styling uses Kivo tokens (var(--kv-*)); assign/CRUD logic is unchanged.
// ============================================================================

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRole } from "@/lib/use-role";
import { useDispatchStore } from "@/lib/dispatch-store";
import { runActionOutcome } from "@/lib/console-toast";
import { Truck, Plus, Loader2, Link2, Check, Layers, Sparkles, MapPin, Navigation, Satellite, Copy, MessageCircle, RefreshCw } from "lucide-react";
import { Num } from "@/components/kivo";
import {
  VISIBLE_POLL_MS,
  classifyRefreshHealth,
  isInProgressStatus,
  tickLocation,
} from "@/lib/delivery/operator-refresh";
import { whatsappDispatchLabel, whatsappShareHref } from "@/lib/delivery/share-link";
import {
  CLIPBOARD_BLOCKED_AR,
  OPERATOR_NETWORK_ERROR_AR,
  OPERATOR_REFRESH_ERROR_AR,
  OPERATOR_REFRESH_STALE_AR,
  PILOT_MARKER,
  PILOT_MARKER_AR,
} from "@/lib/delivery/pilot-surface";
import { formatDriverChoice, rosterSelectHint, rosterSummary } from "@/lib/delivery/driver-roster";

// Reuses the storefront's Leaflet pin picker (client-only) so the operator drops a
// REAL destination pin instead of typing coordinates. ssr:false — react-leaflet
// cannot render on the server.
const LocationPicker = dynamic(() => import("@/components/storefront/LocationPicker"), { ssr: false });

interface Driver { id: string; name: string; phone: string; vehicle: string | null; active: boolean }
interface DeliveryLocation { lat: number; lng: number; recorded_at: string; ageMs: number; fresh: boolean }
interface Delivery {
  id: string;
  status: string;
  driver_id: string | null;
  drivers: { name: string; phone: string } | null;
  orders: { order_number: string | null; total: number | null; currency: string | null; address: string | null; lat: number | null; lng: number | null; notes: string | null } | null;
  latestLocation?: DeliveryLocation | null;
}

/** Human "last seen" for a driver's shared point. Freshness is computed server-side
 *  (locationFreshness); this only renders it. The age is composed in JSX with <Num>
 *  (never interpolated into the Arabic string) so digits don't reorder under RTL. */
function freshnessLabel(loc: DeliveryLocation | null | undefined): { node: React.ReactNode; color: string } {
  if (!loc) return { node: <>لا توجد مشاركة موقع</>, color: "var(--kv-muted)" };
  if (loc.fresh) return { node: <>الموقع مباشر الآن</>, color: "#1d6f8e" };
  const mins = Math.floor(loc.ageMs / 60000);
  if (mins < 1) return { node: <>آخر موقع قبل <Num>{Math.floor(loc.ageMs / 1000)}</Num> ثانية</>, color: "#9a6a14" };
  if (mins < 60) return { node: <>آخر موقع قبل <Num>{mins}</Num> دقيقة</>, color: "#9a6a14" };
  return { node: <>آخر موقع قبل <Num>{Math.floor(mins / 60)}</Num> ساعة</>, color: "var(--kv-red)" };
}

const STATUS_AR: Record<string, string> = {
  pending: "بانتظار التعيين",
  assigned: "تم التعيين",
  picked_up: "استلمها المندوب",
  on_the_way: "في الطريق",
  delivered: "تم التوصيل",
  failed: "مشكلة",
  cancelled: "ملغي",
};
// Semantic status chips, aligned to the Kivo palette.
const CHIP: Record<string, { bg: string; color: string }> = {
  pending: { bg: "rgba(216,151,43,.14)", color: "#9a6a14" },
  assigned: { bg: "rgba(43,143,181,.14)", color: "#1d6f8e" },
  picked_up: { bg: "rgba(43,143,181,.14)", color: "#1d6f8e" },
  on_the_way: { bg: "rgba(124,92,208,.14)", color: "#6243b0" },
  delivered: { bg: "var(--kv-primary-tint)", color: "var(--kv-deep)" },
  failed: { bg: "rgba(192,73,47,.12)", color: "var(--kv-red)" },
  cancelled: { bg: "rgba(100,116,139,.14)", color: "var(--kv-muted)" },
};

// Kivo card + field frames.
const cardStyle: React.CSSProperties = { borderRadius: 16, border: "1px solid var(--kv-border)", background: "var(--kv-card)", boxShadow: "var(--kv-shadow-panel)" };
const fieldStyle: React.CSSProperties = { borderRadius: 8, border: "1px solid var(--kv-border)", background: "var(--kv-card)", color: "var(--kv-text)" };

export function DeliveriesClient() {
  // Driver mutations (add/edit/activate-deactivate) are manager-only server-side
  // (/api/drivers, /api/drivers/[id] → 403). Hide those controls from non-managers
  // so they don't see actions that would fail; the server gate stays authoritative.
  const isManager = useRole() === "manager";
  // LIVE0 L4 — deliveries + drivers come from the SHARED dispatch store (DB-backed
  // + realtime, wired in DataBootstrap). The old 6s poll is GONE: an assignment /
  // status / roster change by any operator now reflects here live. The store's
  // loaders (which re-pull the same /api/deliveries self-heal + /api/drivers) are
  // reused by the actions below for the acting operator's immediate refresh.
  const deliveries = useDispatchStore((s) => s.deliveries) as Delivery[];
  const drivers = useDispatchStore((s) => s.drivers) as Driver[];
  const loaded = useDispatchStore((s) => s.loaded);
  const loading = !loaded;
  const loadDeliveries = useDispatchStore((s) => s.loadDeliveries);
  const loadDrivers = useDispatchStore((s) => s.loadDrivers);
  const lastOkAt = useDispatchStore((s) => s.lastOkAt);
  const lastError = useDispatchStore((s) => s.lastError);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [links, setLinks] = useState<Record<string, { driverLink: string; customerLink: string; whatsapp: string }>>({});
  const [form, setForm] = useState({ name: "", phone: "", vehicle: "" });
  const [adding, setAdding] = useState(false);

  // Day 1 — operator-typed delivery job (no upstream order).
  const EMPTY_JOB = { customerPhone: "", customerName: "", address: "", codAmount: "", reference: "" };
  const [job, setJob] = useState(EMPTY_JOB);
  const [jobPin, setJobPin] = useState<{ lat: number; lng: number } | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [creatingJob, setCreatingJob] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", vehicle: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // WO-DELIVERY-D2 — run assembly (flag-gated on delivery_runs). OFF → the whole
  // panel is hidden and this surface is byte-identical to today's single assign.
  const [runsEnabled, setRunsEnabled] = useState(false);
  const [runSel, setRunSel] = useState<string[]>([]);
  const [runDriver, setRunDriver] = useState("");
  const [runBusy, setRunBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<{ zoneKey: string | null; deliveryIds: string[] }[] | null>(null);
  // P2 — the run's /d/r link, surfaced so the operator can share it manually when the
  // WhatsApp dispatch was skipped/failed (mirrors the single-delivery link block).
  const [runResult, setRunResult] = useState<{ runLink: string; whatsapp: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/settings/flags")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j) setRunsEnabled((j.flags as Record<string, unknown> | null)?.delivery_runs === true); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // LIVE TRACKING REFRESH. Realtime covers deliveries/drivers, not GPS pings.
  // Hidden-tab timer throttle (~1/min in Chromium) is why the field loop saw up
  // to a minute of lag: pull immediately on visibility/focus, and poll every 4s
  // while a job is in progress in a visible tab. Failures surface as stale/error.
  const hasActive = deliveries.some((d) => isInProgressStatus(d.status));
  const refreshHealth = classifyRefreshHealth({
    now,
    lastOkAt,
    lastError,
    hasInProgress: hasActive,
  });
  useEffect(() => {
    if (!hasActive && !lastError) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasActive, lastError]);
  useEffect(() => {
    const pull = () => { void loadDeliveries(); };
    const onVisible = () => { if (document.visibilityState === "visible") pull(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", pull);
    if (!hasActive) {
      return () => {
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("focus", pull);
      };
    }
    const t = setInterval(pull, VISIBLE_POLL_MS);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", pull);
    };
  }, [hasActive, loadDeliveries]);

  async function copyPrivateLink(key: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      setCopyHint(null);
      window.setTimeout(() => setCopied((cur) => (cur === key ? null : cur)), 2000);
    } catch {
      setCopyHint(CLIPBOARD_BLOCKED_AR);
    }
  }

  const toggleRunPick = (id: string) =>
    setRunSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 3 ? prev : [...prev, id]));

  async function loadSuggestions() {
    setRunBusy(true);
    try {
      const r = await fetch("/api/deliveries/suggest-runs", { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { groups?: { zoneKey: string | null; deliveryIds: string[] }[] };
      setSuggestions(r.ok ? j.groups ?? [] : []);
    } finally {
      setRunBusy(false);
    }
  }

  async function createRun() {
    if (!runDriver || runSel.length < 2) return;
    setRunBusy(true);
    await runActionOutcome("جارٍ إنشاء الرحلة…", async () => {
      let r: Response;
      try {
        r = await fetch("/api/deliveries/assign-run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driverId: runDriver, deliveryIds: runSel }),
        });
      } catch {
        return { state: "failed" as const, message: OPERATOR_NETWORK_ERROR_AR, retry: true };
      }
      const j = (await r.json().catch(() => ({}))) as { error?: string; whatsapp?: string; runLink?: string };
      if (!r.ok) {
        const msg = j.error === "run_cap_exceeded" ? "الحد الأقصى ٣ طلبات في الرحلة." : `تعذّر إنشاء الرحلة: ${j.error ?? `HTTP ${r.status}`}`;
        return { state: "failed" as const, message: msg, retry: true };
      }
      // Always surface the run link so the operator can share it manually — essential
      // when WhatsApp was skipped/failed (mirrors the single-delivery flow).
      setRunResult({ runLink: j.runLink ?? "", whatsapp: String(j.whatsapp ?? "") });
      setRunSel([]); setRunDriver(""); setSuggestions(null);
      await loadDeliveries();
      return { state: j.whatsapp === "sent" ? "success" as const : "info" as const, message: j.whatsapp === "sent" ? "تم إنشاء الرحلة وإرسال اللينك للسائق" : "تم إنشاء الرحلة — شارك لينك الرحلة مع السائق يدويًا (ظاهر بالأسفل)." };
    });
    setRunBusy(false);
  }

  // R8 — surface the COMPOSITE assignment result: assigned vs failed, and (if
  // assigned) the WhatsApp dispatch sub-status. A failed assign never shows as
  // assigned. assigned-but-link-failed/skipped is a neutral warning so the operator
  // knows to share the link manually. Dispatch logic itself is unchanged.
  async function assign(deliveryId: string) {
    const driverId = pick[deliveryId];
    if (!driverId) return;
    setAssigning(deliveryId);
    await runActionOutcome("جارٍ الإسناد…", async () => {
      let r: Response;
      try {
        r = await fetch(`/api/deliveries/${deliveryId}/assign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driverId }),
        });
      } catch {
        return { state: "failed" as const, message: OPERATOR_NETWORK_ERROR_AR, retry: true };
      }
      const j = (await r.json().catch(() => ({}))) as { driverLink?: string; customerLink?: string; whatsapp?: string; error?: string };
      if (!r.ok) {
        return { state: "failed" as const, message: `تعذّر الإسناد: ${j.error ?? `HTTP ${r.status}`}`, retry: true };
      }
      // Assigned → store the links (so the operator can share manually) + refresh.
      setLinks((x) => ({ ...x, [deliveryId]: { driverLink: j.driverLink ?? "", customerLink: j.customerLink ?? "", whatsapp: j.whatsapp ?? "" } }));
      await loadDeliveries();
      const wa = String(j.whatsapp ?? "");
      if (wa === "sent") return { state: "success" as const, message: "تم الإسناد وإرسال لينك واتساب للسائق" };
      if (wa === "failed") return { state: "info" as const, message: "الإسناد تم — لكن تعذّر إرسال لينك واتساب. شاركه مع السائق يدويًا." };
      return { state: "info" as const, message: "الإسناد تم — لينك واتساب متخطّى. شاركه مع السائق يدويًا." };
    });
    setAssigning(null);
  }

  // Day 1 — create a delivery job by hand. On success the job lands in the list
  // below as `pending`, where the existing driver-assign control takes over.
  const JOB_ERR_AR: Record<string, string> = {
    phone_required: "رقم هاتف العميل مطلوب.",
    phone_invalid: "رقم الهاتف غير صالح — تأكد من الرقم.",
    destination_required: "أدخل العنوان أو حدّد الموقع على الخريطة.",
    bad_coords: "الموقع المحدد غير صالح.",
    bad_amount: "قيمة التحصيل غير صالحة.",
  };
  async function createJob() {
    if (!job.customerPhone.trim() || creatingJob) return;
    setCreatingJob(true);
    await runActionOutcome("جارٍ إنشاء طلب التوصيل…", async () => {
      let r: Response;
      try {
        r = await fetch("/api/deliveries/manual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...job, lat: jobPin?.lat ?? null, lng: jobPin?.lng ?? null }),
        });
      } catch {
        return { state: "failed" as const, message: OPERATOR_NETWORK_ERROR_AR, retry: true };
      }
      const j = (await r.json().catch(() => ({}))) as { error?: string; orderNumber?: string };
      if (!r.ok) {
        // Every input rejection has an actionable Arabic message; anything else is
        // ours, not the operator's, so it gets a plain message and a console trace
        // (no code interpolated into Arabic copy — it would reorder under RTL).
        if (!JOB_ERR_AR[String(j.error)]) console.error("[deliveries] manual job failed", r.status, j.error);
        const msg = JOB_ERR_AR[String(j.error)] ?? "تعذّر إنشاء الطلب — حاول مرة أخرى.";
        return { state: "failed" as const, message: msg, retry: true };
      }
      setJob(EMPTY_JOB); // reset ONLY on real success
      setJobPin(null);
      await loadDeliveries();
      // The order number is NOT interpolated here (toasts are plain strings and a
      // number inside Arabic copy reorders under RTL) — the new job shows it in the
      // list below, where it renders in its own field.
      return { state: "success" as const, message: "تم إنشاء طلب التوصيل — عيّن مندوباً الآن." };
    });
    setCreatingJob(false);
  }

  async function addDriver() {
    if (!form.name.trim() || !form.phone.trim()) return;
    setAdding(true);
    await runActionOutcome("جارٍ إضافة المندوب…", async () => {
      let r: Response;
      try {
        r = await fetch("/api/drivers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      } catch {
        return { state: "failed" as const, message: OPERATOR_NETWORK_ERROR_AR, retry: true };
      }
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
        return { state: "failed" as const, message: `تعذّر إضافة المندوب: ${j.message ?? j.error ?? `HTTP ${r.status}`}`, retry: true };
      }
      setForm({ name: "", phone: "", vehicle: "" }); // reset ONLY on real success
      await loadDrivers();
      return { state: "success" as const, message: "تم إضافة المندوب" };
    });
    setAdding(false);
  }

  async function toggleDriver(d: Driver) {
    // No optimistic flip — loadDrivers reflects the TRUE state only on success.
    await runActionOutcome(d.active ? "جارٍ إيقاف المندوب…" : "جارٍ تفعيل المندوب…", async () => {
      let r: Response;
      try {
        r = await fetch(`/api/drivers/${d.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !d.active }) });
      } catch {
        return { state: "failed" as const, message: OPERATOR_NETWORK_ERROR_AR, retry: true };
      }
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
        return { state: "failed" as const, message: `تعذّر تحديث حالة المندوب: ${j.message ?? j.error ?? `HTTP ${r.status}`}`, retry: true };
      }
      await loadDrivers();
      return { state: "success" as const, message: d.active ? "تم إيقاف المندوب" : "تم تفعيل المندوب" };
    });
  }

  function startEdit(d: Driver) {
    setEditId(d.id);
    setEditForm({ name: d.name, phone: d.phone, vehicle: d.vehicle ?? "" });
  }
  async function saveEdit(id: string) {
    if (!editForm.name.trim() || !editForm.phone.trim() || savingEdit) return;
    setSavingEdit(true);
    await runActionOutcome("جارٍ حفظ التعديل…", async () => {
      let r: Response;
      try {
        r = await fetch(`/api/drivers/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: editForm.name, phone: editForm.phone, vehicle: editForm.vehicle }),
        });
      } catch {
        return { state: "failed" as const, message: OPERATOR_NETWORK_ERROR_AR, retry: true };
      }
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
        return { state: "failed" as const, message: `تعذّر حفظ التعديل: ${j.message ?? j.error ?? `HTTP ${r.status}`}`, retry: true };
      }
      setEditId(null); // close the inline editor ONLY on real success
      await loadDrivers();
      return { state: "success" as const, message: "تم حفظ التعديل" };
    });
    setSavingEdit(false);
  }

  const activeDrivers = drivers.filter((d) => d.active);
  const roster = rosterSummary(drivers);

  return (
    <div dir="rtl" style={{ maxWidth: 1320, margin: "0 auto", color: "var(--kv-text)" }}>
      {/* header (inline Kivo — replaces the terracotta PageHeader) */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 11px", borderRadius: 99, background: "var(--kv-primary-tint)", color: "var(--kv-deep)", fontSize: 11, fontWeight: 800 }}>
          <Truck size={13} /> التوصيل
        </span>
        <span
          data-testid="pilot-marker"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 11px", borderRadius: 99, background: "rgba(216,151,43,.16)", color: "#9a6a14", fontSize: 11, fontWeight: 800 }}
        >
          {PILOT_MARKER}
        </span>
        <div style={{ width: "100%" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: "8px 0 0" }}>التوصيل</h1>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--kv-muted)", marginTop: 4 }}>{PILOT_MARKER_AR} — إدخال يدوي وتعيين مندوب من القائمة</p>
        </div>
      </div>

      {(refreshHealth === "stale" || refreshHealth === "error") && (
        <div
          className="mb-4 flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold"
          style={{
            background: refreshHealth === "error" ? "rgba(192,73,47,.10)" : "rgba(216,151,43,.14)",
            color: refreshHealth === "error" ? "var(--kv-red)" : "#9a6a14",
            border: "1px solid var(--kv-border)",
          }}
        >
          <span>{refreshHealth === "error" ? OPERATOR_REFRESH_ERROR_AR : OPERATOR_REFRESH_STALE_AR}</span>
          <button
            type="button"
            onClick={() => { void loadDeliveries(); }}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1"
            style={{ ...fieldStyle, color: "var(--kv-deep)" }}
          >
            <RefreshCw size={12} /> تحديث الآن
          </button>
        </div>
      )}

      {/* Day 1 — operator creates a delivery job by hand (no upstream order). */}
      <div className="mb-5 p-4" style={cardStyle}>
        <p className="mb-3 flex items-center gap-1.5 text-sm font-bold" style={{ color: "var(--kv-text)" }}>
          <Plus size={15} style={{ color: "var(--kv-primary)" }} /> طلب توصيل جديد — إدخال يدوي
        </p>
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
          <input
            value={job.customerPhone}
            onChange={(e) => setJob({ ...job, customerPhone: e.target.value })}
            placeholder="رقم هاتف العميل *"
            inputMode="tel"
            className="px-3 py-2 text-sm"
            style={fieldStyle}
          />
          <input
            value={job.customerName}
            onChange={(e) => setJob({ ...job, customerName: e.target.value })}
            placeholder="اسم العميل (اختياري)"
            className="px-3 py-2 text-sm"
            style={fieldStyle}
          />
          <input
            value={job.address}
            onChange={(e) => setJob({ ...job, address: e.target.value })}
            placeholder="العنوان"
            className="px-3 py-2 text-sm"
            style={fieldStyle}
          />
          <input
            value={job.codAmount}
            onChange={(e) => setJob({ ...job, codAmount: e.target.value })}
            placeholder="التحصيل عند الاستلام (اتركه فارغاً إن لم يوجد)"
            inputMode="decimal"
            className="px-3 py-2 text-sm"
            style={fieldStyle}
          />
          <input
            value={job.reference}
            onChange={(e) => setJob({ ...job, reference: e.target.value })}
            placeholder="مرجع / ملاحظة للمندوب (اختياري)"
            className="px-3 py-2 text-sm"
            style={fieldStyle}
          />
          <button
            type="button"
            onClick={() => setPinOpen(true)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold"
            style={{ ...fieldStyle, color: jobPin ? "var(--kv-deep)" : "var(--kv-muted)", borderColor: jobPin ? "var(--kv-primary)" : "var(--kv-border)" }}
          >
            <MapPin size={15} style={{ color: "var(--kv-primary)" }} />
            {jobPin ? (
              <>تم تحديد الموقع <Num>{`${jobPin.lat.toFixed(4)}, ${jobPin.lng.toFixed(4)}`}</Num></>
            ) : (
              "حدّد الموقع على الخريطة"
            )}
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <button
            onClick={createJob}
            disabled={creatingJob || !job.customerPhone.trim() || (!job.address.trim() && !jobPin)}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-50"
            style={{ background: "var(--kv-grad-brand)" }}
          >
            {creatingJob ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />} إنشاء الطلب
          </button>
          <span className="text-[11px]" style={{ color: "var(--kv-muted)" }}>
            مطلوب: رقم الهاتف + (العنوان أو الموقع على الخريطة).
          </span>
          {jobPin && (
            <button type="button" onClick={() => setJobPin(null)} className="text-[11px] font-semibold underline" style={{ color: "var(--kv-muted)" }}>
              إزالة الموقع
            </button>
          )}
        </div>
      </div>

      {pinOpen && (
        <LocationPicker
          initial={jobPin}
          onClose={() => setPinOpen(false)}
          onConfirm={(r) => {
            setJobPin({ lat: r.lat, lng: r.lng });
            // Only fill the address when the operator hasn't typed one themselves.
            setJob((j) => (j.address.trim() ? j : { ...j, address: r.address }));
            setPinOpen(false);
          }}
        />
      )}

      {runsEnabled && (() => {
        const pending = deliveries.filter((d) => d.status === "pending");
        return (
          <div className="mb-5 p-4" style={{ ...cardStyle }}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="flex items-center gap-1.5 text-sm font-bold" style={{ color: "var(--kv-text)" }}>
                <Layers size={15} style={{ color: "var(--kv-primary)" }} /> رحلة متعددة الطلبات (حتى ٣)
              </span>
              <button
                onClick={loadSuggestions}
                disabled={runBusy}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={{ ...fieldStyle }}
              >
                {runBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--kv-primary)" }} />} اقترح تجميع
              </button>
            </div>

            {suggestions && (
              <div className="mt-3 space-y-2">
                {suggestions.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--kv-muted)" }}>لا توجد اقتراحات تجميع الآن.</p>
                ) : (
                  suggestions.map((g, n) => (
                    <div key={n} className="flex items-center justify-between rounded-lg px-3 py-2 text-xs" style={{ background: "var(--kv-card-soft)", color: "var(--kv-muted)" }}>
                      <span>مجموعة من {g.deliveryIds.length} طلبات{g.zoneKey ? " — نفس المنطقة" : ""}</span>
                      <button onClick={() => setRunSel(g.deliveryIds.slice(0, 3))} className="rounded-md px-2 py-1 font-semibold" style={{ ...fieldStyle, color: "var(--kv-deep)" }}>
                        استخدم هذا الاقتراح
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {pending.length === 0 ? (
              <p className="mt-3 text-xs" style={{ color: "var(--kv-muted)" }}>لا توجد طلبات بانتظار التعيين للتجميع.</p>
            ) : (
              <div className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}>
                {pending.map((d) => {
                  const on = runSel.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      onClick={() => toggleRunPick(d.id)}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-start"
                      style={{ ...fieldStyle, borderColor: on ? "var(--kv-primary)" : "var(--kv-border)", background: on ? "var(--kv-primary-tint)" : "var(--kv-card)" }}
                    >
                      {on ? <Check className="h-3.5 w-3.5" style={{ color: "var(--kv-primary)" }} /> : <span className="inline-block h-3.5 w-3.5 rounded border" style={{ borderColor: "var(--kv-border)" }} />}
                      <span className="truncate">طلب {d.orders?.order_number ?? "—"}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <select value={runDriver} onChange={(e) => setRunDriver(e.target.value)} className="flex-1 px-2 py-1.5 text-sm" style={fieldStyle}>
                <option value="">اختر مندوباً للرحلة…</option>
                {activeDrivers.map((dr, i) => (
                  <option key={dr.id} value={dr.id}>{formatDriverChoice(dr, i + 1)}</option>
                ))}
              </select>
              <button
                disabled={runBusy || !runDriver || runSel.length < 2}
                onClick={createRun}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-95 disabled:opacity-50"
                style={{ background: "var(--kv-grad-brand)" }}
              >
                {runBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />} أنشئ الرحلة ({runSel.length})
              </button>
            </div>

            {runResult && (
              <div className="mt-3 space-y-2 rounded-lg p-2 text-[11px]" style={{ background: "var(--kv-card-soft)", color: "var(--kv-muted)" }}>
                <p className="flex items-center gap-1 font-semibold" style={{ color: "var(--kv-text)" }}>
                  <Link2 className="h-3 w-3" /> رابط الرحلة جاهز — لا يُعرض الرمز على الشاشة
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => void copyPrivateLink("run", runResult.runLink)}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold"
                    style={fieldStyle}
                  >
                    <Copy className="h-3 w-3" /> {copied === "run" ? "تم النسخ" : "نسخ رابط الرحلة"}
                  </button>
                  <a
                    href={whatsappShareHref(runResult.runLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold"
                    style={fieldStyle}
                  >
                    <MessageCircle className="h-3 w-3" /> مشاركة واتساب
                  </a>
                </div>
                <p>واتساب: {whatsappDispatchLabel(runResult.whatsapp)}</p>
              </div>
            )}
          </div>
        );
      })()}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Deliveries list */}
        <div className="space-y-4 lg:col-span-2">
          <div className="divide-y p-0" style={{ ...cardStyle, borderColor: "var(--kv-border)" }}>
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--kv-primary)" }} /></div>
            ) : deliveries.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--kv-muted)" }}>لا توجد طلبات توصيل بعد.</p>
            ) : (
              deliveries.map((d) => {
                const canAssign = d.status === "pending" || d.status === "assigned";
                const chip = CHIP[d.status] ?? { bg: "rgba(100,116,139,.14)", color: "var(--kv-muted)" };
                return (
                  <div key={d.id} className="p-4" style={{ borderColor: "var(--kv-border)" }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold" style={{ color: "var(--kv-text)" }}>طلب {d.orders?.order_number ?? "—"}</p>
                        {d.orders?.address && <p className="text-xs" style={{ color: "var(--kv-muted)" }}>{d.orders.address}</p>}
                      </div>
                      <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: chip.bg, color: chip.color }}>
                        {STATUS_AR[d.status] ?? d.status}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs" style={{ color: "var(--kv-muted)" }}>
                      <span>{d.orders?.total != null ? `${d.orders.total} ${d.orders.currency}` : ""}</span>
                      {d.drivers?.name && <span>المندوب: {d.drivers.name}</span>}
                    </div>
                    {d.orders?.notes && (
                      <p className="mt-1 text-xs" style={{ color: "var(--kv-muted)" }}>ملاحظة: {d.orders.notes}</p>
                    )}

                    {/* Driver location + how fresh it is. A stale point is SHOWN
                        (with its age), never hidden — "no sharing" and "shared 6
                        minutes ago" are different operational facts. */}
                    {isInProgressStatus(d.status) && (() => {
                      const loc = tickLocation(d.latestLocation, now);
                      const f = freshnessLabel(loc);
                      return (
                        <div className="mt-2 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px]" style={{ background: "var(--kv-card-soft)" }}>
                          <Satellite size={13} style={{ color: f.color }} />
                          <span style={{ color: f.color, fontWeight: 600 }}>{f.node}</span>
                          {loc && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 font-semibold underline"
                              style={{ color: "var(--kv-deep)" }}
                            >
                              <Navigation size={12} /> عرض على الخريطة
                            </a>
                          )}
                        </div>
                      );
                    })()}

                    {canAssign && (
                      <div className="mt-3 space-y-1.5">
                        <p className="text-[11px]" style={{ color: "var(--kv-muted)" }}>{rosterSelectHint(activeDrivers.length)}</p>
                        <div className="flex items-center gap-2">
                          <select
                            value={pick[d.id] ?? ""}
                            onChange={(e) => setPick((x) => ({ ...x, [d.id]: e.target.value }))}
                            className="flex-1 px-2 py-1.5 text-sm"
                            style={fieldStyle}
                          >
                            <option value="">اختر مندوباً يدوياً…</option>
                            {activeDrivers.map((dr, i) => (
                              <option key={dr.id} value={dr.id}>{formatDriverChoice(dr, i + 1)}</option>
                            ))}
                          </select>
                          <button
                            disabled={!pick[d.id] || assigning === d.id}
                            onClick={() => assign(d.id)}
                            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-95 disabled:opacity-50"
                            style={{ background: "var(--kv-grad-brand)" }}
                          >
                            {assigning === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            {d.status === "assigned" ? "إعادة تعيين" : "تعيين"}
                          </button>
                        </div>
                      </div>
                    )}

                    {links[d.id] && (
                      <div className="mt-2 space-y-2 rounded-lg p-2 text-[11px]" style={{ background: "var(--kv-card-soft)", color: "var(--kv-muted)" }}>
                        <p className="flex items-center gap-1 font-semibold" style={{ color: "var(--kv-text)" }}>
                          <Link2 className="h-3 w-3" /> رابط المندوب جاهز — لا يُعرض الرمز على الشاشة
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => void copyPrivateLink(`driver-${d.id}`, links[d.id].driverLink)}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold"
                            style={fieldStyle}
                          >
                            <Copy className="h-3 w-3" /> {copied === `driver-${d.id}` ? "تم النسخ" : "نسخ رابط المندوب"}
                          </button>
                          <a
                            href={whatsappShareHref(links[d.id].driverLink)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold"
                            style={fieldStyle}
                          >
                            <MessageCircle className="h-3 w-3" /> مشاركة واتساب
                          </a>
                          <button
                            type="button"
                            onClick={() => void copyPrivateLink(`cust-${d.id}`, links[d.id].customerLink)}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold"
                            style={fieldStyle}
                          >
                            <Copy className="h-3 w-3" /> {copied === `cust-${d.id}` ? "تم النسخ" : "نسخ رابط العميل"}
                          </button>
                        </div>
                        <p>{whatsappDispatchLabel(links[d.id].whatsapp)}</p>
                        {copyHint && <p style={{ color: "var(--kv-red)" }}>{copyHint}</p>}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Driver roster */}
        <div className="space-y-3">
          {/* add-driver form — manager-only (server: POST /api/drivers is manager-gated) */}
          {isManager && (
            <div className="p-4" style={cardStyle}>
              <p className="mb-3 text-sm font-bold" style={{ color: "var(--kv-text)" }}>إضافة مندوب</p>
              <div className="space-y-2">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="الاسم" className="w-full px-3 py-2 text-sm" style={fieldStyle} />
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="رقم واتساب" className="w-full px-3 py-2 text-sm" style={fieldStyle} />
                <input value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} placeholder="المركبة (اختياري)" className="w-full px-3 py-2 text-sm" style={fieldStyle} />
                <button onClick={addDriver} disabled={adding} className="flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-50" style={{ background: "var(--kv-grad-brand)" }}>
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} إضافة
                </button>
              </div>
            </div>
          )}

          <div className="p-0" style={cardStyle}>
            <p className="p-4 text-sm font-bold" style={{ color: "var(--kv-text)", borderBottom: "1px solid var(--kv-border)" }}>
              المندوبون — {roster.activeCount} نشط / {roster.inactiveCount} غير نشط
            </p>
            {drivers.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--kv-muted)" }}>لا يوجد مندوبون بعد.</p>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--kv-border)" }}>
                {drivers.map((d) => (
                  <li key={d.id} className="p-3" style={{ borderColor: "var(--kv-border)" }}>
                    {editId === d.id && isManager ? (
                      // inline edit (manager) — name/phone required; reuses add-form styling
                      <div className="space-y-2">
                        <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="الاسم" className="w-full px-3 py-2 text-sm" style={fieldStyle} />
                        <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="رقم واتساب" className="w-full px-3 py-2 text-sm" style={fieldStyle} />
                        <input value={editForm.vehicle} onChange={(e) => setEditForm({ ...editForm, vehicle: e.target.value })} placeholder="المركبة (اختياري)" className="w-full px-3 py-2 text-sm" style={fieldStyle} />
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(d.id)} disabled={!editForm.name.trim() || !editForm.phone.trim() || savingEdit} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-50" style={{ background: "var(--kv-grad-brand)" }}>
                            {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} حفظ
                          </button>
                          <button onClick={() => setEditId(null)} className="rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--kv-border)", color: "var(--kv-muted)" }}>إلغاء</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold" style={d.active ? { color: "var(--kv-text)" } : { color: "var(--kv-faint)", textDecoration: "line-through" }}>{d.name}</p>
                          <p className="text-xs" style={{ color: "var(--kv-muted)" }}>{d.phone}{d.vehicle ? ` · ${d.vehicle}` : ""} · {d.active ? "نشط" : "غير نشط"}</p>
                        </div>
                        {/* mutating controls — manager-only (server: PATCH /api/drivers/[id] is manager-gated) */}
                        {isManager && (
                          <div className="flex flex-none items-center gap-1.5">
                            <button onClick={() => startEdit(d)} className="rounded-lg border px-2.5 py-1 text-xs font-semibold transition" style={{ borderColor: "var(--kv-border)", color: "var(--kv-muted)" }}>
                              تعديل
                            </button>
                            <button onClick={() => toggleDriver(d)} className="rounded-lg border px-2.5 py-1 text-xs font-semibold transition" style={{ borderColor: "var(--kv-border)", color: "var(--kv-muted)" }}>
                              {d.active ? "إيقاف" : "تفعيل"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
