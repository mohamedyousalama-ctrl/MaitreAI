// ============================================================================
// MaitreAI — WO-DELIVERY-D2: driver RUN stop-list page (/d/r/<token>). The
// run_token IS the auth for the PAGE; per-stop actions carry each stop's own
// delivery token. Server-loads the run + its ordered stops (a NARROW projection:
// name/area/count/COD/coords ONLY — never item names, notes, or allergen data),
// a client island owns the per-stop status + COD + GPS. Inert (404) when the
// deploy flag is off. Single-delivery /d/<token> is a separate, untouched page.
// ============================================================================

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRunByToken } from "@/lib/db/delivery";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";
import { RunStopList } from "./RunStopList";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DriverRunPage({ params }: { params: { token: string } }) {
  if (!ENABLE_DELIVERY_TRACKING) notFound();
  const admin = createAdminClient();
  if (!admin) notFound();

  let data: Awaited<ReturnType<typeof getRunByToken>> = null;
  try {
    data = await getRunByToken(admin, params.token);
  } catch {
    data = null;
  }
  if (!data) {
    return <Shell><p className="text-sm text-[#9b8b7c]">رابط الرحلة غير صالح.</p></Shell>;
  }

  const allDone = data.stops.length > 0 && data.stops.every((s) => s.status === "delivered" || s.status === "cancelled");
  if (data.run.expired || allDone) {
    return (
      <Shell>
        <div className="rounded-2xl border border-[#cde3d4] bg-[#f0f7f2] p-5 text-center">
          <p className="text-lg font-bold text-[#2a211b]">تم إنهاء الرحلة ✅</p>
          <p className="mt-1 text-sm text-[#6a5c4e]">شكراً لك. هذا الرابط لم يعد فعّالاً.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <RunStopList stops={data.stops} driverName={data.run.driverName} />
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
          <h1 className="text-base font-bold text-[#2a211b]">رحلة التوصيل</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
