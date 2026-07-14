// WO-DELIVERY-ASSIGNMENT-ADMIN proof.
// Run: node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types scripts/proof-delivery-assignment-admin.test.ts

import { readFileSync } from "node:fs";
import { assignDriver, assignDeliveriesToRun } from "../lib/db/delivery.ts";

const RESTAURANT_ID = "restaurant-1";
const OTHER_RESTAURANT_ID = "restaurant-2";
const DRIVER_ID = "driver-1";
const DELIVERY_ID = "delivery-1";
const DELIVERY_ID_2 = "delivery-2";
const OTHER_DELIVERY_ID = "delivery-other";

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
type ClientKind = "member" | "admin";
type Call = { kind: ClientKind; table: string; op: string; payload?: unknown; filters: Row[] };

function makeState() {
  return {
    drivers: [
      { id: DRIVER_ID, restaurant_id: RESTAURANT_ID, name: "Noura", phone: "+15550000000", active: true },
      { id: "driver-other", restaurant_id: OTHER_RESTAURANT_ID, name: "Other", phone: "+15559999999", active: true },
    ] as Row[],
    deliveries: [
      { id: DELIVERY_ID, restaurant_id: RESTAURANT_ID, order_id: "order-1", driver_id: null, driver_token: null, customer_token: null, status: "pending" },
      { id: DELIVERY_ID_2, restaurant_id: RESTAURANT_ID, order_id: "order-2", driver_id: null, driver_token: null, customer_token: null, status: "pending" },
      { id: OTHER_DELIVERY_ID, restaurant_id: OTHER_RESTAURANT_ID, order_id: "order-other", driver_id: null, driver_token: null, customer_token: null, status: "pending" },
    ] as Row[],
    orders: [
      { id: "order-1", restaurant_id: RESTAURANT_ID, order_number: 1, items: [{ quantity: 1, name: "Cake" }], total: 10, currency: "SAR", address: "A", zone_id: null, customer_id: "customer-1" },
      { id: "order-2", restaurant_id: RESTAURANT_ID, order_number: 2, items: [{ quantity: 1, name: "Tea" }], total: 12, currency: "SAR", address: "B", zone_id: null, customer_id: "customer-1" },
    ] as Row[],
    customers: [{ id: "customer-1", phone: "+15551111111" }] as Row[],
    restaurants: [{ id: RESTAURANT_ID, feature_flags: { delivery_runs: true }, wa_configured_at: null }] as Row[],
    deliveryRuns: [] as Row[],
    events: [] as Row[],
    calls: [] as Call[],
  };
}

function matches(row: Row, filters: Row[]): boolean {
  return filters.every((filter) => {
    if (filter.method === "eq") return row[filter.col] === filter.value;
    if (filter.method === "in") return Array.isArray(filter.value) && filter.value.includes(row[filter.col]);
    return true;
  });
}

function pickTable(state: ReturnType<typeof makeState>, table: string): Row[] {
  if (table === "drivers") return state.drivers;
  if (table === "deliveries") return state.deliveries;
  if (table === "orders") return state.orders;
  if (table === "customers") return state.customers;
  if (table === "restaurants") return state.restaurants;
  if (table === "delivery_runs") return state.deliveryRuns;
  if (table === "delivery_events") return state.events;
  return [];
}

