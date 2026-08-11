// ============================================================================
// MaitreAI — canonical conversation ownership model (KV-D06-002) — PURE.
//
// THE single source of truth for the three things that were previously defined
// three times over (lib/db/ownership.ts, lib/console/conversation-control.ts and
// lib/types.ts): the ownership STATE SET, the reply-AUTHORITY mapping, and the
// legal TRANSITION table — plus the claimability predicate derived from them.
// After this module lands, no other application file may maintain its own copy;
// they consume or re-export from here.
//
// DEPENDENCY-LIGHT + SIDE-EFFECT-FREE BY CONTRACT. This file imports nothing —
// no Supabase, no Next.js, no React, no environment variables, no `server-only`,
// no route or data-access module. Importing it must never open a connection,
// read config or touch a database. That is what makes it safe for the browser
// store, the server bridge and a bare `node --experimental-strip-types` test to
// share one contract.
//
// SCOPE: this is the APPLICATION contract only. It proves nothing about the
// database. It is not an atomic claim, not RLS, not a grant, and not evidence
// that a production RPC exists. Real concurrency, tenant isolation and durable
// audit remain the separately governed control-plane work.
// ============================================================================

/**
 * The canonical ownership states, in canonical order.
 *
 * Exactly seven — there is no eighth state, and there is deliberately NO runtime
 * `HUMAN_WAITING`. `HUMAN_WAITING` is a DOCUMENTATION ALIAS for `HUMAN_IDLE`
 * only (migration 0099 kept `HUMAN_IDLE` as the canonical name with no rename and
 * no backfill). No normalization is provided here, because no inspected source or
 * schema carries that value at runtime; if real persisted data ever does, that is
 * a separate decision, not a silent mapping.
 */
export const OWNERSHIP_STATES = [
  "AI_ACTIVE", // Karim owns and replies (authority AI)
  "HOLD_UNCLAIMED", // escalated, no human has claimed it yet (authority NONE)
  "HUMAN_ACTIVE", // a member has taken over (authority HUMAN)
  "HUMAN_IDLE", // == HUMAN_WAITING: member owns but is idle, customer waiting (authority HUMAN)
  "AI_RESUME_PENDING", // handback validation in flight (authority NONE)
  "SYSTEM_HOLD", // safety hold (allergy); deliberate human release only (authority NONE)
  "CLOSED", // finished (authority NONE)
] as const;

/** The canonical ownership-state type, derived from the tuple so the two can never drift. */
export type OwnershipState = (typeof OWNERSHIP_STATES)[number];

/** Derived customer-facing writer authority. EXACTLY ONE value per state. */
export type ReplyAuthority = "AI" | "HUMAN" | "NONE";

/**
 * The authority mapping. Total over the state set (a `Record` keyed by the union,
 * so omitting a state is a compile error) and single-valued by construction — a
 * state maps to one authority, so no state can ever grant AI and HUMAN together.
 */
export const AUTHORITY_BY_STATE: Readonly<Record<OwnershipState, ReplyAuthority>> = {
  AI_ACTIVE: "AI",
  HOLD_UNCLAIMED: "NONE",
  HUMAN_ACTIVE: "HUMAN",
  HUMAN_IDLE: "HUMAN",
  AI_RESUME_PENDING: "NONE",
  SYSTEM_HOLD: "NONE",
  CLOSED: "NONE",
};

/** Pure, total authority lookup. */
export function authorityFor(state: OwnershipState): ReplyAuthority {
  return AUTHORITY_BY_STATE[state];
}

/**
 * The legal-transition table — the already-governed seven-state superset, preserved
 * edge-for-edge. Entries list only DIFFERENT-state destinations; self-transitions are
 * handled by the predicate below.
 *
 * This module does NOT redesign the graph. In particular the direct human→AI edges
 * remain: atomic, server-confirmed handback is separate later control-plane work.
 * The #87 guarantee is unchanged — `SYSTEM_HOLD → AI_ACTIVE` is legal only as a
 * deliberate human release; the auto-return path bails before it rather than relying
 * on this table to forbid it.
 */
