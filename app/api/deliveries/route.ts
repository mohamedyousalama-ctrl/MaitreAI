// ============================================================================
// MaitreAI — Deliveries list (operator) — SERVER ONLY. Member-gated.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/db/require-tenant";
import { listDeliveries, ensureDeliveryRowForOrder } from "@/lib/db/delivery";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // polled by the operator view — always fresh

// DLV2 — active delivery-fulfillment statuses that MUST be dispatchable (and so
// must have a delivery row). The real fix is DLV1 (rows created at order time);
// this is belt-and-suspenders so an in-flight order is never invisible/unassignable.
const ACTIVE_DELIVERY_STATUSES = ["ready", "out_for_delivery"];

export async function GET() {
  if (!ENABLE_DELIVERY_TRACKING) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;

  // DLV2 self-heal: any active delivery order MISSING a delivery row gets one now,
  // so it appears in التوصيل with a real delivery.id (assignable). Idempotent +
  // best-effort — never blocks the list. Uses the admin client (the row write must
  // survive RLS); reads/list stay on the member-scoped client below.
  const admin = createAdminClient();
  if (admin) {
    try {
      const [{ data: activeOrders }, { data: existing }] = await Promise.all([
        admin
          .from("orders")
          .select("id")
          .eq("restaurant_id", tenant.restaurantId)
          .eq("fulfillment", "delivery")
          .in("order_status", ACTIVE_DELIVERY_STATUSES),
        admin.from("deliveries").select("order_id").eq("restaurant_id", tenant.restaurantId),
      ]);
      const have = new Set(((existing ?? []) as { order_id: string }[]).map((r) => r.order_id));
      const missing = ((activeOrders ?? []) as { id: string }[]).filter((o) => !have.has(o.id));
      for (const o of missing) {
        await ensureDeliveryRowForOrder(admin, o.id, tenant.restaurantId);
      }
    } catch (e) {
      console.error("[deliveries] self-heal error", e);
    }
  }

  const deliveries = await listDeliveries(supabase, tenant.restaurantId);
  return NextResponse.json({ deliveries });
}
