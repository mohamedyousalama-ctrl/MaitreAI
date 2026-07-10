"use client";

// ============================================================================
// MaitreAI — WO-DELIVERY-D2: driver RUN stop-list island. Renders the ordered
// stops and owns per-stop status advance + COD «حصّلت» + one run-wide GPS toggle
// that posts to the CURRENT leg's token (so /t shows the dot on the active leg
// only). Each stop carries its OWN delivery token for its actions.
//
// SAFETY LAW: a stop shows customer name + area + a COUNT of items + COD + coords.
// It NEVER shows item names, notes, modifiers, or any allergen/health data — the
// server projection (getRunByToken) doesn't send them, and this view can't invent
// them (there is no items array on the client type).
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { MapPin, Navigation, Phone, CheckCircle2, Truck, PackageCheck, AlertTriangle, Loader2, Banknote, Package } from "lucide-react";

export interface Stop {
  deliveryId: string;
  driverToken: string | null;
  stopOrder: number | null;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  area: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  itemsCount: number;
  codAmount: number;
  currency: string;
  codCollected: boolean;
}

const STEPS: { key: string; label: string; icon: typeof Truck }[] = [
  { key: "picked_up", label: "استلمت", icon: PackageCheck },
  { key: "on_the_way", label: "في الطريق", icon: Truck },
  { key: "delivered", label: "تم التوصيل", icon: CheckCircle2 },
];
const ORDER = ["assigned", "picked_up", "on_the_way", "delivered"];

