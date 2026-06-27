// ============================================================================
// MaitreAI — COD Cash Ledger service layer (SERVER ONLY).
// Track cash-on-delivery per driver: expected (from the order's tool-computed
// total) vs collected (what the driver actually received), and who hasn't settled.
//
// Money guardrail: expected_cash ALWAYS comes from orders.total (written by the
// finalize path from the order tools) — never a model- or hand-authored figure.
// cash_collected is the real amount the driver received (may differ → discrepancy,
// kept visible, never hidden). Every cash event writes an append-only audit row.
//
// Composes with the delivery module (PR #6): captureCodOnDelivered is the one hook
// the driver "delivered" status update calls; absent delivery it is still callable
// by the operator capture route. All reads/writes are tenant-scoped.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SettlementStatus = "pending" | "held_by_driver" | "settled";

export interface CodCollectionRow {
  id: string;
  order_id: string;
  delivery_id: string | null;
  driver_id: string | null;
  driver_name: string | null;
  expected_cash: number;
  cash_collected: number | null;
  collected_at: string | null;
  settlement_status: SettlementStatus;
  settled_at: string | null;
}

async function audit(
  db: SupabaseClient,
  restaurantId: string,
  e: {
    collectionId?: string | null;
    driverId?: string | null;
    type: "collected" | "settled" | "adjusted";
    amount?: number | null;
    expected?: number | null;
    actorUserId?: string | null;
    actorRole?: string | null;
    payload?: Record<string, unknown>;
  }
) {
  await db.from("cod_cash_events").insert({
    restaurant_id: restaurantId,
    cod_collection_id: e.collectionId ?? null,
    driver_id: e.driverId ?? null,
    type: e.type,
    amount: e.amount ?? null,
    expected: e.expected ?? null,
    actor_user_id: e.actorUserId ?? null,
    actor_role: e.actorRole ?? null,
    payload: e.payload ?? {},
  });
}

/**
 * Mark an order as cash-on-delivery and open its cash record. Idempotent on
 * order_id. expected_cash is COPIED from orders.total (tool-computed, incl.
 * delivery fee + VAT) — the single source of truth for what's owed.
 */
export async function markOrderCod(
  db: SupabaseClient,
  restaurantId: string,
  args: { orderId: string; deliveryId?: string | null; driverId?: string | null }
): Promise<{ ok: boolean; expected?: number; error?: string }> {
  const { data: order } = await db
    .from("orders")
    .select("id,total")
    .eq("id", args.orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!order) return { ok: false, error: "order_not_found" };
  const expected = Number((order as { total: number }).total);

  await db.from("orders").update({ payment_method: "cod" }).eq("id", args.orderId).eq("restaurant_id", restaurantId);
  await db.from("cod_collections").upsert(
    {
      restaurant_id: restaurantId,
      order_id: args.orderId,
      delivery_id: args.deliveryId ?? null,
      driver_id: args.driverId ?? null,
      expected_cash: expected,
      settlement_status: "pending",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "order_id", ignoreDuplicates: true }
  );
  return { ok: true, expected };
}

/**
 * Capture cash when a COD delivery is marked "delivered". THE delivery hook:
 * the driver one-time-link status route (PR #6) calls this on target=delivered.
 * Defaults cash_collected to the expected total; pass cashCollected to record the
 * actual amount (change/discrepancy). Pulls driver from the delivery if present.
 * Idempotent: re-capturing adjusts the amount and logs an 'adjusted' event.
 */
export async function captureCodOnDelivered(
  db: SupabaseClient,
  args: {
    restaurantId: string;
    orderId: string;
    deliveryId?: string | null;
    cashCollected?: number | null;
    actorUserId?: string | null;
    actorRole?: string | null;
  }
): Promise<{ ok: boolean; collected?: number; expected?: number; error?: string }> {
  const { restaurantId, orderId } = args;

  // Resolve the order total (expected) + the driver holding the cash (if any).
  const { data: order } = await db
    .from("orders")
    .select("total")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!order) return { ok: false, error: "order_not_found" };
  const expected = Number((order as { total: number }).total);

  let deliveryId = args.deliveryId ?? null;
  let driverId: string | null = null;
  let driverName: string | null = null;
  // The delivery row (PR #6) carries the assigned driver; tolerate its absence
  // (no delivery module yet → data is null, error ignored, capture still works).
  const { data: del } = await db
    .from("deliveries")
    .select("id,driver_id,drivers(name)")
    .eq("order_id", orderId)
    .maybeSingle();
  if (del) {
    deliveryId = (del as { id: string }).id;
    driverId = (del as { driver_id: string | null }).driver_id ?? null;
    const dn = (del as { drivers?: { name?: string } | null }).drivers;
    driverName = dn?.name ?? null;
  }

  const collected = args.cashCollected ?? expected;

  // Open or fetch the cash record (expected from the order total).
  const { data: existing } = await db
    .from("cod_collections")
    .select("id,settlement_status")
    .eq("order_id", orderId)
    .maybeSingle();

  let collectionId: string;
  let isAdjust = false;
  if (existing) {
    collectionId = (existing as { id: string }).id;
    isAdjust = (existing as { settlement_status: string }).settlement_status !== "pending";
    await db
      .from("cod_collections")
      .update({
        delivery_id: deliveryId,
        driver_id: driverId,
        driver_name: driverName,
        expected_cash: expected,
        cash_collected: collected,
        collected_at: new Date().toISOString(),
        settlement_status: "held_by_driver",
        updated_at: new Date().toISOString(),
      })
      .eq("id", collectionId);
  } else {
    const { data: created } = await db
      .from("cod_collections")
      .insert({
        restaurant_id: restaurantId,
        order_id: orderId,
        delivery_id: deliveryId,
        driver_id: driverId,
        driver_name: driverName,
        expected_cash: expected,
        cash_collected: collected,
        collected_at: new Date().toISOString(),
        settlement_status: "held_by_driver",
      })
      .select("id")
      .single();
    collectionId = (created?.id as string) ?? "";
  }
  await db.from("orders").update({ payment_method: "cod" }).eq("id", orderId).eq("restaurant_id", restaurantId);

  await audit(db, restaurantId, {
    collectionId,
    driverId,
    type: isAdjust ? "adjusted" : "collected",
    amount: collected,
    expected,
    actorUserId: args.actorUserId,
    actorRole: args.actorRole,
    payload: { orderId, deliveryId },
  });
  return { ok: true, collected, expected };
}