function makeClient(kind: ClientKind, state = makeState()) {
  const resultFor = (q: Row, single: boolean) => {
    state.calls.push({ kind, table: q.table, op: q.op, payload: q.payload, filters: [...q.filters] });

    if (q.op === "select") {
      const rows = pickTable(state, q.table).filter((row) => matches(row, q.filters));
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }

    if (q.op === "update" && q.table === "deliveries") {
      if (kind === "member") {
        return { data: null, error: { code: "42501", message: "new row violates row-level security policy" } };
      }
      const rows = state.deliveries.filter((row) => matches(row, q.filters));
      for (const row of rows) Object.assign(row, q.payload);
      return { data: rows, error: null };
    }

    if (q.op === "insert" && q.table === "delivery_events") {
      if (kind === "member") {
        return { data: null, error: { code: "42501", message: "new row violates row-level security policy" } };
      }
      state.events.push(q.payload as Row);
      return { data: q.payload, error: null };
    }

    if (q.op === "insert" && q.table === "delivery_runs") {
      const row = { id: `run-${state.deliveryRuns.length + 1}`, ...(q.payload as Row) };
      state.deliveryRuns.push(row);
      return { data: single ? { id: row.id } : [{ id: row.id }], error: null };
    }

    return { data: single ? null : [], error: null };
  };

  const from = (table: string) => {
    const q: Row = { table, op: "select", payload: null, filters: [] as Row[] };
    const b: Row = {};
    b.select = () => { q.op = q.op || "select"; return b; };
    b.insert = (payload: unknown) => { q.op = "insert"; q.payload = payload; return b; };
    b.update = (payload: unknown) => { q.op = "update"; q.payload = payload; return b; };
    b.eq = (col: string, value: unknown) => { q.filters.push({ method: "eq", col, value }); return b; };
    b.in = (col: string, value: unknown) => { q.filters.push({ method: "in", col, value }); return b; };
    b.single = async () => resultFor(q, true);
    b.maybeSingle = async () => resultFor(q, true);
    b.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(resultFor(q, false)).then(resolve, reject);
    return b;
  };

  return { client: { from }, state };
}

