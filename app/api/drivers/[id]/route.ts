// ============================================================================
// MaitreAI — Driver activate/deactivate (operator) — SERVER ONLY. Manager-gated.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { setDriverActive } from "@/lib/db/delivery";
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
  if (typeof body.active !== "boolean") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  try {
    await setDriverActive(supabase, tenant.restaurantId, params.id, body.active);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "update_failed", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
