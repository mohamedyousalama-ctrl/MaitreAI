// ============================================================================
// MaitreAI — ElevenLabs TTS adapter (WO-VOICE-2) — the PRODUCTION voice.
// Khalid's production voice = the EL Voice-Design custom "EL-custom-A" (warm
// Najdi male, §0.6, the authenticity path), model eleven_flash_v2.5 (the ~2×
// cost/latency tier). INERT until ELEVENLABS_API_KEY is provisioned.
//
// The voice id is NEVER hardcoded — Mohamed retrieves EL-custom-A's id from his
// ElevenLabs dashboard and sets ELEVENLABS_VOICE_ID at deploy (like OPENAI_API_KEY).
// Swapping voices stays a one-line env change. Model is env-overridable too.
// ============================================================================

import type { TtsAdapter } from "./types";
import { ttsCostUsd } from "./pricing";

export const elevenlabsTtsAdapter: TtsAdapter = {
  name: "elevenlabs",
  async synthesize(text, opts) {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) throw new Error("ELEVENLABS_API_KEY not set");
    const voiceId = opts?.voiceId || process.env.ELEVENLABS_VOICE_ID;
    if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID not set");
    const model = process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2.5";
    const body = String(text ?? "");

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=opus_48000_64`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/ogg" },
        body: JSON.stringify({ text: body, model_id: model }),
      }
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`ElevenLabs TTS ${res.status}: ${detail.slice(0, 200)}`);
    }
    const audio = Buffer.from(await res.arrayBuffer());
    return {
      audio,
      mime: "audio/ogg",
      model,
      adapter: "elevenlabs",
      chars: body.length,
      costUsd: ttsCostUsd(`elevenlabs:${model}`, body.length),
    };
  },
};
