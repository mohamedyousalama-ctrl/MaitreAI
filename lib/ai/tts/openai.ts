// ============================================================================
// MaitreAI — OpenAI TTS adapter (WO-VOICE-2) — the automatic FALLBACK voice.
// gpt-4o-mini-tts, default voice "onyx" (the §0.6 budget/high-volume fallback,
// accepting the accent compromise). Used when ElevenLabs is out/over quota so a
// voice reply is NEVER silently dropped — an alert is fired by the caller and the
// customer still gets the text (voice is only ever additive). INERT until
// OPENAI_API_KEY is provisioned. Voice + model env-overridable.
// ============================================================================

import type { TtsAdapter } from "./types";
import { ttsCostUsd } from "./pricing";

export const openaiTtsAdapter: TtsAdapter = {
  name: "openai",
  async synthesize(text) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY not set");
    const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
    const voice = process.env.OPENAI_TTS_VOICE || "onyx";
    const body = String(text ?? "");

    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, voice, input: body, response_format: "opus" }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`OpenAI TTS ${res.status}: ${detail.slice(0, 200)}`);
    }
    const audio = Buffer.from(await res.arrayBuffer());
    return {
      audio,
      mime: "audio/ogg",
      model,
      adapter: "openai",
      chars: body.length,
      costUsd: ttsCostUsd(`openai:${model}`, body.length),
      voiceId: voice,
    };
  },
};
