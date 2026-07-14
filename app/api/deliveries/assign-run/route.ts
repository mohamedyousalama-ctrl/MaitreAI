// ============================================================================
// MaitreAI — WO-DELIVERY-D2: assign several deliveries to ONE driver as a RUN.
// Operator action (any member, like single-delivery assign). Flag-gated on the
// per-tenant delivery_runs flag AND the deploy ENABLE_DELIVERY_TRACKING switch —
// OFF → 404 (single-delivery assign is the only path). The cap is enforced in the
// engine (assignDeliveriesToRun), not here.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/db/require-tenant";
import { assignDeliveriesToRun } from "@/lib/db/delivery";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!ENABLE_DELIVERY_TRACKING) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { data: rRow } = await admin.from("restaurants").select("feature_flags").eq("id", tenant.restaurantId).single();
  const flags = (rRow?.feature_flags as Record<string, unknown> | null) ?? null;
  if (!isFeatureExplicitlyEnabled("delivery_runs", flags)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const driverId = String(body.driverId ?? "");
  const deliveryIds = Array.isArray(body.deliveryIds) ? body.deliveryIds.map(String).filter(Boolean) : [];
  if (!driverId || deliveryIds.length === 0) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    const result = await assignDeliveriesToRun(admin, { restaurantId: tenant.restaurantId, driverId, deliveryIds });
    return NextResponse.json(result);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    const code =
      detail === "run_cap_exceeded" ? 422
      : detail === "driver_not_found" || detail === "delivery_not_found" ? 404
      : 502;
    return NextResponse.json({ error: detail }, { status: code });
  }
}
