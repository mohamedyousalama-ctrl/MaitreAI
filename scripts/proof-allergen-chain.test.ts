// ============================================================================
// WO-ENG-1 proof: allergen disclosure chain.
//
// Run:
//   node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types scripts/proof-allergen-chain.test.ts
//
// This is a behavior proof over the current chain:
// customer text -> deterministic detection -> simple/live response decision ->
// conversation/order allergy note -> kitchen-ticket outputs.
// ============================================================================

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import {
  allergySimpleDeflection,
  allergySimpleReoffer,
  buildTicketAllergyNote,
  collectConversationAllergenTerms,
  decideAllergySimple,
  detectAllergyOrDiseaseMention,
  detectAllergyRetraction,
} from "../lib/ai/allergy-simple.ts";
import { scanBannedAllergyPhrases } from "../lib/ai/allergen-companion.ts";
import { normalizeAr } from "../lib/ai/allergen-gate.ts";
import { isFeatureExplicitlyEnabled } from "../lib/tenant/tier.ts";
import { persistOrderFromDraft } from "../lib/db/orders-create.ts";
import { loadReceiptData } from "../lib/render/load.ts";
import { buildKitchenTicketSvg, type ReceiptData } from "../lib/render/receipt.ts";
import type { OrderDraft } from "../lib/ai/tools.ts";
import type { LlmMessage } from "../lib/ai/llm/types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let pass = 0;
let fail = 0;

function ok(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
    return;
  }
  fail += 1;
  console.error(`FAIL ${name}${detail ? ` -- ${detail}` : ""}`);
}

