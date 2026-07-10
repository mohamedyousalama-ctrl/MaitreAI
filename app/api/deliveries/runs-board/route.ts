// ============================================================================
// MaitreAI — WO-DELIVERY-D3: operator RUNS BOARD data (spec §4). Read-only.
// Sections gate INDEPENDENTLY per tenant flag: active runs + unassigned queue →
// delivery_runs; zone misses → delivery_geo_routing. A tenant with only one flag on
// gets only that section (no empty shells, no cross-flag leakage). Both off → 404
// (the board route is inert; the console is byte-identical). All reads reuse the D2
// service layer — no business logic here.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
import { listActiveRunsForOperator, listUnassignedQueue, zoneMissesSummary } from "@/lib/db/delivery";

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
  const runsOn = isFeatureExplicitlyEnabled("delivery_runs", flags);
  const geoOn = isFeatureExplicitlyEnabled("delivery_geo_routing", flags);

  // Neither section enabled → the board has nothing to show; keep it inert.
  if (!runsOn && !geoOn) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [runs, unassigned, misses] = await Promise.all([
    runsOn ? listActiveRunsForOperator(supabase, tenant.restaurantId) : Promise.resolve(null),
    runsOn ? listUnassignedQueue(supabase, tenant.restaurantId) : Promise.resolve(null),
    geoOn ? zoneMissesSummary(supabase, tenant.restaurantId) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    runsEnabled: runsOn,
    geoEnabled: geoOn,
    runs, // null when delivery_runs off
    unassigned, // null when delivery_runs off
    misses, // null when delivery_geo_routing off
  });
}
