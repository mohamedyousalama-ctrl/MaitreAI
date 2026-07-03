// ============================================================================
// MaitreAI — R5 Customer aggregates (GET) — SERVER ONLY, READ. Tenant-scoped.
// One endpoint behind the Customers view: a facts strip, segment counts (with the
// documented formula), a top-by-spend list, and an at-risk (gone-quiet) list.
// Computed by the pure lib/customers/aggregates from the customers table's own
// counters. Read via the admin client EXPLICITLY scoped to the tenant.
// ============================================================================

import { NextResponse } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeCustomerAggregates, type CustomerAggInput } from "@/lib/customers/aggregates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const atRiskDays = Math.min(Math.max(Number(url.searchParams.get("atRiskDays")) || 30, 1), 365);
  const topN = Math.min(Math.max(Number(url.searchParams.get("topN")) || 10, 1), 50);

  const { data, error } = await admin
    .from("customers")
    .select("id, name, phone, orders_count, ltv, last_seen_at")
    .eq("restaurant_id", tenant.restaurantId)
    .limit(5000);
  if (error) return NextResponse.json({ error: "read_failed", detail: error.message }, { status: 502 });

  const aggregates = computeCustomerAggregates((data ?? []) as CustomerAggInput[], {
    nowMs: Date.now(), atRiskDays, topN,
  });
  return NextResponse.json(aggregates);
}
