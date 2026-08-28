// ============================================================================
// WO-KHALID-ORDER — THE DEMO CAN CLOSE AN ORDER, AND CLOSING IT CANNOT PAGE A HUMAN.
//
// Run: node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types \
//        scripts/proof-demo-order.test.ts
//
// WHAT WENT WRONG
// ---------------
// In a 50-conversation live run against https://www.getkivo.io/demo a visitor built a
// basket, confirmed it, chose delivery, gave an address and tapped pay — and was asked
// «أجهّز لك الطلب؟» SIX CONSECUTIVE TIMES. No order number was ever produced. It
// reproduced in three separate conversations.
//
// The model was not the problem. Both demo routes passed `conversationId: null`;
// customer-turn.ts guards its draft reload with `if (conversationId)`; so `initialDraft`
// was ALWAYS null and every turn started from `emptyDraft()`. The basket was never
// state — only what the model could re-derive from a transcript capped at
// DEMO_MAX_HISTORY turns. Past that cap it was simply gone.
//
// WHY THE FIX IS DANGEROUS, WHICH IS WHY THIS FILE EXISTS
// -------------------------------------------------------
// `conversationId === null` was ALSO, by accident, the demo's off-switch for every
// staff-facing side effect in the turn path — most importantly recordCriticalAlert,
// which writes a `system_alerts` banner row, calls sendAlertEmail, and calls
// sendAlertWhatsApp: a real WhatsApp message to the Founder's own phone. The demo
// tenant runs the deterministic allergen gate, which emits `notify_without_hold` the
// moment anyone types «حساسية». Giving the demo a conversation id without gating that
// loop would have turned a public sales page into a way for any stranger, anywhere, at
// any hour, to page a real person for free.
//
// So this proof is mostly not about ordering. It is about proving that the thing which
// used to hold that line by accident now holds it on purpose, and that removing the
// guard makes this file go red.
//
// Every section below is BEHAVIOUR against a fake Supabase — not a regex over source —
// and each control has a CONTROL/mutation case proving the assertion can fail.
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  DEMO_RESTAURANT_ID, DEMO_SESSION_CHANNEL, DEMO_ORDER_SOURCE, DEMO_SESSION_TTL_MS, isUuid,
} from "../lib/demo/config.ts";
import { findDemoSession, resolveDemoSession, sweepExpiredDemoSessions } from "../lib/demo/session.ts";
import { closeDemoOrder, demoOrderConfirmation, demoOrderFailure } from "../lib/demo/order.ts";
import { persistOrderFromDraft } from "../lib/db/orders-create.ts";
import { runCustomerTurn } from "../lib/ai/customer-turn.ts";
import { findLeakage } from "../lib/ai/personas/khalid-dialect-linter.mjs";
import type { OrderDraft } from "../lib/ai/tools.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/** Statements only. These files carry long explanatory comments that name the very
 *  identifiers being asserted on — a raw-source regex measures the prose, not the code.
 *  (Caught by mutation M15: deleting `demoRun: true` from the turn route left the header
 *  comment mentioning it, and a raw-source check passed on a route that no longer had it.) */
