// KVO-007/008/009 proof: delivered COD capture uses one checked atomic RPC.
// Run: node --conditions=react-server --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types scripts/proof-cod-capture-atomic.test.ts

import { readFileSync } from "node:fs";
import { captureCodOnDelivered } from "../lib/db/cod.ts";

const RESTAURANT_ID = "11111111-1111-4111-8111-111111111111";
const ORDER_ID = "22222222-2222-4222-8222-222222222222";
const DELIVERY_ID = "33333333-3333-4333-8333-333333333333";
const DRIVER_ID = "44444444-4444-4444-8444-444444444444";

let pass = 0;
let fail = 0;
function ok(name: string, condition: boolean): void {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
    return;
  }
  fail += 1;
  console.error(`FAIL ${name}`);
}

type Row = Record<string, any>;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function makeDb(opts: { rpcFails?: boolean; orderMissing?: boolean; nonCod?: boolean; isTest?: boolean } = {}) {
  const state = {
    orders: opts.orderMissing
      ? [] as Row[]
      : [{
          id: ORDER_ID,
          restaurant_id: RESTAURANT_ID,
          total: 125.5,
          payment_method: opts.nonCod ? "vodafone_cash" : null,
          is_test: opts.isTest === true,
        }] as Row[],
    deliveries: [{
      id: DELIVERY_ID,
      order_id: ORDER_ID,
      driver_id: DRIVER_ID,
      drivers: { name: "Noura" },
    }] as Row[],
    collections: [] as Row[],
    events: [] as Row[],
    calls: [] as Row[],
    rpcFails: opts.rpcFails === true,
  };

  const matches = (row: Row, filters: Row[]) => filters.every((f) => row[f.col] === f.value);

  const resultFor = (q: Row, single: boolean) => {
    state.calls.push({ kind: "from", table: q.table, op: q.op, payload: q.payload, filters: q.filters });
    if (q.table === "orders" && q.op === "select") {
      const rows = state.orders.filter((r) => matches(r, q.filters));
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }
    if (q.table === "deliveries" && q.op === "select") {
      const rows = state.deliveries.filter((r) => matches(r, q.filters));
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }
    return { data: single ? null : [], error: null };
  };

  const from = (table: string) => {
    const q: Row = { table, op: "select", payload: null, filters: [] as Row[], selectCols: "" };
    const b: Row = {};
    b.select = (cols = "*") => { q.selectCols = cols; return b; };
    b.insert = (payload: unknown) => { q.op = "insert"; q.payload = payload; return b; };
    b.update = (payload: unknown) => { q.op = "update"; q.payload = payload; return b; };
    b.eq = (col: string, value: unknown) => { q.filters.push({ col, value }); return b; };
    b.single = async () => resultFor(q, true);
    b.maybeSingle = async () => resultFor(q, true);
    b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resultFor(q, false)).then(resolve, reject);
    return b;
  };

  const rpc = async (name: string, params: Row) => {
    state.calls.push({ kind: "rpc", name, params });
    if (name !== "capture_cod_on_delivered_atomic") {
      return { data: null, error: { message: `unexpected rpc ${name}`, code: "TEST_BAD_RPC" } };
    }
    if (state.rpcFails) {
      return { data: null, error: { message: "simulated atomic failure", code: "TEST_RPC_FAIL" } };
    }

    const order = state.orders.find((r) => r.id === params.p_order_id && r.restaurant_id === params.p_restaurant_id);
    if (!order) return { data: null, error: { message: "order not found", code: "TEST_ORDER_MISSING" } };

    const expected = round2(Number(params.p_expected ?? 0));
    const collected = round2(Number(params.p_collected ?? expected));
    let collection = state.collections.find((r) => r.order_id === params.p_order_id);
    const eventType = !collection || collection.settlement_status === "pending" ? "collected" : "adjusted";
    if (!collection) {
      collection = {
        id: `collection-${state.collections.length + 1}`,
        restaurant_id: params.p_restaurant_id,
        order_id: params.p_order_id,
      };
      state.collections.push(collection);
    }
    Object.assign(collection, {
      delivery_id: params.p_delivery_id,
      driver_id: params.p_driver_id,
      driver_name: params.p_driver_name,
      expected_cash: expected,
      cash_collected: collected,
      settlement_status: "held_by_driver",
    });
    order.payment_method = "cod";
    state.events.push({
      restaurant_id: params.p_restaurant_id,
      cod_collection_id: collection.id,
      driver_id: params.p_driver_id,
      type: eventType,
      amount: collected,
      expected,
      actor_user_id: params.p_actor_user_id,
      actor_role: params.p_actor_role,
      payload: { orderId: params.p_order_id, deliveryId: params.p_delivery_id },
    });
    return { data: [{ collected, expected, collection_id: collection.id, event_type: eventType }], error: null };
  };

  return { client: { from, rpc }, state };
}

function writeCalls(state: ReturnType<typeof makeDb>["state"]) {
  return state.calls.filter(
    (c) =>
      c.kind === "from" &&
      ["cod_collections", "orders", "cod_cash_events"].includes(c.table) &&
      ["insert", "update"].includes(c.op),
  );
}

{
  const db = makeDb();
  const r = await captureCodOnDelivered(db.client as never, {
    restaurantId: RESTAURANT_ID,
    orderId: ORDER_ID,
    actorUserId: "55555555-5555-4555-8555-555555555555",
    actorRole: "operator",
  });

  ok("normal capture succeeds", r.ok === true && r.collected === 125.5 && r.expected === 125.5);
  ok("normal capture calls atomic RPC", db.state.calls.some((c) => c.kind === "rpc" && c.name === "capture_cod_on_delivered_atomic"));
  ok("normal capture passes tenant-scoped RPC params",
    db.state.calls.some((c) => c.kind === "rpc" && c.params.p_restaurant_id === RESTAURANT_ID && c.params.p_order_id === ORDER_ID));
  ok("normal capture passes delivery and driver attribution", db.state.events[0]?.driver_id === DRIVER_ID && db.state.events[0]?.payload?.deliveryId === DELIVERY_ID);
  ok("normal capture does not use old split writes", writeCalls(db.state).length === 0);
}

