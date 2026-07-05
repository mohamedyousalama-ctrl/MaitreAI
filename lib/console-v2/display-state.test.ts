// ============================================================================
// console_v2 — display-state mapping table tests.
// Run: node --experimental-strip-types --test lib/console-v2/display-state.test.ts
// Pure (the table has no runtime deps — its only imports are type-only), so it
// runs without the Next bundler.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveOrderDisplay,
  derivePosDisplay,
  derivePaymentDisplay,
  deriveConversationDisplay,
  deriveAttribution,
  TONE_TOKENS,
  type Tone,
} from "./display-state.ts";
import type { OrderStatusKey, PaymentStatusKey, PosStatus } from "../types.ts";

const ORDER_STATUSES: OrderStatusKey[] = [
  "draft", "pending_confirmation", "pending_payment", "paid",
  "preparing", "ready", "out_for_delivery", "delivered", "cancelled",
];
const POS_STATUSES: PosStatus[] = ["not_entered", "entered", "sent_to_kitchen"];
const PAY_STATUSES: PaymentStatusKey[] = ["unpaid", "payment_link_sent", "paid", "failed", "refunded"];
const CONV_STATES = ["AI_ACTIVE", "HUMAN_ACTIVE", "HUMAN_IDLE", "SYSTEM_HOLD", "CLOSED"] as const;

// ---------------------------------------------------------------------------
// Every DB state maps to a display state (no throw / no undefined).
// ---------------------------------------------------------------------------
test("orders — every order_status derives a display state", () => {
  for (const s of ORDER_STATUSES) {
    const d = deriveOrderDisplay(s);
    assert.ok(d.state, `${s} → state`);
    assert.ok(d.labelKey, `${s} → labelKey`);
    assert.ok(TONE_TOKENS[d.tone], `${s} → valid tone`);
  }
});

test("orders — specific lifecycle mappings", () => {
  assert.equal(deriveOrderDisplay("pending_confirmation").state, "incoming");
  assert.equal(deriveOrderDisplay("pending_payment").state, "awaiting_payment");
  assert.equal(deriveOrderDisplay("paid").state, "confirmed");
  assert.equal(deriveOrderDisplay("preparing").state, "in_kitchen");
  assert.equal(deriveOrderDisplay("out_for_delivery").state, "on_the_way");
  assert.equal(deriveOrderDisplay("out_for_delivery").tone, "delivery");
  assert.equal(deriveOrderDisplay("delivered").state, "completed");
  assert.equal(deriveOrderDisplay("cancelled").state, "cancelled");
});

test("pos — WB1 hand-off mappings", () => {
  assert.equal(derivePosDisplay("not_entered").state, "needs_pos");
  assert.equal(derivePosDisplay("not_entered").tone, "warning");
  assert.equal(derivePosDisplay("entered").state, "entered");
  assert.equal(derivePosDisplay("sent_to_kitchen").state, "sent_to_kitchen");
});

test("payments — every payment_status derives a display state", () => {
  for (const s of PAY_STATUSES) {
    const d = derivePaymentDisplay(s);
    assert.ok(d.state && d.labelKey && TONE_TOKENS[d.tone], `${s} maps`);
  }
  assert.equal(derivePaymentDisplay("paid").tone, "success");
});

// ---------------------------------------------------------------------------
// Conversations — the ownership spine + safety override.
// ---------------------------------------------------------------------------
test("conversations — ownership spine mappings", () => {
  assert.equal(deriveConversationDisplay({ ownershipState: "AI_ACTIVE" }).state, "ai_active");
  assert.equal(deriveConversationDisplay({ ownershipState: "HUMAN_ACTIVE" }).state, "human_active");
  assert.equal(deriveConversationDisplay({ ownershipState: "HUMAN_IDLE" }).state, "human_idle");
  assert.equal(deriveConversationDisplay({ ownershipState: "CLOSED" }).state, "closed");
});

test("conversations — safety hold overrides ownership", () => {
  // isSafetyHold flag wins even when nominally AI_ACTIVE.
  const held = deriveConversationDisplay({ ownershipState: "AI_ACTIVE", isSafetyHold: true });
  assert.equal(held.state, "safety_hold");
  assert.equal(held.tone, "safety");
  // SYSTEM_HOLD is a safety hold on its own.
  assert.equal(deriveConversationDisplay({ ownershipState: "SYSTEM_HOLD" }).tone, "safety");
});

// ---------------------------------------------------------------------------
// Attribution (R6).
// ---------------------------------------------------------------------------
test("attribution — sender → author", () => {
  assert.equal(deriveAttribution("ai")?.state, "ai");
  assert.equal(deriveAttribution("agent")?.state, "human");
  assert.equal(deriveAttribution("human")?.state, "human");
  assert.equal(deriveAttribution("system")?.state, "system");
  assert.equal(deriveAttribution("customer"), null); // inbound — nothing to attribute
});

// ---------------------------------------------------------------------------
// THE LAW: red = safety only. The `safety` tone is the only red, and it appears
// ONLY on safety holds — never on a cancellation, a failed payment, or anything
// in the order / POS / payment axes.
// ---------------------------------------------------------------------------
test("law — red (safety tone) never appears outside safety holds", () => {
  const nonSafety: Tone[] = [];
  for (const s of ORDER_STATUSES) nonSafety.push(deriveOrderDisplay(s).tone);
  for (const s of POS_STATUSES) nonSafety.push(derivePosDisplay(s).tone);
  for (const s of PAY_STATUSES) nonSafety.push(derivePaymentDisplay(s).tone);
  for (const s of CONV_STATES) {
    if (s === "SYSTEM_HOLD") continue; // the one legitimate safety source
    nonSafety.push(deriveConversationDisplay({ ownershipState: s }).tone);
  }
  assert.ok(
    nonSafety.every((tone) => tone !== "safety"),
    "no order/pos/payment/non-hold conversation state may resolve to the safety (red) tone"
  );
  // And a real safety hold DOES resolve to safety.
  assert.equal(deriveConversationDisplay({ ownershipState: "SYSTEM_HOLD" }).tone, "safety");
});

test("law — cancelled + failed payment are muted, not red", () => {
  assert.equal(deriveOrderDisplay("cancelled").tone, "neutral");
  assert.equal(derivePaymentDisplay("failed").tone, "warning");
});
