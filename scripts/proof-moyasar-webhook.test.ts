// ============================================================================
// WO-3c proof harness — Moyasar webhook handler (payment truth).
// Exercises the REAL handleMoyasarWebhook against a fake admin + injected verify/
// notify/alert. Covers: invalid JSON / no provider_ref, unknown session (swallow),
// signature fail-closed, flag-OFF invariance, event-dedup (duplicate → single
// transition), out-of-order (failed after paid → no-op), amount mismatch (hold +
// alert, never paid), paid → order stamped + notify once, tenant isolation.
//
// Run: node --conditions=react-server --import <tsx>/dist/loader.mjs \
//        scripts/proof-moyasar-webhook.test.ts
// ============================================================================

import { handleMoyasarWebhook, paidConfirmationText, type MoyasarWebhookDeps } from "../lib/payments/moyasar-webhook.ts";
import type { WebhookVerification } from "../lib/payments/provider.ts";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } }

type Row = Record<string, unknown>;
function makeAdmin(store: Record<string, Row[]>) {
  function builder(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let patch: Row | null = null;
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; };
    q.neq = (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return q; };
    const rows = () => (store[table] ?? []).filter((r) => filters.every((f) => f(r)));
    q.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
    q.single = async () => ({ data: rows()[0] ?? null, error: null });
    q.update = (p: Row) => { patch = p; return q; };
    q.insert = async (row: Row) => {
      if (table === "processed_payment_events" &&
          (store[table] ?? []).some((r) => r.restaurant_id === row.restaurant_id && r.event_id === row.event_id)) {
        return { error: { code: "23505", message: "dup" } };
      }
      (store[table] ??= []).push({ ...row });
      return { error: null };
    };
    q.then = (resolve: (v: unknown) => unknown) => {
      if (patch) { const m = rows(); m.forEach((r) => Object.assign(r, patch)); return resolve({ data: m.map((r) => ({ id: r.id })), error: null }); }
      return resolve({ data: rows(), error: null });
    };
    return q;
  }
  return { from: (t: string) => builder(t) } as never;
}

// A session paying 50.00 SAR = 5000 halalas.
function seed(over: { sessionStatus?: string; flags?: Row; orderStatus?: string } = {}) {
  return {
    payment_sessions: [{
      id: "sess-1", restaurant_id: "A", order_id: "ord-1", amount: 50, currency: "SAR",
      status: over.sessionStatus ?? "opened", provider_ref: "inv_1",
      orders: { order_number: "W-100", customers: { phone: "966500000001" } },
    }],
    restaurants: [{ id: "A", psp_webhook_secret_enc: "SECRET", feature_flags: over.flags ?? { psp_payments: true } }],
    orders: [{ id: "ord-1", restaurant_id: "A", payment_status: over.orderStatus ?? "unpaid" }],
    processed_payment_events: [] as Row[],
  };
}
function body(o: { eventId?: string; providerRef?: string; amount?: number; currency?: string; status?: string }) {
  return JSON.stringify({
    id: o.eventId ?? "evt_1", type: "invoice_" + (o.status ?? "paid"), secret_token: "SECRET",
    data: { id: o.providerRef ?? "inv_1", amount: o.amount ?? 5000, currency: o.currency ?? "SAR", status: o.status ?? "paid" },
  });
}
// Injected verify: valid unless secret is wrong; status from the body.
function deps(over: Partial<MoyasarWebhookDeps> & { valid?: boolean; notifies?: string[]; alerts?: string[] } = {}): MoyasarWebhookDeps {
  return {
    decrypt: (e) => e,
    verify: over.verify ?? ((raw: string, _h, _s): WebhookVerification => {
      const p = JSON.parse(raw); const st = p.data?.status;
      return { valid: over.valid !== false, event: p.type, providerRef: p.data?.id, status: st, raw: p };
    }),
    recordAlert: async (_a, input) => { over.alerts?.push(input.type); },
    notify: async (_a, _rid, _to, text) => { over.notifies?.push(text); },
  };
}

