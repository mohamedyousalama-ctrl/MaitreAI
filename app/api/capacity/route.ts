// ============================================================================
// Kivo — WO-6: WhatsApp capacity chip (SERVER ONLY, any member).
// GET /api/capacity → { tier, quality, source, fetched_at, sent_24h, remaining_est }
//
// remaining_est is an ESTIMATE we own: tier_limit − our count of business-
// initiated template sends in the last 24h (template_sends ledger). It is null
// when the tier has no finite cap (unlimited/unknown). The UI must render it
// labelled `est.` — Meta's counter is authoritative, ours is the honest
// approximation. tier/quality carry their source ('meta_sync'|'manual') +
// fetched_at so the truth chip can show provenance.
// ============================================================================

import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { countTemplateSends24h, computeRemaining } from "@/lib/messaging/capacity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { data, error } = await admin
    .from("restaurants")
    .select("wa_messaging_tier, wa_phone_quality, wa_capacity_source, wa_capacity_fetched_at")
    .eq("id", tenant.restaurantId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "db_error" }, { status: 503 });

  const tier = (data?.wa_messaging_tier as string | null) ?? null;
  const sent24h = await countTemplateSends24h(admin, tenant.restaurantId);
  const { remainingEst } = computeRemaining(tier, sent24h);

  return NextResponse.json({
    tier,
    quality: (data?.wa_phone_quality as string | null) ?? "unknown",
    source: (data?.wa_capacity_source as string | null) ?? null,
    fetched_at: (data?.wa_capacity_fetched_at as string | null) ?? null,
    sent_24h: sent24h,
    // Always an estimate — the UI labels it `est.`. null = no finite cap.
    remaining_est: remainingEst,
  });
}
