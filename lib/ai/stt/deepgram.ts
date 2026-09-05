// ============================================================================
// MaitreAI — Deepgram STT adapter (WO-VOICE-DEEPGRAM-SPIKE) — candidate C.
// Deepgram Nova-3 pre-recorded transcription with native KEYTERM prompting from the
// tenant menu (allergen words excluded — see deepgram-keyterms). INERT until
// DEEPGRAM_API_KEY is provisioned AND STT_ADAPTER=deepgram is selected — NO default
// change (the auto-resolver never falls through to deepgram). The URL builder is PURE
// so the request shaping (model, language, keyterms) is unit-tested WITHOUT a key;
// DEEPGRAM_API_KEY gates ONLY the live network call.
//
// KNOWN LIMIT: it answers 200 with an EMPTY transcript and confidence 0 for `audio/mp4`,
// the only container iOS Safari records — measured, four for four, on 130 KB clips.
// lib/ai/stt/fallback.ts is what rescues those turns; see the note in `containerType`.
// ============================================================================

import type { SttAdapter } from "./types";
import { readSttJsonBody } from "./types";
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
 * IT WAS NOT THE PARAMETER — production stripped it and got the same empty transcript, then
 * retried with no Content-Type at all and got a third. The strip stays because it is the
 * correct thing to send either way: Deepgram documents this header as the container, and a
 * codec parameter is not one. It is no longer offered as a fix for the iPhone. That is
 * lib/ai/stt/fallback.ts, which hands the same bytes to an engine that can read them.
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

    // ONE POST. The Content-Type is the container, with the `codecs=` parameter stripped —
    // `codecs=` is a MediaRecorder detail, not a container type, and Deepgram documents this
    // header as the container.
    const headers: Record<string, string> = {
      Authorization: `Token ${key}`,
      "Content-Type": containerType(opts?.mimeType),
    };
    const r = await fetch(url, {
      method: "POST",
      headers,
      body: new Uint8Array(audio),
      // Unset on the normal path; the empty-transcript fallback always supplies a deadline.
      signal: opts?.signal,
    });
    // NOT `.catch(() => ({}))` — that turned an abandoned request into an empty transcript.
    const body = (await readSttJsonBody(r)) as { err_msg?: string };
    if (!r.ok) throw new Error(`Deepgram STT ${r.status}: ${body?.err_msg ?? "error"}`);
    const parsed = parseDeepgramResponse(body);

    // THE SECOND ATTEMPT THAT USED TO LIVE HERE IS GONE, BECAUSE IT WAS ANSWERED.
    //
    // An empty transcript used to buy one retry with no Content-Type at all, so the provider
    // would sniff the container out of the bytes. That existed to decide one question — is
    // the iPhone failure a header problem or a decoder problem — and production decided it:
    //
    //     [stt/deepgram] empty transcript on "audio/mp4" — retried without Content-Type: still empty
    //
    // Both attempts empty, on 130 KB of real speech. The container is the problem, so no way
    // of describing it will help, and a disproven experiment left running is just a second
    // round trip of dead air on the one turn that was already failing. The recovery it was a
    // stand-in for now lives in lib/ai/stt/fallback.ts, where a DIFFERENT ENGINE gets the
    // bytes; the seam in lib/messaging/voice.ts calls it on exactly this empty result.

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
