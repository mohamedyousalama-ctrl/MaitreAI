// ============================================================================
// KIVO-SHIFT — «الوردية» pure-model tests (WO-SHIFT-1 VERIFICATION).
// Run: node --experimental-strip-types --test components/console-v2/shift/shift-model.test.ts
// Pure (the model's only imports are type-only → erased by strip-types), so it
// runs without the Next bundler, exactly like lib/console-v2/display-state.test.ts.
// Covers every behaviour the work order names: the two-state product boundary,
// the urgency sort (safety first), elapsed render + escalation, the claim race
// (one winner, loser view-only), stale epoch → refresh, totals-from-server, and
// disabled-actions-expose-a-reason.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";
import {
  shiftOrderState,
  isAccepted,
  isAcceptable,
  isAcceptedToday,
  isPaymentBlocked,
  isAddressBlocked,
  serverTotal,
  sortActNow,
  ACT_NOW_RANK,
  formatElapsed,
  elapsedTier,
  isPastTimeLimit,
  TIME_LIMIT_MS,
  resolveClaimResponse,
  resolveAcceptResponse,
  acceptAvailability,
  claimAvailability,
  stopKarimAvailability,
  connectionState,
  actionsEnabled,
  shiftCounts,
  whatsappWindow,
  WHATSAPP_WINDOW_MS,
  composerState,
  isForbiddenSafetyResolution,
  safetyHandbackAllowed,
  SAFETY_ACK_STATES,
  type ActNowItem,
  type ShiftOrder,
  type ActionContext,
  type ComposerInput,
} from "./shift-model.ts";

const order = (o: Partial<ShiftOrder>): ShiftOrder => ({
  id: "o1",
  orderStatus: "paid",
  posStatus: "not_entered",
  createdAt: 0,
  ...o,
});

// ---------------------------------------------------------------------------
// THE PRODUCT BOUNDARY — exactly two states, and everything else off-screen.
// ---------------------------------------------------------------------------
test("boundary — confirmed + not-entered → needs_acceptance", () => {
  assert.equal(shiftOrderState(order({ orderStatus: "paid", posStatus: "not_entered" })), "needs_acceptance");
  assert.equal(shiftOrderState(order({ orderStatus: "preparing", posStatus: "not_entered" })), "needs_acceptance");
});

test("boundary — POS-entered / sent → accepted", () => {
  assert.equal(shiftOrderState(order({ posStatus: "entered" })), "accepted");
  assert.equal(shiftOrderState(order({ posStatus: "sent_to_kitchen" })), "accepted");
  assert.equal(isAccepted(order({ posStatus: "entered" })), true);
  assert.equal(isAccepted(order({ posStatus: "not_entered" })), false);
});

test("boundary — draft / pending / cancelled / test are NOT on this screen", () => {
  assert.equal(shiftOrderState(order({ orderStatus: "draft" })), null);
  assert.equal(shiftOrderState(order({ orderStatus: "pending_confirmation" })), null);
  assert.equal(shiftOrderState(order({ orderStatus: "pending_payment" })), null); // payment blocker, not an accept card
  assert.equal(shiftOrderState(order({ orderStatus: "cancelled" })), null);
  assert.equal(shiftOrderState(order({ orderStatus: "paid", isTest: true })), null);
});

test("boundary — an accepted TEST order still reads accepted (it was stamped), but is never acceptable", () => {
  // isAcceptable gates the accept ACTION (never a test order); isAccepted reflects a real stamp.
  assert.equal(isAcceptable(order({ orderStatus: "paid", isTest: true })), false);
  assert.equal(isAccepted(order({ posStatus: "entered" })), true);
});

test("boundary — payment & address blockers", () => {
  assert.equal(isPaymentBlocked(order({ orderStatus: "pending_payment" })), true);
  assert.equal(isPaymentBlocked(order({ orderStatus: "paid" })), false);
  assert.equal(isAddressBlocked({ fulfillmentType: "delivery", deliveryAddress: "" }), true);
  assert.equal(isAddressBlocked({ fulfillmentType: "delivery", deliveryAddress: "٥ ش الهرم" }), false);
  assert.equal(isAddressBlocked({ fulfillmentType: "pickup", deliveryAddress: "" }), false);
});

// ---------------------------------------------------------------------------
// MONEY — displayed, never derived.
// ---------------------------------------------------------------------------
test("money — serverTotal is a pass-through, never arithmetic", () => {
  assert.equal(serverTotal({ total: 485 }), 485);
  assert.equal(serverTotal({ total: 0 }), 0);
  // The model exposes no way to combine amounts — the total shown is the DB total.
});

