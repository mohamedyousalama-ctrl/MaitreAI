// ============================================================================
// MaitreAI — WHY A CALL WENT SILENT, REPORTED BY THE ONE WITNESS THAT KNOWS.
//
// The call screen already works out exactly why a reply produced no sound — a rejected
// play(), a decode error, a stall with no progress, a barge that landed before the first
// syllable — and then tells NOBODY. Those three findings go to `console.warn`, which lives
// in a browser console on someone else's phone.
//
// So a founder says "he was silent on the second message" and the server logs show a reply
// composed and audio synthesized in 918ms: everything server-side succeeded, and the one
// fact that would close the case never left the device. Twice today a client-side guess
// about this call screen turned out to be wrong; this replaces the third guess with a
// measurement.
//
// WHAT IT ACCEPTS, AND WHY IT IS SO NARROW. A CLOSED ENUM and two small integers. No text
// from the caller ever reaches a log line: a free-text `reason` on a public endpoint is a
// log-injection primitive and an unbounded log bill, and this route exists on the one
// origin anyone on the internet can reach. An unknown reason is counted as
// `unknown_reason`, never echoed.
//
// It spends NOTHING — no synthesis, no model call, no database write. That is why it can be
// rate-limited by IP alone and does not consume the demo's durable turn allowance: a
// diagnostic that competes with the thing it is diagnosing would be self-defeating.
// ============================================================================

import { NextResponse } from "next/server";
import { isDemoHost, DEMO_PER_IP_TURNS, DEMO_WINDOW_MS } from "@/lib/demo/config";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every way this screen can end a turn with no sound. Closed on purpose — see the header.
 *  These names match the branches in app/demo/DemoPhone.tsx that already detect them. */
const REASONS = new Set([
  "play_rejected",   // play() threw — Safari autoplay refusal is the usual cause
  "element_error",   // the <audio> element failed to decode what it was given
  "stalled",         // no playback progress inside STALL_MS
  "barged_early",    // the visitor spoke over it before the first syllable landed
  "no_progress",     // it "ended" without ever reporting progress — a degenerate clip
]);

export async function POST(req: Request): Promise<NextResponse> {
  if (!isDemoHost(req.headers.get("host"))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0]!.trim() || "unknown";
  // The turn cap, on a route that buys nothing — enough to hear about a broken call several
  // times, not enough to be a log firehose.
  if (!rateLimit(`demo-silent:${ip}`, DEMO_PER_IP_TURNS, DEMO_WINDOW_MS).ok) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const raw = String(o.reason ?? "");
  const reason = REASONS.has(raw) ? raw : "unknown_reason";
  // Clamped, never printed as given: a number is still a log line's width.
  const num = (v: unknown, cap: number) => {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) && n >= 0 ? Math.min(n, cap) : -1;
  };
  const turn = num(o.turn, 99);
  const chars = num(o.chars, 9999);
  const waitedMs = num(o.waitedMs, 600_000);
  // `detail` is the ONE piece of provider vocabulary worth keeping — a DOMException name
  // like "NotAllowedError" is the difference between an autoplay policy and a decode
  // failure. Allow-listed to word characters and clipped, so it cannot carry a newline into
  // the log or grow the line.
  const detail = String(o.detail ?? "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 40);

  console.warn(
    `[demo/silent] reason=${reason} turn=${turn} chars=${chars} waitedMs=${waitedMs}` +
      (detail ? ` detail=${detail}` : "")
  );
  return NextResponse.json({ ok: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
