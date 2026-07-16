// Proof: lib/db/orders.ts checked-write sweep.
//
// Run:
//   node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types scripts/proof-orders-checked-writes.test.ts

import { DatabaseOperationError } from "../lib/db/checked.ts";
import { ensureCustomerId, insertOrderDb, updateOrderDb } from "../lib/db/orders.ts";
import type { LocalOrder } from "../lib/types.ts";

type PgError = { code: string; message: string; details: string; hint: string };
type DbResult = { data: unknown; error: PgError | null };
type Step = { op: "upsert" | "insert" | "update"; result: DbResult };
type Call = {
  table: string;
  op: "upsert" | "insert" | "update";
  row?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  filters: Array<{ key: string; value: unknown }>;
  selected?: string;
};

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

function pgError(message: string, code = "XX000"): PgError {
  return { code, message, details: "", hint: "" };
}

function sampleOrder(overrides: Partial<LocalOrder> = {}): LocalOrder {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    orderNumber: "1001",
    conversationId: "22222222-2222-4222-8222-222222222222",
    customerId: "customer-1",
    customerName: "Customer",
    customerPhone: "+966500000000",
    source: "whatsapp",
    branchId: "33333333-3333-4333-8333-333333333333",
    branchName: "Main",
    fulfillmentType: "delivery",
    deliveryAreaId: "44444444-4444-4444-8444-444444444444",
    deliveryAddress: "Street 1",
    lat: null,
    lng: null,
    items: [],
    subtotal: 100,
    deliveryFee: 10,
    total: 110,
    currency: "SAR",
    paymentStatus: "unpaid",
    paymentMethod: "cod",
    orderStatus: "pending_confirmation",
    kitchenStatus: "new",
    isTest: false,
    posStatus: "not_entered",
    posReference: null,
    posEnteredBy: null,
    notes: "note",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    events: [],
    ...overrides,
  };
}

function makeClient(steps: Step[]) {
  const pending = [...steps];
  const calls: Call[] = [];

  function next(op: Step["op"]): DbResult {
    const step = pending.shift();
    if (!step) throw new Error(`unexpected ${op}: no scripted DB result`);
    if (step.op !== op) throw new Error(`unexpected ${op}: next scripted op is ${step.op}`);
    return step.result;
  }

  const client = {
    from(table: string) {
      const state: Call = { table, op: "insert", filters: [] };
      const builder: Record<string, unknown> = {};

      builder.upsert = (row: Record<string, unknown>) => {
        state.op = "upsert";
        state.row = row;
        return builder;
      };

      builder.insert = (row: Record<string, unknown>) => {
        state.op = "insert";
        state.row = row;
        return builder;
      };

      builder.update = (payload: Record<string, unknown>) => {
        state.op = "update";
        state.payload = payload;
        return builder;
      };

      builder.eq = (key: string, value: unknown) => {
        state.filters.push({ key, value });
        return builder;
      };

      builder.select = (selected: string) => {
        state.selected = selected;
        return builder;
      };

      builder.single = async () => {
        calls.push({ ...state, filters: [...state.filters] });
        return next(state.op);
      };

      builder.maybeSingle = async () => {
        calls.push({ ...state, filters: [...state.filters] });
        return next(state.op);
      };

      builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        calls.push({ ...state, filters: [...state.filters] });
        return Promise.resolve(next(state.op)).then(resolve, reject);
      };

      return builder;
    },
  };

  return { client, calls, pending };
}

async function catches(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return null;
  } catch (error) {
    return error;
  }
}

const noPhone = makeClient([]);
const noPhoneCustomer = await ensureCustomerId(noPhone.client as never, "restaurant-1", "", "No Phone");
ok("ensureCustomerId empty phone returns null", noPhoneCustomer === null);
ok("ensureCustomerId empty phone performs no DB call", noPhone.calls.length === 0);

