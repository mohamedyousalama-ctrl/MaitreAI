"use client";

// ============================================================================
// MaitreAI — Driver page client island. Status progression + honest GPS sharing
// (posts location ONLY while this page is open and the toggle is on). Talks to
// the same token endpoints a future native driver app would use.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { MapPin, Navigation, Phone, MessageCircle, StickyNote, CheckCircle2, Truck, PackageCheck, AlertTriangle, Loader2 } from "lucide-react";
import { driverTerminalState, driverTerminalPanel, type TerminalTone } from "@/lib/delivery/driver-terminal-state";

/** Frame + icon colours per register. Green/✓ belong to `success` alone. */
const TONE: Record<TerminalTone, { border: string; bg: string; icon: string }> = {
  success: { border: "#cde3d4", bg: "#f0f7f2", icon: "#3c7a52" },
  problem: { border: "#e7c9bf", bg: "#fbeee9", icon: "#a8432a" },
  neutral: { border: "#e4d8c8", bg: "#f4ece1", icon: "#9b8b7c" },
};

interface OrderInfo {
  orderNumber: string | null;
  items: { quantity: number; name: string }[];
  total: number | null;
  currency: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  customerPhone: string | null;
  /** Operator's free-text reference/note for this job (optional). */
  note?: string | null;
}

const STEPS: { key: string; label: string; icon: typeof Truck }[] = [
  { key: "picked_up", label: "استلمت الطلب", icon: PackageCheck },
  { key: "on_the_way", label: "في الطريق", icon: Truck },
  { key: "delivered", label: "تم التوصيل", icon: CheckCircle2 },
];
const ORDER = ["assigned", "picked_up", "on_the_way", "delivered"];

