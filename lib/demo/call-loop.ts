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

// ── THE FLOOR IS CALIBRATED TO THE ROOM, NOT A CONSTANT ─────────────────────
//
// A single absolute threshold was wrong in both directions, and an audit drove both:
//
//   * a room humming at rms 0.05 — an ordinary busy restaurant, which is the room this
//     product is SOLD INTO — sat above the constant, so the detector latched "speech"
//     immediately and never saw quiet again. Every turn ran to the 20-second ceiling and
//     uploaded 20 seconds of ambience to the transcriber: 7.6× the cost and an 8× slower
//     demo, with the "never upload silence" guard unreachable in exactly that room.
//   * a quiet speaker peaking at 0.030 never crossed it at all, and the call TERMINATED
//     on them with no retry.
//
// So the floor is derived from the room: measure the quietest moment of the first fraction
// of a second, and require speech to stand clearly above it.

/** Nothing below this is speech, whatever the room. Guards against a near-silent stream
 *  (a muted or dead microphone) calibrating to ~0 and then treating hiss as speech. */
export const ABSOLUTE_FLOOR = 0.02;
/** Speech has to be this many times the room's own noise. */
export const SPEECH_RATIO = 2.5;
/** How long we listen before deciding what "quiet" sounds like here. Six samples at the
 *  component's 60 ms cadence. The recorder is already running throughout, so nothing the
 *  visitor says is lost — only the DECISION waits. */
export const CALIBRATION_MS = 360;
/** The measured floor is clamped into this band. The upper bound matters: a visitor who
 *  starts talking the instant the turn opens would otherwise calibrate the room to their
 *  own voice and never be heard again. */
export const FLOOR_MIN = 0.002;
/** The clamp exists so a visitor who starts talking the instant the turn opens cannot
 *  calibrate the room to their own voice. At 0.06 it only NARROWED that case: the threshold
 *  could still pin at 0.15, so an immediate talker under that level was never heard and the
 *  call ended at 8s with «ما سمعت شي». 0.035 caps the threshold at ~0.088, below ordinary
 *  speech, while still sitting above the 0.05 hum of a busy restaurant. */
export const FLOOR_MAX = 0.035;

/** Retained as the ABSOLUTE_FLOOR's public name so existing callers and proofs keep
 *  working; it is now the floor of the calibrated threshold rather than the threshold. */
export const SPEECH_RMS = ABSOLUTE_FLOOR;
/** Quiet for this long AFTER speech began ends the turn. A pause between words in Arabic
 *  running speech is comfortably under a second; a turn-ending pause is longer. Too short
 *  and the visitor gets interrupted mid-sentence, which is the failure people notice.
 *
 *  TRIED AT 700 TO CUT PERCEIVED LATENCY, AND PUT BACK. It is the largest single
 *  contributor to the wait — time spent after the visitor has stopped talking, before the
 *  request is even sent — so it is the obvious thing to shorten. But this file's own proof
 *  asserts that 800ms and 1000ms gaps are PAUSES, not turn ends, and that is a claim about
 *  how Najdi running speech is actually spoken, not a tuning preference. At 700ms a visitor
 *  drawing breath mid-sentence gets cut off and loses the rest of it — and barge-in does
 *  not rescue that, because the clip has already been uploaded.
 *
 *  Editing the assertion to match a faster constant would have traded a real guarantee for
 *  a number. The latency is being taken out of the ~1s of server work that happens BEFORE
 *  the brain is even called, which costs the visitor nothing. */
export const HANGOVER_MS = 1100;
/** Nobody spoke at all. Ends the turn WITHOUT uploading, because a clip of silence still
 *  costs a transcription and still counts against the visitor's turn budget. */
export const NO_SPEECH_MS = 8000;

export type VadState = {
  heardSpeech: boolean;
  /** When the current run of quiet began; 0 while sound is present. */
  quietSince: number;
  startedAt: number;
  /** Quietest sample seen during calibration — the room's own noise. */
  noiseFloor: number;
  /** The live threshold: max(ABSOLUTE_FLOOR, noiseFloor × SPEECH_RATIO). Exposed so a
   *  caller (or a proof) can see what this room actually decided. */
  threshold: number;
  calibrating: boolean;
};

export type VadVerdict = "listening" | "spoke" | "silent" | "cutoff";

export function newVadState(now: number): VadState {
  return {
    heardSpeech: false, quietSince: 0, startedAt: now,
    noiseFloor: Number.POSITIVE_INFINITY, threshold: ABSOLUTE_FLOOR, calibrating: true,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Speech has to stand this far above the room, but never below the absolute floor. */
function deriveThreshold(noiseFloor: number): number {
  const room = clamp(Number.isFinite(noiseFloor) ? noiseFloor : 0, FLOOR_MIN, FLOOR_MAX);
  return Math.max(ABSOLUTE_FLOOR, room * SPEECH_RATIO);
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
  const elapsed = now - state.startedAt;

  // CALIBRATE FIRST. Take the quietest sample of the opening window as the room's floor,
  // then hold the threshold for the rest of the turn — a threshold that kept moving during
  // speech would drift up into the speech itself and cut the visitor off.
  if (state.calibrating) {
    if (rms < state.noiseFloor) state.noiseFloor = rms;
    if (elapsed >= CALIBRATION_MS) {
      state.threshold = deriveThreshold(state.noiseFloor);
      state.calibrating = false;
    }
    // No verdict during calibration except the hard ceiling, which is checked below.
    if (elapsed < maxMs) return "listening";
  } else if (!state.heardSpeech && rms < state.noiseFloor) {
    // THE FLOOR ONLY EVER FALLS. If a quieter moment arrives later than the calibration
    // window, the window was measuring something other than the room — most likely the
    // visitor already talking — so the estimate was too high and is corrected. Only while
    // no speech has been detected yet: once a turn is under way, a threshold that keeps
    // moving would drift into the speech itself and cut the visitor off mid-sentence.
    state.noiseFloor = rms;
    state.threshold = deriveThreshold(rms);
  }

  if (rms > state.threshold) {
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
  | { kind: "end"; reason: "rate_limited" | "stopped" | "voice_unavailable" | "error" };

/** What the server said about a missing audio track. `rule` = text-only on purpose;
 *  `unavailable` = the voice is not working. */
export type SilenceKind = "none" | "rule" | "unavailable";

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
export function callResponseAction(
  status: number,
  hasAudio: boolean,
  silence: SilenceKind = "none"
): CallAction {
  if (status === 429) return { kind: "end", reason: "rate_limited" };
  // 503 is the demo being STOPPED — the kill switch, an unconfigured backend, STT down.
  // It is not a dropped connection, and saying «انقطع الاتصال» for the Founder's own kill
  // switch tells a prospect the product broke when in fact it was switched off.
  if (status === 503) return { kind: "end", reason: "stopped" };
  if (status < 200 || status >= 300) return { kind: "end", reason: "error" };
  if (hasAudio) return { kind: "speak" };

  // NO AUDIO, AND THE REASON DECIDES. A product rule is the demo working: show the text,
  // keep listening. Anything else means the voice is not working, and continuing to
  // record — while claiming a safety rule caused the silence — is a fabricated
  // demonstration of the exact guarantee this page exists to sell, plus a fresh upload
  // every turn. A conservative default: an OLD server that does not send the field yet
  // reports "none", and an unexplained silence must not be dressed up as a rule.
  return silence === "rule"
    ? { kind: "show_text", note: "text_only" }
    : { kind: "end", reason: "voice_unavailable" };
}
