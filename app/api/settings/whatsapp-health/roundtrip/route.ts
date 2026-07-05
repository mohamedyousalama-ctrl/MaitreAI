// ============================================================================
// MaitreAI — R2 WhatsApp round-trip test (POST) — SERVER ONLY, MANAGER-ONLY.
// The 8 GET probes report PASSIVE truth (what the message history already shows).
// This route actively exercises the OUTBOUND leg: it sends one real WhatsApp text
// from the tenant's own number and reports the exact transport outcome — no
// fabrication, no "looks fine". The INBOUND leg of the round trip is then observed
// asynchronously by the `inbound_webhook` probe when Meta delivers the reply/echo;
// we never block on it here (a synchronous inbound wait is impossible).
//
// Truthful by construction:
//   • test mode / no creds → status "skipped" (nothing transmitted, not a green)
//   • Meta rejects (e.g. outside the 24h window for a cold number) → "failed" with
//     the real error — the window rule itself limits this to numbers that have
//     messaged the business, so it can't be used to cold-message arbitrary people.
//   • delivered → "sent" with the external message id.
// Manager-only: triggering a real send is a privileged action.
// ============================================================================

import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppText } from "@/lib/messaging/outbound";
import { runWithTenantWhatsAppCreds } from "@/lib/messaging/tenant-creds";

export const runtime = "nodejs";

const DEFAULT_TEXT = "اختبار اتصال واتساب من لوحة كيفو ✅";

export async function POST(req: Request) {
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  // Privileged: only a manager may fire a real outbound test.
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden_role" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const to = String(body.to ?? "").trim();
  if (!to) return NextResponse.json({ error: "bad_request", detail: "missing 'to'" }, { status: 400 });
  const text = body.text ? String(body.text).slice(0, 400) : DEFAULT_TEXT;

  const credsAdmin = createAdminClient();
  // Send from the tenant's own number when configured (env fallback otherwise).
  const send = credsAdmin
    ? await runWithTenantWhatsAppCreds(credsAdmin, tenant.restaurantId, () => sendWhatsAppText({ to, text }))
    : await sendWhatsAppText({ to, text });

  // Report the exact transport truth. 200 for a clean send/skip; 502 for a real
  // failure so the console surfaces it as a failure, not a success.
  const ok = send.status === "sent" || send.status === "skipped";
  return NextResponse.json(
    {
      status: send.status,
      windowState: send.windowState,
      externalMessageId: send.externalMessageId ?? null,
      attempts: send.attempts,
      error: send.error ?? null,
    },
    { status: ok ? 200 : 502 },
  );
}
