// ============================================================================
// R0 — acceptance-contract CHARACTERIZATION tests (WO-R0). These LOCK current
// behaviour at f7882c1, INCLUDING the behaviour the audit found wrong. A failing
// test here is a signal that behaviour changed — fix the change, not the test.
//
// Run (needs ts-ext-loader: the contract now derives its vocabulary from
// ./transitions via an extensionless relative import):
//   node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types --test lib/orders/acceptance-contract.test.ts
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";
import {
  ORDER_STATUS_VOCABULARY,
  ORDER_STATUS_MEANING,
  ACCEPTANCE_ELIGIBLE_STATUSES,
  isAcceptanceEligible,
} from "./acceptance-contract.ts";
import { ORDER_STATUSES } from "./transitions.ts";
import { deriveOrderDisplay } from "../console-v2/display-state.ts";
import type { OrderStatusKey } from "../types.ts";

// The current, authoritative truth table — exactly what the system decides TODAY.
// pending_confirmation:false is the audit-found bug, deliberately encoded (see below).
const EXPECTED_ELIGIBLE: Record<OrderStatusKey, boolean> = {
  draft: false,
  pending_confirmation: false, // ← WRONG-BUT-CURRENT. R1 will invert this.
  pending_payment: false,
  paid: true,
  preparing: true,
  ready: true,
  out_for_delivery: true,
  delivered: true,
  cancelled: false,
};

test("acceptance — every status resolves EXACTLY as the system decides today", () => {
  for (const s of ORDER_STATUS_VOCABULARY) {
    assert.equal(isAcceptanceEligible({ orderStatus: s }), EXPECTED_ELIGIBLE[s], `status ${s}`);
  }
});

test("acceptance — pending_confirmation is NOT acceptable (current truth; R1 will INVERT)", () => {
  // 126/127 pilot orders sit in pending_confirmation and «قبول» 409s them. This test
  // encodes the WRONG-but-current behaviour on purpose. When R1 makes the status
  // acceptable, R1 flips THIS expectation deliberately — R0 must not.
  assert.equal(isAcceptanceEligible({ orderStatus: "pending_confirmation" }), false);
});

test("acceptance — a test order is never acceptable (is-test exclusion preserved)", () => {
  assert.equal(isAcceptanceEligible({ orderStatus: "paid", isTest: true }), false);
  assert.equal(isAcceptanceEligible({ orderStatus: "preparing", isTest: true }), false);
  // null is-test behaves like absent (not a test) — matches the prior `!o.isTest`.
  assert.equal(isAcceptanceEligible({ orderStatus: "paid", isTest: null }), true);
});

test("acceptance — a cancelled order is never acceptable", () => {
  assert.equal(isAcceptanceEligible({ orderStatus: "cancelled" }), false);
});

test("acceptance — the eligible set is exactly {paid, preparing, ready, out_for_delivery, delivered}", () => {
  // The single mirror of shift-model.ACCEPTABLE_ORDER_STATUSES and the POS route's
  // POS_ELIGIBLE_STATUS (both verified identical to this by reading, at f7882c1).
  assert.deepEqual([...ACCEPTANCE_ELIGIBLE_STATUSES], ["paid", "preparing", "ready", "out_for_delivery", "delivered"]);
});

test("contract (Item 1) — the vocabulary IS the canonical ORDER_STATUSES, not a copy", () => {
  // Option A: ORDER_STATUS_VOCABULARY is derived from (re-exports) ORDER_STATUSES, so
  // there is one runtime list. If Option A's derivation is ever undone and an
  // independent list re-introduced, this membership check fails.
  assert.deepEqual([...ORDER_STATUS_VOCABULARY], [...ORDER_STATUSES]);
  assert.equal(ORDER_STATUS_VOCABULARY, ORDER_STATUSES, "must be the same array reference (derived, not restated)");
});

test("contract (Item 1) — every status has a meaning entry (docs bound to the vocabulary)", () => {
  for (const s of ORDER_STATUSES) {
    assert.equal(typeof ORDER_STATUS_MEANING[s], "string", `meaning for ${s}`);
    assert.ok(ORDER_STATUS_MEANING[s].length > 0, `non-empty meaning for ${s}`);
  }
  assert.equal(Object.keys(ORDER_STATUS_MEANING).length, ORDER_STATUSES.length, "no extra/missing meanings");
});

test("characterization — the derived display state per status is UNCHANGED", () => {
  // Locks the shift/console display mapping (lib/console-v2/display-state) so a status
  // meaning-change can't silently alter what an order renders as.
  const EXPECTED_DISPLAY: Record<OrderStatusKey, string> = {
    draft: "incoming",
    pending_confirmation: "incoming",
    pending_payment: "awaiting_payment",
    paid: "confirmed",
    preparing: "in_kitchen",
    ready: "ready",
    out_for_delivery: "on_the_way",
    delivered: "completed",
    cancelled: "cancelled",
  };
  for (const s of ORDER_STATUS_VOCABULARY) {
    assert.equal(deriveOrderDisplay(s).state, EXPECTED_DISPLAY[s], `display ${s}`);
  }
});
