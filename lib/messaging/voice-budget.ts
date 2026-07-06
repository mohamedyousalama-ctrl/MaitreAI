// ============================================================================
// MaitreAI — WO-VOICE-2: outbound voice-note budget + suppression (PURE, no I/O).
// Mirrors the media-guard discipline: "layer proposes, deterministic gate decides."
// Khalid's reply is ALWAYS composed as text and the text is ALWAYS sent; this gate
// decides only whether an ADDITIONAL voice note accompanies it.
//
// HARD-ZERO categories → TEXT-ONLY, no voice at all (ruling A, PILOT-CONSERVATIVE):
//   • safety_hold   — a TTS render of a safety message is a new mis-hearing surface
//   • money_figure  — a spoken amount can be misheard (wrong number = wrong charge)
//   • payment_link  — a link must be tappable text, never audio
//   • receipt       — the record of truth is the text/document
// A voice render of any of these has ZERO pilot evidence of safety, so it is
// suppressed. Revisitable via the ratified path once we have real evidence.
//
// BUDGET: max notes/day PER CONVERSATION (default 10, config-overridable — never
// hardcode-forever), reset by a date column the caller resolves (notesSentToday is
// 0 when the stored day != today). A spend-ceiling guard is a fast-follow.
// ============================================================================

/** Default per-conversation daily voice-note cap. Overridable via VOICE_NOTES_PER_DAY. */
export const VOICE_NOTES_PER_DAY_DEFAULT = 10;

/** The active daily cap: env override (VOICE_NOTES_PER_DAY) or the default. */
export function voiceNotesPerDay(): number {
  const raw = Number(process.env.VOICE_NOTES_PER_DAY);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : VOICE_NOTES_PER_DAY_DEFAULT;
}

export type VoiceZeroReason = "safety_hold" | "money_figure" | "payment_link" | "receipt";

export interface VoiceBudgetInput {
  /** The voice_notes feature flag (explicit-only). OFF → never any voice. */
  enabled: boolean;
  /** Trigger: the customer used voice this turn OR asked for a voice reply. */
  triggered: boolean;
  /** A hard-zero suppression category fired (safety/money/link/receipt), else null. */
  hardZeroReason: VoiceZeroReason | null;
  /** Voice notes already sent in THIS conversation TODAY (0 when the day rolled over). */
  notesSentToday: number;
  /** The active per-day cap (pass voiceNotesPerDay()). */
  cap: number;
}

export type VoiceBudgetDecision =
  | { send: true; reason: "ok" }
  | { send: false; reason: "disabled" | "not_triggered" | "budget_exhausted" | VoiceZeroReason };

/** Clamp to a non-negative integer. */
function nonNegInt(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/**
 * Decide whether to send an accompanying voice note. Pure + deterministic. Order:
 * flag → trigger → hard-zero suppression (fail-closed, BEFORE budget) → daily budget.
 */
export function decideVoiceSend(input: VoiceBudgetInput): VoiceBudgetDecision {
  if (!input.enabled) return { send: false, reason: "disabled" };
  if (!input.triggered) return { send: false, reason: "not_triggered" };
  // Hard-zero suppression short-circuits BEFORE any budget math (fail-closed): a
  // safety/money/link/receipt turn is text-only regardless of remaining budget.
  if (input.hardZeroReason) return { send: false, reason: input.hardZeroReason };
  const cap = nonNegInt(input.cap) || VOICE_NOTES_PER_DAY_DEFAULT;
  if (nonNegInt(input.notesSentToday) >= cap) return { send: false, reason: "budget_exhausted" };
  return { send: true, reason: "ok" };
}

// --- reply-content suppression detectors (money / payment link) --------------
// Money figure: a number adjacent to a currency token (SAR / ريال / ر.س / جنيه),
// or a currency token adjacent to a number — either order.
const MONEY_RE =
  /(\d[\d.,]*\s*(?:ريال|ر\.?\s?س|sar|s\.?r|جنيه|ج\.?\s?م|درهم|aed|egp))|((?:ريال|ر\.?\s?س|sar|جنيه|درهم)\s*\d)/i;
// Payment link/intent: an explicit pay marker or a known checkout URL.
const PAY_LINK_RE = /(رابط\s*الدفع|ادفع|الدفع\s*الآن|checkout|moyasar|payment|pay(?:link)?\b|https?:\/\/\S*(?:pay|checkout|moyasar)\S*)/i;

/**
 * Resolve the hard-zero suppression category for a turn, or null if voice is
 * allowed. The caller passes structured signals it already knows (safety hold,
 * receipt) plus the reply text (scanned for money/pay-link). Safety first.
 */
export function voiceHardZeroReason(
  replyText: string,
  signals: { safetyHold: boolean; isReceipt: boolean }
): VoiceZeroReason | null {
  if (signals.safetyHold) return "safety_hold";
  if (signals.isReceipt) return "receipt";
  const t = String(replyText ?? "");
  if (PAY_LINK_RE.test(t)) return "payment_link";
  if (MONEY_RE.test(t)) return "money_figure";
  return null;
}
