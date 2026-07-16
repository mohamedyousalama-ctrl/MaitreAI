// ============================================================================
// MaitreAI — Order payment-status change (operator) — SERVER ONLY (M1.7-A).
// MANAGER-ONLY: payment_status is money state (matches COD settle/collect being
// manager-gated, and closes the audited "forge-paid" vector). Auth via
// getServerTenant() + manager gate; WRITE via the service-role admin client,
// EXPLICITLY scoped to the authorized restaurant_id. Mirrors the store's markPaid
// /updatePaymentStatus: when paymentStatus="paid" the order also flips to "paid".
// Totals/amounts are never touched here — payment STATE only.
// ============================================================================

import { NextResponse } from "next/server";
import { DatabaseOperationError, mustWrite } from "@/lib/db/checked";
import { requireTenant } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkOrderSafetyHold } from "@/lib/db/safety-hold-guard";
import { parseRefundMetadata, recordOrderRefund } from "@/lib/db/cod";

export const runtime = "nodejs";

const PAYMENT_STATUSES = new Set(["unpaid", "payment_link_sent", "paid", "failed", "refunded"]);

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
  const paymentStatus = String(body.paymentStatus ?? "");
  if (!PAYMENT_STATUSES.has(paymentStatus)) return NextResponse.json({ error: "bad_params" }, { status: 400 });

  let refundEventId: string | null = null;
  if (paymentStatus === "refunded") {
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
  }

  // WO-SAFE-1 — block marking an order PAID while its linked conversation is under
  // an active safety hold (paid also flips order_status→paid, a commitment). Release
  // = resolve the safety hold on the conversation, then retry. Fail-closed.
  if (paymentStatus === "paid") {
    const hold = await checkOrderSafetyHold(admin, tenant.restaurantId, params.id);
    if (hold.held) {
      return NextResponse.json(
        {
          error: "safety_hold_active",
          reason: hold.reason,
          detail: "الطلب مربوط بمحادثة عليها تنبيه سلامة/حساسية لم يُحَل — لازم تُحلّ أولاً قبل تعليم الدفع.",
          conversationId: hold.conversationId,
        },
        { status: 409 },
      );
    }
  }

  // markPaid parity: paying also advances order_status to "paid".
  const patch: { payment_status: string; order_status?: string; updated_at: string } = {
    payment_status: paymentStatus,
    updated_at: new Date().toISOString(),
  };
  if (paymentStatus === "paid") patch.order_status = "paid";

  // Tenant-scoped write: id AND restaurant_id (admin bypasses RLS).
  try {
    await mustWrite<{ id: string }>(
      admin
        .from("orders")
        .update(patch)
        .eq("id", params.id)
        .eq("restaurant_id", tenant.restaurantId)
        .select("id"),
      "orders.payment_update",
      { exactRows: 1 },
    );
  } catch (error) {
    return orderUpdateErrorResponse(error);
  }
  return NextResponse.json({ ok: true, refundEventId });
}
