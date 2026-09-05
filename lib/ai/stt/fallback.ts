// ============================================================================
// MaitreAI — A SECOND ENGINE, FOR THE CONTAINER THE FIRST ONE CANNOT READ.
//
// An iPhone has never completed a turn on this product. Every call from iOS Safari uploads
// `audio/mp4; codecs=mp4a.40.2` — the only container iOS records — and Deepgram nova-3
// answers 200 with an EMPTY transcript and `confidence=0`, every time, on 40-130 KB of real
// speech. Desktop containers transcribe fine on the same key and model.
//
// THE HEADER WAS NOT THE PROBLEM, AND THAT WAS A REAL GUESS THAT FAILED. The previous
// attempt stripped the `codecs=` parameter and, on an empty result, retried with no
// Content-Type at all so the provider would sniff the bytes. Production answered:
//
//     [stt/deepgram] empty transcript on "audio/mp4" — retried without Content-Type: still empty
//
// Both attempts empty. That line is the whole reason this file exists rather than a third
// header experiment: the engine cannot decode the container, so no way of describing it will
// help. The instrumentation earned its keep by disproving the fix it was shipped to confirm,
// and has since been removed — a disproven experiment left running is just latency.
//
// WHY WHISPER. The Groq and OpenAI adapters upload multipart with a real FILENAME —
// `sttUploadFilename()` maps `audio/mp4` to `audio.m4a` (types.ts:70) — and Whisper reads
// AAC-in-MP4 natively. That is a different mechanism, not a different guess: Deepgram is
// told what the bytes are, Whisper is handed a named file.
//
// NEVER THE MOCK, UNDER ANY CIRCUMSTANCES. `lib/ai/stt/mock.ts` returns a FIXED invented
// Arabic sentence. Falling back to it would make Khalid confidently answer something the
// customer never said — worse than silence by a wide margin, and the exact failure
// `assertMockSttAllowed` exists to prevent. It is excluded structurally below, not by a
// comment asking the next person to remember.
//
// ONLY ON EMPTY, ONLY ONCE, ONLY WITH A KEY, ONLY INSIDE A DEADLINE. An empty transcript
// means the turn has already failed — the caller turns it into a 422 and the visitor gets
// nothing — so a second attempt costs one transcription on a turn that was returning zero.
// A turn that produced words never reaches this code.
// ============================================================================

import type { SttAdapter, SttResult, SttTranscribeOptions } from "./types";
import { groqSttAdapter } from "./groq";
import { openaiSttAdapter } from "./openai";

/** Candidates in order, each gated on its OWN key. `mock` is absent by construction: this
 *  list is the only thing the fallback will consider, and it cannot name the invented
 *  transcript even by accident. Deepgram is absent too — it is the engine being fallen back
 *  FROM, and a retry of the thing that just returned nothing is not a fallback. */
const CANDIDATES: ReadonlyArray<{ adapter: SttAdapter; keyed: () => boolean }> = [
  // Whisper large v3 turbo — fastest of the two, and STT latency is already the second
  // biggest number in a call turn.
  { adapter: groqSttAdapter, keyed: () => !!process.env.GROQ_API_KEY },
  { adapter: openaiSttAdapter, keyed: () => !!process.env.OPENAI_API_KEY },
];

/**
 * How long one fallback attempt may take before it is abandoned.
 *
 * THIS PATH ADDS A NETWORK CALL TO A LIVE PHONE CALL, so it needs a deadline that the rest
 * of the seam does not have. Nothing upstream bounds STT: no adapter passed a signal, and
 * the call screen posts to /api/demo/voice with no timeout of its own — so a provider that
 * accepts the connection and never answers becomes a caller holding a silent phone forever.
 * Whisper returns in well under a second on clips this short; eight seconds is unmistakably
 * a hang rather than a slow transcription, and a bounded failure is a product, an unbounded
 * one is not.
 */
export const STT_FALLBACK_TIMEOUT_MS = 8_000;

/** True when a transcript is empty in the way that means "no words came back" — the
 *  provider's own success shape for both a silent room and a container it could not
 *  decode. The caller cannot tell those apart; that ambiguity is why this exists. */
export function isEmptyTranscript(r: { text?: string } | null | undefined): boolean {
  return !String(r?.text ?? "").trim();
}

/** Which engines could be tried right now, by name. Exported for the readout and the proof
 *  so "is a fallback even possible in this environment?" is an answerable question rather
 *  than something discovered during an incident. */
export function availableFallbackAdapters(primaryName: string): string[] {
  return CANDIDATES.filter((c) => c.adapter.name !== primaryName && c.keyed()).map((c) => c.adapter.name);
}

/** The fallback's own deadline, combined with any deadline the caller already set rather
 *  than replacing it — a bound a caller can silently remove is not a bound, and a caller's
 *  cancellation the fallback ignores would keep spending after the turn is gone. */
function boundedSignal(caller: AbortSignal | undefined, ms: number): AbortSignal {
  const deadline = AbortSignal.timeout(ms);
  return caller ? AbortSignal.any([caller, deadline]) : deadline;
}

/**
 * Try a second engine on audio the first one returned nothing for.
 *
 * Returns the recovered result, or null when there is nothing to try, nothing recovers, or
 * every candidate throws. Never throws: a fallback that can fail the turn it is rescuing
 * would be worse than the silence it is fixing.
 */
export async function transcribeWithFallback(
  primaryName: string,
  bytes: Buffer,
  opts: SttTranscribeOptions
): Promise<SttResult | null> {
  const container = JSON.stringify(String(opts.mimeType ?? "").slice(0, 40));

  // NO BYTES, NO SECOND OPINION. `transcribeWhatsAppVoice` substitutes an EMPTY buffer when
  // the media download fails (voice.ts: `media?.bytes ?? Buffer.from([])`), and an empty
  // clip is the one empty transcript no engine can disagree about. Paying a second provider
  // to confirm that zero bytes contain no words is spend with no possible upside.
  if (bytes.length === 0) return null;

  const eligible = CANDIDATES.filter((c) => c.adapter.name !== primaryName && c.keyed());

  // NOT SILENCE ABOUT SILENCE. Without this line an environment with no second key behaves
  // exactly like an environment where the fallback ran and failed, and the only way to tell
  // them apart is to read the deployment's variables during an incident. It says what to
  // provision, once, on a turn that already failed.
  if (eligible.length === 0) {
    console.warn(
      `[stt/fallback] ${primaryName} returned nothing for ${container} and NO fallback engine is ` +
        `configured — set GROQ_API_KEY or OPENAI_API_KEY to enable recovery`
    );
    return null;
  }

  for (const c of eligible) {
    try {
      const out = await c.adapter.transcribe(bytes, {
        ...opts,
        signal: boundedSignal(opts.signal, STT_FALLBACK_TIMEOUT_MS),
      });
      if (!isEmptyTranscript(out)) {
        console.warn(
          `[stt/fallback] ${primaryName} returned nothing for ${container} — ${c.adapter.name} RECOVERED it`
        );
        return out;
      }
      // Two engines, no words: this is a quiet room, not a broken decoder. Worth saying,
      // because it is the one case where the 422 the caller is about to send is CORRECT.
      console.warn(`[stt/fallback] ${c.adapter.name} also returned nothing — the clip is probably silent`);
    } catch (e) {
      // A fallback that throws must not become the turn's error. The primary already
      // decided this turn produces no words; this only ever had upside.
      console.warn(`[stt/fallback] ${c.adapter.name} failed: ${String((e as Error)?.message ?? e).slice(0, 160)}`);
    }
  }
  return null;
}
