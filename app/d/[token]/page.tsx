// ============================================================================
// MaitreAI — Driver page (/d/<token>) — token IS the auth, scoped to one
// delivery, no login, no app. Server-loads the delivery; a client island owns
// the status buttons + GPS sharing. Inert (404) when the flag is off.
// ============================================================================

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDeliveryByDriverToken } from "@/lib/db/delivery";
import { driverTerminalState, driverTerminalPanel, type TerminalTone } from "@/lib/delivery/driver-terminal-state";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";
import { DriverClient } from "./DriverClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Frame colours per register — green belongs to `success` and nothing else.
// NOT exported: a Next.js page module may only export its reserved fields.
const TERMINAL_TONE: Record<TerminalTone, { border: string; bg: string }> = {
  success: { border: "#cde3d4", bg: "#f0f7f2" },
  problem: { border: "#e7c9bf", bg: "#fbeee9" },
  neutral: { border: "#e4d8c8", bg: "#f4ece1" },
};

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
  // D1: a no-longer-actionable link must say WHICH outcome it reached. `failed`
  // in particular must never inherit the delivered panel's green/checkmark
  // treatment. `!== "active"` is exactly the old isExpired() gate — proven in
  // scripts/test-delivery-problem-path.test.ts — so nothing about WHEN the link
  // closes has changed, only what it reports.
  const terminal = driverTerminalState(d as { expires_at?: string | null; status?: string });
  const panel = driverTerminalPanel(terminal);

  if (panel) {
    const tone = TERMINAL_TONE[panel.tone];
    return (
      <Shell>
        <div className="rounded-2xl border p-5 text-center" style={{ borderColor: tone.border, background: tone.bg }}>
          <p className="text-lg font-bold text-[#2a211b]">{panel.title}</p>
          <p className="mt-1 text-sm text-[#6a5c4e]">{panel.body}</p>
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
          lat: typeof o.lat === "number" ? o.lat : null,
          lng: typeof o.lng === "number" ? o.lng : null,
          customerPhone: (o.customerPhone as string) ?? null,
          // Operator's reference/note for this job (Day 1 manual dispatch).
          note: (o.notes as string) ?? null,
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
          <img src="/logo-mark.svg" alt="Kivo" width={32} height={32} className="h-8 w-8" />
          <h1 className="text-base font-bold text-[#2a211b]">صفحة المندوب</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
