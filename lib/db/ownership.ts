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
// KV-D06-002: the state set, the transition table and the claimability rules are NO
// LONGER DEFINED HERE. They live in the one canonical application contract,
// lib/conversation-control/model.ts, and this module re-exports them unchanged so every
// existing import of OwnershipState / OWNERSHIP_STATES / isLegalTransition /
// assertLegalTransition / CLAIMABLE_FROM / canClaim keeps working with identical
// behavior. What changed is only WHERE the contract is defined — one place instead of
// three. The contract itself is the already-governed seven-state superset.
//
// Step 3 is ENFORCING: an illegal transition THROWS instead of writing — the map
// is the law. Before flipping enforcement on, every live call-site was audited and the
// three that could pass an illegal transition were fixed to take a legal path (CLOSED
// is reopened to AI_ACTIVE before any escalation/takeover; SYSTEM_HOLD is never
// auto-returned — it bails to realert structurally). The hard #87 guarantee stands:
// SYSTEM_HOLD → AI_ACTIVE is legal ONLY as a deliberate operator release, never
// automatic (the auto-return path bails before it).
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  OWNERSHIP_STATES,
  CLAIMABLE_FROM,
  isLegalTransition,
  assertLegalTransition,
  canClaim,
  type OwnershipState,
} from "../conversation-control/model";

// ---------------------------------------------------------------------------
// Compatibility surface — every public name this module exported before KV-D06-002
// is preserved, now sourced from the canonical model rather than redefined here.
//
//   OwnershipState        — the seven-state union (was a five-state union)
//   OWNERSHIP_STATES      — the canonical ordered tuple
//   isLegalTransition     — pure predicate; null `from` and self-transitions allowed
//   assertLegalTransition — throwing variant, "[ownership] illegal transition …"
//   CLAIMABLE_FROM        — the states a claim may transition FROM
//   canClaim              — pure send-time claim/authorization mirror
// ---------------------------------------------------------------------------
export { OWNERSHIP_STATES, CLAIMABLE_FROM, isLegalTransition, assertLegalTransition, canClaim };
export type { OwnershipState };

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
