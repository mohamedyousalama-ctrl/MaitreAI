// ============================================================================
// MaitreAI — conversation control plane (WO-CONTROL) — the human-takeover spine.
//
// ONE control axis over a conversation, EXTENDING the existing ownership model
// (conversations.ownership_state == the control `mode`; owner/assigned_member_id
// dual-written) — never a second source of truth. This module is the single place
// that answers three questions and performs every control transition:
//
//   • authorityFor(mode)        → exactly one of {AI, HUMAN, NONE}. Never AI+HUMAN.
//   • canTransition(from, to)    → the legal-transition law (superset-consistent with
//                                  lib/db/ownership.ts for the five legacy modes).
//   • applyTransition / claim / release / reassign / escalateToHold — the data layer,
//     each a single atomic RPC that bumps control_epoch and appends a
//     conversation_assignment_events row via DB triggers.
//
// ⚠ STATE OF THE DATA LAYER — read before wiring anything new to this module.
//
// Migration 0108 replaced the control plane: the control_* functions this module was
// written against were removed from the database and superseded by the kv_control_*
// family, which resolves the acting member from the JWT subject rather than from a
// call parameter. Verified against production 2026-08-26.
//
//   claimConversation  → PORTED. Calls kv_control_claim. REQUIRES A USER-SCOPED
//                        CLIENT: the actor is request.jwt.claim.sub, and EXECUTE is
//                        granted to `authenticated` only — service_role is refused.
//                        This is the only wrapper with production callers.
//
//   applyTransition, escalateToHold, releaseToAI, managerReassign
//                      → NOT PORTED. They still name control_apply_transition,
//                        control_escalate_to_hold, control_release_to_ai and
//                        control_reassign, none of which exist any more. Each will
//                        fail with PGRST202 if called. They have NO production
//                        callers today (verified across app/, lib/, components/) —
//                        only tests reach them. DO NOT wire a route to one of these
//                        until it is ported; porting is not a rename, because
//                        kv_control_reassign and kv_control_release_hold require the
//                        manager role and accept a narrower set of source states.
//
// The pure half of this module — authorityFor, canTransition, canHandBack,
// deriveAssignmentEventType — is unaffected and remains the tested contract.
//
// PURE first: authorityFor, canTransition, canHandBack, and deriveAssignmentEventType
// are pure and total (exhaustive over the mode enum) so they are unit-testable without
// a DB and mirror the SQL exactly (the same pure-mirror discipline as ownership.ts's
// canClaim and safety-hold.ts's isSafetyHeld).
//
// control_epoch is the collision killer: it increments on every mode/owner/authority
// transition (the DB trigger guarantees it), and the send gate (Part B) re-reads it
// immediately before the WhatsApp API call — a stale enqueue is dropped, never sent.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  OWNERSHIP_STATES,
  AUTHORITY_BY_STATE,
  isLegalTransition,
  assertLegalTransition,
  canClaim,
  type OwnershipState,
  type ReplyAuthority,
} from "../conversation-control/model";

// ---------------------------------------------------------------------------
// The control mode == conversations.ownership_state (widened by migration 0099).
// HUMAN_IDLE is the canonical name for the WO's "HUMAN_WAITING" (documented alias).
//
// KV-D06-002: the mode set, the authority mapping and the transition table are no
// longer defined here — they are the canonical application contract in
// lib/conversation-control/model.ts. `ControlMode` and `CONTROL_MODES` are kept as
// this module's established public names, now aliases of the shared contract so the
// two can never disagree. Every export below is unchanged in name and behavior.
// ---------------------------------------------------------------------------
export type ControlMode = OwnershipState;

export const CONTROL_MODES: readonly ControlMode[] = OWNERSHIP_STATES;

/** Derived reply authority. EXACTLY ONE at any time; never AI and HUMAN together. */
export type { ReplyAuthority };

export type AssignmentEventType =
  | "CLAIMED"
  | "RELEASED"
  | "REASSIGNED"
  | "MANAGER_TAKEOVER"
  | "HANDED_TO_AI"
  | "ESCALATED"
  | "SYSTEM_HOLD"
  | "CLOSED";

function assertNever(x: never): never {
  throw new Error(`[conversation-control] unmapped mode ${JSON.stringify(x)}`);
}