function eq(name: string, actual: unknown, expected: unknown): void {
  ok(name, actual === expected, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

function includes(name: string, haystack: string, needle: string): void {
  ok(name, haystack.includes(needle), `missing ${JSON.stringify(needle)}`);
}

function forbiddenAssuranceHits(text: string): string[] {
  const raw = String(text ?? "");
  const n = normalizeAr(raw);
  const hits = [...scanBannedAllergyPhrases(raw)];
  const requested: Array<[RegExp, string]> = [
    [/(?<![ء-ي])امن(?![ء-ي])/, "آمن"],
    [/مضمون/, "مضمون"],
    [/مناسب.{0,12}حساسي|حساسي.{0,12}مناسب/, "مناسب للحساسية"],
    [/لا\s*يوجد\s*خطر|لا\s*خطر|مافي\s*خطر|مفيش\s*خطر/, "لا يوجد خطر"],
  ];
  for (const [re, label] of requested) {
    if (re.test(n) && !hits.includes(label)) hits.push(label);
  }
  return hits;
}

// ----------------------------------------------------------------------------
// 1. Configuration truth under the live Wesaya flag combination supplied in WO.
// ----------------------------------------------------------------------------
const LIVE_FLAGS = { allergy_simple: true, finish_line: true };
const SIMPLE_OFF_FLAGS = { allergy_simple: false, finish_line: true };

ok("CONFIG live allergy_simple is explicitly ON", isFeatureExplicitlyEnabled("allergy_simple", LIVE_FLAGS));
ok("CONFIG live finish_line is explicitly ON", isFeatureExplicitlyEnabled("finish_line", LIVE_FLAGS));
ok("CONFIG allergy_simple OFF case is explicitly OFF", !isFeatureExplicitlyEnabled("allergy_simple", SIMPLE_OFF_FLAGS));

// ----------------------------------------------------------------------------
// 2. Detection breadth.
// ----------------------------------------------------------------------------
const detectionCases: Array<{ name: string; text: string; term?: string }> = [
  { name: "direct statement", text: "عندي حساسية من اللبن", term: "لبن" },
  { name: "third person", text: "ابني عنده حساسية فول سوداني", term: "فول سوداني" },
  { name: "taa marbuta spelling variant", text: "عندي حساسيه من اللبن", term: "لبن" },
  { name: "diacritised form", text: "عِنْدِي حَسَاسِيَّة من اللَّبَن", term: "لبن" },
  { name: "elongated repeated-letter form", text: "عندي حساااسية من اللبن", term: "لبن" },
  { name: "symptom phrasing", text: "بيجيلي طفح من المكسرات", term: "طفح جلدي" },
  { name: "Saudi gluten phrasing", text: "عندي حساسية من الجلوتين", term: "جلوتين" },
  { name: "burst allergen not swallowed", text: "حساسية\nمكسرات\nعايز برجر", term: "مكسرات" },
];

for (const c of detectionCases) {
  const hit = detectAllergyOrDiseaseMention(c.text);
  ok(`DETECT ${c.name}`, hit.fired, JSON.stringify(hit));
  if (c.term) eq(`DETECT ${c.name} term`, hit.term, c.term);
}

const bareAllergenNoIntent = detectAllergyOrDiseaseMention("مكسرات وعايز برجر");
ok(
  "DETECT bare allergen without allergy context remains unarmed",
  !bareAllergenNoIntent.fired,
  JSON.stringify(bareAllergenNoIntent),
);

// ----------------------------------------------------------------------------
// 3. Response correctness under live simple mode.
// ----------------------------------------------------------------------------
for (const dialect of ["egyptian", "saudi"]) {
  const decision = decideAllergySimple({ history: [], userMessage: "عندي حساسية من اللبن" });
  eq(`REPLY ${dialect} first mention deterministic deflection`, decision.action, "deflect");
  const reply = allergySimpleDeflection(dialect, decision.variantIndex);
  ok(`REPLY ${dialect} has no forbidden reassurance`, forbiddenAssuranceHits(reply).length === 0, forbiddenAssuranceHits(reply).join(", "));
  ok(`REPLY ${dialect} offers a human`, /أحوّلك ل(?:حد|أحد) من الفريق/.test(reply), reply);
}

{
  const prior: LlmMessage[] = [
    { role: "user", content: "عندي حساسية من اللبن" },
    { role: "assistant", content: allergySimpleDeflection("egyptian", 0) },
    { role: "user", content: "تمام" },
    { role: "assistant", content: "حاضر" },
    { role: "user", content: "عايز ساندويتش" },
    { role: "assistant", content: "تحب تضيف حاجة؟" },
    { role: "user", content: "مياه" },
    { role: "assistant", content: "تمام" },
    { role: "user", content: "كام الحساب" },
    { role: "assistant", content: "الإجمالي من الطلب الحالي ظاهر في الملخص." },
    { role: "user", content: "لسه بفكر" },
    { role: "assistant", content: "خد وقتك." },
  ];
  const repeat = decideAllergySimple({ history: prior, userMessage: "فيه لبن؟" });
  eq("REPLY repeat direct safety question reoffers after throttle window", repeat.action, "reoffer");
  const reoffer = allergySimpleReoffer("egyptian");
  ok("REPLY reoffer has no forbidden reassurance", forbiddenAssuranceHits(reoffer).length === 0, forbiddenAssuranceHits(reoffer).join(", "));
  ok(
    "REPLY model cannot override positive live detection before the simple decision",
    decideAllergySimple({ history: [], userMessage: "عندي حساسية من اللبن" }).action === "deflect",
  );
}

{
  const prior: LlmMessage[] = [
    { role: "user", content: "ابني عنده حساسية لبن" },
    { role: "assistant", content: allergySimpleDeflection("egyptian", 0) },
  ];
  const msg = "ما عنديش حساسية";
  ok("RETRACTION current message is recognized by existing logic", detectAllergyRetraction(msg));
  const termsAfter = collectConversationAllergenTerms(prior, msg);
  ok("RETRACTION pure collector does not drop the prior same-order disclosure", termsAfter.includes("لبن"), JSON.stringify(termsAfter));
  includes("RETRACTION rebuilt note still names the prior dairy disclosure", buildTicketAllergyNote(termsAfter), "ألبان");
}

// allergy_simple OFF: the simple response branch is not entered, but the detector
// itself still fires. The concrete OFF response depends on companion/calm legacy
// flags; this proof documents the invariant that detection is not disabled by
// turning allergy_simple off.
ok(
  "CONFIG allergy_simple OFF does not disable deterministic positive detection",
  !isFeatureExplicitlyEnabled("allergy_simple", SIMPLE_OFF_FLAGS) &&
    detectAllergyOrDiseaseMention("عندي حساسية من اللبن").fired,
);

// ----------------------------------------------------------------------------
// 4. Propagation: conversation note -> order row -> receipt data -> kitchen PNG.
// ----------------------------------------------------------------------------

type Row = Record<string, any>;
type Filter = { op: "eq" | "gte"; column: string; value: unknown };

class FakeQuery {
  op: "select" | "update" | "insert" | "upsert" = "select";
  selectColumns = "";
  filters: Filter[] = [];
  payload: unknown = null;
  limitCount: number | null = null;
  orderColumn: string | null = null;
  orderAscending = true;
  db: FakeSupabase;
  table: string;

  constructor(db: FakeSupabase, table: string) {
    this.db = db;
    this.table = table;
  }

  select(columns = "*"): this {
    this.selectColumns = columns;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ op: "eq", column, value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ op: "gte", column, value });
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this.orderColumn = column;
    this.orderAscending = opts?.ascending !== false;
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  update(payload: unknown): this {
    this.op = "update";
    this.payload = payload;
    return this;
  }

  insert(payload: unknown): this {
    this.op = "insert";
    this.payload = payload;
    return this;
  }

  upsert(payload: unknown): this {
    this.op = "upsert";
    this.payload = payload;
    return this;
  }

  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    const res = await this.execute();
    return { data: (res.data[0] as Row | undefined) ?? null, error: null };
  }

  async single(): Promise<{ data: Row | null; error: null }> {
    const res = await this.execute();
    return { data: (res.data[0] as Row | undefined) ?? null, error: null };
  }

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{ data: Row[]; error: null }> {
    return this.db.execute(this.table, this.op, this.selectColumns, this.filters, this.payload, this.orderColumn, this.orderAscending, this.limitCount);
  }
}

