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

import type { LocalOrder, OrderStatusKey } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

// FR-006 — the DIRECT-REVENUE definition (PM-ruled). Only COMMITTED orders count
// toward the money story: money is in (paid) or the order is being fulfilled
// (preparing → ready → out_for_delivery → delivered). Every money/order figure below
// (revenue, orders, aov, delivered, completion, cod, topItem) is aggregated over THIS
// set, so they stay mutually consistent — an AOV of revenue÷orders can't mix a
// committed numerator with an all-orders denominator.
//
// Explicitly NOT direct revenue:
//   • cancelled          — NEVER counts, in any figure (hard rule).
//   • pending_confirmation — surfaced SEPARATELY as «قيد التأكيد» (a promise, not money).
//   • pending_payment    — a link is out but money is not in → not yet revenue.
//   • draft              — a pre-persistence Brain working object; the create path
//     writes orders at `pending_confirmation`, so a `draft` row shouldn't reach the
//     table — pinned here defensively so a stray one can never be counted as revenue.
const REVENUE_STATUSES: ReadonlySet<OrderStatusKey> = new Set<OrderStatusKey>([
  "paid", "preparing", "ready", "out_for_delivery", "delivered",
]);
/** True when an order's status counts toward direct revenue. */
export function countsAsRevenue(status: OrderStatusKey): boolean {
  return REVENUE_STATUSES.has(status);
}

export interface WindowKpis {
  revenue: number;        // committed-status order totals only (cancelled/pending excluded)
  orders: number;         // committed-status order count (the AOV denominator)
  aov: number;            // revenue / orders (0 when no committed orders)
  delivered: number;
  completionRate: number; // delivered / committed orders (0..1; 0 when none)
  codShare: number;       // cod / committed orders (0..1; 0 when none)
  topItem: { name: string; revenue: number } | null;
  /** «قيد التأكيد» — orders awaiting confirmation, shown SEPARATELY (not revenue). */
  pendingConfirmationOrders: number;
  pendingConfirmationRevenue: number;
  /** True when the window has ≥1 real (non-test) order of ANY status — a basis for a
   *  comparison / the "is this window loaded with real data" gate. */
  hasData: boolean;
}

const isCod = (o: LocalOrder): boolean => (o.paymentMethod ?? "").toLowerCase() === "cod";
const itemRevenue = (it: { total?: number; quantity?: number; unitPrice?: number }): number =>
  typeof it.total === "number" ? it.total : (it.quantity ?? 0) * (it.unitPrice ?? 0);

/** Aggregate real (non-test) orders whose createdAt falls in [fromMs, toMs). */
export function windowKpis(orders: LocalOrder[], fromMs: number, toMs: number): WindowKpis {
  let revenue = 0, count = 0, delivered = 0, cod = 0;
  let realOrders = 0, pendingOrders = 0, pendingRevenue = 0;
  const byItem = new Map<string, number>();

  for (const o of orders) {
    if (o.isTest) continue;
    if (o.createdAt < fromMs || o.createdAt >= toMs) continue;
    realOrders++; // any real order → the window has data (hydration/basis gate)

    if (o.orderStatus === "pending_confirmation") {
      pendingOrders++;
      pendingRevenue += o.total;
      continue; // «قيد التأكيد» is reported separately, never in the revenue figures.
    }
    if (!countsAsRevenue(o.orderStatus)) continue; // cancelled / pending_payment / draft

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
    pendingConfirmationOrders: pendingOrders,
    pendingConfirmationRevenue: pendingRevenue,
    hasData: realOrders > 0,
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
