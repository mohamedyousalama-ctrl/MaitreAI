// ============================================================================
// MaitreAI — WO-CONTEXT (PART A): conversation SESSION FRESHNESS.
//
// PURE (no I/O). WhatsApp threads are eternal; sessions are not. A customer's fresh
// «سلام عليكم» days after a stalled order must NOT inherit the old session's residue —
// the DB-proven defect (Wesaya, 20 Jul evening; thread created 09 Jul): a fresh greeting
// answered with legacy safety language AND a stale zone question from a session days old,
// glued together.
//
// This module owns the deterministic freshness decision. At turn start the caller measures
// the idle gap (age of the conversation's last message) and the age of the last
// allergy/disease mention, then this decides what to expire:
//   • idle > SESSION_WINDOW_MS (2h) → the session is COLD: expire the pending deterministic
//     (askback) question, and — WHEN allergy_simple is ON — clear the per-conversation
//     safety/companion residues (checkpoint / companion pending states) that predate the
//     window. Tenants with allergy_simple OFF never reach the residue path.
//   • last allergy mention > ALLERGY_CONTEXT_WINDOW_MS (24h) → the ticket note no longer
//     describes THIS conversation → clear conversations.allergy_note (allergy_simple ON).
//     A FRESH mention THIS turn rebuilds it exactly as today, so a fresh turn never clears.
//
// The draft lifecycle (12h archive, draft-lifecycle.ts) is a separate, unchanged floor.
// ============================================================================

/** Inactivity window after which a conversation is treated as a NEW session (2h). */
export const SESSION_WINDOW_MS = 2 * 60 * 60 * 1000;
/** Age after which an allergy/disease mention no longer counts as "this conversation" (24h). */
export const ALLERGY_CONTEXT_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface SessionFreshnessInput {
  /** Age (ms) of the conversation's last message BEFORE this turn; null when the
   *  conversation has no prior message (a brand-new thread — always fresh). */
  lastMessageAgeMs: number | null;
  /** Age (ms) of the most-recent allergy/disease mention in the conversation; null when
   *  none was ever mentioned. */
  lastAllergyMentionAgeMs: number | null;
  /** The simple-allergy posture flag — gates the residue/allergy-note-clear paths so a
   *  tenant with the flag OFF is never touched. */
  allergySimpleOn: boolean;
  /** True when THIS turn carries a fresh allergy/disease mention (which rebuilds the note
   *  this turn) — such a turn NEVER clears the note as stale. */
  freshAllergyMentionThisTurn?: boolean;
}

export interface SessionFreshnessDecision {
  /** The idle gap exceeded the 2h window: the session is cold. */
  sessionExpired: boolean;
  /** Expire the pending deterministic (askback) question this turn (a stale ask must not
   *  trail a returning customer's fresh turn). */
  expirePendingQuestion: boolean;
  /** Clear legacy per-conversation safety/companion residues (allergy_simple ON only). */
  clearLegacyResidues: boolean;
  /** Clear conversations.allergy_note — the context is older than 24h (allergy_simple ON
   *  only, and only when THIS turn does not carry a fresh mention that rebuilds it). */
  clearAllergyNote: boolean;
  /** Deterministic signal reasons to emit for observability (subset of
   *  {"pending_question_expired","allergy_context_expired"}). */
  signals: string[];
}

/**
 * Decide what the cold-session freshness sweep expires at turn start (pure). The session
 * window (2h) governs the pending-question expiry for everyone; the residue + allergy-note
 * clears are gated on allergy_simple; the allergy-note clear is additionally suppressed on a
 * fresh-mention turn (the floor rebuilds it) and independent of the session window (24h).
 */
export function decideSessionFreshness(input: SessionFreshnessInput): SessionFreshnessDecision {
  const sessionExpired = input.lastMessageAgeMs != null && input.lastMessageAgeMs > SESSION_WINDOW_MS;
  const clearLegacyResidues = sessionExpired && input.allergySimpleOn;
  const clearAllergyNote =
    input.allergySimpleOn &&
    input.lastAllergyMentionAgeMs != null &&
    input.lastAllergyMentionAgeMs > ALLERGY_CONTEXT_WINDOW_MS &&
    input.freshAllergyMentionThisTurn !== true;

  const signals: string[] = [];
  if (sessionExpired) signals.push("pending_question_expired");
  if (clearAllergyNote) signals.push("allergy_context_expired");

  return {
    sessionExpired,
    expirePendingQuestion: sessionExpired,
    clearLegacyResidues,
    clearAllergyNote,
    signals,
  };
}
