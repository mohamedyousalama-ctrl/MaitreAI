// ============================================================================
// MaitreAI — conversation ownership state (Never-stuck spine, Step 1)
// ONE explicit ownership axis + the legal-transition map, replacing the scattered
// owner / free-text status / is_safety_hold fields as the source of truth. Every
// ownership change routes through setOwnershipState, which validates the transition
// and DUAL-WRITES the new state alongside the legacy fields (so anything still reading
// owner/status keeps working).
//
// Isomorphic (NOT server-only): both the server bridge (service-role client) and the
// operator UI store (browser client) flip ownership, so both must be able to call this.
//
// Step 1 is NON-ENFORCING: an illegal transition is logged loudly but the write still
// happens, guaranteeing byte-identical behavior while we gather evidence that no real
// flow trips the map. Step 2 flips enforcement on (throw) once the logs are clean.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export type OwnershipState =
  | "AI_ACTIVE" // Karim owns + replies normally
  | "HUMAN_ACTIVE" // a staff member took over, Karim silent
  | "HUMAN_IDLE" // handed to a human, human not acting, customer waiting
  | "SYSTEM_HOLD" // safety hold (allergy); only a deliberate human release returns it
  | "CLOSED"; // conversation finished/closed

/** Legal transitions. Self-transitions (X→X) are always allowed as idempotent no-ops.
 *  HARD RULE: SYSTEM_HOLD → AI_ACTIVE is allowed ONLY via a deliberate human release
 *  (the operator "return to AI" action) — the auto-return timer never targets AI_ACTIVE
 *  from a safety hold (it bails before that), so the #87 safety guarantee is preserved. */
const LEGAL_TRANSITIONS: Record<OwnershipState, readonly OwnershipState[]> = {
  AI_ACTIVE: ["HUMAN_ACTIVE", "SYSTEM_HOLD", "CLOSED"],
  HUMAN_ACTIVE: ["HUMAN_IDLE", "AI_ACTIVE", "CLOSED"],
  HUMAN_IDLE: ["HUMAN_ACTIVE", "AI_ACTIVE", "CLOSED"],
  SYSTEM_HOLD: ["HUMAN_ACTIVE", "AI_ACTIVE", "CLOSED"],
  CLOSED: ["AI_ACTIVE"],
};

export const OWNERSHIP_STATES: readonly OwnershipState[] = [
  "AI_ACTIVE",
  "HUMAN_ACTIVE",
  "HUMAN_IDLE",
  "SYSTEM_HOLD",
  "CLOSED",
];

/** Pure predicate. A null `from` (unknown/legacy row) is permitted — we can't validate
 *  what we can't read, and must never block an existing flow. Self-transitions allowed. */
export function isLegalTransition(from: OwnershipState | null | undefined, to: OwnershipState): boolean {
  if (from == null) return true;
  if (from === to) return true;
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Throwing variant — used by tests now, and by Step 2's enforced path later. */
export function assertLegalTransition(from: OwnershipState | null | undefined, to: OwnershipState): void {
  if (!isLegalTransition(from, to)) {
    throw new Error(`[ownership] illegal transition ${from} → ${to}`);
  }
}

export interface SetOwnershipResult {
  from: OwnershipState | null;
  to: OwnershipState;
}

/**
 * The single place ownership transitions are recorded. Reads the current state,
 * validates the transition, and writes `ownership_state = next` together with any
 * legacy fields the caller still maintains (`extra` — owner/status/escalation_reason/
 * handover_note/is_safety_hold/updated_at), in ONE update so the row stays consistent.
 *
 * NON-ENFORCING in Step 1: an illegal transition is logged but still written.
 */
export async function setOwnershipState(
  client: SupabaseClient,
  conversationId: string,
  next: OwnershipState,
  opts: { extra?: Record<string, unknown> } = {}
): Promise<SetOwnershipResult> {
  const { extra = {} } = opts;

  const { data: current } = await client
    .from("conversations")
    .select("ownership_state")
    .eq("id", conversationId)
    .maybeSingle();
  const from = ((current?.ownership_state as OwnershipState | null) ?? null) as OwnershipState | null;

  if (!isLegalTransition(from, next)) {
    // Step 1 is non-enforcing: record the violation but do not break the existing
    // flow (the legacy write must still land). Step 2 turns this into a hard reject.
    console.error(
      `[ownership] ILLEGAL transition ${from} → ${next} (conversation ${conversationId}); writing anyway (Step 1 non-enforcing)`
    );
  }

  const { error } = await client
    .from("conversations")
    .update({ ...extra, ownership_state: next })
    .eq("id", conversationId);
  if (error) throw error;

  return { from, to: next };
}
