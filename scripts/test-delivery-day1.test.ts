// ============================================================================
// Kivo Delivery Network — Day 1 candidate proofs.
// Run: node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types \
//        scripts/test-delivery-day1.test.ts
//
// Covers the two pieces of NEW logic this candidate adds:
//   1. validateManualJob — the operator-typed job contract (phone / destination /
//      pin / COD), proven pure and without a database.
//   2. locationFreshness — a stale driver point is REPORTED with its age, not
//      dropped (the operator must be able to tell "no GPS" from "GPS 6 min old").
//   3. createManualDeliveryJob — writes customer → order → delivery against a fake
//      PostgREST client, proving the order_id constraint is UPHELD (a real backing
//      orders row is created and the delivery hangs off it) rather than relaxed.
// ============================================================================

import { validateManualJob, MAX_COD_AMOUNT } from "../lib/delivery/manual-job.ts";
import { locationFreshness, LOCATION_FRESH_MS } from "../lib/db/delivery.ts";
import { createManualDeliveryJob, MANUAL_JOB_SOURCE } from "../lib/db/delivery-job.ts";

let pass = 0, fail = 0;
const eq = (n: string, a: unknown, e: unknown) => {
  if (a === e) pass++; else { fail++; console.log(`  ❌ ${n}: got ${JSON.stringify(a)}, expected ${JSON.stringify(e)}`); }
};
const ok = (n: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log(`  ❌ ${n}: expected true`); } };

// A permissive stand-in for normalizePhone: digits-only, "bad" → "" (invalid).
const fakeNormalize = (raw: string) => (raw.includes("bad") ? "" : raw.replace(/\D/g, ""));

// ── 1. validateManualJob ───────────────────────────────────────────────────────
{
  eq("phone missing → phone_required",
    (validateManualJob({ address: "شارع ١٠" }, fakeNormalize) as { error: string }).error, "phone_required");
  eq("phone unmatched shape → phone_invalid",
    (validateManualJob({ customerPhone: "bad", address: "شارع ١٠" }, fakeNormalize) as { error: string }).error, "phone_invalid");

  // Destination: address OR pin, but at least one.
  eq("no address and no pin → destination_required",
    (validateManualJob({ customerPhone: "0501234567" }, fakeNormalize) as { error: string }).error, "destination_required");

  const addrOnly = validateManualJob({ customerPhone: "+966 50 123 4567", address: "  شارع ١٠  " }, fakeNormalize);
  ok("address-only job is valid", addrOnly.ok);
  if (addrOnly.ok) {
    eq("phone is stored NORMALIZED, never raw", addrOnly.job.customerPhone, "966501234567");
    eq("address is trimmed", addrOnly.job.address, "شارع ١٠");
    eq("no pin → coords null", addrOnly.job.lat, null);
    eq("no COD → null (nothing to collect)", addrOnly.job.codAmount, null);
  }

  const pinOnly = validateManualJob({ customerPhone: "0501234567", lat: 24.7136, lng: 46.6753 }, fakeNormalize);
  ok("pin-only job is valid (no address line needed)", pinOnly.ok);
  if (pinOnly.ok) eq("pin lat kept", pinOnly.job.lat, 24.7136);

  // A HALF pin is a hard reject — never silently dropped (it would strand the
  // driver with a navigation button pointing nowhere).
  eq("lat without lng → bad_coords",
    (validateManualJob({ customerPhone: "0501234567", lat: 24.7 }, fakeNormalize) as { error: string }).error, "bad_coords");
  eq("lng without lat → bad_coords",
    (validateManualJob({ customerPhone: "0501234567", lng: 46.6 }, fakeNormalize) as { error: string }).error, "bad_coords");
  eq("out-of-range lat → bad_coords",
    (validateManualJob({ customerPhone: "0501234567", lat: 91, lng: 46.6 }, fakeNormalize) as { error: string }).error, "bad_coords");
  eq("out-of-range lng → bad_coords",
    (validateManualJob({ customerPhone: "0501234567", lat: 24.7, lng: 181 }, fakeNormalize) as { error: string }).error, "bad_coords");

  // COD is money the driver is accountable for → rejected, never coerced.
  eq("negative COD → bad_amount",
    (validateManualJob({ customerPhone: "0501234567", address: "أ", codAmount: -5 }, fakeNormalize) as { error: string }).error, "bad_amount");
  eq("non-numeric COD → bad_amount",
    (validateManualJob({ customerPhone: "0501234567", address: "أ", codAmount: "كثير" }, fakeNormalize) as { error: string }).error, "bad_amount");
  eq("absurd COD → bad_amount",
    (validateManualJob({ customerPhone: "0501234567", address: "أ", codAmount: MAX_COD_AMOUNT + 1 }, fakeNormalize) as { error: string }).error, "bad_amount");

  const zeroCod = validateManualJob({ customerPhone: "0501234567", address: "أ", codAmount: "0" }, fakeNormalize);
  ok("COD 0 is accepted", zeroCod.ok);
  if (zeroCod.ok) eq("COD 0 normalizes to null (nothing to collect)", zeroCod.job.codAmount, null);

  const cod = validateManualJob({ customerPhone: "0501234567", address: "أ", codAmount: "45.678", reference: " فاتورة ٩٩ " }, fakeNormalize);
  ok("COD job is valid", cod.ok);
  if (cod.ok) {
    eq("COD rounded to 2dp", cod.job.codAmount, 45.68);
    eq("reference trimmed", cod.job.reference, "فاتورة ٩٩");
  }
}

