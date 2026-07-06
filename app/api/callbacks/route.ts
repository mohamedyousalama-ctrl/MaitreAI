// ============================================================================
// WO-CALLBACK — GET open callback requests (console Live-Shift alarms rail) — READ.
// Manager OR operator (both handle the floor), tenant-scoped via requireTenant; read
// with the service-role admin client scoped to restaurant_id. The Console-Impl window
// wires the UI later; this is the data contract.
// ============================================================================
import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { listOpenCallbacks } from "@/lib/db/callback-requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager" && tenant.role !== "operation") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const callbacks = await listOpenCallbacks(admin, tenant.restaurantId);
  return NextResponse.json({ callbacks });
}
