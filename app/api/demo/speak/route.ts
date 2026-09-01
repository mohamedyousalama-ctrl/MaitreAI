// ============================================================================
// Kivo — THE DEMO'S SPOKEN REPLY, STREAMED WHILE IT IS STILL BEING SPOKEN.
//
// WHAT THIS IS FOR. `/api/demo/voice` runs the turn: transcribe, think, decide whether the
// reply may be said aloud. Until now it also SYNTHESIZED — buffering the entire audio,
// base64-ing it, and returning it inside the turn's JSON. Nothing played until the last
// byte of the last word existed. Measured on the live demo:
//
//   intake=61-1173  vocab=0-805  stt=217-806  brain=4775-6244  tts=1807-5472  total=8551-11015ms
//
// So between 1.8 and 5.5 seconds of a caller holding a phone to their ear were spent
// waiting for audio the provider had already started producing. This route hands the
// provider's bytes to the browser as they arrive, so playback starts in a few hundred
// milliseconds instead.
//
// WHY IT IS A SEPARATE GET, WHICH IS THE UNUSUAL PART. Progressive playback on an iPhone
// has exactly one path: an <audio> element pointed at a URL. iOS Safari has no
// MediaSource, so a stream read with `fetch` cannot be fed to a player there, and iPhones
// are most of who this page is shown to. An <audio> element issues a plain GET — it cannot
// POST a turn and it cannot be trusted to carry a reply.
//
// SO THE TEXT IS NOT AN INPUT. The obvious version of this endpoint — `/speak?text=…` — is
// a free, unauthenticated text-to-speech oracle on a public marketing page, in our name, on
// our card, in our registered voice, routing around every control in this repo because all
// of them sit on the POST path an <audio> element never touches. Anyone could make Khalid
// say anything and screenshot it.
//
// Instead the turn route mints a signed TICKET that CONTAINS the text it already approved,
// and this route speaks that and nothing else. See lib/demo/speech-ticket.ts for what each
// control is actually worth. Three of them are re-applied HERE rather than trusted:
//
//   • the ticket's signature, expiry and session binding;
//   • the text-only refusals, read again from the text itself — a valid signature proves we
//     wrote this, not that we should say it;
//   • the voice, which is built from the registry by `buildElevenLabsRequest` and never
//     from anything in the request.
//
// AND IT FAILS TO SILENCE, NEVER TO A SUBSTITUTE. Every refusal and every provider failure
// answers with no audio. The caller is already looking at the full reply as text on the
// call screen — that is the compensating control this whole channel runs on — so silence
// costs a spoken sentence, while a wrong voice or a leaked oracle costs something we cannot
// take back.
// ============================================================================

import { NextResponse } from "next/server";
import { elevenlabsSpeechStream } from "@/lib/ai/tts/elevenlabs";
import { verifySpeechTicket, SPEECH_TICKET_TTL_MS } from "@/lib/demo/speech-ticket";
import { createAdminClient } from "@/lib/supabase/admin";
import { mustWrite } from "@/lib/db/checked";
import { isDemoHost, DEMO_RESTAURANT_ID, DEMO_WINDOW_MS } from "@/lib/demo/config";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One synthesis, streamed. Far shorter than a turn, but the provider still has to finish
// speaking a 600-character reply before the body closes.
export const maxDuration = 60;