const codeOf = (p: string) => read(p).split("\n")
  .filter((l) => { const t = l.trimStart(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
  .join("\n");

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.error(`  ✗   ${name}`); }
};

// ---------------------------------------------------------------------------
// A minimal Supabase double. Records every call so the assertions can ask what
// actually reached the database rather than what the source appears to say.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
type Filter = { op: string; column: string; value: unknown };

// NOTE: no TS parameter properties anywhere in this file — the harness runs under
// Node's strip-only TypeScript mode, which rejects them outright.
class FakeQuery implements PromiseLike<{ data: unknown; error: unknown }> {
  private filters: Filter[] = [];
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;
  private wantSingle: "single" | "maybe" | null = null;
  private db: FakeDb;
  private table: string;
  private op: "select" | "insert" | "update" | "upsert" | "delete";
  private payload: unknown;
  constructor(
    db: FakeDb,
    table: string,
    op: "select" | "insert" | "update" | "upsert" | "delete",
    payload: unknown = null,
  ) {
    this.db = db; this.table = table; this.op = op; this.payload = payload;
  }
  select(): this { return this; }
  eq(column: string, value: unknown): this { this.filters.push({ op: "eq", column, value }); return this; }
  in(column: string, value: unknown[]): this { this.filters.push({ op: "in", column, value }); return this; }
  lt(column: string, value: unknown): this { this.filters.push({ op: "lt", column, value }); return this; }
  gte(column: string, value: unknown): this { this.filters.push({ op: "gte", column, value }); return this; }
  is(column: string, value: unknown): this { this.filters.push({ op: "is", column, value }); return this; }
  not(): this { return this; }
  order(column: string, opts?: { ascending?: boolean }): this {
    this.orderCol = column; this.orderAsc = opts?.ascending !== false; return this;
  }
  limit(n: number): this { this.limitN = n; return this; }
  maybeSingle(): Promise<{ data: unknown; error: unknown }> { this.wantSingle = "maybe"; return this.run(); }
  single(): Promise<{ data: unknown; error: unknown }> { this.wantSingle = "single"; return this.run(); }
  then<A, B>(
    onOk?: ((v: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null,
    onErr?: ((r: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> { return this.run().then(onOk, onErr); }

  private matches(r: Row): boolean {
    return this.filters.every((f) => {
      if (f.op === "eq") return r[f.column] === f.value;
      if (f.op === "in") return (f.value as unknown[]).includes(r[f.column]);
      if (f.op === "lt") return String(r[f.column] ?? "") < String(f.value ?? "");
      if (f.op === "gte") return String(r[f.column] ?? "") >= String(f.value ?? "");
      if (f.op === "is") return r[f.column] == null && f.value === null;
      return true;
    });
  }

  private async run(): Promise<{ data: unknown; error: unknown }> {
    const rows = this.db.tables[this.table] ?? (this.db.tables[this.table] = []);
    this.db.calls.push({ table: this.table, op: this.op, filters: this.filters, payload: this.payload });

    if (this.op === "insert") {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      const made = list.map((r) => ({ id: `row-${this.db.seq++}`, created_at: new Date().toISOString(), ...r }));
      rows.push(...made);
      return this.shape(made);
    }
    if (this.op === "upsert") {
      const incoming = this.payload as Row;
      if (rows.some((r) => r.id === incoming.id)) return this.shape([]);
      const made = { created_at: new Date().toISOString(), ...incoming };
      rows.push(made);
      return this.shape([made]);
    }
    let sel = rows.filter((r) => this.matches(r));
    if (this.op === "update") {
      for (const r of sel) Object.assign(r, this.payload as Row);
      return this.shape(sel);
    }
    if (this.op === "delete") {
      this.db.tables[this.table] = rows.filter((r) => !this.matches(r));
      return this.shape(sel);
    }
    if (this.orderCol) {
      const col = this.orderCol;
      sel = [...sel].sort((a, b) => {
        const av = String(a[col] ?? ""), bv = String(b[col] ?? "");
        return this.orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    if (this.limitN != null) sel = sel.slice(0, this.limitN);
    return this.shape(sel);
  }

  private shape(rows: Row[]): { data: unknown; error: unknown } {
    if (this.wantSingle === "single") {
      return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { code: "PGRST116", message: "no rows" } };
    }
    if (this.wantSingle === "maybe") return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  }
}

class FakeDb {
  tables: Record<string, Row[]> = {};
  calls: Array<{ table: string; op: string; filters: Filter[]; payload: unknown }> = [];
  rpcCalls: Array<{ name: string; args: unknown }> = [];
  seq = 1;
  /** Set to false to simulate an environment where migration 0113 is not applied. */
  hasOrderNumberRpc = true;
  private counter = 1000;
  constructor(seed: Record<string, Row[]> = {}) { this.tables = seed; }
  from(table: string) {
    return {
      select: (_c?: string) => new FakeQuery(this, table, "select").select(),
      insert: (p: unknown) => new FakeQuery(this, table, "insert", p),
      update: (p: unknown) => new FakeQuery(this, table, "update", p),
      upsert: (p: unknown) => new FakeQuery(this, table, "upsert", p),
      delete: () => new FakeQuery(this, table, "delete"),
    };
  }
  async rpc(name: string, args: unknown) {
    this.rpcCalls.push({ name, args });
    if (name === "next_order_number") {
      if (!this.hasOrderNumberRpc) return { data: null, error: { code: "42883", message: "no function" } };
      return { data: String(++this.counter), error: null };
    }
    return { data: null, error: { code: "42883", message: "unknown rpc" } };
  }
  rows(table: string): Row[] { return this.tables[table] ?? []; }
}

const OTHER_TENANT = "5acbc72f-def3-46cd-ad6c-bf0ff4a23642"; // the LIVE client
const UUID_A = "11111111-2222-4333-8444-555555555555";
const UUID_B = "99999999-8888-4777-8666-555555555555";
const UUID_C = "abcdef01-2222-4333-8444-555555555555";

// ═══ 1. THE VALIDATOR — a visitor's id can only ever name their own demo session ═══
{
  const fresh = () => new FakeDb({
    conversations: [
      // A genuine demo session on the demo tenant.
      { id: UUID_A, restaurant_id: DEMO_RESTAURANT_ID, channel: DEMO_SESSION_CHANNEL, created_at: new Date().toISOString() },
      // ANOTHER TENANT'S live WhatsApp conversation. This is the row a hostile visitor
      // would try to name, and the one that must never be adopted.
      { id: UUID_B, restaurant_id: OTHER_TENANT, channel: "whatsapp", created_at: new Date().toISOString() },
      // ANOTHER TENANT'S row on the DEMO CHANNEL. This fixture exists so the tenant pin
      // is proved on its OWN — with only UUID_B present, deleting the tenant pin still
      // passed because the channel pin happened to catch it, and 1b would have been
      // testing the wrong filter.
      { id: UUID_C, restaurant_id: OTHER_TENANT, channel: DEMO_SESSION_CHANNEL, created_at: new Date().toISOString() },
    ],
  });

  ok("1a: a genuine demo session on the demo tenant resolves",
    (await findDemoSession(fresh(), UUID_A)) === UUID_A);

  // ── THE CONTROL THAT MATTERS ──
  ok("1b: ANOTHER TENANT'S conversation id does NOT resolve",
    (await findDemoSession(fresh(), UUID_B)) === null);
  ok("1b: nor does another tenant's row that ALSO sits on the demo channel (tenant pin alone)",
    (await findDemoSession(fresh(), UUID_C)) === null);
  const dbC = fresh();
  const resolvedC = await resolveDemoSession(dbC, UUID_C);
  ok("1b: naming it mints a fresh session on the DEMO tenant instead",
    !!resolvedC && resolvedC.conversationId !== UUID_C &&
    dbC.rows("conversations").some((r) => r.id === resolvedC?.conversationId && r.restaurant_id === DEMO_RESTAURANT_ID));

  const dbB = fresh();
  const resolvedB = await resolveDemoSession(dbB, UUID_B);
  ok("1c: naming another tenant's id gets a FRESH session, not that conversation",
    !!resolvedB && resolvedB.conversationId !== UUID_B && resolvedB.minted === true);
  ok("1c: the freshly minted session is on the DEMO tenant and the demo channel",
    dbB.rows("conversations").some((r) =>
      r.id === resolvedB?.conversationId &&
      r.restaurant_id === DEMO_RESTAURANT_ID &&
      r.channel === DEMO_SESSION_CHANNEL));
  ok("1c: the other tenant's conversation was not read, written or touched",
    dbB.rows("conversations").find((r) => r.id === UUID_B)?.restaurant_id === OTHER_TENANT &&
    !dbB.calls.some((c) => c.op !== "select" && c.filters.some((f) => f.value === UUID_B)));

  // Channel is an INDEPENDENT control: the demo tenant is a normal tenant row and can
  // acquire real WhatsApp conversations of its own.
  const dbSameTenantRealThread = new FakeDb({
    conversations: [{ id: UUID_B, restaurant_id: DEMO_RESTAURANT_ID, channel: "whatsapp", created_at: new Date().toISOString() }],
  });
  ok("1d: a REAL WhatsApp thread on the DEMO tenant is still refused (channel pin)",
    (await findDemoSession(dbSameTenantRealThread, UUID_B)) === null);

  // The lookup must actually carry BOTH filters — asserted on the recorded query, so
  // deleting either `.eq` fails here even if the fixture happened to be unambiguous.
  const dbFilters = fresh();
  await findDemoSession(dbFilters, UUID_A);
  const lookup = dbFilters.calls.find((c) => c.table === "conversations" && c.op === "select");
  ok("1e: the lookup is pinned to the demo tenant AND the demo channel AND the id",
    !!lookup &&
    lookup.filters.some((f) => f.column === "restaurant_id" && f.value === DEMO_RESTAURANT_ID) &&
    lookup.filters.some((f) => f.column === "channel" && f.value === DEMO_SESSION_CHANNEL) &&
    lookup.filters.some((f) => f.column === "id" && f.value === UUID_A));

  // Hostile shapes. PostgREST answers a malformed uuid with a 22P02 ERROR, not an empty
  // result, so the shape check has to happen before the value reaches a query at all.
  for (const junk of [null, undefined, "", "not-a-uuid", "'; drop table conversations;--",
    { id: UUID_A }, 12345, [UUID_A], "11111111-2222-4333-8444-5555555555555"]) {
    const dbJ = fresh();
    const got = await findDemoSession(dbJ, junk as unknown);
    ok(`1f: hostile session id ${JSON.stringify(junk)} is refused with no query issued`,
      got === null && !dbJ.calls.some((c) => c.table === "conversations"));
  }
  ok("1f: isUuid accepts a canonical uuid and rejects a near-miss",
    isUuid(UUID_A) && !isUuid(UUID_A + "0") && !isUuid("zzzzzzzz-2222-4333-8444-555555555555"));

  // ── MUTATION CONTROL: the guard has teeth. Re-run the SAME lookup with the tenant
  //    pin removed and confirm the foreign conversation WOULD be adopted. If this
  //    control ever passes with the pin still in place, 1b proves nothing.
  const dbMut = fresh();
  const { data: mutated } = await dbMut
    .from("conversations")
    .select("id, created_at")
    .eq("id", UUID_B)
    .eq("channel", "whatsapp") // channel matched, tenant pin DELETED
    .maybeSingle();
  ok("1g: CONTROL — with the tenant pin removed the foreign conversation IS found (so 1b is a real test)",
    (mutated as Row | null)?.id === UUID_B);
}

// ═══ 2. THE TTL AND THE SWEEP — a stranger's address does not accumulate ═══
{
  const old = new Date(Date.now() - DEMO_SESSION_TTL_MS - 60_000).toISOString();
  const now = new Date().toISOString();
  const db = new FakeDb({
    conversations: [
      { id: UUID_A, restaurant_id: DEMO_RESTAURANT_ID, channel: DEMO_SESSION_CHANNEL, created_at: old },
      { id: UUID_B, restaurant_id: DEMO_RESTAURANT_ID, channel: DEMO_SESSION_CHANNEL, created_at: now },
      { id: "keep-real", restaurant_id: OTHER_TENANT, channel: "whatsapp", created_at: old },
      { id: "keep-demo-tenant-real", restaurant_id: DEMO_RESTAURANT_ID, channel: "whatsapp", created_at: old },
    ],
    orders: [
      { id: "o-old", restaurant_id: DEMO_RESTAURANT_ID, conversation_id: UUID_A, address: "حي العليا، شارع كذا" },
      { id: "o-new", restaurant_id: DEMO_RESTAURANT_ID, conversation_id: UUID_B },
      { id: "o-real", restaurant_id: OTHER_TENANT, conversation_id: "keep-real" },
    ],
  });

  ok("2a: an EXPIRED session is not resumed (a fresh one is minted instead)",
    (await findDemoSession(db, UUID_A)) === null);
  ok("2a: a session inside the TTL is resumed", (await findDemoSession(db, UUID_B)) === UUID_B);

  const swept = await sweepExpiredDemoSessions(db);
  ok("2b: the sweep removed exactly the expired demo session", swept === 1 &&
    !db.rows("conversations").some((r) => r.id === UUID_A));
  ok("2b: the fresh demo session survives", db.rows("conversations").some((r) => r.id === UUID_B));
  ok("2b: a REAL conversation on another tenant is untouched", db.rows("conversations").some((r) => r.id === "keep-real"));
  ok("2b: a REAL conversation on the DEMO tenant is untouched (channel pin, again)",
    db.rows("conversations").some((r) => r.id === "keep-demo-tenant-real"));
  ok("2c: the expired session's demo ORDER — carrying the visitor's address — is gone too",
    !db.rows("orders").some((r) => r.id === "o-old"));
  ok("2c: the live demo order and the real tenant's order survive",
    db.rows("orders").some((r) => r.id === "o-new") && db.rows("orders").some((r) => r.id === "o-real"));

  // ORDERING IS THE CONTROL. orders.conversation_id is ON DELETE SET NULL, so deleting
  // conversations first would ORPHAN the order — the row (and the address on it) would
  // survive with nothing left saying it was a demo.
  const delOrders = db.calls.findIndex((c) => c.table === "orders" && c.op === "delete");
  const delConvs = db.calls.findIndex((c) => c.table === "conversations" && c.op === "delete");
  ok("2d: orders are deleted BEFORE conversations (SET NULL would otherwise orphan them)",
    delOrders >= 0 && delConvs >= 0 && delOrders < delConvs);
  ok("2d: every sweep delete is pinned to the demo tenant",
    db.calls.filter((c) => c.op === "delete")
      .every((c) => c.filters.some((f) => f.column === "restaurant_id" && f.value === DEMO_RESTAURANT_ID)));
}

// ═══ 3. THE CLOSE — a real order, a real number, and no page to a human ═══
const DEMO_ITEM = "0de5ca5a-0002-4a00-8a00-000000000020";
function orderFixture(): FakeDb {
  return new FakeDb({
    restaurants: [{
      id: DEMO_RESTAURANT_ID, name: "مطعم الديرة (تجريبي)", currency: "ر.س", dialect: "saudi",
      tax_mode: "added", tax_rate: 15, feature_flags: {}, payment_config: null, timezone: "Asia/Riyadh",
      business_type: "مطعم", default_language: "ar", agent_mode: "test", is_open: true,
    }],
    conversations: [{ id: UUID_A, restaurant_id: DEMO_RESTAURANT_ID, channel: DEMO_SESSION_CHANNEL, allergy_note: null, created_at: new Date().toISOString() }],
    branches: [], menu_categories: [{ id: "cat", restaurant_id: DEMO_RESTAURANT_ID, name: "أطباق رئيسية", sort: 1 }],
    menu_items: [{
      id: DEMO_ITEM, restaurant_id: DEMO_RESTAURANT_ID, category_id: "cat", name: "كبسة دجاج",
      price: 35, available: true, ingredients: [], allergens: [], created_at: "2026-01-01T00:00:00Z",
    }],
    menu_item_variants: [], menu_item_choice_groups: [], menu_item_choice_options: [],
    modifiers: [], menu_item_modifiers: [],
    delivery_zones: [{ id: "zone-olaya", restaurant_id: DEMO_RESTAURANT_ID, branch_id: null, name: "حي العليا", fee: 12, min_order: 30, eta_minutes: 45, active: true, created_at: "2026-01-01T00:00:00Z" }],
    policies: [], faqs: [], promotions: [],
    orders: [], messages: [], system_alerts: [], psp_payments: [],
  });
}
// The EXACT shape the live run died on: a delivery order with an address, confirmed,
// which the demo could never turn into an order number.
const finalizedDraft: OrderDraft = {
  lines: [{ itemId: DEMO_ITEM, name: "كبسة دجاج", quantity: 2, unitPrice: 35, variant: null, choices: [], modifiers: [], lineTotal: 70 }],
  fulfillment: "delivery", deliveryZone: "حي العليا", address: "حي العليا، الرياض", deliveryFee: 12,
  subtotal: 70, tax: 12.3, taxRate: 15, total: 94.3, currency: "ر.س",
  // No payment method — the demo takes no money, which is exactly the case that used to
  // raise a `payment_unspecified` critical alert.
  paymentMethod: null, finalized: true,
} as unknown as OrderDraft;

{
  const db = orderFixture();
  const out = await closeDemoOrder(db, {
    conversationId: UUID_A, draft: finalizedDraft, agentRunId: "run-1", reply: "تمام، أجهّز لك الطلب.",
    // The demo tenant is `dialect: "saudi"` → digitStyle "western". Without this the
    // appended confirmation was the one string on the demo path nobody formatted.
    dialect: "saudi",
  });
  const order = db.rows("orders")[0];

  ok("3a: a finalized demo draft becomes a REAL order row", db.rows("orders").length === 1);
  ok("3a: it carries a real order number allocated by the ATOMIC RPC (migration 0113)",
    db.rpcCalls.some((c) => c.name === "next_order_number") && !!out.orderNumber && out.orderNumber === order?.order_number);
  ok("3a: the number reaches the visitor, in the reply, and is not invented by a model",
    out.reply.includes(demoOrderConfirmation(String(out.orderNumber))));

  // DISTINGUISHABLE. Two markers because two different things read them.
  ok("3b: the order's source is the demo source, NEVER \"whatsapp\"",
    order?.source === DEMO_ORDER_SOURCE && order?.source !== "whatsapp");
  ok("3b: the order is stamped is_test", order?.is_test === true);
  ok("3b: it is attached to the demo tenant and the demo session",
    order?.restaurant_id === DEMO_RESTAURANT_ID && order?.conversation_id === UUID_A);

  // ── THE ALERT. persistOrderFromDraft raises `payment_unspecified` — a console banner
  //    PLUS sendAlertEmail PLUS sendAlertWhatsApp to the Founder — whenever the draft
  //    carries no payment method. A demo order never carries one.
  ok("3c: NO system_alerts row is written for a demo order with no payment method",
    db.rows("system_alerts").length === 0);

  // MONEY TRUTH, unchanged: the demo takes none.
  ok("3d: the order is unpaid and pending — no fake payment is recorded",
    order?.payment_status === "unpaid" && order?.order_status === "pending_confirmation");
  ok("3d: the visitor is told plainly that nothing was charged",
    out.reply.includes("ما تم سحب أي مبلغ"));
  ok("3d: no psp/payment session is created anywhere", db.rows("psp_payments").length === 0);

  // ── MUTATION CONTROL: the SAME draft persisted WITHOUT `demo` must alert and must be
  //    stamped whatsapp. Without this, 3b/3c could pass on a function that never alerts.
  const dbCtl = orderFixture();
  await persistOrderFromDraft(dbCtl, {
    restaurantId: DEMO_RESTAURANT_ID, conversationId: UUID_A, customerId: null,
    draft: finalizedDraft, agentRunId: "run-ctl",
  });
  const ctlOrder = dbCtl.rows("orders")[0];
  ok("3e: CONTROL — the same draft WITHOUT demo:true does raise payment_unspecified",
    dbCtl.rows("system_alerts").length === 1 &&
    (dbCtl.rows("system_alerts")[0] as Row).type === "payment_unspecified");
  ok("3e: CONTROL — and is stamped source \"whatsapp\" with no is_test",
    ctlOrder?.source === "whatsapp" && ctlOrder?.is_test === undefined);
}

// ═══ 4. HONESTY WHEN THE CLOSE FAILS — a false confirmation must be retracted ═══
{
  const db = orderFixture();
  db.hasOrderNumberRpc = true;
  // Break the orders table so the upsert throws inside persistOrderFromDraft.
  const broken = {
    from: (t: string) => (t === "orders"
      ? { select: () => { throw new Error("orders unavailable"); }, upsert: () => { throw new Error("orders unavailable"); }, insert: () => { throw new Error("x"); }, update: () => { throw new Error("x"); }, delete: () => { throw new Error("x"); } }
      : db.from(t)),
    rpc: (n: string, a: unknown) => db.rpc(n, a),
  } as unknown as Parameters<typeof closeDemoOrder>[0];
  const out = await closeDemoOrder(broken, {
    conversationId: UUID_A, draft: finalizedDraft, agentRunId: "run-2", reply: "تمام، سجّلت طلبك ✅",
    dialect: "saudi",
  });
  ok("4a: a failed persist does NOT throw the demo turn away", typeof out.reply === "string");
  ok("4a: it returns no order number rather than inventing one", out.orderNumber === null);
  ok("4b: the model's standing 'I registered it' claim is RETRACTED, not left to stand",
    out.reply.includes(demoOrderFailure()));
  ok("4b: and no fake order number is shown", !/#[٠-٩\d]+/.test(out.reply.split("⚠️")[1] ?? ""));

  // A turn that did not finalize anything must be a pure no-op.
  const db2 = orderFixture();
  const noop = await closeDemoOrder(db2, {
    conversationId: UUID_A, draft: { ...finalizedDraft, finalized: false } as OrderDraft, agentRunId: null, reply: "وش تحب تطلب؟", dialect: "saudi",
  });
  ok("4c: an unfinalized draft writes nothing and leaves the reply untouched",
    db2.rows("orders").length === 0 && noop.reply === "وش تحب تطلب؟" && noop.orderNumber === null);

  const db3 = orderFixture();
  const nosession = await closeDemoOrder(db3, {
    conversationId: null, draft: finalizedDraft, agentRunId: null, reply: "خلاص", dialect: "saudi",
  });
  ok("4c: no session (the stateless fallback) writes no order either",
    db3.rows("orders").length === 0 && nosession.orderNumber === null);

  // THE APPENDED LINE FOLLOWS THE TENANT. `demoOrderConfirmation` used to call
  // toArabicDigits() itself, forcing «برقم #١٠٠١» on a tenant whose profile declares
  // digitStyle:"western" — seen live on order #1001. The number is now the route's
  // formatter's decision, driven by `dialect`, so both directions are pinned here.
  {
    const dbW = orderFixture();
    const western = await closeDemoOrder(dbW, {
      conversationId: UUID_A, draft: finalizedDraft, agentRunId: "run-3", reply: "تمام", dialect: "saudi",
    });
    ok("4e: a western-digit tenant sees the order number in ASCII",
      !!western.orderNumber && western.reply.includes(`#${western.orderNumber}`) && !/[٠-٩]/.test(western.reply));

    const dbA = orderFixture();
    const arabic = await closeDemoOrder(dbA, {
      conversationId: UUID_A, draft: finalizedDraft, agentRunId: "run-4", reply: "تمام", dialect: "egyptian",
    });
    ok("4e: an arabic-indic tenant sees the SAME number in Arabic-Indic",
      !!arabic.orderNumber && !/#[0-9]/.test(arabic.reply) && /#[٠-٩]+/.test(arabic.reply));
  }

  // The customer-facing copy is Saudi, because the demo tenant is.
  ok("4d: the demo's own copy passes the project's dialect linter",
    findLeakage(demoOrderConfirmation("1042")).ok && findLeakage(demoOrderFailure()).ok);
}

// ═══ 5. ★ THE ALERT SUPPRESSION, END TO END THROUGH runCustomerTurn ★ ═══
//
// This is the assertion the whole change hangs on. A demo turn now HAS a conversation
// id, and the deterministic allergen gate — which runs unconditionally, on every tenant
// — emits `notify_without_hold`, the exact signal that drives recordCriticalAlert.
//
// The turn below takes the deterministic branch, so it makes NO model call and needs no
// LLM key: `combinedAllergenHit.fired` short-circuits to forcedAllergenSafetyResult.
function turnFixture(): FakeDb {
  const db = orderFixture();
  (db.tables.restaurants[0] as Row).feature_flags = {
    khalid_persona: true, khalid_region: "najd", goal_logic: true, perception: true,
    deterministic_allergen_safety: true, allergen_symptom_detection: true,
    dup_order_awareness: true, customer_memory: true, stateful_orders: true,
  };
  db.tables.customer_memory = []; db.tables.standing_instructions = []; db.tables.tonight_notes = [];
  db.tables.conversation_signals = []; db.tables.agent_runs = []; db.tables.zone_misses = [];
  db.tables.conversation_allergy_events = []; db.tables.system_alerts = [];
  return db;
}
const ALLERGEN_MESSAGE = "عندي حساسية من المكسرات";

{
  const db = turnFixture();
  const out = await runCustomerTurn(db, {
    restaurantId: DEMO_RESTAURANT_ID,
    conversationId: UUID_A,          // the demo NOW has one — this is the new reality
    history: [],
    userMessage: ALLERGEN_MESSAGE,
    persistReply: true,
    demoRun: true,
  });

  ok("5a: the deterministic allergen gate fired (no model call was needed)",
    out.model === "deterministic_allergen_gate");
  ok("5a: it produced the notify_without_hold signal that drives the alert loop",
    out.signals.some((s) => s.type === "notify_without_hold"));

  // ★ THE LINE. ★
  ok("5b: ★ NO system_alerts row — the Founder is not paged by a stranger on a sales page",
    db.rows("system_alerts").length === 0);

  ok("5c: conversation_signals is still skipped entirely on a demo turn",
    db.rows("conversation_signals").length === 0);
  const runRow = db.rows("agent_runs").find((r) => r.trigger === "customer");
  ok("5d: the agent_runs cost row is still written (the spend monitor must see it)",
    !!runRow && typeof runRow.cost_usd === "number");
  ok("5d: but the visitor's verbatim message and the reply are NOT stored",
    runRow?.input === null && runRow?.output === null);
  ok("5e: no ownership flip and no staff message were written",
    !db.rows("messages").some((m) => m.sender === "system") &&
    db.rows("conversations").every((c) => c.owner !== "human" && c.ownership_state !== "HUMAN_ACTIVE"));
  ok("5f: no allergy audit row carrying the visitor's words",
    db.rows("conversation_allergy_events").length === 0);

  // The DEMO still works: the reply row + basket draft are persisted, which is the
  // entire point of giving it a conversation.
  const aiMsg = db.rows("messages").find((m) => m.sender === "ai");
  ok("5g: the AI reply row IS written, carrying the draft — this is what fixes the basket",
    !!aiMsg && !!(aiMsg.meta as Row | undefined)?.draft);
  ok("5g: no INBOUND message row is written (an inbound row would arm delivery_silence,\n" +
     "      which WhatsApps the Founder when an open test tenant goes quiet)",
    !db.rows("messages").some((m) => m.direction === "inbound" || m.sender === "customer"));
  ok("5h: the demo reply does not claim the team was alerted",
    !out.reply.includes("نبّهت الفريق"));
}

// ── MUTATION CONTROL for §5: the identical turn WITHOUT demoRun must alert. ──
{
  const db = turnFixture();
  await runCustomerTurn(db, {
    restaurantId: DEMO_RESTAURANT_ID,
    conversationId: UUID_A,
    history: [],
    userMessage: ALLERGEN_MESSAGE,
    persistReply: true,
    // demoRun deliberately omitted — a normal tenant turn.
  });
  ok("5i: CONTROL — the SAME turn without demoRun DOES write a system_alerts row",
    db.rows("system_alerts").length >= 1 &&
    db.rows("system_alerts").some((a) => a.type === "safety_notify_no_hold"));
  ok("5i: CONTROL — and DOES write conversation_signals",
    db.rows("conversation_signals").length >= 1);
  ok("5i: CONTROL — and DOES store the customer's verbatim message on agent_runs",
    db.rows("agent_runs").some((r) => r.input === ALLERGEN_MESSAGE));
  ok("5i: CONTROL — the real-tenant reply still promises the kitchen note + staff alert",
    db.rows("messages").some((m) => String(m.text ?? "").includes("نبّهت الفريق")));
}

// ═══ 6. THE CENSUS — no staff-facing effect is left gated on a bare conversationId ═══
//
// §5 proves the alert loop. This proves nobody can quietly ADD a new staff-facing effect
// behind `if (conversationId)` and have it fire on the demo. It is a count, deliberately:
// a presence check would not notice a new site.
{
  const ct = read("lib/ai/customer-turn.ts");
  ok("6a: the gate exists and is derived from demoRun, not from the conversation id",
    /const staffFacingConversationId = input\.demoRun === true \? null : conversationId;/.test(ct));

  // Every staff-facing effect, named, with the variable it must be gated on.
  const gated: Array<[string, RegExp]> = [
    ["the recordCriticalAlert loop", /if \(staffFacingConversationId\) \{\s*\n\s*const notifies:/],
    ["the ownership flip + staff message", /result\.escalate && explicitHuman && staffFacingConversationId/],
    ["the calm-hold SYSTEM_HOLD + alert", /enterCalmAllergyHold\(admin, \{ restaurantId, conversationId: staffFacingConversationId/],
    ["the companion post-commit alert", /companionDecision && staffFacingConversationId/],
    ["the checkpoint audit row", /companionOn && staffFacingConversationId && result\.stopReason === "allergy_checkpoint"/],
    ["the banned-phrase audit row", /companionOn && staffFacingConversationId\) \{/],
    ["the checkpoint-ack audit row", /if \(!staffFacingConversationId\) return;/],
    ["the pin zone-miss row", /\} else if \(staffFacingConversationId\) \{/],
    ["the address zone-miss row", /if \(staffFacingConversationId\) \{\s*\n\s*for \(const signal of result\.signals\)/],
    ["the rule6 shadow signal row", /staffFacingConversationId &&\s*\n\s*goalLogicOn/],
    ["the abandoned conversation report", /if \(staffFacingConversationId && \(lifecycle\.action/],
  ];
  for (const [what, re] of gated) ok(`6b: ${what} is gated on staffFacingConversationId`, re.test(ct));

  // recordCriticalAlert must have exactly ONE reachable call site in this file, and it
  // must be inside the gated block. (The other is inside enterCalmAllergyHold, which
  // early-returns on a null id — asserted separately below.)
  const alertSites = ct.match(/await recordCriticalAlert\(admin, \{/g) ?? [];
  ok("6c: customer-turn has exactly the two known recordCriticalAlert sites",
    alertSites.length === 2);
  ok("6c: enterCalmAllergyHold still early-returns before its alert when the id is null",
    /if \(!args\.conversationId\) return reason;[\s\S]{0,900}recordCriticalAlert\(admin, \{/.test(ct));

  // conversation_signals: BOTH writers must be demo-suppressed. The flush was always
  // `!input.demoRun`; the rule6 shadow log was not, and `goal_logic` IS on for the demo
  // tenant, so it was a live path.
  const sigWrites = ct.match(/from\("conversation_signals"\)\s*\n?\s*\.insert\(/g) ?? [];
  ok("6d: there are exactly two conversation_signals writers, both demo-suppressed",
    sigWrites.length === 2 && /if \(result\.signals\.length && !input\.demoRun\)/.test(ct));

  // The routes must keep BOTH controls. Losing demoRun while keeping the session id is
  // the specific regression this whole file exists to prevent.
  for (const p of ["app/api/demo/turn/route.ts", "app/api/demo/voice/route.ts"]) {
    const src = codeOf(p);
    ok(`6e: ${p} passes a resolved session id`, /resolveDemoSession\(/.test(src) && /conversationId,/.test(src));
    ok(`6e: ${p} still passes demoRun: true`, /demoRun:\s*true/.test(src));
    ok(`6e: ${p} pins the tenant and never reads it from the request`,
      /restaurantId:\s*DEMO_RESTAURANT_ID/.test(src) && !/restaurantId:\s*String\(/.test(src));
    ok(`6e: ${p} closes the order through the demo helper`, /closeDemoOrder\(/.test(src));
  }
  // The demo tenant must never gain a PSP.
  const seed = read("scripts/seed-demo-ksa-tenant.mjs");
  ok("6f: the seed still does NOT enable psp_payments", !/psp_payments:\s*true/.test(seed));
}

// ═══ 7. SESSION ROWS CANNOT BE SPAMMED, AND THE SPEND LEDGER SURVIVES THE SWEEP ═══
{
  // A request with no session id MINTS one. If that ran before the durable spend guard,
  // a public URL would be an unbounded row-insert primitive costing the sender nothing.
  // It must sit behind the same cap as everything else the demo does.
  const anchors = (src: string, a: string, b: string) => {
    const ia = src.indexOf(a), ib = src.indexOf(b);
    return ia >= 0 && ib >= 0 && ia < ib;
  };
  for (const p of ["app/api/demo/turn/route.ts", "app/api/demo/voice/route.ts"]) {
    const src = codeOf(p);
    ok(`7a: ${p} consumes the spend guard BEFORE minting a session`,
      anchors(src, "kv_demo_try_consume", "resolveDemoSession("));
    ok(`7a: ${p} still mints before the model call`,
      anchors(src, "resolveDemoSession(", "runCustomerTurn("));
    ok(`7b: ${p} hands the session id back so the client can hold it`,
      /ok: true,\s*\n\s*conversationId,/.test(src));
  }

  // The TTL sweep deletes the conversation. `agent_runs.conversation_id` is ON DELETE
  // SET NULL, so the COST rows survive with their link cleared — lib/monitoring/sweep.ts
  // sums agent_runs.cost_usd for the daily-spend alert, and losing those rows to a
  // privacy sweep would blind the only spend monitor that exists.
  const init = read("supabase/migrations/0001_init.sql");
  const agentRuns = init.slice(init.indexOf("create table if not exists public.agent_runs"), init.indexOf("create table if not exists public.agent_runs") + 900);
  ok("7c: agent_runs.conversation_id is ON DELETE SET NULL, so sweeping a demo session keeps its cost row",
    /conversation_id uuid references public\.conversations\(id\) on delete set null/.test(agentRuns));
  // messages, by contrast, must CASCADE — that is what removes the stored basket.
  const messages = init.slice(init.indexOf("create table if not exists public.messages"), init.indexOf("create table if not exists public.messages") + 700);
  ok("7c: messages CASCADE with the conversation, so the stored draft goes with it",
    /conversation_id uuid not null references public\.conversations\(id\) on delete cascade/.test(messages));
  // orders SET NULL — which is precisely why the sweep must delete them explicitly first.
  const orders = init.slice(init.indexOf("create table if not exists public.orders"), init.indexOf("create table if not exists public.orders") + 700);
  ok("7c: orders SET NULL — the reason the sweep deletes demo orders explicitly, first",
    /conversation_id uuid references public\.conversations\(id\) on delete set null/.test(orders));
}

console.log(`\nDEMO-ORDER PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
