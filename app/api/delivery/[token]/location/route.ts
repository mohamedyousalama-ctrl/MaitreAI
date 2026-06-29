// ============================================================================
// MaitreAI — Driver location push (token-scoped, public) — SERVER ONLY.
// POST { lat, lng } — stores the latest point + breadcrumb trail. App-ready:
// a native driver app posts here on the same cadence. Honest by design: the
// driver page only posts WHILE OPEN with sharing on.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushLocationByToken } from "@/lib/db/delivery";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// T5 — abuse throttle. Driver location posts via watchPosition (maximumAge 4000)
// run at most ~1/sec = ≤60/min; cap at 180/min per token (3× headroom) so the
// real GPS cadence never throttles but a flood does.
const RATE_LIMIT = 180;
const RATE_WINDOW_MS = 60 * 1000;

export async function POST(req: Request, { params }: { params: { token: string } }) {
  if (!ENABLE_DELIVERY_TRACKING) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const rl = rateLimit(`delivery-location:${params.token}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
    );
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const r = await pushLocationByToken(admin, params.token, lat, lng);
  if (!r.ok) {
    const code = r.error === "not_found" ? 404 : r.error === "completed" ? 410 : 400;
    return NextResponse.json({ error: r.error }, { status: code });
  }
  return NextResponse.json({ ok: true });
}
