import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";

import { captureCodOnDelivered } from "../lib/db/cod.ts";
import { handleMoyasarWebhook } from "../lib/payments/moyasar-webhook.ts";
import { toHalalas } from "../lib/payments/providers/moyasar.ts";

type Row = Record<string, any>;

type Effect = {
  table: string;
  action: "insert" | "update";
  rows: number;
  payload: Row | Row[];
  filters: Array<{ kind: "eq" | "neq" | "in"; column: string; value: any }>;
};

class FakeSupabase {
  tables: Record<string, Row[]>;
  effects: Effect[] = [];
  alerts: Array<{ type: string; details?: Row }> = [];

  constructor(tables: Record<string, Row[]>) {
    this.tables = tables;
  }

  from(table: string) {
    if (!this.tables[table]) {
      this.tables[table] = [];
    }
    return new FakeQuery(this, table);
  }

  async rpc(name: string, args: Row) {
    if (name !== "capture_cod_on_delivered_atomic") {
      return { data: null, error: { message: `unexpected rpc ${name}` } };
    }

    return {
      data: {
        collection_id: "cod-collection-1",
        collected: args.p_collected,
        expected: args.p_expected,
      },
      error: null,
    };
  }
}

class FakeQuery {
  private readonly db: FakeSupabase;
  private readonly table: string;
  private selectColumns: string | null = null;
  private filters: Effect["filters"] = [];
  private mutation:
    | { action: "insert"; payload: Row | Row[] }
    | { action: "update"; payload: Row }
    | null = null;
  private maxRows: number | null = null;

  constructor(db: FakeSupabase, table: string) {
    this.db = db;
    this.table = table;
  }

  select(columns = "*") {
    this.selectColumns = columns;
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push({ kind: "neq", column, value });
    return this;
  }

  in(column: string, value: any[]) {
    this.filters.push({ kind: "in", column, value });
    return this;
  }

  order() {
    return this;
  }

  limit(count: number) {
    this.maxRows = count;
    return this;
  }

  update(payload: Row) {
    this.mutation = { action: "update", payload };
    return this;
  }

  insert(payload: Row | Row[]) {
    this.mutation = { action: "insert", payload };
    return this;
  }

  upsert(payload: Row | Row[]) {
    this.mutation = { action: "insert", payload };
    return this;
  }

  async maybeSingle() {
    const result = await this.execute();
    const rows = Array.isArray(result.data) ? result.data : [];
    return { data: rows[0] ?? null, error: result.error };
  }