export const LEGAL_TRANSITIONS: Readonly<Record<OwnershipState, readonly OwnershipState[]>> = {
  AI_ACTIVE: ["HOLD_UNCLAIMED", "HUMAN_ACTIVE", "SYSTEM_HOLD", "CLOSED"],
  HOLD_UNCLAIMED: ["HUMAN_ACTIVE", "SYSTEM_HOLD", "AI_ACTIVE", "CLOSED"],
  HUMAN_ACTIVE: ["HUMAN_IDLE", "AI_ACTIVE", "AI_RESUME_PENDING", "CLOSED"],
  HUMAN_IDLE: ["HUMAN_ACTIVE", "AI_ACTIVE", "AI_RESUME_PENDING", "CLOSED"],
  AI_RESUME_PENDING: ["AI_ACTIVE", "HUMAN_ACTIVE", "CLOSED"],
  SYSTEM_HOLD: ["HUMAN_ACTIVE", "AI_ACTIVE", "CLOSED"],
  CLOSED: ["AI_ACTIVE"],
};

/**
 * Pure transition predicate.
 *
 * - a null/undefined `from` is PERMITTED — an unknown or legacy row must never be
 *   blocked (this preserves the current bootstrap behavior, it is not a new rule);
 * - self-transitions are PERMITTED as idempotent no-ops;
 * - everything else must appear in the table above.
 */
export function isLegalTransition(from: OwnershipState | null | undefined, to: OwnershipState): boolean {
  if (from == null) return true;
  if (from === to) return true;
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Throwing variant. `scope` only labels the error so each consuming module keeps its
 * own existing message prefix; it has no effect on the decision, which is entirely
 * `isLegalTransition`.
 */
export function assertLegalTransition(
  from: OwnershipState | null | undefined,
  to: OwnershipState,
  scope = "ownership"
): void {
  if (!isLegalTransition(from, to)) {
    throw new Error(`[${scope}] illegal transition ${from} → ${to}`);
  }
}

/**
 * The states a claim may transition FROM.
 *
 * `HUMAN_ACTIVE` is deliberately EXCLUDED from this set: an already-active conversation
 * is either the caller's own — resolved as an idempotent success by `canClaim` without a
 * state change or a duplicate audit row — or a teammate's, which is a conflict. Including
 * it would audit a "claim" on every message send.
 *
 * `AI_RESUME_PENDING` is excluded because handback validation is in flight, and `CLOSED`
 * because a closed conversation must be reopened to `AI_ACTIVE` first.
 */
export const CLAIMABLE_FROM: readonly OwnershipState[] = [
  "AI_ACTIVE",
  "HOLD_UNCLAIMED",
  "HUMAN_IDLE",
  "SYSTEM_HOLD",
];

/**
 * Pure predicate: may member `me` claim / send into this conversation? True when it is
 * NOT owned by someone else AND either it sits in a claimable predecessor state OR it is
 * already this member's `HUMAN_ACTIVE` (idempotent). Teammate-owned is a conflict;
 * `CLOSED`, `AI_RESUME_PENDING` and unassigned `HUMAN_ACTIVE` are not claimable.
 *
 * APPLICATION ELIGIBILITY ONLY. This is not proof of an atomic database claim — the
 * server still performs the single conditional write, and this predicate is its pure
 * mirror so the authorization is unit-testable.
 */
export function canClaim(
  row: { ownershipState: OwnershipState | null | undefined; assignedMemberId: string | null | undefined },
  me: string
): boolean {
  const { ownershipState, assignedMemberId } = row;
  if (assignedMemberId && assignedMemberId !== me) return false; // someone else owns it → conflict
  if (ownershipState === "HUMAN_ACTIVE") return assignedMemberId === me; // idempotent only if already mine
  return !!ownershipState && CLAIMABLE_FROM.includes(ownershipState);
}
