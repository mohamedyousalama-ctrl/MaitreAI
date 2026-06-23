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
import { createClient } from "@/lib/supabase/server";
import { captureCodOnDelivered } from "@/lib/db/cod";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orderId = String(body.orderId ?? "");
  if (!orderId) return NextResponse.json({ error: "bad_params" }, { status: 400 });

  // Server-side guard: only capture for unpaid delivery orders.
  const { data: order } = await supabase
    .from("orders")
    .select("fulfillment,payment_status")
    .eq("id", orderId)
    .eq("restaurant_id", tenant.restaurantId)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  if (
    (order as { fulfillment: string }).fulfillment !== "delivery" ||
    (order as { payment_status: string }).payment_status === "paid"
  ) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const r = await captureCodOnDelivered(supabase, {
    restaurantId: tenant.restaurantId,
    orderId,
    actorUserId: tenant.userId,
    actorRole: tenant.role ?? "operator",
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });
  return NextResponse.json({ ok: true, collected: r.collected, expected: r.expected });
}
