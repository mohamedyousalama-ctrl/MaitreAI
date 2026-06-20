// ============================================================================
// MaitreAI — Karim Pro P2: operator-read customer memory (server only)
// Returns the read-only memory record for a customer, for the OPERATOR's eyes.
// Gated on the narrow `customer_memory` feature flag (NOT tier='pro', NOT the
// conversation_intelligence flag) — a tenant without P2 enabled gets
// { enabled:false } and the operator card simply does not render. Tenant-scoped
// by getServerTenant + an explicit restaurant_id filter (no cross-tenant leakage).
// This is OPERATOR-ONLY context; nothing here is shown to the customer.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerTenant } from "@/lib/db/tenant-server";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  // Gate — STRICT explicit flag (NOT implied by tier='pro' or by P1), matching
  // the updater. A tenant without customer_memory explicitly on → enabled:false
  // and the operator card never renders.
  const { data: rest } = await admin
    .from("restaurants")
    .select("feature_flags")
    .eq("id", tenant.restaurantId)
    .maybeSingle();
  const enabled = isFeatureExplicitlyEnabled(
    "customer_memory",
    (rest?.feature_flags as Record<string, unknown> | null) ?? null
  );
  if (!enabled) return NextResponse.json({ enabled: false });

  const customerId = new URL(req.url).searchParams.get("customerId");
  if (!customerId) return NextResponse.json({ enabled: true, memory: null });

  // Tenant-scoped read — restaurant_id filter guarantees isolation.
  const { data: memory } = await admin
    .from("customer_memory")
    .select(
      "order_count, total_spent, avg_order_value, first_seen, last_seen, last_order_id, fulfillment_pref, favorite_items, channels_used, value_tier, inferred, inferred_updated_at, updated_at"
    )
    .eq("restaurant_id", tenant.restaurantId)
    .eq("customer_id", customerId)
    .maybeSingle();

  return NextResponse.json({ enabled: true, memory: memory ?? null });
}
