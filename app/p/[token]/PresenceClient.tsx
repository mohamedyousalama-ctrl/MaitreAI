"use client";

// ============================================================================
// Day 2 presence client. Explicit ONLINE / OFFLINE. While ONLINE and this page
// is open, browser GPS posts freshness. OFFLINE stops posting. Closing the page
// does not claim background GPS and does not auto-flip to OFFLINE.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Radio, WifiOff } from "lucide-react";
import {
  classifyPresence,
  presenceDriverStateAr,
  type PresenceKind,
  type PresenceStatus,
} from "@/lib/delivery/driver-presence";

export function PresenceClient({
  token,
  name,
  vehicle,
  initialStatus,
  initialKind,
  initialLastSeenAt,
  initialRecordedAt,
  initialLat,
  initialLng,
}: {
  token: string;
  name: string;
  vehicle: string | null;
  initialStatus: PresenceStatus;
  initialKind: PresenceKind;
  initialLastSeenAt: string | null;
  initialRecordedAt: string | null;
  initialLat: number | null;
  initialLng: number | null;
}) {
  const [status, setStatus] = useState<PresenceStatus>(initialStatus);
  const [kind, setKind] = useState<PresenceKind>(initialKind);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(initialLastSeenAt);
  const [recordedAt, setRecordedAt] = useState<string | null>(initialRecordedAt);
  const [lat, setLat] = useState<number | null>(initialLat);
  const [lng, setLng] = useState<number | null>(initialLng);
  const [busy, setBusy] = useState<PresenceStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [gpsErr, setGpsErr] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);

  function applyClassified(next: {
    status: PresenceStatus;
    last_seen_at?: string | null;
    recorded_at?: string | null;
    lat?: number | null;
    lng?: number | null;
    classified?: { kind: PresenceKind };
  }) {
    setStatus(next.status);
    if (next.last_seen_at !== undefined) setLastSeenAt(next.last_seen_at);
    if (next.recorded_at !== undefined) setRecordedAt(next.recorded_at);
    if (next.lat !== undefined) setLat(next.lat);
    if (next.lng !== undefined) setLng(next.lng);
    if (next.classified?.kind) setKind(next.classified.kind);
    else {
      const c = classifyPresence({
        status: next.status,
        lastSeenAt: next.last_seen_at ?? lastSeenAt,
        recordedAt: next.recorded_at ?? recordedAt,
        lat: next.lat ?? lat,
        lng: next.lng ?? lng,
      });
      setKind(c.kind);
    }
  }

  async function setPresence(next: PresenceStatus) {
    setBusy(next);
    setErr(null);
    try {
      const res = await fetch(`/api/presence/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setErr("تعذّر حفظ الحالة. تأكد من الاتصال وحاول مرة أخرى.");
        return;
      }
      applyClassified({
        status: next,
        last_seen_at: typeof j.last_seen_at === "string" ? j.last_seen_at : next === "online" ? new Date().toISOString() : lastSeenAt,
        classified: j.classified as { kind: PresenceKind } | undefined,
      });
      if (next === "offline") setGpsErr(null);
    } catch {
      setErr("تعذّر حفظ الحالة. تأكد من الاتصال وحاول مرة أخرى.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (status !== "online") {
      if (watchRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
      return;
    }
    if (!navigator.geolocation) {
      setGpsErr("المتصفح لا يدعم تحديد الموقع.");
      return;
    }
    setGpsErr(null);
    watchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
          const res = await fetch(`/api/presence/${token}/location`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          });
          const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          if (res.ok) {
            applyClassified({
              status: "online",
              lat: typeof j.lat === "number" ? j.lat : pos.coords.latitude,
              lng: typeof j.lng === "number" ? j.lng : pos.coords.longitude,
              recorded_at: typeof j.recorded_at === "string" ? j.recorded_at : new Date().toISOString(),
              last_seen_at: typeof j.last_seen_at === "string" ? j.last_seen_at : new Date().toISOString(),
              classified: j.classified as { kind: PresenceKind } | undefined,
            });
            setGpsErr(null);
          } else if (res.status === 409) {
            setGpsErr("توقفت المشاركة لأنك غير متصل.");
            setStatus("offline");
            setKind("offline");
          } else {
            setGpsErr("تعذّر إرسال الموقع. تحقق من الاتصال — سنواصل المحاولة.");
          }
        } catch {
          setGpsErr("تعذّر إرسال الموقع. تحقق من الاتصال — سنواصل المحاولة.");
        }
      },
      (geoErr) => {
        setGpsErr(geoErr.code === geoErr.PERMISSION_DENIED ? "تم رفض إذن الموقع." : "تعذّر تحديد الموقع.");
      },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 10000 }
    );
    return () => {
      if (watchRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    };
    // token + status are the posting contract; applyClassified is local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, token]);

  const copy = presenceDriverStateAr(kind);
  const online = status === "online";
  const lastSeenLabel = lastSeenAt
    ? new Date(lastSeenAt).toLocaleTimeString("ar-EG")
    : "لا يوجد";
  const testId =
    kind === "offline"
      ? "presence-status-offline"
      : kind === "online_stale"
      ? "presence-status-stale"
      : "presence-status-online";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#e4d8c8] bg-white p-4 shadow-sm">
        <p className="text-lg font-bold text-[#2a211b]">{name}</p>
        {vehicle && <p className="text-sm text-[#6a5c4e]">{vehicle}</p>}
        <p className="mt-1 text-xs text-[#9b8b7c]">صفحة تواجد مستقلة عن أي رحلة توصيل. لا حاجة لتثبيت تطبيق.</p>
      </div>

      <div
        data-testid={testId}
        className="rounded-2xl border p-4"
        style={{
          borderColor: kind === "offline" ? "#d8cbbb" : kind === "online_stale" ? "#e7d3a8" : "#cde3d4",
          background: kind === "offline" ? "#f4ece1" : kind === "online_stale" ? "#fbf6ea" : "#f0f7f2",
        }}
      >
        <p className="text-base font-bold text-[#2a211b]" data-testid="presence-kind-title">{copy.title}</p>
        <p className="mt-1 text-sm text-[#6a5c4e]">{copy.body}</p>
        <p className="mt-2 text-xs text-[#6a5c4e]" data-testid="presence-last-seen">
          آخر ظهور: {lastSeenLabel}
        </p>
        {lat != null && lng != null && (
          <p className="mt-1 flex items-center gap-1 text-xs text-[#1d6f8e]" data-testid="presence-location-fresh">
            <MapPin className="h-3.5 w-3.5" /> الموقع {kind === "online_fresh" ? "مباشر" : "آخر نقطة محفوظة"}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void setPresence("online")}
          data-testid="presence-go-online"
          className={
            "flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition " +
            (online ? "bg-[#3c7a52] text-white" : "border border-[#cde3d4] bg-white text-[#3c7a52]")
          }
        >
          {busy === "online" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
          ONLINE
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void setPresence("offline")}
          data-testid="presence-go-offline"
          className={
            "flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition " +
            (!online ? "bg-[#6a5c4e] text-white" : "border border-[#d8cbbb] bg-white text-[#6a5c4e]")
          }
        >
          {busy === "offline" ? <Loader2 className="h-4 w-4 animate-spin" /> : <WifiOff className="h-4 w-4" />}
          OFFLINE
        </button>
      </div>

      <p className="text-xs leading-5 text-[#9b8b7c]">
        الموقع يُرسل فقط والمتصفح مفتوح على هذه الصفحة وأنت ONLINE. إغلاق الصفحة لا يحوّلك إلى OFFLINE — اضغط OFFLINE بنفسك. إذا بقيت ONLINE وتوقفت التحديثات سيظهر للمطعم أنك متصل بموقع قديم، وهذا مختلف عن OFFLINE.
      </p>
      {err && <p className="rounded-lg bg-[#fbeee9] px-3 py-2 text-center text-xs font-semibold text-[#a8432a]">{err}</p>}
      {gpsErr && <p className="text-xs font-semibold text-[#a8432a]">{gpsErr}</p>}
    </div>
  );
}
