// ============================================================================
// MaitreAI — MIZAN reviewer voice-recording API (token-scoped, private) — SERVER
// ONLY. WO-MIZAN-VOICE addendum. An OPTIONAL per-item recording of how the reviewer
// would say Khalid's line ("سجّل بصوتك النطق الصحيح"). Uploaded + played back only via
// this token-authed route into the PRIVATE mizan-recordings bucket — reviewer personal
// data, never public, served back only to that reviewer's own token.
//
//   POST ?scenarioId=S1-01  (body = audio blob)  → upsert the recording (re-record replaces)
//   GET                     → JSON list of this reviewer's recorded scenarioIds (resume)
//   GET  ?scenarioId=S1-01  → stream this reviewer's own recording (no-store, private)
//
// Path is keyed {packetId}/{reviewer_hash}/{scenarioId} → a fixed path per cell, so a
// re-record overwrites (upsert like a score). Recordings are NOT scored / NOT a gate input.
// Inert (404) when ENABLE_MIZAN_PANEL is off. Optional: a failure here never blocks scoring.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ENABLE_MIZAN_PANEL } from "@/lib/feature-flags";
import { rateLimit } from "@/lib/rate-limit";
import { hashToken } from "@/lib/mizan/token";
import { activePacketId, reviewerPacket, validateReviewerToken } from "@/lib/mizan/active-packet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "mizan-recordings";
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB — a short voice clip; reject anything larger
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60 * 1000;

function notFound() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}
/** A recordable item = a real reply item (not the voice_compare pick). */
function isRecordable(scenarioId: string): boolean {
  const it = reviewerPacket().items.find((i) => i.scenarioId === scenarioId);
  return !!it && it.kind !== "voice_compare";
}
const objectPath = (hash: string, scenarioId: string) => `${activePacketId()}/${hash}/${scenarioId}`;

export async function POST(req: Request, { params }: { params: { token: string } }) {
  if (!ENABLE_MIZAN_PANEL) return notFound();
  if (!validateReviewerToken(params.token)) return notFound();
  const tokenHash = hashToken(params.token);

  const rl = rateLimit(`mizan-rec:${tokenHash}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });

  const scenarioId = new URL(req.url).searchParams.get("scenarioId") || "";
  if (!isRecordable(scenarioId)) return NextResponse.json({ error: "unknown_scenario" }, { status: 400 });

  const contentType = req.headers.get("content-type") || "audio/webm";
  if (!contentType.startsWith("audio/")) return NextResponse.json({ error: "bad_content_type" }, { status: 415 });

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (buf.length > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { error } = await admin.storage.from(BUCKET).upload(objectPath(tokenHash, scenarioId), buf, { contentType, upsert: true });
  if (error) return NextResponse.json({ error: "save_failed" }, { status: 500 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store, private" } });
}

export async function GET(req: Request, { params }: { params: { token: string } }) {
  if (!ENABLE_MIZAN_PANEL) return notFound();
  if (!validateReviewerToken(params.token)) return notFound();
  const tokenHash = hashToken(params.token);

  const rl = rateLimit(`mizan-rec:${tokenHash}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const scenarioId = new URL(req.url).searchParams.get("scenarioId");

  // No scenarioId → list THIS reviewer's recorded scenarioIds (for resume UI).
  if (!scenarioId) {
    const { data, error } = await admin.storage.from(BUCKET).list(`${activePacketId()}/${tokenHash}`, { limit: 100 });
    if (error) return NextResponse.json({ error: "read_failed" }, { status: 500 });
    const recordings = (data ?? []).map((o: { name: string }) => o.name);
    return NextResponse.json({ ok: true, recordings }, { headers: { "Cache-Control": "no-store, private" } });
  }

  // Stream this reviewer's own recording (scoped to their token hash — no cross-reviewer read).
  const { data, error } = await admin.storage.from(BUCKET).download(objectPath(tokenHash, scenarioId));
  if (error || !data) return notFound();
  const bytes = Buffer.from(await data.arrayBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: { "Content-Type": data.type || "audio/webm", "Cache-Control": "no-store, private" },
  });
}
