// ============================================================================
// Kivo — PUBLIC demo voice note. Browser audio → transcript → the real Brain.
//
// Same three controls as /api/demo/turn and for the same reason (no session, no
// tenant, no role): in-handler host gate, the durable spend guard, and a pinned
// synthetic tenant. Plus two this route needs specifically:
//
//   SIZE CAP. Audio is a far cheaper way to spend our money than text — STT bills
//   per MINUTE, so an hour-long upload costs ~360x a normal note. Capped before a
//   single byte reaches a provider.
//
//   NEVER MOCK — CHECKED HERE, NOT DELEGATED. lib/ai/stt/mock.ts returns a FIXED
//   invented Arabic sentence. On a public demo that would show Khalid confidently
//   "understanding" something the visitor never said. transcribeAudioBytes calls
//   assertMockSttAllowed, but that guard permits the mock whenever NODE_ENV is not
//   "production" OR ENABLE_MOCK_STT=true — and localhost is an allowlisted demo host,
//   so under `npm run dev` the earlier version of this route rendered a fabricated
//   sentence as the VISITOR'S OWN WORDS. This route therefore refuses the mock
//   adapter outright, on every environment, before any transcription is attempted.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runCustomerTurn, CustomerTurnError } from "@/lib/ai/customer-turn";
import { formatCustomerVisibleText, formatCustomerVisiblePresentation } from "@/lib/util/customer-visible-format";
import { transcribeAudioBytes } from "@/lib/messaging/voice";
import { expectedAnswerClass, CLASS_PRIORITY_TERMS } from "@/lib/ai/voice-aliases";
import { safeSttVocabulary } from "@/lib/ai/stt/safe-vocab";
import { demoVoiceReply, demoVoiceSignalsFor, demoVoiceSilenceKind } from "@/lib/demo/voice-out";
import { presentationForCall, callerAskedToSee } from "@/lib/demo/call-presentation";
import { isPhoneCallChannel } from "@/lib/demo/call-channel";
import { demoVoiceTicket, speechTicketsAvailable } from "@/lib/demo/speech-ticket";
import { callDelivery } from "@/lib/demo/call-delivery";
import { callCarrierFor } from "@/lib/demo/call-carriers";
import type { VoiceZeroReason } from "@/lib/messaging/voice-budget";
import { resolveSttAdapterName } from "@/lib/ai/stt";
import { mustWrite } from "@/lib/db/checked";
import { rateLimit } from "@/lib/rate-limit";
import {
  isDemoHost, DEMO_RESTAURANT_ID, DEMO_MAX_CHARS, DEMO_PER_IP_TURNS, DEMO_WINDOW_MS,
  DEMO_GLOBAL_DAILY_TURNS, DEMO_MAX_AUDIO_BYTES, globalBucket, ipBucket, capDemoHistory,
} from "@/lib/demo/config";
import { resolveDemoSession } from "@/lib/demo/session";
import { closeDemoOrder } from "@/lib/demo/order";
import { detectAllergenAvoidance } from "@/lib/ai/allergen-gate";
import { detectAllergenSymptom } from "@/lib/ai/allergen-gate-symptoms";
import { detectAllergenEmergency } from "@/lib/ai/allergen-emergency";
import { detectAllergyContext } from "@/lib/ai/allergen-context";
import { handleTypedQuantityFill, safetyProbeFired } from "@/lib/messaging/typed-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A voice turn is a Whisper round-trip PLUS a perception call PLUS up to MAX_ITERATIONS
// model calls over a ~17k-token system prompt. Vercel's default function timeout kills
// that mid-turn — after the guard slot and the provider spend have already been used —
// and the visitor just sees a generic error. Set explicitly, as the admin voice routes do.
export const maxDuration = 60;

// ── THE DEMO MENU, CACHED ───────────────────────────────────────────────────
//
// Read once per window and reused, because it is fetched BEFORE transcription on every
// turn and a database round trip in that position is latency the caller hears as dead air
// before Khalid answers. The demo tenant's menu is a seeded fixture; a short TTL is the
// honest trade between freshness nobody needs and a delay every caller feels.
let demoMenuCache: { names: string[]; at: number } | null = null;
const DEMO_MENU_TTL_MS = 5 * 60_000;

