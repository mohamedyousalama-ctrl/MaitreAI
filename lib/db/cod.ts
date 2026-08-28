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
import { mustSucceed } from "@/lib/db/checked";
// THE repo's single minor-unit money guard — the same one the card path uses.
// Value import (the module is node-builtin-only at runtime), so the cash and card
// paths share one definition of "a chargeable amount" and cannot drift apart.
import { toHalalas } from "@/lib/payments/providers/moyasar";
import type { SettlementSlipData } from "@/lib/render/receipt";

export type SettlementStatus = "pending" | "held_by_driver" | "settled";
export type RefundMethod = "cash" | "provider";

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

export function parseRefundMetadata(body: Record<string, unknown>):
  | { ok: true; refund: { amount: number; method: RefundMethod; reason: string; evidence: string | null } }
  | { ok: false; error: "bad_refund_metadata" } {
  const rawAmount = body.refundAmount ?? body.amount;
  const amount =
    typeof rawAmount === "number"
      ? rawAmount
      : typeof rawAmount === "string" && rawAmount.trim()
        ? Number(rawAmount)
        : NaN;
  const method = String(body.refundMethod ?? body.method ?? "").trim();
  const reason = String(body.refundReason ?? body.reason ?? "").trim();
  const rawEvidence = body.refundEvidence ?? body.evidence ?? null;
  const evidence =
    rawEvidence == null
      ? null
      : typeof rawEvidence === "string"
        ? rawEvidence.trim() || null
        : String(rawEvidence);

  if (!Number.isFinite(amount) || (method !== "cash" && method !== "provider") || !reason) {
    return { ok: false, error: "bad_refund_metadata" };
  }
  return { ok: true, refund: { amount, method, reason, evidence } };
}

