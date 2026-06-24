// ============================================================================
// MaitreAI — Customer live tracking page (/t/<token>). Token-scoped, public.
// Inert (404) when the flag is off. Polling + map live in the client island.
// ============================================================================

import { notFound } from "next/navigation";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";
import { TrackClient } from "./TrackClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function TrackPage({ params }: { params: { token: string } }) {
  if (!ENABLE_DELIVERY_TRACKING) notFound();
  return (
    <div className="min-h-screen bg-[#faf6ef] px-4 py-6" dir="rtl">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.svg" alt="Kivo" width={32} height={32} className="h-8 w-8" />
          <h1 className="text-base font-bold text-[#2a211b]">تتبّع طلبك</h1>
        </div>
        <TrackClient token={params.token} />
      </div>
    </div>
  );
}
