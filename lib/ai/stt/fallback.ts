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
// ONLY WHEN THE TURN HAS ALREADY FAILED, ONLY WITH A KEY THE OPERATOR NAMED, ONLY INSIDE
// ONE DEADLINE. An empty transcript means the caller was about to get a 422 and hear
// nothing, so a rescue costs one transcription on a turn that was returning zero. A turn
// that produced words never reaches this code. A second engine that DECODES the audio and
// honestly finds no words ends it — only a failed attempt is worth paying the next engine
// for.
// ============================================================================

import type { SttAdapter, SttResult, SttTranscribeOptions } from "./types";
import { groqSttAdapter } from "./groq";
import { openaiSttAdapter } from "./openai";

/** Candidates in order, each gated on its OWN key. `mock` is absent by construction: this
 *  list is the only thing the fallback will consider, and it cannot name the invented
 *  transcript even by accident. Deepgram is absent too — it is the engine being fallen back
 *  FROM, and a retry of the thing that just returned nothing is not a fallback. */
const CANDIDATES: ReadonlyArray<{ adapter: SttAdapter; keyed: () => boolean }> = [
  // Whisper large v3 turbo — fastest of the two, and about NINE TIMES cheaper than
  // openai:whisper-1 (lib/ai/stt/pricing.ts). Order is a cost decision, not a preference.
  { adapter: groqSttAdapter, keyed: () => !!process.env.GROQ_API_KEY },
  { adapter: openaiSttAdapter, keyed: () => !!process.env.OPENAI_API_KEY },
];

/**
 * Which of the candidates an operator will allow, from `STT_FALLBACK_ADAPTERS`.
 *
 * THIS PRODUCT DOES NOT INFER PAID PROVIDERS FROM KEY PRESENCE — a rule it wrote after an
 * inferred provider shipped an American voice reading Arabic to a real customer, and the
 * reason `STT_ADAPTER=deepgram` is explicit-only. A rescue chain gated on nothing but
 * `OPENAI_API_KEY` — which production already holds for TTS — would quietly re-introduce
 * exactly that inference, and whisper-1 is the most expensive rate in the price table.
 *
 * So it is nameable and it is loggable. It is also ON BY DEFAULT, deliberately: the failure
 * being fixed is total silence on every iPhone that calls the demo, and a fix that needs a
 * new variable set before it does anything is not a fix on the day it ships. What the
 * variable buys is the ability to say NO, in writing, without a deploy:
 *
 *   unset            → groq, then openai  (the default chain)
 *   "groq"           → groq only — never spend on whisper-1
 *   "" or "none"     → no rescue at all; an unreadable container stays a dead turn
 *
 * Unknown names are ignored rather than throwing: a typo in a deployment variable must not
 * be able to take down transcription.
 */
function allowedFallbackNames(): string[] | null {
  const raw = process.env.STT_FALLBACK_ADAPTERS;
  if (raw === undefined) return null; // unset → the full default chain
  return raw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
}

/** The candidates this environment permits, in cost order, excluding the engine that just
 *  failed. One place, so the readout and the runtime can never disagree. */
function eligibleCandidates(primaryName: string): ReadonlyArray<{ adapter: SttAdapter; keyed: () => boolean }> {
  const allow = allowedFallbackNames();
  return CANDIDATES.filter(
    (c) => c.adapter.name !== primaryName && c.keyed() && (allow === null || allow.includes(c.adapter.name))
  );
}

/**
 * How long the WHOLE fallback may take before the turn gives up — every candidate, summed,
 * not each one.
 *
 * PER-CANDIDATE WAS THE BUG. A budget created inside the loop reads as a deadline and
 * behaves as a multiplier: with both keys set — the state you actually want — two candidates
 * at eight seconds is a caller holding a silent phone for sixteen. One clock, started once,
 * shared by every attempt, is the only shape whose worst case matches its name.
 *
 * WHY FOUR SECONDS. This path adds a network call to a live phone call, and nothing else in
 * the seam is bounded at all: no adapter passed a signal, and the call screen posts to
 * /api/demo/voice with no timeout of its own, so a provider that accepts the connection and
 * never answers used to mean a caller waiting forever. Whisper answers a clip this short in
 * well under a second, so four seconds is already several times over — and this codebase
 * treated 1.8-5.5s of dead air as a defect worth rewriting the reply pipeline for
 * (5adf5de, "play the reply while it is still being spoken"). Anything slower than four
 * seconds has lost the caller whether or not it eventually returns words.
 */
export const STT_FALLBACK_TIMEOUT_MS = 4_000;

/** True when a transcript is empty in the way that means "no words came back" — the
 *  provider's own success shape for both a silent room and a container it could not
 *  decode. The caller cannot tell those apart; that ambiguity is why this exists. */
export function isEmptyTranscript(r: { text?: string } | null | undefined): boolean {
  return !String(r?.text ?? "").trim();
}

