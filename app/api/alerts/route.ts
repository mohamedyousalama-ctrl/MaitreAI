// ============================================================================
// MaitreAI — active critical alerts for the console banner (operator). READ.
// Tenant-scoped via getServerTenant; queried with the admin client (service
// role) scoped to the tenant's restaurant_id. Returns active (non-dismissed)
// alerts, newest first. Degrades to an empty list if the table isn't there yet
// (migration not applied) — the banner simply shows nothing.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerTenant } from "@/lib/db/tenant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ alerts: [] });

  try {
    const { data, error } = await admin
      .from("system_alerts")
      .select("id, type, detail, conversation_id, created_at")
      .eq("restaurant_id", tenant.restaurantId)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) return NextResponse.json({ alerts: [] }); // table missing / not applied yet
    return NextResponse.json({ alerts: data ?? [] });
  } catch {
    return NextResponse.json({ alerts: [] });
  }
}
