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
import { demoVoiceReply, demoVoiceSignalsFor, demoVoiceSilenceKind } from "@/lib/demo/voice-out";
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
import { detectPhoneticSafetyNet } from "@/lib/ai/phonetic-safety-net";
import { detectAllergenEmergency } from "@/lib/ai/allergen-emergency";
import { handleTypedQuantityFill, safetyProbeFired } from "@/lib/messaging/typed-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A voice turn is a Whisper round-trip PLUS a perception call PLUS up to MAX_ITERATIONS
// model calls over a ~17k-token system prompt. Vercel's default function timeout kills
// that mid-turn — after the guard slot and the provider spend have already been used —
// and the visitor just sees a generic error. Set explicitly, as the admin voice routes do.
export const maxDuration = 60;

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: Request) {
  if (!isDemoHost(req.headers.get("host"))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

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

  let transcript: string;
  let sttConfidence: number | null = null;
  let sttCost: { model: string; adapter: string; costUsd: number };
  try {
    const stt = await transcribeAudioBytes(buf, mime);
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
  if (!transcript) return NextResponse.json({ error: "stt_empty" }, { status: 422 });

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
    phoneticSafetyNet: detectPhoneticSafetyNet(transcript, { sttConfidence, isVoiceTranscript: true }).fired,
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
        // this branch is reached ONLY when `safetyProbeFired(voiceSafetyProbe)` is false,
        // and that probe ran the phonetic safety net with the real STT confidence of the
        // real audio. That is a STRONGER clearance than a model turn's stopReason, not a
        // missing one. The text is also OUR OWN template rather than model output, and
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
        const filledSpoken = await demoVoiceReply(filledText, {
          inboundWasVoice: true,
          safetyHold: heldFromEarlierTurn,
          isReceipt: false,    // a quantity fill is never a receipt
        });
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
          replyAudioMime: filledSpoken.mime,
          // Never omitted. The client's default for a missing field is "unavailable", by
          // design — an unexplained silence must not be dressed up as a product rule — so
          // leaving it out of ONE of the route's two exits ended the call on that exit.
          replyAudioSilence: demoVoiceSilenceKind(filledSpoken.skipped),
          presentation: filled.presentation
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
    });
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
    const allergenGate = out.model === "deterministic_allergen_gate";
    // DERIVED FROM THE TURN, NOT FROM PROXIES. This previously read
    // `safetyHold: allergenGate || out.escalate === true`, and the ACTIVE ANAPHYLAXIS
    // branch sets neither of those — it returns escalate:false with a different model
    // string — so the reply telling a visitor to call an ambulance was synthesized and
    // played aloud. voiceSignalsForTurn reads stopReason, which that branch does set, and
    // fails closed on any stop reason nobody has listed as safe to speak.
    const voiceSignals = demoVoiceSignalsFor(out, closed);
    const spoken = await demoVoiceReply(closed.reply, {
      inboundWasVoice: true,
      safetyHold: voiceSignals.safetyHold,
      isReceipt: voiceSignals.isReceipt,
    });
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
      presentation: out.presentation
        ? formatCustomerVisiblePresentation(out.presentation, out.dialect)
        : out.presentation,
      photoRequests: out.photoRequests,
    });
  } catch (e) {
    if (e instanceof CustomerTurnError && e.code === "restaurant_not_found") {
      return NextResponse.json({ error: "demo_unavailable" }, { status: 503 });
    }
    console.error("[demo/voice] turn failed", e);
    return NextResponse.json({ error: "agent_error" }, { status: 502 });
  }
}
