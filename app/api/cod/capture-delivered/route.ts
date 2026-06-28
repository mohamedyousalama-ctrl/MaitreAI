// ============================================================================
// MaitreAI — COD capture on order-status "delivered" (operator path) — SERVER ONLY.
// Called by the order-store when the operator marks a delivery order delivered
// via the order-status screen (as opposed to the driver one-time-link path which
// calls captureCodOnDelivered directly). Guards: fulfillment=delivery AND
// payment_status!=paid. captureCodOnDelivered is idempotent (keyed on order_id)
// so if BOTH paths fire for the same order the second call is a safe no-op.
// ============================================================================

import { NextResponse } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureCodOnDelivered } from "@/lib/db/cod";
import { markDeliveryDelivered, orderHasAssignedDriver } from "@/lib/db/delivery";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // M1.7-D — auth/authorize as the member (getServerTenant), but read the guard
  // row + perform the WRITES with the service-role client (survives the RLS
  // lockdown). All DB access below is explicitly scoped by tenant.restaurantId.
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orderId = String(body.orderId ?? "");
  if (!orderId) return NextResponse.json({ error: "bad_params" }, { status: 400 });

  // Server-side guard: only capture for unpaid delivery orders.
  const { data: order } = await admin
    .from("orders")
    .select("fulfillment,payment_status,payment_method")
    .eq("id", orderId)
    .eq("restaurant_id", tenant.restaurantId)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  const ord = order as { fulfillment: string; payment_status: string; payment_method: string | null };
  if (ord.fulfillment !== "delivery" || ord.payment_status === "paid") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // R3b backstop — never insert an UNATTRIBUTED COD cash row. For a COD (or
  // unspecified-method) delivery order, require a confirmed assigned driver
  // BEFORE capture, matched by order_id. Non-COD methods (e.g. vodafone_cash)
  // open no cash row (captureCodOnDelivered no-ops) so are exempt. FAIL-CLOSED:
  // if the driver can't be verified (none, or a lookup error), reject — this
  // guarantees cash is never captured to driver_id=null even if some path reaches
  // here, independent of the primary status-route guard.
  const isCod = ord.payment_method == null || ord.payment_method === "cod";
  if (isCod) {
    let hasDriver = false;
    try {
      hasDriver = await orderHasAssignedDriver(admin, tenant.restaurantId, orderId);
    } catch {
      return NextResponse.json({ error: "no_driver" }, { status: 409 });
    }
    if (!hasDriver) return NextResponse.json({ error: "no_driver" }, { status: 409 });
  }

  const r = await captureCodOnDelivered(admin, {
    restaurantId: tenant.restaurantId,
    orderId,
    actorUserId: tenant.userId,
    actorRole: tenant.role ?? "operator",
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });

  // Status sync: mirror the driver-token path so the /deliveries board reflects
  // reality (orders.order_status was set to delivered by the order-store; the
  // delivery row otherwise stays stale). Idempotent; never breaks the capture
  // response — COD attribution above is unchanged.
  try {
    await markDeliveryDelivered(admin, tenant.restaurantId, orderId);
  } catch (e) {
    console.error("[cod/capture-delivered] delivery status sync error", e);
  }

  return NextResponse.json({ ok: true, collected: r.collected, expected: r.expected });
}
