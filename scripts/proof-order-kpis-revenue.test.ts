// ============================================================================
// WO-CONSOLE-BATCH-B FR-006 — red-first proof: the direct-revenue definition.
// Every order_status's treatment is PINNED here (PM-ruled): committed orders count
// toward revenue; cancelled NEVER counts; pending_confirmation is separate («قيد
// التأكيد»); pending_payment + draft are pre-commitment and excluded.
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-order-kpis-revenue.test.ts
// ============================================================================

import { windowKpis, countsAsRevenue } from "../lib/insights/order-kpis.ts";
import type { OrderStatusKey } from "../lib/types.ts";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

// --- countsAsRevenue: pin EACH of the nine statuses ----------------------------
const REVENUE: OrderStatusKey[] = ["paid", "preparing", "ready", "out_for_delivery", "delivered"];
const NOT_REVENUE: OrderStatusKey[] = ["draft", "pending_confirmation", "pending_payment", "cancelled"];
for (const s of REVENUE) check(`countsAsRevenue(${s}) === true`, countsAsRevenue(s) === true);
for (const s of NOT_REVENUE) check(`countsAsRevenue(${s}) === false`, countsAsRevenue(s) === false);

// --- windowKpis: one order of each status, distinct power-of-two totals ---------
const mk = (status: OrderStatusKey, total: number, extra: Record<string, unknown> = {}) =>
  ({ id: status, orderStatus: status, total, createdAt: 1000, isTest: false, items: [], ...extra }) as never;
const all = [
  mk("draft", 1), mk("pending_confirmation", 2), mk("pending_payment", 4),
  mk("paid", 8), mk("preparing", 16), mk("ready", 32), mk("out_for_delivery", 64),
  mk("delivered", 128), mk("cancelled", 256),
];
const k = windowKpis(all, 0, 2000);

check("revenue = ONLY committed totals (8+16+32+64+128 = 248)", k.revenue === 248);
check("revenue EXCLUDES cancelled (256 never counts)", k.revenue !== 248 + 256 && !((k.revenue & 256) === 256 && k.revenue > 248));
check("revenue EXCLUDES pending_confirmation (2) + pending_payment (4) + draft (1)", k.revenue === 248);
check("orders = committed count (5)", k.orders === 5);
check("aov = revenue / committed orders (248/5)", Math.abs(k.aov - 248 / 5) < 1e-9);
check("delivered counted (1)", k.delivered === 1);
check("pending_confirmation surfaced SEPARATELY — count 1", k.pendingConfirmationOrders === 1);
check("pending_confirmation amount is its own total (2), not in revenue", k.pendingConfirmationRevenue === 2);
check("hasData true — the window has real orders", k.hasData === true);

// --- cancelled + pending only → zero revenue, zero committed orders, but hasData -
const noRevenue = windowKpis([mk("cancelled", 500), mk("pending_confirmation", 300), mk("pending_payment", 100)], 0, 2000);
check("all-non-committed window → revenue 0", noRevenue.revenue === 0);
check("all-non-committed window → orders 0", noRevenue.orders === 0);
check("all-non-committed window → aov 0 (no divide-by-zero)", noRevenue.aov === 0);
check("all-non-committed window → pending count 1", noRevenue.pendingConfirmationOrders === 1);
check("all-non-committed window → still hasData (real orders exist)", noRevenue.hasData === true);

// --- test orders never move a real figure --------------------------------------
const withTest = windowKpis([mk("paid", 1000, { isTest: true }), mk("paid", 8)], 0, 2000);
check("isTest order excluded from revenue", withTest.revenue === 8);

// --- empty window → all zero, no data ------------------------------------------
const empty = windowKpis([], 0, 2000);
check("empty window → revenue 0 / orders 0 / hasData false", empty.revenue === 0 && empty.orders === 0 && empty.hasData === false);

console.log(`\nORDER-KPIS-REVENUE PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