// ---------------------------------------------------------------------------
// authorityFor — PURE, TOTAL, EXHAUSTIVE. This is the semantic guard the control
// plane / console callers consult before sending. It can NEVER return AI and HUMAN
// for the same mode (each mode maps to exactly one value below). The hard, universal
// send-safety guarantee is the control_epoch gate (Part B), which is behavior-neutral
// when the epoch matches; authorityFor is the intent layer on top.
// ---------------------------------------------------------------------------
export function authorityFor(mode: ControlMode): ReplyAuthority {
  const authority = AUTHORITY_BY_STATE[mode];
  // Unreachable while `mode` is a real ControlMode (the mapping is total over the
  // union). Kept as the same defensive guard this function has always carried, so an
  // unmapped value coming from untyped data still fails loudly rather than silently.
  if (!authority) return assertNever(mode as never);
  return authority;
}

// ---------------------------------------------------------------------------
// The legal-transition table now lives in lib/conversation-control/model.ts — the one
// canonical application contract shared with lib/db/ownership.ts, so the control plane
// and the Brain's setOwnershipState cannot disagree on any pair. `canTransition` and
// `assertTransition` remain this module's public names and behave exactly as before:
// self-transitions are idempotent no-ops (allowed), a null `from` (unknown/legacy row)
// is never blocked, and the thrown message keeps its "[conversation-control]" prefix.
// ---------------------------------------------------------------------------

/** Pure predicate. null `from` permitted (never block a legacy row); self-transition ok. */
export function canTransition(from: ControlMode | null | undefined, to: ControlMode): boolean {
  return isLegalTransition(from, to);
}

/** Throwing variant for callers/tests that want the transition enforced. */
export function assertTransition(from: ControlMode | null | undefined, to: ControlMode): void {
  assertLegalTransition(from, to, "conversation-control");
}

// ---------------------------------------------------------------------------
// deriveAssignmentEventType — the PURE MIRROR of migration 0099's log_assignment_event
// trigger CASE. Kept here so the audit-type logic is unit-testable and stays in lock-
// step with the SQL. When the app supplies an explicit type (a human action) it wins;
// otherwise the type is derived from the destination mode + whether it landed claimed.
// ---------------------------------------------------------------------------
export function deriveAssignmentEventType(
  toMode: ControlMode,
  hasAssignee: boolean,
  provided?: AssignmentEventType | null
): AssignmentEventType {
  if (provided) return provided;
  switch (toMode) {
    case "HUMAN_ACTIVE":
      return hasAssignee ? "CLAIMED" : "ESCALATED"; // unclaimed handoff (Option 1)
    case "HOLD_UNCLAIMED":
      return "ESCALATED";
    case "AI_ACTIVE":
    case "AI_RESUME_PENDING":
      return "HANDED_TO_AI";
    case "SYSTEM_HOLD":
      return "SYSTEM_HOLD";
    case "CLOSED":
      return "CLOSED";
    case "HUMAN_IDLE":
      return "REASSIGNED";
    default:
      return assertNever(toMode);
  }
}

// ---------------------------------------------------------------------------
// canHandBack — PURE handback-blocker predicate (Part C releaseToAI). A human may hand
// a conversation back to the AI only when: no unanswered customer message is waiting, no
// open safety case, and the in-progress draft (if any) has been persisted. Pure so the
// blockers are testable and the reason is explicit.
// ---------------------------------------------------------------------------
export interface HandBackState {
  hasUnreadInbound: boolean; // a customer message arrived after the last outbound
  safetyOpen: boolean; // is_safety_hold / SYSTEM_HOLD still active
  draftPersisted: boolean; // any in-progress draft has been committed (or there is none)
}

export type HandBackBlocker = "unread_inbound" | "safety_open" | "draft_unpersisted";

export function handBackBlockers(state: HandBackState): HandBackBlocker[] {
  const blockers: HandBackBlocker[] = [];
  if (state.hasUnreadInbound) blockers.push("unread_inbound");
  if (state.safetyOpen) blockers.push("safety_open");
  if (!state.draftPersisted) blockers.push("draft_unpersisted");
  return blockers;
}

export function canHandBack(state: HandBackState): boolean {
  return handBackBlockers(state).length === 0;
}

// ===========================================================================
// DATA LAYER — thin wrappers over the migration-0099 atomic RPCs. Each RPC sets the
// per-transaction audit GUCs and performs its UPDATE in one transaction, so the epoch
// bump + assignment-event append fire with the real actor. These return the fresh
// { mode, epoch } so a caller can thread the epoch into a send (Part B).
// ===========================================================================

export interface TransitionResult {
  conversationId: string;
  mode: ControlMode;
  epoch: number;
  assignedMemberId?: string | null;
}