{
  const db = makeDb({ rpcFails: true });
  const r = await captureCodOnDelivered(db.client as never, { restaurantId: RESTAURANT_ID, orderId: ORDER_ID });

  ok("RPC error surfaces failure", r.ok === false && r.error === "capture_failed");
  ok("RPC error never false-succeeds", r.ok !== true);
  ok("RPC error writes no collection in mock", db.state.collections.length === 0);
  ok("RPC error writes no audit in mock", db.state.events.length === 0);
}

{
  const db = makeDb({ nonCod: true });
  const r = await captureCodOnDelivered(db.client as never, { restaurantId: RESTAURANT_ID, orderId: ORDER_ID });

  ok("non-COD method skips successfully", r.ok === true && r.expected === 125.5);
  ok("non-COD method does not call RPC", !db.state.calls.some((c) => c.kind === "rpc"));
  ok("non-COD method writes no collection", db.state.collections.length === 0);
}

{
  const db = makeDb({ isTest: true });
  const r = await captureCodOnDelivered(db.client as never, { restaurantId: RESTAURANT_ID, orderId: ORDER_ID });

  ok("test order skips successfully", r.ok === true && r.expected === 125.5);
  ok("test order does not call RPC", !db.state.calls.some((c) => c.kind === "rpc"));
  ok("test order writes no collection", db.state.collections.length === 0);
}

{
  const db = makeDb({ orderMissing: true });
  const r = await captureCodOnDelivered(db.client as never, { restaurantId: RESTAURANT_ID, orderId: ORDER_ID });

  ok("missing order returns order_not_found", r.ok === false && r.error === "order_not_found");
  ok("missing order does not call RPC", !db.state.calls.some((c) => c.kind === "rpc"));
}

{
  const db = makeDb();
  const first = await captureCodOnDelivered(db.client as never, { restaurantId: RESTAURANT_ID, orderId: ORDER_ID });
  const second = await captureCodOnDelivered(db.client as never, { restaurantId: RESTAURANT_ID, orderId: ORDER_ID, cashCollected: 130 });

  ok("first idempotent capture succeeds", first.ok === true);
  ok("second idempotent capture succeeds", second.ok === true && second.collected === 130);
  ok("second capture does not duplicate collection row", db.state.collections.length === 1);
  ok("second capture updates same collection row", db.state.collections[0]?.cash_collected === 130);
  ok("second capture records adjusted audit", db.state.events.map((e) => e.type).join(",") === "collected,adjusted");
}

const codSource = readFileSync("lib/db/cod.ts", "utf8");
const migration = readFileSync("supabase/migrations/0093_cod_capture_atomic.sql", "utf8");
const captureSource = codSource.slice(
  codSource.indexOf("export async function captureCodOnDelivered"),
  codSource.indexOf("/**\n * Operator records / corrects", codSource.indexOf("export async function captureCodOnDelivered")),
);

ok("capture source uses mustSucceed on RPC", /mustSucceed[\s\S]*db\.rpc\("capture_cod_on_delivered_atomic"/.test(captureSource));
ok("capture source no longer writes cod_collections directly", !/from\("cod_collections"\)[\s\S]*\.(insert|update)\(/.test(captureSource));
ok("capture source no longer writes orders.payment_method directly", !/from\("orders"\)[\s\S]*update\(\{ payment_method: "cod" \}/.test(captureSource));
ok("capture source no longer writes audit directly", !/audit\(db, restaurantId/.test(captureSource));

ok("migration declares capture RPC", /create or replace function public\.capture_cod_on_delivered_atomic\(/.test(migration));
ok("migration is SECURITY DEFINER with pinned search_path", /security definer[\s\S]*set search_path = public/.test(migration));
ok("migration locks tenant-scoped order FOR UPDATE", /from public\.orders[\s\S]*restaurant_id = p_restaurant_id[\s\S]*for update/.test(migration));
ok("migration preserves idempotency with order_id conflict", /on conflict \(order_id\) do nothing/.test(migration));
ok("migration updates existing collection with tenant pin", /update public\.cod_collections[\s\S]*where id = v_collection_id[\s\S]*restaurant_id = p_restaurant_id[\s\S]*order_id = p_order_id/.test(migration));
ok("migration verifies collection update row count", /capture collection update mismatch/.test(migration));
ok("migration updates order payment method with tenant pin", /update public\.orders[\s\S]*set payment_method = 'cod'[\s\S]*restaurant_id = p_restaurant_id/.test(migration));
ok("migration verifies order update row count", /capture order update mismatch/.test(migration));
ok("migration inserts one audit event", /insert into public\.cod_cash_events/.test(migration) && /jsonb_build_object\('orderId', p_order_id, 'deliveryId', p_delivery_id\)/.test(migration));
ok("migration verifies audit insert row count", /capture audit insert mismatch/.test(migration));
ok("migration grants execute to service_role only", /revoke execute on function public\.capture_cod_on_delivered_atomic[\s\S]*from public;[\s\S]*from anon;[\s\S]*from authenticated;[\s\S]*grant\s+execute[\s\S]*to service_role;/.test(migration));
ok("migration is prepare-only", /PREPARE-ONLY/.test(migration));

console.log(`\nCOD-CAPTURE-ATOMIC PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
