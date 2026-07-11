// ============================================================================
// MaitreAI — WO-LIVE-2-F2: allergy-context gate for the §0 output scan (PURE).
//
// The companion §0 banned-phrase OUTPUT scan (respond.ts) must run ONLY when THIS
// turn is actually an allergy context. Live evidence (Wesaya, 11 Jul 2026, conv
// c016a121): on a normal ordering turn the model offered a FLAVOR — «عادي، حار، أو
// مكس؟» ("regular, spicy, or mixed?") — and the context-free scan matched «عادي»
// («regular») as a banned safety word, forcing a false SYSTEM_HOLD mid-order. This
// predicate is the missing context gate. It does NOT touch the scanner or its
// vocabulary (scanBannedAllergyPhrases is unchanged) — it only decides WHETHER to
// run the scan this turn. An allergy-context turn scans exactly as before.
//
// A turn is an allergy context iff (companion mode ON, and any of):
//   • a session allergy note already exists — this ALSO subsumes the PM's "allergen
//     gate fired this turn", "inbound allergy mention this turn", and "companion
//     checkpoint active" components, because the companion flow merges every fired
//     gate (down to a generic «حساسية» label) into the session note BEFORE respond()
//     runs, and a §6 checkpoint only ever exists atop such a note; OR
//   • the conversation is already a safety hold; OR
//   • the inbound message itself names an allergy/allergen THIS turn, evaluated via
//     the SAME deterministic gate (detectAllergenAvoidance) — defense-in-depth so a
//     direct respond() caller that has not persisted a note (e.g. /api/agent/suggest)
//     still scans a genuine allergy turn.
// No allergy context → no scan (a flavor «عادي» is never a safety claim).
// ============================================================================

import { detectAllergenAvoidance } from "./allergen-gate";

export interface AllergyScanContextInput {
  /** Companion mode flag (the scan is companion-only; OFF → never scan). */
  allergyCompanion?: boolean | null;
  /** The monotonic session allergy note (present ⇒ this session has an allergy). */
  sessionAllergyNote?: string | null;
  /** The conversation is already a safety hold. */
  safetyHoldActive?: boolean | null;
  /** The customer's inbound text this turn (for the deterministic mention check). */
  userMessage?: string | null;
}

/**
 * Decide whether the §0 companion banned-phrase output scan should run this turn.
 * PURE + deterministic. Companion OFF → always false (flag-off byte-identical: the
 * scan block was already skipped when allergyCompanion !== true). Companion ON →
 * true iff a real allergy context exists (session note, safety hold, or an inbound
 * allergy mention this turn). See the module header for the equivalence to the
 * four-part predicate proposed in the WO.
 */
export function isAllergyScanContext(input: AllergyScanContextInput): boolean {
  if (input.allergyCompanion !== true) return false;
  if (typeof input.sessionAllergyNote === "string" && input.sessionAllergyNote.trim().length > 0) return true;
  if (input.safetyHoldActive === true) return true;
  if (typeof input.userMessage === "string" && detectAllergenAvoidance(input.userMessage).fired) return true;
  return false;
}
