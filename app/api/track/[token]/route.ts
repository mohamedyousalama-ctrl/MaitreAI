// ============================================================================
// MaitreAI — Customer tracking poll (token-scoped, public) — SERVER ONLY.
// GET → { status, timeline timestamps, latest driver location (if recent &
// shared), order summary }. Truth-driven: no location unless one was actually
// shared recently. Polled by the /t/<token> page.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDeliveryByCustomerToken } from "@/lib/db/delivery";
import { isActiveLeg } from "@/lib/delivery/runs";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
// Polled live — every request must hit the DB (no Next.js GET route caching),
// otherwise the customer would see a frozen status/dot.
export const dynamic = "force-dynamic";

// Only surface a live dot if the last point is fresh (driver page open & sharing).
const LOCATION_FRESH_MS = 30 * 1000;

// T5 — abuse throttle. Legit customer polling is 1/5s = 12/min; cap at 60/min
// per token (5× headroom), so refreshing never throttles but scraping does.
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60 * 1000;

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  if (!ENABLE_DELIVERY_TRACKING) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const rl = rateLimit(`track:${params.token}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
    );
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const data = await getDeliveryByCustomerToken(admin, params.token);
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const d = data.delivery as Record<string, unknown>;
  const loc = data.location as { lat: number; lng: number; recorded_at: string } | null;
  const fresh = loc && Date.now() - new Date(loc.recorded_at).getTime() < LOCATION_FRESH_MS;
  const o = (data.order ?? {}) as Record<string, unknown>;

  // WO-DELIVERY-D2 — ACTIVE-LEG gate. A single delivery (run_id NULL) behaves
  // exactly as before → byte-identical. A run stop (run_id SET) shows the driver's
  // location ONLY while THIS leg is current (status === on_the_way), so a customer
  // never sees the driver's dot while the driver is on another customer's leg.
  const activeLeg = isActiveLeg(d.run_id != null, String(d.status ?? ""));

  return NextResponse.json({
    status: d.status,
    timeline: {
      assigned_at: d.assigned_at ?? null,
      picked_up_at: d.picked_up_at ?? null,
      delivered_at: d.delivered_at ?? null,
    },
    driverName: (d.drivers as { name?: string } | null)?.name ?? null,
    location: fresh && loc && activeLeg ? { lat: loc.lat, lng: loc.lng, recorded_at: loc.recorded_at } : null,
    order: {
      order_number: o.order_number ?? null,
      total: o.total ?? null,
      currency: o.currency ?? null,
      address: o.address ?? o.zoneName ?? null,
      items: Array.isArray(o.items) ? (o.items as { quantity: number; name: string }[]).map((i) => ({ quantity: i.quantity, name: i.name })) : [],
    },
  });
}