export async function recordOrderRefund(
  db: SupabaseClient,
  restaurantId: string,
  args: {
    orderId: string;
    amount: number;
    method: RefundMethod;
    reason: string;
    evidence?: string | null;
    actorUserId?: string | null;
    actorRole?: string | null;
  }
): Promise<{ ok: true; eventId: string; expected: number } | { ok: false; error: string }> {
  const { data: order } = await db
    .from("orders")
    .select("id,total,payment_status,payment_method")
    .eq("id", args.orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!order) return { ok: false, error: "order_not_found" };

  const row = order as { total: number | string | null; payment_status: string | null; payment_method: string | null };
  if (row.payment_status !== "paid") return { ok: false, error: "order_not_paid" };

  const expected = Number(row.total);
  const amount = Number(args.amount);
  if (!Number.isFinite(expected) || expected <= 0) return { ok: false, error: "bad_order_total" };
  if (!Number.isFinite(amount) || amount <= 0 || amount > expected) return { ok: false, error: "bad_refund_amount" };

  const { data: collection, error: collectionError } = await db
    .from("cod_collections")
    .select("id,driver_id")
    .eq("order_id", args.orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (collectionError) return { ok: false, error: "collection_read_failed" };
  const codCollection = collection as { id?: string | null; driver_id?: string | null } | null;

  const { data: event, error: eventError } = await db
    .from("cod_cash_events")
    .insert({
      restaurant_id: restaurantId,
      cod_collection_id: codCollection?.id ?? null,
      driver_id: codCollection?.driver_id ?? null,
      type: "refund_recorded",
      amount,
      expected,
      actor_user_id: args.actorUserId ?? null,
      actor_role: args.actorRole ?? null,
      payload: {
        orderId: args.orderId,
        method: args.method,
        reason: args.reason,
        evidence: args.evidence ?? null,
        paymentMethod: row.payment_method ?? null,
        paymentStatusBefore: row.payment_status,
      },
    })
    .select("id")
    .single();
  const eventId = (event as { id?: string } | null)?.id;
  if (eventError || !eventId) return { ok: false, error: "refund_record_failed" };

  return { ok: true, eventId, expected };
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
    .select("total,payment_method")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!order) return { ok: false, error: "order_not_found" };
  const expected = Number((order as { total: number }).total);

  // F1.7 Fix 3 — never cash-capture or relabel a NON-COD order. A delivery order
  // paid by another method (e.g. vodafone_cash) is not driver-collected cash: do
  // NOT open a cod_collections row and do NOT overwrite payment_method. Genuine COD
  // ("cod") and legacy/unset (null) proceed exactly as before — null is treated as
  // COD so the historical back-fill still works. This is the single chokepoint for
  // all delivered paths (operator route, driver-token, order-store).
  const method = (order as { payment_method: string | null }).payment_method;
  if (method && method !== "cod") {
    return { ok: true, expected };
  }

  // UI4 — a staff-marked TEST order must never enter the cash ledger (else its
  // fake cash inflates the per-driver/held/today COD totals). Defensive separate
  // read: if the is_test column isn't present yet (migration 0044 not applied) the
  // query errors → data null → treated as non-test, so REAL COD capture is never
  // blocked. No cod_collections row is opened for a test order.
  const { data: testRow } = await db
    .from("orders")
    .select("is_test")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if ((testRow as { is_test?: boolean } | null)?.is_test === true) {
    return { ok: true, expected };
  }

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

  // MONEY SYMMETRY — the CARD path refuses a total that is not a whole number of
  // minor units: lib/payments/create-session.ts does `toHalalas(total)` inside a
  // try/catch and returns `amount_invalid` rather than charge a rounded figure.
  // The CASH path used to accept the same value silently: `p_expected` reached
  // capture_cod_on_delivered_atomic, whose `round(p_expected, 2)::numeric(12,2)`
  // (migration 0093) quietly turned e.g. 10.005 into 10.01 before it entered the
  // ledger. Nothing fractional was ever stored — the defect is the ASYMMETRY:
  // identical malformed money was refused on card and rounded on cash, so a bad
  // total surfaced loudly in one path and vanished in the other.
  //
  // This is deliberately the SAME function the card path calls, not a second
  // implementation — a re-implementation could drift (epsilon, negatives, NaN)
  // and re-open exactly the gap this closes. Both amounts crossing into the
  // ledger are checked: `expected` (from orders.total) and `collected` (the
  // driver/operator figure, which is money too). Same failure code as the card
  // path, so a caller sees one vocabulary for "this amount is not chargeable".
  //
  // Placed at the ledger boundary, AFTER the non-COD and test-order no-ops above:
  // those paths open no cash row, so there is no rounding to refuse there and
  // their existing `ok: true` no-op behaviour is untouched.
  for (const amount of [expected, collected]) {
    try {
      toHalalas(amount);
    } catch {
      console.error(
        `[cod] capture refused: ${amount} is not a whole number of minor units (order ${orderId})`,
      );
      return { ok: false, error: "amount_invalid" };
    }
  }

  type CaptureRpcRow = {
    collected?: number | string | null;
    expected?: number | string | null;
    collection_id?: string | null;
    event_type?: string | null;
  };

  try {
    const data = await mustSucceed<CaptureRpcRow | CaptureRpcRow[]>(
      db.rpc("capture_cod_on_delivered_atomic", {
        p_restaurant_id: restaurantId,
        p_order_id: orderId,
        p_delivery_id: deliveryId,
        p_driver_id: driverId,
        p_driver_name: driverName,
        p_expected: expected,
        p_collected: collected,
        p_actor_user_id: args.actorUserId ?? null,
        p_actor_role: args.actorRole ?? null,
      }),
      "cod.capture_on_delivered_atomic",
    );
    const row = (Array.isArray(data) ? data[0] : data) as CaptureRpcRow | null | undefined;
    if (!row?.collection_id) return { ok: false, error: "capture_failed" };
    return {
      ok: true,
      collected: round2(Number(row.collected ?? collected)),
      expected: round2(Number(row.expected ?? expected)),
    };
  } catch (e) {
    console.error("[cod] capture_cod_on_delivered_atomic failed:", e instanceof Error ? e.message : e);
    return { ok: false, error: "capture_failed" };
  }
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

/** A past settlement (driver cash handed in), for the read-only history view. */
export interface SettlementRow {
  id: string;
  driverName: string | null;
  totalAmount: number;
  orderCount: number;
  settledByRole: string | null;
  note: string | null;
  createdAt: string;
}

/**
 * READ-ONLY: recent settlements (newest first). Surfaces cod_settlements rows
 * (already written by settleDriver) so past hand-ins are visible. settled_by is
 * an auth user id we don't resolve to a name here (auth.users isn't cheaply
 * joinable via PostgREST) — we show settled_by_role + time; name-resolution is a
 * follow-up. No writes.
 */
export async function settlementHistory(db: SupabaseClient, restaurantId: string, limit = 50): Promise<SettlementRow[]> {
  const { data } = await db
    .from("cod_settlements")
    .select("id, driver_name, total_amount, order_count, settled_by_role, note, created_at")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  type Row = { id: string; driver_name: string | null; total_amount: number; order_count: number; settled_by_role: string | null; note: string | null; created_at: string };
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    driverName: r.driver_name,
    totalAmount: round2(Number(r.total_amount)),
    orderCount: r.order_count,
    settledByRole: r.settled_by_role,
    note: r.note,
    createdAt: r.created_at,
  }));
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
  const { data, error } = await db.rpc("settle_cod_driver_atomic", {
    p_restaurant_id: restaurantId,
    p_driver_id: args.driverId,
    p_settled_by: args.settledBy ?? null,
    p_settled_by_role: args.settledByRole ?? null,
    p_note: args.note ?? null,
  });
  if (error) {
    console.error("[cod] settle_cod_driver_atomic failed:", error.message);
    return { ok: false, error: "settlement_failed" };
  }

  type RpcRow = { total?: number | string | null; order_count?: number | string | null; settlement_id?: string | null };
  const row = (Array.isArray(data) ? data[0] : data) as RpcRow | null;
  const orderCount = Number(row?.order_count ?? 0);
  const settlementId = row?.settlement_id ?? "";
  if (!row || orderCount <= 0 || !settlementId) return { ok: false, error: "nothing_to_settle" };

  return {
    ok: true,
    total: round2(Number(row.total ?? 0)),
    orderCount,
    settlementId,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// --- UI2 — end-of-shift: settle every held driver (reuses settleDriver) -------
/**
 * Settle ALL drivers who currently hold unsettled cash. Reuses settleDriver per
 * driver (no reimplementation). IDEMPOTENT: only `held_by_driver` cash is settled,
 * so a second call settles nothing (driverLedger returns no held drivers) — never
 * double-settles, never errors. Unassigned cash (driver_id null, «غير معيّن») is
 * skipped (it can't be attributed to a driver to hand in) and reported separately.
 */
export async function settleAllHeldDrivers(
  db: SupabaseClient,
  restaurantId: string,
  args: { settledBy?: string | null; settledByRole?: string | null; note?: string | null }
): Promise<{ settledCount: number; total: number; skippedUnassigned: number; results: Array<{ driverId: string; driverName: string; total: number; orderCount: number; settlementId: string }> }> {
  const ledger = await driverLedger(db, restaurantId);
  const results: Array<{ driverId: string; driverName: string; total: number; orderCount: number; settlementId: string }> = [];
  let total = 0;
  let skippedUnassigned = 0;
  for (const d of ledger) {
    if (!d.driverId) { skippedUnassigned += d.unsettledCount; continue; }
    const r = await settleDriver(db, restaurantId, { driverId: d.driverId, settledBy: args.settledBy, settledByRole: args.settledByRole, note: args.note });
    if (r.ok) {
      results.push({ driverId: d.driverId, driverName: d.driverName, total: r.total ?? 0, orderCount: r.orderCount ?? 0, settlementId: r.settlementId ?? "" });
      total += r.total ?? 0;
    }
  }
  return { settledCount: results.length, total: round2(total), skippedUnassigned, results };
}

// --- UI2 — printable settlement slip data (per cod_settlements row) ----------
const ROLE_AR: Record<string, string> = { manager: "مدير", operation: "موظف" };
function slipDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Build the slip payload for a settled batch. Tenant-scoped; figures from the
 *  settled ledger rows (collected = the settlement total, expected = sum of the
 *  settled collections' expected_cash). Returns null if not found in this tenant. */
export async function loadSettlementSlip(
  db: SupabaseClient,
  restaurantId: string,
  settlementId: string
): Promise<SettlementSlipData | null> {
  const { data: st } = await db
    .from("cod_settlements")
    .select("driver_name,total_amount,order_count,settled_by_role,note,created_at")
    .eq("id", settlementId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!st) return null;
  const s = st as { driver_name: string | null; total_amount: number; order_count: number; settled_by_role: string | null; note: string | null; created_at: string };

  const { data: cols } = await db
    .from("cod_collections")
    .select("expected_cash,cash_collected,orders(order_number)")
    .eq("settlement_id", settlementId)
    .eq("restaurant_id", restaurantId);
  const rows = (cols ?? []) as unknown as Array<{ expected_cash: number; cash_collected: number | null; orders: { order_number: string | null } | { order_number: string | null }[] | null }>;
  const orderNo = (o: { order_number: string | null } | { order_number: string | null }[] | null): string => {
    const rec = Array.isArray(o) ? o[0] : o;
    return String(rec?.order_number ?? "—");
  };
  const items = rows.map((r) => ({ orderNumber: orderNo(r.orders), amount: round2(Number(r.cash_collected ?? 0)) }));
  const expected = round2(rows.reduce((a, r) => a + Number(r.expected_cash ?? 0), 0));
  const collected = round2(Number(s.total_amount));

  const { data: rest } = await db.from("restaurants").select("name,currency").eq("id", restaurantId).maybeSingle();
  const r = (rest as { name?: string; currency?: string } | null) ?? {};

  return {
    restaurantName: r.name ?? "",
    driverName: s.driver_name ?? "غير معيّن",
    dateLabel: slipDate(s.created_at),
    currency: r.currency || "ج.م",
    expected,
    collected,
    discrepancy: round2(collected - expected),
    orderCount: s.order_count,
    items,
    settledBy: s.settled_by_role ? ROLE_AR[s.settled_by_role] ?? s.settled_by_role : undefined,
    note: s.note ?? undefined,
  };
}