// ── HOW MUCH THIS CAN COST, WITH THE ARITHMETIC WRITTEN DOWN ───────────────
//
// A ticket is replayable until it expires, and every replay is a REAL synthesis ElevenLabs
// bills us for. The first version bounded it per-IP at 10 per MINUTE and its comment claimed
// that was "strictly less than what the same IP can already spend through the POST route".
// That was inverted, and by 30x: the POST route allows `DEMO_PER_IP_TURNS = 20` per
// `DEMO_WINDOW_MS = one hour`, and 10/minute is 600/hour. A bound stated backwards is worse
// than no bound, because it is the sentence the next person reads instead of checking.
//
// TWO LIMITS, EACH DOING A DIFFERENT JOB.
//
//   PER TICKET is the one that actually stops replay, because replay is per-ticket by
//   definition. A legitimate player fetches a given URL ONCE; the allowance is two so a
//   browser that retries a failed request still gets its audio. THREE, not two: a
//   legitimate player needs one; iOS Safari plausibly needs two (a range probe and the real
//   fetch — the behaviour nobody here can test); one transient retry needs three. At two,
//   the first thing that goes wrong past a Safari probe is a 429, which the client now reads
//   as a playback failure, and two of those in a row end the call telling a prospect the
//   voice is broken — our own limiter causing the worst outcome on this page, on the browser
//   the whole design was built around. Being wrong the other way is now cheap: a repeat past
//   the allowance is refused, every repeat that IS served is written to the ledger, and the
//   per-IP bound still binds at 60/hour.  in this route's timing line is the
//   evidence that settles it on real iPhone traffic.
//
//   PER IP is the outer bound, now on the SAME window as the POST route so the two can be
//   compared at all. A caller can legitimately reach at most one GET per spoken turn, i.e.
//   20/hour; 60 leaves room for browser retries and range probes while staying the same
//   order as the ~40 syntheses/hour the POST route already permits that IP.
//
// AND BOTH COUNTERS ARE PER-INSTANCE. `lib/rate-limit.ts` says so in its own header: the
// buckets are process-local and NOT shared across concurrent Vercel instances. So with N
// warm instances the real ceiling is 20 x 2N rather than 20 x 2, and because `isRepeatFetch`
// is per-instance too, the FIRST fetch on each instance is booked at mint but not re-booked
// here — up to N-1 syntheses per ticket can still miss the ledger.
//
// An earlier draft said the per-IP limit "bounds that". It cannot: it is the same
// process-local mechanism, so it multiplies by N alongside the thing it was supposed to
// cap. Written down rather than fixed because the honest fix is a durable check on the
// REPEAT path — which already pays a database round trip, so it costs the fast path
// nothing — and that is a change worth making on its own rather than folded into this one.
//
// AND A REPEAT FETCH IS PUT ON THE LEDGER. The turn that minted the ticket books the first
// synthesis; a second fetch is money `lib/monitoring/sweep.ts` would otherwise never see.
// The write happens ONLY on a repeat, so the common path — the one this whole endpoint
// exists to make fast — pays nothing for it.
const SPEAK_PER_IP = 60;
const SPEAK_PER_TICKET = 3;

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

/** No audio, and say why in a header a developer can read without opening a log. */
function silent(reason: string, status = 204): NextResponse {
  // 204, not an error page: the client's job on any of these is identical — show the text,
  // do not end the call, do not report a broken voice. A 4xx invites a retry loop on an
  // <audio> element, which is the one thing that turns a refusal into a bill.
  return new NextResponse(null, { status, headers: { "X-Kivo-Silent": reason } });
}