// ── 2. locationFreshness — staleness is REPORTED, not hidden ───────────────────
{
  const now = 1_000_000_000_000;
  const at = (msAgo: number) => new Date(now - msAgo).toISOString();

  const live = locationFreshness(at(5_000), now);
  ok("a 5s-old point is fresh", live.fresh);
  eq("age is reported for a fresh point", live.ageMs, 5_000);

  const stale = locationFreshness(at(6 * 60_000), now);
  ok("a 6min-old point is NOT fresh", !stale.fresh);
  eq("…but its age is still reported (not dropped)", stale.ageMs, 6 * 60_000);

  ok("boundary: exactly LOCATION_FRESH_MS old is stale", !locationFreshness(at(LOCATION_FRESH_MS), now).fresh);
  ok("boundary: 1ms under the window is fresh", locationFreshness(at(LOCATION_FRESH_MS - 1), now).fresh);
  eq("clock skew (future point) clamps to 0, never negative", locationFreshness(at(-5_000), now).ageMs, 0);
}

// ── 3. createManualDeliveryJob — upholds the order_id constraint ───────────────
// Thenable fake PostgREST client: records every write so we can assert the shape.
function makeAdmin(writes: { table: string; op: string; row: Record<string, unknown> }[]) {
  const make = (table: string) => {
    const st: { op: string; row: Record<string, unknown> } = { op: "select", row: {} };
    const result = () => {
      if (table === "restaurants") return { data: { country: "SA", currency: "ر.س" }, error: null };
      if (table === "customers" && st.op !== "select") return { data: { id: "cust-1" }, error: null };
      if (table === "orders" && st.op === "insert") return { data: { id: "order-1" }, error: null };
      if (table === "orders") return { data: [], error: null };            // nextOrderNumber scan
      if (table === "deliveries" && st.op === "upsert") return { data: [{ id: "del-1" }], error: null };
      return { data: null, error: null };
    };
    const b: Record<string, unknown> = {
      select() { return b; },
      eq() { return b; },
      in() { return b; },
      order() { return b; },
      limit() { return b; },
      insert(row: Record<string, unknown>) { st.op = "insert"; st.row = row; writes.push({ table, op: "insert", row }); return b; },
      upsert(row: Record<string, unknown>) { st.op = "upsert"; st.row = row; writes.push({ table, op: "upsert", row }); return b; },
      update(row: Record<string, unknown>) { st.op = "update"; st.row = row; writes.push({ table, op: "update", row }); return b; },
      maybeSingle() { return Promise.resolve(result()); },
      single() { return Promise.resolve(result()); },
      then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) { return Promise.resolve(result()).then(onF, onR); },
    };
    return b;
  };
  return { from: make } as never;
}

{
  const writes: { table: string; op: string; row: Record<string, unknown> }[] = [];
  const res = await createManualDeliveryJob(makeAdmin(writes), "rest-1", {
    customerPhone: "0501234567",
    customerName: "أبو محمد",
    address: "شارع ١٠",
    lat: 24.7136,
    lng: 46.6753,
    codAmount: "120",
    reference: "فاتورة ٩٩",
  });
  ok("COD job created", res.ok);
  if (res.ok) {
    eq("returns the delivery id the assign endpoint takes", res.job.deliveryId, "del-1");
    eq("returns the backing order id", res.job.orderId, "order-1");
  }

  const order = writes.find((w) => w.table === "orders" && w.op === "insert")?.row;
  ok("a REAL backing orders row is created (order_id constraint upheld, not relaxed)", !!order);
  eq("order is delivery-fulfillment (so ensureDeliveryRow/self-heal agree)", order?.fulfillment, "delivery");
  eq("order is tagged as a manual job", order?.source, MANUAL_JOB_SOURCE);
  eq("COD job stays UNPAID so captureCodOnDelivered fires on delivered", order?.payment_status, "unpaid");
  eq("COD job carries the cash method", order?.payment_method, "cod");
  eq("COD amount lands on the order total", order?.total, 120);
  eq("pin persisted (lat)", order?.lat, 24.7136);
  eq("pin persisted (lng)", order?.lng, 46.6753);
  eq("reference persisted to notes (shown to the driver)", order?.notes, "فاتورة ٩٩");

  const cust = writes.find((w) => w.table === "customers")?.row;
  eq("customer upserted with the NORMALIZED phone", cust?.phone, "966501234567");

  const del = writes.find((w) => w.table === "deliveries")?.row;
  eq("delivery hangs off the created order", del?.order_id, "order-1");
  eq("delivery starts pending (awaiting driver assignment)", del?.status, "pending");

  ok("a manual_job_created event is logged",
    writes.some((w) => w.table === "delivery_events" && w.row.type === "manual_job_created"));
}

{
  // No COD → marked paid, so the COD ledger is NOT opened for a job with nothing
  // to collect (captureCodOnDelivered skips payment_status === "paid").
  const writes: { table: string; op: string; row: Record<string, unknown> }[] = [];
  const res = await createManualDeliveryJob(makeAdmin(writes), "rest-1", { customerPhone: "0501234567", address: "شارع ١٠" });
  ok("non-COD job created", res.ok);
  const order = writes.find((w) => w.table === "orders" && w.op === "insert")?.row;
  eq("non-COD job is marked paid (no cash to capture)", order?.payment_status, "paid");
  eq("non-COD job has no payment method", order?.payment_method, null);
  eq("non-COD total is 0", order?.total, 0);
}

{
  // Invalid input never reaches the database.
  const writes: { table: string; op: string; row: Record<string, unknown> }[] = [];
  const res = await createManualDeliveryJob(makeAdmin(writes), "rest-1", { customerPhone: "" });
  ok("invalid job rejected", !res.ok);
  if (!res.ok) eq("…with the input reason", res.error, "phone_required");
  ok("NO rows written for an invalid job", writes.length === 0);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} delivery day-1: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