async function demoMenuNames(admin: ReturnType<typeof createAdminClient>): Promise<string[]> {
  if (demoMenuCache && Date.now() - demoMenuCache.at < DEMO_MENU_TTL_MS) return demoMenuCache.names;
  try {
    const { data, error } = await admin!
      .from("menu_items")
      .select("name")
      .eq("restaurant_id", DEMO_RESTAURANT_ID)
      .limit(200);
    // A POSTGREST ERROR IS NOT AN EMPTY MENU, and this is the difference between a bad
    // minute and a bad five minutes. The client RESOLVES on failure — it does not throw —
    // handing back `{ data: null, error }`, so ignoring `error` read a timeout, an RLS
    // refusal and a dropped connection as "this tenant has no dishes", cached the empty
    // result under a fresh timestamp, and switched transcriber priming off for EVERY caller
    // until the TTL expired. The `catch` below, written for exactly this, never ran.
    //
    // Nothing is cached on a failure: the previous names are reused if we have them, and
    // the next turn tries again.
    if (error) {
      console.warn(`[demo/voice] menu lookup failed — keeping previous vocabulary: ${String(error.message ?? error).slice(0, 200)}`);
      return demoMenuCache?.names ?? [];
    }
    // FILTERED BEFORE IT IS CACHED, so a name that can trip a safety gate never enters the
    // vocabulary at all. «لبن بارد» is on this menu, and biasing the recognizer toward it
    // turned «هلا والله» into a dairy allergen and a safety hold — see lib/demo/stt-vocab.ts.
    const names = safeSttVocabulary(((data ?? []) as Array<{ name?: string | null }>).map((r) => r.name));
    demoMenuCache = { names, at: Date.now() };
    return names;
  } catch {
    // Best-effort, exactly as the WhatsApp path treats it: no bias is a worse transcript,
    // never a failed turn.
    return demoMenuCache?.names ?? [];
  }
}

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: Request) {
  if (!isDemoHost(req.headers.get("host"))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Turn clock — see the timing line at the end of the turn.
  const tTurn = Date.now();
  const ip = clientIp(req);
  const rl = rateLimit(`demo-voice:${ip}`, DEMO_PER_IP_TURNS, DEMO_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  // Refuse oversized audio BEFORE reading the body into memory. This must FAIL
  // CLOSED: `Number(null)` is 0 and `Number("abc")` is NaN, and both compare false
  // against the ceiling, so an absent, duplicated ("100, 100") or chunked-encoded
  // Content-Length previously sailed past this check and the whole body was then
  // buffered by req.arrayBuffer() before anything measured it. A declared length is
  // now REQUIRED and must parse.
  const rawLen = req.headers.get("content-length");
  const declared = rawLen !== null && /^\d+$/.test(rawLen.trim()) ? Number(rawLen.trim()) : NaN;
  if (!Number.isFinite(declared)) {
    return NextResponse.json({ error: "length_required" }, { status: 411 });
  }
  if (declared > DEMO_MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "audio_too_large" }, { status: 413 });
  }

  // Refuse the fabricating adapter before spending a guard slot on it.
  //
  // resolveSttAdapterName, NOT getSttAdapter: the latter calls assertMockSttAllowed
  // internally and THROWS when the adapter resolves to mock in production, so testing
  // `getSttAdapter().name` outside a try/catch turned a misconfigured production
  // environment into an uncaught 500 instead of the honest 503 below. The resolver is
  // pure and never throws.
  if (resolveSttAdapterName() === "mock") {
    console.error("[demo/voice] mock STT adapter selected — refusing to fabricate a transcript");
    return NextResponse.json({ error: "stt_unavailable" }, { status: 503 });
  }

  // multipart: the clip plus the on-screen history. The declared length above bounds
  // the whole body, so parsing it cannot be turned into an unbounded allocation.
  let buf: Buffer;
  let history: ReturnType<typeof capDemoHistory> = [];
  let mime = "audio/webm";
  // The visitor's demo session id, carried on the SAME multipart body as the clip so a
  // spoken turn and a typed turn share one basket. Attacker-controlled like everything
  // else here; resolved with the tenant AND channel pinned below, never used as given.
  let rawSessionId: unknown = null;
  // WHICH SURFACE IS SPEAKING. This route has TWO callers and they are not the same
  // product: the press-and-hold microphone in the CHAT composer, and the full-screen CALL
  // overlay. They send byte-identical bodies, so for one release this route treated every
  // chat voice note as a phone call — the visitor held the mic while looking straight at
  // the thread, and got the call prompt («the guest is HOLDING A PHONE TO THEIR EAR… they
  // cannot see anything… never recite a long list») plus `presentation: null`. The
  // tap-first rail — categories, items, quantity buttons, confirm/cancel — is the demo's
  // flagship affordance and it was silently withheld from the surface that shows it.
  //
  // DEFAULTS TO THE CHAT NOTE, and that direction is the whole point: a missing, unknown or
  // malformed value lands on the behaviour this route had before the call work existed and
  // that every earlier proof covers. The CALL is the opt-in, because the call is the one
  // that removes things from the screen.
  let isPhoneCall = false;
  try {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    buf = Buffer.from(await audio.arrayBuffer());
    mime = audio.type || "audio/webm";
    const rawHistory = form.get("history");
    if (typeof rawHistory === "string" && rawHistory) {
      history = capDemoHistory(JSON.parse(rawHistory) as unknown);
    }
    rawSessionId = form.get("conversationId");
    isPhoneCall = isPhoneCallChannel(form.get("channel"));
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  // The declared length is a hint, not a promise — check what actually arrived.
  if (!buf.length) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (buf.length > DEMO_MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "audio_too_large" }, { status: 413 });
  }

  // GUARD CONSUMED ONLY AFTER THE REQUEST IS VALID — same reason as /api/demo/turn.
  // The guard increments a GLOBAL counter on the way in, so a junk body used to burn one
  // of the day's slots for free; a thousand of them took the demo dark for a UTC day.
  // Parsing and size-checking the clip costs nothing (the declared length was already
  // bounded above), and the guard still precedes STT and the model call.
  // Durable guard — fails closed, same as the text route.
  const { data: guard, error: guardErr } = await admin
    .rpc("kv_demo_try_consume", {
      p_ip_bucket: ipBucket(ip),
      p_global_bucket: globalBucket(),
      p_ip_limit: DEMO_PER_IP_TURNS,
      p_global_limit: DEMO_GLOBAL_DAILY_TURNS,
    })
    .maybeSingle<{ allowed: boolean; reason: string | null }>();
  if (guardErr || !guard) {
    console.error("[demo/voice] spend guard unavailable — refusing", guardErr?.message);
    return NextResponse.json({ error: "demo_unavailable" }, { status: 503 });
  }
  if (!guard.allowed) {
    const stopped = guard.reason === "disabled";
    return NextResponse.json({ error: stopped ? "demo_unavailable" : "rate_limited" }, { status: stopped ? 503 : 429 });
  }

  // ── THE TRANSCRIBER IS TOLD WHAT IT IS LIKELY TO HEAR ─────────────────────
  //
  // PARITY WITH THE CHAT PATH, WHICH HAD THIS AND THE CALL DID NOT. The WhatsApp webhook
  // primes STT with the tenant's menu names and with the words the last question invites
  // (`transcribeWhatsAppVoice(..., sttMenuNames, sttPriorityTerms)`); this route called
  // `transcribeAudioBytes(buf, mime)` with neither. So «جريش»، «لقيمات»، «مندي» — proper
  // nouns no general model has strong priors for — were transcribed unbiased on the ONE
  // surface a prospect is watching, and the resulting low confidence then tripped the
  // garble ladder, which asked the caller to TYPE. Cause and punishment both in the call.
  //
  // CACHED, because this runs before STT and a database round trip here is latency the
  // caller hears as dead air. The demo tenant's menu is a fixture that changes when someone
  // edits a seed script, so a short TTL is honest and costs one query per window.
  const msIntake = Date.now() - tTurn;
  const menuNames = await demoMenuNames(admin);
  const msVocab = Date.now() - tTurn - msIntake;
  // …and the state bias comes from the history the CLIENT already posted, so it costs no
  // query at all: the last thing Khalid said is what decides which answers to expect.
  const lastAssistant = [...history].reverse().find((h) => h.role === "assistant")?.content ?? "";
  const answerClass = expectedAnswerClass(lastAssistant);
  const priorityTerms = answerClass ? CLASS_PRIORITY_TERMS[answerClass] : [];

  let transcript: string;
  let sttConfidence: number | null = null;
  let sttCost: { model: string; adapter: string; costUsd: number };
  const tStt = Date.now();
  // NULL, NOT ZERO. `msSttProvider || …` falls through on a sub-millisecond transcription and
  // folds the `agent_runs` write straight back into `stt=` — the exact mis-attribution this
  // was split out to remove, hiding behind a falsy zero. Unreachable at real STT latencies
  // (217-806ms measured), and a measurement that is right only while the numbers are large
  // is not a measurement.
  let msSttProvider: number | null = null;
  try {
    const stt = await transcribeAudioBytes(buf, mime, menuNames, priorityTerms);
    // THE TRANSCRIBER IS DONE HERE. Everything after this line in the block is OUR
    // bookkeeping — an `agent_runs` insert — and it was being counted as `stt=`. That is
    // the same mis-attribution this route just split out of `brain=`, one segment earlier
    // and left in place: a Postgres round trip wearing a provider's name. The timing line's
    // own comment says a measurement that names the wrong thing is worse than none.
    msSttProvider = Date.now() - tStt;
    transcript = String(stt.text ?? "").trim().slice(0, DEMO_MAX_CHARS);
    sttConfidence = typeof stt.confidence === "number" ? stt.confidence : null;
    sttCost = { model: stt.model, adapter: stt.adapter, costUsd: stt.costUsd };
  } catch (e) {
    // No provider key, or the mock guard refusing to fabricate a transcript.
    console.error("[demo/voice] transcription unavailable", e);
    return NextResponse.json({ error: "stt_unavailable" }, { status: 503 });
  }

  // SPEND ACCOUNTING, in its own step. lib/monitoring/sweep.ts sums agent_runs.cost_usd
  // for the daily alert; on a voice turn STT is the DOMINANT cost, and the first version
  // of this route discarded stt.costUsd entirely — so the one surface anyone can call was
  // the one surface the spend monitor could not see. Mirrors the WhatsApp path minus the
  // visitor's words: input/output stay null, exactly as demoRun does for the LLM row.
  //
  // Kept OUT of the transcription try/catch on purpose: a failed accounting write is not
  // a transcription failure and must not be reported as one. It still FAILS CLOSED —
  // money has already been spent here and more is about to be, so if we cannot record it
  // we stop rather than continue blind.
  try {
    await mustWrite<{ id: string }>(
      admin.from("agent_runs").insert({
        restaurant_id: DEMO_RESTAURANT_ID,
        conversation_id: null,
        trigger: "voice",
        input: null,
        output: null,
        model: sttCost.model,
        adapter: sttCost.adapter,
        cost_usd: sttCost.costUsd,
      }).select("id"),
      "demo_voice.stt_cost",
      { exactRows: 1 },
    );
  } catch (e) {
    console.error("[demo/voice] spend accounting failed — refusing", e);
    return NextResponse.json({ error: "demo_unavailable" }, { status: 503 });
  }
  const msStt = msSttProvider ?? Date.now() - tStt;
  // The ledger write that used to hide inside `stt=`.
  const msSttWrite = Date.now() - tStt - msStt;

  if (!transcript) {
    // WHY THERE WERE NO WORDS. An empty transcript has two completely different causes and
    // this returned 422 with no evidence of either: the visitor genuinely said nothing (the
    // clip is real audio of a quiet room), or the clip never contained usable audio at all
    // (a recorder that produced a near-empty blob, or a container this provider will not
    // decode). The byte count separates them at a glance, and the mime says whether the
    // browser handed us what we expected — a MediaRecorder falls back to whatever it
    // supports, which differs per browser and is not something the client reports.
    //
    // The visitor's WORDS are deliberately not logged — there are none — and neither is
    // anything identifying: this is a size, a container and a model name.
    console.warn(
      `[demo/voice] empty transcript — bytes=${buf.length} mime=${JSON.stringify(String(mime).slice(0, 60))} ` +
        `adapter=${sttCost.adapter} model=${sttCost.model} confidence=${sttConfidence ?? "n/a"}`
    );
    return NextResponse.json({ error: "stt_empty" }, { status: 422 });
  }

  // Same ephemeral session as the typed route, resolved the same way — tenant AND
  // channel pinned — so a visitor who types «أبغى كبسة» and then says «وزيدها لبن» is
  // adding to ONE basket. Fails soft to a stateless turn if the session cannot be had.
  const session = await resolveDemoSession(admin, rawSessionId);
  const conversationId = session?.conversationId ?? null;

  // THE QUANTITY RAIL, on the spoken path. The typed route resolves «وحده بس» / «حبتين» /
  // «٣ حبات» deterministically through lib/messaging/quantity-fill.ts; this route did not,
  // so the single most natural SPOKEN answer to our own question — "how many?" — was the
  // one answer that went to the model instead of to the parser. A demo whose typed path is
  // deterministic and whose spoken path is not is two products.
  //
  // The tap rail from the typed route is deliberately NOT mirrored: a voice note carries no
  // interactive id, so there is nothing for it to resolve.
  //
  // THE SAFETY PROBE IS STRONGER HERE, not merely copied. The typed route passes
  // `sttConfidence: null, isVoiceTranscript: false` because it has neither; this route has
  // both, so the phonetic safety net runs with the real confidence of the real audio —
  // which is exactly the signal it was written for. It GATES: an allergen or emergency turn
  // can never be short-circuited past the safety pipeline by sounding like a bare quantity.
  const voiceSafetyProbe = {
    allergenAvoidance: detectAllergenAvoidance(transcript).fired,
    allergenSymptom: detectAllergenSymptom(transcript).fired,
    allergyContext: detectAllergyContext(transcript).fired,
    allergenEmergency: detectAllergenEmergency(transcript).fired,
  };
  if (conversationId && !safetyProbeFired(voiceSafetyProbe)) {
    try {
      const filled = await handleTypedQuantityFill(admin, {
        restaurantId: DEMO_RESTAURANT_ID,
        conversationId,
        userMessage: transcript,
        interactiveId: null,
        features: null,
        safetyProbe: voiceSafetyProbe,
        demoRun: true,
      });
      if (filled.kind === "handled") {
        // THIS REPLY IS SPOKEN, and the earlier reasoning for staying silent was wrong.
        //
        // It said: "a deterministic fill produces no synthesis: there is no model turn, so
        // there is no stopReason to classify, and this route speaks only what the
        // classifier has cleared." True about the classifier, wrong about the conclusion —
        // this branch is reached ONLY when `safetyProbeFired(voiceSafetyProbe)` is false —
        // and that probe runs all FOUR exact allergy detectors over the transcript.
        //
        // THAT SENTENCE USED TO CLAIM MORE THAN IT COULD. It read "the probe ran the
        // phonetic safety net with the real STT confidence of the real audio … a STRONGER
        // clearance than a model turn's stopReason". The phonetic net was retired by Founder
        // ruling and no confidence is passed to anything any more, so the justification for
        // speaking this reply was resting on a control that no longer exists. The clearance
        // is still real and still worth stating — four exact detectors over the transcript,
        // and this turn's stopReason is pinned to null so the shared gate cannot mistake it
        // for a cleared model turn — but it is the detectors doing the work, not a matcher.
        //
        // The text is also OUR OWN template rather than model output, and
        // voiceHardZeroReason still scans it for a money figure, a link or a receipt.
        //
        // Staying silent here killed the call on the flagship flow. «كم قطعة تحب؟» is the
        // question the demo asks on almost every order, and «خمسة» / «وحدة بس» is the most
        // natural spoken answer to it — which is precisely why this rail exists. With no
        // audio and no reason attached, the call loop's conservative default read the
        // silence as "the voice is broken", ended the conversation on turn two or three,
        // and told a restaurant owner «الصوت مو شغّال». The demo terminated itself at the
        // exact moment it was working.
        // THE CLEARANCE HAS THREE PARTS, and the third is the one a first attempt missed.
        //
        //   1. THIS TURN'S WORDS — the probe above ran all four detectors, including the
        //      phonetic safety net with the REAL stt confidence of the real audio, and did
        //      not fire. That is why we are in this branch at all.
        //   2. THIS REPLY'S TEXT — voiceHardZeroReason still scans it inside demoVoiceReply
        //      for a money figure, a payment link or a receipt.
        //   3. EARLIER TURNS — a conversation can already be under an allergy calm-hold from
        //      a PREVIOUS turn, and the probe cannot see that: it only reads what was said
        //      just now. Passing `safetyHold: false` unconditionally would have spoken a
        //      quantity confirmation into a held conversation. The WhatsApp path folds
        //      `is_safety_hold` in for exactly this reason; so does this one now.
        //
        // Absent all three, staying silent here was not a safety property — it was a gap
        // that ended the call on the most common spoken turn in the demo.
        let heldFromEarlierTurn = false;
        try {
          const { data: convRow, error: convErr } = await admin
            .from("conversations")
            .select("is_safety_hold")
            .eq("id", conversationId)
            .maybeSingle();
          // FAIL CLOSED. A read error means we do not know whether this conversation is
          // held, and "we do not know" must never be spoken aloud.
          heldFromEarlierTurn = convErr ? true : (convRow as { is_safety_hold?: boolean } | null)?.is_safety_hold === true;
        } catch {
          heldFromEarlierTurn = true;
        }

        const filledText = formatCustomerVisibleText(filled.reply, filled.dialect);
        // THE SAME DELIVERY AS THE OTHER EXIT. This rail is the one flow that already
        // behaved like a phone call, so leaving it on the buffered path would give the same
        // caller progressive audio when they ask a question and 1.8-5.5s of silence when
        // they answer «حبتين» — which is the turn that most needs to feel immediate.
        const filledSpeakOpts = {
          inboundWasVoice: true,
          safetyHold: heldFromEarlierTurn,
          isReceipt: false,    // a quantity fill is never a receipt
          spokenPricesAllowed: isPhoneCall,
          // The quantity rail has no model stop reason — it is a deterministic fill — so it
          // is never on the call-speakable safety list, and a hold carried over from an
          // earlier turn (including one whose flag could not be READ, which fails closed on
          // purpose) stays silent exactly as it did before the waiver existed.
          spokenSafetyAllowed: isPhoneCall,
          stopReason: null,
        };
        const filledSpoken =
          callDelivery({ isPhoneCall, ticketsAvailable: speechTicketsAvailable() }) === "stream" 
          ? demoVoiceTicket(filledText, { ...filledSpeakOpts, sid: conversationId })
          : await demoVoiceReply(filledText, filledSpeakOpts);
        if (filledSpoken.spend) {
          try {
            await mustWrite<{ id: string }>(
              admin.from("agent_runs").insert({
                restaurant_id: DEMO_RESTAURANT_ID,
                conversation_id: null,
                trigger: "voice_tts",
                input: null,
                output: null,
                model: filledSpoken.spend.model,
                adapter: filledSpoken.spend.adapter,
                cost_usd: filledSpoken.spend.costUsd,
              }).select("id"),
              "demo_voice.tts_cost_quantity_fill",
              { exactRows: 1 },
            );
          } catch (e) {
            console.error("[demo/voice] TTS spend accounting failed (quantity fill)", e);
          }
        }
        return NextResponse.json({
          ok: true,
          conversationId,
          transcript,
          reply: filledText,
          replyAudio: filledSpoken.audioBase64,
          replyAudioUrl: filledSpoken.speechUrl,
          replyAudioMime: filledSpoken.mime,
          // Never omitted. The client's default for a missing field is "unavailable", by
          // design — an unexplained silence must not be dressed up as a product rule — so
          // leaving it out of ONE of the route's two exits ended the call on that exit.
          replyAudioSilence: demoVoiceSilenceKind(filledSpoken.skipped),
          // Same rule on the quantity rail — it is the ONE flow that already behaved like
          // a phone call, and it must not be the exit that quietly reintroduces buttons.
          presentation: isPhoneCall
            ? presentationForCall(
                filled.presentation ? formatCustomerVisiblePresentation(filled.presentation, filled.dialect) : null,
                transcript,
              )
            : filled.presentation
              ? formatCustomerVisiblePresentation(filled.presentation, filled.dialect)
              : null,
          photoRequests: [],
        });
      }
    } catch (e) {
      // Never let the rail break a turn the model path can still serve.
      console.error("[demo/voice] quantity fill failed; falling through to the model", e);
    }
  }

  try {
    const tBrain = Date.now();
    const out = await runCustomerTurn(admin, {
      restaurantId: DEMO_RESTAURANT_ID,
      conversationId,
      history,
      userMessage: transcript,
      // Persists OUR reply + the basket (`meta.draft`). The transcript of the visitor's
      // own voice note is still never written as a message row — see the typed route.
      persistReply: true,
      // Independent of conversationId and still required: it is what keeps the visitor's
      // words out of agent_runs/conversation_signals and every staff alert switched off.
      demoRun: true,
      // Feeds the fail-closed phonetic safety net — a garbled allergen word on a
      // voice note is exactly what that net exists to catch.
      sttConfidence,
      isVoiceTranscript: true,
      // THIS TURN WILL ONLY EVER BE HEARD. Distinct from `isVoiceTranscript`, which says
      // the INPUT was audio — also true of a WhatsApp voice note whose reply is read on a
      // screen. Without it the model was told to be "tap-first" and to hand off to «the
      // list shown below», and it obeyed: asking for the menu on the phone pushed a
      // tappable list to a screen hidden behind the call overlay and said «تفضّل 👇» aloud.
      // …and ONLY on the call. A chat voice note is read on the screen it was recorded
      // on, so it keeps the typed prompt and the tap-first rail it has always had.
      channel: isPhoneCall ? "voice_call" : undefined,
    });
    // THE BRAIN ENDS HERE, not after the order write. Read the note on the timing line.
    const msBrain = Date.now() - tBrain;

    const tClose = Date.now();
    // A spoken «أكد الطلب» closes an order exactly like a typed one — same real order
    // number, same honest "this is a demo, nothing was charged" line.
    const closed = await closeDemoOrder(admin, {
      conversationId,
      draft: out.draft,
      agentRunId: out.agentRunId,
      reply: formatCustomerVisibleText(out.reply, out.dialect),
      dialect: out.dialect,
    });
    // KHALID SPEAKS BACK. Until now the demo could hear and could not answer aloud:
    // synthesizeVoiceReply had exactly one caller in the repo, the WhatsApp path. The demo
    // half lives in lib/demo/voice-out.ts rather than inline, because the WhatsApp block
    // fires recordCriticalAlert on a TTS fallback — which emails and WhatsApps the Founder,
    // and a stranger on a public page must never be able to page a human.
    //
    // Never throws, and never blocks the reply: on any skip the visitor still gets the full
    // text, which is exactly what they get today.
    //
    // The two structured signals are the ones lib/messaging/voice-budget.ts asks for.
    // A HARD-ZERO turn is text-only: a spoken safety message is a fresh mis-hearing
    // surface, and this demo exists to show the allergen gate — speaking that reply
    // would demonstrate the feature in the one modality the product forbids for it.
    //
    // ONE EXCEPTION, ADDED LATER, AND THIS PARAGRAPH DID NOT SAY SO FOR TWO COMMITS.
    // On a live CALL and only there, two things are now spoken: a PRICE, and the honest
    // allergy NOTICE («خذت بالي إنك ذكرت…»). The call screen displays the reply text while
    // the audio plays — the compensating control a WhatsApp voice note never had — and on a
    // call, silence is not the safe answer either: the Founder asked a price and heard
    // nothing, and a caller disclosing an allergy heard nothing. Receipts, payment links,
    // and every other safety branch — ACTIVE ANAPHYLAXIS included, «997» above all — are
    // unchanged and stay text-only on every surface. The scope is enforced by
    // CALL_SPEAKABLE_SAFETY_STOPS in lib/messaging/voice-budget.ts, not by this comment.
    const allergenGate = out.model === "deterministic_allergen_gate";
    // DERIVED FROM THE TURN, NOT FROM PROXIES. This previously read
    // `safetyHold: allergenGate || out.escalate === true`, and the ACTIVE ANAPHYLAXIS
    // branch sets neither of those — it returns escalate:false with a different model
    // string — so the reply telling a visitor to call an ambulance was synthesized and
    // played aloud. voiceSignalsForTurn reads stopReason, which that branch does set, and
    // fails closed on any stop reason nobody has listed as safe to speak.
    const msClose = Date.now() - tClose;
    const voiceSignals = demoVoiceSignalsFor(out, closed);
    const tTts = Date.now();
    // STREAM ON A CALL, BUFFER EVERYWHERE ELSE.
    //
    // `demoVoiceReply` waits for the provider to finish speaking the entire reply before it
    // returns a byte. Measured here in production, that is 1807-5472ms of a caller holding
    // a phone to their ear and hearing nothing — on audio ElevenLabs had already started
    // producing. `demoVoiceTicket` does the identical decision and hands back a URL instead,
    // so playback begins while the sentence is still being synthesized.
    //
    // The CHAT voice note keeps the buffered path deliberately: it is read on the screen it
    // was recorded on, progressive playback buys it nothing, and it is the delivery that has
    // been proven in front of visitors. A latency fix has no business changing it.
    //
    // Both call `demoVoiceDecision`, so the two deliveries cannot disagree about whether a
    // reply may be spoken — only about how the bytes travel. And a missing signing key means
    // no ticket, so this falls back to the buffered path rather than to silence.
    // THE DECISION IS A FUNCTION, NOT A CONDITION HERE. Inline, `&& false` — one token —
    // put every call back on the buffered path and left all 223 proofs green, because the
    // only thing asserting it was a regex on the shape of the ternary below. See
    // lib/demo/call-delivery.ts.
    const streamTheCall =
      callDelivery({ isPhoneCall, ticketsAvailable: speechTicketsAvailable() }) === "stream";
    const speakOpts = {
      inboundWasVoice: true,
      safetyHold: voiceSignals.safetyHold,
      isReceipt: voiceSignals.isReceipt,
      // THIS IS A CALL, AND THE SCREEN SHOWS THIS REPLY WHILE IT PLAYS. Suppressing the
      // price here made Khalid answer «كم سعر المندي؟» with an acknowledgement while the
      // price sat visible beside him — the Founder's report was "what Khalid said is not
      // what is written". Money only; links, receipts and safety holds are unchanged.
      // …ON THE CALL ONLY. The waiver is paid for by the call screen showing this reply
      // while the audio plays; a voice note is not that bargain and keeps the old rule.
      spokenPricesAllowed: isPhoneCall,
      // …AND THE ALLERGY SENTENCE IS SAID OUT LOUD TOO, on a call only.
      //
      // Every reply from the allergen gate was marked a safety turn and a safety turn was
      // never spoken — so a caller who disclosed an allergy got a careful, honest sentence on
      // the screen and DEAD AIR in their ear, at the one moment they most needed an answer.
      // The screen shows it while it plays, which is the same bargain the price waiver
      // strikes and the same reason it is sound.
      //
      // AND IT IS NOT ENOUGH ON ITS OWN. The branch has to be on the call-speakable list in
      // voice-budget.ts as well — the flag alone once waived active anaphylaxis, and the demo
      // call channel was driven synthesizing «اتصل بالإسعاف 997».
      spokenSafetyAllowed: isPhoneCall,
      stopReason: voiceSignals.stopReason,
    };
    let spoken = streamTheCall
      ? demoVoiceTicket(closed.reply, { ...speakOpts, sid: conversationId })
      : await demoVoiceReply(closed.reply, speakOpts);

    // DEAD AIR IS NOT AN ACCEPTABLE ANSWER ON A PHONE CALL.
    //
    // Four reply categories are text-only by product rule, and that rule is unchanged: the
    // authoritative reply carrying the price, the total, the link or the order number is
    // never synthesized. On WhatsApp that costs nothing — the text is already in the
    // customer's hand. On a CALL nobody is holding anything, so «كم سعر الكبسة؟» — the most
    // common question a restaurant caller asks — produced three seconds of thinking and
    // then silence, and the demo looked broken while behaving exactly as designed.
    //
    // So a FIXED, figure-free acknowledgement is spoken instead: no digit, no number word,
    // no currency, no link, no order number, and it passes voiceHardZeroReason on its own
    // merits. It says the turn happened; the protected value still goes only to text.
    //
    // A SAFETY HOLD GETS NO CARRIER and stays completely silent — see call-carriers.ts.
    // `!spoken.audioBase64 && !spoken.speechUrl` — BOTH deliveries. Asking only about the
    // base64 would have fired a carrier over a perfectly good streamed reply, so the caller
    // would hear «تمام، أرسلت لك التفاصيل» INSTEAD of the answer.
    if (isPhoneCall && spoken.skipped && !spoken.audioBase64 && !spoken.speechUrl) {
      const carrier = callCarrierFor(spoken.skipped as VoiceZeroReason);
      if (carrier) {
        const carrierAudio = streamTheCall
          ? demoVoiceTicket(carrier, { inboundWasVoice: true, sid: conversationId })
          : await demoVoiceReply(carrier, { inboundWasVoice: true });
        // Only if the carrier ITSELF produced audio. If synthesis fails here we are back to
        // the silence we started with, which is correct — never a substitute voice.
        if (carrierAudio.audioBase64 || carrierAudio.speechUrl) {
          // SUMMED, NOT CHOSEN BETWEEN. `??` keeps the carrier's spend and DISCARDS the
          // first synthesis whenever both exist — and both existing is precisely the case
          // this branch is for: a reply that was refused AFTER being paid for, followed by a
          // carrier that was also paid for. Unreachable today (the only skip carrying a
          // spend is `wrong_voice`, which gets no carrier), and money silently leaving the
          // ledger is not a thing to leave resting on that.
          spoken = {
            ...carrierAudio,
            spend: spoken.spend && carrierAudio.spend
              ? {
                  costUsd: spoken.spend.costUsd + carrierAudio.spend.costUsd,
                  chars: spoken.spend.chars + carrierAudio.spend.chars,
                  model: carrierAudio.spend.model,
                  adapter: carrierAudio.spend.adapter,
                }
              : carrierAudio.spend ?? spoken.spend,
          };
        } else if (carrierAudio.spend) {
          // A REFUSAL AFTER A PAID SYNTHESIS IS STILL A CHARGE. `wrong_voice` is decided by
          // reading what the provider sent back, which means the money is already gone —
          // `voice-out.ts` carries the spend on that path precisely so the ledger sees it,
          // and this branch used to drop it on the floor because the audio was null.
          // Keeping the carrier's spend without keeping its (absent) audio is the whole
          // point: we stay silent AND we stay honest about what it cost.
          spoken = { ...spoken, spend: carrierAudio.spend };
        }
      }
    }
    // ── WHERE THE SECONDS ACTUALLY GO ─────────────────────────────────────
    //
    // A call turn is three sequential network round trips — transcribe, think, speak — and
    // the Founder reports it is too slow. Optimizing before measuring is how the wrong one
    // gets tuned, so every turn now reports its own breakdown. This is a timing line, not
    // an alert, and carries no visitor words: four durations and a character count.
    const msTts = Date.now() - tTts;
    console.log(
      // BROKEN DOWN FURTHER, because the first measurement indicted nothing: stt 233ms +
      // brain 840ms accounted for barely half of a 2062ms turn, and the rest was invisible.
      // `intake` is everything before transcription — host gate, rate limit, body parse,
      // the durable spend guard, the mock-adapter check; `vocab` is the menu lookup;
      // `close` is the order write.
      //
      // AND `close` IS SPLIT OUT BECAUSE IT WAS HIDING INSIDE `brain`. The first version
      // stopped the brain clock AFTER `closeDemoOrder` and then measured a segment named
      // `after` that spanned one synchronous function call — so it printed `after=0ms` on
      // every turn, always, while a database write sat silently inside the number this
      // whole line exists to attribute. The next person to read `brain=6244ms` would have
      // tuned a model over a value that was partly a round trip to Postgres. A measurement
      // that names the wrong thing is worse than no measurement, because it is believed.
      `[demo/voice] timing intake=${msIntake}ms vocab=${msVocab}ms stt=${msStt}ms ` +
        `sttwrite=${msSttWrite}ms brain=${msBrain}ms close=${msClose}ms ` +
        // LABELLED, BECAUSE THE TWO NUMBERS MEAN OPPOSITE THINGS. On a call `tts` is now the
        // ticket MINT — measured at ~3ms — and the synthesis it stands for happens later, in
        // /api/demo/speak, which logs its own line. Printed bare, that 3ms reads as
        // "synthesis is free" to exactly the person who came here to find the five seconds.
        `tts=${msTts}ms(${streamTheCall ? "mint" : "buffered"}) ` +
        // `calls` decides where the ~5s of thinking can be cut. One model call means the cost
      // is the reply itself over a 17k-token prompt, and the lever is TTS streaming; two or
      // three means tool round-trips, and the lever is the call channel's tool policy. The
      // difference is not visible from outside and guessing it picks the wrong fix.
      `total=${Date.now() - tTurn}ms calls=${out.callsUsed ?? "?"} chars=${closed.reply.length} model=${out.model ?? "?"}`
    );

    // `not_triggered` and `mock_pinned` are deliberate configurations, not faults.
    if (spoken.skipped && spoken.skipped !== "not_triggered" && spoken.skipped !== "mock_pinned") {
      console.warn("[demo/voice] spoken reply skipped", { reason: spoken.skipped });
    }

    // TTS SPEND, recorded for the same reason STT spend is (see the note above): this is
    // the one surface anyone can call, and money spent here must be visible to
    // lib/monitoring/sweep.ts. Unlike the STT write this does NOT fail closed — the
    // synthesis is already paid for and the reply is already composed, so refusing the
    // response would discard work we have been billed for without preventing any spend.
    // It is loud instead: the turn is already counted by the durable guard.
    // UNCONDITIONAL on a real synthesis. Gating this on `costUsd > 0` meant that any
    // mispriced model — one stray space in ELEVENLABS_TTS_MODEL was enough — priced at $0
    // and then wrote NO ROW AT ALL, so 100% of the spend went invisible. A zero cost on a
    // real synthesis is exactly the anomaly the monitor should see.
    if (spoken.spend) {
      try {
        await mustWrite<{ id: string }>(
          admin.from("agent_runs").insert({
            restaurant_id: DEMO_RESTAURANT_ID,
            conversation_id: null,
            trigger: "voice_tts",
            input: null,
            output: null,
            model: spoken.spend.model,
            adapter: spoken.spend.adapter,
            cost_usd: spoken.spend.costUsd,
          }).select("id"),
          "demo_voice.tts_cost",
          { exactRows: 1 },
        );
      } catch (e) {
        console.error("[demo/voice] TTS spend accounting failed", e);
      }
    }

    return NextResponse.json({
      ok: true,
      conversationId,
      transcript,
      reply: closed.reply,
      // Base64 rather than a URL: no object to store, nothing to expire, and no public
      // artifact of a stranger's session left behind. Null whenever we chose not to speak.
      replyAudio: spoken.audioBase64,
      // EXACTLY ONE OF THESE TWO IS EVER SET. `replyAudio` is the whole clip inline, which
      // is what a chat voice note wants; `replyAudioUrl` is a signed, one-minute URL the
      // player fetches, so a caller hears the first word while the last is still being
      // synthesized. The client picks whichever it was given.
      replyAudioUrl: spoken.speechUrl,
      replyAudioMime: spoken.mime,
      // WHY there is no audio, in two coarse shapes: "rule" (this reply is text-only on
      // purpose — safety, money, a payment link, a receipt) or "unavailable" (the voice is
      // not working). The call loop needs the difference and had no way to get it: every
      // silent turn looked identical, so a provider failure displayed the safety-rule
      // explanation and the loop kept recording. Deliberately coarse — a public page has
      // no business learning which env var is wrong.
      replyAudioSilence: demoVoiceSilenceKind(spoken.skipped),
      orderNumber: closed.orderNumber,
      escalate: out.escalate,
      allergenGate,
      // THE INTERACTIVE PAYLOAD. Omitting this is why the demo answered «ايش المنيو» with
      // «اختار من التصنيفات» and no categories on screen: present_menu builds the real
      // list into ctx.presentation and tells the model it was rendered, WhatsApp renders
      // it at respond-and-send.ts, and this handler was dropping it. Every tap-first
      // affordance in the product — category list, item list, quantity, confirm/cancel,
      // payment methods, dish photos — was invisible here.
      //
      // Safe to return: titles, prices and captions come from the tenant's own menu and
      // are customer-visible by construction on WhatsApp. It carries no tenant flags, no
      // cost, no model identity — the allowlist above still holds for those.
      // FORMAT IT THE WAY WHATSAPP DOES. formatCustomerVisibleText was called only in
      // respond-and-send.ts, so the demo shipped the model's RAW output: no digit
      // normalisation and no bold sanitisation. The Saudi profile declares
      // digitStyle:"western" and the live demo was answering «الإجمالي: ٧٠.١٥ ر.س»
      // and «برقم #١٠٠١» in Arabic-Indic — the digit style the tenant bans.
      // The presentation carries prices in its row descriptions, so it needs the same pass.
      // A CALLER IS ONLY SENT SOMETHING TO LOOK AT WHEN THEY ASKED TO SEE IT.
      // The call screen is a full-screen overlay and this payload lands in the thread
      // UNDERNEATH it, so «تفضّل، هذي قائمتنا 👇» was spoken aloud while the content it
      // pointed at went somewhere the caller could not reach. Withheld by default: the
      // reply text is still delivered and still spoken, and half an answer plus a pointer
      // to nothing is worse than a whole answer in words.
      presentation: isPhoneCall
        ? presentationForCall(
            out.presentation ? formatCustomerVisiblePresentation(out.presentation, out.dialect) : out.presentation,
            transcript,
          )
        : out.presentation
          ? formatCustomerVisiblePresentation(out.presentation, out.dialect)
          : out.presentation,
      // A PHOTO IS SOMETHING TO LOOK AT, exactly like a presentation. This was returned
      // unconditionally while `presentation` was withheld — the one screen-only payload
      // outside the discriminator. It is inert today only because the call screen's response
      // type omits the field and never calls `usablePhotos`, which means the guarantee rests
      // on a client omission that nothing tests. `presentationForCall`'s own argument
      // applies verbatim: a payload nobody can look at is worse than no payload, because the
      // model composes a sentence pointing at it.
      photoRequests: isPhoneCall && !callerAskedToSee(transcript) ? [] : out.photoRequests,
    });
  } catch (e) {
    if (e instanceof CustomerTurnError && e.code === "restaurant_not_found") {
      return NextResponse.json({ error: "demo_unavailable" }, { status: 503 });
    }
    console.error("[demo/voice] turn failed", e);
    return NextResponse.json({ error: "agent_error" }, { status: 502 });
  }
}
