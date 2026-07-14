// WO-COD-REFUND-RECONCILE proof.
// Run: node --conditions=react-server --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/proof-cod-refund-reconcile.test.ts

import { readFileSync } from "node:fs";
import { recordOrderRefund, parseRefundMetadata } from "../lib/db/cod.ts";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) pass++;
  else {
    fail++;
    console.error("  FAIL", name);
  }
}

type Table = "orders" | "cod_collections" | "cod_cash_events";
type FakeOptions = {
  order?: Record<string, unknown> | null;
  collection?: Record<string, unknown> | null;
  eventInsertFails?: boolean;
};

function fakeDb(opts: FakeOptions = {}) {
  const state = {
    inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
    updates: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  };
  const order = opts.order ?? {
    id: "order-1",
    total: 120,
    payment_status: "paid",
    payment_method: "cod",
  };
  const collection = opts.collection ?? { id: "collection-1", driver_id: "driver-1" };

  const from = (table: Table) => {
    const rec = { table, op: "select", payload: null as Record<string, unknown> | null };
    const b: Record<string, unknown> = {
      select() { return b; },
      eq() { return b; },
      maybeSingle: async () => {
        if (table === "orders") return { data: order, error: null };
        if (table === "cod_collections") return { data: collection, error: null };
        return { data: null, error: null };
      },
      insert(payload: Record<string, unknown>) {
        rec.op = "insert";
        rec.payload = payload;
        state.inserts.push({ table, payload });
        return b;
      },
      update(payload: Record<string, unknown>) {
        rec.op = "update";
        rec.payload = payload;
        state.updates.push({ table, payload });
        return b;
      },
      single: async () => {
        if (table === "cod_cash_events" && opts.eventInsertFails) {
          return { data: null, error: { message: "insert failed" } };
        }
        if (table === "cod_cash_events") return { data: { id: "event-1" }, error: null };
        return { data: null, error: null };
      },
    };
    return b;
  };

  return { db: { from }, state };
}

function indexOfOrFail(src: string, needle: string): number {
  const i = src.indexOf(needle);
  ok(`source contains ${needle}`, i >= 0);
  return i;
}

const cancel = readFileSync("app/api/orders/[id]/cancel/route.ts", "utf8");
const payment = readFileSync("app/api/orders/[id]/payment/route.ts", "utf8");
const cod = readFileSync("lib/db/cod.ts", "utf8");

// CONTROL: old behavior flipped the label without a money record.
const oldCancel = `const paymentStatus = order.payment_status === "paid" ? "refunded" : order.payment_status;
await admin.from("orders").update({ payment_status: paymentStatus });`;
ok("CONTROL: old cancel label flip had no cod_cash_events insert", /"refunded"/.test(oldCancel) && !/cod_cash_events|recordOrderRefund/.test(oldCancel));

ok("refunded-without-amount is rejected", !parseRefundMetadata({ method: "cash", reason: "customer request" }).ok);
ok("refunded-without-reason is rejected", !parseRefundMetadata({ amount: 10, method: "cash" }).ok);
ok("refunded-without-method is rejected", !parseRefundMetadata({ amount: 10, reason: "customer request" }).ok);

const missingMeta = parseRefundMetadata({ paymentStatus: "refunded" });
ok("payment route missing refund metadata is rejected by shared parser", !missingMeta.ok && missingMeta.error === "bad_refund_metadata");

const zero = await recordOrderRefund(fakeDb().db as any, "restaurant-1", {
  orderId: "order-1",
  amount: 0,
  method: "cash",
  reason: "customer request",
});
ok("amount <= 0 is rejected", !zero.ok && zero.error === "bad_refund_amount");

const over = await recordOrderRefund(fakeDb().db as any, "restaurant-1", {
  orderId: "order-1",
  amount: 121,
  method: "provider",
  reason: "customer request",
});
ok("amount > order total is rejected", !over.ok && over.error === "bad_refund_amount");

