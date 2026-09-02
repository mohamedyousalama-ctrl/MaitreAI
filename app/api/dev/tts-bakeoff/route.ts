// ============================================================================
// MaitreAI — TTS MODEL BAKE-OFF, RUN WHERE THE KEY ALREADY LIVES. PREVIEW ONLY.
//
// WHY A ROUTE AND NOT JUST THE SCRIPT. scripts/voice/compare-tts-models.ts answers the
// same question, but only on a machine holding ELEVENLABS_API_KEY. The key lives in the
// deployment's environment and should stay there: copying it to a laptop to run a
// measurement, or into a chat window to ask for help, are both worse than the problem.
// Running the comparison INSIDE the deployment means the key is never handled, never
// moved, and never seen — by anyone.
//
// PRODUCTION IS 404, UNCONDITIONALLY, AND IT IS THE FIRST THING THIS FILE DOES. This
// endpoint spends money on a model that KIV-313 has NOT accepted; on the production
// domain it must not exist at all. Vercel Authentication (SSO, currently on for
// everything except custom domains) is a SECOND lock, not the first — a protection
// setting is a dashboard toggle someone can flip, and this must not depend on it.
//
// THE TEXT IS OURS, NEVER THE CALLER'S. Three fixed lines, chosen by id. A `text=`
// parameter would make this a free text-to-speech oracle in Khalid's registered voice —
// the exact thing app/api/demo/speak/route.ts refuses to be, and the reason that route
// only ever speaks a server-signed ticket.
//
// ONE MODEL, ONE LINE, ONE REQUEST. Bounds the spend to a single synthesis per call and
// keeps every request far inside the function ceiling, instead of one long request that
// could time out halfway through a table and bill for the half nobody read.
//
// THE GUARD IN lib/ai/tts/elevenlabs.ts IS UNTOUCHED. That module refuses any model but
// the accepted one, and it still does; this builds its own request rather than weakening
// it. Nothing here changes what a customer hears — it produces the evidence a model
// review would need, and the review is still the thing that decides.
//
//   GET ?list=1                       → Arabic-capable models on this account. No spend.
//   GET ?model=<id>&line=<id>         → one synthesis; timings as JSON. Spends.
//   GET ?model=<id>&line=<id>&audio=1 → the same, returning the MP3 to listen to.
// ============================================================================

import { NextResponse } from "next/server";
import { KHALID_VOICE } from "@/lib/ai/tts/voice-registry";
import { toSpokenText } from "@/lib/ai/tts/spoken-text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Fixed, server-owned. The greeting is what a visitor hears first; the price line is
 *  where a hurried model most audibly mangles numerals; the third is ordinary warmth.
 *  A caller cannot add to this list, which is the point. */
const LINES: Record<string, string> = {
  greeting: "هلا والله، معك خالد من مطعم الديرة. وش أقدر أخدمك؟",
  price: "الإجمالي 101.2 ريال، ويوصلك خلال 45 دقيقة.",
  warmth: "أبشر، سجّلت طلبك. تحب أضيف لك شي ثاني؟",
  // The 194-character reply that actually lost its voice in production on 2 Sep: the
  // client bounds silence at 7s and eleven_v3 took 6924ms to first byte. A bake-off that
  // only measures short lines would have missed the case that broke.
  menu:
    "وعليكم السلام ورحمة الله. عندنا أطباق رئيسية نجدية أصيلة — كبسة دجاج وكبسة لحم " +
    "ومندي دجاج وجريش، وحلا لقيمات وتمر سكري، وكمان قهوة عربية ولبن بارد. " +
    "تميل لشي معين — أكلة رئيسية ولا تبدأ بالحلا؟",
};

interface ProviderModel {
  model_id: string;
  name?: string;
  can_do_text_to_speech?: boolean;
  languages?: Array<{ language_id?: string }>;
}

