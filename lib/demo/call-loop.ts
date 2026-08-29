// ============================================================================
// MaitreAI — the demo voice call's two DECISIONS, as pure functions.
//
// WHY THESE LIVE OUTSIDE THE COMPONENT. The call loop's real logic is "when did they stop
// talking?" and "what do we do with this response?" — and inside a React component both are
// reachable only through a microphone and a network, which means in practice neither gets
// tested and both get reasoned about by reading. This repo has been bitten four separate
// times by an assertion that matched a NAME rather than a BEHAVIOUR; a decision that can
// only be inspected is the same trap one level up.
//
// Pulled out here, the end-of-speech detector can be driven with a synthetic waveform —
// a real one, including the cases that matter: a natural pause mid-sentence must NOT end
// the turn, a silent room must never upload a clip, and a visitor who talks past the
// ceiling must still be heard rather than cut into nothing.
// ============================================================================

/** Above the noise floor of an ordinary room, below normal speech. */
export const SPEECH_RMS = 0.045;
/** Quiet for this long AFTER speech began ends the turn. A pause between words in Arabic
 *  running speech is comfortably under a second; a turn-ending pause is longer. Too short
 *  and the visitor gets interrupted mid-sentence, which is the failure people notice. */
export const HANGOVER_MS = 1100;
/** Nobody spoke at all. Ends the turn WITHOUT uploading, because a clip of silence still
 *  costs a transcription and still counts against the visitor's turn budget. */
export const NO_SPEECH_MS = 8000;

export type VadState = {
  heardSpeech: boolean;
  /** When the current run of quiet began; 0 while sound is present. */
  quietSince: number;
  startedAt: number;
};

export type VadVerdict = "listening" | "spoke" | "silent" | "cutoff";

export function newVadState(now: number): VadState {
  return { heardSpeech: false, quietSince: 0, startedAt: now };
}

/**
 * Advance the end-of-speech detector by one sample. Returns the verdict for THIS instant;
 * the caller stops on anything other than "listening".
 *
 * `maxMs` is the hard ceiling on one turn. Reaching it with speech already heard yields
 * "spoke" — we send what we have rather than discarding a long answer, because throwing
 * away a visitor's sentence because they were verbose is worse than a slightly long clip.
 * Reaching it with NO speech is "cutoff", which the caller must treat like silence: there
 * is nothing to transcribe.
 */
export function vadStep(state: VadState, rms: number, now: number, maxMs: number): VadVerdict {
  if (rms > SPEECH_RMS) {
    state.heardSpeech = true;
    state.quietSince = 0;
  } else if (state.heardSpeech && state.quietSince === 0) {
    state.quietSince = now;
  }

  if (state.heardSpeech && state.quietSince > 0 && now - state.quietSince >= HANGOVER_MS) {
    return "spoke";
  }
  // Checked BEFORE the ceiling: a room that was silent the whole time should say so at
  // 8 seconds rather than waiting out a 20-second maximum with the microphone open.
  if (!state.heardSpeech && now - state.startedAt >= NO_SPEECH_MS) return "silent";
  if (now - state.startedAt >= maxMs) return state.heardSpeech ? "spoke" : "cutoff";
  return "listening";
}

export type CallAction =
  /** Play the audio, then listen again. */
  | { kind: "speak" }
  /** Show the reply as text, then listen again — a hard-zero turn, working as intended. */
  | { kind: "show_text"; note: "text_only" }
  /** Stop the loop and tell the visitor why. */
  | { kind: "end"; reason: "rate_limited" | "unavailable" | "error" };

/**
 * What to do with a response from /api/demo/voice.
 *
 * A CAP IS AN ANSWER, NOT A GLITCH. A hands-free loop produces turns far faster than a
 * person typing, so a 429 or a 503 ENDS the call. Retrying would let the client decide how
 * much money an unauthenticated page may spend, and the client is the one party that must
 * never hold that decision.
 *
 * NO AUDIO IS NOT A FAILURE. Safety, money, payment-link and receipt replies are text-only
 * by product rule. Those turns come back with a reply and no audio, and the loop continues
 * — showing the text. Treating them as an error would end a call precisely when the demo
 * is doing the thing it exists to demonstrate.
 */
export function callResponseAction(status: number, hasAudio: boolean): CallAction {
  if (status === 429) return { kind: "end", reason: "rate_limited" };
  if (status === 503) return { kind: "end", reason: "unavailable" };
  if (status < 200 || status >= 300) return { kind: "end", reason: "error" };
  return hasAudio ? { kind: "speak" } : { kind: "show_text", note: "text_only" };
}
