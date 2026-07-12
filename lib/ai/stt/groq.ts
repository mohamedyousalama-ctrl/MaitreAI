// ============================================================================
// MaitreAI — Groq STT adapter (Sprint 9, S9-6) — candidate B
// Groq-hosted Whisper via its OpenAI-compatible audio endpoint. INERT until
// GROQ_API_KEY is provisioned (owner approval — new paid key). Default
// whisper-large-v3-turbo (fast + cheapest); verbose_json returns duration.
// ============================================================================

import type { SttAdapter } from "./types";
import { sttCostUsd } from "./pricing";

// WO-VOICE-QUALITY (c) — derive a [0,1] confidence from Whisper verbose_json segments,
// mirroring the OpenAI adapter's exp(min avg_logprob) (the worst segment governs — a
// single garbled window is the risk), additionally penalized by the max no_speech_prob
// (a segment the model thinks is non-speech). Undefined when no segments (→ the
// downstream secondary tripwire + garble guard stay inert on this turn).
export function confidenceFromSegments(
  segments?: Array<{ avg_logprob?: number; no_speech_prob?: number }>
): number | undefined {
  const logprobs = (segments ?? [])
    .map((s) => (typeof s.avg_logprob === "number" ? s.avg_logprob : undefined))
    .filter((v): v is number => v !== undefined && Number.isFinite(v));
  if (logprobs.length === 0) return undefined;
  const base = Math.exp(Math.min(...logprobs)); // in (0,1]
  const noSpeech = (segments ?? [])
    .map((s) => (typeof s.no_speech_prob === "number" ? s.no_speech_prob : 0))
    .reduce((mx, v) => Math.max(mx, v), 0);
  return Math.max(0, Math.min(base, 1 - noSpeech));
}

export const groqSttAdapter: SttAdapter = {
  name: "groq",
  async transcribe(audio, opts) {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error("GROQ_API_KEY not set");
    const model = process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo";

    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array(audio)], { type: opts?.mimeType || "audio/ogg" }), "audio.ogg");
    fd.append("model", model);
    fd.append("response_format", "verbose_json");
    // WO-VOICE-QUALITY (a) — pass the language explicitly; default to Arabic when the
    // caller gives no hint (the tenant base is Arabic; a wrong auto-detect on a short/
    // noisy clip is a top garble cause).
    fd.append("language", opts?.languageHint || "ar");
    // WO-VOICE-QUALITY (b) — domain prompt-biasing (tenant menu + ordering words).
    if (opts?.prompt) fd.append("prompt", opts.prompt);

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: fd,
    });
    const j = (await res.json().catch(() => ({}))) as {
      text?: string;
      duration?: number;
      segments?: Array<{ avg_logprob?: number; no_speech_prob?: number }>;
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(`Groq STT ${res.status}: ${j?.error?.message ?? "error"}`);
    const durationSec = typeof j.duration === "number" ? j.duration : undefined;
    return {
      text: String(j.text ?? ""),
      model,
      adapter: "groq",
      durationSec,
      confidence: confidenceFromSegments(j.segments),
      costUsd: sttCostUsd(`groq:${model}`, durationSec),
    };
  },
};
