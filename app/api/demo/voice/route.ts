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
import { resolveSttAdapterName } from "@/lib/ai/stt";
import { mustWrite } from "@/lib/db/checked";
import { rateLimit } from "@/lib/rate-limit";
import {
  isDemoHost, DEMO_RESTAURANT_ID, DEMO_MAX_CHARS, DEMO_PER_IP_TURNS, DEMO_WINDOW_MS,
  DEMO_GLOBAL_DAILY_TURNS, DEMO_MAX_AUDIO_BYTES, globalBucket, ipBucket, capDemoHistory,
} from "@/lib/demo/config";
import { resolveDemoSession } from "@/lib/demo/session";
import { closeDemoOrder } from "@/lib/demo/order";

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
    return NextResponse.json({
      ok: true,
      conversationId,
      transcript,
      reply: closed.reply,
      orderNumber: closed.orderNumber,
      escalate: out.escalate,
      allergenGate: out.model === "deterministic_allergen_gate",
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