/** Which engines could be tried right now, by name — never a key, never a value.
 *
 *  Consumed by `readSttHealth` (lib/ai/stt/index.ts), which the settings health route
 *  surfaces, so "is a rescue even possible in this deployment?" is answered BEFORE a
 *  prospect makes the call that would otherwise discover it. */
export function availableFallbackAdapters(primaryName: string): string[] {
  return eligibleCandidates(primaryName).map((c) => c.adapter.name);
}

/** The fallback's own deadline, combined with any deadline the caller already set rather
 *  than replacing it — a bound a caller can silently remove is not a bound, and a caller's
 *  cancellation the fallback ignores would keep spending after the turn is gone. */
function boundedSignal(caller: AbortSignal | undefined, deadline: AbortSignal): AbortSignal {
  return caller ? AbortSignal.any([caller, deadline]) : deadline;
}

/** What a fallback attempt cost and whether it produced words. `extraCostUsd` is reported
 *  even when nothing recovers, because the providers bill for the attempt either way and
 *  the daily spend alert sums `agent_runs.cost_usd` — the same argument that makes a
 *  RECOVERED turn report both bills applies exactly as much to a failed one. */
export interface SttFallbackOutcome {
  recovered: SttResult | null;
  extraCostUsd: number;
}

/**
 * Try a second engine on audio the first one produced no words for.
 *
 * Never throws: a rescue that can fail the turn it is rescuing would be worse than the
 * silence it is fixing. Returns `recovered: null` when there is nothing to try, nothing
 * recovers, or every candidate fails.
 *
 * ONE FAILURE ADVANCES, ONE CLEAN EMPTY STOPS. A candidate that THREW gave no answer, so
 * the next engine is worth its price. A candidate that decoded the audio and honestly
 * reported no words HAS answered — a second Whisper will not disagree with the first about
 * a quiet room, and paying it to reconfirm silence is spend with a known-zero return. The
 * older shape logged «the clip is probably silent» and then immediately billed another
 * provider to check.
 */
export async function transcribeWithFallback(
  primaryName: string,
  bytes: Buffer,
  opts: SttTranscribeOptions
): Promise<SttFallbackOutcome> {
  const container = JSON.stringify(String(opts.mimeType ?? "").slice(0, 40));
  const nothing: SttFallbackOutcome = { recovered: null, extraCostUsd: 0 };

  // NO BYTES, NO SECOND OPINION. `transcribeWhatsAppVoice` substitutes an EMPTY buffer when
  // the media download fails (voice.ts: `media?.bytes ?? Buffer.from([])`), and an empty
  // clip is the one empty transcript no engine can disagree about. Paying a second provider
  // to confirm that zero bytes contain no words is spend with no possible upside.
  if (bytes.length === 0) return nothing;

  const eligible = eligibleCandidates(primaryName);

  // NOT SILENCE ABOUT SILENCE. Without this line an environment with no second engine
  // behaves exactly like one where the rescue ran and failed, and the only way to tell them
  // apart is to read the deployment's variables during an incident. It says what to
  // provision, once, on a turn that already failed.
  if (eligible.length === 0) {
    console.warn(
      `[stt/fallback] ${primaryName} returned nothing for ${container} and NO fallback engine is ` +
        `configured — set GROQ_API_KEY or OPENAI_API_KEY (or widen STT_FALLBACK_ADAPTERS)`
    );
    return nothing;
  }

  // ONE clock for the whole rescue, started before the first attempt and shared by every
  // one of them — see STT_FALLBACK_TIMEOUT_MS.
  const deadline = AbortSignal.timeout(STT_FALLBACK_TIMEOUT_MS);
  let extraCostUsd = 0;

  for (const c of eligible) {
    try {
      const out = await c.adapter.transcribe(bytes, {
        ...opts,
        signal: boundedSignal(opts.signal, deadline),
      });
      extraCostUsd += out.costUsd || 0;
      if (!isEmptyTranscript(out)) {
        console.warn(
          `[stt/fallback] ${primaryName} returned nothing for ${container} — ${c.adapter.name} RECOVERED it`
        );
        return { recovered: out, extraCostUsd };
      }
      // Two engines, no words, and the second one DECODED the audio to say so. This is a
      // quiet room, not a broken container — the one case where the 422 the caller is about
      // to send is the correct answer. Stop: nothing further can change it.
      console.warn(`[stt/fallback] ${c.adapter.name} decoded the audio and found no words — the clip is silent`);
      return { recovered: null, extraCostUsd };
    } catch (e) {
      // A rescue that throws must not become the turn's error. An abandoned attempt is
      // reported HERE as a failure, not upstream as an empty transcript — see
      // readSttJsonBody in ./types, which is what makes that distinction survive.
      console.warn(`[stt/fallback] ${c.adapter.name} failed: ${String((e as Error)?.message ?? e).slice(0, 160)}`);
    }
  }
  return { recovered: null, extraCostUsd };
}