/**
 * Operator records / corrects the cash actually collected for an order (e.g. a
 * discrepancy noticed after the fact). Logs an 'adjusted' (or 'collected') event.
 */
export async function recordCollection(
  db: SupabaseClient,
  restaurantId: string,
  args: { orderId: string; cashCollected: number; actorUserId?: string | null; actorRole?: string | null }
): Promise<{ ok: boolean; expected?: number; error?: string }> {
  const { data: row } = await db
    .from("cod_collections")
    .select("id,expected_cash,settlement_status,driver_id")
    .eq("order_id", args.orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!row) return { ok: false, error: "collection_not_found" };
  const r = row as { id: string; expected_cash: number; settlement_status: string; driver_id: string | null };
  const wasCollected = r.settlement_status !== "pending";
  await db
    .from("cod_collections")
    .update({
      cash_collected: args.cashCollected,
      collected_at: new Date().toISOString(),
      settlement_status: r.settlement_status === "settled" ? "settled" : "held_by_driver",
      updated_at: new Date().toISOString(),
    })
    .eq("id", r.id);
  await audit(db, restaurantId, {
    collectionId: r.id,
    driverId: r.driver_id,
    type: wasCollected ? "adjusted" : "collected",
    amount: args.cashCollected,
    expected: Number(r.expected_cash),
    actorUserId: args.actorUserId,
    actorRole: args.actorRole,
  });
  return { ok: true, expected: Number(r.expected_cash) };
}

export interface DriverLedgerRow {
  driverId: string | null;
  driverName: string;
  expected: number; // sum expected of unsettled (held) collections
  collected: number; // sum collected of unsettled (held) collections
  outstanding: number; // cash physically held by the driver, not handed in
  discrepancy: number; // expected - collected (negative = short)
  unsettledCount: number;
}

/** One held (unsettled) COD order, itemized for the per-driver breakdown view. */
export interface HeldOrderItem {
  driverId: string | null;
  orderId: string;
  orderNumber: string | null;
  expected: number;
  collected: number;
  status: string | null;
  collectedAt: string | null;
  customer: string | null;
}

/**
 * READ-ONLY: the individual held_by_driver collections (one row per order) that
 * make up each driver's outstanding cash. UUID-keyed joins only
 * (cod_collections.order_id → orders.id → customers.id) — no order_number match.
 * The client groups these by driverId under each driver card; sums reconcile
 * with driverLedger() because both read the same held rows.
 */
export async function heldCollectionItems(db: SupabaseClient, restaurantId: string): Promise<HeldOrderItem[]> {
  const { data } = await db
    .from("cod_collections")
    .select("driver_id, order_id, expected_cash, cash_collected, collected_at, orders(order_number, order_status, customers(name))")
    .eq("restaurant_id", restaurantId)
    .eq("settlement_status", "held_by_driver")
    .order("collected_at", { ascending: false });
  type Row = {
    driver_id: string | null;
    order_id: string;
    expected_cash: number;
    cash_collected: number | null;
    collected_at: string | null;
    orders: { order_number: string | null; order_status: string | null; customers: { name: string | null } | null } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    driverId: r.driver_id,
    orderId: r.order_id,
    orderNumber: r.orders?.order_number ?? null,
    expected: round2(Number(r.expected_cash)),
    collected: round2(Number(r.cash_collected ?? 0)),
    status: r.orders?.order_status ?? null,
    collectedAt: r.collected_at,
    customer: r.orders?.customers?.name ?? null,
  }));
}

