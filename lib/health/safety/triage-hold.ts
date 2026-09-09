// ============================================================================
// فيصل / Faysal — SAFETY RAIL · the triage hold. SPEC-4-SAFETY.md §1.5 R2.
//
// THE DEFECT THIS CLOSES, AND IT IS NOT HYPOTHETICAL.
//
// §1.2 asserts the verdict is "not revisable by later turns". `detectRedFlag` is PURE — no
// I/O, no DB, no clock — and the rail RETURNs. NOTHING WAS CARRIED ACROSS TURNS. So:
//
//   turn 1, «صدري يعورني وأتعرق»            → rail, 997, P0 page
//   turn 2, ninety seconds later,
//           «طيب أبغى موعد قلب بكرة الساعة 10» → CORRECTLY QUIET under §2.1 (no possessive
//                                                chest term, no pain predicate)
//                                              → the booking tools are back in the tool set
//                                              → Faysal books.
//
// The persona prohibition is per-turn too, so `emergency_downgrade` arrives through the front
// door. The hold is the mechanism the assertion never had.
//
// FORKED FROM WHAT THE REPO ALREADY HAS. `lib/db/safety-hold.ts` (23 lines, pure) and
// `lib/db/safety-hold-guard.ts` (67 lines, server-only) give four properties and Faysal takes
// all four. The Kivo guard's own header:
//
//   "An order linked to that conversation MUST NOT be committed … while the hold is active …
//    RELEASE is an explicit operator next-action … Fail-CLOSED on a read error: if we cannot
//    prove the order is NOT held, we treat it as held (safety over convenience)."
//
// THE SPLIT IS DELIBERATE AND IT IS THE SAME SPLIT THE ORIGINAL MAKES. The PREDICATE is pure
// and testable with no DB; the READ is injected. This file therefore imports no Supabase
// client and belongs to no data layer — `lib/health/db/` owns the query, and H-2's "at the
// write" is satisfied by the write path calling `checkBookingTriageHold` with its own reader,
// inside the same request that touches the row.
// ============================================================================

/** §1.5 R2 — H-6. The Kivo guard's carve-out carries over: draft / pending / cancelled are
 *  NOT commitments. A patient under an open triage hold may ALWAYS cancel an existing
 *  appointment, and may always be handed a phone number. The hold blocks *committing*, never
 *  *unwinding* or *helping*. */
export const COMMITTED_APPOINTMENT_STATES: readonly string[] = ["confirmed", "checked_in", "seen"];

export interface HeldConversation {
  readonly ownership_state?: string | null;
  readonly triage_hold?: boolean | null;
}

/** PURE. Two fields, for the same reason `lib/demo/config.ts` stamps two markers: one governs
 *  code paths, one is human-readable in the operator console. Either one being set is a hold. */
export function isTriageHeld(conv: HeldConversation | null | undefined): boolean {
  if (!conv) return false;
  return conv.ownership_state === "SYSTEM_HOLD" || conv.triage_hold === true;
}

export interface TriageHoldVerdict {
  readonly held: boolean;
  readonly reason: string | null;
  readonly conversationId: string | null;
}

/** The intent a booking write is about to perform. Cancellation survives the hold (H-6). */
export type BookingIntent = "create" | "confirm" | "reschedule" | "cancel";

/** A reader the WRITE PATH supplies. Injected rather than imported so this module stays pure
 *  and testable, and so `lib/health/safety/` never becomes a data layer. */
export type ConversationReader = (
  holdToken: string,
) => Promise<{ id: string; conv: HeldConversation | null }>;

/**
 * §1.5 R2 — H-2, H-3, H-4, H-6. CALLED AT THE WRITE.
 *
 * NOT in the prompt. NOT in the tool-selection step. NOT as a system-message instruction.
 * A prompt-level prohibition is exactly what the model talked its way past in §8's threat
 * model, and it is why this function takes a `holdToken` and a reader instead of a boolean
 * somebody upstream computed: the check happens inside the same request that touches the row.
 *
 * FAIL-CLOSED, VERBATIM FROM THE KIVO GUARD. If we cannot prove the thread is not held, it is
 * held. A thrown reader is `held: true`, `reason: "triage_hold_check_failed"` — never `false`.
 */
export async function checkBookingTriageHold(
  read: ConversationReader,
  holdToken: string,
  intent: BookingIntent = "create",
): Promise<TriageHoldVerdict> {
  // H-6 — cancellation is ALWAYS allowed, and it is decided before the read so that a broken
  // read cannot trap a patient into an appointment they are trying to cancel.
  if (intent === "cancel") return { held: false, reason: "cancel_always_allowed", conversationId: null };
  try {
    const { id, conv } = await read(holdToken);
    if (isTriageHeld(conv)) return { held: true, reason: "triage_hold_open", conversationId: id };
    return { held: false, reason: null, conversationId: id };
  } catch {
    return { held: true, reason: "triage_hold_check_failed", conversationId: null };
  }
}

/** H-5 — RELEASE IS AN EXPLICIT OPERATOR NEXT-ACTION. `SYSTEM_HOLD → HUMAN_ACTIVE`, performed
 *  by a NAMED operator, recorded with `released_by` and `released_at`.
 *
 *  No timer releases it. No new patient message releases it. No model output releases it.
 *  There is no flag that releases it (§10). This function is the ONLY shape that produces a
 *  release, and it refuses without a named operator — which is what makes "operator-only"
 *  a type error rather than a policy. §12 row 14 blocks on an operator surface existing. */
export function releaseTriageHold(input: {
  readonly releasedBy: string;
  readonly releasedAt: string;
}): { ownership_state: "HUMAN_ACTIVE"; triage_hold: false; released_by: string; released_at: string } | null {
  const by = input.releasedBy?.trim();
  if (!by) return null;
  const at = input.releasedAt?.trim();
  if (!at || !Number.isFinite(Date.parse(at))) return null;
  return { ownership_state: "HUMAN_ACTIVE", triage_hold: false, released_by: by, released_at: at };
}

/** H-1 — what the rail's `pageHuman()` branch writes, BEFORE the reply is enqueued. */
export const OPEN_TRIAGE_HOLD_PATCH = Object.freeze({
  triage_hold: true,
  ownership_state: "SYSTEM_HOLD",
} as const);
