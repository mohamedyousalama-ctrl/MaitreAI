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
    const model = process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe";

    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array(audio)], { type: opts?.mimeType || "audio/ogg" }), "audio.ogg");
    fd.append("model", model);
    fd.append("response_format", model === "whisper-1" ? "verbose_json" : "json");
    if (opts?.languageHint) fd.append("language", opts.languageHint);

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: fd,
    });
    const j = (await res.json().catch(() => ({}))) as { text?: string; duration?: number; error?: { message?: string } };
    if (!res.ok) throw new Error(`OpenAI STT ${res.status}: ${j?.error?.message ?? "error"}`);
    const durationSec = typeof j.duration === "number" ? j.duration : undefined;
    return {
      text: String(j.text ?? ""),
      model,
      adapter: "openai",
      durationSec,
      costUsd: sttCostUsd(`openai:${model}`, durationSec),
    };
  },
};
