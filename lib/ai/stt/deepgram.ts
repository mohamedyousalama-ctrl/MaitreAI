// ============================================================================
// MaitreAI — Deepgram STT adapter (WO-VOICE-DEEPGRAM-SPIKE) — candidate C.
// Deepgram Nova-3 pre-recorded transcription with native KEYTERM prompting from the
// tenant menu (allergen words excluded — see deepgram-keyterms). INERT until
// DEEPGRAM_API_KEY is provisioned AND STT_ADAPTER=deepgram is selected — NO default
// change (the auto-resolver never falls through to deepgram). The URL builder is PURE
// so the request shaping (model, language, keyterms) is unit-tested WITHOUT a key;
// DEEPGRAM_API_KEY gates ONLY the live network call.
// ============================================================================

import type { SttAdapter } from "./types";
import { sttCostUsd } from "./pricing";

const DEEPGRAM_ENDPOINT = "https://api.deepgram.com/v1/listen";

/**
 * Build the Deepgram listen URL. Pure + key-independent. Nova-3 keyterm prompting uses
 * repeated `keyterm` query params (capped defensively at 80). language defaults to ar.
 */
export function buildDeepgramUrl(opts: {
  model?: string;
  language?: string;
  keyterms?: string[];
}): string {
  const params = new URLSearchParams();
  params.set("model", opts.model || "nova-3");
  params.set("language", opts.language || "ar");
  params.set("smart_format", "true");
  params.set("punctuate", "true");
  for (const kt of (opts.keyterms ?? []).slice(0, 80)) {
    const t = String(kt ?? "").trim();
    if (t) params.append("keyterm", t);
  }
  return `${DEEPGRAM_ENDPOINT}?${params.toString()}`;
}

/** Parse a Deepgram pre-recorded response into text + confidence + duration. Pure. */
export function parseDeepgramResponse(j: unknown): { text: string; confidence?: number; durationSec?: number } {
  const r = (j ?? {}) as {
    results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string; confidence?: number }> }> };
    metadata?: { duration?: number };
  };
  const alt = r.results?.channels?.[0]?.alternatives?.[0];
  return {
    text: String(alt?.transcript ?? ""),
    confidence: typeof alt?.confidence === "number" ? alt.confidence : undefined,
    durationSec: typeof r.metadata?.duration === "number" ? r.metadata.duration : undefined,
  };
}

export const deepgramSttAdapter: SttAdapter = {
  name: "deepgram",
  async transcribe(audio, opts) {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) throw new Error("DEEPGRAM_API_KEY not set");
    const model = process.env.DEEPGRAM_STT_MODEL || "nova-3";
    const url = buildDeepgramUrl({ model, language: opts?.languageHint || "ar", keyterms: opts?.keyterms });

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": opts?.mimeType || "audio/ogg" },
      body: new Uint8Array(audio),
    });
    const j = (await res.json().catch(() => ({}))) as { err_msg?: string };
    if (!res.ok) throw new Error(`Deepgram STT ${res.status}: ${j?.err_msg ?? "error"}`);
    const parsed = parseDeepgramResponse(j);
    return {
      text: parsed.text,
      model,
      adapter: "deepgram",
      durationSec: parsed.durationSec,
      confidence: parsed.confidence,
      costUsd: sttCostUsd(`deepgram:${model}`, parsed.durationSec),
    };
  },
};
