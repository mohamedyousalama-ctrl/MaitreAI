// ============================================================================
// Kivo — WHAT KHALID SAYS WHEN THE LINE OPENS.
//
// The call screen used to open straight into "listening": Khalid said nothing and the
// visitor had to speak first into a silent line. Nobody answers a phone that way. This mints
// the opening greeting, once, as the call is opening.
//
// WHY IT IS ITS OWN ROUTE AND NOT PART OF THE CAPABILITY PROBE.
//
// The obvious place was `/api/demo/capabilities`, which the call screen already calls a
// moment earlier — no extra round trip, minted exactly when a call opens. It was written
// that way first and a proof rejected it, correctly, on two counts:
//
//   IT WOULD HAVE LEAKED. That route's own header promises ONE boolean — "not which
//   provider, not which voice, not whether a key exists" — and a speech ticket carries the
//   registered voice id inside its payload. One GET, no call, and the voice id is out.
//
//   AND IT WOULD HAVE MADE A FREE ROUTE EXPENSIVE. The capability probe's allowance is FOUR
//   TIMES the turn cap, granted on the stated grounds that "the handler does no I/O, so this
//   is not a spend lever in the way a turn is". Minting a synthesis there makes that sentence
//   false and the allowance wrong by the same factor — a paid endpoint wearing a free
//   endpoint's limit. That is the exact shape of the bound this repo already got backwards
//   once on /api/demo/speak.
//
// So: one more round trip, at the moment a call opens, with a limit sized for something that
// spends money. A greeting is worth a round trip; it is not worth widening a probe.
//
// THE TEXT IS NEVER THE CALLER'S. `/api/demo/speak` will only say something the server
// signed — the alternative is a free text-to-speech oracle in our own voice — so this hands
// back a URL the browser can play and cannot edit. See lib/demo/call-greeting.ts.
// ============================================================================

import { NextResponse } from "next/server";
import { demoCallGreeting } from "@/lib/demo/call-greeting";
import { demoVoiceAudible } from "@/lib/demo/voice-out";
import { isDemoHost, DEMO_PER_IP_TURNS, DEMO_WINDOW_MS } from "@/lib/demo/config";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Same in-handler host gate as every other demo route.
  if (!isDemoHost(req.headers.get("host"))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // THE TURN CAP, NOT THE PROBE'S. Every hit here books a synthesis, so this belongs on the
  // same allowance as the thing that spends: one greeting per call, and a caller cannot open
  // more calls in an hour than they can take turns.
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0]!.trim() || "unknown";
  const rl = rateLimit(`demo-greet:${ip}`, DEMO_PER_IP_TURNS, DEMO_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json({ greeting: null }, { status: 200, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }

  // ONLY WHEN A CALL CAN ACTUALLY HAPPEN. Minting for a visitor whose voice is switched off
  // books a synthesis for a screen that is about to say "unavailable".
  if (!demoVoiceAudible()) {
    return NextResponse.json({ greeting: null }, { headers: { "Cache-Control": "no-store" } });
  }

  // The session id is the caller's own, echoed from the query string and never trusted: it is
  // used ONLY to bind the ticket to the session that will redeem it, so a wrong value makes
  // the greeting unplayable and nothing else.
  const sid = new URL(req.url).searchParams.get("s");

  return NextResponse.json(
    { greeting: demoCallGreeting(sid) },
    // A signed, one-minute, session-bound ticket has no business in any cache.
    { headers: { "Cache-Control": "no-store" } }
  );
}
