// ============================================================================
// Kivo Delivery Network — Day 2 public presence API (token-scoped).
// GET current ONLINE/OFFLINE + last-seen. POST { status } to go ONLINE/OFFLINE.
// Independent of any delivery job. Token IS the auth (not a raw driver id).
// ============================================================================

import { NextResponse } from "next/server";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";
import { rateLimit } from "@/lib/rate-limit";
import { classifyPresence } from "@/lib/delivery/driver-presence";
import {
  getPresenceByToken,
  presencePublicView,
  setPresenceStatusByToken,
} from "@/lib/db/driver-presence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GET_LIMIT = 60;
const POST_LIMIT = 30;
const WINDOW_MS = 60 * 1000;

function mapError(e: unknown): NextResponse {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "not_configured") return NextResponse.json({ error: "not_configured" }, { status: 503 });
  return NextResponse.json({ error: "presence_failed" }, { status: 502 });
}

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  if (!ENABLE_DELIVERY_TRACKING) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const rl = rateLimit(`presence-get:${params.token}`, GET_LIMIT, WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
    );
  }
  try {
    const row = await getPresenceByToken(params.token);
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const classified = classifyPresence({
      status: row.status,
      lastSeenAt: row.last_seen_at,
      recordedAt: row.recorded_at,
      lat: row.lat,
      lng: row.lng,
    });
    return NextResponse.json(
      { presence: presencePublicView(row), classified: { kind: classified.kind, fresh: classified.fresh, ageMs: classified.ageMs } },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (e) {
    return mapError(e);
  }
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
  if (!ENABLE_DELIVERY_TRACKING) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const rl = rateLimit(`presence-status:${params.token}`, POST_LIMIT, WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
    );
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const r = await setPresenceStatusByToken(params.token, String(body.status ?? ""));
    if (!r.ok) {
      const code = r.error === "not_found" ? 404 : 400;
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
      status: r.row.status,
      last_seen_at: r.row.last_seen_at,
      classified: { kind: classified.kind, fresh: classified.fresh, ageMs: classified.ageMs },
    });
  } catch (e) {
    return mapError(e);
  }
}
