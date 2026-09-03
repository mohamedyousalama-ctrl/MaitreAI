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

/**
 * The container, without the codec parameter. Pure.
 *
 * AN IPHONE HAS NEVER BEEN UNDERSTOOD ON THIS PATH, AND THIS IS THE FIRST SUSPECT.
 * Production, 3 Sep: four uploads from a real iPhone, `mime="audio/mp4; codecs=mp4a.40.2"`,
 * 130 KB of genuine audio each, and Deepgram answered 200 with an EMPTY transcript and
 * `confidence=0` every time — while desktop containers transcribed fine on the same
 * deployment, same key, same model. The visitor hears the greeting, speaks, and Khalid
 * never replies: the turn 422s on "no words".
 *
 * `codecs=` is a MediaRecorder detail, not a container type, and iOS Safari is the only
 * browser that puts one there — which lines the parameter up exactly with the failure.
 * Deepgram documents the Content-Type as the container; a parameter it does not expect is
 * a plausible reason for a decoder to return nothing rather than complain.
 *
 * PLAUSIBLE IS NOT PROVEN, and this cannot be proven from here — reproducing it needs an
 * iOS recorder and a Deepgram key in the same place, which no environment we control has.
 * So this is deliberately paired with the empty-transcript retry below rather than shipped
 * as a confident single fix: if stripping the parameter is the answer, the retry never
 * fires; if it is not, the retry says so in the log and the next call still works.
 */
export function containerType(mime: string | undefined | null): string {
  const base = String(mime ?? "").split(";")[0]!.trim().toLowerCase();
  return base || "audio/ogg";
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

    /** One POST. `contentType: null` sends NO Content-Type at all, which is how Deepgram is
     *  asked to sniff the container out of the bytes instead of being told what they are. */
    const post = async (contentType: string | null) => {
      const headers: Record<string, string> = { Authorization: `Token ${key}` };
      if (contentType) headers["Content-Type"] = contentType;
      const r = await fetch(url, { method: "POST", headers, body: new Uint8Array(audio) });
      const body = (await r.json().catch(() => ({}))) as { err_msg?: string };
      if (!r.ok) throw new Error(`Deepgram STT ${r.status}: ${body?.err_msg ?? "error"}`);
      return parseDeepgramResponse(body);
    };

    let parsed = await post(containerType(opts?.mimeType));

    // A SILENT EMPTY TRANSCRIPT IS A DECODE FAILURE WEARING A SUCCESS CODE.
    //
    // Deepgram answers 200 with `transcript: ""` both when the room was genuinely quiet and
    // when it could not decode the container at all — and on the iPhone path it has only
    // ever been the second (four for four, on 130 KB clips). The caller cannot tell those
    // apart either: app/api/demo/voice/route.ts turns both into the same 422, so a visitor
    // who spoke clearly gets the same nothing as a visitor who said nothing.
    //
    // So an empty result buys exactly ONE more attempt, with the Content-Type omitted so the
    // provider reads the container from the bytes. Bounded on purpose:
    //   • it fires only when the turn has ALREADY failed, so the worst case is one extra
    //     call on a turn that was returning nothing anyway;
    //   • only when a Content-Type was actually sent, so it can never loop;
    //   • never on genuinely silent audio in a container that decoded — that returns empty
    //     from BOTH attempts and costs one call, once.
    //
    // It logs which attempt won, because that is the measurement this bug still lacks: if
    // `sniffed` starts producing words, the Content-Type was the fault and the strip above
    // was not enough; if it stays empty, the container itself is the problem and the fix is
    // a different engine, not a different header. Either way the next real call answers it.
    if (!parsed.text.trim() && opts?.mimeType) {
      const sniffed = await post(null);
      console.warn(
        `[stt/deepgram] empty transcript on ${JSON.stringify(containerType(opts.mimeType))} — ` +
          `retried without Content-Type: ${sniffed.text.trim() ? "RECOVERED" : "still empty"}`
      );
      if (sniffed.text.trim()) parsed = sniffed;
    }

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