// ---------------------------------------------------------------------------
// SECTION A — the urgency law. Rank order EXACTLY as specified; safety first.
// ---------------------------------------------------------------------------
test("urgency — ranks are exactly the WO order 1..7", () => {
  assert.deepEqual(
    [
      ACT_NOW_RANK.safety_hold,
      ACT_NOW_RANK.needs_acceptance,
      ACT_NOW_RANK.complaint,
      ACT_NOW_RANK.human_request,
      ACT_NOW_RANK.payment_or_address,
      ACT_NOW_RANK.confusion,
      ACT_NOW_RANK.time_limit,
    ],
    [1, 2, 3, 4, 5, 6, 7],
  );
});

test("urgency — sorts by rank, then longest-wait-first, then id", () => {
  const items: ActNowItem[] = [
    { id: "time", kind: "time_limit", waitingMs: 999_999 },
    { id: "confuse", kind: "confusion", waitingMs: 10_000 },
    { id: "pay", kind: "payment_or_address", waitingMs: 5_000 },
    { id: "human", kind: "human_request", waitingMs: 5_000 },
    { id: "complaint", kind: "complaint", waitingMs: 5_000 },
    { id: "accept", kind: "needs_acceptance", waitingMs: 5_000 },
    { id: "safety", kind: "safety_hold", waitingMs: 1_000 },
  ];
  const sorted = sortActNow(items).map((i) => i.id);
  assert.deepEqual(sorted, ["safety", "accept", "complaint", "human", "pay", "confuse", "time"]);
});

test("urgency — a safety hold ALWAYS sorts first, even when it has waited the least", () => {
  const items: ActNowItem[] = [
    { id: "old-accept", kind: "needs_acceptance", waitingMs: 10_000_000 },
    { id: "fresh-safety", kind: "safety_hold", waitingMs: 1 },
  ];
  assert.equal(sortActNow(items)[0].id, "fresh-safety");
});

test("urgency — within a rank, the longest wait rises (null waits sort last)", () => {
  const items: ActNowItem[] = [
    { id: "a", kind: "needs_acceptance", waitingMs: 1_000 },
    { id: "b", kind: "needs_acceptance", waitingMs: null },
    { id: "c", kind: "needs_acceptance", waitingMs: 9_000 },
  ];
  assert.deepEqual(sortActNow(items).map((i) => i.id), ["c", "a", "b"]);
});

test("urgency — sort is pure (does not mutate input)", () => {
  const items: ActNowItem[] = [
    { id: "b", kind: "needs_acceptance", waitingMs: 1 },
    { id: "a", kind: "safety_hold", waitingMs: 1 },
  ];
  const before = items.map((i) => i.id);
  sortActNow(items);
  assert.deepEqual(items.map((i) => i.id), before);
});

// ---------------------------------------------------------------------------
// ELAPSED — renders and escalates.
// ---------------------------------------------------------------------------
test("elapsed — formats seconds / minutes / hours in Western-digit values", () => {
  assert.deepEqual(formatElapsed(45_000), { value: 45, unit: "sec" });
  assert.deepEqual(formatElapsed(120_000), { value: 2, unit: "min" });
  assert.deepEqual(formatElapsed(3 * 3_600_000), { value: 3, unit: "hr" });
});

test("elapsed — an unverifiable start time renders nothing (never a fake number)", () => {
  assert.equal(formatElapsed(null), null);
  assert.equal(formatElapsed(-5), null);
});

test("elapsed — escalates calm → rising → urgent (not a permanent red)", () => {
  assert.equal(elapsedTier(10_000), "calm");
  assert.equal(elapsedTier(90_000), "rising");
  assert.equal(elapsedTier(200_000), "urgent");
  assert.equal(elapsedTier(null), "calm");
});

test("elapsed — an unaccepted order past the time limit escalates into Section A", () => {
  assert.equal(isPastTimeLimit(TIME_LIMIT_MS - 1), false);
  assert.equal(isPastTimeLimit(TIME_LIMIT_MS), true);
  assert.equal(isPastTimeLimit(null), false);
});

// ---------------------------------------------------------------------------
// CLAIM RACE — exactly one winner; the loser sees view-only; a stale epoch refreshes.
// ---------------------------------------------------------------------------
test("claim — the winner gets ownership + the fresh epoch", () => {
  const out = resolveClaimResponse(200, { ok: true, controlEpoch: 8 });
  assert.deepEqual(out, { kind: "won", epoch: 8 });
});