export function DriverClient({ token, status: initial, order }: { token: string; status: string; order: OrderInfo }) {
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [gpsOn, setGpsOn] = useState(false);
  const [gpsErr, setGpsErr] = useState<string | null>(null);
  const [lastPing, setLastPing] = useState<number | null>(null);
  const [postErr, setPostErr] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);

  async function post(next: string) {
    setBusy(next);
    setPostErr(null);
    try {
      const res = await fetch(`/api/delivery/${token}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      // D1: the driver must never be left guessing. On success the state change
      // swaps in a terminal panel below; on failure say so out loud instead of
      // silently re-enabling the button, which reads as "nothing happened".
      if (res.ok) setStatus(next);
      else setPostErr("تعذّر حفظ التحديث. تأكد من الاتصال وحاول مرة أخرى.");
    } catch {
      setPostErr("تعذّر حفظ التحديث. تأكد من الاتصال وحاول مرة أخرى.");
    } finally {
      setBusy(null);
    }
  }

  // GPS sharing — only while the page is open AND the toggle is on.
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
        try {
          const res = await fetch(`/api/delivery/${token}/location`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          });
          if (res.ok) {
            setLastPing(Date.now());
            setGpsErr(null);
          } else {
            setGpsErr("تعذّر إرسال الموقع. تحقق من الاتصال — سنواصل المحاولة.");
          }
        } catch {
          setGpsErr("تعذّر إرسال الموقع. تحقق من الاتصال — سنواصل المحاولة.");
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
  }, [gpsOn, token]);

  const idx = ORDER.indexOf(status);
  // DLV6b — exact pin from real picked coordinates when present; otherwise fall
  // back to the address text-search (WhatsApp + typed-address web orders). Hide
  // only when there's neither coords nor address.
  const hasCoords =
    typeof order.lat === "number" && typeof order.lng === "number" &&
    Math.abs(order.lat) <= 90 && Math.abs(order.lng) <= 180;
  const mapsHref = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${order.lat},${order.lng}`
    : order.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}`
    : null;
  // Two DISTINCT contact actions. These used to be one button labelled «اتصال»
  // that actually opened WhatsApp — a driver who needed to phone the customer at
  // the door had no way to. tel: dials, wa.me messages.
  const phoneDigits = order.customerPhone ? order.customerPhone.replace(/[^\d]/g, "") : "";
  const callHref = phoneDigits ? `tel:+${phoneDigits}` : null;
  const waHref = phoneDigits ? `https://wa.me/${phoneDigits}` : null;

  // D1 — IMMEDIATE, VISIBLE confirmation. Pressing «مشكلة في التوصيل» sets the
  // status to `failed`, which lands here and swaps the whole surface for a
  // problem-recorded panel; the driver no longer has to infer what happened from
  // a button greying out. Only `delivered` gets the checkmark and green frame —
  // the tone/success flags come from the shared pure module, so `failed` cannot
  // accidentally inherit success semantics.
  const terminal = driverTerminalState({ status });
  const panel = driverTerminalPanel(terminal);
  if (panel) {
    const tone = TONE[panel.tone];
    const Icon = panel.success ? CheckCircle2 : AlertTriangle;
    return (
      <div className="rounded-2xl border p-5 text-center" style={{ borderColor: tone.border, background: tone.bg }}>
        <Icon className="mx-auto h-10 w-10" style={{ color: tone.icon }} />
        <p className="mt-2 text-lg font-bold text-[#2a211b]">{panel.title}</p>
        <p className="mt-1 text-sm text-[#6a5c4e]">{panel.body}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Order card */}
      <div className="rounded-2xl border border-[#e4d8c8] bg-white p-4 shadow-sm">
        {order.orderNumber && <p className="text-xs font-semibold text-[#b5502e]">طلب رقم {order.orderNumber}</p>}
        <ul className="mt-2 space-y-1 text-sm text-[#2a211b]">
          {order.items.map((i, n) => (
            <li key={n}>{i.quantity}× {i.name}</li>
          ))}
        </ul>
        {order.total != null && (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-[#fbf1ea] px-3 py-2 text-sm font-bold text-[#2a211b]">
            <span>التحصيل عند الاستلام</span>
            <span>{order.total} {order.currency}</span>
          </div>
        )}
        <div className="mt-3 space-y-2">
          {order.address && (
            <div className="flex items-start gap-2 text-sm text-[#6a5c4e]">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#b5502e]" />
              <span className="flex-1">{order.address}</span>
            </div>
          )}
          {order.note && (
            <div className="flex items-start gap-2 rounded-lg bg-[#fbf7f0] px-3 py-2 text-sm text-[#6a5c4e]">
              <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-[#b5502e]" />
              <span className="flex-1">{order.note}</span>
            </div>
          )}
          {mapsHref && (
            <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#e4d8c8] px-3 py-2 text-xs font-semibold text-[#2a211b] hover:bg-[#faf6ef]">
              <Navigation className="h-4 w-4 text-[#b5502e]" /> فتح الخريطة والتوجيه
            </a>
          )}
          {(callHref || waHref) && (
            <div className="flex gap-2">
              {callHref && (
                <a href={callHref} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#e4d8c8] px-3 py-2 text-xs font-semibold text-[#2a211b] hover:bg-[#faf6ef]">
                  <Phone className="h-4 w-4 text-[#3c7a52]" /> اتصال بالعميل
                </a>
              )}
              {waHref && (
                <a href={waHref} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#e4d8c8] px-3 py-2 text-xs font-semibold text-[#2a211b] hover:bg-[#faf6ef]">
                  <MessageCircle className="h-4 w-4 text-[#3c7a52]" /> واتساب العميل
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Status buttons */}
      <div className="space-y-2">
        {STEPS.map((s) => {
          const stepIdx = ORDER.indexOf(s.key);
          const done = idx >= stepIdx;
          const isNext = stepIdx === idx + 1;
          const Icon = s.icon;
          return (
            <button
              key={s.key}
              disabled={!isNext || busy !== null}
              onClick={() => post(s.key)}
              className={
                "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition " +
                (done
                  ? "bg-[#f0f7f2] text-[#3c7a52]"
                  : isNext
                  ? "bg-[#b5502e] text-white hover:opacity-95"
                  : "cursor-not-allowed bg-[#f4ece1] text-[#bcae9e]")
              }
            >
              {busy === s.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
              {done ? `${s.label} ✓` : s.label}
            </button>
          );
        })}
        <button
          disabled={busy !== null || status === "failed"}
          onClick={() => post("failed")}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#e7c9bf] bg-white px-4 py-2.5 text-xs font-semibold text-[#a8432a] hover:bg-[#fbeee9]"
        >
          <AlertTriangle className="h-4 w-4" /> مشكلة في التوصيل
        </button>
        {postErr && (
          <p className="rounded-lg bg-[#fbeee9] px-3 py-2 text-center text-xs font-semibold text-[#a8432a]">{postErr}</p>
        )}
      </div>

      {/* GPS sharing toggle */}
      <div className="rounded-2xl border border-[#e4d8c8] bg-white p-4">
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-[#2a211b]">شارك موقعك أثناء التوصيل</span>
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
          يُشارَك موقعك مع المطعم أثناء فتح هذه الصفحة وتفعيل الزر. عند إغلاق الصفحة أو إيقاف الزر تتوقّف المشاركة.
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