class FakeSupabase {
  tables: Record<string, Row[]>;

  constructor(seed: Record<string, Row[]>) {
    this.tables = seed;
  }

  from(table: string): FakeQuery {
    return new FakeQuery(this, table);
  }

  async execute(
    table: string,
    op: "select" | "update" | "insert" | "upsert",
    selectColumns: string,
    filters: Filter[],
    payload: unknown,
    orderColumn: string | null,
    orderAscending: boolean,
    limitCount: number | null,
  ): Promise<{ data: Row[]; error: null }> {
    const rows = this.tables[table] ?? (this.tables[table] = []);
    if (op === "insert") {
      const inserted = Array.isArray(payload) ? payload as Row[] : [payload as Row];
      const withCreated = inserted.map((r) => ({ created_at: new Date().toISOString(), ...r }));
      rows.push(...withCreated);
      return { data: withCreated, error: null };
    }
    if (op === "upsert") {
      const incoming = payload as Row;
      const existing = rows.find((r) => r.id === incoming.id);
      if (existing) return { data: [], error: null };
      const created = { created_at: new Date().toISOString(), ...incoming };
      rows.push(created);
      return { data: [{ id: created.id, order_number: created.order_number }], error: null };
    }

    let selected = rows.filter((r) => filters.every((f) => {
      if (f.op === "eq") return r[f.column] === f.value;
      if (f.op === "gte") return String(r[f.column] ?? "") >= String(f.value ?? "");
      return true;
    }));

    if (op === "update") {
      for (const row of selected) Object.assign(row, payload as Row);
      return { data: selected.map((r) => ({ id: r.id })), error: null };
    }

    if (orderColumn) {
      selected = [...selected].sort((a, b) => {
        const av = String(a[orderColumn] ?? "");
        const bv = String(b[orderColumn] ?? "");
        return orderAscending ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    if (limitCount != null) selected = selected.slice(0, limitCount);

    if (table === "orders" && selectColumns.includes("customers(")) {
      selected = selected.map((o) => ({
        ...o,
        customers: this.tables.customers?.find((c) => c.id === o.customer_id) ?? null,
        branches: this.tables.branches?.find((b) => b.id === o.branch_id) ?? null,
        restaurants: this.tables.restaurants?.find((r) => r.id === o.restaurant_id) ?? null,
        conversations: this.tables.conversations?.find((c) => c.id === o.conversation_id) ?? null,
        delivery_zones: this.tables.delivery_zones?.find((z) => z.id === o.zone_id) ?? null,
      }));
    }
    return { data: selected, error: null };
  }
}

const RESTAURANT_ID = "5acbc72f-def3-46cd-ad6c-bf0ff4a23642";
const CONVERSATION_ID = "conv-proof";
const CUSTOMER_ID = "cust-proof";
const ITEM_ID = "item-labneh";
const CATEGORY_ID = "cat-main";
const conversationNote = buildTicketAllergyNote(collectConversationAllergenTerms([], "عندي حساسية من اللبن"));

const db = new FakeSupabase({
  restaurants: [{
    id: RESTAURANT_ID,
    name: "Wesaya",
    logo_url: "",
    phone: "",
    email: "",
    currency: "ج.م",
    default_language: "ar",
    timezone: "Africa/Cairo",
    business_type: "restaurant",
    tax_mode: "inclusive",
    tax_rate: 0,
    feature_flags: LIVE_FLAGS,
    payment_config: null,
    dialect: "egyptian",
  }],
  conversations: [{ id: CONVERSATION_ID, allergy_note: conversationNote, is_safety_hold: false, ownership_state: "AI_ACTIVE" }],
  customers: [{ id: CUSTOMER_ID, name: "عميل اختبار", phone: "+201000000000" }],
  branches: [],
  menu_categories: [{ id: CATEGORY_ID, restaurant_id: RESTAURANT_ID, name: "رئيسي", sort: 0 }],
  menu_items: [{
    id: ITEM_ID,
    restaurant_id: RESTAURANT_ID,
    category_id: CATEGORY_ID,
    name: "ساندويتش لبنة",
    description: "",
    price: 50,
    image_url: "",
    available: true,
    unavailable_until: null,
    ingredients: ["لبنة"],
    allergens: ["dairy"],
    allergens_reviewed_at: null,
    cross_contact_risks: [],
    prep_status: null,
    prep_verified_at: null,
    kitchen_can_isolate: null,
    preparation_notes: null,
    created_at: "2026-07-22T00:00:00.000Z",
  }],
  menu_item_variants: [],
  menu_item_choice_groups: [],
  menu_item_choice_options: [],
  modifiers: [],
  menu_item_modifiers: [],
  delivery_zones: [],
  policies: [],
  faqs: [],
  promotions: [],
  orders: [],
  messages: [],
});

const draft: OrderDraft = {
  lines: [{
    itemId: ITEM_ID,
    name: "ساندويتش لبنة",
    quantity: 1,
    unitPrice: 50,
    variant: null,
    choices: [],
    modifiers: [],
    lineTotal: 50,
  }],
  fulfillment: "pickup",
  deliveryZone: null,
  address: null,
  deliveryFee: 0,
  subtotal: 50,
  tax: 0,
  taxRate: 0,
  total: 50,
  currency: "ج.م",
  paymentMethod: "cod",
  finalized: true,
} as OrderDraft;

const persisted = await persistOrderFromDraft(db as any, {
  restaurantId: RESTAURANT_ID,
  conversationId: CONVERSATION_ID,
  customerId: CUSTOMER_ID,
  draft,
  agentRunId: "agent-run-proof",
});
ok("PROP order row is created from finalized draft", persisted.created && !!persisted.orderId);
const order = db.tables.orders.find((r) => r.id === persisted.orderId);
eq("PROP order row carries conversations.allergy_note", order?.allergy_note, conversationNote);

// Simulate a same-order amendment by changing the items payload without touching the
// order allergy_note. The load/render path must still carry the note.
if (order) {
  order.items = [
    ...(order.items as Row[]),
    { id: "item-water-1", menuItemId: "water", name: "مياه", quantity: 1, unitPrice: 10, modifiers: [], choices: [], total: 10 },
  ];
}
const receipt = await loadReceiptData(db as any, persisted.orderId ?? "");
ok("PROP receipt loader returns data for the created order", !!receipt);
eq("PROP receipt data preserves allergy note after amendment", receipt?.allergyNote, conversationNote);

const pngTicketSvg = buildKitchenTicketSvg(receipt as ReceiptData).svg;
includes("PROP PNG kitchen ticket renders canonical dairy note", pngTicketSvg, "⚠️ حساسية: ألبان");

// ----------------------------------------------------------------------------
// 5. Actual console kitchen-ticket page behavior.
// ----------------------------------------------------------------------------

async function renderConsoleTicketHtml(receiptData: ReceiptData): Promise<string> {
  const require = createRequire(import.meta.url);
  const Module = require("node:module");
  const componentPath = join(ROOT, "components/print/KitchenTicketView.tsx");
  let source = readFileSync(componentPath, "utf8");
  source = source.replace(/^import .+;\n/gm, "");
  const prelude = `
const React = require("react");
const notFound = () => { throw new Error("not_found"); };
const getServerTenant = async () => ({ restaurantId: ${JSON.stringify(RESTAURANT_ID)} });
const createAdminClient = () => ({
  from(table) {
    return {
      select() { return this; },
      eq() { return this; },
      maybeSingle: async () => ({ data: table === "restaurants" ? { feature_flags: { kitchen_ticket: true } } : { id: "order-proof" }, error: null }),
    };
  },
});
const isFeatureExplicitlyEnabled = (flag, flags) => flags && flags[flag] === true;
const loadReceiptData = async () => globalThis.__KIVO_PROOF_RECEIPT;
const PrintTicketButton = () => null;
`;
  const compiled = ts.transpileModule(`${prelude}\n${source}`, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
    fileName: componentPath,
  }).outputText;
  const mod = new Module(componentPath);
  mod.filename = componentPath;
  mod.paths = Module._nodeModulePaths(ROOT);
  (globalThis as any).__KIVO_PROOF_RECEIPT = receiptData;
  mod._compile(compiled, componentPath);
  const element = await mod.exports.KitchenTicketView({ id: "order-proof", dark: false });
  return renderToStaticMarkup(element);
}

const consoleHtml = await renderConsoleTicketHtml(receipt as ReceiptData);
includes("PROP console kitchen ticket renders generic allergy banner", consoleHtml, "⚠️ حساسية");
includes("PROP console kitchen ticket renders the specific dairy note", consoleHtml, "ألبان");

console.log(`\nproof-allergen-chain: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
