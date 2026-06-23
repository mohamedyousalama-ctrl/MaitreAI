// ============================================================================
// MaitreAI — Tenant plan/tier read-only settings
//
// GET /api/settings/plan — any member; returns the tenant's current tier.
//
// restaurants.tier ('standard' | 'pro') was added in migration 0022 and has
// SELECT grants to anon/authenticated. It is not exposed by any other settings
// route, so the Settings page cannot show the plan without this endpoint.
//
// Read-only: tier changes are a platform-level operation (not operator
// self-serve). No PUT/POST on this route.
//
// Auth: any member of the restaurant (reads only, no secrets).
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import type { Tier } from "@/lib/tenant/tier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("restaurants")
    .select("tier")
    .eq("id", tenant.restaurantId)
    .single();

  if (error) return NextResponse.json({ error: "fetch_failed", detail: error.message }, { status: 502 });

  return NextResponse.json({
    tier: ((data.tier as Tier | null) ?? "standard") as Tier,
  });
}
