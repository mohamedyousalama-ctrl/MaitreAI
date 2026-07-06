// Unit tests for the Insights order-KPI core (pure, no DB).
// Run: node --experimental-strip-types scripts/test-insights-kpis.test.ts
import { windowKpis, pctDelta, computeInsights } from "../lib/insights/order-kpis.ts";
import type { LocalOrder } from "../lib/types.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000_000_000_000;

// Minimal order factory (only the fields the KPI core reads; cast for the big type).
function mk(p: { at: number; total: number; delivered?: boolean; cod?: boolean; test?: boolean; item?: [string, number] }): LocalOrder {
  return {
    createdAt: p.at, total: p.total, isTest: !!p.test,
    orderStatus: p.delivered ? "delivered" : "preparing",
    paymentMethod: p.cod ? "cod" : "card",
    items: p.item ? [{ name: p.item[0], total: p.item[1], quantity: 1, unitPrice: p.item[1] }] : [],
  } as unknown as LocalOrder;
}

const orders: LocalOrder[] = [
  mk({ at: NOW - 1 * DAY, total: 100, delivered: true, cod: true, item: ["A", 100] }),
  mk({ at: NOW - 2 * DAY, total: 200, delivered: false, cod: false, item: ["B", 200] }),
  mk({ at: NOW - 10 * DAY, total: 500, delivered: true, item: ["A", 500] }), // prior week
  mk({ at: NOW - 1 * DAY, total: 9999, test: true, item: ["A", 9999] }),      // test → excluded
];

// --- current week window [NOW-7d, NOW) ---
const cur = windowKpis(orders, NOW - 7 * DAY, NOW);
ok("test orders excluded from revenue", cur.revenue === 300);
ok("order count excludes test", cur.orders === 2);
ok("aov = revenue/orders", near(cur.aov, 150));
ok("delivered count", cur.delivered === 1);
ok("completion rate = delivered/orders", near(cur.completionRate, 0.5));
ok("cod share = cod/orders", near(cur.codShare, 0.5));
ok("topItem is the max-revenue item (B=200)", cur.topItem?.name === "B" && cur.topItem?.revenue === 200);
ok("hasData true when orders exist", cur.hasData === true);

// --- window boundary: prior week has only the -10d order ---
const prior = windowKpis(orders, NOW - 14 * DAY, NOW - 7 * DAY);
ok("prior window isolates the -10d order", prior.orders === 1 && prior.revenue === 500);

// --- empty window ---
const empty = windowKpis(orders, NOW - 100 * DAY, NOW - 90 * DAY);
ok("empty window → hasData false, zeros", !empty.hasData && empty.revenue === 0 && empty.aov === 0 && empty.topItem === null);

// --- pctDelta: two comparable periods vs no baseline ---
ok("pctDelta 300 vs 500 = -40", pctDelta(300, 500) === -40);
ok("pctDelta 120 vs 100 = 20", pctDelta(120, 100) === 20);
ok("pctDelta rounds", pctDelta(133, 100) === 33);
ok("pctDelta null when prior is 0 (no comparable baseline)", pctDelta(300, 0) === null);
ok("pctDelta null when prior negative", pctDelta(300, -5) === null);

// --- computeInsights splits current/prior correctly (week) ---
const res = computeInsights(orders, NOW, 7);
ok("computeInsights current = 300", res.current.revenue === 300);
ok("computeInsights prior = 500", res.prior.revenue === 500);
ok("delta from split is -40", pctDelta(res.current.revenue, res.prior.revenue) === -40);

console.log(`\nINSIGHTS-KPIS UNIT: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