function notHere(): NextResponse {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

export async function GET(req: Request): Promise<NextResponse> {
  // FIRST, BEFORE ANYTHING ELSE READS A PARAMETER OR TOUCHES A KEY.
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    // NODE_ENV is "production" in every Vercel build including previews, so this pair is
    // deliberately redundant: VERCEL_ENV distinguishes preview from production, and the
    // NODE_ENV clause means a build OUTSIDE Vercel (where VERCEL_ENV is unset) fails
    // closed too. A diagnostics endpoint that spends money should never be one missing
    // environment variable away from being live.
    if (process.env.VERCEL_ENV !== "preview") return notHere();
  }

  const key = (process.env.ELEVENLABS_API_KEY || "").trim();
  const url = new URL(req.url);

  // PRESENCE, NEVER THE VALUE. Whether the preview environment carries the key at all is
  // the first thing anyone running this needs to know, and the only thing about the key
  // that may ever leave this function.
  if (!key) {
    return NextResponse.json(
      { keyPresent: false, hint: "ELEVENLABS_API_KEY is not set for this environment." },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  let models: ProviderModel[];
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/models", {
      headers: { "xi-api-key": key, Accept: "application/json" },
    });
    if (!res.ok) {
      // The provider's own words, clipped — a revoked key, a plan without the model and a
      // quota wall are three different fixes and one word for all of them sends whoever
      // is reading this hunting the wrong one. The key is never echoed.
      return NextResponse.json(
        { keyPresent: true, error: `models_${res.status}`, detail: (await res.text()).slice(0, 300) },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }
    models = (await res.json()) as ProviderModel[];
  } catch (e) {
    return NextResponse.json(
      { keyPresent: true, error: "models_unreachable", detail: (e as Error).message.slice(0, 200) },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Arabic-capable text-to-speech only. "Is it fast?" without "can it say this?" is how a
  // bake-off produces a confident wrong answer.
  const arabic = models.filter(
    (m) =>
      m.can_do_text_to_speech !== false &&
      (m.languages ?? []).some((l) => (l.language_id ?? "").toLowerCase().startsWith("ar"))
  );

  if (url.searchParams.get("list") === "1") {
    return NextResponse.json(
      {
        keyPresent: true,
        current: KHALID_VOICE.model,
        voiceId: KHALID_VOICE.voiceId,
        lines: Object.keys(LINES),
        totalModels: models.length,
        arabicModels: arabic.map((m) => ({ id: m.model_id, name: m.name ?? null })),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  const modelId = (url.searchParams.get("model") || "").trim();
  const lineId = (url.searchParams.get("line") || "greeting").trim();

  // VALIDATED AGAINST WHAT THE ACCOUNT ACTUALLY HAS, not against a list I typed. An
  // unknown id is refused before it can be spent on.
  if (!modelId || !arabic.some((m) => m.model_id === modelId)) {
    return NextResponse.json(
      { keyPresent: true, error: "unknown_model", allowed: arabic.map((m) => m.model_id) },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
  const text = LINES[lineId];
  if (!text) {
    return NextResponse.json(
      { keyPresent: true, error: "unknown_line", allowed: Object.keys(LINES) },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  // The SAME normalisation the live path applies, and the SAME registry settings. Only
  // the model varies — a comparison that moves two things at once answers neither.
  const body = toSpokenText(text);
  const t0 = Date.now();
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(KHALID_VOICE.voiceId)}` +
      `/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text: body,
        model_id: modelId,
        language_code: "ar",
        voice_settings: {
          stability: KHALID_VOICE.settings.stability,
          similarity_boost: KHALID_VOICE.settings.similarity_boost,
          style: KHALID_VOICE.settings.style,
          use_speaker_boost: KHALID_VOICE.settings.use_speaker_boost,
        },
      }),
    }
  );
  const headersMs = Date.now() - t0;
  if (!res.ok || !res.body) {
    return NextResponse.json(
      { keyPresent: true, model: modelId, error: `synth_${res.status}`, headersMs, detail: (await res.text()).slice(0, 300) },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  // TIME TO FIRST BYTE, which is what a caller waits for on a streamed reply and the same
  // number `[demo/speak] timing headers=…` reports in production, so the two compare.
  const chunks: Uint8Array[] = [];
  let firstByteMs = -1;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value?.length) {
      if (firstByteMs < 0) firstByteMs = Date.now() - t0;
      chunks.push(value);
    }
  }
  const bytes = Buffer.concat(chunks);
  const totalMs = Date.now() - t0;

  if (url.searchParams.get("audio") === "1") {
    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        // So a listener can read the timing off the response without a second request.
        "X-Bakeoff-Model": modelId,
        "X-Bakeoff-First-Byte-Ms": String(firstByteMs < 0 ? headersMs : firstByteMs),
        "X-Bakeoff-Total-Ms": String(totalMs),
      },
    });
  }

  return NextResponse.json(
    {
      keyPresent: true,
      model: modelId,
      line: lineId,
      chars: body.length,
      headersMs,
      firstByteMs: firstByteMs < 0 ? headersMs : firstByteMs,
      totalMs,
      audioBytes: bytes.length,
      current: KHALID_VOICE.model,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
