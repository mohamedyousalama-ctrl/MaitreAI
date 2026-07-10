// ============================================================================
// MaitreAI — Production readiness / health probe (T6) — SERVER ONLY, READ.
//
// Generalizes the WhatsApp-scoped health pattern (app/api/settings/whatsapp-
// health) into an app-wide readiness check, so a misconfigured deploy is caught
// BEFORE it takes traffic (launch runbook) and an uptime monitor can probe it.
//
// WHAT IT CHECKS — presence/config booleans ONLY, never a secret value (same
// discipline as whatsapp-health / the status route). Reuses the existing
// per-service "is it configured" predicates so this stays the single source of
// truth, not a re-implementation:
//   • supabase        isSupabaseConfigured()  — public URL + anon key (auth/persist)
//   • supabaseAdmin   isAdminConfigured()     — URL + service-role key (webhook/admin)
//   • anthropic       isClaudeConfigured()    — ANTHROPIC_API_KEY present & not mock
//   • encryptionKey   CREDENTIALS_ENCRYPTION_KEY is a valid 64-hex key
// These four gate `ready`. WhatsApp env + app URL are reported for visibility but
// do NOT gate `ready` (see notes below).
//
// CHEAP BY DESIGN: pure env/config inspection — NO DB query, NO external API
// call. Safe to be hammered by a monitor; it never loads the DB.
//
// AUTH POSTURE: unauthenticated callers (uptime monitors, load-balancer probes)
// get a MINIMAL { ready } body + 200/503. Authenticated sessions get the full
// per-service breakdown (config presence booleans). This lets monitors work
// without leaking which specific service is misconfigured to anonymous callers,
// mirroring the M2.8 session-gating discipline.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isAdminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { isClaudeConfigured } from "@/lib/ai/llm";
import { isWhatsAppConfigured, whatsAppEnvStatus, whatsAppMode } from "@/lib/messaging/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Presence + format check for the credentials encryption key WITHOUT exposing
 *  it or throwing (getKey() in lib/crypto/secrets.ts throws on a bad key). Mirrors
 *  that module's format contract: exactly 64 hex chars (= 32 bytes for AES-256). */
function isEncryptionKeyConfigured(): boolean {
  return /^[0-9a-fA-F]{64}$/.test(process.env.CREDENTIALS_ENCRYPTION_KEY ?? "");
}

/** WO-MONITORING-ALERTING — trivial DB reachability probe: a single tiny read that
 *  proves Supabase is actually answering (not just "env present"). Never throws;
 *  returns false on any error. Only run in DEEP mode (see below) so the default
 *  probe stays a pure env check that's safe to be hammered every few seconds. */
async function isDbReachable(): Promise<boolean> {
  try {
    const admin = createAdminClient();
    if (!admin) return false;
    const { error } = await admin.from("restaurants").select("id", { head: true, count: "exact" }).limit(1);
    return !error;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  // DEEP mode (?deep=1): the external uptime pinger asks for a real DB round-trip so
  // "ready" reflects reachability, not just config. Default (no deep) is unchanged:
  // pure env inspection, byte-identical for load-balancer / Wesaya probes.
  const deep = req.nextUrl.searchParams.get("deep") === "1";
  const dbReachable = deep ? await isDbReachable() : null;

  // Required-to-function services — these gate readiness.
  const required = {
    supabase: isSupabaseConfigured(),
    supabaseAdmin: isAdminConfigured(),
    anthropic: isClaudeConfigured(),
    encryptionKey: isEncryptionKeyConfigured(),
    ...(deep ? { dbReachable: dbReachable === true } : {}),
  };
  const ready = Object.values(required).every(Boolean);
  const httpStatus = ready ? 200 : 503;

  // Unauthenticated: minimal body only (no per-service detail) so config state
  // isn't leaked to anonymous callers, while monitors still get a clean 200/503.
  const tenant = await getServerTenant();
  if (!tenant) {
    return NextResponse.json({ ready }, { status: httpStatus, headers: { "cache-control": "no-store" } });
  }

  // Authenticated: full breakdown — booleans only, never secret values.
  const waEnv = whatsAppEnvStatus();
  return NextResponse.json(
    {
      ready,
      required,
      // Informational — NOT gating `ready`:
      // WhatsApp env may legitimately be empty in prod when tenants supply their
      // own creds via per-tenant DB credentials (runWithWhatsAppCreds).
      channels: {
        whatsappEnv: {
          configured: isWhatsAppConfigured(),
          mode: whatsAppMode(),
          checks: waEnv,
        },
      },
      // app URL has safe fallbacks (lib/db/delivery.ts, lib/payment-store.ts) so
      // it's recommended, not required.
      recommended: {
        appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? "").length > 0,
      },
    },
    { status: httpStatus, headers: { "cache-control": "no-store" } },
  );
}
