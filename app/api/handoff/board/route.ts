// ============================================================================
// MaitreAI — R3 Handoff board (GET) — SERVER ONLY, READ. Tenant-scoped.
// Returns the Deyafa hand-off board: kitchen-bound orders bucketed by pos_status
// (0051) so staff can see which confirmed orders are still not_entered (the
// warning bucket). Read-only; changes nothing. Mirrors the POS route's
// eligibility set (confirmed, non-test) — an order not yet kitchen-bound isn't on
// the board. Read via the admin client EXPLICITLY scoped to the tenant.
// ============================================================================

import { NextResponse } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bucketHandoffBoard, type HandoffOrder } from "@/lib/handoff/board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same allowlist as POST /api/orders/[id]/pos — an order is on the board only once
// it's confirmed and kitchen-bound (never draft/pending/cancelled/test).
const POS_ELIGIBLE_STATUS = ["paid", "preparing", "ready", "out_for_delivery", "delivered"];

export async function GET() {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await admin
    .from("orders")
    .select("id, order_number, order_status, pos_status, pos_reference, pos_entered_by, pos_entered_at, total, created_at")
    .eq("restaurant_id", tenant.restaurantId)
    .in("order_status", POS_ELIGIBLE_STATUS)
    // NOT (is_test IS true) → keeps false AND null; excludes only genuine test orders
    // (a plain neq would drop null-is_test rows entirely).
    .not("is_test", "is", true)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: "read_failed", detail: error.message }, { status: 502 });

  const board = bucketHandoffBoard((data ?? []) as HandoffOrder[]);
  return NextResponse.json(board);
}
