// ============================================================================
// Kivo — WO-6: capacity SYNC from Meta (SERVER ONLY, manager).
// POST: read THIS tenant's phone-number quality rating + messaging-limit tier
// from the Graph API (using the tenant's own decrypted creds — the ONE creds
// path, resolveTenantWhatsAppEnvById → phone_number_id + token) and stamp them
// source='meta_sync' + fetched_at.
//
// DOCUMENTED MANUAL FALLBACK (same doctrine as the template registry): no usable
// per-tenant creds, or any Graph failure ⇒ { synced:false, fallback:"manual" }
// with NO mutation. The manager then enters values via POST /api/settings/capacity.
// ============================================================================

import { NextResponse } from "next/server";
import { requireManager } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { WHATSAPP_GRAPH_VERSION } from "@/lib/messaging/config";
import { resolveTenantWhatsAppEnvById } from "@/lib/db/restaurants";
import { normalizeTier, normalizeQuality } from "@/lib/messaging/capacity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const META_TIMEOUT_MS = 15000;

export async function POST() {
  const gate = await requireManager();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  // ── PER-TENANT creds only (phone_number_id + decrypted token). Absent ⇒ manual.
  const creds = await resolveTenantWhatsAppEnvById(admin, tenant.restaurantId);
  if (!creds || !creds.phoneNumberId || !creds.accessToken) {
    return NextResponse.json({
      synced: false,
      fallback: "manual",
      reason: "wa_not_configured",
      hint: "اربط رقم واتساب المطعم أو أدخِل السعة يدويًا عبر POST /api/settings/capacity.",
    });
  }

  let payload: { quality_rating?: unknown; messaging_limit_tier?: unknown };
  try {
    const url = `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${creds.phoneNumberId}?fields=quality_rating,messaging_limit_tier`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
      signal: AbortSignal.timeout(META_TIMEOUT_MS),
    });
    if (!res.ok) {
      return NextResponse.json({ synced: false, fallback: "manual", reason: "meta_api_error", status: res.status });
    }
    payload = (await res.json()) as { quality_rating?: unknown; messaging_limit_tier?: unknown };
  } catch {
    return NextResponse.json({ synced: false, fallback: "manual", reason: "meta_unreachable" });
  }

  const tier = normalizeTier(payload.messaging_limit_tier);
  const quality = normalizeQuality(payload.quality_rating);
  const fetchedAt = new Date().toISOString();

  const { error } = await admin
    .from("restaurants")
    .update({
      wa_messaging_tier: tier,
      wa_phone_quality: quality,
      wa_capacity_source: "meta_sync",
      wa_capacity_fetched_at: fetchedAt,
    })
    .eq("id", tenant.restaurantId);
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 503 });

  return NextResponse.json({ synced: true, tier, quality, source: "meta_sync", fetched_at: fetchedAt });
}
