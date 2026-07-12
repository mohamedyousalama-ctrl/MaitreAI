// ============================================================================
// MaitreAI — OpenAI STT adapter (Sprint 9, S9-6) — candidate A
// Whisper-family via the OpenAI audio transcriptions API. INERT until
// OPENAI_API_KEY is provisioned (owner approval — new paid key). Model is
// env-selectable (default gpt-4o-mini-transcribe; whisper-1 gives verbose_json
// with duration for exact cost).
// ============================================================================

import type { SttAdapter } from "./types";
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
    fd.append("file", new Blob([new Uint8Array(audio)], { type: opts?.mimeType || "audio/ogg" }), "audio.ogg");
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
    });
    const j = (await res.json().catch(() => ({}))) as {
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