test("claim — the loser of a race is told who owns it and sees view-only", () => {
  const out = resolveClaimResponse(409, { error: "already_claimed", ownerName: "أحمد" });
  assert.deepEqual(out, { kind: "view_only", ownerName: "أحمد" });
});

test("claim — a stale epoch REFRESHES the view, it does not force the action", () => {
  const out = resolveClaimResponse(409, { error: "stale_epoch", current: {} });
  assert.deepEqual(out, { kind: "stale" });
});

test("claim — exactly one of two racers wins; the other is view-only", () => {
  // Same conversation, two operators: the server lets one through (200) and 409s the other.
  const winner = resolveClaimResponse(200, { ok: true, controlEpoch: 3 });
  const loser = resolveClaimResponse(409, { error: "already_claimed", ownerName: "منى" });
  assert.equal(winner.kind, "won");
  assert.equal(loser.kind, "view_only");
});

// ---------------------------------------------------------------------------
// ACCEPT RACE — the POS-entry conditional UPDATE yields one accepter.
// ---------------------------------------------------------------------------
test("accept — the accepter wins; the racer who lost is told, not clobbered", () => {
  assert.deepEqual(resolveAcceptResponse(200, { ok: true, pos_status: "entered" }), { kind: "accepted" });
  assert.deepEqual(resolveAcceptResponse(409, { error: "pos_conflict" }), { kind: "taken" });
  assert.deepEqual(resolveAcceptResponse(409, { error: "invalid_transition" }), { kind: "taken" });
});

test("accept — an ineligible order resolves to refresh, not a forced retry", () => {
  assert.deepEqual(resolveAcceptResponse(409, { error: "order_not_eligible" }), { kind: "ineligible" });
});

test("accept — other failures carry the code for an honest message", () => {
  assert.deepEqual(resolveAcceptResponse(502, { error: "update_failed" }), { kind: "failed", code: "update_failed" });
});

// ---------------------------------------------------------------------------
// DISABLED ACTIONS EXPOSE A REASON.
// ---------------------------------------------------------------------------
const ctx = (o: Partial<ActionContext>): ActionContext => ({
  online: true,
  dataState: "DB_READY",
  role: "manager",
  actorReady: true,
  ...o,
});

test("availability — offline disables actions WITH a reason", () => {
  const a = acceptAvailability(ctx({ online: false }));
  assert.equal(a.enabled, false);
  assert.equal(a.reasonKey, "shift.reason.offline");
});

test("availability — data not ready disables with a reason", () => {
  assert.deepEqual(acceptAvailability(ctx({ dataState: "DB_LOADING" })), {
    enabled: false,
    reasonKey: "shift.reason.notReady",
  });
});

test("availability — claim needs a resolved actor; stop needs manager", () => {
  assert.equal(claimAvailability(ctx({ actorReady: false })).reasonKey, "shift.reason.actor");
  assert.equal(stopKarimAvailability(ctx({ role: "operation" })).reasonKey, "shift.reason.manager");
  assert.equal(claimAvailability(ctx({})).enabled, true);
  assert.equal(stopKarimAvailability(ctx({})).enabled, true);
});

// ---------------------------------------------------------------------------
// CONNECTION — explicit text state, never a bare dot.
// ---------------------------------------------------------------------------
test("connection — derives an explicit state", () => {
  assert.equal(connectionState(false, "DB_READY"), "offline");
  assert.equal(connectionState(true, "DB_LOADING"), "degraded");
  assert.equal(connectionState(true, "DB_FAILED"), "weak");
  assert.equal(connectionState(true, "NO_TENANT"), "weak");
  assert.equal(connectionState(true, "DB_READY"), "connected");
  assert.equal(connectionState(true, "DEMO"), "connected");
  assert.equal(actionsEnabled(false, "DB_READY"), false);
  assert.equal(actionsEnabled(true, "DB_READY"), true);
});

// ---------------------------------------------------------------------------
// COUNTS — only what Kivo can verify.
// ---------------------------------------------------------------------------
test("counts — needs-acceptance and accepted-today, nothing Kivo cannot prove", () => {
  const START = 1_000_000;
  const orders: ShiftOrder[] = [
    order({ id: "n1", orderStatus: "paid", posStatus: "not_entered" }),
    order({ id: "n2", orderStatus: "preparing", posStatus: "not_entered" }),
    order({ id: "a1", posStatus: "entered", posEnteredAt: START + 5 }),
    order({ id: "a-old", posStatus: "entered", posEnteredAt: START - 5 }), // accepted before today
    order({ id: "pay", orderStatus: "pending_payment" }), // blocker, not counted
    order({ id: "test", orderStatus: "paid", posStatus: "not_entered", isTest: true }), // never counted
  ];
  assert.deepEqual(shiftCounts(orders, START), { needsAcceptance: 2, acceptedToday: 1 });
  assert.equal(isAcceptedToday(order({ posStatus: "entered", posEnteredAt: START + 5 }), START), true);
  assert.equal(isAcceptedToday(order({ posStatus: "entered", posEnteredAt: START - 5 }), START), false);
});

