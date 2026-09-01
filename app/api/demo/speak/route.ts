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
import { verifySpeechTicket } from "@/lib/demo/speech-ticket";
import { isDemoHost } from "@/lib/demo/config";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One synthesis, streamed. Far shorter than a turn, but the provider still has to finish
// speaking a 600-character reply before the body closes.
export const maxDuration = 60;

// A LEGITIMATE CALLER NEEDS ONE OF THESE PER TURN. Browsers sometimes re-request a media
// URL (a retry, a second range probe), so the allowance is a few, not one — but it is small
// on purpose. A ticket is replayable until it expires, and each replay is a real synthesis
// we would be billed for even though the ledger already recorded it once. This bounds that
// window to strictly less than what the same IP can already spend through the POST route,
// which is the honest test for whether a new surface widens the exposure.
const SPEAK_PER_IP = 10;
const SPEAK_WINDOW_MS = 60_000;

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
  const rl = rateLimit(`demo-speak:${ip}`, SPEAK_PER_IP, SPEAK_WINDOW_MS);
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
      // Read by the client's diagnostics, and by anyone reading a HAR to find out which
      // voice actually answered. No text, no visitor words.
      "X-Kivo-Voice": speech.voiceId,
      "X-Kivo-Model": speech.model,
    },
  });
}
