// ============================================================================
// MaitreAI — Order status advance (operator) — SERVER ONLY (M1.7-A).
// The order-status lifecycle is the operator's shift work, so ANY member may
// advance it. Auth via getServerTenant(); the WRITE runs through the service-role
// admin client (survives the RLS lockdown) and is EXPLICITLY scoped to the
// authorized restaurant_id (admin bypasses RLS — the code carries tenant
// isolation). Status-only: never touches totals, payment, or money state.
// ============================================================================

import { NextResponse } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ORDER_STATUSES = new Set([
  "draft", "pending_confirmation", "pending_payment", "paid",
  "preparing", "ready", "out_for_delivery", "delivered", "cancelled",
]);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Status advance is operator-allowed (no manager gate) — running the shift.

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const status = String(body.status ?? "");
  if (!ORDER_STATUSES.has(status)) return NextResponse.json({ error: "bad_params" }, { status: 400 });

  // Tenant-scoped write: id AND restaurant_id (admin bypasses RLS).
  const { error } = await admin
    .from("orders")
    .update({ order_status: status, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("restaurant_id", tenant.restaurantId);
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
