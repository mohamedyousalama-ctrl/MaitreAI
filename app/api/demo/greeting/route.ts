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
import { createAdminClient } from "@/lib/supabase/admin";
import { mustWrite } from "@/lib/db/checked";
import { DEMO_RESTAURANT_ID } from "@/lib/demo/config";
import { demoCallGreeting } from "@/lib/demo/call-greeting";
import { demoVoiceAudible } from "@/lib/demo/voice-out";
import { isDemoHost, DEMO_PER_IP_TURNS, DEMO_WINDOW_MS, DEMO_GLOBAL_DAILY_TURNS, ipBucket, globalBucket } from "@/lib/demo/config";
import { rateLimit } from "@/lib/rate-limit";

/** Same one-liner the three sibling demo routes each declare. */
function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Same in-handler host gate as every other demo route.
  if (!isDemoHost(req.headers.get("host"))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // THE TURN CAP'S SIZE, IN ITS OWN BUCKET — and the difference matters, so say it plainly.
  // Every hit here books a synthesis, so the allowance is sized like the thing that spends
  // rather than like the capability probe's 4×. It is NOT the same bucket: `demo-greet:` is
  // counted separately from turns, so a caller gets this many greetings ON TOP of their
  // turns, not out of them. An earlier version of this comment said "the same allowance",
  // which is a different and stronger claim than the code makes.
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

  // THE DURABLE GUARD, NOT JUST THE PROCESS-LOCAL LIMITER — and this route was outside it.
  //
  // `rateLimit` resets on a cold start and is per-instance. `/api/demo/turn` and
  // `/api/demo/voice` both consume `kv_demo_try_consume`, which carries the per-IP cap, the
  // GLOBAL daily ceiling, and — the part that matters most — the operator KILL SWITCH. With
  // the demo switched off in the database, this route still minted and spoke a paid greeting
  // before the first turn came back 503. Greetings also had no global ceiling at all.
  //
  // `/api/demo/speak` is safe without this because a ticket implies a guarded turn already
  // paid for it. This route mints its own ticket, so that invariant did not hold here.
  //
  // FAILS CLOSED, like the two routes it now matches: no guard, no greeting. The call still
  // opens — the client treats a null greeting as the old silent-line behaviour.
  const admin = createAdminClient();
  if (!admin) {
    console.error("[demo/greeting] spend guard unavailable — no admin client");
    return NextResponse.json({ greeting: null }, { headers: { "Cache-Control": "no-store" } });
  }
  const { data: guard, error: guardErr } = await admin
    .rpc("kv_demo_try_consume", {
      p_ip_bucket: ipBucket(clientIp(req)),
      p_global_bucket: globalBucket(),
      p_ip_limit: DEMO_PER_IP_TURNS,
      p_global_limit: DEMO_GLOBAL_DAILY_TURNS,
    })
    .maybeSingle<{ allowed: boolean; reason: string | null }>();
  if (guardErr || !guard || !guard.allowed) {
    return NextResponse.json({ greeting: null }, { headers: { "Cache-Control": "no-store" } });
  }

  // The session id is the caller's own, echoed from the query string and never trusted: it is
  // used ONLY to bind the ticket to the session that will redeem it, so a wrong value makes
  // the greeting unplayable and nothing else.
  const sid = new URL(req.url).searchParams.get("s");
  const greeting = demoCallGreeting(sid);

  // THE MONEY GOES ON THE LEDGER HERE, AND UNTIL NOW IT WENT NOWHERE.
  //
  // This route was 73 lines with no database client and no write of any kind, and the
  // tenant-isolation report said so approvingly. What that missed is that the route BUYS
  // something: the ticket it mints is redeemed by the browser at /api/demo/speak, which
  // treats the first fetch as already paid for by whoever minted it — correctly, for a turn,
  // because /api/demo/voice writes the row. Nobody wrote it here. So every greeting on the
  // only endpoint anyone on the internet can hit was a real ElevenLabs charge that
  // lib/monitoring/sweep.ts — which sums agent_runs.cost_usd for the daily spend alert —
  // could not see. The alert cannot fire on money it does not know about.
  //
  // NOT FAIL-CLOSED, deliberately, and the same way /api/demo/voice treats its own TTS row:
  // a ledger outage must not take the greeting down. The failure is logged, loudly.
  // The admin client was built above for the spend guard; the ledger reuses it.
  if (greeting?.spend) {
    try {
      await mustWrite<{ id: string }>(
        admin.from("agent_runs").insert({
          restaurant_id: DEMO_RESTAURANT_ID,
          conversation_id: null,
          trigger: "voice_tts",
          input: null,
          output: null,
          model: greeting.spend.model,
          adapter: greeting.spend.adapter,
          cost_usd: greeting.spend.costUsd,
        }).select("id"),
        "demo_greeting.tts_cost",
        { exactRows: 1 },
      );
    } catch (e) {
      console.error("[demo/greeting] TTS spend accounting failed", e);
    }
  }

  return NextResponse.json(
    { greeting },
    // A signed, one-minute, session-bound ticket has no business in any cache.
    { headers: { "Cache-Control": "no-store" } }
  );
}
