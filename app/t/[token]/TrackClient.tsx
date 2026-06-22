"use client";

// ============================================================================
// MaitreAI — Customer tracking client. Polls /api/track/<token> every few
// seconds for status + the driver's live point. Truth-driven: a dot only shows
// when a fresh location was actually shared; otherwise just the status timeline.
// Stops polling once delivered.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { LiveMap } from "@/components/delivery/LiveMap";
import { Loader2, CheckCircle2 } from "lucide-react";

interface TrackData {
  status: string;
  timeline: { assigned_at: string | null; picked_up_at: string | null; delivered_at: string | null };
  driverName: string | null;
  location: { lat: number; lng: number; recorded_at: string } | null;
  order: { order_number: string | null; total: number | null; currency: string | null; address: string | null; items: { quantity: number; name: string }[] };
}

const STAGES: { key: string; label: string }[] = [
  { key: "assigned", label: "تم تعيين مندوب" },
  { key: "picked_up", label: "استلم المندوب الطلب" },
  { key: "on_the_way", label: "في الطريق إليك" },
  { key: "delivered", label: "تم التوصيل" },
];
const RANK: Record<string, number> = { pending: 0, assigned: 1, picked_up: 2, on_the_way: 3, delivered: 4, failed: -1, cancelled: -1 };
const POLL_MS = 5000;

export function TrackClient({ token }: { token: string }) {
  const [data, setData] = useState<TrackData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch(`/api/track/${token}`, { cache: "no-store" });
        if (res.status === 404) {
          if (alive) setErr("رابط التتبّع غير صالح.");
          return;
        }
        const j = (await res.json()) as TrackData;
        if (!alive) return;
        setData(j);
        setErr(null);
        if (j.status !== "delivered" && j.status !== "cancelled") {
          timer.current = setTimeout(poll, POLL_MS);
        }
      } catch {
        if (alive) timer.current = setTimeout(poll, POLL_MS);
      }
    }
    poll();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [token]);

  if (err) return <div className="rounded-2xl border border-[#e4d8c8] bg-white p-5 text-sm text-[#9b8b7c]">{err}</div>;
  if (!data) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-[#b5502e]" /></div>;

  const rank = RANK[data.status] ?? 0;
  const delivered = data.status === "delivered";

  return (
    <div className="space-y-4">
      {delivered && (
        <div className="rounded-2xl border border-[#cde3d4] bg-[#f0f7f2] p-4 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-[#3c7a52]" />
          <p className="mt-1 text-lg font-bold text-[#2a211b]">تم التوصيل ✅</p>
        </div>
      )}

      {/* Order summary */}
      <div className="rounded-2xl border border-[#e4d8c8] bg-white p-4 shadow-sm">
        {data.order.order_number && <p className="text-xs font-semibold text-[#b5502e]">طلب رقم {data.order.order_number}</p>}
        <ul className="mt-2 space-y-1 text-sm text-[#2a211b]">
          {data.order.items.map((i, n) => <li key={n}>{i.quantity}× {i.name}</li>)}
        </ul>
        {data.order.total != null && (
          <p className="mt-2 text-sm font-bold text-[#2a211b]">الإجمالي: {data.order.total} {data.order.currency}</p>
        )}
        {data.driverName && <p className="mt-1 text-xs text-[#9b8b7c]">المندوب: {data.driverName}</p>}
      </div>

      {/* Map — only a real dot when location is fresh (truth-driven) */}
      <LiveMap markers={data.location ? [{ lat: data.location.lat, lng: data.location.lng, label: data.driverName ?? "المندوب" }] : []} />

      {/* Status timeline */}
      <div className="rounded-2xl border border-[#e4d8c8] bg-white p-4">
        <ol className="space-y-3">
          {STAGES.map((s) => {
            const reached = rank >= RANK[s.key];
            return (
              <li key={s.key} className="flex items-center gap-3">
                <span className={"flex h-6 w-6 items-center justify-center rounded-full text-xs " + (reached ? "bg-[#3c7a52] text-white" : "bg-[#efe5d8] text-[#bcae9e]")}>
                  {reached ? "✓" : ""}
                </span>
                <span className={"text-sm " + (reached ? "font-semibold text-[#2a211b]" : "text-[#9b8b7c]")}>{s.label}</span>
              </li>
            );
          })}
        </ol>
        {data.status === "failed" && <p className="mt-3 text-sm text-[#a8432a]">حدثت مشكلة في التوصيل — يتواصل معك المطعم.</p>}
      </div>
    </div>
  );
}
