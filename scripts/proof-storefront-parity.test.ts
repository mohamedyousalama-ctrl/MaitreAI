// WO-STOREFRONT-PARITY route-level proof.
// Run: node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types scripts/proof-storefront-parity.test.ts

import { __setTestAdminClient } from "../lib/supabase/admin.ts";
import { POST } from "../app/api/storefront/orders/route.ts";

const RESTAURANT_ID = "rest-1";
const CUSTOMER_ID = "cust-1";
const BRANCH_ID = "branch-1";
const ZONE_ID = "zone-1";
const ITEM_ID = "item-1";
const T0 = Date.parse("2026-07-14T08:00:00.000Z");

let pass = 0, fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) pass++;
  else {
    fail++;
    console.error("  FAIL", name);
  }
}

type Row = Record<string, any>;

function makeStorefrontPayload(patch: Record<string, unknown> = {}) {
  return {
    slug: "demo",
    customerName: "Sara",
    customerPhone: "+966500000000",
    fulfillment: "delivery",
    branchId: BRANCH_ID,
    zoneId: ZONE_ID,
    address: "Riyadh",
    paymentMethod: "cod",
    notes: "",
    lines: [{ itemId: ITEM_ID, quantity: 1 }],
    ...patch,
  };
}

function makeAdmin(opts: { deliveryFails?: boolean } = {}) {
  const state = {
    orders: [] as Row[],
    conversations: [] as Row[],
    messages: [] as Row[],
    deliveries: [] as Row[],
    deliveryFails: opts.deliveryFails === true,
  };

  const resultFor = (q: Row, single: boolean) => {
    const table = q.table as string;
    const op = q.op as string | null;

    if (table === "restaurants") {
      const storefrontRead = /active|payment_config|feature_flags/.test(q.selectCols ?? "");
      const data = storefrontRead
        ? {
            id: RESTAURANT_ID,
            name: "Demo",
            currency: "ر.س",
            active: true,
            is_open: true,
            payment_config: { cod_enabled: true },
            feature_flags: {},
          }
        : {
            name: "Demo",
            logo_url: "",
            phone: "",
            email: "",
            currency: "ر.س",
            default_language: "ar",
            timezone: "Asia/Riyadh",
            business_type: "",
            tax_mode: "inclusive",
            tax_rate: 0,
          };
      return { data, error: null };
    }

    if (table === "branches") return { data: [{ id: BRANCH_ID, name: "Main", active: true, hours: {}, address: "", phone: "" }], error: null };
    if (table === "menu_categories") return { data: [], error: null };
    if (table === "menu_items") return { data: [{
      id: ITEM_ID, category_id: null, name: "Cake", description: "", price: 100, image_url: "",
      available: true, ingredients: [], allergens: [], allergens_reviewed_at: null,
    }], error: null };
    if (table === "menu_item_variants") return { data: [], error: null };
    if (table === "menu_item_choice_groups") return { data: [], error: null };
    if (table === "menu_item_choice_options") return { data: [], error: null };
    if (table === "modifiers") return { data: [], error: null };
    if (table === "menu_item_modifiers") return { data: [], error: null };
    if (table === "delivery_zones") return { data: [{ id: ZONE_ID, name: "Zone", branch_id: BRANCH_ID, fee: 10, min_order: 0, eta_minutes: 30, active: true }], error: null };
    if (table === "policies" || table === "faqs" || table === "promotions") return { data: [], error: null };

    if (table === "customers" && op === "upsert") return { data: { id: CUSTOMER_ID }, error: null };

    if (table === "conversations" && op === "insert") {
      const row = { id: `conv-${state.conversations.length + 1}`, ...q.payload };
      state.conversations.push(row);
      return { data: single ? { id: row.id } : [{ id: row.id }], error: null };
    }

    if (table === "messages" && op === "insert") {
      const rows = Array.isArray(q.payload) ? q.payload : [q.payload];
      state.messages.push(...rows);
      return { data: rows, error: null };
    }

    if (table === "orders" && op === "upsert") {
      const row = { created_at: new Date(Date.now()).toISOString(), ...q.payload };
      const existing = state.orders.find((o) => o.id === row.id);
      if (existing) return { data: [], error: null };
      state.orders.push(row);
      return { data: [pickOrder(row)], error: null };
    }

    if (table === "orders" && op === "select") {
      let rows = state.orders;
      const idFilter = q.filters.find((f: Row) => f.method === "eq" && f.col === "id");
      if (idFilter) rows = rows.filter((r) => r.id === idFilter.value);
      const restaurantFilter = q.filters.find((f: Row) => f.method === "eq" && f.col === "restaurant_id");
      if (restaurantFilter) rows = rows.filter((r) => r.restaurant_id === restaurantFilter.value);
      const row = rows[0] ?? null;
      if (/fulfillment/.test(q.selectCols ?? "") && !/order_number/.test(q.selectCols ?? "")) {
        return { data: row ? { fulfillment: row.fulfillment } : null, error: null };
      }
      return { data: single ? (row ? pickOrder(row) : null) : rows.map(pickOrder), error: null };
    }

    if (table === "deliveries" && op === "upsert") {
      if (state.deliveryFails) return { data: null, error: { message: "delivery failed" } };
      const existing = state.deliveries.find((d) => d.order_id === q.payload.order_id);
      if (existing) return { data: [], error: null };
      const row = { id: `del-${state.deliveries.length + 1}`, ...q.payload };
      state.deliveries.push(row);
      return { data: [{ id: row.id }], error: null };
    }

    if (table === "deliveries" && op === "select") {
      const orderFilter = q.filters.find((f: Row) => f.method === "eq" && f.col === "order_id");
      const row = state.deliveries.find((d) => d.order_id === orderFilter?.value) ?? null;
      return { data: row ? { id: row.id } : null, error: null };
    }

    if (table === "delivery_events" && op === "insert") return { data: q.payload, error: null };
    if (table === "order_payment_snapshot" && op === "insert") return { data: q.payload, error: null };

    return { data: single ? null : [], error: null };
  };

  const from = (table: string) => {
    const q: Row = { table, op: "select", selectCols: "", payload: null, filters: [] as Row[] };
    const b: Row = {};
    b.select = (cols = "*") => { q.op = q.op ?? "select"; q.selectCols = cols; return b; };
    b.insert = (payload: unknown) => { q.op = "insert"; q.payload = payload; return b; };
    b.upsert = (payload: unknown) => { q.op = "upsert"; q.payload = payload; return b; };
    b.update = (payload: unknown) => { q.op = "update"; q.payload = payload; return b; };
    for (const method of ["eq", "ilike", "gte", "order", "limit", "in"]) {
      b[method] = (col: string, value: unknown) => { q.filters.push({ method, col, value }); return b; };
    }
    b.single = async () => resultFor(q, true);
    b.maybeSingle = async () => resultFor(q, true);
    b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resultFor(q, false)).then(resolve, reject);
    return b;
  };

  return { client: { from, rpc: async () => ({ data: null, error: null }) }, state };
}

