// ============================================================================
// MaitreAI — R5 Customer aggregates (GET) — SERVER ONLY, READ. Tenant-scoped.
// One endpoint behind the Customers view: a facts strip, segment counts (with the
// documented formula), a top-by-spend list, and an at-risk (gone-quiet) list.
// Computed by the pure lib/customers/aggregates from the customers table's own
// counters. Read via the admin client EXPLICITLY scoped to the tenant.
// ============================================================================

import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeCustomerAggregates, type CustomerAggInput } from "@/lib/customers/aggregates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;

  const url = new URL(req.url);
  const atRiskDays = Math.min(Math.max(Number(url.searchParams.get("atRiskDays")) || 30, 1), 365);
  const topN = Math.min(Math.max(Number(url.searchParams.get("topN")) || 10, 1), 50);
  const atRiskLimit = Math.min(Math.max(Number(url.searchParams.get("atRiskLimit")) || 100, 1), 500);

  // Exact tenant customer count (head-only) — authoritative even if the row fetch
  // below is capped, so totals are never SILENTLY wrong.
  const ROW_CAP = 10_000;
  const { count: exactCount, error: countErr } = await admin
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", tenant.restaurantId);
  if (countErr) {
    console.error("[customers/aggregates] count failed:", countErr.message);
    return NextResponse.json({ error: "read_failed" }, { status: 502 });
  }

  const { data, error } = await admin
    .from("customers")
    .select("id, name, phone, orders_count, ltv, last_seen_at")
    .eq("restaurant_id", tenant.restaurantId)
    .limit(ROW_CAP);
  if (error) {
    // Never leak the raw DB message to the client — log it, return a generic detail.
    console.error("[customers/aggregates] read failed:", error.message);
    return NextResponse.json({ error: "read_failed" }, { status: 502 });
  }

  const rows = (data ?? []) as CustomerAggInput[];
  const aggregates = computeCustomerAggregates(rows, { nowMs: Date.now(), atRiskDays, topN, atRiskLimit });
  // Honest incompleteness: when the tenant has more customers than we fetched, the
  // segment/list aggregates are computed over the fetched page — flag it so the UI
  // never presents a capped result as complete. (Never hit at pilot scale.)
  const capped = typeof exactCount === "number" && exactCount > rows.length;
  return NextResponse.json({ ...aggregates, totalCustomersExact: exactCount ?? aggregates.facts.totalCustomers, capped });
}
