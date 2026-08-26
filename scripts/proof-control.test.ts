// ============================================================================
// WO-CONTROL proof — the conversation control plane. Proves the four guarantees the
// human-takeover suite is built on, all without a live DB (pure functions + a faithful
// in-memory mirror of the migration-0099 RPCs + triggers):
//   • authorityFor is total & exhaustive — no mode ever yields AI *and* HUMAN.
//   • the transition table admits the legal moves and rejects the illegal ones.
//   • the atomic claim has exactly one winner in a double-claim race (loser → ClaimLostError).
//   • the control_epoch send gate drops a stale sender (enqueue at N, transition to N+1,
//     send → blocked_stale_sender, NOTHING transmitted).
//   • handback blockers; per-transition audit rows with correct epoch_before/after;
//     escalateToHold idempotent per epoch.
// Run: node --conditions=react-server --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types scripts/proof-control.test.ts
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  authorityFor,
  canTransition,
  CONTROL_MODES,
  deriveAssignmentEventType,
  handBackBlockers,
  canHandBack,
  claimConversation,
  releaseToAI,
  managerReassign,
  applyTransition,
  escalateToHold,
  ClaimLostError,
  HandBackBlockedError,
  NotManagerError,
  ReassignPreconditionError,
  type ControlMode,
} from "../lib/console/conversation-control.ts";
import { checkControlEpoch, guardedSend, readControlEpoch } from "../lib/messaging/send-gate.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// ── A faithful in-memory mirror of migration 0099: the RPCs + the epoch-bump and
//    audit-append triggers. One shared conversations map + events/signals logs. ────────
function makeDb(seed: Array<Record<string, unknown>>) {
  const convs = new Map<string, Record<string, unknown>>();
  for (const c of seed) convs.set(c.id as string, { is_safety_hold: false, escalation_reason: null, handover_note: null, status: "AI نشط", assigned_member_id: null, ...c });
  const events: Record<string, unknown>[] = [];
  const signals: Record<string, unknown>[] = [];

  // The BEFORE(epoch)+AFTER(audit) triggers: bump epoch + append an event iff a control
  // axis (ownership_state / owner / assigned_member_id) actually changed.
  function fire(old: Record<string, unknown>, next: Record<string, unknown>, ctx: { actor?: string | null; type?: string | null; reason?: string | null }) {
    const changed =
      next.ownership_state !== old.ownership_state ||
      next.owner !== old.owner ||
      (next.assigned_member_id ?? null) !== (old.assigned_member_id ?? null);
    if (!changed) return next;
    next.control_epoch = (old.control_epoch as number) + 1;
    const hasAssignee = next.assigned_member_id != null;
    const type = (ctx.type && ctx.type.length ? ctx.type : null) ?? deriveAssignmentEventType(next.ownership_state as ControlMode, hasAssignee);
    events.push({
      conversation_id: next.id, restaurant_id: next.restaurant_id, event_type: type,
      actor_member_id: ctx.actor ?? null, from_mode: old.ownership_state, to_mode: next.ownership_state,
      epoch_before: old.control_epoch, epoch_after: next.control_epoch, reason: ctx.reason ?? null,
    });
    return next;
  }

  const CLAIMABLE = ["AI_ACTIVE", "HOLD_UNCLAIMED", "HUMAN_IDLE", "SYSTEM_HOLD"];

  // The acting member. kv_control_claim (migration 0108) takes NO member-id
  // parameter — it resolves the actor from the JWT subject. A user-scoped client is
  // therefore bound to one member, which is what `.as(memberId)` below models. The
  // default exists only so the blocks that do not care about identity stay readable.
  let actingMember: string | null = "m-default";

  const rpc = async (name: string, p: Record<string, unknown>) => {
    const id = p.p_conversation_id as string;
    const row = convs.get(id);
    if (!row) return { data: [], error: null };

    // A faithful stand-in for the production kv_control_claim. Modelled from the
    // live function body, INCLUDING the gap: it protects HUMAN_ACTIVE (KIV15) and
    // nothing else, so a teammate-owned HUMAN_IDLE or SYSTEM_HOLD row is claimable
    // at the database level. The removed control_claim carried
    //   and (assigned_member_id is null or assigned_member_id = p_member_id)
    // in its WHERE and so refused it. C8/C9 below pin both halves of that.
    //
    // Errors are returned the way PostgREST surfaces them: a bare `raise exception`
    // arrives as SQLSTATE P0001 with the KIVnn token only in the message text.
    if (name === "kv_control_claim") {
      const kiv = (code: string, msg: string) => ({ data: null, error: { code: "P0001", message: `${code} ${msg}` } });
      const actor = actingMember;
      if (row.restaurant_id !== p.p_expected_restaurant_id) return kiv("KIV11", "conversation not found for tenant");

      const state = row.ownership_state as string;
      const assignee = (row.assigned_member_id ?? null) as string | null;

      // Idempotent re-claim by the same member: no write, no event, no epoch bump.
      if (state === "HUMAN_ACTIVE" && row.owner === "human" && assignee !== null && assignee === actor) {
        return { data: { conversation_id: id, to_mode: state, epoch_after: row.control_epoch, actor_member_id: actor, changed: false, replayed: true }, error: null };
      }
      if (state === "HUMAN_ACTIVE" && assignee !== null) return kiv("KIV15", "claim lost - held by another member");
      if (state === "HUMAN_ACTIVE") return kiv("KIV14", "illegal transition - HUMAN_ACTIVE is not a claim source");
      if (!CLAIMABLE.includes(state)) return kiv("KIV14", `illegal transition from ${state} for claim`);

      const next = { ...row, assigned_member_id: actor, ownership_state: "HUMAN_ACTIVE", owner: "human", status: "تم التحويل لموظف" };
      fire(row, next, { actor, type: "CLAIMED" });
      convs.set(id, next);
      return { data: { conversation_id: id, to_mode: next.ownership_state, epoch_after: next.control_epoch, actor_member_id: actor, changed: true, replayed: false }, error: null };
    }
    const ret = (r: Record<string, unknown>) => ({ data: [{ id: r.id, ownership_state: r.ownership_state, control_epoch: r.control_epoch, assigned_member_id: r.assigned_member_id ?? null }], error: null });
    if (name === "control_apply_transition") {
      const next = { ...row, ownership_state: p.p_to_mode, owner: (p.p_owner as string) ?? row.owner, status: (p.p_status as string) ?? row.status };
      fire(row, next, { actor: p.p_actor as string, type: p.p_event_type as string, reason: p.p_reason as string });
      convs.set(id, next); return ret(next);
    }
    if (name === "control_escalate_to_hold") {
      if (["HOLD_UNCLAIMED", "SYSTEM_HOLD", "CLOSED"].includes(row.ownership_state as string)) return { data: [], error: null };
      const next = { ...row, ownership_state: p.p_to_mode, owner: "human", status: "يحتاج تدخل موظف",
        is_safety_hold: (row.is_safety_hold as boolean) || (p.p_safety as boolean),
        escalation_reason: (row.escalation_reason as string) ?? p.p_reason, handover_note: (row.handover_note as string) ?? p.p_reason };
      fire(row, next, { actor: p.p_actor as string, type: "ESCALATED", reason: p.p_reason as string });
      convs.set(id, next); return ret(next);
    }
    if (name === "control_claim") {
      const claimable = row.restaurant_id === p.p_restaurant_id && CLAIMABLE.includes(row.ownership_state as string) &&
        (row.assigned_member_id == null || row.assigned_member_id === p.p_member_id);
      if (!claimable) return { data: [], error: null };
      const next = { ...row, assigned_member_id: p.p_member_id, ownership_state: "HUMAN_ACTIVE", owner: "human", status: "تم التحويل لموظف" };
      fire(row, next, { actor: p.p_member_id as string, type: "CLAIMED" });
      convs.set(id, next); return ret(next);
    }
    if (name === "control_reassign") {
      const ok2 = row.restaurant_id === p.p_restaurant_id && (row.assigned_member_id ?? null) === (p.p_from_member ?? null);
      if (!ok2) return { data: [], error: null };
      const next = { ...row, assigned_member_id: p.p_to_member, ownership_state: "HUMAN_ACTIVE", owner: "human" };
      fire(row, next, { actor: p.p_actor as string, type: p.p_event_type as string, reason: p.p_reason as string });
      convs.set(id, next); return ret(next);
    }
    if (name === "control_release_to_ai") {
      const next = { ...row, ownership_state: "AI_ACTIVE", owner: "ai", status: "AI نشط", assigned_member_id: null, escalation_reason: null, handover_note: null };
      fire(row, next, { actor: p.p_actor as string, type: "HANDED_TO_AI", reason: p.p_reason as string });
      convs.set(id, next); return ret(next);
    }
    return { data: [], error: null };
  };

  // Minimal from() supporting the reads the lib does + the signal insert.
  const from = (table: string) => {
    const b: Record<string, unknown> = {};
    let cols = "*";
    const filt: Record<string, unknown> = {};
    b.select = (c: string) => { cols = c; return b; };
    b.eq = (k: string, v: unknown) => { filt[k] = v; return b; };
    b.insert = async (rowIn: Record<string, unknown>) => { if (table === "conversation_signals") signals.push(rowIn); return { data: null, error: null }; };
    b.maybeSingle = async () => {
      const row = convs.get(filt.id as string);
      if (!row) return { data: null, error: null };
      if (cols.includes("control_epoch")) return { data: { control_epoch: row.control_epoch }, error: null };
      if (cols.includes("assigned_member_id")) return { data: { assigned_member_id: row.assigned_member_id ?? null }, error: null };
      return { data: row, error: null };
    };
    return b;
  };
  // `.as(memberId)` — a client carrying that member's JWT. Same underlying store,
  // different actor, exactly as two operators hitting the same row would be.
  const base = { _convs: convs, _events: events, _signals: signals, rpc, from };
  const as = (memberId: string) => {
    const bound = { ...base, rpc: async (name: string, p: Record<string, unknown>) => { actingMember = memberId; return rpc(name, p); }, as };
    return bound as unknown as import("@supabase/supabase-js").SupabaseClient;
  };
  return { ...base, as } as unknown as import("@supabase/supabase-js").SupabaseClient & { _convs: Map<string, Record<string, unknown>>; _events: Record<string, unknown>[]; _signals: Record<string, unknown>[]; as: (memberId: string) => import("@supabase/supabase-js").SupabaseClient };
}