const insertFailure = fakeDb({ eventInsertFails: true });
const failedRefund = await recordOrderRefund(insertFailure.db as any, "restaurant-1", {
  orderId: "order-1",
  amount: 50,
  method: "cash",
  reason: "customer request",
  actorUserId: "user-1",
  actorRole: "manager",
});
ok("event-insert failure rejects the refund", !failedRefund.ok && failedRefund.error === "refund_record_failed");
ok("event-insert failure does not update orders in the helper", insertFailure.state.updates.length === 0);

const good = fakeDb();
const recorded = await recordOrderRefund(good.db as any, "restaurant-1", {
  orderId: "order-1",
  amount: 80,
  method: "provider",
  reason: "partial provider reversal",
  evidence: "provider-ref-123",
  actorUserId: "user-1",
  actorRole: "manager",
});
const event = good.state.inserts.find((x) => x.table === "cod_cash_events")?.payload as any;
ok("proper refund writes cod_cash_events.refund_recorded", recorded.ok && event?.type === "refund_recorded");
ok("proper refund persists amount and expected order total", event?.amount === 80 && event?.expected === 120);
ok("proper refund persists actor and nullable COD links", event?.actor_user_id === "user-1" && event?.actor_role === "manager" && event?.cod_collection_id === "collection-1" && event?.driver_id === "driver-1");
ok("proper refund persists method/reason/evidence in payload", event?.payload?.method === "provider" && event?.payload?.reason === "partial provider reversal" && event?.payload?.evidence === "provider-ref-123");

ok("cod helper stores refund_recorded in cod_cash_events", /from\("cod_cash_events"\)[\s\S]*type: "refund_recorded"/.test(cod));
ok("cod helper records order total in expected", /expected,\s*actor_user_id/.test(cod) && /const expected = Number\(row\.total\);/.test(cod));
ok("cod helper permits non-COD refunds by nullable collection/driver", /cod_collection_id: codCollection\?\.id \?\? null/.test(cod) && /driver_id: codCollection\?\.driver_id \?\? null/.test(cod));

const cancelRecord = indexOfOrFail(cancel, "const refund = await recordOrderRefund");
const cancelFailReturn = indexOfOrFail(cancel, "if (!refund.ok) return refundErrorResponse(refund.error);");
const cancelFlip = indexOfOrFail(cancel, 'paymentStatus = "refunded";');
const cancelUpdate = cancel.indexOf('.from("orders")', cancelFlip);
ok("source contains cancel orders update after refund flip", cancelUpdate >= 0);
ok("paid-cancel-without-refund-metadata is rejected before update", /if \(paymentStatus === "paid"\) \{[\s\S]*parseRefundMetadata\(body\)[\s\S]*return refundErrorResponse\(parsed\.error\)/.test(cancel));
ok("cancel route writes refund event before flipping payment_status", cancelRecord < cancelFailReturn && cancelFailReturn < cancelFlip && cancelFlip < cancelUpdate);
ok("cancel route derives actor server-side", /actorUserId: tenant\.userId/.test(cancel) && /actorRole: tenant\.role/.test(cancel));
ok("non-paid cancel path still preserves existing payment status", /let paymentStatus = \(order as \{ payment_status: string \}\)\.payment_status;/.test(cancel));

const paymentRecord = indexOfOrFail(payment, "const refund = await recordOrderRefund");
const paymentFailReturn = indexOfOrFail(payment, "if (!refund.ok) return refundErrorResponse(refund.error);");
const patch = indexOfOrFail(payment, "const patch:");
const paymentUpdate = indexOfOrFail(payment, '.from("orders")');
ok("payment route requires refund metadata for direct refunded status", /if \(paymentStatus === "refunded"\) \{[\s\S]*parseRefundMetadata\(body\)[\s\S]*return refundErrorResponse\(parsed\.error\)/.test(payment));
ok("payment route records refund before orders update", paymentRecord < paymentFailReturn && paymentFailReturn < patch && patch < paymentUpdate);
ok("payment route still keeps paid safety-hold guard", /if \(paymentStatus === "paid"\) \{[\s\S]*checkOrderSafetyHold/.test(payment));

console.log(`\nCOD-REFUND-RECONCILE PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
