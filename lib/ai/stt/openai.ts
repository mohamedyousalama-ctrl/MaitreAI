// ============================================================================
// MaitreAI — OpenAI STT adapter (Sprint 9, S9-6) — candidate A
// Whisper-family via the OpenAI audio transcriptions API. Model is env-selectable
// (default whisper-1, which returns verbose_json with a duration — and therefore an exact
// cost; other models return plain json with no duration, which the price table scores as
// ZERO, so an OPENAI_STT_MODEL flip makes this spend invisible to the daily alert).
//
// NO LONGER INERT, AND THAT IS A DELIBERATE CHANGE: this is the SECOND rescue engine for a
// container the primary cannot decode (lib/ai/stt/fallback.ts), so OPENAI_API_KEY — which
// production already holds for TTS — now also buys transcription on a failed turn. It is
// the most expensive rate in lib/ai/stt/pricing.ts and it is tried LAST for that reason; an
// operator who does not want it sets STT_FALLBACK_ADAPTERS=groq.
// ============================================================================

import type { SttAdapter } from "./types";
import { readSttJsonBody, sttUploadFilename } from "./types";
import { sttCostUsd } from "./pricing";

export const openaiSttAdapter: SttAdapter = {
  name: "openai",
  async transcribe(audio, opts) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY not set");
    // WO-VOICE-0 bake-off ratified whisper-1 as the V1 default: comparable safety-term
    // recall to gpt-4o-transcribe (0.69 vs 0.67) AND it returns verbose_json segment
    // avg_logprob, the only signal that powers the secondary confidence tripwire.
    // Env-overridable (engine behind config).
    const model = process.env.OPENAI_STT_MODEL || "whisper-1";

    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array(audio)], { type: opts?.mimeType || "audio/ogg" }),
      sttUploadFilename(opts?.mimeType));
    fd.append("model", model);
    fd.append("response_format", model === "whisper-1" ? "verbose_json" : "json");
    // WO-VOICE-QUALITY (a) — pass language explicitly, defaulting to Arabic.
    fd.append("language", opts?.languageHint || "ar");
    // WO-VOICE-QUALITY (b) — domain prompt-biasing (tenant menu + ordering words).
    if (opts?.prompt) fd.append("prompt", opts.prompt);

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: fd,
      // Unset on the normal path; the empty-transcript fallback always supplies a deadline.
      signal: opts?.signal,
    });
    // NOT `.catch(() => ({}))` — that turned an abandoned request into an empty transcript.
    const j = (await readSttJsonBody(res)) as {
      text?: string;
      duration?: number;
      segments?: Array<{ avg_logprob?: number }>;
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(`OpenAI STT ${res.status}: ${j?.error?.message ?? "error"}`);
    const durationSec = typeof j.duration === "number" ? j.duration : undefined;
    // Confidence = exp(min segment avg_logprob), matching scripts/voice/score_bakeoff.py.
    // The worst segment governs (a single garbled window is the risk). Undefined when
    // segments are absent (non-verbose models) → the secondary tripwire stays inert.
    let confidence: number | undefined;
    const logprobs = (j.segments ?? [])
      .map((s) => (typeof s.avg_logprob === "number" ? s.avg_logprob : undefined))
      .filter((v): v is number => v !== undefined);
    if (logprobs.length > 0) confidence = Math.exp(Math.min(...logprobs));
    return {
      text: String(j.text ?? ""),
      model,
      adapter: "openai",
      durationSec,
      confidence,
      costUsd: sttCostUsd(`openai:${model}`, durationSec),
    };
  },
};
