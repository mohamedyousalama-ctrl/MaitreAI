// ============================================================================
// Kivo — WO-6: manual capacity entry (SERVER ONLY, manager). The documented
// fallback (same doctrine as the template registry): when Graph sync isn't
// available, a manager enters the messaging tier + phone quality by hand. Every
// value is stamped source='manual' + fetched_at=now so the truth chip shows it
// came from a human, not Meta.
// ============================================================================

import { NextResponse } from "next/server";
import { requireManager } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTier, normalizeQuality, TIER_LIMITS } from "@/lib/messaging/capacity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const gate = await requireManager();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const tier = normalizeTier(body.tier);
  if (!tier || !(tier in TIER_LIMITS)) {
    return NextResponse.json({ error: "bad_tier", allowed: Object.keys(TIER_LIMITS) }, { status: 400 });
  }
  const quality = normalizeQuality(body.quality);

  const { error } = await admin
    .from("restaurants")
    .update({
      wa_messaging_tier: tier,
      wa_phone_quality: quality,
      wa_capacity_source: "manual",
      wa_capacity_fetched_at: new Date().toISOString(),
    })
    .eq("id", tenant.restaurantId);
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 503 });

  return NextResponse.json({ ok: true, tier, quality, source: "manual" });
}
