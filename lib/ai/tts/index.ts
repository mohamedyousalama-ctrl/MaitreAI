// ============================================================================
// MaitreAI — TTS adapter resolver + fallback wrapper (WO-VOICE-2).
// Selection (env flip, zero code change):
//   TTS_ADAPTER = mock | elevenlabs | openai  (explicit), else auto:
//   ELEVENLABS_API_KEY → elevenlabs, OPENAI_API_KEY → openai, else mock.
// Default is mock so the voice path works with no spend until a real provider +
// ElevenLabs voice are provisioned + selected (owner approval — paid key).
//
// FALLBACK LAW: when the primary is ElevenLabs and it fails (outage/quota/error),
// synthesizeVoiceReply automatically falls back to OpenAI onyx and flags fellBack
// so the caller fires an alert — a voice reply is NEVER silently dropped. The
// customer always has the text regardless (voice is additive-only).
// ============================================================================

import type { TtsAdapter, TtsResult, TtsSynthesizeOptions } from "./types";
import { mockTtsAdapter } from "./mock";
import { elevenlabsTtsAdapter } from "./elevenlabs";
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
  if (process.env.ELEVENLABS_API_KEY) return elevenlabsTtsAdapter;
  if (process.env.OPENAI_API_KEY) return openaiTtsAdapter;
  return mockTtsAdapter;
}

/** The adapter's governance refusals, tagged so the fallback law can tell "we refuse to
 *  speak as this voice" apart from "ElevenLabs is down". Matched on a marker the adapter
 *  puts in the message rather than on prose, so rewording an error cannot silently
 *  re-open the fallback. */
export const VOICE_REFUSAL_MARKER = "ElevenLabs TTS refused:";

export function isVoiceGovernanceRefusal(message: string): boolean {
  return message.includes(VOICE_REFUSAL_MARKER);
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
    // That is a fail-OPEN on "while G0-R is BLOCKED: no provider voice generation" — the
    // guard refused, and the refusal produced generation anyway. It also defeats the
    // reason the check was put in the adapter at all, which was to cover this caller.
    // A refusal means we do not know whose voice this is; the answer to that is silence
    // and the text reply, never a substitute.
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
