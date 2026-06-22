// ============================================================================
// MaitreAI — Customer tracking poll (token-scoped, public) — SERVER ONLY.
// GET → { status, timeline timestamps, latest driver location (if recent &
// shared), order summary }. Truth-driven: no location unless one was actually
// shared recently. Polled by the /t/<token> page.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDeliveryByCustomerToken } from "@/lib/db/delivery";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";

export const runtime = "nodejs";
// Polled live — every request must hit the DB (no Next.js GET route caching),
// otherwise the customer would see a frozen status/dot.
export const dynamic = "force-dynamic";

// Only surface a live dot if the last point is fresh (driver page open & sharing).
const LOCATION_FRESH_MS = 30 * 1000;

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  if (!ENABLE_DELIVERY_TRACKING) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const data = await getDeliveryByCustomerToken(admin, params.token);
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const d = data.delivery as Record<string, unknown>;
  const loc = data.location as { lat: number; lng: number; recorded_at: string } | null;
  const fresh = loc && Date.now() - new Date(loc.recorded_at).getTime() < LOCATION_FRESH_MS;
  const o = (data.order ?? {}) as Record<string, unknown>;

  return NextResponse.json({
    status: d.status,
    timeline: {
      assigned_at: d.assigned_at ?? null,
      picked_up_at: d.picked_up_at ?? null,
      delivered_at: d.delivered_at ?? null,
    },
    driverName: (d.drivers as { name?: string } | null)?.name ?? null,
    location: fresh && loc ? { lat: loc.lat, lng: loc.lng, recorded_at: loc.recorded_at } : null,
    order: {
      order_number: o.order_number ?? null,
      total: o.total ?? null,
      currency: o.currency ?? null,
      address: o.address ?? o.zoneName ?? null,
      items: Array.isArray(o.items) ? (o.items as { quantity: number; name: string }[]).map((i) => ({ quantity: i.quantity, name: i.name })) : [],
    },
  });
}
