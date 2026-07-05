// ============================================================================
// MaitreAI — active critical alerts for the console banner (operator). READ.
// Tenant-scoped via getServerTenant; queried with the admin client (service
// role) scoped to the tenant's restaurant_id. Returns active (non-dismissed)
// alerts, newest first.
//
// Q3 — FAIL LOUD: an infrastructure failure (no admin client, table missing,
// query error) returns HTTP 503 with alertSystemStatus:"degraded" — NOT a bland
// empty 200. An empty 200 reads as "all clear" and hides a broken alerting
// system. The healthy path returns alertSystemStatus:"ok" so the banner can tell
// "no active alerts" apart from "alerting is down".
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/db/require-tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function degraded(reason: string) {
  return NextResponse.json({ alertSystemStatus: "degraded", reason, alerts: [] }, { status: 503 });
}

export async function GET() {
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return degraded("admin_client_unavailable");

  try {
    const { data, error } = await admin
      .from("system_alerts")
      .select("id, type, detail, conversation_id, created_at")
      .eq("restaurant_id", tenant.restaurantId)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) return degraded("query_failed"); // table missing / RLS / DB error
    return NextResponse.json({ alertSystemStatus: "ok", alerts: data ?? [] });
  } catch {
    return degraded("exception");
  }
}
