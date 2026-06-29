// ============================================================================
// MaitreAI — Driver status update (token-scoped, public) — SERVER ONLY.
// The token IS the auth, scoped to one delivery. App-ready: a native driver app
// calls this exact endpoint. POST { status: picked_up|on_the_way|delivered|failed }.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateDeliveryStatusByToken } from "@/lib/db/delivery";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// T5 — abuse throttle. Status is a button-press action (a few per delivery);
// cap at 30/min per token — far above any legitimate driver use.
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 1000;

export async function POST(req: Request, { params }: { params: { token: string } }) {
  if (!ENABLE_DELIVERY_TRACKING) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const rl = rateLimit(`delivery-status:${params.token}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
    );
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const status = String(body.status ?? "");
  const r = await updateDeliveryStatusByToken(admin, params.token, status);
  if (!r.ok) {
    const code = r.error === "not_found" ? 404 : r.error === "completed" ? 410 : 400;
    return NextResponse.json({ error: r.error }, { status: code });
  }
  return NextResponse.json({ ok: true, status: r.status });
}
