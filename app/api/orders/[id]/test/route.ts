// ============================================================================
// MaitreAI — UI4 test/synthetic-order marker (manager-only) — SERVER ONLY.
// Lets a MANAGER mark an existing order as a test (or clear it) so rehearsal
// orders never inflate real reports. is_test is set ONLY here, server-side —
// never client-trusted; a customer-placed order is never test. Auth via
// getServerTenant(); the write runs through the service-role admin client
// (survives the M1.7 financial-table RLS lockdown) and is EXPLICITLY scoped to
// the authorized restaurant_id. Touches NO money/status/totals — only is_test.
// ============================================================================

import { NextResponse } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAuditEvent } from "@/lib/db/audit";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Marking a test order is a manager judgement (it removes the order from real
  // reports) — manager-gated server-side regardless of the UI.
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.isTest !== "boolean") return NextResponse.json({ error: "bad_params" }, { status: 400 });
  const isTest = body.isTest;

  // Tenant-scoped write: id AND restaurant_id (admin bypasses RLS → the code
  // carries isolation). is_test ONLY; never totals, payment, or status.
  const { data: updated, error } = await admin
    .from("orders")
    .update({ is_test: isTest, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("restaurant_id", tenant.restaurantId)
    .select("id");
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 502 });
  if (!updated || updated.length === 0) return NextResponse.json({ error: "order_not_found" }, { status: 404 });

  // Audit the mark (actor = the manager, server-resolved). Best-effort.
  await recordAuditEvent(admin, {
    restaurantId: tenant.restaurantId,
    userId: tenant.userId,
    role: tenant.role,
    action: "order_test_marked",
    entityType: "order",
    entityId: params.id,
    metadata: { isTest },
  });

  return NextResponse.json({ ok: true, isTest });
}