async function run() {
  // ---- malformed --------------------------------------------------------------
  check("invalid JSON → 400", (await handleMoyasarWebhook(makeAdmin(seed()), "{not json", {}, deps())).httpStatus === 400);
  check("no provider_ref → 400", (await handleMoyasarWebhook(makeAdmin(seed()), JSON.stringify({ id: "e", data: {} }), {}, deps())).httpStatus === 400);

  // ---- unknown session → swallow ---------------------------------------------
  {
    const r = await handleMoyasarWebhook(makeAdmin(seed()), body({ providerRef: "inv_UNKNOWN" }), {}, deps());
    check("unknown session → 200 swallowed", r.httpStatus === 200 && r.outcome === "unknown_session");
  }

  // ---- signature fail-closed --------------------------------------------------
  {
    const store = seed(); const notifies: string[] = [];
    const r = await handleMoyasarWebhook(makeAdmin(store), body({}), {}, deps({ valid: false, notifies }));
    check("invalid signature → 401 fail-closed", r.httpStatus === 401 && r.outcome === "invalid_signature");
    check("invalid signature → no notify, no order stamp", notifies.length === 0 && store.orders[0].payment_status === "unpaid");
    check("invalid signature → no event recorded (no processing)", store.processed_payment_events.length === 0);
  }

  // ---- flag OFF invariance ----------------------------------------------------
  {
    const store = seed({ flags: {} }); const notifies: string[] = [];
    const r = await handleMoyasarWebhook(makeAdmin(store), body({}), {}, deps({ notifies }));
    check("flag OFF → 410", r.httpStatus === 410 && r.outcome === "flag_off");
    check("flag OFF → byte-zero side effects (no stamp, no event, no notify)",
      store.orders[0].payment_status === "unpaid" && store.processed_payment_events.length === 0 && notifies.length === 0);
  }

  // ---- paid → stamp + notify once --------------------------------------------
  {
    const store = seed(); const notifies: string[] = [];
    const r = await handleMoyasarWebhook(makeAdmin(store), body({}), {}, deps({ notifies }));
    check("paid → 200 paid", r.httpStatus === 200 && r.outcome === "paid");
    check("paid → session marked paid", store.payment_sessions[0].status === "paid");
    check("paid → order stamped payment_status=paid", store.orders[0].payment_status === "paid");
    check("paid → notify called ONCE with deterministic text", notifies.length === 1 && notifies[0] === paidConfirmationText("W-100"));
    check("paid → event recorded", store.processed_payment_events.length === 1);
  }

  // ---- duplicate event → single transition -----------------------------------
  {
    const store = seed(); const admin = makeAdmin(store); const notifies: string[] = [];
    await handleMoyasarWebhook(admin, body({ eventId: "evt_dup" }), {}, deps({ notifies }));
    const r2 = await handleMoyasarWebhook(admin, body({ eventId: "evt_dup" }), {}, deps({ notifies }));
    check("duplicate event → 200 duplicate_event no-op", r2.outcome === "duplicate_event");
    check("duplicate event → notify NOT sent twice", notifies.length === 1);
    check("duplicate event → one processed row", store.processed_payment_events.length === 1);
  }

  // ---- out-of-order: failed AFTER paid → no-op -------------------------------
  {
    const store = seed({ sessionStatus: "paid" });
    const r = await handleMoyasarWebhook(makeAdmin(store), body({ eventId: "evt_late", status: "failed" }), {}, deps());
    check("failed after paid → 200 noop_terminal", r.outcome === "noop_terminal");
    check("failed after paid → session stays paid", store.payment_sessions[0].status === "paid");
  }

  // ---- failed (fresh) → session failed, order untouched ----------------------
  {
    const store = seed();
    const r = await handleMoyasarWebhook(makeAdmin(store), body({ eventId: "evt_f", status: "failed" }), {}, deps());
    check("fresh failed → 200 failed", r.outcome === "failed");
    check("fresh failed → session=failed", store.payment_sessions[0].status === "failed");
    check("fresh failed → order untouched", store.orders[0].payment_status === "unpaid");
  }

  // ---- amount mismatch → hold + alert, never paid ----------------------------
  {
    const store = seed(); const alerts: string[] = []; const notifies: string[] = [];
    const r = await handleMoyasarWebhook(makeAdmin(store), body({ amount: 4000 }), {}, deps({ alerts, notifies }));
    check("amount mismatch → 200 amount_mismatch_held", r.outcome === "amount_mismatch_held");
    check("amount mismatch → order NOT paid (held)", store.orders[0].payment_status === "unpaid");
    check("amount mismatch → session NOT paid", store.payment_sessions[0].status !== "paid");
    check("amount mismatch → alert recorded", alerts.length === 1 && alerts[0] === "payment_amount_mismatch");
    check("amount mismatch → no notify", notifies.length === 0);
  }

  // ---- currency mismatch → held too ------------------------------------------
  {
    const store = seed(); const alerts: string[] = [];
    const r = await handleMoyasarWebhook(makeAdmin(store), body({ currency: "USD" }), {}, deps({ alerts }));
    check("currency mismatch → held + alert", r.outcome === "amount_mismatch_held" && alerts[0] === "payment_amount_mismatch");
  }

  // ---- tenant isolation: order stamp scoped to the session's own tenant ------
  {
    const store = seed(); (store.orders as Row[]).push({ id: "ord-1", restaurant_id: "B", payment_status: "unpaid" });
    await handleMoyasarWebhook(makeAdmin(store), body({}), {}, deps());
    check("tenant isolation: only A's order stamped, B's same-id order untouched",
      store.orders[0].payment_status === "paid" && store.orders[1].payment_status === "unpaid");
  }

  console.log(`\nMOYASAR-WEBHOOK PROOF: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
run();