const RID = "rest-1";

// ══ A — authorityFor: total, exhaustive, never AI+HUMAN ══════════════════════════════
{
  const seen = new Set<string>();
  let everAmbiguous = false;
  for (const m of CONTROL_MODES) {
    const a = authorityFor(m);
    seen.add(a);
    if (!(a === "AI" || a === "HUMAN" || a === "NONE")) everAmbiguous = true;
  }
  ok("A1: authorityFor is total over all 7 modes (no throw)", true);
  ok("A2: authorityFor only ever returns AI | HUMAN | NONE", !everAmbiguous && [...seen].every((x) => ["AI", "HUMAN", "NONE"].includes(x)));
  ok("A3: AI_ACTIVE → AI (the only AI-authority mode)", authorityFor("AI_ACTIVE") === "AI" && CONTROL_MODES.filter((m) => authorityFor(m) === "AI").length === 1);
  ok("A4: HUMAN authority = exactly {HUMAN_ACTIVE, HUMAN_IDLE}", CONTROL_MODES.filter((m) => authorityFor(m) === "HUMAN").join(",") === "HUMAN_ACTIVE,HUMAN_IDLE");
  ok("A5: NONE authority = the holds/pending/closed", CONTROL_MODES.filter((m) => authorityFor(m) === "NONE").sort().join(",") === "AI_RESUME_PENDING,CLOSED,HOLD_UNCLAIMED,SYSTEM_HOLD");
  // The structural guarantee: no single mode is simultaneously AI and HUMAN (a function
  // returns one value — this asserts the contract explicitly per mode).
  const dual = CONTROL_MODES.some((m) => authorityFor(m) === "AI" && (authorityFor(m) as string) === "HUMAN");
  ok("A6: no mode yields AI and HUMAN simultaneously", dual === false);
}

