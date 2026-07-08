// ============================================================================
// MaitreAI — MIZAN hosted reviewer API (token-scoped, public) — SERVER ONLY.
// WO-KHALID-STEP5B. The token IS the auth (no login), scoped to one reviewer.
//   POST { scenarioId, suiteId?, dimension, score, notes? } → upsert one score cell
//   GET  → this reviewer's saved cells (restore progress on resume)
// Inert (404) when ENABLE_MIZAN_PANEL is off. Writes go server-side via the
// service-role admin client after the token hash authenticates; the DB has RLS
// with no policy, so this route is the only door.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ENABLE_MIZAN_PANEL } from "@/lib/feature-flags";
import { rateLimit } from "@/lib/rate-limit";
import { hashToken } from "@/lib/mizan/token";
import { activePacketId, reviewerPacket, validateReviewerToken, validateSubmission } from "@/lib/mizan/active-packet";
import { upsertReview, getReviewsForReviewer } from "@/lib/db/mizan-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Scoring is a tap-per-dimension action; a full pass is a few dozen saves. Cap at
// 120/min per token — far above any real reviewer, enough to blunt scraping/abuse.
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60 * 1000;

function notFound() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
  if (!ENABLE_MIZAN_PANEL) return notFound();
  // Unknown token → 404 (never reveal whether the surface exists to a bad token).
  if (!validateReviewerToken(params.token)) return notFound();
  // Key both the throttle and DB scoping by the token HASH, never the raw token
  // credential (which stays only in the URL). One hash, two uses.
  const tokenHash = hashToken(params.token);

  const rl = rateLimit(`mizan:${tokenHash}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const check = validateSubmission(reviewerPacket(), body);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const r = await upsertReview(admin, {
    packetId: activePacketId(),
    tokenHash,
    sub: check.value,
  });
  if (!r.ok) return NextResponse.json({ error: "save_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request, { params }: { params: { token: string } }) {
  if (!ENABLE_MIZAN_PANEL) return notFound();
  if (!validateReviewerToken(params.token)) return notFound();
  const tokenHash = hashToken(params.token);

  const rl = rateLimit(`mizan:${tokenHash}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  try {
    const rows = await getReviewsForReviewer(admin, {
      packetId: activePacketId(),
      tokenHash,
    });
    // Token-scoped reviewer data: never let a browser/proxy retain it.
    return NextResponse.json({ ok: true, rows }, { headers: { "Cache-Control": "no-store, private" } });
  } catch {
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }
}
