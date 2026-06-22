// ============================================================================
// MaitreAI — Driver page (/d/<token>) — token IS the auth, scoped to one
// delivery, no login, no app. Server-loads the delivery; a client island owns
// the status buttons + GPS sharing. Inert (404) when the flag is off.
// ============================================================================

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDeliveryByDriverToken, isExpired } from "@/lib/db/delivery";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";
import { DriverClient } from "./DriverClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DriverPage({ params }: { params: { token: string } }) {
  if (!ENABLE_DELIVERY_TRACKING) notFound();
  const admin = createAdminClient();
  if (!admin) notFound();

  const data = await getDeliveryByTokenSafe(admin, params.token);
  if (!data) {
    return <Shell><p className="text-sm text-[#9b8b7c]">رابط التوصيل غير صالح.</p></Shell>;
  }
  const d = data.delivery as Record<string, unknown>;
  const o = (data.order ?? {}) as Record<string, unknown>;
  const done = isExpired(d as { expires_at?: string | null; status?: string });

  if (done) {
    return (
      <Shell>
        <div className="rounded-2xl border border-[#cde3d4] bg-[#f0f7f2] p-5 text-center">
          <p className="text-lg font-bold text-[#2a211b]">تم إنهاء هذا التوصيل ✅</p>
          <p className="mt-1 text-sm text-[#6a5c4e]">شكراً لك. هذا الرابط لم يعد فعّالاً.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <DriverClient
        token={params.token}
        status={String(d.status)}
        order={{
          orderNumber: (o.order_number as string) ?? null,
          items: Array.isArray(o.items) ? (o.items as { quantity: number; name: string }[]).map((i) => ({ quantity: i.quantity, name: i.name })) : [],
          total: (o.total as number) ?? null,
          currency: (o.currency as string) ?? "",
          address: (o.address as string) ?? (o.zoneName as string) ?? null,
          customerPhone: (o.customerPhone as string) ?? null,
        }}
      />
    </Shell>
  );
}

async function getDeliveryByTokenSafe(admin: ReturnType<typeof createAdminClient>, token: string) {
  try {
    return admin ? await getDeliveryByDriverToken(admin, token) : null;
  } catch {
    return null;
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#faf6ef] px-4 py-6" dir="rtl">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.svg" alt="MaitreAI" width={32} height={32} className="h-8 w-8" />
          <h1 className="text-base font-bold text-[#2a211b]">صفحة المندوب</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
