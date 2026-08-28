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
//   NEVER MOCK. lib/ai/stt/mock.ts returns a FIXED invented Arabic sentence. On a
//   public demo that would show Khalid confidently "understanding" something the
//   visitor never said — worse than admitting voice is unavailable. transcribeAudioBytes
//   asserts against it; this route surfaces that as an honest stt_unavailable.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runCustomerTurn, CustomerTurnError } from "@/lib/ai/customer-turn";
import { transcribeAudioBytes } from "@/lib/messaging/voice";
import { rateLimit } from "@/lib/rate-limit";
import {
  isDemoHost, DEMO_RESTAURANT_ID, DEMO_MAX_CHARS, DEMO_PER_IP_TURNS, DEMO_WINDOW_MS,
  DEMO_GLOBAL_DAILY_TURNS, DEMO_MAX_AUDIO_BYTES, globalBucket, ipBucket,
} from "@/lib/demo/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  // Refuse oversized audio BEFORE reading the body into memory where we can.
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > DEMO_MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "audio_too_large" }, { status: 413 });
  }

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

  const buf = Buffer.from(await req.arrayBuffer());
  // The declared length is a hint, not a promise — check what actually arrived.
  if (!buf.length) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (buf.length > DEMO_MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "audio_too_large" }, { status: 413 });
  }

  let transcript: string;
  let sttConfidence: number | null = null;
  try {
    const stt = await transcribeAudioBytes(buf, req.headers.get("content-type") ?? "audio/webm");
    transcript = String(stt.text ?? "").trim().slice(0, DEMO_MAX_CHARS);
    sttConfidence = typeof stt.confidence === "number" ? stt.confidence : null;
  } catch (e) {
    // No provider key, or the mock guard refusing to fabricate a transcript.
    console.error("[demo/voice] transcription unavailable", e);
    return NextResponse.json({ error: "stt_unavailable" }, { status: 503 });
  }
  if (!transcript) return NextResponse.json({ error: "stt_empty" }, { status: 422 });

  try {
    const out = await runCustomerTurn(admin, {
      restaurantId: DEMO_RESTAURANT_ID,
      conversationId: null,
      history: [],
      userMessage: transcript,
      persistReply: false,
      demoRun: true,
      // Feeds the fail-closed phonetic safety net — a garbled allergen word on a
      // voice note is exactly what that net exists to catch.
      sttConfidence,
      isVoiceTranscript: true,
    });
    return NextResponse.json({
      ok: true,
      transcript,
      reply: out.reply,
      escalate: out.escalate,
      allergenGate: out.model === "deterministic_allergen_gate",
    });
  } catch (e) {
    if (e instanceof CustomerTurnError && e.code === "restaurant_not_found") {
      return NextResponse.json({ error: "demo_unavailable" }, { status: 503 });
    }
    console.error("[demo/voice] turn failed", e);
    return NextResponse.json({ error: "agent_error" }, { status: 502 });
  }
}
