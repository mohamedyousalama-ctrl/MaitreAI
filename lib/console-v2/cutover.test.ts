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
  // Cash has no /c surface — console_v2's scope law stops at confirmed order +
  // kitchen handoff. These folds are correct, and they are also the reason a
  // flag-on tenant has no cash-settlement screen at all.
  assert.equal(mapLegacyToConsoleV2("/cod"), "/c/shift");
  assert.equal(mapLegacyToConsoleV2("/cod/close"), "/c/shift");
  // Deliveries is DIFFERENT: /c/deliveries exists and nav.ts links it as ready.
  // This previously asserted "/c/shift", which pinned a real routing bug in
  // place — the fold's "no dedicated /c surface yet" comment went stale when
  // that page shipped, so a legacy /deliveries link landed on Live Shift
  // instead of the board the tenant's own nav points at. Corrected 2026-08-26.
  assert.equal(mapLegacyToConsoleV2("/deliveries"), "/c/deliveries");
});

test("a legacy fold never points at a /c route that does not exist", () => {
  // Guards the class of bug above: every mapped target must be a real surface.
  // Kept as an explicit allowlist rather than a filesystem walk so it is pure and
  // fails loudly when a page is renamed or removed without updating the map.
  const REAL_C_ROUTES = new Set([
    "/c", "/c/shift", "/c/conversations", "/c/customers", "/c/settings",
    "/c/knowledge", "/c/team", "/c/insights", "/c/deliveries",
  ]);
  for (const legacy of ["/dashboard", "/orders", "/conversations", "/customers",
                        "/settings", "/menu", "/team", "/insights", "/cod",
                        "/cod/close", "/deliveries", "/unmapped-thing"]) {
    const target = mapLegacyToConsoleV2(legacy);
    assert.ok(REAL_C_ROUTES.has(target), `${legacy} maps to ${target}, which is not a real /c route`);
  }
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
