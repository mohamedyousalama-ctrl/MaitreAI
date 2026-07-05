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
// Step 3 is ENFORCING: an illegal transition now THROWS instead of writing — the map
// is the law. Before flipping enforcement on, every live call-site was audited and the
// three that could pass an illegal transition were fixed to take a legal path (CLOSED
// is reopened to AI_ACTIVE before any escalation/takeover; SYSTEM_HOLD is never
// auto-returned — it bails to realert structurally). The hard #87 guarantee stands:
// SYSTEM_HOLD → AI_ACTIVE is legal ONLY as a deliberate operator release, never
// automatic (the auto-return path bails before it).
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

// ---------------------------------------------------------------------------
// MO2 claim authorization (takeover-at-SEND). The assignee route performs a SINGLE
// atomic conditional UPDATE; `canClaim` is the PURE mirror of its TOTAL contract
// (the atomic WHERE + the 0-row fallback), so the same authorization is unit-testable.
// ---------------------------------------------------------------------------

/** States the atomic claim UPDATE can transition FROM (the assignee route's WHERE).
 *  HUMAN_ACTIVE is intentionally EXCLUDED from the atomic set: an already-active
 *  conversation is either the caller's own (idempotent success — resolved without a
 *  state change or a duplicate audit) or a teammate's (conflict). Adding it would
 *  audit a "claim" on every message send. */
export const CLAIMABLE_FROM: readonly OwnershipState[] = ["AI_ACTIVE", "HUMAN_IDLE", "SYSTEM_HOLD"];

/** Pure predicate: may member `me` claim / send-into this conversation? True when it
 *  is NOT owned by someone else AND either it sits in a claimable predecessor state
 *  OR it is already this member's HUMAN_ACTIVE (idempotent). Teammate-owned → false
 *  (conflict); CLOSED and unassigned-HUMAN_ACTIVE → false. This is the send-time
 *  ownership proof — the client must pass the server claim before sending, never
 *  trust local `owner === "human"`. */
export function canClaim(
  row: { ownershipState: OwnershipState | null | undefined; assignedMemberId: string | null | undefined },
  me: string
): boolean {
  const { ownershipState, assignedMemberId } = row;
  if (assignedMemberId && assignedMemberId !== me) return false; // someone else owns it → conflict
  if (ownershipState === "HUMAN_ACTIVE") return assignedMemberId === me; // idempotent only if already mine
  return !!ownershipState && CLAIMABLE_FROM.includes(ownershipState);
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
 * ENFORCING in Step 3: an illegal transition THROWS — the row is not written. A null
 * `from` (unknown/legacy row) and self-transitions remain permitted. Callers in the
 * live path are responsible for taking a legal route (reopen CLOSED first, never
 * auto-return SYSTEM_HOLD).
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
    // Step 3 enforcing: reject the illegal transition — do NOT write. The map is the
    // law; a caller that needs to reach `next` must take a legal route first.
    throw new Error(
      `[ownership] illegal transition ${from} → ${next} (conversation ${conversationId})`
    );
  }

  const { error } = await client
    .from("conversations")
    .update({ ...extra, ownership_state: next })
    .eq("id", conversationId);
  if (error) throw error;

  return { from, to: next };
}