const customerSuccess = makeClient([
  { op: "upsert", result: { data: { id: "customer-1" }, error: null } },
]);
const customerId = await ensureCustomerId(customerSuccess.client as never, "restaurant-1", "+966500000000", "Customer");
const customerCall = customerSuccess.calls[0];
ok("ensureCustomerId success returns id", customerId === "customer-1");
ok("ensureCustomerId uses upsert select id", customerCall?.op === "upsert" && customerCall.selected === "id");

const customerNoRow = makeClient([
  { op: "upsert", result: { data: null, error: null } },
]);
const noRowCustomer = await ensureCustomerId(customerNoRow.client as never, "restaurant-1", "+966500000001", "Customer");
ok("ensureCustomerId genuine no-row remains null", noRowCustomer === null);

const customerDbError = makeClient([
  { op: "upsert", result: { data: null, error: pgError("customer upsert rejected", "23505") } },
]);
const customerError = await catches(() => ensureCustomerId(customerDbError.client as never, "restaurant-1", "+966500000002", "Customer"));
ok("ensureCustomerId DB error throws DatabaseOperationError", customerError instanceof DatabaseOperationError);

const insertSuccess = makeClient([
  { op: "insert", result: { data: [{ id: "order-1" }], error: null } },
]);
await insertOrderDb(insertSuccess.client as never, "restaurant-1", sampleOrder({ id: "order-1" }), "customer-1");
const insertCall = insertSuccess.calls[0];
ok("insertOrderDb success returns normally", insertSuccess.pending.length === 0);
ok("insertOrderDb inserts expected order columns", insertCall?.row?.id === "order-1" && insertCall.row.restaurant_id === "restaurant-1");
ok("insertOrderDb selects id for exact row assertion", insertCall?.selected === "id");

const insertDbError = makeClient([
  { op: "insert", result: { data: null, error: pgError("order insert rejected", "42501") } },
]);
const insertError = await catches(() => insertOrderDb(insertDbError.client as never, "restaurant-1", sampleOrder({ id: "order-2" }), null));
ok("insertOrderDb DB error throws DatabaseOperationError", insertError instanceof DatabaseOperationError);

const insertZeroRows = makeClient([
  { op: "insert", result: { data: [], error: null } },
]);
const insertZeroError = await catches(() => insertOrderDb(insertZeroRows.client as never, "restaurant-1", sampleOrder({ id: "order-3" }), null));
ok("insertOrderDb zero-row insert throws DatabaseOperationError", insertZeroError instanceof DatabaseOperationError);

const updateSuccess = makeClient([
  { op: "update", result: { data: [{ id: "order-1" }], error: null } },
]);
await updateOrderDb(updateSuccess.client as never, "order-1", { order_status: "confirmed", payment_status: "paid" });
const updateCall = updateSuccess.calls[0];
ok("updateOrderDb success returns normally", updateSuccess.pending.length === 0);
ok("updateOrderDb scopes update by id", updateCall?.filters.some((filter) => filter.key === "id" && filter.value === "order-1") === true);
ok("updateOrderDb selects id for exact row assertion", updateCall?.selected === "id");

const updateDbError = makeClient([
  { op: "update", result: { data: null, error: pgError("order update rejected", "42501") } },
]);
const updateError = await catches(() => updateOrderDb(updateDbError.client as never, "order-1", { payment_status: "failed" }));
ok("updateOrderDb DB error throws DatabaseOperationError", updateError instanceof DatabaseOperationError);

const updateZeroRows = makeClient([
  { op: "update", result: { data: [], error: null } },
]);
const updateZeroError = await catches(() => updateOrderDb(updateZeroRows.client as never, "missing-order", { order_status: "cancelled" }));
ok("updateOrderDb zero-row update throws DatabaseOperationError", updateZeroError instanceof DatabaseOperationError);
ok("zero-row update error uses row-count mismatch code", (updateZeroError as DatabaseOperationError | null)?.code === "KIVO_ROW_COUNT_MISMATCH");

console.log(`\nORDERS-CHECKED-WRITES PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
