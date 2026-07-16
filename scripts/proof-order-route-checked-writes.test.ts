// Priority-1 proof: order money/state routes must not report success on zero-row writes.
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/proof-order-route-checked-writes.test.ts

import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { DatabaseOperationError, mustWrite } from "../lib/db/checked.ts";
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

type UpdateMode = "one-row" | "zero-row" | "db-error";
type OrderRow = { id: string; restaurant_id: string; order_status: string | null; payment_status: string | null };

function loadRoute(path: string, args: { order?: OrderRow | null; updateMode: UpdateMode; body?: Record<string, unknown> }) {
  const source = readFileSync(path, "utf8");
  const runnable = source
    .replace(/^import .*$/gm, "")
    .replace("export const runtime = \"nodejs\";", "")
    .replace("export async function POST", "async function POST")
    + "\nglobalThis.__POST = POST;\n";
  const js = ts.transpileModule(runnable, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const writes: Array<{ payload?: Record<string, unknown>; filters: Record<string, unknown>; selected: string | null }> = [];
  const admin = {
    from(table: string) {
      const state = {
        op: "select",
        payload: null as Record<string, unknown> | null,
        filters: {} as Record<string, unknown>,
        selected: null as string | null,
      };
      const api: Record<string, unknown> = {
        select(cols?: string) {
          state.selected = cols ?? null;
          return api;
        },
        eq(k: string, v: unknown) {
          state.filters[k] = v;
          return api;
        },
        update(payload: Record<string, unknown>) {
          state.op = "update";
          state.payload = payload;
          return api;
        },
        async maybeSingle() {
          if (table !== "orders") return { data: null, error: null };
          const order = args.order ?? null;
          if (!order) return { data: null, error: null };
          if (state.filters.id && order.id !== state.filters.id) return { data: null, error: null };
          if (state.filters.restaurant_id && order.restaurant_id !== state.filters.restaurant_id) return { data: null, error: null };
          return { data: order, error: null };
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          if (table === "orders" && state.op === "update") {
            writes.push({ payload: state.payload ?? undefined, filters: { ...state.filters }, selected: state.selected });
            const result =
              args.updateMode === "one-row" ? { data: [{ id: String(state.filters.id ?? "order-1") }], error: null }
                : args.updateMode === "zero-row" ? { data: [], error: null }
                  : { data: null, error: { code: "DB_FAIL", message: "mock db failure", details: "", hint: "" } };
            return Promise.resolve(result).then(resolve, reject);
          }
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        },
      };
      return api;
    },
  };

  const context = {
    console,
    NextResponse,
    DatabaseOperationError,
    mustWrite,
    isOrderStatus,
    validateOrderStatusTransition,
    createAdminClient: () => admin,
    requireTenant: async () => ({ ok: true, tenant: { restaurantId: "restaurant-1", userId: "user-1", role: "manager" } }),
    parseRefundMetadata: () => ({ ok: true, refund: { amount: 100, method: "cash", reason: "customer request", evidence: null } }),
    recordOrderRefund: async () => ({ ok: true, eventId: "refund-event-1" }),
    checkOrderSafetyHold: async () => ({ held: false }),
    Date,
    globalThis: {} as Record<string, unknown>,
  };
  vm.runInNewContext(js, context);
  const post = context.globalThis.__POST as (req: { json: () => Promise<Record<string, unknown>> }, params: { params: { id: string } }) => Promise<NextResponse>;
  const call = () => post({ json: async () => args.body ?? {} }, { params: { id: "order-1" } });
  return { call, writes };
}

async function routeCase(path: string, args: { order?: OrderRow | null; updateMode: UpdateMode; body?: Record<string, unknown> }) {
  const harness = loadRoute(path, args);
  const response = await harness.call();
  return { response, body: await response.json() as Record<string, unknown>, writes: harness.writes };
}

const cancelPath = "app/api/orders/[id]/cancel/route.ts";
const paymentPath = "app/api/orders/[id]/payment/route.ts";
const cancelSource = readFileSync(cancelPath, "utf8");
const paymentSource = readFileSync(paymentPath, "utf8");

for (const [label, source, context] of [
  ["cancel", cancelSource, "orders.cancel"],
  ["payment", paymentSource, "orders.payment_update"],
] as const) {
  ok(`${label}: imports checked write helper`, /import \{ DatabaseOperationError, mustWrite \} from "@\/lib\/db\/checked";/.test(source));
  ok(`${label}: update is wrapped in mustWrite`, source.includes(`"${context}"`) && /mustWrite<\{ id: string \}>/.test(source));
  ok(`${label}: update returns rows via .select("id")`, /\.eq\("restaurant_id", tenant\.restaurantId\)[\s\S]*\.select\("id"\)/.test(source));
  ok(`${label}: mustWrite asserts exactly one row`, /\{\s*exactRows: 1\s*\}/.test(source));
  ok(`${label}: row-count mismatch maps to order_not_found`, source.includes("KIVO_ROW_COUNT_MISMATCH") && source.includes('error: "order_not_found"'));
}

// CONTROL: the old unchecked pattern saw error:null on zero affected rows, so it would not fail.
const oldUncheckedZeroRowResult = { data: [] as { id: string }[], error: null };
ok("CONTROL: old unchecked zero-row update has error:null and can look successful",
  oldUncheckedZeroRowResult.error === null && oldUncheckedZeroRowResult.data.length === 0);

const existingOrder = { id: "order-1", restaurant_id: "restaurant-1", order_status: "ready", payment_status: "unpaid" };

{
  const r = await routeCase(cancelPath, { order: existingOrder, updateMode: "zero-row" });
  ok("cancel: zero-row update returns 404", r.response.status === 404);
  ok("cancel: zero-row update returns order_not_found, never ok:true", r.body.error === "order_not_found" && r.body.ok !== true);
  ok("cancel: tenant pins remain on write", r.writes[0]?.filters.id === "order-1" && r.writes[0]?.filters.restaurant_id === "restaurant-1");
}

{
  const r = await routeCase(paymentPath, { updateMode: "zero-row", body: { paymentStatus: "unpaid" } });
  ok("payment: zero-row update returns 404", r.response.status === 404);
  ok("payment: zero-row update returns order_not_found, never ok:true", r.body.error === "order_not_found" && r.body.ok !== true);
  ok("payment: tenant pins remain on write", r.writes[0]?.filters.id === "order-1" && r.writes[0]?.filters.restaurant_id === "restaurant-1");
}

{
  const r = await routeCase(cancelPath, { order: existingOrder, updateMode: "one-row" });
  ok("cancel: one-row update keeps happy-path ok:true", r.response.status === 200 && r.body.ok === true);
}

{
  const r = await routeCase(paymentPath, { updateMode: "one-row", body: { paymentStatus: "unpaid" } });
  ok("payment: one-row update keeps happy-path ok:true", r.response.status === 200 && r.body.ok === true);
}

{
  const r = await routeCase(cancelPath, { order: existingOrder, updateMode: "db-error" });
  ok("cancel: real DB error still maps to update_failed 502", r.response.status === 502 && r.body.error === "update_failed");
}

{
  const r = await routeCase(paymentPath, { updateMode: "db-error", body: { paymentStatus: "unpaid" } });
  ok("payment: real DB error still maps to update_failed 502", r.response.status === 502 && r.body.error === "update_failed");
}

console.log(`\nORDER-ROUTE-CHECKED-WRITES PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
