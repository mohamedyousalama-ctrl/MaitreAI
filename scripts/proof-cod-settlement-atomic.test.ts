// WO-COD-SETTLEMENT-ATOMIC proof.
// Run: node --conditions=react-server --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/proof-cod-settlement-atomic.test.ts

import { settleDriver } from "../lib/db/cod.ts";

const RESTAURANT_ID = "rest-1";
const DRIVER_ID = "driver-1";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) pass++;
  else {
    fail++;
    console.error("  FAIL", name);
  }
}

type Row = Record<string, any>;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function makeDb(opts: { updateFails?: boolean; rpcFails?: boolean } = {}) {
  const state = {
    collections: [
      {
        id: "col-1",
        restaurant_id: RESTAURANT_ID,
        driver_id: DRIVER_ID,
        driver_name: "Noura",
        cash_collected: 70,
        settlement_status: "held_by_driver",
        settlement_id: null,
        settled_at: null,
      },
      {
        id: "col-2",
        restaurant_id: RESTAURANT_ID,
        driver_id: DRIVER_ID,
        driver_name: "Noura",
        cash_collected: 55,
        settlement_status: "held_by_driver",
        settlement_id: null,
        settled_at: null,
      },
    ] as Row[],
    settlements: [] as Row[],
    events: [] as Row[],
    updateFails: opts.updateFails === true,
    rpcFails: opts.rpcFails === true,
  };

  const heldForDriver = () =>
    state.collections.filter(
      (r) =>
        r.restaurant_id === RESTAURANT_ID &&
        r.driver_id === DRIVER_ID &&
        r.settlement_status === "held_by_driver"
    );

  const atomicRpc = async (name: string, params: Row) => {
    if (name !== "settle_cod_driver_atomic") {
      return { data: null, error: { message: `unexpected rpc ${name}` } };
    }
    if (state.rpcFails) return { data: null, error: { message: "simulated atomic failure" } };
    if (params.p_restaurant_id !== RESTAURANT_ID || params.p_driver_id !== DRIVER_ID) {
      return { data: { total: 0, order_count: 0, settlement_id: null }, error: null };
    }
    const rows = heldForDriver();
    if (!rows.length) return { data: { total: 0, order_count: 0, settlement_id: null }, error: null };

    const settlementId = `settlement-${state.settlements.length + 1}`;
    const total = round2(rows.reduce((sum, r) => sum + Number(r.cash_collected ?? 0), 0));
    state.settlements.push({
      id: settlementId,
      restaurant_id: RESTAURANT_ID,
      driver_id: DRIVER_ID,
      driver_name: rows.find((r) => r.driver_name)?.driver_name ?? null,
      total_amount: total,
      order_count: rows.length,
      settled_by: params.p_settled_by ?? null,
      settled_by_role: params.p_settled_by_role ?? null,
      note: params.p_note ?? null,
    });
    for (const row of rows) {
      row.settlement_status = "settled";
      row.settlement_id = settlementId;
      row.settled_at = "2026-07-14T08:00:00.000Z";
      row.updated_at = "2026-07-14T08:00:00.000Z";
    }
    state.events.push({
      restaurant_id: RESTAURANT_ID,
      driver_id: DRIVER_ID,
      type: "settled",
      amount: total,
      actor_user_id: params.p_settled_by ?? null,
      actor_role: params.p_settled_by_role ?? null,
      payload: { settlementId, orderCount: rows.length },
    });
    return { data: { total, order_count: rows.length, settlement_id: settlementId }, error: null };
  };

  const resultFor = (q: Row, single: boolean) => {
    if (q.table === "cod_collections" && q.op === "select") {
      const rows = state.collections.filter((r) =>
        q.filters.every((f: Row) => r[f.col] === f.value)
      );
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }
    if (q.table === "cod_settlements" && q.op === "insert") {
      const row = { id: `settlement-${state.settlements.length + 1}`, ...q.payload };
      state.settlements.push(row);
      return { data: single ? { id: row.id } : [{ id: row.id }], error: null };
    }
    if (q.table === "cod_collections" && q.op === "update") {
      if (state.updateFails) return { data: null, error: { message: "simulated update failure" } };
      const rows = state.collections.filter((r) =>
        q.filters.every((f: Row) => r[f.col] === f.value)
      );
      for (const row of rows) Object.assign(row, q.payload);
      return { data: rows, error: null };
    }
    if (q.table === "cod_cash_events" && q.op === "insert") {
      state.events.push(q.payload);
      return { data: q.payload, error: null };
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

  return { client: { from, rpc: atomicRpc }, state };
}

async function legacySplitSettle(db: ReturnType<typeof makeDb>["client"]) {
  const { data: held } = await db
    .from("cod_collections")
    .select("id,driver_name,cash_collected")
    .eq("restaurant_id", RESTAURANT_ID)
    .eq("driver_id", DRIVER_ID)
    .eq("settlement_status", "held_by_driver");
  const rows = held as Array<{ id: string; driver_name: string | null; cash_collected: number | null }>;
  const total = round2(rows.reduce((s, r) => s + Number(r.cash_collected ?? 0), 0));
  const { data: settlement } = await db
    .from("cod_settlements")
    .insert({
      restaurant_id: RESTAURANT_ID,
      driver_id: DRIVER_ID,
      driver_name: rows.find((r) => r.driver_name)?.driver_name ?? null,
      total_amount: total,
      order_count: rows.length,
    })
    .select("id")
    .single();
  const settlementId = (settlement?.id as string) ?? "";
  await db
    .from("cod_collections")
    .update({ settlement_status: "settled", settlement_id: settlementId })
    .eq("restaurant_id", RESTAURANT_ID)
    .eq("driver_id", DRIVER_ID)
    .eq("settlement_status", "held_by_driver");
  await db.from("cod_cash_events").insert({
    restaurant_id: RESTAURANT_ID,
    driver_id: DRIVER_ID,
    type: "settled",
    amount: total,
    payload: { settlementId, orderCount: rows.length },
  });
}

// CONTROL: the old split-write shape half-commits if the collections update fails.
const oldDb = makeDb({ updateFails: true });
await legacySplitSettle(oldDb.client);
ok("CONTROL old split settle writes a settlement before failed update", oldDb.state.settlements.length === 1);
ok("CONTROL old split settle writes audit despite failed update", oldDb.state.events.length === 1);
ok("CONTROL old split settle leaves collections held", oldDb.state.collections.every((r) => r.settlement_status === "held_by_driver"));

// Fixed path: a mid-settlement failure must commit nothing.
const failDb = makeDb({ rpcFails: true });
const failed = await settleDriver(failDb.client as never, RESTAURANT_ID, {
  driverId: DRIVER_ID,
  settledBy: "user-1",
  settledByRole: "manager",
  note: "end shift",
});
ok("atomic settle surfaces rpc failure", failed.ok === false);
ok("atomic failed settle writes no settlement", failDb.state.settlements.length === 0);
ok("atomic failed settle writes no audit", failDb.state.events.length === 0);
ok("atomic failed settle leaves collections held", failDb.state.collections.every((r) => r.settlement_status === "held_by_driver" && !r.settlement_id));

// Normal settlement still succeeds and returns the app shape.
const goodDb = makeDb();
const good = await settleDriver(goodDb.client as never, RESTAURANT_ID, {
  driverId: DRIVER_ID,
  settledBy: "user-1",
  settledByRole: "manager",
  note: "end shift",
});
ok("normal atomic settle returns ok + total/orderCount/settlementId", good.ok === true && good.total === 125 && good.orderCount === 2 && good.settlementId === "settlement-1");
ok("normal atomic settle inserts one settlement", goodDb.state.settlements.length === 1 && goodDb.state.settlements[0].total_amount === 125);
ok("normal atomic settle flips and links all locked collections", goodDb.state.collections.every((r) => r.settlement_status === "settled" && r.settlement_id === "settlement-1"));
ok("normal atomic settle inserts settled audit", goodDb.state.events.length === 1 && goodDb.state.events[0].type === "settled" && goodDb.state.events[0].amount === 125);

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} COD-SETTLEMENT-ATOMIC PROOF: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
