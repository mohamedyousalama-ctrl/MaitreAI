// ============================================================================
// console_v2 — CUTOVER-1 legacy→/c mapping tests.
// Run: node --experimental-strip-types --test lib/console-v2/cutover.test.ts
// Pure (no runtime deps), so it runs without the Next bundler.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";
import { mapLegacyToConsoleV2 } from "./cutover.ts";

test("leaf names line up 1:1", () => {
  assert.equal(mapLegacyToConsoleV2("/conversations"), "/c/conversations");
  assert.equal(mapLegacyToConsoleV2("/customers"), "/c/customers");
  assert.equal(mapLegacyToConsoleV2("/settings"), "/c/settings");
  assert.equal(mapLegacyToConsoleV2("/team"), "/c/team");
  assert.equal(mapLegacyToConsoleV2("/insights"), "/c/insights");
});

test("deliberate folds", () => {
  assert.equal(mapLegacyToConsoleV2("/dashboard"), "/c/shift"); // home → Live Shift
  assert.equal(mapLegacyToConsoleV2("/orders"), "/c/shift");    // orders folded into shift
  assert.equal(mapLegacyToConsoleV2("/menu"), "/c/knowledge");  // menu lives in Knowledge
  assert.equal(mapLegacyToConsoleV2("/cod"), "/c/shift");
  assert.equal(mapLegacyToConsoleV2("/cod/close"), "/c/shift");
  assert.equal(mapLegacyToConsoleV2("/deliveries"), "/c/shift");
});

test("kitchen ticket keeps its order id", () => {
  assert.equal(mapLegacyToConsoleV2("/orders/abc-123/ticket"), "/c/orders/abc-123/ticket");
  assert.equal(mapLegacyToConsoleV2("/orders/abc-123/ticket/"), "/c/orders/abc-123/ticket"); // trailing slash
});

test("trailing slashes are tolerated on exact routes", () => {
  assert.equal(mapLegacyToConsoleV2("/settings/"), "/c/settings");
});

test("anything unmapped folds to /c (never stranded)", () => {
  assert.equal(mapLegacyToConsoleV2("/some/unknown/legacy/page"), "/c");
  assert.equal(mapLegacyToConsoleV2("/orders/abc/pos"), "/c"); // a non-ticket order subpath
  assert.equal(mapLegacyToConsoleV2(""), "/c");
});
