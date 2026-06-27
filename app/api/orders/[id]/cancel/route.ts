// ============================================================================
// MaitreAI — Order cancel (operator) — SERVER ONLY (M1.7-A).
// MANAGER-ONLY (proposed gate): cancelling is destructive and touches money state
// (a paid order flips to "refunded"), so it sits with the other money actions
// (mark-paid, COD settle/collect) behind the manager gate. Auth via
// getServerTenant() + manager gate; WRITE via the service-role admin client,
// EXPLICITLY scoped to the authorized restaurant_id. Mirrors the store's
// cancelOrder: order_status="cancelled"; payment_status→"refunded" iff it was
// "paid", else unchanged. Totals are never touched.
// ============================================================================

import { NextResponse } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Tenant-scoped read to compute the refund-state transition.
  const { data: order } = await admin
    .from("orders")
    .select("payment_status")
    .eq("id", params.id)
    .eq("restaurant_id", tenant.restaurantId)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "order_not_found" }, { status: 404 });

  const paymentStatus =
    (order as { payment_status: string }).payment_status === "paid"
      ? "refunded"
      : (order as { payment_status: string }).payment_status;

  // Tenant-scoped write: id AND restaurant_id (admin bypasses RLS).
  const { error } = await admin
    .from("orders")
    .update({ order_status: "cancelled", payment_status: paymentStatus, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("restaurant_id", tenant.restaurantId);
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 502 });
  return NextResponse.json({ ok: true, paymentStatus });
}