// ══ B — transition table: legal & illegal ════════════════════════════════════════════
{
  ok("B1: AI_ACTIVE → HUMAN_ACTIVE legal (takeover)", canTransition("AI_ACTIVE", "HUMAN_ACTIVE"));
  ok("B2: AI_ACTIVE → HOLD_UNCLAIMED legal (escalate)", canTransition("AI_ACTIVE", "HOLD_UNCLAIMED"));
  ok("B3: AI_ACTIVE → SYSTEM_HOLD legal (safety)", canTransition("AI_ACTIVE", "SYSTEM_HOLD"));
  ok("B4: HOLD_UNCLAIMED → HUMAN_ACTIVE legal (claim)", canTransition("HOLD_UNCLAIMED", "HUMAN_ACTIVE"));
  ok("B5: HUMAN_ACTIVE → AI_RESUME_PENDING legal (handback start)", canTransition("HUMAN_ACTIVE", "AI_RESUME_PENDING"));
  ok("B6: AI_RESUME_PENDING → AI_ACTIVE legal (resume)", canTransition("AI_RESUME_PENDING", "AI_ACTIVE"));
  ok("B7: CLOSED → AI_ACTIVE legal (reopen)", canTransition("CLOSED", "AI_ACTIVE"));
  ok("B8: self-transition is an idempotent no-op (allowed)", canTransition("HUMAN_ACTIVE", "HUMAN_ACTIVE"));
  ok("B9: null from never blocks a legacy row", canTransition(null, "HUMAN_ACTIVE"));
  // Illegal:
  ok("B10: CLOSED → HUMAN_ACTIVE ILLEGAL (must reopen to AI first)", !canTransition("CLOSED", "HUMAN_ACTIVE"));
  ok("B11: AI_ACTIVE → AI_RESUME_PENDING ILLEGAL (nothing to resume)", !canTransition("AI_ACTIVE", "AI_RESUME_PENDING"));
  ok("B12: SYSTEM_HOLD → HOLD_UNCLAIMED ILLEGAL", !canTransition("SYSTEM_HOLD", "HOLD_UNCLAIMED"));
  ok("B13: HOLD_UNCLAIMED → AI_RESUME_PENDING ILLEGAL", !canTransition("HOLD_UNCLAIMED", "AI_RESUME_PENDING"));
  // Consistency with the legacy ownership map for the five shared modes (subset check):
  // every legacy edge that WAS legal stays legal here (no regression).
  const legacy: Record<string, string[]> = {
    AI_ACTIVE: ["HUMAN_ACTIVE", "SYSTEM_HOLD", "CLOSED"],
    HUMAN_ACTIVE: ["HUMAN_IDLE", "AI_ACTIVE", "CLOSED"],
    HUMAN_IDLE: ["HUMAN_ACTIVE", "AI_ACTIVE", "CLOSED"],
    SYSTEM_HOLD: ["HUMAN_ACTIVE", "AI_ACTIVE", "CLOSED"],
    CLOSED: ["AI_ACTIVE"],
  };
  let superset = true;
  for (const [f, tos] of Object.entries(legacy)) for (const t of tos) if (!canTransition(f as ControlMode, t as ControlMode)) superset = false;
  ok("B14: control table is a superset of the legacy ownership map (no shared-edge regression)", superset);
}