/**
 * kv_control_result — the composite type every kv_control_* function returns
 * (migration 0108). Exactly one row, never a set. Only the fields this module
 * consumes are typed here; the composite carries 19 columns in total.
 */
type KvControlResult = {
  conversation_id: string;
  to_mode: string;
  epoch_after: number | string;
  actor_member_id: string | null;
  changed?: boolean;
  replayed?: boolean;
};

function kvResult(conversationId: string, data: unknown): KvControlResult | null {
  const row = Array.isArray(data) ? data[0] : data;
  return (row as KvControlResult) ?? null;
}

/**
 * The kv_control_* functions raise bare `raise exception`, so every failure
 * arrives as SQLSTATE P0001 with the KIVnn token carried in the MESSAGE TEXT.
 * The code must therefore be read off the message, not off `error.code`.
 */
function kivCode(error: unknown): string | null {
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message !== "string") return null;
  return /\bKIV(\d{2})\b/.exec(message)?.[0] ?? null;
}

/**
 * Who holds the conversation right now, for the loser's typed error. Prefers a
 * fresh read — the caller's snapshot was taken before the race and may name the
 * previous owner — and falls back to that snapshot when the read is unavailable
 * (a user-scoped client sees the row only through RLS). Never throws: this runs on
 * a path that is already failing, and a missing name must not mask a ClaimLostError.
 */
