// ============================================================================
// MaitreAI — Driver edit + activate/deactivate (operator) — SERVER ONLY.
// Manager-gated. PATCH handles either the active toggle ({active}) OR a profile
// edit ({name, phone, vehicle?}). The row id (driver_id) is never changed, so a
// driver's existing deliveries/COD attribution is unaffected by an edit.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { setDriverActive, updateDriver } from "@/lib/db/delivery";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!ENABLE_DELIVERY_TRACKING) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    // Active toggle (unchanged behavior).
    if (typeof body.active === "boolean") {
      await setDriverActive(supabase, tenant.restaurantId, params.id, body.active);
      return NextResponse.json({ ok: true });
    }
    // Profile edit: name + phone required (same as add); vehicle optional.
    if (body.name !== undefined || body.phone !== undefined || body.vehicle !== undefined) {
      const name = String(body.name ?? "").trim();
      const phone = String(body.phone ?? "").trim();
      if (!name || !phone) return NextResponse.json({ error: "bad_request" }, { status: 400 });
      const vehicle = typeof body.vehicle === "string" ? body.vehicle : null;
      await updateDriver(supabase, tenant.restaurantId, params.id, { name, phone, vehicle });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: "update_failed", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
