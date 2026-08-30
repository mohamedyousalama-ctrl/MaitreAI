// ============================================================================
// MaitreAI — TTS adapter resolver + fallback wrapper (WO-VOICE-2).
// Selection is EXPLICIT ONLY: TTS_ADAPTER = mock | elevenlabs | openai. Nothing is
// inferred from the presence of a key — see the note in getTtsAdapter(). Default is mock,
// so the voice path works end to end with no spend and no provider until one is pinned
// on purpose.
//
// FALLBACK LAW, and its two exceptions. When ElevenLabs is DOWN, synthesizeVoiceReply
// falls back to OpenAI onyx and flags fellBack so the caller alerts — a customer waiting on
// an order is better served by any voice than by silence, and they have the text either way.
// It does NOT fall back on (a) a voice-registry refusal or (b) a 4xx: both mean something is
// misconfigured rather than unavailable, both are permanent until a human acts, and
// answering either with a different voice ships the wrong one on every turn forever.
// ============================================================================

import type { TtsAdapter, TtsResult, TtsSynthesizeOptions } from "./types";
import { mockTtsAdapter } from "./mock";
import { elevenlabsTtsAdapter, TTS_CONFIG_FAULT } from "./elevenlabs";
import { openaiTtsAdapter } from "./openai";

// (agent-eval re-kick: real path-matching change so the paths filter triggers CI.)
export function getTtsAdapter(): TtsAdapter {
  // TRIMMED: a caller that trimmed this value while this function did not would "pin"
  // `" mock "` and then fall through to key inference here and resolve to OpenAI — buying
  // an onyx synthesis on every turn and discarding it.
  const sel = (process.env.TTS_ADAPTER || "").trim().toLowerCase();
  if (sel === "elevenlabs") return elevenlabsTtsAdapter;
  if (sel === "openai") return openaiTtsAdapter;
  if (sel === "mock") return mockTtsAdapter;
  // NO PROVIDER IS EVER INFERRED. An explicit TTS_ADAPTER, or nothing speaks.
  //
  // A first attempt at this removed only the ElevenLabs half and left the OpenAI line
  // standing — which made the failure WORSE, not better. Production always has
  // OPENAI_API_KEY, so a live WhatsApp turn with TTS_ADAPTER forgotten fell straight past
  // the deleted line onto `openaiTtsAdapter` and bought an `onyx` synthesis: an American
  // male voice reading Arabic, transmitted to a real customer, with the voice registry
  // never consulted at all. Driven: `hosts contacted: ["api.openai.com","graph.facebook.com"]`,
  // `whatsapp audio sent? true`. That is the exact substitution the registry exists to
  // prevent, arriving through the front door rather than the fallback — in the function
  // rewritten to prevent it.
  //
  // Half a fix was worse than none: before, the same misconfiguration at least reached
  // ElevenLabs and the registry. Now nothing is inferred, so a half-finished configuration
  // is genuinely silent everywhere rather than live in the wrong voice.
  return mockTtsAdapter;
}

/** The adapter's governance refusals, tagged so the fallback law can tell "we refuse to
 *  speak as this voice" apart from "ElevenLabs is down". Matched on a marker the adapter
 *  puts in the message rather than on prose, so rewording an error cannot silently
 *  re-open the fallback. */
export const VOICE_REFUSAL_MARKER = "ElevenLabs TTS refused:";

export function isVoiceGovernanceRefusal(message: string): boolean {
  return message.includes(VOICE_REFUSAL_MARKER) || message.includes(TTS_CONFIG_FAULT);
}

export interface VoiceReplyResult {
  result: TtsResult;
  /** True when the primary (ElevenLabs) failed and we fell back to OpenAI onyx. */
  fellBack: boolean;
  /** The primary error message when a fallback happened (for the alert), else null. */
  primaryError: string | null;
}

/**
 * Synthesize a voice reply with the fallback law applied. Returns null only when
 * BOTH the primary and the onyx fallback fail (or no provider is configured and
 * mock produced nothing) — the caller then simply sends text-only. Never throws.
 */
export async function synthesizeVoiceReply(text: string, opts?: TtsSynthesizeOptions): Promise<VoiceReplyResult | null> {
  const primary = getTtsAdapter();
  try {
    const result = await primary.synthesize(text, opts);
    return { result, fellBack: false, primaryError: null };
  } catch (primaryErr) {
    const primaryError = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);

    // A REFUSAL IS NOT AN OUTAGE, AND MUST NOT BE ANSWERED BY BUYING A DIFFERENT VOICE.
    //
    // The fallback law exists for a provider that is DOWN: a customer waiting on an order
    // is better served by any voice than by silence. It was catching the voice registry's
    // refusals too — so pinning the G0-R QUARANTINED object, or a stock voice, or a typo,
    // did not stop the turn: it bought an OpenAI `onyx` synthesis and sent an American
    // male voice reading Najdi Arabic to a real WhatsApp customer. An audit drove exactly
    // that: `voiceId=VuqFqWXHibJ61b9IiVJ7` → `hosts contacted: ["api.openai.com"]`.
    //
    // That is a fail-OPEN on the rule the registry exists to enforce — no legacy or
    // donor-derived object may be generated or exposed (G0-R, scoped by Founder ruling on
    // KIV-90). The guard refused, and the refusal produced generation anyway. It also
    // defeats the reason the check was put in the adapter at all, which was to cover this
    // caller. Note the failure was never about WHICH voice replaced it: substituting any
    // voice for one we have refused is the defect.
    // A refusal means we do not know whose voice this is; the answer to that is silence
    // and the text reply, never a substitute.
    // Covers both a registry refusal and a 4xx configuration fault — see the marker's
    // definition. Neither is fixed by generating a different voice, and both are permanent
    // until a human changes something, so substituting would ship the wrong voice on every
    // turn rather than bridging a blip.
    if (isVoiceGovernanceRefusal(primaryError)) return null;

    // Only ElevenLabs has an automatic fallback target (onyx). If the primary was
    // already OpenAI/mock, there is nothing to fall back to → text-only.
    if (primary.name !== "elevenlabs") return null;
    try {
      const result = await openaiTtsAdapter.synthesize(text, opts);
      return { result, fellBack: true, primaryError };
    } catch {
      return null;
    }
  }
}

export type { TtsAdapter, TtsResult } from "./types";
