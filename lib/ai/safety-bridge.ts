// ============================================================================
// MaitreAI — WO-SAFETY-BRIDGE (FR-012 residual): safety-class inbound acknowledgment +
// loud re-alert while a conversation is HUMAN_ACTIVE with nobody attending.
//
// PURE (no I/O). When a human has taken over a thread (owner='human') and then goes quiet,
// a SAFETY-CLASS customer message (allergy/medical) can sit unacknowledged — the takeover
// branch bails silently. This module supplies the two deterministic pieces the bridge needs:
//   • isSafetyClassInbound(text) — the SAME deterministic safety detectors the Brain uses
//     (avoidance / symptom / phonetic-net / emergency), composed into one predicate.
//   • safetyBridgeAck(dialect) — the ratified customer-facing ACK copy (persona-routed).
//
// The bridge (respond-and-send.ts) NEVER changes ownership (the human still owns the thread)
// and NEVER bumps the wait clock (conversations.updated_at) — an automated ack is not operator
// activity, so masking the operator's absence (and suppressing the next re-alert) is forbidden.
// The ACK follows the same never-assert-safety rule as safeAllergenReply: caution, never
// reassurance; it names no hazard, promises no ETA, and tells the customer to hold.
// ============================================================================

import { detectAllergenAvoidance } from "./allergen-gate";
import { detectAllergenSymptom } from "./allergen-gate-symptoms";
import { detectAllergenEmergency } from "./allergen-emergency";

/** Operator-quiet window (minutes) after which a safety inbound during HUMAN_ACTIVE is treated
 *  as unattended. Short + independent of handoff_idle_minutes (default 15) — a safety message
 *  must not wait a full idle window. Measured against conversations.updated_at (the wait clock,
 *  reset only by operator replies), so a freshly-taken-over / actively-handled thread is fresh. */
export const SAFETY_BRIDGE_WINDOW_MINUTES = 3;

/**
 * True iff `text` is a SAFETY-CLASS inbound — the union of the deterministic allergen safety
 * detectors, run unconditionally (maximally cautious: a false "safety" only produces an extra
 * caution ack + a loud alert, never harm). Mirrors the reply-dampener safety pre-check so the
 * SAME signals the Brain treats as safety are the ones the bridge acknowledges.
 */
export function isSafetyClassInbound(
  text: string,
  opts?: { sttConfidence?: number | null; isVoiceTranscript?: boolean }
): boolean {
  if (!text || !text.trim()) return false;
  return (
    detectAllergenAvoidance(text).fired ||
    detectAllergenSymptom(text).fired ||
    // The phonetic near-miss net was the third term here. Removed by Founder ruling — see
    // lib/ai/phonetic-safety-net.ts for what it did and why it is gone.
    detectAllergenEmergency(text).fired
  );
}

/**
 * The ratified customer-facing safety-bridge ACK (persona-routed by dialect). Caution, never
 * reassurance — acknowledges receipt, says the team was alerted, and tells the customer to
 * hold the order until a human confirms. Names no hazard, gives no ETA, asserts no safety.
 */
export function safetyBridgeAck(dialect: string): string {
  return dialect === "saudi"
    ? "وصلتني رسالتك 🙏 صحتك تهمّنا. نبّهت فريق المطعم يراجع معك، ولا تكمل الطلب لين أحد من الفريق يتأكد معك بنفسه."
    : "وصلتني رسالتك 🙏 صحتك تهمّنا. نبّهت فريق المطعم يراجع معاك، ومن فضلك ما تكمّلش الطلب لحد ما حد من الفريق يتأكد معاك بنفسه.";
}
