// Pure unit tests for detectStuck (no DB, no env vars needed).
// Run: node --experimental-strip-types scripts/test-stuck-detection.test.ts
import { detectStuck, STUCK_THRESHOLDS } from "../lib/intelligence/stuck-detection.ts";
import type { StuckConversationInput } from "../lib/intelligence/stuck-detection.ts";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => {
  if (cond) pass++;
  else { fail++; console.log("  ❌", name); }
};

const T = STUCK_THRESHOLDS;
// A "now" that is frozen so all times are deterministic.
const NOW = Date.now();
const minutesBack = (m: number) => new Date(NOW - m * 60_000).toISOString();

// ── Healthy baseline ──────────────────────────────────────────────────────────
const healthy: StuckConversationInput = {
  ownershipState: "AI_ACTIVE",
  updatedAt: minutesBack(1),
  latestOrderPaymentStatus: null,
  latestOrderStatus: null,
  latestOrderUpdatedAt: null,
};
const r0 = detectStuck(healthy, T, NOW);
ok("healthy AI_ACTIVE → not stuck", !r0.stuck);
ok("healthy AI_ACTIVE → reason null", r0.reason === null);

// ── Condition A: SYSTEM_HOLD timeout ─────────────────────────────────────────
const holdJustUnder: StuckConversationInput = {
  ...healthy,
  ownershipState: "SYSTEM_HOLD",
  updatedAt: minutesBack(T.systemHoldMinutes - 1),
};
const rAunder = detectStuck(holdJustUnder, T, NOW);
ok("SYSTEM_HOLD under threshold → not stuck", !rAunder.stuck);

const holdExact: StuckConversationInput = {
  ...healthy,
  ownershipState: "SYSTEM_HOLD",
  updatedAt: minutesBack(T.systemHoldMinutes),
};
const rAexact = detectStuck(holdExact, T, NOW);
ok("SYSTEM_HOLD at threshold → stuck", rAexact.stuck);
ok("SYSTEM_HOLD at threshold → reason system_hold_timeout", rAexact.reason === "system_hold_timeout");

const holdOver: StuckConversationInput = {
  ...healthy,
  ownershipState: "SYSTEM_HOLD",
  updatedAt: minutesBack(T.systemHoldMinutes + 10),
};
const rAover = detectStuck(holdOver, T, NOW);
ok("SYSTEM_HOLD over threshold → stuck", rAover.stuck);

// ── Condition B: payment-review timeout ──────────────────────────────────────
const payBase: StuckConversationInput = {
  ownershipState: "HUMAN_ACTIVE",
  updatedAt: minutesBack(1),
  latestOrderPaymentStatus: "unpaid",
  latestOrderStatus: "confirmed",
  latestOrderUpdatedAt: minutesBack(T.paymentReviewMinutes - 1),
};
const rBunder = detectStuck(payBase, T, NOW);
ok("payment under threshold → not stuck", !rBunder.stuck);

const payOver: StuckConversationInput = {
  ...payBase,
  latestOrderUpdatedAt: minutesBack(T.paymentReviewMinutes + 5),
};
const rBover = detectStuck(payOver, T, NOW);
ok("payment over threshold → stuck", rBover.stuck);
ok("payment over threshold → reason payment_review_timeout", rBover.reason === "payment_review_timeout");

// Draft orders (order_status != 'confirmed') should NOT trigger
const payDraft: StuckConversationInput = {
  ...payBase,
  latestOrderStatus: "draft",
  latestOrderUpdatedAt: minutesBack(T.paymentReviewMinutes + 5),
};
ok("draft order over threshold → not stuck", !detectStuck(payDraft, T, NOW).stuck);

// Paid orders should NOT trigger
const payPaid: StuckConversationInput = {
  ...payBase,
  latestOrderPaymentStatus: "paid",
  latestOrderUpdatedAt: minutesBack(T.paymentReviewMinutes + 5),
};
ok("paid order over threshold → not stuck", !detectStuck(payPaid, T, NOW).stuck);

// ── Condition C: human-no-response ───────────────────────────────────────────
const humanRecentlyActive: StuckConversationInput = {
  ownershipState: "HUMAN_ACTIVE",
  updatedAt: minutesBack(T.humanNoResponseMinutes - 1),
  latestOrderPaymentStatus: null,
  latestOrderStatus: null,
  latestOrderUpdatedAt: null,
};
ok("HUMAN_ACTIVE under threshold → not stuck", !detectStuck(humanRecentlyActive, T, NOW).stuck);

const humanStale: StuckConversationInput = {
  ...humanRecentlyActive,
  updatedAt: minutesBack(T.humanNoResponseMinutes + 2),
};
const rC = detectStuck(humanStale, T, NOW);
ok("HUMAN_ACTIVE over threshold → stuck", rC.stuck);
ok("HUMAN_ACTIVE over threshold → reason human_no_response", rC.reason === "human_no_response");

const humanIdleStale: StuckConversationInput = {
  ...humanStale,
  ownershipState: "HUMAN_IDLE",
};
const rCI = detectStuck(humanIdleStale, T, NOW);
ok("HUMAN_IDLE over threshold → stuck", rCI.stuck);
ok("HUMAN_IDLE over threshold → reason human_no_response", rCI.reason === "human_no_response");

// ── Condition A beats C when SYSTEM_HOLD is present ──────────────────────────
const holdAlsoHuman: StuckConversationInput = {
  ownershipState: "SYSTEM_HOLD",
  updatedAt: minutesBack(Math.max(T.systemHoldMinutes, T.humanNoResponseMinutes) + 5),
  latestOrderPaymentStatus: null,
  latestOrderStatus: null,
  latestOrderUpdatedAt: null,
};
const rPriority = detectStuck(holdAlsoHuman, T, NOW);
ok("SYSTEM_HOLD stale → A wins over C", rPriority.reason === "system_hold_timeout");

// ── Custom thresholds work ────────────────────────────────────────────────────
const tiny = { ...T, systemHoldMinutes: 1 };
const holdShort: StuckConversationInput = { ...healthy, ownershipState: "SYSTEM_HOLD", updatedAt: minutesBack(2) };
ok("custom 1-min threshold triggers at 2 min", detectStuck(holdShort, tiny, NOW).stuck);

// ── CLOSED + AI_ACTIVE are never stuck ───────────────────────────────────────
for (const s of ["CLOSED", "AI_ACTIVE"] as const) {
  const snap: StuckConversationInput = { ...humanStale, ownershipState: s };
  ok(`${s} over human threshold → not stuck (C doesn't apply)`, !detectStuck(snap, T, NOW).stuck);
}

console.log(`\nSTUCK-DETECTION UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
