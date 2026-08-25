// ============================================================================
// Kivo Delivery Network — Day 2 presence GPS push (token-scoped, public).
// POST { lat, lng } only while the driver is ONLINE. OFFLINE rejects the ping
// so closing the toggle actually stops posting. Page-open browser GPS only.
// ============================================================================

import { NextResponse } from "next/server";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";
import { rateLimit } from "@/lib/rate-limit";
import { classifyPresence } from "@/lib/delivery/driver-presence";
import { pushPresenceLocationByToken } from "@/lib/db/driver-presence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 180;
const RATE_WINDOW_MS = 60 * 1000;

export async function POST(req: Request, { params }: { params: { token: string } }) {
  if (!ENABLE_DELIVERY_TRACKING) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const rl = rateLimit(`presence-location:${params.token}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  try {
    const r = await pushPresenceLocationByToken(params.token, lat, lng);
    if (!r.ok) {
      const code = r.error === "not_found" ? 404 : r.error === "offline" ? 409 : 400;
      return NextResponse.json({ error: r.error }, { status: code });
    }
    const classified = classifyPresence({
      status: r.row.status,
      lastSeenAt: r.row.last_seen_at,
      recordedAt: r.row.recorded_at,
      lat: r.row.lat,
      lng: r.row.lng,
    });
    return NextResponse.json({
      ok: true,
      lat: r.row.lat,
      lng: r.row.lng,
      recorded_at: r.row.recorded_at,
      last_seen_at: r.row.last_seen_at,
      classified: { kind: classified.kind, fresh: classified.fresh, ageMs: classified.ageMs },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "not_configured") return NextResponse.json({ error: "not_configured" }, { status: 503 });
    return NextResponse.json({ error: "presence_failed" }, { status: 502 });
  }
}
