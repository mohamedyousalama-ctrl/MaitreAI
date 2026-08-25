// ============================================================================
// Kivo Delivery Network — Day 2 driver presence page (/p/<token>).
// Token IS the auth. Independent of any delivery job. No native app.
// ============================================================================

import { notFound } from "next/navigation";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";
import { classifyPresence } from "@/lib/delivery/driver-presence";
import { getPresenceByToken } from "@/lib/db/driver-presence";
import { PresenceClient } from "./PresenceClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PresencePage({ params }: { params: { token: string } }) {
  if (!ENABLE_DELIVERY_TRACKING) notFound();

  let row = null;
  try {
    row = await getPresenceByToken(params.token);
  } catch {
    return (
      <Shell>
        <p className="text-sm text-[#9b8b7c]">تعذّر تحميل حالة التواجد.</p>
      </Shell>
    );
  }
  if (!row) {
    return (
      <Shell>
        <p className="text-sm text-[#9b8b7c]">رابط التواجد غير صالح.</p>
      </Shell>
    );
  }

  const classified = classifyPresence({
    status: row.status,
    lastSeenAt: row.last_seen_at,
    recordedAt: row.recorded_at,
    lat: row.lat,
    lng: row.lng,
  });

  return (
    <Shell>
      <PresenceClient
        token={params.token}
        name={row.name}
        vehicle={row.vehicle}
        initialStatus={row.status}
        initialKind={classified.kind}
        initialLastSeenAt={row.last_seen_at}
        initialRecordedAt={row.recorded_at}
        initialLat={row.lat}
        initialLng={row.lng}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#faf6ef] px-4 py-6" dir="rtl">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.svg" alt="Kivo" width={32} height={32} className="h-8 w-8" />
          <h1 className="text-base font-bold text-[#2a211b]">تواجد المندوب</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
