// ============================================================================
// MaitreAI — WO-DELIVERY-D2: per-stop COD «حصّلت» flag (token-scoped, public).
// The token IS the auth, scoped to one delivery (a run stop). POST { collected }.
// Sets the UI/audit flag on the delivery row ONLY — it complements the
// cod_collections ledger, never replaces it (captureCodOnDelivered stays the money
// record). Same deploy gate as the other driver-token endpoints.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setCodCollectedByToken } from "@/lib/db/delivery";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 1000;

export async function POST(req: Request, { params }: { params: { token: string } }) {
  if (!ENABLE_DELIVERY_TRACKING) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const rl = rateLimit(`delivery-cod:${params.token}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const collected = body.collected !== false; // default true (the tap marks collected)
  const r = await setCodCollectedByToken(admin, params.token, collected);
  if (!r.ok) {
    const code = r.error === "not_found" ? 404 : 400;
    return NextResponse.json({ error: r.error }, { status: code });
  }
  return NextResponse.json({ ok: true, collected });
}
