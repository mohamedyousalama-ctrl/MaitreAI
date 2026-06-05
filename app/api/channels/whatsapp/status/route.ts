// ============================================================================
// MaitreAI — WhatsApp connection status (Sprint 6)
// Safe, client-consumable view of WhatsApp configuration. Returns ONLY booleans
// describing which credentials are present — never the access token itself.
// Used by the Settings WhatsApp card to show Connected / Test mode / Not
// configured without exposing secrets.
// ============================================================================

import { NextResponse } from "next/server";
import {
  isWhatsAppConfigured,
  readWhatsAppEnv,
  whatsAppEnvStatus,
  whatsAppMode,
} from "@/lib/messaging/config";

export const dynamic = "force-dynamic";

export function GET() {
  const env = readWhatsAppEnv();
  return NextResponse.json({
    channel: "whatsapp",
    configured: isWhatsAppConfigured(env),
    mode: whatsAppMode(env),
    checks: whatsAppEnvStatus(env),
  });
}
