// ============================================================================
// MaitreAI — WO-DELIVERY-D1: branches list (read-only) for the zone map editor.
//
// GET /api/onboarding/config/branches — any member; returns [{id, name}] for the
// tenant's active branches so the zone editor can offer a branch picker (and hide it
// when there is only one branch). Read-only; no writes here (branches are managed by
// the existing branches surface). Tenant-scoped via requireTenant.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/db/require-tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;

  const { data, error } = await supabase
    .from("branches")
    .select("id, name, active")
    .eq("restaurant_id", tenant.restaurantId)
    .order("created_at");

  if (error) return NextResponse.json({ error: "fetch_failed", detail: error.message }, { status: 502 });

  const branches = (data ?? [])
    .filter((b) => b.active !== false)
    .map((b) => ({ id: b.id as string, name: b.name as string }));

  return NextResponse.json({ branches });
}