// Native-maps handoff: a geo: URI opens the phone's default maps app straight to
// the pin; fall back to a Google Maps address search when there are no coords.
function navHref(s: Stop): string | null {
  if (typeof s.lat === "number" && typeof s.lng === "number" && Math.abs(s.lat) <= 90 && Math.abs(s.lng) <= 180) {
    return `geo:${s.lat},${s.lng}?q=${s.lat},${s.lng}`;
  }
  return s.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}` : null;
}

export function RunStopList({ stops: initial, driverName }: { stops: Stop[]; driverName: string | null }) {
  const [stops, setStops] = useState<Stop[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [gpsOn, setGpsOn] = useState(false);
  const [gpsErr, setGpsErr] = useState<string | null>(null);
  const [lastPing, setLastPing] = useState<number | null>(null);
  const watchRef = useRef<number | null>(null);

  // The CURRENT leg = the stop the driver is actively on: the on_the_way one, else
  // the first not-yet-delivered stop. GPS posts to this stop's token so /t shows the
  // dot on the active leg only.
  const current =
    stops.find((s) => s.status === "on_the_way") ??
    stops.find((s) => s.status !== "delivered" && s.status !== "cancelled" && s.status !== "failed") ??
    null;
  const currentToken = current?.driverToken ?? null;

  async function advance(stop: Stop, next: string) {
    if (!stop.driverToken) return;
    setBusy(`${stop.deliveryId}:${next}`);
    try {
      const res = await fetch(`/api/delivery/${stop.driverToken}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) setStops((prev) => prev.map((s) => (s.deliveryId === stop.deliveryId ? { ...s, status: next } : s)));
    } finally {
      setBusy(null);
    }
  }

  async function toggleCod(stop: Stop) {
    if (!stop.driverToken) return;
    const nextVal = !stop.codCollected;
    setBusy(`${stop.deliveryId}:cod`);
    try {
      const res = await fetch(`/api/delivery/${stop.driverToken}/cod-collected`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collected: nextVal }),
      });
      if (res.ok) setStops((prev) => prev.map((s) => (s.deliveryId === stop.deliveryId ? { ...s, codCollected: nextVal } : s)));
    } finally {
      setBusy(null);
    }
  }

  // Run-wide GPS — posts to the CURRENT leg's token only, while the page is open.
  useEffect(() => {
    if (!gpsOn) {
      if (watchRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
      return;
    }
    if (!navigator.geolocation) {
      setGpsErr("المتصفح لا يدعم تحديد الموقع.");
      setGpsOn(false);
      return;
    }
    setGpsErr(null);
    watchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        if (!currentToken) return;
        try {
          await fetch(`/api/delivery/${currentToken}/location`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          });
          setLastPing(Date.now());
        } catch {
          /* transient — keep trying */
        }
      },
      (err) => {
        setGpsErr(err.code === err.PERMISSION_DENIED ? "تم رفض إذن الموقع." : "تعذّر تحديد الموقع.");
        setGpsOn(false);
      },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 10000 }
    );
    return () => {
      if (watchRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    };
  }, [gpsOn, currentToken]);

  const remaining = stops.filter((s) => s.status !== "delivered" && s.status !== "cancelled").length;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#e4d8c8] bg-white p-3 text-sm text-[#2a211b]">
        <span className="font-bold">{stops.length} محطات</span>
        {driverName ? <span className="text-[#6a5c4e]"> — {driverName}</span> : null}
        <span className="text-[#6a5c4e]"> · متبقّي {remaining}</span>
      </div>

      {stops.map((stop) => {
        const idx = ORDER.indexOf(stop.status);
        const isCurrent = current?.deliveryId === stop.deliveryId;
        const nav = navHref(stop);
        const waHref = stop.customerPhone ? `https://wa.me/${stop.customerPhone.replace(/[^\d]/g, "")}` : null;
        const delivered = stop.status === "delivered";
        const failed = stop.status === "failed";
        return (
          <div
            key={stop.deliveryId}
            className={
              "rounded-2xl border bg-white p-4 shadow-sm " +
              (isCurrent ? "border-[#b5502e] ring-1 ring-[#b5502e]/30" : "border-[#e4d8c8]") +
              (delivered ? " opacity-70" : "")
            }
          >
            {/* header: stop number + customer + area */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#fbf1ea] text-xs font-bold text-[#b5502e]">
                  {stop.stopOrder ?? "•"}
                </span>
                <div>
                  <p className="text-sm font-bold text-[#2a211b]">{stop.customerName || "عميل"}</p>
                  {stop.area && <p className="text-xs text-[#9b8b7c]">{stop.area}</p>}
                </div>
              </div>
              {delivered && <span className="text-xs font-bold text-[#3c7a52]">تم ✓</span>}
              {failed && <span className="text-xs font-bold text-[#a8432a]">مشكلة</span>}
            </div>

            {/* items COUNT only — never item details (safety law) */}
            <div className="mt-3 flex items-center gap-2 text-sm text-[#6a5c4e]">
              <Package className="h-4 w-4 text-[#b5502e]" />
              <span>الأصناف: {stop.itemsCount}</span>
            </div>

            {/* COD «حصّل X» + mark-collected */}
            {stop.codAmount > 0 && (
              <button
                onClick={() => toggleCod(stop)}
                disabled={busy !== null}
                className={
                  "mt-2 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-bold transition " +
                  (stop.codCollected ? "bg-[#f0f7f2] text-[#3c7a52]" : "bg-[#fbf1ea] text-[#2a211b]")
                }
              >
                <span className="flex items-center gap-1.5">
                  <Banknote className="h-4 w-4" /> حصّل {stop.codAmount} {stop.currency}
                </span>
                <span className="text-xs">
                  {busy === `${stop.deliveryId}:cod` ? "…" : stop.codCollected ? "تم التحصيل ✓" : "اضغط عند التحصيل"}
                </span>
              </button>
            )}

            {/* navigate + call */}
            <div className="mt-2 flex gap-2">
              {nav && (
                <a href={nav} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#e4d8c8] px-3 py-2 text-xs font-semibold text-[#2a211b] hover:bg-[#faf6ef]">
                  <Navigation className="h-4 w-4 text-[#b5502e]" /> الاتجاهات
                </a>
              )}
              {waHref && (
                <a href={waHref} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#e4d8c8] px-3 py-2 text-xs font-semibold text-[#2a211b] hover:bg-[#faf6ef]">
                  <Phone className="h-4 w-4 text-[#3c7a52]" /> اتصال
                </a>
              )}
            </div>

            {/* per-stop status advance (only the immediate next step is enabled) */}
            {!delivered && !failed && (
              <div className="mt-3 space-y-2">
                {STEPS.map((s) => {
                  const stepIdx = ORDER.indexOf(s.key);
                  const done = idx >= stepIdx;
                  const isNext = stepIdx === idx + 1;
                  const Icon = s.icon;
                  if (done) return null;
                  return (
                    <button
                      key={s.key}
                      disabled={!isNext || busy !== null}
                      onClick={() => advance(stop, s.key)}
                      className={
                        "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition " +
                        (isNext ? "bg-[#b5502e] text-white hover:opacity-95" : "cursor-not-allowed bg-[#f4ece1] text-[#bcae9e]")
                      }
                    >
                      {busy === `${stop.deliveryId}:${s.key}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                      {s.label}
                    </button>
                  );
                })}
                <button
                  disabled={busy !== null}
                  onClick={() => advance(stop, "failed")}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#e7c9bf] bg-white px-4 py-2 text-xs font-semibold text-[#a8432a] hover:bg-[#fbeee9]"
                >
                  <AlertTriangle className="h-4 w-4" /> مشكلة
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* run-wide GPS toggle */}
      <div className="rounded-2xl border border-[#e4d8c8] bg-white p-4">
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-[#2a211b]">شارك موقعك أثناء الرحلة</span>
          <button
            type="button"
            onClick={() => setGpsOn((v) => !v)}
            className={"relative h-6 w-11 rounded-full transition " + (gpsOn ? "bg-[#3c7a52]" : "bg-[#d8cbbb]")}
            aria-pressed={gpsOn}
          >
            <span className={"absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition " + (gpsOn ? "left-0.5" : "right-0.5")} />
          </button>
        </label>
        <p className="mt-2 text-xs text-[#9b8b7c]">
          يُشارَك موقعك مع عميل المحطة الحالية فقط أثناء فتح هذه الصفحة. عند الانتقال للمحطة التالية يتحوّل الموقع معها.
        </p>
        {gpsOn && (
          <p className="mt-1 text-xs text-[#3c7a52]">
            المشاركة مُفعّلة{lastPing ? ` — آخر تحديث ${new Date(lastPing).toLocaleTimeString("ar-EG")}` : "…"}
          </p>
        )}
        {gpsErr && <p className="mt-1 text-xs text-[#a8432a]">{gpsErr}</p>}
      </div>
    </div>
  );
}