// ===========================================================================
// WO-SHIFT-2 — the takeover rescue flow.
// ===========================================================================

// ---------------------------------------------------------------------------
// WhatsApp 24h window.
// ---------------------------------------------------------------------------
test("window — inside 24h reports open with remaining time", () => {
  const now = 100_000_000;
  const w = whatsappWindow(now - 60_000, now); // last inbound 1 min ago
  assert.equal(w.open, true);
  assert.equal(w.remainingMs, WHATSAPP_WINDOW_MS - 60_000);
});

test("window — outside 24h reports closed with zero remaining", () => {
  const now = 100_000_000;
  const w = whatsappWindow(now - WHATSAPP_WINDOW_MS - 1, now);
  assert.equal(w.open, false);
  assert.equal(w.remainingMs, 0);
});

test("window — no inbound timestamp → closed (never a fabricated window)", () => {
  assert.deepEqual(whatsappWindow(null, 100), { open: false, remainingMs: 0 });
});

// ---------------------------------------------------------------------------
// Composer gate — disabled until the server confirms ownership; blocked outside
// the window; every disabled state has a reason.
// ---------------------------------------------------------------------------
const composer = (o: Partial<ComposerInput>): ComposerInput => ({
  claimedByOther: false,
  ownedByMe: true,
  online: true,
  dataState: "DB_READY",
  windowOpen: true,
  ...o,
});

test("composer — DISABLED until the server confirms ownership (no optimistic ownership)", () => {
  const notYet = composerState(composer({ ownedByMe: false }));
  assert.equal(notYet.enabled, false);
  assert.equal(notYet.reason, "not_owned");
  // Only when the server confirms I own it does the composer open.
  assert.equal(composerState(composer({ ownedByMe: true })).enabled, true);
});

test("composer — outside the 24h window free text is BLOCKED (templates only)", () => {
  const out = composerState(composer({ windowOpen: false }));
  assert.equal(out.enabled, false);
  assert.equal(out.reason, "outside_window");
});

test("composer — claimed by another → view_only; offline/not-ready each expose a reason", () => {
  assert.equal(composerState(composer({ claimedByOther: true })).reason, "view_only");
  assert.equal(composerState(composer({ online: false })).reason, "offline");
  assert.equal(composerState(composer({ dataState: "DB_LOADING" })).reason, "not_ready");
});

test("composer — view_only wins even when I also 'own' it locally (server is truth)", () => {
  // A stale local ownedByMe must never beat a claimed-by-other server truth.
  assert.equal(composerState(composer({ claimedByOther: true, ownedByMe: true })).reason, "view_only");
});

// ---------------------------------------------------------------------------
// Safety handback — can never use resolved/safe/confirmed wording, and can only
// release once the restaurant's response is RECORDED.
// ---------------------------------------------------------------------------
test("safety handback — the forbidden set + resolved/confirmed wording is rejected", () => {
  for (const w of ["آمن", "مضمون", "مناسب للحساسية", "لا يوجد خطر", "تم الحل", "تم التأكد"]) {
    assert.equal(isForbiddenSafetyResolution(w), true, `${w} must be forbidden`);
  }
  assert.equal(isForbiddenSafetyResolution("العميل ذكر حساسية من اللبن — تم تسجيل رد المطعم"), false);
});

test("safety handback — the three acknowledgment labels themselves are NOT forbidden wording", () => {
  for (const label of ["غير مستلم", "قيد المراجعة — مع أحمد", "تم تسجيل رد المطعم"]) {
    assert.equal(isForbiddenSafetyResolution(label), false, `${label} must be allowed`);
  }
});

test("safety handback — release is allowed ONLY from the 'recorded' state", () => {
  assert.deepEqual([...SAFETY_ACK_STATES], ["unclaimed", "in_review", "recorded"]);
  assert.equal(safetyHandbackAllowed("unclaimed"), false);
  assert.equal(safetyHandbackAllowed("in_review"), false);
  assert.equal(safetyHandbackAllowed("recorded"), true);
});