// ══ C — atomic claim: double-winner race ═════════════════════════════════════════════
{
  const db = makeDb([{ id: "c1", restaurant_id: RID, ownership_state: "HOLD_UNCLAIMED", owner: "human", control_epoch: 3, assigned_member_id: null }]);
  const asAlice = (db as unknown as { as: (m: string) => typeof db }).as("m-alice");
  const asBob = (db as unknown as { as: (m: string) => typeof db }).as("m-bob");
  const results = await Promise.allSettled([
    claimConversation(asAlice, { conversationId: "c1", restaurantId: RID, memberId: "m-alice" }),
    claimConversation(asBob, { conversationId: "c1", restaurantId: RID, memberId: "m-bob" }),
  ]);
  const winners = results.filter((r) => r.status === "fulfilled");
  const losers = results.filter((r) => r.status === "rejected");
  ok("C1: exactly ONE claim wins", winners.length === 1);
  ok("C2: exactly ONE claim loses", losers.length === 1);
  ok("C3: the loser throws a typed ClaimLostError", losers.length === 1 && (losers[0] as PromiseRejectedResult).reason instanceof ClaimLostError);
  const winner = (winners[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof claimConversation>>>).value;
  ok("C4: winner lands HUMAN_ACTIVE (authority HUMAN)", winner.mode === "HUMAN_ACTIVE" && authorityFor(winner.mode) === "HUMAN");
  ok("C5: the loser's error names the current owner", (losers[0] as PromiseRejectedResult).reason.currentOwnerMemberId === winner.assignedMemberId);
  ok("C6: exactly ONE CLAIMED audit row was written for the race", db._events.filter((e) => e.event_type === "CLAIMED" && e.conversation_id === "c1").length === 1);
  ok("C7: the claim bumped the epoch (3 → 4)", winner.epoch === 4);

  // ── C8/C9 — the anti-steal rule, pinned on BOTH sides of the boundary. ──────────
  // Migration 0108 dropped the ownership predicate that control_claim carried, so
  // the database alone no longer refuses a teammate-owned idle row. The wrapper
  // restores the rule via the pure canClaim guard. If someone later puts the
  // predicate back into kv_control_claim, C8 fails and says so — it is a statement
  // about the database's behaviour, not a licence for it.
  {
    const owned = makeDb([{ id: "c1b", restaurant_id: RID, ownership_state: "HUMAN_IDLE", owner: "human", control_epoch: 7, assigned_member_id: "m-alice" }]);
    const bob = (owned as unknown as { as: (m: string) => typeof owned }).as("m-bob");

    // Without the snapshot the guard cannot run, and the DB lets Bob take it.
    const stolen = await claimConversation(bob, { conversationId: "c1b", restaurantId: RID, memberId: "m-bob" });
    ok("C8: kv_control_claim ALONE does not refuse a teammate-owned HUMAN_IDLE row (0108 dropped the predicate)",
      stolen.mode === "HUMAN_ACTIVE" && stolen.assignedMemberId === "m-bob");

    // With the snapshot the caller supplies, canClaim refuses it before any write.
    const owned2 = makeDb([{ id: "c1c", restaurant_id: RID, ownership_state: "HUMAN_IDLE", owner: "human", control_epoch: 7, assigned_member_id: "m-alice" }]);
    const bob2 = (owned2 as unknown as { as: (m: string) => typeof owned2 }).as("m-bob");
    let refused: unknown = null;
    try {
      await claimConversation(bob2, {
        conversationId: "c1c", restaurantId: RID, memberId: "m-bob",
        current: { ownershipState: "HUMAN_IDLE", assignedMemberId: "m-alice" },
      });
    } catch (e) { refused = e; }
    ok("C9: with `current` supplied the wrapper refuses it — ClaimLostError naming the real owner",
      refused instanceof ClaimLostError && (refused as ClaimLostError).currentOwnerMemberId === "m-alice");
    ok("C10: the refused claim wrote NOTHING — no event, no epoch bump",
      (owned2 as unknown as { _events: unknown[] })._events.length === 0 &&
      ((owned2 as unknown as { _convs: Map<string, Record<string, unknown>> })._convs.get("c1c")!.control_epoch === 7));
  }
}

// ══ D — control_epoch SEND GATE: stale sender blocked, nothing transmitted ════════════
{
  const db = makeDb([{ id: "c2", restaurant_id: RID, ownership_state: "AI_ACTIVE", owner: "ai", control_epoch: 5 }]);
  const enqueuedEpoch = await readControlEpoch(db, "c2"); // = 5, captured at "turn start"
  // A human claims mid-turn → epoch bumps to 6.
  await claimConversation(db, { conversationId: "c2", restaurantId: RID, memberId: "m-eve" });
  const currentEpoch = await readControlEpoch(db, "c2");
  ok("D1: a mid-turn claim advanced the epoch (5 → 6)", enqueuedEpoch === 5 && currentEpoch === 6);

  let transmitted = false;
  const guard = { admin: db, conversationId: "c2", restaurantId: RID, epochAtEnqueue: enqueuedEpoch, source: "ai_reply" };
  const outcome = await guardedSend(guard, async () => { transmitted = true; return "SENT"; });
  ok("D2: the stale send is BLOCKED", outcome.blocked === true);
  ok("D3: NOTHING was transmitted (the send thunk never ran)", transmitted === false);
  ok("D4: a blocked_stale_sender signal was logged", db._signals.some((s) => s.type === "blocked_stale_sender"));
  const sig = db._signals.find((s) => s.type === "blocked_stale_sender") as { detail?: Record<string, unknown> } | undefined;
  ok("D5: the signal records enqueued + current epoch + source", !!sig && (sig.detail as { enqueued_epoch?: number }).enqueued_epoch === 5 && (sig.detail as { current_epoch?: number }).current_epoch === 6 && (sig.detail as { source?: string }).source === "ai_reply");

  // Matching epoch → the gate is a pure no-op (the required byte-neutral normal case).
  const db2 = makeDb([{ id: "c3", restaurant_id: RID, ownership_state: "AI_ACTIVE", owner: "ai", control_epoch: 9 }]);
  let sent2 = false;
  const out2 = await guardedSend({ admin: db2, conversationId: "c3", restaurantId: RID, epochAtEnqueue: 9, source: "ai_reply" }, async () => { sent2 = true; return "SENT"; });
  ok("D6: matching epoch → send PROCEEDS (no-op gate)", out2.blocked === false && sent2 === true);
  ok("D7: no signal logged when the epoch matches", db2._signals.length === 0);

  // Deploy-safe: no enqueue epoch → gate inert (never blocks).
  const inert = await checkControlEpoch({ admin: db2, conversationId: "c3", restaurantId: RID, epochAtEnqueue: null, source: "x" });
  ok("D8: null enqueue epoch → gate inert (never blocks)", inert.blocked === false && inert.deployed === false);
}

// ══ E — handback blockers (canHandBack) ══════════════════════════════════════════════
{
  ok("E1: clean state → handback allowed", canHandBack({ hasUnreadInbound: false, safetyOpen: false, draftPersisted: true }));
  ok("E2: unread inbound blocks handback", !canHandBack({ hasUnreadInbound: true, safetyOpen: false, draftPersisted: true }) && handBackBlockers({ hasUnreadInbound: true, safetyOpen: false, draftPersisted: true }).includes("unread_inbound"));
  ok("E3: open safety case blocks handback", handBackBlockers({ hasUnreadInbound: false, safetyOpen: true, draftPersisted: true }).includes("safety_open"));
  ok("E4: unpersisted draft blocks handback", handBackBlockers({ hasUnreadInbound: false, safetyOpen: false, draftPersisted: false }).includes("draft_unpersisted"));
  // releaseToAI enforces the blockers before any write.
  const db = makeDb([{ id: "c4", restaurant_id: RID, ownership_state: "HUMAN_ACTIVE", owner: "human", control_epoch: 2, assigned_member_id: "m-x" }]);
  let threw = false;
  try {
    await releaseToAI(db, { conversationId: "c4", restaurantId: RID, memberId: "m-x", from: "HUMAN_ACTIVE", handBack: { hasUnreadInbound: true, safetyOpen: false, draftPersisted: true } });
  } catch (e) { threw = e instanceof HandBackBlockedError; }
  ok("E5: releaseToAI throws HandBackBlockedError when blocked (no write)", threw && (db._convs.get("c4") as { ownership_state: string }).ownership_state === "HUMAN_ACTIVE");
  // Clean handback → AI_ACTIVE via AI_RESUME_PENDING (two audited steps).
  const rel = await releaseToAI(db, { conversationId: "c4", restaurantId: RID, memberId: "m-x", from: "HUMAN_ACTIVE", handBack: { hasUnreadInbound: false, safetyOpen: false, draftPersisted: true } });
  ok("E6: clean handback lands AI_ACTIVE (authority AI)", rel.mode === "AI_ACTIVE" && authorityFor(rel.mode) === "AI");
  ok("E7: handback cleared the named owner", rel.assignedMemberId == null);
  ok("E8: handback audited a HANDED_TO_AI event", db._events.some((e) => e.event_type === "HANDED_TO_AI" && e.conversation_id === "c4"));
}

// ══ F — assignment-event audit: correct epoch_before/after on each transition ═════════
{
  const db = makeDb([{ id: "c5", restaurant_id: RID, ownership_state: "AI_ACTIVE", owner: "ai", control_epoch: 0 }]);
  await applyTransition(db, "c5", "HUMAN_ACTIVE", { from: "AI_ACTIVE", actorMemberId: "m-q", eventType: "CLAIMED", owner: "human" });
  await applyTransition(db, "c5", "HUMAN_IDLE", { from: "HUMAN_ACTIVE", actorMemberId: "m-q", owner: "human" });
  const evs = db._events.filter((e) => e.conversation_id === "c5");
  ok("F1: one audit row per transition", evs.length === 2);
  ok("F2: first row epoch_before/after = 0 → 1", evs[0].epoch_before === 0 && evs[0].epoch_after === 1);
  ok("F3: second row epoch_before/after = 1 → 2 (contiguous)", evs[1].epoch_before === 1 && evs[1].epoch_after === 2);
  ok("F4: audit captures from_mode/to_mode", evs[0].from_mode === "AI_ACTIVE" && evs[0].to_mode === "HUMAN_ACTIVE");
  ok("F5: explicit actor recorded on a human action", evs[0].actor_member_id === "m-q");
  // derived event_type mirror (matches the SQL trigger CASE):
  ok("F6: derive CLAIMED for HUMAN_ACTIVE + assignee", deriveAssignmentEventType("HUMAN_ACTIVE", true) === "CLAIMED");
  ok("F7: derive ESCALATED for HUMAN_ACTIVE unclaimed (Option 1)", deriveAssignmentEventType("HUMAN_ACTIVE", false) === "ESCALATED");
  ok("F8: derive HANDED_TO_AI for AI_ACTIVE", deriveAssignmentEventType("AI_ACTIVE", false) === "HANDED_TO_AI");
  ok("F9: an explicit provided type wins over derivation", deriveAssignmentEventType("HUMAN_ACTIVE", false, "MANAGER_TAKEOVER") === "MANAGER_TAKEOVER");
}

// ══ G — escalateToHold: idempotent per (conversation, epoch) ══════════════════════════
{
  const db = makeDb([{ id: "c6", restaurant_id: RID, ownership_state: "AI_ACTIVE", owner: "ai", control_epoch: 1 }]);
  const first = await escalateToHold(db, "c6", "human_request", { safety: false });
  ok("G1: first escalate transitions AI_ACTIVE → HOLD_UNCLAIMED", first.escalated && first.result?.mode === "HOLD_UNCLAIMED");
  ok("G2: escalate bumped the epoch (1 → 2)", first.result?.epoch === 2);
  ok("G3: escalate authority is NONE", authorityFor(first.result!.mode) === "NONE");
  const second = await escalateToHold(db, "c6", "human_request", { safety: false });
  ok("G4: second escalate at the same held epoch is a NO-OP (idempotent)", second.escalated === false && second.result === null);
  ok("G5: no duplicate ESCALATED audit row (exactly one)", db._events.filter((e) => e.event_type === "ESCALATED" && e.conversation_id === "c6").length === 1);
  ok("G6: epoch did NOT advance on the idempotent repeat", (db._convs.get("c6") as { control_epoch: number }).control_epoch === 2);
  // safety=true routes to SYSTEM_HOLD (established safety state, not a parallel representation).
  const db2 = makeDb([{ id: "c7", restaurant_id: RID, ownership_state: "AI_ACTIVE", owner: "ai", control_epoch: 0 }]);
  const safe = await escalateToHold(db2, "c7", "allergy", { safety: true });
  ok("G7: safety escalate routes to SYSTEM_HOLD + sets is_safety_hold", safe.result?.mode === "SYSTEM_HOLD" && (db2._convs.get("c7") as { is_safety_hold: boolean }).is_safety_hold === true);
}

// ══ H — managerReassign: role gate + optimistic precondition ══════════════════════════
{
  const db = makeDb([{ id: "c8", restaurant_id: RID, ownership_state: "HUMAN_ACTIVE", owner: "human", control_epoch: 4, assigned_member_id: "m-1" }]);
  let notMgr = false;
  try { await managerReassign(db, { conversationId: "c8", restaurantId: RID, fromMemberId: "m-1", toMemberId: "m-2", actorMemberId: "m-1", isManager: false }); }
  catch (e) { notMgr = e instanceof NotManagerError; }
  ok("H1: a non-manager is rejected (NotManagerError)", notMgr);
  const r = await managerReassign(db, { conversationId: "c8", restaurantId: RID, fromMemberId: "m-1", toMemberId: "m-2", actorMemberId: "m-mgr", isManager: true, reason: "load-balance" });
  ok("H2: a manager reassigns m-1 → m-2", r.assignedMemberId === "m-2");
  ok("H3: reassign audited REASSIGNED with epoch bump", db._events.some((e) => e.event_type === "REASSIGNED" && e.conversation_id === "c8" && e.epoch_after === 5));
  // stale precondition (from no longer the owner) → precondition error, no clobber.
  let stale = false;
  try { await managerReassign(db, { conversationId: "c8", restaurantId: RID, fromMemberId: "m-1", toMemberId: "m-3", actorMemberId: "m-mgr", isManager: true }); }
  catch (e) { stale = e instanceof ReassignPreconditionError; }
  ok("H4: a stale reassign (wrong expected owner) fails the precondition", stale && (db._convs.get("c8") as { assigned_member_id: string }).assigned_member_id === "m-2");
}

// ══ I — wiring witnesses (the source actually threads the epoch + gate) ═══════════════
{
  const rs = readFileSync(resolve(process.cwd(), "lib/messaging/respond-and-send.ts"), "utf8");
  const ob = readFileSync(resolve(process.cwd(), "lib/messaging/outbound.ts"), "utf8");
  ok("I1: respond-and-send captures the epoch at turn start", /controlEpochAtStart[\s\S]{0,120}readControlEpoch\(admin, conversationId\)/.test(rs));
  ok("I2: respond-and-send threads a guard into the reply send", /guard: epochGuard/.test(rs) && /source: "ai_reply"/.test(rs));
  ok("I3: a blocked stale send returns the blocked_stale_sender status", /send\.blocked === "stale_sender"[\s\S]{0,220}status: "blocked_stale_sender"/.test(rs));
  ok("I4: the gate sits in the outbound chokepoint (both text + interactive)", (ob.match(/checkControlEpoch\(args\.guard\)/g) ?? []).length >= 2);
  ok("I5: the outbound gate logs the signal + drops the send before transmit", /logBlockedStaleSender\(args\.guard[\s\S]{0,120}staleSenderResult/.test(ob));
  // Part D (Option 1): NO brain-file escalateToHold call — brain auto-audit covers it.
  const ct = readFileSync(resolve(process.cwd(), "lib/ai/customer-turn.ts"), "utf8");
  ok("I6: Part D Option 1 — customer-turn.ts does NOT import the control module (zero brain lines)", !/console\/conversation-control/.test(ct));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} control-plane: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
