// ============================================================================
// MaitreAI — Assign a driver to a delivery (operator) — SERVER ONLY. Manager.
// Mints the one-time driver + customer tokens and WhatsApps the driver the link.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/db/require-tenant";
import { assignDriver } from "@/lib/db/delivery";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!ENABLE_DELIVERY_TRACKING) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  // Dispatch is an operational action (any member); driver-roster management
  // (add/deactivate) stays manager-only on the /api/drivers routes.

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const driverId = String(body.driverId ?? "");
  if (!driverId) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    const result = await assignDriver(admin, { deliveryId: params.id, driverId, restaurantId: tenant.restaurantId });
    return NextResponse.json(result);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    const code = detail === "driver_not_found" || detail === "delivery_not_found" ? 404 : 502;
    return NextResponse.json({ error: detail }, { status: code });
  }
}
