// ============================================================================
// MaitreAI — R5 Customer aggregates (pure; browser+server safe)
// One computation behind the console's Customers view. Derives everything from
// the customers table's own maintained counters (orders_count, ltv, last_seen_at)
// so it's cheap and consistent with what the rest of the app already trusts.
//
// DOCUMENTED SEGMENT FORMULA (single source of truth — the UI must not re-derive):
//   new       — orders_count <= 1   (first-timer / just discovered us)
//   returning — orders_count 2..4   (came back, not yet a regular)
//   loyal     — orders_count >= 5   (a regular)
// AT-RISK: a customer with orders_count >= 1 whose last_seen_at is older than
//   `atRiskDays` (default 30) — they ordered before but have gone quiet (churn
//   risk). A customer who never ordered is NOT at-risk (nothing to churn from).
//
// Pure so the route and its harness share one source of truth.
// ============================================================================

export interface CustomerAggInput {
  id: string;
  name: string | null;
  phone: string | null;
  orders_count: number | null;
  ltv: number | null;
  last_seen_at: string | null;
}

export type Segment = "new" | "returning" | "loyal";

export interface CustomerFacts {
  totalCustomers: number;
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number; // totalRevenue / totalOrders (0 when no orders)
  avgOrdersPerCustomer: number;
}

export interface CustomerAggregates {
  facts: CustomerFacts;
  segments: Record<Segment, number>;
  segmentFormula: Record<Segment, string>;
  topBySpend: Array<{ id: string; name: string | null; phone: string | null; ltv: number; orders_count: number }>;
  atRisk: Array<{ id: string; name: string | null; phone: string | null; last_seen_at: string | null; days_since: number }>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const num = (v: number | null | undefined): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function segmentFor(ordersCount: number): Segment {
  if (ordersCount >= 5) return "loyal";
  if (ordersCount >= 2) return "returning";
  return "new";
}

export function computeCustomerAggregates(
  rows: CustomerAggInput[],
  opts: { nowMs: number; atRiskDays?: number; topN?: number; atRiskLimit?: number } = { nowMs: 0 },
): CustomerAggregates {
  const atRiskDays = opts.atRiskDays ?? 30;
  const topN = opts.topN ?? 10;
  const atRiskLimit = opts.atRiskLimit ?? 100;

  let totalOrders = 0;
  let totalRevenue = 0;
  const segments: Record<Segment, number> = { new: 0, returning: 0, loyal: 0 };

  for (const r of rows) {
    const oc = num(r.orders_count);
    totalOrders += oc;
    totalRevenue += num(r.ltv);
    segments[segmentFor(oc)]++;
  }

  const totalCustomers = rows.length;
  const facts: CustomerFacts = {
    totalCustomers,
    totalOrders,
    totalRevenue,
    avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    avgOrdersPerCustomer: totalCustomers > 0 ? totalOrders / totalCustomers : 0,
  };

  const topBySpend = [...rows]
    // FR-024 — a "top spender" must have actually ordered. Without this, a low-activity
    // tenant (all 0-spend customers) fills the top-N with «٠ طلبات» rows — a fake "top
    // loyal customer" metric. Mirrors the atRisk guard (orders_count >= 1) below.
    .filter((r) => num(r.orders_count) >= 1)
    .sort((a, b) => num(b.ltv) - num(a.ltv))
    .slice(0, topN)
    .map((r) => ({ id: r.id, name: r.name, phone: r.phone, ltv: num(r.ltv), orders_count: num(r.orders_count) }));

  const atRisk = rows
    .filter((r) => num(r.orders_count) >= 1 && r.last_seen_at)
    .map((r) => ({
      id: r.id, name: r.name, phone: r.phone, last_seen_at: r.last_seen_at,
      days_since: Math.floor((opts.nowMs - new Date(r.last_seen_at as string).getTime()) / DAY_MS),
    }))
    .filter((r) => Number.isFinite(r.days_since) && r.days_since >= atRiskDays)
    .sort((a, b) => b.days_since - a.days_since)
    .slice(0, atRiskLimit); // bounded like topBySpend so the payload can't grow unbounded

  return {
    facts,
    segments,
    segmentFormula: {
      new: "orders_count <= 1",
      returning: "orders_count 2..4",
      loyal: "orders_count >= 5",
    },
    topBySpend,
    atRisk,
  };
}