function pickOrder(row: Row) {
  return {
    id: row.id,
    order_number: row.order_number,
    total: row.total,
    subtotal: row.subtotal,
    delivery_fee: row.delivery_fee,
    tax_amount: row.tax_amount,
    tax_rate: row.tax_rate,
    currency: row.currency,
  };
}

async function postWith(stateful: ReturnType<typeof makeAdmin>, payload: unknown, nowMs: number) {
  const originalNow = Date.now;
  Date.now = () => nowMs;
  __setTestAdminClient(stateful.client);
  try {
    const res = await POST(new Request("https://x/api/storefront/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }) as never);
    const body = await (res as any).json();
    return { status: (res as any).status as number, body };
  } finally {
    Date.now = originalNow;
    __setTestAdminClient(undefined);
  }
}

// Allergen-language storefront order: persisted, human-visible, held, not clean-confirmed.
const allergenDb = makeAdmin();
const allergenRes = await postWith(allergenDb, makeStorefrontPayload({ notes: "عندي حساسية من بندق" }), T0);
const allergenOrder = allergenDb.state.orders[0];
const allergenConv = allergenDb.state.conversations[0];
ok("allergen storefront order returns accepted/review response", allergenRes.status === 202 && allergenRes.body.safetyReview === true);
ok("allergen storefront order is created, not black-holed", allergenDb.state.orders.length === 1);
ok("allergen order stays pending_confirmation", allergenOrder?.order_status === "pending_confirmation");
ok("allergen order links to a conversation humans can see", !!allergenOrder?.conversation_id && allergenOrder.conversation_id === allergenConv?.id);
ok("linked conversation is a structured safety hold", allergenConv?.is_safety_hold === true && allergenConv?.ownership_state === "SYSTEM_HOLD");
ok("allergen order carries a kitchen/staff allergy note", typeof allergenOrder?.allergy_note === "string" && /بندق|حساسية/.test(allergenOrder.allergy_note));

// Idempotency: rapid double-submit dedupes, while a fresh identical order an hour later does not.
const dedupeDb = makeAdmin();
const first = await postWith(dedupeDb, makeStorefrontPayload(), T0);
const rapid = await postWith(dedupeDb, makeStorefrontPayload(), T0 + 5_000);
const later = await postWith(dedupeDb, makeStorefrontPayload(), T0 + 60 * 60_000);
ok("first normal storefront submit creates an order", first.status === 200 && first.body.created === true);
ok("rapid identical re-POST dedupes to the existing order", rapid.status === 200 && rapid.body.created === false && rapid.body.orderId === first.body.orderId);
ok("same order one hour later creates a fresh order", later.status === 200 && later.body.created === true && later.body.orderId !== first.body.orderId);

// Delivery row failure must not return success.
const deliveryFailDb = makeAdmin({ deliveryFails: true });
const deliveryFail = await postWith(deliveryFailDb, makeStorefrontPayload(), T0);
ok("delivery row failure does not return success", deliveryFail.status >= 500);
ok("delivery row failure reports delivery/order creation failure", /توصيل|إنشاء|انشاء|تأكيد/.test(String(deliveryFail.body.error ?? "")));

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} storefront-parity proof: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
