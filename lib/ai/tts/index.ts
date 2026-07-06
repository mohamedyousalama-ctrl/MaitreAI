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

export function getTtsAdapter(): TtsAdapter {
  const sel = (process.env.TTS_ADAPTER || "").toLowerCase();
  if (sel === "elevenlabs") return elevenlabsTtsAdapter;
  if (sel === "openai") return openaiTtsAdapter;
  if (sel === "mock") return mockTtsAdapter;
  if (process.env.ELEVENLABS_API_KEY) return elevenlabsTtsAdapter;
  if (process.env.OPENAI_API_KEY) return openaiTtsAdapter;
  return mockTtsAdapter;
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
