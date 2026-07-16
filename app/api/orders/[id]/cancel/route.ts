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
import { DatabaseOperationError, mustWrite } from "@/lib/db/checked";
import { requireTenant } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseRefundMetadata, recordOrderRefund } from "@/lib/db/cod";
import { isOrderStatus, validateOrderStatusTransition } from "@/lib/orders/transitions";

export const runtime = "nodejs";

function refundErrorResponse(error: string) {
  const status =
    error === "order_not_found" ? 404
      : error === "order_not_paid" ? 409
        : error === "bad_refund_amount" || error === "bad_order_total" || error === "bad_refund_metadata" ? 400
          : 502;
  return NextResponse.json({ error }, { status });
}

function orderUpdateErrorResponse(error: unknown) {
  if (error instanceof DatabaseOperationError && error.code === "KIVO_ROW_COUNT_MISMATCH") {
    return NextResponse.json({ ok: false, error: "order_not_found" }, { status: 404 });
  }
  return NextResponse.json({ error: "update_failed" }, { status: 502 });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // Tenant-scoped read to validate the status transition before any money record.
  const { data: order } = await admin
    .from("orders")
    .select("order_status,payment_status")
    .eq("id", params.id)
    .eq("restaurant_id", tenant.restaurantId)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "order_not_found" }, { status: 404 });

  const current = order as { order_status: string | null; payment_status: string | null };
  const currentStatus = current.order_status ?? "";
  if (!isOrderStatus(currentStatus)) return NextResponse.json({ error: "bad_current_status" }, { status: 409 });

  const transition = validateOrderStatusTransition({
    from: currentStatus,
    to: "cancelled",
    paymentStatus: current.payment_status,
  });
  if (!transition.ok || currentStatus === "cancelled") {
    return NextResponse.json(
      { error: transition.ok ? "illegal_transition" : transition.error, from: currentStatus, to: "cancelled" },
      { status: 409 }
    );
  }

  let refundEventId: string | null = null;
  let paymentStatus = (order as { payment_status: string }).payment_status;
  if (paymentStatus === "paid") {
    const parsed = parseRefundMetadata(body);
    if (!parsed.ok) return refundErrorResponse(parsed.error);
    const refund = await recordOrderRefund(admin, tenant.restaurantId, {
      orderId: params.id,
      ...parsed.refund,
      actorUserId: tenant.userId,
      actorRole: tenant.role,
    });
    if (!refund.ok) return refundErrorResponse(refund.error);
    refundEventId = refund.eventId;
    paymentStatus = "refunded";
  }

  // Tenant-scoped write: id AND restaurant_id (admin bypasses RLS).
  try {
    await mustWrite<{ id: string }>(
      admin
        .from("orders")
        .update({ order_status: "cancelled", payment_status: paymentStatus, updated_at: new Date().toISOString() })
        .eq("id", params.id)
        .eq("restaurant_id", tenant.restaurantId)
        .select("id"),
      "orders.cancel",
      { exactRows: 1 },
    );
  } catch (error) {
    return orderUpdateErrorResponse(error);
  }
  return NextResponse.json({ ok: true, paymentStatus, refundEventId });
}
