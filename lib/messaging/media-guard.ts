// ============================================================================
// MaitreAI — WO-MEDIA-GUARD: deterministic outbound media disposer (PURE, no I/O).
//
// Khalid's (and Karim's) layer REQUESTS images; THIS guard DISPOSES — the same
// "layer proposes, deterministic gate decides" discipline as the allergen gate.
// It is pure: given how many images were requested, how many the conversation has
// already sent, and whether the conversation is in a HARD-ZERO state, it returns
// exactly how many to send and whether to fall back to the web menu link.
//
// Rules (V1-lean, deterministic):
//   • max 3 images per message                (MAX_IMAGES_PER_MESSAGE)
//   • a per-conversation media budget of 6    (CONVERSATION_MEDIA_BUDGET)
//     — once spent, we stop sending images and offer the full web menu link once.
//   • HARD ZERO — send NOTHING (no images, no link) while the conversation is
//     safety-held / complaint-open / payment-pending. Fail-closed, like the
//     allergen gate: a picture must never intrude on a safety concern, an open
//     complaint, or a pending payment.
//
// The guard is signal-agnostic: the CALLER computes `hardZero` from the real
// conversation state (isSafetyHeld || complaint-open || payment-pending) and
// passes it in, so this module stays pure and exhaustively unit-testable.
// ============================================================================

export const MAX_IMAGES_PER_MESSAGE = 3;
export const CONVERSATION_MEDIA_BUDGET = 6;
/** Legacy per-message cap — the exact behavior when the media_guard flag is OFF
 *  (the previous `photoRequests.slice(0, 4)`). Byte-identical fallback. */
export const LEGACY_MAX_IMAGES = 4;

/** Why the guard sent zero (or fewer) images than requested. */
export type MediaZeroReason = "safety_hold" | "complaint_open" | "payment_pending";

export type MediaDecisionReason =
  | "disabled" // media_guard flag OFF → legacy slice(0,4), no budget, no hard-zero
  | "ok" // sent exactly what was requested
  | "capped_per_message" // trimmed by the 3-per-message cap
  | "budget_capped" // trimmed because fewer than the cap remained in the budget
  | "budget_exhausted" // budget fully spent → 0 images, offer the menu link
  | MediaZeroReason; // hard-zero state

export interface MediaGuardInput {
  /** The media_guard feature flag (explicit-only). OFF → byte-identical legacy path:
   *  min(requested, 4), NO budget, NO hard-zero — exactly the pre-guard behavior. */
  enabled: boolean;
  /** How many images the agent layer wants to send this message. */
  requested: number;
  /** Images already sent in THIS conversation (0 when the counter isn't deployed yet). */
  imagesAlreadySent: number;
  /** True when the conversation is safety-held / complaint-open / payment-pending. */
  hardZero: boolean;
  /** Which hard-zero condition fired (for the timeline note); ignored when hardZero is false. */
  hardZeroReason?: MediaZeroReason | null;
}

export interface MediaGuardDecision {
  /** Number of images to actually send (0..MAX_IMAGES_PER_MESSAGE). */
  allowed: number;
  /** Send the full web-menu link instead of images (budget spent, non-hard-zero). */
  fallbackToMenuLink: boolean;
  reason: MediaDecisionReason;
}

/** Clamp to a non-negative integer (defends against NaN / floats / negatives). */
function nonNegInt(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/**
 * Decide how many images to send. Pure + deterministic — same input always yields
 * the same decision. The safety-zero case (hardZero) short-circuits to zero BEFORE
 * any budget math, so a held/complaint/pending conversation can never receive media.
 */
export function decideMediaSend(input: MediaGuardInput): MediaGuardDecision {
  // FLAG OFF — byte-identical legacy path: min(requested, 4), no budget, no hard-zero.
  // The standing law: every behavior change ships per-tenant-flaggable, OFF by default,
  // even protective ones. The safety-hold hard-zero for a live tenant is its own flip.
  if (!input.enabled) {
    return { allowed: Math.min(nonNegInt(input.requested), LEGACY_MAX_IMAGES), fallbackToMenuLink: false, reason: "disabled" };
  }

  // HARD ZERO — fail-closed. No images AND no link (never intrude on the concern).
  if (input.hardZero) {
    return { allowed: 0, fallbackToMenuLink: false, reason: input.hardZeroReason ?? "safety_hold" };
  }

  const requested = nonNegInt(input.requested);
  const already = nonNegInt(input.imagesAlreadySent);
  const remaining = Math.max(0, CONVERSATION_MEDIA_BUDGET - already);

  // Budget fully spent → stop sending images; offer the web menu once (only if the
  // agent actually wanted to show something this turn).
  if (remaining <= 0) {
    return { allowed: 0, fallbackToMenuLink: requested > 0, reason: "budget_exhausted" };
  }

  const allowed = Math.min(requested, MAX_IMAGES_PER_MESSAGE, remaining);
  let reason: MediaDecisionReason = "ok";
  if (allowed < requested) {
    // Distinguish "the 3-cap trimmed it" from "the budget had fewer than 3 left".
    reason = remaining < MAX_IMAGES_PER_MESSAGE && remaining === allowed ? "budget_capped" : "capped_per_message";
  }
  return { allowed, fallbackToMenuLink: false, reason };
}
