// ============================================================================
// console_v2 — WO-DELIVERY-D3: التوصيل runs board (spec §4). SERVER guard: the board
// exists only for a tenant with the delivery module ON (delivery_runs OR
// delivery_geo_routing). Neither flag → notFound() (the route is inert; the console
// is byte-identical for every other tenant, matching the flag-gated rail item). The
// board itself is a client island; its sections gate INDEPENDENTLY per flag.
// ============================================================================

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerTenant } from "@/lib/db/tenant-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
import { DeliveriesBoard } from "./DeliveriesBoard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DeliveriesBoardPage() {
  // Demo (unconfigured Supabase) stays explorable, like the other manager pages.
  let runsEnabled = true;
  let geoEnabled = true;
  if (isSupabaseConfigured()) {
    const tenant = await getServerTenant();
    const admin = createAdminClient();
    const { data: r } =
      tenant && admin
        ? await admin.from("restaurants").select("feature_flags").eq("id", tenant.restaurantId).maybeSingle()
        : { data: null };
    const flags = (r as { feature_flags?: Record<string, unknown> } | null)?.feature_flags ?? null;
    runsEnabled = isFeatureExplicitlyEnabled("delivery_runs", flags);
    geoEnabled = isFeatureExplicitlyEnabled("delivery_geo_routing", flags);
    if (!runsEnabled && !geoEnabled) notFound();
  }
  return <DeliveriesBoard runsEnabled={runsEnabled} geoEnabled={geoEnabled} />;
}
