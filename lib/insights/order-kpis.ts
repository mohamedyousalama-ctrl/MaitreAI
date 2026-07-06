// ============================================================================
// MaitreAI — Item 12 (Insights): order-derived KPIs (pure; browser+server safe).
//
// The ONLY LIVE numbers on the Insights page come from real order aggregates computed
// here over the DB-backed order store — "the money story." Everything else (commission
// hero, funnel, conversion, repeat) needs config or the outcomes table (flag-OFF, 0
// rows) and renders GATHERING, never a fabricated number.
//
// Two honesty rules are enforced HERE so the UI can't violate them:
//  • TEST ORDERS EXCLUDED — every figure filters `isTest` (they must never move a real
//    revenue/count number; the established convention).
//  • TREND NEEDS TWO COMPARABLE PERIODS — pctDelta returns null when the prior window
//    has NO real basis (prior.orders === 0). A card must not render a colored trend
//    without a baseline: null delta = no trend shown. Zero orders in a loaded window is
//    a TRUE zero (real, shown); an unloaded store is no-data (the UI gates on hydration)
//    — different truths.
//
// Pure so the route/UI and the harness share one source of truth.
// ============================================================================

import type { LocalOrder } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface WindowKpis {
  revenue: number;
  orders: number;
  aov: number;            // revenue / orders (0 when no orders)
  delivered: number;
  completionRate: number; // delivered / orders (0..1; 0 when no orders)
  codShare: number;       // cod orders / orders (0..1; 0 when no orders)
  topItem: { name: string; revenue: number } | null;
  /** True when the window has ≥1 real (non-test) order — a basis for a comparison. */
  hasData: boolean;
}

const isCod = (o: LocalOrder): boolean => (o.paymentMethod ?? "").toLowerCase() === "cod";
const itemRevenue = (it: { total?: number; quantity?: number; unitPrice?: number }): number =>
  typeof it.total === "number" ? it.total : (it.quantity ?? 0) * (it.unitPrice ?? 0);

/** Aggregate real (non-test) orders whose createdAt falls in [fromMs, toMs). */
export function windowKpis(orders: LocalOrder[], fromMs: number, toMs: number): WindowKpis {
  let revenue = 0, count = 0, delivered = 0, cod = 0;
  const byItem = new Map<string, number>();

  for (const o of orders) {
    if (o.isTest) continue;
    if (o.createdAt < fromMs || o.createdAt >= toMs) continue;
    count++;
    revenue += o.total;
    if (o.orderStatus === "delivered") delivered++;
    if (isCod(o)) cod++;
    for (const it of o.items ?? []) {
      const name = (it.name ?? "").trim();
      if (name) byItem.set(name, (byItem.get(name) ?? 0) + itemRevenue(it));
    }
  }

  let topItem: { name: string; revenue: number } | null = null;
  for (const [name, rev] of byItem) if (!topItem || rev > topItem.revenue) topItem = { name, revenue: rev };

  return {
    revenue,
    orders: count,
    aov: count > 0 ? revenue / count : 0,
    delivered,
    completionRate: count > 0 ? delivered / count : 0,
    codShare: count > 0 ? cod / count : 0,
    topItem,
    hasData: count > 0,
  };
}

/** Percent change vs a prior value, ROUNDED. Returns null when there is no comparable
 *  baseline (prior <= 0) — the caller renders no trend rather than a fake "+100%". */
export function pctDelta(current: number, prior: number): number | null {
  if (!(prior > 0)) return null;
  return Math.round(((current - prior) / prior) * 100);
}

export interface InsightsResult { current: WindowKpis; prior: WindowKpis }

/** Current window = [now - rangeDays, now); prior = the equal-length window before it.
 *  The prior window is what makes a trend delta honest (two comparable periods). */
export function computeInsights(orders: LocalOrder[], nowMs: number, rangeDays: number): InsightsResult {
  const span = rangeDays * DAY_MS;
  return {
    current: windowKpis(orders, nowMs - span, nowMs),
    prior: windowKpis(orders, nowMs - 2 * span, nowMs - span),
  };
}
