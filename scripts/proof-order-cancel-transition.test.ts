// WO-CANCEL-TRANSITION-GUARD proof.
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/proof-order-cancel-transition.test.ts

import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { isOrderStatus, validateOrderStatusTransition } from "../lib/orders/transitions.ts";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) pass++;
  else {
    fail++;
    console.error("  FAIL", name);
  }
}

type OrderRow = { id: string; restaurant_id: string; order_status: string | null; payment_status: string | null };

class NextResponse {
  body: string | null;
  status: number;
  _json: unknown;
  constructor(body: string | null = null, init: { status?: number } = {}) {
    this.body = body;
    this.status = init.status ?? 200;
  }
  static json(obj: unknown, init: { status?: number } = {}) {
    const response = new NextResponse(JSON.stringify(obj), init);
    response._json = obj;
    return response;
  }
  async json() {
    return this._json;
  }
}

function loadCancelPost(args: {
  order: OrderRow | null;
  refundOk?: boolean;
  refundEventId?: string;
  body?: Record<string, unknown>;
}) {
  const source = readFileSync("app/api/orders/[id]/cancel/route.ts", "utf8");
  const runnable = source
    .replace(/^import .*$/gm, "")
    .replace("export const runtime = \"nodejs\";", "")
    .replace("export async function POST", "async function POST")
    + "\nglobalThis.__POST = POST;\n";
  const js = ts.transpileModule(runnable, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const writes: Array<{ kind: string; payload?: Record<string, unknown>; filters?: Record<string, unknown> }> = [];
  const sequence: string[] = [];
  const admin = {
    from(table: string) {
      const state = { op: "select", payload: null as Record<string, unknown> | null, filters: {} as Record<string, unknown> };
      const api: Record<string, unknown> = {
        select() { return api; },
        eq(k: string, v: unknown) { state.filters[k] = v; return api; },
        update(payload: Record<string, unknown>) {
          state.op = "update";
          state.payload = payload;
          return api;
        },
        async maybeSingle() {
          if (table !== "orders") return { data: null, error: null };
          if (!args.order) return { data: null, error: null };
          if (state.filters.id && args.order.id !== state.filters.id) return { data: null, error: null };
          if (state.filters.restaurant_id && args.order.restaurant_id !== state.filters.restaurant_id) return { data: null, error: null };
          return { data: args.order, error: null };
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          if (table === "orders" && state.op === "update") {
            sequence.push("order_update");
            writes.push({ kind: "order_update", payload: state.payload ?? undefined, filters: { ...state.filters } });
          }
          return Promise.resolve({ error: null }).then(resolve, reject);
        },
      };
      return api;
    },
  };

  const context = {
    console,
    NextResponse,
    isOrderStatus,
    validateOrderStatusTransition,
    createAdminClient: () => admin,
    requireTenant: async () => ({ ok: true, tenant: { restaurantId: "restaurant-1", userId: "user-1", role: "manager" } }),
    parseRefundMetadata: () => ({ ok: true, refund: { amount: 100, method: "cash", reason: "customer request", evidence: null } }),
    recordOrderRefund: async () => {
      sequence.push("refund_record");
      writes.push({ kind: "refund_record" });
      return args.refundOk === false ? { ok: false, error: "refund_record_failed" } : { ok: true, eventId: args.refundEventId ?? "refund-event-1" };
    },
    Date,
    globalThis: {} as Record<string, unknown>,
  };
  context.globalThis = context.globalThis || {};
  vm.runInNewContext(js, context);
  const post = context.globalThis.__POST as (req: { json: () => Promise<Record<string, unknown>> }, params: { params: { id: string } }) => Promise<NextResponse>;
  const call = () => post({ json: async () => args.body ?? { amount: 100, method: "cash", reason: "customer request" } }, { params: { id: "order-1" } });
  return { call, writes, sequence };
}

async function exercise(name: string, order: OrderRow | null) {
  const harness = loadCancelPost({ order });
  const response = await harness.call();
  return { name, response, body: await response.json() as Record<string, unknown>, writes: harness.writes, sequence: harness.sequence };
}

const source = readFileSync("app/api/orders/[id]/cancel/route.ts", "utf8");
const validationIndex = source.indexOf("validateOrderStatusTransition");
const refundIndex = source.indexOf("recordOrderRefund(admin");
const updateIndex = source.indexOf(".update({ order_status: \"cancelled\"");

ok("cancel route reads current order_status from DB", /\.select\("order_status,payment_status"\)/.test(source));
ok("transition validation is before refund recording", validationIndex >= 0 && refundIndex >= 0 && validationIndex < refundIndex);
ok("transition validation is before cancel update", validationIndex >= 0 && updateIndex >= 0 && validationIndex < updateIndex);

const delivered = await exercise("delivered", { id: "order-1", restaurant_id: "restaurant-1", order_status: "delivered", payment_status: "paid" });
ok("delivered -> cancel is rejected with 409", delivered.response.status === 409 && delivered.body.error === "illegal_transition");
ok("rejected delivered cancel writes no refund event", !delivered.writes.some((write) => write.kind === "refund_record"));
ok("rejected delivered cancel writes no order update", !delivered.writes.some((write) => write.kind === "order_update"));

const alreadyCancelled = await exercise("already cancelled", { id: "order-1", restaurant_id: "restaurant-1", order_status: "cancelled", payment_status: "paid" });
ok("already-cancelled -> cancel is rejected with 409", alreadyCancelled.response.status === 409 && alreadyCancelled.body.error === "illegal_transition");
ok("rejected already-cancelled cancel writes nothing", alreadyCancelled.writes.length === 0);

const preparingPaid = await exercise("preparing paid", { id: "order-1", restaurant_id: "restaurant-1", order_status: "preparing", payment_status: "paid" });
ok("preparing -> cancel succeeds", preparingPaid.response.status === 200);
ok("preparing paid cancel records refund before status flip", preparingPaid.sequence.join(">") === "refund_record>order_update");
ok("preparing paid cancel updates order to cancelled/refunded", preparingPaid.writes.some((write) => write.kind === "order_update" && write.payload?.order_status === "cancelled" && write.payload?.payment_status === "refunded"));

const readyUnpaid = await exercise("ready unpaid", { id: "order-1", restaurant_id: "restaurant-1", order_status: "ready", payment_status: "unpaid" });
ok("ready -> cancel succeeds", readyUnpaid.response.status === 200);
ok("ready unpaid cancel does not record refund", !readyUnpaid.writes.some((write) => write.kind === "refund_record"));
ok("ready unpaid cancel preserves unpaid payment status", readyUnpaid.writes.some((write) => write.kind === "order_update" && write.payload?.order_status === "cancelled" && write.payload?.payment_status === "unpaid"));

console.log(`\nORDER-CANCEL-TRANSITION PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
