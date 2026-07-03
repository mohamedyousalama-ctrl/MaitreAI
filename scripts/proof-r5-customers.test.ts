// ============================================================================
// R5 proof harness — customer aggregates + the customer_id launch rule.
// Pure computeCustomerAggregates exercised directly (facts, documented segment
// formula, top-by-spend, at-risk); source assertions confirm the endpoint is
// tenant-scoped and read-only, the canonical ensureCustomerId helper upserts on
// (restaurant_id, phone), and the inbound path uses it (launch rule centralized).
//
// Run: node --experimental-strip-types scripts/proof-r5-customers.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeCustomerAggregates, segmentFor, type CustomerAggInput } from "../lib/customers/aggregates.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };
const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

// ---- Documented segment formula --------------------------------------------
check("orders_count 0 → new", segmentFor(0) === "new");
check("orders_count 1 → new", segmentFor(1) === "new");
check("orders_count 2 → returning", segmentFor(2) === "returning");
check("orders_count 4 → returning", segmentFor(4) === "returning");
check("orders_count 5 → loyal", segmentFor(5) === "loyal");

const rows: CustomerAggInput[] = [
  { id: "a", name: "A", phone: "+201", orders_count: 1, ltv: 100, last_seen_at: ago(1) },   // new, active
  { id: "b", name: "B", phone: "+202", orders_count: 3, ltv: 600, last_seen_at: ago(40) },  // returning, at-risk
  { id: "c", name: "C", phone: "+203", orders_count: 8, ltv: 2000, last_seen_at: ago(60) }, // loyal, at-risk
  { id: "d", name: "D", phone: "+204", orders_count: 0, ltv: 0, last_seen_at: ago(90) },    // new, NOT at-risk (never ordered)
];
const agg = computeCustomerAggregates(rows, { nowMs: NOW, atRiskDays: 30, topN: 2 });

// ---- Facts strip ------------------------------------------------------------
check("totalCustomers", agg.facts.totalCustomers === 4);
check("totalOrders sums orders_count", agg.facts.totalOrders === 12);
check("totalRevenue sums ltv", agg.facts.totalRevenue === 2700);
check("avgOrderValue = revenue/orders", agg.facts.avgOrderValue === 2700 / 12);
check("avgOrdersPerCustomer = orders/customers", agg.facts.avgOrdersPerCustomer === 3);

// ---- Segments ---------------------------------------------------------------
check("segments counts (2 new, 1 returning, 1 loyal)",
  agg.segments.new === 2 && agg.segments.returning === 1 && agg.segments.loyal === 1);
check("segment formula documented in payload",
  agg.segmentFormula.new === "orders_count <= 1" && agg.segmentFormula.loyal === "orders_count >= 5");

// ---- Top by spend -----------------------------------------------------------
check("topBySpend respects topN + sorted desc by ltv",
  agg.topBySpend.length === 2 && agg.topBySpend[0].id === "c" && agg.topBySpend[1].id === "b");

// ---- At-risk ----------------------------------------------------------------
check("at-risk = ordered before AND quiet >= atRiskDays",
  agg.atRisk.map((r) => r.id).join(",") === "c,b"); // sorted by days_since desc
check("never-ordered customer is NOT at-risk", !agg.atRisk.some((r) => r.id === "d"));
check("active customer is NOT at-risk", !agg.atRisk.some((r) => r.id === "a"));
check("at-risk carries days_since", agg.atRisk[0].days_since === 60);

// ---- Empty input ------------------------------------------------------------
{
  const empty = computeCustomerAggregates([], { nowMs: NOW });
  check("empty → zero facts, no divide-by-zero", empty.facts.avgOrderValue === 0 && empty.facts.totalCustomers === 0);
}

// ---- Source: endpoint tenant-scoped + read-only ----------------------------
const route = read("app/api/customers/aggregates/route.ts");
check("endpoint tenant-scoped", route.includes('.eq("restaurant_id", tenant.restaurantId)'));
check("endpoint read-only (no writes)", !/\.update\(|\.insert\(|\.upsert\(/.test(route));
check("endpoint delegates to the pure aggregator", route.includes("computeCustomerAggregates("));
// CodeRabbit R5: the endpoint must not leak the raw DB error to the client, and must
// signal incompleteness rather than silently return capped totals.
check("endpoint does NOT leak raw DB error.message to the client", !/detail: error\.message/.test(route) && !/detail: countErr\.message/.test(route));
check("endpoint flags capped results (honest incompleteness)", route.includes("capped") && route.includes("totalCustomersExact"));

// ---- at-risk list is bounded (CodeRabbit R5 nitpick #3) --------------------
{
  const many = Array.from({ length: 250 }, (_, i) => ({
    id: `c${i}`, name: null, phone: null, orders_count: 3, ltv: 10, last_seen_at: ago(100),
  }));
  const capped = computeCustomerAggregates(many, { nowMs: NOW, atRiskDays: 30, atRiskLimit: 100 });
  check("atRisk is capped to atRiskLimit", capped.atRisk.length === 100);
}

// ---- Source: launch rule centralized (whitespace/format-tolerant per CodeRabbit) ---
const helper = read("lib/db/ensure-customer.ts");
check("ensureCustomerId upserts on (restaurant_id, phone)", /onConflict:\s*"restaurant_id,phone"/.test(helper));
check("ensureCustomerId returns the id", /return\s+data\.id/.test(helper));
const inbound = read("lib/db/messages.ts");
check("inbound path uses the canonical ensureCustomerId with its args",
  /await\s+ensureCustomerId\(/.test(inbound) && inbound.includes("msg.from") && inbound.includes("msg.customerName"));
check("inbound path links customer_id on the conversation",
  inbound.includes("customer_id: customerId"));

console.log(`\nR5-CUSTOMERS PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