export async function GET(req: Request) {
  // Same in-handler host gate as every other demo route: no session, no tenant, no role.
  if (!isDemoHost(req.headers.get("host"))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const ip = clientIp(req);
  const rl = rateLimit(`demo-speak:${ip}`, SPEAK_PER_IP, DEMO_WINDOW_MS);
  if (!rl.ok) {
    return new NextResponse(null, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSec), "X-Kivo-Silent": "rate_limited" },
    });
  }

  const url = new URL(req.url);
  const verdict = verifySpeechTicket(url.searchParams.get("t"), {
    // The session the REQUEST arrived on. A ticket minted with one may only be redeemed on
    // it — see the ranking of controls in speech-ticket.ts, which is honest that this is a
    // transferability bound rather than authentication.
    sid: url.searchParams.get("s"),
  });
  if (!verdict.ok) {
    // The reason is ours, not the visitor's words, and it is the difference between "the
    // key is missing" and "someone is replaying a stale link".
    console.warn(`[demo/speak] refused: ${verdict.reason}`);
    return silent(verdict.reason);
  }

  // PER-TICKET, AND ONLY AFTER IT VERIFIED. Counting an unverified string would let anyone
  // exhaust an allowance for a ticket they do not hold. Keyed on the SIGNATURE, which is
  // short, unforgeable without the key, and already public in this URL — so nothing secret
  // reaches the limiter or its keyspace.
  const sig = String(url.searchParams.get("t") ?? "").split(".")[1] ?? "";
  const perTicket = rateLimit(`demo-speak-ticket:${sig}`, SPEAK_PER_TICKET, SPEECH_TICKET_TTL_MS);
  if (!perTicket.ok) {
    console.warn("[demo/speak] refused: ticket replayed");
    return new NextResponse(null, {
      status: 429,
      headers: { "Retry-After": String(perTicket.retryAfterSec), "X-Kivo-Silent": "ticket_replayed" },
    });
  }
  // The first fetch of a ticket is already on the ledger, booked by the turn that minted it.
  // Anything after that is a synthesis nobody has accounted for.
  const isRepeatFetch = perTicket.remaining < SPEAK_PER_TICKET - 1;

  // WHERE THE SYNTHESIS TIME ACTUALLY IS NOW. Moving the wait out of the turn moved it out
  // of the turn's timing line too, and this route logged nothing at all on success — so the
  // instrument added specifically to find the five seconds went blind on the one segment
  // this whole endpoint exists to shorten. `headers` is the provider's time-to-first-byte,
  // which is what a caller actually waits for; the rest streams while they listen.
  const tSpeak = Date.now();
  let speech;
  try {
    // THE VOICE COMES FROM THE TICKET, WHICH GOT IT FROM THE REGISTRY. Never from the query
    // string, and never re-read from env here: two places reading the same variable is how
    // the value that was checked and the value that was spoken stopped being the same value.
    speech = await elevenlabsSpeechStream(verdict.payload.text, {
      voiceId: verdict.payload.voiceId,
      // MP3. Safari cannot decode Ogg Opus, and this endpoint exists to be played in a
      // browser — the previous default produced a successful synthesis, delivered bytes, an
      // empty log and total silence on every iPhone.
      format: "mp3",
    });
  } catch (e) {
    // SAY WHY. A revoked key, a plan without the pinned model, an unreachable dictionary and
    // an exhausted quota are four different fixes, and one word for all of them sends
    // someone hunting the wrong one. Flattened and clipped: this reaches a log, and a
    // provider body is not a log line. The message never echoes the key.
    const why = (e instanceof Error ? e.message : String(e)).replace(/[\r\n\t]+/g, " ");
    console.warn(`[demo/speak] synthesis failed: ${why.slice(0, 300)}`);
    // NO FALLBACK VOICE IS BOUGHT. On WhatsApp, falling back to `onyx` is right — a customer
    // waiting on an order is better served by any voice than none. On a sales page the voice
    // IS the thing being demonstrated, so a stranger reading Najdi Arabic is worse than
    // silence, and the caller still has the full reply on the screen in front of them.
    return silent("synth_failed");
  }

  // A REPEAT FETCH IS MONEY THE LEDGER HAS NOT SEEN. `lib/monitoring/sweep.ts` sums
  // `agent_runs.cost_usd`, and the mint booked exactly one synthesis; this is the second.
  // Written BEFORE the stream is handed back, because work scheduled after a serverless
  // response is not guaranteed to run — and an unrecorded charge is the failure mode this
  // repo has already paid for twice ("25 turns → $0.00").
  //
  // A failure to record does NOT refuse the audio: the money is already spent either way,
  // and staying silent would cost the caller their answer without saving a cent.
  if (isRepeatFetch) {
    try {
      const admin = createAdminClient();
      if (admin) {
        await mustWrite<{ id: string }>(
          admin.from("agent_runs").insert({
            restaurant_id: DEMO_RESTAURANT_ID,
            conversation_id: null,
            trigger: "voice_tts",
            input: null,
            output: null,
            model: speech.model,
            adapter: "elevenlabs",
            cost_usd: speech.costUsd,
          }).select("id"),
          "demo_speak.tts_cost_replay",
          { exactRows: 1 },
        );
      }
    } catch (e) {
      console.error("[demo/speak] replay spend accounting failed", e);
    }
  }

  console.log(
    `[demo/speak] timing headers=${Date.now() - tSpeak}ms chars=${speech.chars} ` +
      `model=${speech.model} repeat=${isRepeatFetch}`
  );

  return new NextResponse(speech.stream, {
    status: 200,
    headers: {
      "Content-Type": speech.mime,
      // NO SEEKING. We are proxying a provider stream we cannot rewind, so range requests
      // must not be advertised — a player told it can seek and then handed a non-range
      // response is a player that may stall. Said explicitly rather than left to a default.
      "Accept-Ranges": "none",
      // Never cached anywhere. A per-turn synthesis behind a signed ticket has no business
      // in a CDN, a proxy, or a browser's disk cache.
      "Cache-Control": "no-store, no-transform",
      // FOR A HUMAN READING A HAR, and nothing else. An earlier comment said "read by the
      // client's diagnostics" — which is not merely unimplemented but unreachable: an
      // <audio> element does not expose response headers to JavaScript at all, and an
      // <audio> element is the only thing that fetches this URL. Kept because it answers
      // "which voice actually spoke?" from a network log without opening a server log. No
      // text, no visitor words.
      "X-Kivo-Voice": speech.voiceId,
      "X-Kivo-Model": speech.model,
    },
  });
}
