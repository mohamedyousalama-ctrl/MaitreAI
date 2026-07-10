// ============================================================================
// WO-DELIVERY-D3 — proofs for the التوصيل runs board (spec §4).
// Run: node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types \
//        scripts/test-delivery-board.test.ts
// Covers: rail is byte-identical flag-OFF (no deliveries item) and reveals it only
// with the delivery module on; zoneMissesSummary grouping; the board run projection
// excludes item details; and red stays safety-only on the board (source assertion).
// ============================================================================
import { readFileSync } from "node:fs";
import { railItemsFor } from "../lib/console-v2/nav.ts";
import { zoneMissesSummary, listActiveRunsForOperator } from "../lib/db/delivery.ts";

let pass = 0, fail = 0;
const eq = (n: string, a: unknown, e: unknown) => {
  if (a === e) pass++; else { fail++; console.log(`  ❌ ${n}: got ${JSON.stringify(a)}, expected ${JSON.stringify(e)}`); }
};
const ok = (n: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log(`  ❌ ${n}: expected true`); } };
const deepEq = (n: string, a: unknown, e: unknown) => eq(n, JSON.stringify(a), JSON.stringify(e));

// ── RAIL: byte-identical flag-OFF, tightening #1 ────────────────────────────────
{
  const modsOff = railItemsFor("modules", "manager").map((i) => i.key);
  deepEq("modules rail flag-OFF is byte-identical (no deliveries item)", modsOff, ["knowledge", "insights", "campaigns", "approvals", "ask-kivo"]);
  ok("flag-OFF: no deliveries item anywhere for a manager", ["main", "modules", "crm", "admin"].every((s) => !railItemsFor(s as never, "manager").some((i) => i.key === "deliveries")));

  const modsOn = railItemsFor("modules", "manager", true).map((i) => i.key);
  ok("flag-ON reveals the deliveries item", modsOn.includes("deliveries"));
  eq("flag-ON appends exactly one item (no reordering)", modsOn.length, 6);
  deepEq("flag-ON keeps existing items in the same order", modsOn.slice(0, 5), ["knowledge", "insights", "campaigns", "approvals", "ask-kivo"]);

  // Role gate still holds: an operator never sees the (managerOnly) deliveries item.
  ok("operator never sees deliveries even with the module on", !railItemsFor("modules", "operation", true).some((i) => i.key === "deliveries"));
  // Other sections are untouched by the flag.
  deepEq("main rail unchanged by the delivery flag", railItemsFor("main", "manager", true).map((i) => i.key), railItemsFor("main", "manager").map((i) => i.key));
}

// ── thenable fake PostgREST client (awaitable at any chain point) ───────────────
function makeAdmin(resolve: (table: string, filters: Record<string, unknown>) => { data: unknown; error: unknown }) {
  const make = (table: string) => {
    const st: { filters: Record<string, unknown> } = { filters: {} };
    const b: Record<string, unknown> = {
      select() { return b; },
      eq(k: string, v: unknown) { st.filters[k] = v; return b; },
      is(k: string, v: unknown) { st.filters[k] = v; return b; },
      in(k: string, v: unknown) { st.filters[k + "__in"] = v; return b; },
      order() { return b; },
      limit() { return b; },
      maybeSingle() { return Promise.resolve(resolve(table, st.filters)); },
      single() { return Promise.resolve(resolve(table, st.filters)); },
      then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) { return Promise.resolve(resolve(table, st.filters)).then(onF, onR); },
    };
    return b;
  };
  return { from: make } as never;
}

// ── zoneMissesSummary: count + areas, grouped + sorted desc ─────────────────────
{
  const admin = makeAdmin((table) => {
    if (table === "zone_misses") return { data: [
      { nearest_zone_id: "z1", area_text: null },
      { nearest_zone_id: "z1", area_text: null },
      { nearest_zone_id: null, area_text: "وسط البلد" },
    ], error: null };
    if (table === "delivery_zones") return { data: [{ id: "z1", name: "المعادي" }], error: null };
    return { data: null, error: null };
  });
  const s = await zoneMissesSummary(admin, "r1");
  eq("misses total", s.total, 3);
  deepEq("misses grouped by area, count-desc", s.byArea, [{ area: "المعادي", count: 2 }, { area: "وسط البلد", count: 1 }]);
}
{
  // Deploy-safety: a missing zone_misses table (prepare-only 0081) → empty, never a throw.
  const admin = makeAdmin((table) => table === "zone_misses" ? { data: null, error: { code: "42P01", message: "relation does not exist" } } : { data: null, error: null });
  const s = await zoneMissesSummary(admin, "r1");
  deepEq("misses empty on read error (deploy-safe)", s, { total: 0, byArea: [] });
}

// ── listActiveRunsForOperator: projection excludes item details ─────────────────
{
  const admin = makeAdmin((table) => {
    if (table === "delivery_runs") return { data: [{ id: "run1", status: "active", created_at: "2026-01-01T00:00:00Z", drivers: { name: "سائق" } }], error: null };
    if (table === "deliveries") return { data: [
      { run_id: "run1", status: "on_the_way", stop_order: 1, cod_collected: false, orders: { zone_id: "z1", total: 100, payment_status: "pending" } },
      { run_id: "run1", status: "delivered", stop_order: 2, cod_collected: true, orders: { zone_id: null, total: 50, payment_status: "paid" } },
    ], error: null };
    if (table === "delivery_zones") return { data: [{ id: "z1", name: "المعادي" }], error: null };
    return { data: null, error: null };
  });
  const runs = await listActiveRunsForOperator(admin, "r1");
  eq("one active run", runs.length, 1);
  eq("run stop count", runs[0].stopCount, 2);
  eq("driver name surfaced", runs[0].driverName, "سائق");
  const s0 = runs[0].stops[0];
  eq("stop status", s0.status, "on_the_way");
  eq("stop area = zone name", s0.area, "المعادي");
  eq("stop COD amount (unpaid)", s0.codAmount, 100);
  eq("paid stop → COD 0", runs[0].stops[1].codAmount, 0);
  const blob = JSON.stringify(runs);
  ok("board run projection carries NO item names/details", !blob.includes("\"name\":\"") ? true : !/"name":"(?!سائق)/.test(blob));
  ok("board run projection has no items array", !blob.includes("\"items\""));
  // Exact stop key set — a leaky field would trip this.
  deepEq("stop key set is the narrow board projection", Object.keys(s0).sort(), ["area", "codAmount", "codCollected", "status", "stopOrder"].sort());
}

// ── COLOR LAW: red is safety-only — the board never uses the safety-red token ────
{
  const board = readFileSync(new URL("../app/(console-v2)/c/(app)/(manager)/deliveries/DeliveriesBoard.tsx", import.meta.url), "utf8");
  ok("board never uses the safety-red CSS var (--red)", !board.includes("--red"));
  ok("board never hard-codes the safety-red hex (#ff6b5e)", !board.toLowerCase().includes("#ff6b5e"));
  ok("board uses amber for the oldest/pending flags", board.includes("232,180,90") || board.includes("--amber"));
}

console.log(`\nDELIVERY-BOARD UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
