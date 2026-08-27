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
  // The one fold whose leaf name does NOT line up: menu is served by Knowledge.
  // (The 1:1 leaf mappings are covered by the test above; asserting them twice
  // would look like coverage without adding any.)
  assert.equal(mapLegacyToConsoleV2("/menu"), "/c/knowledge");
  // An unmapped legacy route is never a dead end — it still falls to /c.
  assert.equal(mapLegacyToConsoleV2("/some-route-we-never-enumerated"), "/c");
});

test("pages console_v2 does not replace RENDER — they are never folded away", () => {
  // Revised 2026-08-26. These previously folded to /c/shift, which is an
  // exception-triage queue: it has no order book, no cash capture or shift close,
  // and no driver management. Folding them did not keep an operator in console_v2,
  // it took the capability away — Wesaya had real cash and no screen to settle it.
  // null means "render the legacy page".
  for (const p of ["/orders", "/dashboard", "/cod", "/cod/close", "/deliveries"]) {
    assert.equal(mapLegacyToConsoleV2(p), null, `${p} must render, not redirect`);
  }
  // Trailing slashes must resolve the same way.
  assert.equal(mapLegacyToConsoleV2("/orders/"), null);
  assert.equal(mapLegacyToConsoleV2("/cod/close/"), null);
  // The kitchen ticket is a standalone print view and DOES have a /c surface, so it
  // still folds even though /orders itself no longer does.
  assert.equal(mapLegacyToConsoleV2("/orders/abc-123/ticket"), "/c/orders/abc-123/ticket");
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
    if (target === null) continue; // renders the legacy page — nothing to validate
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