async function currentOwner(
  client: SupabaseClient,
  conversationId: string,
  restaurantId: string,
  snapshot?: { assignedMemberId: string | null }
): Promise<string | null> {
  try {
    const { data } = await client
      .from("conversations")
      .select("assigned_member_id")
      .eq("id", conversationId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    const owner = (data as { assigned_member_id?: string | null } | null)?.assigned_member_id ?? null;
    if (owner) return owner;
  } catch {
    // fall through to the snapshot
  }
  return snapshot?.assignedMemberId ?? null;
}

/** Typed loser of an atomic claim — carries who currently owns the conversation. */
export class ClaimLostError extends Error {
  readonly conversationId: string;
  readonly currentOwnerMemberId: string | null;
  constructor(conversationId: string, currentOwnerMemberId: string | null) {
    super(`[conversation-control] claim lost for ${conversationId}` + (currentOwnerMemberId ? ` (owned by ${currentOwnerMemberId})` : ""));
    this.name = "ClaimLostError";
    this.conversationId = conversationId;
    this.currentOwnerMemberId = currentOwnerMemberId;
  }
}

type Row = { id: string; ownership_state: string; control_epoch: number; assigned_member_id?: string | null };

function firstRow(data: unknown): Row | null {
  if (Array.isArray(data)) return (data[0] as Row) ?? null;
  return (data as Row) ?? null;
}

function toResult(conversationId: string, row: Row): TransitionResult {
  return {
    conversationId,
    mode: row.ownership_state as ControlMode,
    epoch: Number(row.control_epoch),
    assignedMemberId: row.assigned_member_id ?? null,
  };
}

/**
 * applyTransition — the general control transition. Validates the move against the pure
 * transition table when a `from` is supplied, then performs the single atomic RPC (epoch
 * bump + audit event fire in the same transaction). `owner`/`status` dual-write the legacy
 * fields; omit to keep them.
 */
export async function applyTransition(
  client: SupabaseClient,
  conversationId: string,
  to: ControlMode,
  opts: {
    from?: ControlMode | null;
    actorMemberId?: string | null;
    eventType?: AssignmentEventType | null;
    reason?: string | null;
    owner?: "ai" | "human" | null;
    status?: string | null;
  } = {}
): Promise<TransitionResult> {
  if (opts.from !== undefined) assertTransition(opts.from, to);
  const { data, error } = await client.rpc("control_apply_transition", {
    p_conversation_id: conversationId,
    p_to_mode: to,
    p_owner: opts.owner ?? null,
    p_status: opts.status ?? null,
    p_actor: opts.actorMemberId ?? null,
    p_event_type: opts.eventType ?? null,
    p_reason: opts.reason ?? null,
  });
  if (error) throw error;
  const row = firstRow(data);
  if (!row) throw new Error(`[conversation-control] applyTransition: conversation ${conversationId} not found`);
  return toResult(conversationId, row);
}

/**
 * escalateToHold — hand a live conversation to a hold + authority NONE. safety=true routes
 * to SYSTEM_HOLD (the established safety state — preserves isSafetyHeld()/#87/red-chip; NO
 * parallel safety representation), non-safety to HOLD_UNCLAIMED. Stores the trigger context
 * (escalation_reason/handover_note) and, for safety, sets is_safety_hold. IDEMPOTENT per
 * (conversation, epoch): the RPC's WHERE excludes already-held/terminal modes, so a repeat
 * call is a no-op (0 rows) — no epoch bump, no duplicate ESCALATED event.
 *
 * Option 1 (Stage-1 ruling): NOT called from the Brain. Brain escalations keep writing
 * HUMAN_ACTIVE + assigned_member_id=NULL and auto-audit as ESCALATED via the trigger. This
 * helper is reached only via new console hold actions.
 */
export async function escalateToHold(
  client: SupabaseClient,
  conversationId: string,
  reason: string,
  opts: { safety?: boolean; actorMemberId?: string | null } = {}
): Promise<{ escalated: boolean; result: TransitionResult | null }> {
  const toMode: ControlMode = opts.safety ? "SYSTEM_HOLD" : "HOLD_UNCLAIMED";
  const { data, error } = await client.rpc("control_escalate_to_hold", {
    p_conversation_id: conversationId,
    p_to_mode: toMode,
    p_reason: reason,
    p_safety: opts.safety ?? false,
    p_actor: opts.actorMemberId ?? null,
  });
  if (error) throw error;
  const row = firstRow(data);
  // 0 rows → already held/terminal → idempotent no-op.
  if (!row) return { escalated: false, result: null };
  return { escalated: true, result: toResult(conversationId, row) };
}

/**
 * claimConversation — the atomic named claim (Part C; MO2 lineage). A single conditional
 * RPC: exactly one of two racing operators wins. The loser throws a typed ClaimLostError
 * carrying the current owner. On win → HUMAN_ACTIVE, authority HUMAN, CLAIMED event, epoch++.
 */
export async function claimConversation(
  client: SupabaseClient,
  args: {
    conversationId: string;
    restaurantId: string;
    memberId: string;
    /**
     * The conversation row as the caller has ALREADY read it. Supply it — both
     * production callers do, from the snapshot they take for their epoch check.
     *
     * It is what preserves the anti-steal rule. The removed control_claim carried
     * `and (assigned_member_id is null or assigned_member_id = p_member_id)` in its
     * WHERE, so claiming a teammate-owned HUMAN_IDLE or SYSTEM_HOLD row returned 0
     * rows. kv_control_claim has NO such predicate — it protects only HUMAN_ACTIVE
     * (KIV15). Without this guard a second operator silently takes a colleague's
     * conversation, which is exactly what the assignee route promises never happens.
     *
     * The guard is `canClaim`, the same pure mirror the console renders from, so
     * button state and server decision cannot disagree.
     */
    current?: { ownershipState: ControlMode | null; assignedMemberId: string | null };
  }
): Promise<TransitionResult> {
  const { conversationId, restaurantId, memberId, current } = args;

  // Pure eligibility gate. Best-effort by construction: it closes the ordinary
  // teammate-owned case, not a genuine race between this read and the RPC. Closing
  // that residual window needs the predicate back inside kv_control_claim.
  if (current && !canClaim({ ownershipState: current.ownershipState, assignedMemberId: current.assignedMemberId }, memberId)) {
    throw new ClaimLostError(conversationId, current.assignedMemberId ?? null);
  }

  // kv_control_claim derives the acting member from the JWT subject
  // (request.jwt.claim.sub) via kv_control_assert_actor — it does NOT take a member
  // id. `client` MUST therefore be a user-scoped client. A service-role client has
  // no JWT subject and is not granted EXECUTE, so it fails twice over.
  const { data, error } = await client.rpc("kv_control_claim", {
    p_conversation_id: conversationId,
    p_expected_restaurant_id: restaurantId,
    p_operation_id: crypto.randomUUID(),
    p_reason: "console claim",
  });

  if (error) {
    // KIV15 — the conversation is held by another member. The one failure that is
    // an expected outcome rather than a fault, so it keeps its typed error.
    if (kivCode(error) === "KIV15") {
      throw new ClaimLostError(conversationId, await currentOwner(client, conversationId, restaurantId, current));
    }
    throw error;
  }

  const row = kvResult(conversationId, data);
  if (!row) throw new Error(`[conversation-control] claimConversation: conversation ${conversationId} not found`);

  // On a claim the actor becomes the assignee; the composite reports the actor.
  return {
    conversationId,
    mode: row.to_mode as ControlMode,
    epoch: Number(row.epoch_after),
    assignedMemberId: row.actor_member_id ?? memberId,
  };
}

/**
 * releaseToAI — hand a human-owned conversation back to the AI. Validates the pure
 * canHandBack blockers first (no unread inbound, no open safety case, draft persisted);
 * a blocked handback throws before any write. The transition goes through
 * AI_RESUME_PENDING then AI_ACTIVE (two audited steps), clearing named ownership +
 * escalation context. Returns the final AI_ACTIVE result.
 */
export async function releaseToAI(
  client: SupabaseClient,
  args: {
    conversationId: string;
    restaurantId: string;
    memberId: string;
    from?: ControlMode | null;
    handBack: HandBackState;
    reason?: string | null;
  }
): Promise<TransitionResult> {
  const blockers = handBackBlockers(args.handBack);
  if (blockers.length) {
    throw new HandBackBlockedError(args.conversationId, blockers);
  }
  // Step 1 — mark resume pending (validation window; authority NONE).
  await applyTransition(client, args.conversationId, "AI_RESUME_PENDING", {
    from: args.from ?? null,
    actorMemberId: args.memberId,
    eventType: "HANDED_TO_AI",
    reason: args.reason ?? null,
    owner: "human",
  });
  // Step 2 — validated → resume with the AI.
  const { data, error } = await client.rpc("control_release_to_ai", {
    p_conversation_id: args.conversationId,
    p_restaurant_id: args.restaurantId,
    p_actor: args.memberId,
    p_reason: args.reason ?? null,
  });
  if (error) throw error;
  const row = firstRow(data);
  if (!row) throw new Error(`[conversation-control] releaseToAI: conversation ${args.conversationId} not found`);
  return toResult(args.conversationId, row);
}

/** Typed handback rejection — carries the exact blockers so the caller can explain. */
export class HandBackBlockedError extends Error {
  readonly conversationId: string;
  readonly blockers: HandBackBlocker[];
  constructor(conversationId: string, blockers: HandBackBlocker[]) {
    super(`[conversation-control] handback blocked for ${conversationId}: ${blockers.join(", ")}`);
    this.name = "HandBackBlockedError";
    this.conversationId = conversationId;
    this.blockers = blockers;
  }
}

/**
 * managerReassign — move a conversation from one member to another. Requires manager role
 * (the caller enforces it via the require-tenant gate — the same role-authority pattern the
 * last-manager guard, migrations 0089/0094, protects). Conditional on the current owner so
 * a stale reassign can't clobber a takeover that already moved. Writes MANAGER_TAKEOVER when
 * the manager takes it themselves, else REASSIGNED. epoch++.
 */
export async function managerReassign(
  client: SupabaseClient,
  args: {
    conversationId: string;
    restaurantId: string;
    fromMemberId: string | null;
    toMemberId: string;
    actorMemberId: string; // the acting manager
    isManager: boolean; // resolved by the caller from the session (require-tenant role)
    reason?: string | null;
  }
): Promise<TransitionResult> {
  if (!args.isManager) {
    throw new NotManagerError(args.conversationId);
  }
  const eventType: AssignmentEventType = args.toMemberId === args.actorMemberId ? "MANAGER_TAKEOVER" : "REASSIGNED";
  const { data, error } = await client.rpc("control_reassign", {
    p_conversation_id: args.conversationId,
    p_restaurant_id: args.restaurantId,
    p_from_member: args.fromMemberId,
    p_to_member: args.toMemberId,
    p_actor: args.actorMemberId,
    p_event_type: eventType,
    p_reason: args.reason ?? null,
  });
  if (error) throw error;
  const row = firstRow(data);
  if (!row) throw new ReassignPreconditionError(args.conversationId, args.fromMemberId);
  return toResult(args.conversationId, row);
}

/** The reassign's optimistic precondition (current owner) did not hold. */
export class ReassignPreconditionError extends Error {
  readonly conversationId: string;
  readonly expectedFromMemberId: string | null;
  constructor(conversationId: string, expectedFromMemberId: string | null) {
    super(`[conversation-control] reassign precondition failed for ${conversationId}`);
    this.name = "ReassignPreconditionError";
    this.conversationId = conversationId;
    this.expectedFromMemberId = expectedFromMemberId;
  }
}

/** A non-manager attempted a manager-only reassignment. */
export class NotManagerError extends Error {
  readonly conversationId: string;
  constructor(conversationId: string) {
    super(`[conversation-control] manager role required to reassign ${conversationId}`);
    this.name = "NotManagerError";
    this.conversationId = conversationId;
  }
}