async function catchMessage(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const singleRoute = readFileSync("app/api/deliveries/[id]/assign/route.ts", "utf8");
const runRoute = readFileSync("app/api/deliveries/assign-run/route.ts", "utf8");
const delivery = readFileSync("lib/db/delivery.ts", "utf8");

ok("single assign route imports createAdminClient", /import \{ createAdminClient \} from "@\/lib\/supabase\/admin";/.test(singleRoute));
ok("single assign route no longer imports member createClient", !/from "@\/lib\/supabase\/server"/.test(singleRoute));
ok("single assign route keeps requireTenant before admin acquisition",
  singleRoute.indexOf("const gate = await requireTenant();") > -1 &&
  singleRoute.indexOf("const admin = createAdminClient();") > singleRoute.indexOf("const gate = await requireTenant();"));
ok("single assign route returns 503 on missing admin", /if \(!admin\) return NextResponse\.json\(\{ error: "not_configured" \}, \{ status: 503 \}\);/.test(singleRoute));
ok("single assign route passes admin client to assignDriver", /assignDriver\(admin, \{ deliveryId: params\.id, driverId, restaurantId: tenant\.restaurantId \}\)/.test(singleRoute));

ok("run assign route imports createAdminClient", /import \{ createAdminClient \} from "@\/lib\/supabase\/admin";/.test(runRoute));
ok("run assign route no longer imports member createClient", !/from "@\/lib\/supabase\/server"/.test(runRoute));
ok("run assign route keeps requireTenant before admin acquisition",
  runRoute.indexOf("const gate = await requireTenant();") > -1 &&
  runRoute.indexOf("const admin = createAdminClient();") > runRoute.indexOf("const gate = await requireTenant();"));
ok("run assign route reads feature flags through admin with tenant id", /admin\.from\("restaurants"\)\.select\("feature_flags"\)\.eq\("id", tenant\.restaurantId\)/.test(runRoute));
ok("run assign route passes admin client to assignDeliveriesToRun", /assignDeliveriesToRun\(admin, \{ restaurantId: tenant\.restaurantId, driverId, deliveryIds \}\)/.test(runRoute));

ok("single assignment update is tenant-pinned", /\.from\("deliveries"\)[\s\S]*\.update\(\{ driver_id: driverId[\s\S]*\.eq\("id", deliveryId\)[\s\S]*\.eq\("restaurant_id", restaurantId\)/.test(delivery));
ok("run assignment update is tenant-pinned", /\.from\("deliveries"\)[\s\S]*run_id: runId[\s\S]*\.eq\("id", id\)[\s\S]*\.eq\("restaurant_id", restaurantId\)/.test(delivery));

const memberSingle = makeClient("member");
const memberSingleErr = await catchMessage(() =>
  assignDriver(memberSingle.client as never, { deliveryId: DELIVERY_ID, driverId: DRIVER_ID, restaurantId: RESTAURANT_ID })
);
ok("member-client single assignment is blocked under simulated 0091", memberSingleErr === "assign_failed");
ok("blocked member single assignment does not mutate delivery", memberSingle.state.deliveries.find((d) => d.id === DELIVERY_ID)?.driver_id == null);
ok("blocked member single assignment writes no event", memberSingle.state.events.length === 0);

const adminSingle = makeClient("admin");
const single = await assignDriver(adminSingle.client as never, { deliveryId: DELIVERY_ID, driverId: DRIVER_ID, restaurantId: RESTAURANT_ID });
const assigned = adminSingle.state.deliveries.find((d) => d.id === DELIVERY_ID);
const singleUpdate = adminSingle.state.calls.find((c) => c.table === "deliveries" && c.op === "update" && (c.payload as Row | undefined)?.driver_id === DRIVER_ID);
ok("admin-client single assignment succeeds", single.deliveryId === DELIVERY_ID && assigned?.driver_id === DRIVER_ID && assigned?.status === "assigned");
ok("admin-client single assignment records event", adminSingle.state.events.some((e) => e.delivery_id === DELIVERY_ID && e.type === "assigned"));
ok("admin-client single assignment update carries restaurant_id filter", singleUpdate?.filters.some((f) => f.method === "eq" && f.col === "restaurant_id" && f.value === RESTAURANT_ID) === true);

const crossSingle = makeClient("admin");
const crossSingleErr = await catchMessage(() =>
  assignDriver(crossSingle.client as never, { deliveryId: OTHER_DELIVERY_ID, driverId: DRIVER_ID, restaurantId: RESTAURANT_ID })
);
ok("cross-tenant single assignment is rejected", crossSingleErr === "delivery_not_found");
ok("cross-tenant single assignment does not mutate other tenant row", crossSingle.state.deliveries.find((d) => d.id === OTHER_DELIVERY_ID)?.driver_id == null);

const memberRun = makeClient("member");
const memberRunErr = await catchMessage(() =>
  assignDeliveriesToRun(memberRun.client as never, { restaurantId: RESTAURANT_ID, driverId: DRIVER_ID, deliveryIds: [DELIVERY_ID, DELIVERY_ID_2] })
);
ok("member-client run assignment is blocked under simulated 0091", memberRunErr === "assign_failed");
ok("blocked member run assignment does not mutate deliveries", memberRun.state.deliveries.filter((d) => d.restaurant_id === RESTAURANT_ID).every((d) => d.driver_id == null));
ok("blocked member run assignment writes no delivery event", memberRun.state.events.length === 0);

const adminRun = makeClient("admin");
const run = await assignDeliveriesToRun(adminRun.client as never, { restaurantId: RESTAURANT_ID, driverId: DRIVER_ID, deliveryIds: [DELIVERY_ID, DELIVERY_ID_2] });
const runUpdates = adminRun.state.calls.filter((c) => c.table === "deliveries" && c.op === "update" && (c.payload as Row | undefined)?.run_id);
ok("admin-client run assignment succeeds", run.stops.length === 2 && adminRun.state.deliveries.filter((d) => d.run_id === run.runId).length === 2);
ok("admin-client run assignment records one event per stop", adminRun.state.events.filter((e) => e.type === "assigned" && e.payload?.runId === run.runId).length === 2);
ok("admin-client run assignment updates carry restaurant_id filter", runUpdates.length === 2 && runUpdates.every((c) => c.filters.some((f) => f.method === "eq" && f.col === "restaurant_id" && f.value === RESTAURANT_ID)));

const crossRun = makeClient("admin");
const crossRunErr = await catchMessage(() =>
  assignDeliveriesToRun(crossRun.client as never, { restaurantId: RESTAURANT_ID, driverId: DRIVER_ID, deliveryIds: [OTHER_DELIVERY_ID] })
);
ok("cross-tenant run assignment is rejected", crossRunErr === "delivery_not_found");
ok("cross-tenant run assignment does not mutate other tenant row", crossRun.state.deliveries.find((d) => d.id === OTHER_DELIVERY_ID)?.driver_id == null);

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} delivery-assignment-admin: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
