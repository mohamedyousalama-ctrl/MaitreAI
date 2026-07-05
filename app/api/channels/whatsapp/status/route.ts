// ============================================================================
// MaitreAI — WhatsApp connection status (Sprint 6)
// Safe, client-consumable view of WhatsApp configuration. Returns ONLY booleans
// describing which credentials are present — never the access token itself.
// Used by the in-console Settings WhatsApp card to show Connected / Test mode /
// Not configured without exposing secrets.
//
// T4/M2.8 — AUTH-GATED. Although the payload is booleans (no secrets), it leaks
// deployment config state. The only caller is the authenticated in-console
// settings card; there is no pre-auth/onboarding consumer. So require an
// authenticated tenant session and stop returning it to anonymous callers.
// ============================================================================

import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/db/require-tenant";
import {
  isWhatsAppConfigured,
  readWhatsAppEnv,
  whatsAppEnvStatus,
  whatsAppMode,
} from "@/lib/messaging/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;

  const env = readWhatsAppEnv();
  return NextResponse.json({
    channel: "whatsapp",
    configured: isWhatsAppConfigured(env),
    mode: whatsAppMode(env),
    checks: whatsAppEnvStatus(env),
  });
}
