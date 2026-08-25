// ============================================================================
// Kivo Delivery Network — mint/copy the driver presence URL (operator).
// POST returns the secure /p/<token> link. Token is never a raw driver id and
// is not written to logs. Manager-gated like other driver writes.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";
import { ensurePresenceToken } from "@/lib/db/driver-presence";
import { appBaseUrl } from "@/lib/db/delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  if (!ENABLE_DELIVERY_TRACKING) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data: driver } = await supabase
    .from("drivers")
    .select("id")
    .eq("id", params.id)
    .eq("restaurant_id", tenant.restaurantId)
    .maybeSingle();
  if (!driver) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const tok = await ensurePresenceToken(supabase, params.id);
    if (!tok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ presenceLink: `${appBaseUrl()}/p/${tok}` });
  } catch (e) {
    const status = e instanceof Error && e.message === "not_configured" ? 503 : 502;
    return NextResponse.json({ error: "presence_link_failed" }, { status });
  }
}
