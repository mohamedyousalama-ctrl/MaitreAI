// Proof for delivery/payment checked writes from the #508 Supabase-write debt map.
// Run: node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types scripts/proof-delivery-payment-checked-writes.test.ts

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { __setTestAdminClient } from "../lib/supabase/admin.ts";
import {
  assignDeliveriesToRun,
  assignDriver,
  setDriverActive,
  updateDriver,
} from "../lib/db/delivery.ts";

const require = createRequire(import.meta.url);
const { ESLint } = require("eslint") as typeof import("eslint");

const RESTAURANT_ID = "restaurant-1";
const DRIVER_ID = "driver-1";
const DELIVERY_ID = "delivery-1";
const DELIVERY_ID_2 = "delivery-2";

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
type Call = { table: string; op: string; payload?: unknown; filters: Row[]; selected: string | null };

function makeState() {
  return {
    drivers: [
      { id: DRIVER_ID, restaurant_id: RESTAURANT_ID, name: "Noura", phone: "+15550000000", active: true, vehicle: null },
    ] as Row[],
    deliveries: [
      { id: DELIVERY_ID, restaurant_id: RESTAURANT_ID, order_id: "order-1", driver_id: null, driver_token: null, customer_token: null, status: "pending" },
      { id: DELIVERY_ID_2, restaurant_id: RESTAURANT_ID, order_id: "order-2", driver_id: null, driver_token: null, customer_token: null, status: "pending" },
    ] as Row[],
    orders: [
      { id: "order-1", restaurant_id: RESTAURANT_ID, order_number: 1, items: [{ quantity: 1, name: "Cake" }], total: 10, currency: "SAR", address: "A", zone_id: null, customer_id: "customer-1" },
      { id: "order-2", restaurant_id: RESTAURANT_ID, order_number: 2, items: [{ quantity: 1, name: "Tea" }], total: 12, currency: "SAR", address: "B", zone_id: null, customer_id: "customer-1" },
    ] as Row[],
    customers: [{ id: "customer-1", phone: "+15551111111" }] as Row[],
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
  if (table === "delivery_runs") return state.deliveryRuns;
  if (table === "delivery_events") return state.events;
  return [];
}

function makeClient(options: { zeroDriverUpdate?: boolean; zeroDeliveryUpdate?: boolean; eventInsertError?: boolean } = {}) {
  const state = makeState();
  const resultFor = (q: Row, single: boolean) => {
    state.calls.push({ table: q.table, op: q.op, payload: q.payload, filters: [...q.filters], selected: q.selected ?? null });

    if (q.op === "select") {
      const rows = pickTable(state, q.table).filter((row) => matches(row, q.filters));
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }

    if (q.op === "update") {
      const rows = options.zeroDriverUpdate && q.table === "drivers"
        ? []
        : options.zeroDeliveryUpdate && q.table === "deliveries"
          ? []
          : pickTable(state, q.table).filter((row) => matches(row, q.filters));
      for (const row of rows) Object.assign(row, q.payload);
      return { data: q.selected ? rows.map((row) => ({ id: row.id })) : null, error: null };
    }

    if (q.op === "insert" && q.table === "delivery_events") {
      if (options.eventInsertError) {
        return { data: null, error: { code: "DB_FAIL", message: "event insert rejected", details: "", hint: "" } };
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
    const q: Row = { table, op: "select", payload: null, filters: [] as Row[], selected: null as string | null };
    const b: Row = {};
    b.select = (cols?: string) => { q.selected = cols ?? null; return b; };
    b.insert = (payload: unknown) => { q.op = "insert"; q.payload = payload; return b; };
    b.update = (payload: unknown) => { q.op = "update"; q.payload = payload; return b; };
    b.eq = (col: string, value: unknown) => { q.filters.push({ method: "eq", col, value }); return b; };
    b.in = (col: string, value: unknown) => { q.filters.push({ method: "in", col, value }); return b; };
    b.order = () => b;
    b.limit = () => b;
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
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function withAdminClient<T>(client: unknown, fn: () => Promise<T>): Promise<T> {
  __setTestAdminClient(client);
  try {
    return await fn();
  } finally {
    __setTestAdminClient(undefined);
  }
}

{
  const harness = makeClient({ zeroDriverUpdate: true });
  const error = await withAdminClient(harness.client, () =>
    catchMessage(() => setDriverActive({} as never, RESTAURANT_ID, DRIVER_ID, false)));
  ok("setDriverActive zero-row update throws", error?.includes("KIVO_ROW_COUNT_MISMATCH") === true);
  ok("setDriverActive zero-row does not mutate", harness.state.drivers[0].active === true);
}

{
  const harness = makeClient();
  const error = await withAdminClient(harness.client, () =>
    catchMessage(() => setDriverActive({} as never, RESTAURANT_ID, DRIVER_ID, false)));
  ok("setDriverActive one-row happy path succeeds", error === null && harness.state.drivers[0].active === false);
}

{
  const harness = makeClient({ zeroDriverUpdate: true });
  const error = await withAdminClient(harness.client, () =>
    catchMessage(() => updateDriver({} as never, RESTAURANT_ID, DRIVER_ID, { name: "Updated", phone: "200", vehicle: "bike" })));
  ok("updateDriver zero-row update throws", error?.includes("KIVO_ROW_COUNT_MISMATCH") === true);
  ok("updateDriver zero-row does not mutate", harness.state.drivers[0].name === "Noura");
}

{
  const harness = makeClient();
  const error = await withAdminClient(harness.client, () =>
    catchMessage(() => updateDriver({} as never, RESTAURANT_ID, DRIVER_ID, { name: "Updated", phone: "200", vehicle: "bike" })));
  ok("updateDriver one-row happy path succeeds", error === null && harness.state.drivers[0].name === "Updated");
}

{
  const harness = makeClient({ zeroDeliveryUpdate: true });
  const error = await catchMessage(() => assignDriver(harness.client as never, { deliveryId: DELIVERY_ID, driverId: DRIVER_ID, restaurantId: RESTAURANT_ID }));
  ok("assignDriver zero-row delivery update throws assign_failed", error === "assign_failed");
  ok("assignDriver zero-row writes no event", harness.state.events.length === 0);
}

{
  const harness = makeClient();
  const result = await assignDriver(harness.client as never, { deliveryId: DELIVERY_ID, driverId: DRIVER_ID, restaurantId: RESTAURANT_ID });
  ok("assignDriver one-row happy path succeeds", result.deliveryId === DELIVERY_ID && harness.state.deliveries[0].driver_id === DRIVER_ID);
}

{
  const harness = makeClient({ eventInsertError: true });
  const error = await catchMessage(() => assignDriver(harness.client as never, { deliveryId: DELIVERY_ID, driverId: DRIVER_ID, restaurantId: RESTAURANT_ID }));
  ok("assignDriver event insert failure throws assign_event_failed, not assign_failed", error === "assign_event_failed");
  ok("assignDriver event insert failure happens after assignment update", harness.state.deliveries[0].driver_id === DRIVER_ID);
}

{
  const harness = makeClient({ zeroDeliveryUpdate: true });
  const error = await catchMessage(() =>
    assignDeliveriesToRun(harness.client as never, { restaurantId: RESTAURANT_ID, driverId: DRIVER_ID, deliveryIds: [DELIVERY_ID, DELIVERY_ID_2] }));
  ok("assignDeliveriesToRun zero-row delivery update throws assign_failed", error === "assign_failed");
  ok("assignDeliveriesToRun zero-row writes no event", harness.state.events.length === 0);
}

{
  const harness = makeClient();
  const result = await assignDeliveriesToRun(harness.client as never, { restaurantId: RESTAURANT_ID, driverId: DRIVER_ID, deliveryIds: [DELIVERY_ID, DELIVERY_ID_2] });
  ok("assignDeliveriesToRun one-row happy path succeeds", result.stops.length === 2 && harness.state.deliveries.every((delivery) => delivery.driver_id === DRIVER_ID));
}

{
  const harness = makeClient({ eventInsertError: true });
  const error = await catchMessage(() =>
    assignDeliveriesToRun(harness.client as never, { restaurantId: RESTAURANT_ID, driverId: DRIVER_ID, deliveryIds: [DELIVERY_ID, DELIVERY_ID_2] }));
  ok("assignDeliveriesToRun event insert failure throws assign_event_failed, not assign_failed", error === "assign_event_failed");
}

const deliverySource = readFileSync("lib/db/delivery.ts", "utf8");
for (const context of [
  "delivery.set_driver_active",
  "delivery.update_driver",
  "delivery.assign",
  "delivery.assign_run_stop",
]) {
  ok(`${context} uses mustWrite exactRows:1`,
    deliverySource.includes(`"${context}"`) &&
    /mustWrite<\{ id: string \}>[\s\S]*\.select\("id"\)[\s\S]*\{\s*exactRows: 1\s*\}/.test(deliverySource));
}
ok("assign update catch is before event insert, preserving assign_event_failed",
  deliverySource.indexOf('"delivery.assign"') < deliverySource.indexOf('throw new Error("assign_failed");') &&
  deliverySource.indexOf('throw new Error("assign_failed");') < deliverySource.indexOf('throw new Error("assign_event_failed");'));
ok("run assign update catch is before run event insert, preserving assign_event_failed",
  deliverySource.indexOf('"delivery.assign_run_stop"') < deliverySource.lastIndexOf('throw new Error("assign_failed");') &&
  deliverySource.lastIndexOf('throw new Error("assign_failed");') < deliverySource.lastIndexOf('throw new Error("assign_event_failed");'));
ok("delivery_events inserts have reasoned eslint disables",
  (deliverySource.match(/eslint-disable-next-line local-rules\/no-unchecked-supabase-write -- event-log insert with explicit throw-on-error; no zero-row update hazard\./g) ?? []).length === 2);

const paymentsSource = readFileSync("lib/db/payments.ts", "utf8");
ok("payment session primary insert has reasoned eslint disable",
  paymentsSource.includes("insert with explicit throw-on-error/FK retry; no zero-row update hazard"));
ok("payment session retry insert has reasoned eslint disable",
  paymentsSource.includes("retry insert with explicit throw-on-error; no zero-row update hazard"));
ok("payment inserts remain insert-based, not mustWrite-wrapped",
  /from\("payment_sessions"\)\.insert\(row\)/.test(paymentsSource));

async function lintUncheckedWarnings(paths: string[]) {
  const eslint = new ESLint({ cwd: process.cwd(), extensions: [".ts"] });
  const results = await eslint.lintFiles(paths);
  const warnings: Array<{ file: string; line: number; column: number; message: string }> = [];
  for (const result of results) {
    for (const message of result.messages) {
      if (message.ruleId === "local-rules/no-unchecked-supabase-write") {
        warnings.push({
          file: result.filePath.replace(`${process.cwd()}/`, ""),
          line: message.line,
          column: message.column,
          message: message.message,
        });
      }
    }
  }
  return warnings;
}

const lintWarnings = await lintUncheckedWarnings(["lib/db/delivery.ts", "lib/db/payments.ts"]);
const classifiedResolved = lintWarnings.filter((warning) =>
  warning.message.includes("destructures { error }") &&
  (
    warning.file === "lib/db/payments.ts" ||
    [173, 186, 273, 279, 576, 582].includes(warning.line)
  )
);
console.log("\nTARGETED LINT WARNINGS:");
for (const warning of lintWarnings) {
  console.log(`${warning.file}:${warning.line}:${warning.column} ${warning.message}`);
}
console.log(`TARGETED_NO_UNCHECKED_TOTAL=${lintWarnings.length}`);
console.log(`TARGETED_CLASSIFIED_DROP=8->0`);
ok("targeted lint has no warnings for the 8 classified delivery/payment sites", classifiedResolved.length === 0);

console.log(`\nDELIVERY-PAYMENT-CHECKED-WRITES PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
