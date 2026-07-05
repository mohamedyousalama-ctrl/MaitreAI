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
import { requireTenant } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { orderHasAssignedDriver } from "@/lib/db/delivery";
import { recordAuditEvent } from "@/lib/db/audit";
import { checkOrderSafetyHold, isCommittedStatus } from "@/lib/db/safety-hold-guard";

export const runtime = "nodejs";

const ORDER_STATUSES = new Set([
  "draft", "pending_confirmation", "pending_payment", "paid",
  "preparing", "ready", "out_for_delivery", "delivered", "cancelled",
]);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  // Status advance is operator-allowed (no manager gate) — running the shift.

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const status = String(body.status ?? "");
  if (!ORDER_STATUSES.has(status)) return NextResponse.json({ error: "bad_params" }, { status: 400 });
  // MO2 — optimistic concurrency: the client sends the status it BELIEVES is current.
  // When provided, the write is conditional on it (see the conditional UPDATE below),
  // so a stale advance (another operator already moved the order) is rejected, not
  // clobbered. Optional → omitted callers keep the prior unconditional behavior.
  const expectedStatus = typeof body.expectedStatus === "string" ? body.expectedStatus : null;

  // WO-SAFE-1 — SAFETY-HOLD GUARD. An order linked to a conversation under an
  // active SYSTEM_HOLD (unresolved allergy/safety concern) must NOT be committed
  // to money/kitchen/customer. Block any advance INTO a committed status
  // (paid/preparing/ready/out_for_delivery/delivered) with 409 + reason. Release is
  // an explicit operator next-action: resolve the safety hold on the conversation,
  // then retry. Fail-closed (a check error is treated as held). Cancelling/pending
  // moves are unaffected.
  if (isCommittedStatus(status)) {
    const hold = await checkOrderSafetyHold(admin, tenant.restaurantId, params.id);
    if (hold.held) {
      return NextResponse.json(
        {
          error: "safety_hold_active",
          reason: hold.reason,
          detail: "الطلب مربوط بمحادثة عليها تنبيه سلامة/حساسية لم يُحَل — لازم تُحلّ أولاً قبل تأكيد/تجهيز الطلب.",
          conversationId: hold.conversationId,
        },
        { status: 409 },
      );
    }
  }

  // R3b — AUTHORITATIVE driver guard on the delivered transition. A COD (or
  // unspecified-method) delivery order cannot be booked "delivered" without an
  // assigned driver, else captureCodOnDelivered books the cash to driver_id=null
  // («غير معيّن») and per-driver reconciliation breaks. The client guard is only
  // fast feedback (and too narrow — it skips orders with no delivery row, e.g.
  // web orders); this is the real gate. Pickup orders and already-paid orders are
  // unaffected; non-COD methods (e.g. vodafone_cash) carry no driver cash so are
  // exempt. FAIL-CLOSED: if a confirmed assigned driver can't be verified (none,
  // or a lookup error), the delivered write is rejected.
  if (status === "delivered") {
    const { data: ord, error: ordErr } = await admin
      .from("orders")
      .select("fulfillment,payment_method,payment_status")
      .eq("id", params.id)
      .eq("restaurant_id", tenant.restaurantId)
      .maybeSingle();
    if (ordErr || !ord) return NextResponse.json({ error: "order_not_found" }, { status: 404 });
    const o = ord as { fulfillment: string | null; payment_method: string | null; payment_status: string | null };
    const isDelivery = o.fulfillment === "delivery";
    const isPaid = o.payment_status === "paid";
    const isCod = o.payment_method == null || o.payment_method === "cod";
    if (isDelivery && !isPaid && isCod) {
      let hasDriver = false;
      try {
        hasDriver = await orderHasAssignedDriver(admin, tenant.restaurantId, params.id);
      } catch {
        // Lookup failed → cannot confirm attribution → fail-closed (block).
        return NextResponse.json({ error: "no_driver" }, { status: 409 });
      }
      if (!hasDriver) return NextResponse.json({ error: "no_driver" }, { status: 409 });
    }
  }

  // Tenant-scoped write: id AND restaurant_id (admin bypasses RLS). MO2 — when an
  // expectedStatus is supplied, the WHERE also pins order_status=:expectedStatus so
  // the write is atomic optimistic-concurrency: 1 row → we advanced it; 0 rows → the
  // order already moved (another operator) or doesn't exist. R3b driver guard above
  // is unchanged and still runs first.
  let q = admin
    .from("orders")
    .update({ order_status: status, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("restaurant_id", tenant.restaurantId);
  if (expectedStatus) q = q.eq("order_status", expectedStatus);
  const { data: updated, error } = await q.select("id");
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 502 });

  if (expectedStatus && (!updated || updated.length === 0)) {
    // 0 rows under OCC: distinguish "moved by someone else" from "not found".
    const { data: cur } = await admin
      .from("orders")
      .select("order_status")
      .eq("id", params.id)
      .eq("restaurant_id", tenant.restaurantId)
      .maybeSingle();
    if (!cur) return NextResponse.json({ error: "order_not_found" }, { status: 404 });
    return NextResponse.json(
      { error: "status_conflict", currentStatus: (cur as { order_status: string }).order_status },
      { status: 409 }
    );
  }

  // MO4 — audit the advance (actor = the member who advanced it, server-resolved).
  // {from,to} from the OCC expectedStatus (authoritative: the write succeeded only
  // when order_status == expectedStatus). Best-effort; never blocks the response.
  await recordAuditEvent(admin, {
    restaurantId: tenant.restaurantId,
    userId: tenant.userId,
    role: tenant.role,
    action: "order_status_changed",
    entityType: "order",
    entityId: params.id,
    metadata: { from: expectedStatus, to: status },
  });

  return NextResponse.json({ ok: true });
}
