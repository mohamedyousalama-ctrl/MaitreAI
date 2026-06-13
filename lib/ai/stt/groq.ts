// ============================================================================
// MaitreAI — Groq STT adapter (Sprint 9, S9-6) — candidate B
// Groq-hosted Whisper via its OpenAI-compatible audio endpoint. INERT until
// GROQ_API_KEY is provisioned (owner approval — new paid key). Default
// whisper-large-v3-turbo (fast + cheapest); verbose_json returns duration.
// ============================================================================

import type { SttAdapter } from "./types";
import { sttCostUsd } from "./pricing";

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
    if (opts?.languageHint) fd.append("language", opts.languageHint);

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: fd,
    });
    const j = (await res.json().catch(() => ({}))) as { text?: string; duration?: number; error?: { message?: string } };
    if (!res.ok) throw new Error(`Groq STT ${res.status}: ${j?.error?.message ?? "error"}`);
    const durationSec = typeof j.duration === "number" ? j.duration : undefined;
    return {
      text: String(j.text ?? ""),
      model,
      adapter: "groq",
      durationSec,
      costUsd: sttCostUsd(`groq:${model}`, durationSec),
    };
  },
};