  async single() {
    const result = await this.execute();
    const rows = Array.isArray(result.data) ? result.data : [];
    return { data: rows[0] ?? null, error: result.error };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute() {
    if (this.mutation?.action === "insert") {
      const payloads = Array.isArray(this.mutation.payload)
        ? this.mutation.payload
        : [this.mutation.payload];

      if (this.table === "processed_payment_events") {
        const duplicate = payloads.find((payload) =>
          this.db.tables.processed_payment_events.some(
            (row) =>
              row.provider === payload.provider &&
              row.restaurant_id === payload.restaurant_id &&
              row.event_id === payload.event_id,
          ),
        );
        if (duplicate) {
          return {
            data: null,
            error: { code: "23505", message: "duplicate event" },
          };
        }
      }

      this.db.tables[this.table].push(...payloads.map((payload) => ({ ...payload })));
      this.db.effects.push({
        table: this.table,
        action: "insert",
        rows: payloads.length,
        payload: this.mutation.payload,
        filters: [...this.filters],
      });
      return { data: payloads.map((payload) => ({ ...payload })), error: null };
    }

    let rows = this.db.tables[this.table].filter((row) => this.matches(row));
    if (this.maxRows !== null) {
      rows = rows.slice(0, this.maxRows);
    }

    if (this.mutation?.action === "update") {
      for (const row of rows) {
        Object.assign(row, this.mutation.payload);
      }
      this.db.effects.push({
        table: this.table,
        action: "update",
        rows: rows.length,
        payload: this.mutation.payload,
        filters: [...this.filters],
      });
    }

    return { data: rows.map((row) => this.shape(row)), error: null };
  }

  private matches(row: Row) {
    return this.filters.every((filter) => {
      if (filter.kind === "eq") {
        return row[filter.column] === filter.value;
      }
      if (filter.kind === "neq") {
        return row[filter.column] !== filter.value;
      }
      return filter.value.includes(row[filter.column]);
    });
  }

  private shape(row: Row) {
    const shaped = { ...row };
    if (this.table === "payment_sessions" && this.selectColumns?.includes("orders(")) {
      const order = this.db.tables.orders.find((item) => item.id === row.order_id);
      shaped.orders = order
        ? {
            order_number: order.order_number,
            customers: { phone: order.customer_phone ?? null },
          }
        : null;
    }
    return shaped;
  }
}

function makePaymentDb(options: {
  orderStatus?: string;
  paymentStatus?: string;
  sessionStatus?: string;
  expiresAt?: string;
  restaurantId?: string;
  orderId?: string;
  sessionId?: string;
  providerRef?: string;
  amountMajor?: number;
}) {
  const restaurantId = options.restaurantId ?? "restaurant-a";
  const orderId = options.orderId ?? "order-a";
  const sessionId = options.sessionId ?? "session-a";
  const providerRef = options.providerRef ?? "pay-a";
  const amountMajor = options.amountMajor ?? 50;

  return new FakeSupabase({
    restaurants: [
      {
        id: restaurantId,
        feature_flags: { psp_payments: true },
        psp_webhook_secret_enc: `${restaurantId}-secret`,
      },
      {
        id: "restaurant-b",
        feature_flags: { psp_payments: true },
        psp_webhook_secret_enc: "restaurant-b-secret",
      },
    ],
    orders: [
      {
        id: orderId,
        restaurant_id: restaurantId,
        order_number: "1001",
        total: amountMajor,
        currency: "SAR",
        payment_method: "mada",
        payment_status: options.paymentStatus ?? "unpaid",
        order_status: options.orderStatus ?? "pending_payment",
      },
    ],
    payment_sessions: [
      {
        id: sessionId,
        restaurant_id: restaurantId,
        order_id: orderId,
        provider_ref: providerRef,
        amount: amountMajor,
        currency: "SAR",
        psp_currency: "SAR",
        status: options.sessionStatus ?? "link_sent",
        expires_at:
          options.expiresAt ??
          new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      },
    ],
    processed_payment_events: [],
  });
}

function makeCodDb(total: number) {
  return new FakeSupabase({
    orders: [
      {
        id: "cod-order",
        restaurant_id: "restaurant-a",
        total,
        payment_method: "cod",
        payment_status: "unpaid",
        is_test: false,
      },
    ],
    deliveries: [
      {
        id: "delivery-a",
        order_id: "cod-order",
        driver_id: "driver-a",
        drivers: { name: "Driver A" },
      },
    ],
  });
}

function paidWebhookBody(options: {
  eventId?: string;
  secret?: string;
  providerRef?: string;
  sessionId?: string;
  amountMinor?: number;
  currency?: string;
}) {
  return JSON.stringify({
    id: options.eventId ?? "event-a",
    type: "payment_paid",
    secret_token: options.secret ?? "restaurant-a-secret",
    data: {
      id: options.providerRef ?? "pay-a",
      status: "paid",
      amount: options.amountMinor ?? 5000,
      currency: options.currency ?? "SAR",
      metadata: {
        sessionId: options.sessionId ?? "session-a",
      },
    },
  });
}

async function handleWebhook(db: FakeSupabase, rawBody: string) {
  return handleMoyasarWebhook(db as any, rawBody, {}, {
    decrypt: (value) => value,
    notify: async () => undefined,
    recordAlert: async (admin, input) => {
      (admin as unknown as FakeSupabase).alerts.push({
        type: input.type,
        details: input,
      });
    },
  });
}

function assertNoClientPaymentWritePath() {
  const filePath = path.join(process.cwd(), "lib/order-store.ts");
  const source = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  let hasClientPaymentWriter = false;

  function visit(node: ts.Node) {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "markPaid"
    ) {
      hasClientPaymentWriter = true;
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "orderWrite" &&
      node.arguments[1] &&
      ts.isStringLiteralLike(node.arguments[1]) &&
      node.arguments[1].text === "payment"
    ) {
      hasClientPaymentWriter = true;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  assert.equal(
    hasClientPaymentWriter,
    false,
    "lib/order-store.ts exposes a client-side payment write path",
  );
}

async function main() {
  const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

  async function check(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({
        name,
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await check("cash delivery capture does not mark the order paid by itself", async () => {
    const db = makeCodDb(75);
    const outcome = await captureCodOnDelivered(db as any, {
      orderId: "cod-order",
      restaurantId: "restaurant-a",
      actorId: "operator-a",
    });
    assert.equal(outcome.ok, true);
    assert.equal(db.tables.orders[0].payment_status, "unpaid");
  });

  await check("cash delivery rejects non-minor-unit totals", async () => {
    const db = makeCodDb(10.005);
    const outcome = await captureCodOnDelivered(db as any, {
      orderId: "cod-order",
      restaurantId: "restaurant-a",
      actorId: "operator-a",
    });
    assert.equal(outcome.ok, false, "COD accepted a fractional-cent total");
  });

  await check("Moyasar order remains unpaid until a verified paid webhook", async () => {
    const db = makePaymentDb({});
    assert.equal(db.tables.orders[0].payment_status, "unpaid");
    const outcome = await handleWebhook(db, paidWebhookBody({}));
    assert.equal(outcome.httpStatus, 200);
    assert.equal(outcome.outcome, "paid");
    assert.equal(db.tables.orders[0].payment_status, "paid");
    assert.equal(db.tables.payment_sessions[0].status, "paid");
  });

  await check("wrong Moyasar signature is rejected and changes nothing", async () => {
    const db = makePaymentDb({});
    const outcome = await handleWebhook(
      db,
      paidWebhookBody({ secret: "wrong-secret" }),
    );
    assert.equal(outcome.httpStatus, 401);
    assert.equal(outcome.outcome, "invalid_signature");
    assert.equal(db.tables.orders[0].payment_status, "unpaid");
    assert.equal(db.tables.payment_sessions[0].status, "link_sent");
    assert.equal(db.tables.processed_payment_events.length, 0);
  });

  await check("missing Moyasar signature is rejected and changes nothing", async () => {
    const db = makePaymentDb({});
    const body = JSON.parse(paidWebhookBody({}));
    delete body.secret_token;
    const outcome = await handleWebhook(db, JSON.stringify(body));
    assert.equal(outcome.httpStatus, 401);
    assert.equal(outcome.outcome, "invalid_signature");
    assert.equal(db.tables.orders[0].payment_status, "unpaid");
    assert.equal(db.tables.payment_sessions[0].status, "link_sent");
  });

  await check("duplicate Moyasar webhook has exactly one payment effect", async () => {
    const db = makePaymentDb({});
    const body = paidWebhookBody({ eventId: "event-duplicate" });
    const first = await handleWebhook(db, body);
    const second = await handleWebhook(db, body);
    assert.equal(first.outcome, "paid");
    assert.equal(second.outcome, "duplicate_event");
    assert.equal(db.tables.processed_payment_events.length, 1);
    assert.equal(
      db.effects.filter(
        (effect) =>
          effect.table === "orders" &&
          effect.action === "update" &&
          (effect.payload as Row).payment_status === "paid",
      ).length,
      1,
    );
  });

  await check("tenant A webhook signed with tenant B secret is rejected", async () => {
    const db = makePaymentDb({});
    const outcome = await handleWebhook(
      db,
      paidWebhookBody({ secret: "restaurant-b-secret" }),
    );
    assert.equal(outcome.httpStatus, 401);
    assert.equal(outcome.outcome, "invalid_signature");
    assert.equal(db.tables.orders[0].payment_status, "unpaid");
  });

  await check("payment for a cancelled order does not silently mark it paid", async () => {
    const db = makePaymentDb({ orderStatus: "cancelled" });
    const outcome = await handleWebhook(db, paidWebhookBody({}));
    assert.notEqual(outcome.outcome, "paid");
    assert.equal(db.tables.orders[0].payment_status, "unpaid");
  });

  await check("expired-link payment follows the current defined rule", async () => {
    const db = makePaymentDb({
      sessionStatus: "expired",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const outcome = await handleWebhook(db, paidWebhookBody({}));
    assert.equal(outcome.outcome, "paid");
    assert.equal(db.tables.orders[0].payment_status, "paid");
    assert.equal(db.tables.payment_sessions[0].status, "paid");
    assert.equal(
      db.alerts.some((alert) => alert.type === "paid_after_expiry"),
      true,
    );
  });

  await check("client code exposes no payment-field write path", () => {
    assertNoClientPaymentWritePath();
  });

  await check("Moyasar money comparison rejects sub-minor-unit values", () => {
    assert.throws(() => toHalalas(10.005), /whole halalas/);
  });

  const passed = results.filter((result) => result.ok).length;
  const failed = results.length - passed;

  for (const result of results) {
    if (result.ok) {
      console.log(`PASS ${result.name}`);
    } else {
      console.log(`FAIL ${result.name}`);
      console.log(`  ${result.detail}`);
    }
  }
  console.log(`RESULT ${passed}/${results.length} passed`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
