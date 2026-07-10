// ============================================================================
// MaitreAI — WO-DELIVERY-D2: KIVO run-grouping SUGGESTIONS (spec §3).
// Groups the tenant's UNASSIGNED deliveries by same-zone/adjacent, oldest-first,
// capped at RUN_CAP. Read-only — it SUGGESTS; the operator taps to accept (which
// hits /api/deliveries/assign-run). NEVER auto-assigns. Flag-gated on delivery_runs.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
import { suggestRunGrouping, type SuggestDelivery, type SuggestZone } from "@/lib/delivery/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!ENABLE_DELIVERY_TRACKING) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;

  const { data: rRow } = await supabase.from("restaurants").select("feature_flags").eq("id", tenant.restaurantId).single();
  const flags = (rRow?.feature_flags as Record<string, unknown> | null) ?? null;
  if (!isFeatureExplicitlyEnabled("delivery_runs", flags)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Unassigned = pending + not already in a run. Join the order's zone for grouping.
  const { data: dels, error } = await supabase
    .from("deliveries")
    .select("id, created_at, status, run_id, orders(zone_id)")
    .eq("restaurant_id", tenant.restaurantId)
    .eq("status", "pending")
    .is("run_id", null)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "fetch_failed", detail: error.message }, { status: 502 });

  const deliveries: SuggestDelivery[] = (dels ?? []).map((d) => ({
    id: d.id as string,
    zoneId: ((d.orders as { zone_id?: string | null } | null)?.zone_id as string | null) ?? null,
    createdAt: d.created_at as string,
  }));

  const { data: zoneRows } = await supabase
    .from("delivery_zones")
    .select("id, center_lat, center_lng")
    .eq("restaurant_id", tenant.restaurantId);
  const zones: SuggestZone[] = (zoneRows ?? []).map((z) => ({
    id: z.id as string,
    centerLat: z.center_lat == null ? undefined : Number(z.center_lat),
    centerLng: z.center_lng == null ? undefined : Number(z.center_lng),
  }));

  const groups = suggestRunGrouping(deliveries, zones);
  return NextResponse.json({ groups });
}
