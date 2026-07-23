// ============================================================================
// R0 (WO-R0 rev2 / Blocker 1) — the CANNOT-DIVERGE test.
//
// Proves that the shift model «قبول» gate and the server POS-route acceptance gate
// make the IDENTICAL eligibility decision for every status × every is_test, and —
// structurally — that neither keeps a private copy of the rule. After this, changing
// acceptance eligibility (R1's job) means changing ONE predicate, not hunting copies.
//
// Run (needs ts-ext-loader because the shift model imports the contract relatively):
//   node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types --test lib/orders/acceptance-parity.test.ts
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ORDER_STATUS_VOCABULARY, isAcceptanceEligible } from "./acceptance-contract.ts";
import { isAcceptable } from "../../components/console-v2/shift/shift-model.ts";
import type { OrderStatusKey, PosStatus } from "../types.ts";

const shiftOrder = (orderStatus: OrderStatusKey, isTest: boolean | undefined) => ({
  orderStatus,
  isTest,
  // fields isAcceptable ignores, present only to satisfy the Pick shape:
  posStatus: "not_entered" as PosStatus,
});

// The POS route's gate, verbatim as it now stands (route line ~78):
//   if (!isAcceptanceEligible({ orderStatus, isTest })) → order_not_eligible 409
// So the route's eligibility decision IS isAcceptanceEligible(...). This reproduces it.
const routeEligibility = (orderStatus: OrderStatusKey, isTest: boolean) =>
  isAcceptanceEligible({ orderStatus, isTest });

test("cannot-diverge — shift model and POS route agree for EVERY status × is_test", () => {
  const IS_TEST_VALUES = [false, true, undefined] as const;
  for (const s of ORDER_STATUS_VOCABULARY) {
    for (const isTest of IS_TEST_VALUES) {
      const shift = isAcceptable(shiftOrder(s, isTest));
      const route = routeEligibility(s, isTest === true); // the route reads is_test as a strict boolean
      const contract = isAcceptanceEligible({ orderStatus: s, isTest });
      // All three are the same decision — one predicate, three call sites.
      assert.equal(shift, contract, `shift vs contract: ${s}/${isTest}`);
      assert.equal(route, contract, `route vs contract: ${s}/${isTest}`);
      assert.equal(shift, route, `shift vs route: ${s}/${isTest}`);
    }
  }
});

// STRUCTURAL guarantee — the reason it "cannot" diverge: neither surface holds a
// private eligibility set; both import the one contract. If someone reintroduces a
// private copy in the route, THIS test fails.
const ROUTE_SRC = readFileSync("app/api/orders/[id]/pos/route.ts", "utf8");
const SHIFT_SRC = readFileSync("components/console-v2/shift/shift-model.ts", "utf8");

test("cannot-diverge — the POS route consumes the shared contract, with NO private set", () => {
  assert.match(ROUTE_SRC, /from "@\/lib\/orders\/acceptance-contract"/, "route must import the contract");
  assert.match(ROUTE_SRC, /isAcceptanceEligible\(/, "route must call the shared predicate");
  // No private DECLARATION of an eligible set (a comment may still reference the old
  // name for provenance — the invariant is that no private copy is *defined*).
  assert.doesNotMatch(ROUTE_SRC, /const\s+POS_ELIGIBLE_STATUS\s*=/, "route must NOT declare a private eligible set");
  // No inline copy of the eligible-status literal list either.
  assert.doesNotMatch(ROUTE_SRC, /new Set<string>\(\s*\[\s*"paid"/, "route must NOT inline the eligible list");
});

test("cannot-diverge — the shift model consumes the shared contract, with NO private set", () => {
  assert.match(SHIFT_SRC, /from "\.\.\/\.\.\/\.\.\/lib\/orders\/acceptance-contract"/, "shift model must import the contract");
  assert.match(SHIFT_SRC, /isAcceptanceEligible\(o\)/, "shift isAcceptable must delegate to the shared predicate");
  // The only status list in the shift model is the re-export FROM the contract.
  assert.doesNotMatch(SHIFT_SRC, /ACCEPTABLE_ORDER_STATUSES[^=]*=\s*\[/, "shift model must NOT redeclare the list inline");
});