/** Per-driver cash position over UNSETTLED (held_by_driver) collections. */
export async function driverLedger(db: SupabaseClient, restaurantId: string): Promise<DriverLedgerRow[]> {
  const { data } = await db
    .from("cod_collections")
    .select("driver_id,driver_name,expected_cash,cash_collected,settlement_status")
    .eq("restaurant_id", restaurantId)
    .eq("settlement_status", "held_by_driver");
  const rows = (data ?? []) as Array<{
    driver_id: string | null;
    driver_name: string | null;
    expected_cash: number;
    cash_collected: number | null;
  }>;
  const byDriver = new Map<string, DriverLedgerRow>();
  for (const r of rows) {
    const key = r.driver_id ?? "unassigned";
    const cur =
      byDriver.get(key) ??
      ({
        driverId: r.driver_id,
        driverName: r.driver_name || "غير معيّن",
        expected: 0,
        collected: 0,
        outstanding: 0,
        discrepancy: 0,
        unsettledCount: 0,
      } as DriverLedgerRow);
    const expected = Number(r.expected_cash);
    const collected = Number(r.cash_collected ?? 0);
    cur.expected += expected;
    cur.collected += collected;
    cur.outstanding += collected; // held cash = what's been collected but not settled
    cur.unsettledCount += 1;
    byDriver.set(key, cur);
  }
  const out = [...byDriver.values()];
  for (const d of out) {
    d.expected = round2(d.expected);
    d.collected = round2(d.collected);
    d.outstanding = round2(d.outstanding);
    d.discrepancy = round2(d.collected - d.expected);
  }
  return out.sort((a, b) => b.outstanding - a.outstanding);
}

export interface CodDailySummary {
  date: string;
  expectedToday: number;
  collectedToday: number;
  outstanding: number; // total held by all drivers (not just today)
  driversWithUnsettled: number;
}

/** Today's COD position + how many drivers are still holding cash. */
export async function codDailySummary(db: SupabaseClient, restaurantId: string): Promise<CodDailySummary> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startIso = start.toISOString();

  const { data: today } = await db
    .from("cod_collections")
    .select("expected_cash,cash_collected,collected_at")
    .eq("restaurant_id", restaurantId)
    .gte("collected_at", startIso);
  let expectedToday = 0;
  let collectedToday = 0;
  for (const r of (today ?? []) as Array<{ expected_cash: number; cash_collected: number | null }>) {
    expectedToday += Number(r.expected_cash);
    collectedToday += Number(r.cash_collected ?? 0);
  }

  const ledger = await driverLedger(db, restaurantId);
  const outstanding = ledger.reduce((s, d) => s + d.outstanding, 0);
  const driversWithUnsettled = ledger.filter((d) => d.unsettledCount > 0).length;

  return {
    date: startIso.slice(0, 10),
    expectedToday: round2(expectedToday),
    collectedToday: round2(collectedToday),
    outstanding: round2(outstanding),
    driversWithUnsettled,
  };
}

/**
 * Settle a driver: mark all their held cash as handed in. Writes one
 * cod_settlements row + a 'settled' audit event, and flips their held collections
 * to settled (linking them to the settlement). Amounts are summed from the
 * recorded cash_collected — never re-derived from the model.
 */
export async function settleDriver(
  db: SupabaseClient,
  restaurantId: string,
  args: { driverId: string; settledBy?: string | null; settledByRole?: string | null; note?: string | null }
): Promise<{ ok: boolean; total?: number; orderCount?: number; settlementId?: string; error?: string }> {
  const { data: held } = await db
    .from("cod_collections")
    .select("id,driver_name,cash_collected")
    .eq("restaurant_id", restaurantId)
    .eq("driver_id", args.driverId)
    .eq("settlement_status", "held_by_driver");
  const rows = (held ?? []) as Array<{ id: string; driver_name: string | null; cash_collected: number | null }>;
  if (!rows.length) return { ok: false, error: "nothing_to_settle" };

  const total = round2(rows.reduce((s, r) => s + Number(r.cash_collected ?? 0), 0));
  const driverName = rows.find((r) => r.driver_name)?.driver_name ?? null;

  const { data: settlement } = await db
    .from("cod_settlements")
    .insert({
      restaurant_id: restaurantId,
      driver_id: args.driverId,
      driver_name: driverName,
      total_amount: total,
      order_count: rows.length,
      settled_by: args.settledBy ?? null,
      settled_by_role: args.settledByRole ?? null,
      note: args.note ?? null,
    })
    .select("id")
    .single();
  const settlementId = (settlement?.id as string) ?? "";

  await db
    .from("cod_collections")
    .update({ settlement_status: "settled", settlement_id: settlementId, settled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("restaurant_id", restaurantId)
    .eq("driver_id", args.driverId)
    .eq("settlement_status", "held_by_driver");

  await audit(db, restaurantId, {
    driverId: args.driverId,
    type: "settled",
    amount: total,
    actorUserId: args.settledBy,
    actorRole: args.settledByRole,
    payload: { settlementId, orderCount: rows.length },
  });
  return { ok: true, total, orderCount: rows.length, settlementId };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
