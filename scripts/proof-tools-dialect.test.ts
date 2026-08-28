// ============================================================================
// KIV-304 — the TOOL LAYER's dialect. Two proofs in one file:
//
//   1. EGYPTIAN BYTE-IDENTITY. Wesaya is a live Egyptian tenant. Every string the
//      tool layer produces on the Egyptian path — tool definitions AND executor
//      results — is hashed into ONE canonical corpus and pinned. If a single byte of
//      Egyptian copy moves, this fails. The pin was taken from the pre-fix checkout
//      (git stash of lib/ai/tools.ts, run this file, read the printed hash), so it
//      proves the fix changed NOTHING for the Egyptian tenant.
//
//   2. SAUDI PURITY. The SAME scenarios are replayed with dialect:"saudi" and every
//      produced string is linted — findLeakage() from the project's own
//      lib/ai/personas/khalid-dialect-linter.mjs, PLUS an extra marker list, because
//      the project linter's Egyptian banlist is 26 entries and contains NONE of the
//      words that actually leaked here: «مش»، «لسه»، «حابب»، «لحد ما»، «فندم»،
//      «معاك»، the هـ-future, «مفيش»، «ده/دي»، «متصعّدش»، «مالهوش». A clean
//      findLeakage() is NOT evidence of Saudi-ness — it returned ok=true on every
//      single Egyptian string in tools.ts.
//
// WHY THIS EXISTS
// ---------------
// lib/ai/tools.ts had NO dialect branching at all: ~30 deterministic Cairene strings,
// returned to the model, which relays them verbatim (production agent_runs carried 14
// verbatim copies of the photo-missing line). Khalid is a Saudi host and the demo
// tenant is dialect:'saudi', so a Riyadh guest was answered in Egyptian by the tools
// even though the prompt, the persona overlay and the allergy hold were all Najdi.
//
// Run: node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types \
//        scripts/proof-tools-dialect.test.ts
// (registered in scripts/unit-suite.json with that exact command)
//
// NOTE ON THE NAMESPACE IMPORT: this file imports the module as `* as Tools` on
// purpose. It has to be runnable against a PRE-FIX checkout of lib/ai/tools.ts (that
// is how the Egyptian pin below was produced), and a pre-fix checkout exports none of
// the new symbols — a named import would fail at link time and nothing would run.
// ============================================================================

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as Tools from "../lib/ai/tools.ts";
import { DEFAULT_PAYMENT_CONFIG, type PaymentConfig } from "../lib/payments/config.ts";
import type { Branch, DeliveryArea, MenuItem, Modifier } from "../lib/types.ts";
import { findLeakage } from "../lib/ai/personas/khalid-dialect-linter.mjs";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok  ${label}`); }
  else { fail++; console.log(`  ✗   ${label}`); }
};
const eq = (label: string, actual: unknown, expected: unknown) => {
  if (actual === expected) { pass++; console.log(`  ok  ${label}`); }
  else { fail++; console.log(`  ✗   ${label}\n        got      ${JSON.stringify(actual)}\n        expected ${JSON.stringify(expected)}`); }
};

// ══ THE EGYPTIAN PIN ════════════════════════════════════════════════════════
// sha256 of the canonical Egyptian corpus (see buildCorpus). Taken from the code as
// it shipped BEFORE this WO. Do not "update" it to make a change pass — if it moves,
// a live Egyptian tenant's copy moved with it.
const EGYPTIAN_CORPUS_SHA = "dd1813df7209256b7a1acef5515c77ae4d81378fe578e64d3d25a898802e88e2";

// ── fixtures ────────────────────────────────────────────────────────────────
const menuItem = (over: Partial<MenuItem> & { id: string; name: string; price: number }): MenuItem => ({
  category: "رئيسي",
  available: true,
  description: "وصف",
  imageUrl: "",
  modifierIds: [],
  ingredients: [],
  allergens: [],
  variants: [],
  choiceGroups: [],
  ...over,
});

const SAUCE = {
  id: "sauce",
  name: "الصوص",
  minSelect: 1,
  maxSelect: 1,
  sort: 0,
  options: [
    { id: "red", label: "أحمر", priceDelta: 0, sort: 0, active: true },
    { id: "white", label: "أبيض", priceDelta: 0, sort: 1, active: true },
  ],
};

const SHAWARMA = menuItem({ id: "shawarma", name: "شاورما", price: 40, imageUrl: "https://x/1.jpg", choiceGroups: [SAUCE], modifierIds: ["extra"] });
const BURGER = menuItem({ id: "burger", name: "برجر", price: 55, imageUrl: "https://x/2.jpg", category: "برجر" });
const JUICE = menuItem({ id: "juice", name: "عصير", price: 15, category: "مشروبات" });
const PIZZA = menuItem({
  id: "pizza",
  name: "بيتزا",
  price: 90,
  variants: [
    { id: "s", name: "صغير", price: 90, sort: 0, active: true },
    { id: "l", name: "كبير", price: 130, sort: 1, active: true },
  ],
});
const MENU: MenuItem[] = [SHAWARMA, BURGER, JUICE, PIZZA];
const MODIFIERS: Modifier[] = [{ id: "extra", name: "جبنة زيادة", priceImpact: 5, category: "إضافات", active: true }];

const ZONES: DeliveryArea[] = [
  { id: "z1", name: "المعادي", minOrder: 0, deliveryFee: 20, estimatedTime: "30", active: true },
  { id: "z2", name: "الهرم", minOrder: 500, deliveryFee: 25, estimatedTime: "40", active: true },
  { id: "z3", name: "التعاون الهرم", minOrder: 0, deliveryFee: 30, estimatedTime: "45", active: true },
  { id: "z4", name: "أخرى", minOrder: 0, deliveryFee: 35, estimatedTime: "50", active: true },
  { id: "z5", name: "المروج", minOrder: 0, deliveryFee: 15, estimatedTime: "25", active: true, branchId: "brA" },
];
const NAMED_ONLY: DeliveryArea[] = ZONES.filter((z) => z.id !== "z4");
const BRANCHES: Branch[] = [
  { id: "brA", name: "الفرع الرئيسي", address: "أ", hours: "", whatsappNumber: "", open: true, notes: "", whatsappConnected: false, phone: "" },
];

const VF_ON: PaymentConfig = {
  cod_enabled: true,
  wallet_policy: "strict",
  vodafone_cash: { enabled: true, number: "01000000000", instructions: "اكتب رقم الطلب في التحويل" },
  instapay: { enabled: false, handle: "", instructions: "" },
};
const VF_OFF: PaymentConfig = DEFAULT_PAYMENT_CONFIG;

type Ctx = Parameters<typeof Tools.executeTool>[2];

interface CtxOptions {
  dialect?: string | null;
  paymentConfig?: PaymentConfig;
  zones?: DeliveryArea[];
  geoRouting?: boolean;
  addressFlowV2?: boolean;
  demoRun?: boolean;
  userConfirmed?: boolean;
  explicitHuman?: boolean;
  menuItems?: MenuItem[];
}

function ctx(o: CtxOptions = {}): Ctx {
  const built = {
    menuCategories: [
      { id: "c1", name: "رئيسي", sort: 0 },
      { id: "c2", name: "برجر", sort: 1 },
      { id: "c3", name: "مشروبات", sort: 2 },
    ],
    menuItems: o.menuItems ?? MENU,
    modifiers: MODIFIERS,
    deliveryAreas: o.zones ?? ZONES,
    branches: BRANCHES,
    geoRouting: o.geoRouting === true,
    addressFlowV2: o.addressFlowV2 === true,
    draft: Tools.emptyDraft("ج.م"),
    signals: [],
    escalation: null,
    presentation: null,
    photoRequests: [],
    taxMode: "inclusive",
    taxRate: 0,
    paymentConfig: o.paymentConfig ?? VF_OFF,
    demoRun: o.demoRun === true,
    resendReceipt: false,
    sessionAllergyNote: null,
    userConfirmed: o.userConfirmed,
    explicitHuman: o.explicitHuman === true,
  } as Record<string, unknown>;
  // The pre-fix ToolContext has no `dialect`; setting it there is simply inert, which
  // is exactly what makes the Egyptian corpus comparable across the two checkouts.
  if (o.dialect !== undefined) built.dialect = o.dialect;
  return built as Ctx;
}

// ── the scenarios ───────────────────────────────────────────────────────────
// ONE list, replayed per dialect. Each entry returns every customer-reachable string
// that branch produces. Adding a dialect conditional to tools.ts without adding a
// scenario here fails the exhaustiveness check further down.
interface Scenario {
  name: string;
  run: (o: CtxOptions) => string[];
  /** false → linted for both dialects, but kept OUT of the byte-identity corpus.
   *  Used only for the branch-mismatch notice, which is reached through a function
   *  this WO exported: including it would move the hash for a reason that is not a
   *  copy change, and the pin has to stay exactly the pre-fix value. */
  pinned?: boolean;
}

function texts(c: Ctx, ...results: { content: string }[]): string[] {
  const out = results.map((r) => r.content);
  const p = (c as { presentation: unknown }).presentation as
    | { kind: string; button?: string; buttons?: { title: string }[]; sections?: { title?: string; rows: { title: string; description?: string }[] }[] }
    | null;
  if (p) {
    if (p.button) out.push(p.button);
    for (const b of p.buttons ?? []) out.push(b.title);
    for (const s of p.sections ?? []) {
      if (s.title) out.push(s.title);
      for (const r of s.rows) { out.push(r.title); if (r.description) out.push(r.description); }
    }
  }
  return out;
}

const SCENARIOS: Scenario[] = [
  { name: "photo: none on file (fires on every demo photo request)", run: (o) => { const c = ctx({ ...o, menuItems: [JUICE] }); return texts(c, Tools.executeTool("send_item_photos", { item_names: ["عصير"] }, c)); } },
  { name: "photo: none on file, no item named", run: (o) => { const c = ctx({ ...o, menuItems: [JUICE] }); return texts(c, Tools.executeTool("send_item_photos", {}, c)); } },
  { name: "photo: exactly one sent", run: (o) => { const c = ctx(o); return texts(c, Tools.executeTool("send_item_photos", { item_names: ["برجر"] }, c)); } },
  { name: "photo: several sent, list trimmed", run: (o) => { const c = ctx(o); return texts(c, Tools.executeTool("send_item_photos", { max_count: 1 }, c)); } },
  { name: "add: unknown item", run: (o) => { const c = ctx(o); return texts(c, Tools.executeTool("add_to_order", { item_name: "كشري", quantity: 1 }, c)); } },
  { name: "add: needs a size", run: (o) => { const c = ctx(o); return texts(c, Tools.executeTool("add_to_order", { item_name: "بيتزا", quantity: 1 }, c)); } },
  { name: "add: needs a choice", run: (o) => { const c = ctx(o); return texts(c, Tools.executeTool("add_to_order", { item_name: "شاورما", quantity: 1 }, c)); } },
  { name: "add: option not on this item (item HAS options)", run: (o) => { const c = ctx(o); return texts(c, Tools.executeTool("add_to_order", { item_name: "شاورما", quantity: 1, options: ["أحمر", "حار جداً"] }, c)); } },
  { name: "add: option not on this item (item has NO options)", run: (o) => { const c = ctx(o); return texts(c, Tools.executeTool("add_to_order", { item_name: "برجر", quantity: 1, options: ["حار جداً"] }, c)); } },
  { name: "add: modifier not allowed", run: (o) => { const c = ctx(o); return texts(c, Tools.executeTool("add_to_order", { item_name: "برجر", quantity: 1, modifiers: ["جبنة زيادة"] }, c)); } },
  { name: "add: success then set-quantity", run: (o) => { const c = ctx(o); return texts(c, Tools.executeTool("add_to_order", { item_name: "برجر", quantity: 1 }, c), Tools.executeTool("add_to_order", { item_name: "برجر", quantity: 3, mode: "set" }, c)); } },
  { name: "clear_order", run: (o) => { const c = ctx(o); Tools.executeTool("add_to_order", { item_name: "برجر", quantity: 1 }, c); return texts(c, Tools.executeTool("clear_order", {}, c)); } },
  { name: "resend_receipt", run: (o) => { const c = ctx(o); return texts(c, Tools.executeTool("resend_receipt", {}, c)); } },
  { name: "remove: not in basket, then removed", run: (o) => { const c = ctx(o); Tools.executeTool("add_to_order", { item_name: "برجر", quantity: 1 }, c); return texts(c, Tools.executeTool("remove_from_order", { item_name: "كشري" }, c), Tools.executeTool("remove_from_order", { item_name: "برجر" }, c)); } },
  { name: "fulfillment: pickup", run: (o) => { const c = ctx(o); Tools.executeTool("add_to_order", { item_name: "برجر", quantity: 1 }, c); return texts(c, Tools.executeTool("set_fulfillment", { type: "pickup" }, c)); } },
  { name: "fulfillment: unknown pickup branch (geo on)", run: (o) => { const c = ctx({ ...o, geoRouting: true }); return texts(c, Tools.executeTool("set_fulfillment", { type: "pickup", branch_name: "فرع غير مسجل" }, c)); } },
  { name: "fulfillment: unknown delivery zone", run: (o) => { const c = ctx(o); return texts(c, Tools.executeTool("set_fulfillment", { type: "delivery", zone_name: "كوكب المريخ" }, c)); } },
  { name: "fulfillment: known delivery zone", run: (o) => { const c = ctx(o); Tools.executeTool("add_to_order", { item_name: "برجر", quantity: 1 }, c); return texts(c, Tools.executeTool("set_fulfillment", { type: "delivery", zone_name: "المعادي" }, c)); } },
  { name: "fulfillment: delivery with no zone (address_flow_v2)", run: (o) => { const c = ctx({ ...o, addressFlowV2: true }); return texts(c, Tools.executeTool("set_fulfillment", { type: "delivery" }, c)); } },
  { name: "delivery notice: below the zone minimum", run: (o) => { const c = ctx(o); Tools.executeTool("add_to_order", { item_name: "برجر", quantity: 1 }, c); return texts(c, Tools.executeTool("set_fulfillment", { type: "delivery", zone_name: "الهرم" }, c)); } },
  {
    name: "delivery notice: zone gone / invalid (the delivery-zone refusal)",
    run: (o) => {
      const c = ctx(o);
      Tools.executeTool("add_to_order", { item_name: "برجر", quantity: 1 }, c);
      Tools.executeTool("set_fulfillment", { type: "delivery", zone_name: "المعادي" }, c);
      (c as { draft: { deliveryZone: string | null } }).draft.deliveryZone = "منطقة اتشالت";
      return texts(c, Tools.executeTool("get_order_summary", {}, c));
    },
  },
  {
    // Not reachable through executeTool (recompute never hands the pricer a branchId),
    // so it is linted straight off the pure notice builder rather than left to rot.
    name: "delivery notice: zone belongs to another branch",
    pinned: false,
    run: (o) => {
      const c = ctx(o);
      const notice = (Tools as { deliveryNotice?: (e: unknown, c: Ctx) => string | null }).deliveryNotice;
      return notice ? [notice(new Error("delivery_zone_branch_mismatch:المروج"), c) ?? ""] : [];
    },
  },
  { name: "address: called for a pickup order", run: (o) => { const c = ctx(o); Tools.executeTool("set_fulfillment", { type: "pickup" }, c); return texts(c, Tools.executeTool("set_delivery_address", { address: "شارع" }, c)); } },
  { name: "address: empty", run: (o) => { const c = ctx(o); Tools.executeTool("set_fulfillment", { type: "delivery", zone_name: "المعادي" }, c); return texts(c, Tools.executeTool("set_delivery_address", { address: "   " }, c)); } },
  { name: "address: stored (flag off)", run: (o) => { const c = ctx(o); Tools.executeTool("set_fulfillment", { type: "delivery", zone_name: "المعادي" }, c); return texts(c, Tools.executeTool("set_delivery_address", { address: "المعادي شارع ٩" }, c)); } },
  { name: "address: one confident zone (v2)", run: (o) => { const c = ctx({ ...o, addressFlowV2: true }); Tools.executeTool("set_fulfillment", { type: "delivery" }, c); return texts(c, Tools.executeTool("set_delivery_address", { address: "المعادي شارع ٩ بجوار الصيدلية" }, c)); } },
  { name: "address: ambiguous between zones (v2)", run: (o) => { const c = ctx({ ...o, addressFlowV2: true }); Tools.executeTool("set_fulfillment", { type: "delivery" }, c); return texts(c, Tools.executeTool("set_delivery_address", { address: "الهرم التعاون شارع ٣" }, c)); } },
  { name: "address: no match, catch-all fee (v2)", run: (o) => { const c = ctx({ ...o, addressFlowV2: true }); Tools.executeTool("set_fulfillment", { type: "delivery" }, c); return texts(c, Tools.executeTool("set_delivery_address", { address: "شارع لا يشبه أي منطقة" }, c)); } },
  { name: "address: no match, no catch-all (v2)", run: (o) => { const c = ctx({ ...o, addressFlowV2: true, zones: NAMED_ONLY }); Tools.executeTool("set_fulfillment", { type: "delivery" }, c); return texts(c, Tools.executeTool("set_delivery_address", { address: "شارع لا يشبه أي منطقة" }, c)); } },
  { name: "summary: empty basket", run: (o) => { const c = ctx(o); return texts(c, Tools.executeTool("get_order_summary", {}, c)); } },
  { name: "finalize: the customer never confirmed", run: (o) => { const c = ctx({ ...o, userConfirmed: false }); return texts(c, Tools.executeTool("finalize_draft", {}, c)); } },
  { name: "finalize: empty basket", run: (o) => { const c = ctx({ ...o, userConfirmed: true }); return texts(c, Tools.executeTool("finalize_draft", {}, c)); } },
  { name: "finalize: no fulfillment yet", run: (o) => { const c = ctx({ ...o, userConfirmed: true }); Tools.executeTool("add_to_order", { item_name: "برجر", quantity: 1 }, c); return texts(c, Tools.executeTool("finalize_draft", {}, c)); } },
  { name: "finalize: delivery with no address", run: (o) => { const c = ctx({ ...o, userConfirmed: true }); Tools.executeTool("add_to_order", { item_name: "برجر", quantity: 1 }, c); Tools.executeTool("set_fulfillment", { type: "delivery", zone_name: "المعادي" }, c); return texts(c, Tools.executeTool("finalize_draft", {}, c)); } },
  {
    name: "finalize: an item was 86'd after it was added",
    run: (o) => {
      const c = ctx({ ...o, userConfirmed: true, menuItems: [{ ...BURGER }] });
      Tools.executeTool("add_to_order", { item_name: "برجر", quantity: 1 }, c);
      Tools.executeTool("set_fulfillment", { type: "pickup" }, c);
      (c as { menuItems: MenuItem[] }).menuItems = [{ ...BURGER, available: false }];
      return texts(c, Tools.executeTool("finalize_draft", {}, c));
    },
  },
  { name: "finalize: placed (real tenant)", run: (o) => { const c = ctx({ ...o, userConfirmed: true }); Tools.executeTool("add_to_order", { item_name: "برجر", quantity: 1 }, c); Tools.executeTool("set_fulfillment", { type: "pickup" }, c); return texts(c, Tools.executeTool("finalize_draft", {}, c)); } },
  { name: "finalize: placed (public demo)", run: (o) => { const c = ctx({ ...o, userConfirmed: true, demoRun: true }); Tools.executeTool("add_to_order", { item_name: "برجر", quantity: 1 }, c); Tools.executeTool("set_fulfillment", { type: "pickup" }, c); return texts(c, Tools.executeTool("finalize_draft", {}, c)); } },
  { name: "escalate: a fabricated technical fault is blocked", run: (o) => { const c = ctx({ ...o, explicitHuman: true }); return texts(c, Tools.executeTool("escalate_to_human", { reason: "النظام رفض الاختيارات — خطأ تقني" }, c)); } },
  { name: "escalate: transferred (real tenant)", run: (o) => { const c = ctx({ ...o, explicitHuman: true }); return texts(c, Tools.executeTool("escalate_to_human", { reason: "العميل طلب موظف" }, c)); } },
  { name: "escalate: transferred (public demo)", run: (o) => { const c = ctx({ ...o, explicitHuman: true, demoRun: true }); return texts(c, Tools.executeTool("escalate_to_human", { reason: "العميل طلب موظف" }, c)); } },
  { name: "escalate: notify-without-hold (real tenant)", run: (o) => { const c = ctx(o); return texts(c, Tools.executeTool("escalate_to_human", { reason: "شكوى" }, c)); } },
  { name: "escalate: notify-without-hold (public demo)", run: (o) => { const c = ctx({ ...o, demoRun: true }); return texts(c, Tools.executeTool("escalate_to_human", { reason: "شكوى" }, c)); } },
  { name: "present_menu: nothing available", run: (o) => { const c = ctx({ ...o, menuItems: [{ ...BURGER, available: false }] }); return texts(c, Tools.executeTool("present_menu", {}, c)); } },
  { name: "present_menu: the category list", run: (o) => { const c = ctx(o); return texts(c, Tools.executeTool("present_menu", {}, c)); } },
  { name: "present_menu: one category's items", run: (o) => { const c = ctx(o); return texts(c, Tools.executeTool("present_menu", { category: "برجر" }, c)); } },
  { name: "present_menu: unknown category", run: (o) => { const c = ctx(o); return texts(c, Tools.executeTool("present_menu", { category: "حلويات" }, c)); } },
  { name: "present_quantity", run: (o) => { const c = ctx(o); return texts(c, Tools.executeTool("present_quantity", {}, c)); } },
  { name: "present_order_actions: fulfillment not chosen yet", run: (o) => { const c = ctx(o); return texts(c, Tools.executeTool("present_order_actions", {}, c)); } },
  { name: "present_order_actions: confirm / add / cancel", run: (o) => { const c = ctx(o); Tools.executeTool("set_fulfillment", { type: "pickup" }, c); return texts(c, Tools.executeTool("present_order_actions", {}, c)); } },
  { name: "payment: methods offered, COD only", run: (o) => { const c = ctx(o); return texts(c, Tools.executeTool("present_payment_methods", {}, c)); } },
  { name: "payment: methods offered, wallet on + delivery", run: (o) => { const c = ctx({ ...o, paymentConfig: VF_ON }); Tools.executeTool("set_fulfillment", { type: "delivery", zone_name: "المعادي" }, c); return texts(c, Tools.executeTool("present_payment_methods", {}, c)); } },
  { name: "payment: methods offered, wallet on + pickup", run: (o) => { const c = ctx({ ...o, paymentConfig: VF_ON }); Tools.executeTool("set_fulfillment", { type: "pickup" }, c); return texts(c, Tools.executeTool("present_payment_methods", {}, c)); } },
  { name: "payment: wallet chosen while disabled", run: (o) => { const c = ctx(o); return texts(c, Tools.executeTool("set_payment_method", { method: "vodafone_cash" }, c)); } },
  { name: "payment: wallet chosen, transfer instructions", run: (o) => { const c = ctx({ ...o, paymentConfig: VF_ON }); Tools.executeTool("add_to_order", { item_name: "برجر", quantity: 1 }, c); return texts(c, Tools.executeTool("set_payment_method", { method: "vodafone_cash" }, c)); } },
  { name: "payment: wallet chosen, no number stored", run: (o) => { const c = ctx({ ...o, paymentConfig: { ...VF_ON, vodafone_cash: { enabled: true, number: "", instructions: "" } } }); return texts(c, Tools.executeTool("set_payment_method", { method: "vodafone_cash" }, c)); } },
  { name: "payment: cash on delivery chosen", run: (o) => { const c = ctx(o); return texts(c, Tools.executeTool("set_payment_method", { method: "cod" }, c)); } },
  { name: "unknown tool name", run: (o) => { const c = ctx(o); return texts(c, Tools.executeTool("nope", {}, c)); } },
];

function runScenarios(o: CtxOptions): { name: string; texts: string[] }[] {
  return SCENARIOS.map((s) => ({ name: s.name, texts: s.run(o) }));
}

/** The canonical corpus: the tool DEFINITIONS the model sees plus every executor
 *  string, in a fixed order. Only the legacy (option-less) catalog getters are used
 *  here so the corpus can be produced by a pre-fix checkout too. */
function buildCorpus(o: CtxOptions): string {
  const parts: string[] = [];
  parts.push("== ORDER_TOOLS ==", JSON.stringify(Tools.ORDER_TOOLS));
  parts.push("== NON_ORDER_TOOLS ==", JSON.stringify(Tools.NON_ORDER_TOOLS));
  parts.push("== geo ==", JSON.stringify(Tools.orderToolsWithGeo(true)));
  parts.push("== addr ==", JSON.stringify(Tools.orderToolsForDelivery(false, true)));
  parts.push("== geo+addr ==", JSON.stringify(Tools.orderToolsForDelivery(true, true)));
  for (const r of runScenarios(o)) {
    if (SCENARIOS.find((s) => s.name === r.name)?.pinned === false) continue;
    parts.push(`== ${r.name} ==`, ...r.texts);
  }
  return parts.join("\n");
}

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

// ══ 1. EGYPTIAN BYTE-IDENTITY ═══════════════════════════════════════════════
const egyptianCorpus = buildCorpus({});
const egyptianSha = sha(egyptianCorpus);
// If the pin below ever fails, re-run with DUMP=/tmp/after.txt on both checkouts and
// diff the two files — that is how you find WHICH Egyptian string moved.
if (process.env.DUMP) writeFileSync(process.env.DUMP, egyptianCorpus);
console.log(`\nEGYPTIAN CORPUS SHA256: ${egyptianSha}  (${egyptianCorpus.length} chars)\n`);

console.log("── 1. Egyptian byte-identity (Wesaya is live) ──");
eq("the Egyptian corpus still hashes to the pre-fix pin", egyptianSha, EGYPTIAN_CORPUS_SHA);
eq("dialect omitted === dialect:\"egyptian\"", sha(buildCorpus({ dialect: "egyptian" })), egyptianSha);
eq("dialect:null falls back to Egyptian", sha(buildCorpus({ dialect: null })), egyptianSha);
eq("an unknown dialect falls back to Egyptian", sha(buildCorpus({ dialect: "cairo" })), egyptianSha);
ok("the corpus is substantial (not an empty/short-circuited dump)", egyptianCorpus.length > 12000);

// ══ 2. SAUDI PURITY ═════════════════════════════════════════════════════════
// The project linter's Egyptian banlist is 26 entries and misses every marker that
// actually leaked into tools.ts. These are the ones that did. Each is anchored so it
// matches a WORD, not a fragment (Arabic has no \b).
const AR = "ء-يٱ";
const W = (body: string) => new RegExp(`(?:^|[^${AR}])(?:${body})(?![${AR}])`);
const EXTRA_EGYPTIAN: Array<[RegExp, string]> = [
  [W("مش"), "مش"],
  [W("لسه"), "لسه"],
  [W("حابب|حابة"), "حابب"],
  [/لحد ما/, "لحد ما"],
  [/فندم|حضرتك/, "فندم/حضرتك"],
  [W("معاك|معاكي"), "معاك"],
  [W("دلوقتي|دلوقت"), "دلوقتي"],
  [W("ده|دي|دول"), "ده/دي"],
  [W("إيه|ايه"), "إيه"],
  [W("مفيش|معلش|معلهش|عايز|عاوز|كده|كدة|ازاي|إزاي"), "egyptian word"],
  [W("فين|تاني|تانية|كمان|كام|شوية|بتاع"), "egyptian word"],
  // The هـ future — «هبعتلك»، «هيردّوا»، «هنأكد»، «هيتبعتلك» — including after a
  // prefixed و/ف, which is how «وهيردّوا» slipped past an earlier scan.
  [new RegExp(`(?:^|[^${AR}])[وف]?ه(?:ي|ن|ت|أ)?(?:بعت|رجع|قول|جيب|كلم|عمل|روح|شوف|ردّ|رد|أكد|تأكد|تواصل|كمل|ضيف|بقى|كون)`), "هـ-future"],
  // «ما ... ش» circumfix negation.
  [new RegExp(`(?:^|[^${AR}])ما?[${AR}]+ش(?![${AR}])`), "ما…ش negation"],
  // The joined Cairene dative «أرشّحلك» — Najdi separates it («أرشّح لك»).
  [/(?:أرشح|أرشّح|أعرض|أجهز|أجهّز|أبعت|هبعت|أقول|أكتب|ابعت|قول)ل(?:ك|ي|نا|كم)/, "joined dative"],
  // …and the Cairene imperative with the pronoun welded on: «قولي»، «ابعتلي»، «اكتبلي».
  // Najdi separates that too («قل لي»). This is the marker that let the staff-notified
  // line — «…ولو تحب أوصلك بموظف قولي وأحوّلك على طول» — pass every other check.
  [W("قولي|قولّي|قوللي|ابعتلي|ابعتلنا|اكتبلي|اكتبلنا|هاتلي|جيبلي|شوفلي"), "joined imperative"],
  // Cairene ب-present on a verb.
  [/بتتبع|بيتبع|بنوصل|بنوصّل|بنبعت|بيقول/, "ب-present"],
  [/مالهوش|ماهوش|مالوش|مفيهوش/, "مالهوش"],
];
// MSA stiffness the corpus itself bans (prompt.ts: never أريد/سوف/سـ/يرجى/لطفاً), plus
// the officialese the Khalid native review called out.
const EXTRA_MSA: Array<[RegExp, string]> = [
  [W("سوف|أريد|يُرجى|يرجى|لطفاً|نعتذر منك|سيتواصل|سيتم"), "MSA"],
  [new RegExp(`(?:^|[^${AR}])س(?:نحل|يصلك|نتواصل|نعوض|نرجع|يتصل|أرسل|نرسل|يقوم)`), "MSA سـ future"],
];
// Saudi-specific misses that are not "Egyptian" at all but are still wrong for Khalid.
const EXTRA_NAJDI: Array<[RegExp, string]> = [
  // «تصنيف» is CMS vocabulary — a Saudi says «القسم» or just names the things.
  [/تصنيف|التصنيفات|تصنيفات/, "«تصنيف» (CMS word)"],
  // The menu data carries no order-volume field, so this can never be backed.
  [/الأكثر طلبا|الأكثر مبيعا/, "unbacked popularity claim"],
];
const ALL_EXTRA = [...EXTRA_EGYPTIAN, ...EXTRA_MSA, ...EXTRA_NAJDI];

function offend(text: string): string[] {
  const hits: string[] = [];
  const leak = findLeakage(text);
  if (!leak.ok) hits.push(...leak.hits.map((h) => `${h.marker}(${h.category})`));
  for (const [re, label] of ALL_EXTRA) if (re.test(text)) hits.push(label);
  return [...new Set(hits)];
}

console.log("\n── 2. Saudi purity: every Saudi-branch string in tools.ts ──");
const saudiRuns = runScenarios({ dialect: "saudi" });
const saudiOffenders: string[] = [];
let saudiChecked = 0;
for (const r of saudiRuns) {
  for (const t of r.texts) {
    if (!/[؀-ۿ]/.test(t)) continue;
    saudiChecked++;
    const hits = offend(t);
    if (hits.length) saudiOffenders.push(`[${r.name}] [${hits.join(", ")}] ${t.slice(0, 110)}`);
  }
}
ok(`every scenario produced Saudi strings to lint (${saudiChecked})`, saudiChecked >= 70);
ok("no Saudi tool result carries an Egyptian / Levantine / Iraqi / MSA marker", saudiOffenders.length === 0);
for (const o of saudiOffenders) console.log(`      ${o}`);

// The Saudi tool DEFINITIONS (re-sent to the model on every single request).
const saudiCatalog = (Tools.orderToolsForTenant as (g: boolean, a: boolean, o: unknown) => { name: string; description: string; input_schema: unknown }[])(
  true, true, { dialect: "saudi", paymentConfig: VF_OFF }
);
const saudiCatalogOffenders: string[] = [];
for (const t of saudiCatalog) {
  for (const frag of t.description.split(/(?<=[.؟!])\s+/)) {
    if (!/[؀-ۿ]/.test(frag)) continue;
    const hits = offend(frag);
    if (hits.length) saudiCatalogOffenders.push(`[${t.name}] [${hits.join(", ")}] ${frag.slice(0, 110)}`);
  }
}
ok("no Saudi TOOL DEFINITION carries an Egyptian marker", saudiCatalogOffenders.length === 0);
for (const o of saudiCatalogOffenders) console.log(`      ${o}`);

// ══ 3. EXHAUSTIVENESS ═══════════════════════════════════════════════════════
// A dialect conditional with no scenario is a branch nobody lints. Every `sa ? … : …`
// and `if (sa)` in tools.ts is counted; add one and this fails until a scenario for it
// is added above and the count is updated deliberately.
console.log("\n── 3. Exhaustiveness ──");
const SRC = readFileSync(resolve(ROOT, "lib/ai/tools.ts"), "utf8");
const codeLines = SRC.split("\n").filter((l) => {
  const t = l.trimStart();
  return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
});
const CODE = codeLines.join("\n");
const conditionals = (CODE.match(/(?:^|[^A-Za-z0-9_.])sa\s*(?:\?|\n\s*\?)/g) ?? []).length + (CODE.match(/if \(sa\)/g) ?? []).length;
eq("every dialect conditional in tools.ts has a scenario above", conditionals, 23);
ok("the Saudi corpus really differs from the Egyptian one", sha(buildCorpus({ dialect: "saudi" })) !== egyptianSha);
{
  const egyptianRuns = runScenarios({});
  let differing = 0;
  for (let i = 0; i < SCENARIOS.length; i++) {
    if (JSON.stringify(egyptianRuns[i].texts) !== JSON.stringify(saudiRuns[i].texts)) differing++;
  }
  ok(`the two dialects diverge in ${differing} of ${SCENARIOS.length} scenarios`, differing >= 24);
}
ok("tools.ts resolves the dialect with an Egyptian default", /dialect === "saudi" \? "saudi" : "egyptian"/.test(CODE));
ok("ToolContext carries an OPTIONAL dialect (no existing caller is forced to change)", /dialect\?: string \| null;/.test(CODE));
ok("respond.ts threads brain.dialect into the tool context",
  /dialect: input\.brain\.dialect/.test(readFileSync(resolve(ROOT, "lib/ai/respond.ts"), "utf8")));
ok("typed-actions.ts threads the tenant dialect into its tool context",
  /dialect: args\.dialect/.test(readFileSync(resolve(ROOT, "lib/messaging/typed-actions.ts"), "utf8")));

// ══ 4. THE PAYMENT TOOL SCHEMA FOLLOWS payment_config ═══════════════════════
console.log("\n── 4. set_payment_method follows the tenant's payment_config ──");
type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };
const catalogFor = (o: unknown): ToolDef[] =>
  (Tools.orderToolsForTenant as (g: boolean, a: boolean, opt: unknown) => ToolDef[])(false, false, o);
const methodEnum = (tools: ToolDef[]): unknown => {
  const t = tools.find((x) => x.name === "set_payment_method");
  return ((t?.input_schema.properties as Record<string, { enum?: unknown }>)?.method ?? {}).enum;
};
eq("wallet OFF → the enum is COD only", JSON.stringify(methodEnum(catalogFor({ paymentConfig: VF_OFF }))), JSON.stringify(["cod"]));
eq("wallet ON → the enum keeps both", JSON.stringify(methodEnum(catalogFor({ paymentConfig: VF_ON }))), JSON.stringify(["cod", "vodafone_cash"]));
eq("COD off + wallet on → wallet only", JSON.stringify(methodEnum(catalogFor({ paymentConfig: { ...VF_ON, cod_enabled: false } }))), JSON.stringify(["vodafone_cash"]));
eq("everything off → COD, never an empty enum", JSON.stringify(methodEnum(catalogFor({ paymentConfig: { ...VF_OFF, cod_enabled: false } }))), JSON.stringify(["cod"]));
{
  const saudiTenant = JSON.stringify(catalogFor({ dialect: "saudi", paymentConfig: VF_OFF }));
  ok("a Saudi tenant never sees فودافون كاش in its tool schema", !saudiTenant.includes("فودافون"));
  ok("a Saudi tenant never sees vodafone_cash in its tool enum", !saudiTenant.includes("vodafone_cash"));
  const egyptianWallet = JSON.stringify(catalogFor({ dialect: "egyptian", paymentConfig: VF_ON }));
  ok("an Egyptian tenant that RUNS the wallet still sees it", egyptianWallet.includes("فودافون كاش") && egyptianWallet.includes("vodafone_cash"));
}
eq("an Egyptian wallet tenant's catalog is byte-identical to the shipped one",
  JSON.stringify(catalogFor({ dialect: "egyptian", paymentConfig: VF_ON })), JSON.stringify(Tools.ORDER_TOOLS));
ok("no options at all → ORDER_TOOLS, by reference", (Tools.orderToolsForTenant as (g: boolean, a: boolean) => unknown)(false, false) === Tools.ORDER_TOOLS);
ok("the legacy getters are untouched", Tools.orderToolsForDelivery(false, false) === Tools.ORDER_TOOLS && Tools.orderToolsWithGeo(false) === Tools.ORDER_TOOLS);
ok("the closed-hours subset is localizable too",
  JSON.stringify((Tools.nonOrderToolsForTenant as (o: unknown) => ToolDef[])({ dialect: "saudi" })) !== JSON.stringify(Tools.NON_ORDER_TOOLS));

// ══ 5. THE NAMED OFFENDERS ══════════════════════════════════════════════════
// Each line KIV-304 called out: the Najdi form must be reachable AND the Egyptian form
// must still be in the file for Wesaya.
console.log("\n── 5. The named KIV-304 offenders ──");
const saudiAll = saudiRuns.flatMap((r) => r.texts).join("\n");
const pins: Array<[string, string, string]> = [
  ["photo missing", "ما لقيت صورة", "للأسف مش لاقي صورة"],
  ["photo sent", "أرسل لك", "تمام، هبعتلك"],
  ["escalation confirmation", "حوّلت محادثتك لفريق المطعم، ويردّون عليك", "حوّلت محادثتك لفريق المطعم، وهيردّوا عليك"],
  ["staff-notified", "ولو تبي أوصّلك بموظف قل لي", "ولو تحب أوصلك بموظف قولي"],
  ["delivery-zone refusal", "ما تدخل ضمن مناطق التوصيل الحين", "مش ضمن مناطق التوصيل المتاحة دلوقتي"],
  ["invalid option", "مو من اختيارات", "مش من اختيارات"],
  ["payment copy", "وأرسل لنا لما تحوّل ونأكد طلبك", "وابعتلنا لما تحوّل وهنأكد طلبك"],
  ["cash on delivery", "نأكد طلبك الحين", "هنأكد طلبك حالًا"],
  ["confirm gate", "لين الحين العميل ما أكّد الطلب", "لسه العميل ما أكّدش الطلب"],
  ["clear order", "وش تحب تطلب؟", "تحب تطلب إيه؟"],
  ["«تصنيف» → «قسم»", "قسم للعميل كقائمة تفاعلية", "تصنيف للعميل كقائمة تفاعلية"],
];
for (const [label, saudiForm, egyptianForm] of pins) {
  ok(`${label}: the Najdi line is what a Saudi tenant gets`, saudiAll.includes(saudiForm));
  ok(`${label}: the Egyptian line still ships verbatim`, SRC.includes(egyptianForm));
}
// Najdi negation + separated dative, spot-checked on the line that fires most often.
{
  const photo = saudiRuns.find((r) => r.name.startsWith("photo: none on file (fires"))!.texts.join("\n");
  ok("the photo line separates the dative («أرشّح لك», never «أرشّحلك»)", photo.includes("أرشّح لك") && !photo.includes("أرشّحلك"));
  ok("the photo line says «الحين», not «دلوقتي»", photo.includes("الحين"));
}

// ══ 6. THE LINTER MUST NOT BE A STUB ════════════════════════════════════════
console.log("\n── 6. Linter sanity ──");
ok("findLeakage still catches a known Egyptian marker", !findLeakage("انا عايز اطلب").ok);
ok("findLeakage still catches a known Levantine marker", !findLeakage("بدي اطلب هلق").ok);
ok("findLeakage passes clean Najdi", findLeakage("هلا والله، وش تحب تطلب اليوم؟").ok);
// THE WHOLE REASON FOR THE EXTRA LIST. Replayed over the ACTUAL Cairene strings this
// WO removed from the Saudi path: the extra list must catch every one of them, while
// findLeakage on its own waves most of them through (its only overlap is «دلوقتي»,
// which happens to be one of its 26 markers). A green findLeakage() is therefore not
// evidence of Saudi-ness, which is exactly how these strings survived until KIV-304.
const LEAKED_AS_SHIPPED = [
  "للأسف مش لاقي صورة دلوقتي. أقدر أعرضلك المنيو أو أرشحلك أقرب صنف متاح.",
  "تمام، هبعتلك الصورة.",
  "حوّلت محادثتك لفريق المطعم، وهيردّوا عليك في أقرب وقت 🙏",
  "سجّلت ملاحظتك ونبّهت فريق المطعم يتابعها 🙏 نقدر نكمّل مع بعض — ولو تحب أوصلك بموظف قولي وأحوّلك على طول.",
  "منطقة الهرم بتتبع فرع تاني 🙏 نظبط الفرع المناسب، ولا تحب استلام من الفرع؟",
  "لسه العميل ما أكّدش الطلب صراحةً — رسالته الأخيرة مش تأكيد.",
  "مفيش أي عطل تقني.",
  "تمام، مسحت الطلب ونبدأ من جديد. تحب تطلب إيه؟",
  "وابعتلنا لما تحوّل وهنأكد طلبك. (الدفع لسه ما اتأكدش لحد ما المطعم يراجعه.)",
  "تمام، الدفع عند الاستلام. هنأكد طلبك حالًا.",
  "لا توجد أصناف ضمن «حلويات». اعرض التصنيفات المتاحة أو اسأل العميل.",
  "«أحمر» مش من اختيارات «شاورما» (ده طبيعي، مش عطل تقني).",
];
const missedByProjectLinter = LEAKED_AS_SHIPPED.filter((t) => findLeakage(t).ok);
ok(`the extra list catches ALL ${LEAKED_AS_SHIPPED.length} strings this WO de-Egyptianised`,
  LEAKED_AS_SHIPPED.every((t) => offend(t).length > 0));
ok(`findLeakage alone waves ${missedByProjectLinter.length} of them through — so it can never be the only gate`,
  missedByProjectLinter.length >= 10);
// Each marker the deliverable named, in isolation, on a string the project linter passes.
for (const [text, label] of [
  ["الطلب مش جاهز", "مش"],
  ["لسه ما وصل", "لسه"],
  ["لو حابب تكمل", "حابب"],
  ["استنى لحد ما نجهزه", "لحد ما"],
  ["تحت أمرك يا فندم", "فندم"],
  ["الطلب معاك", "معاك"],
  ["هبعتلك الصورة", "هـ-future"],
  ["اعرض التصنيفات المتاحة", "تصنيف"],
] as const) {
  ok(`the extra list catches «${label}» (the project linter does not)`, offend(text).length > 0 && findLeakage(text).ok);
}
// And it must not false-flag real Najdi.
for (const clean of [
  "هلا والله، وش تحب تطلب؟",
  "للأسف ما لقيت صورة لـ«عصير» الحين. أقدر أعرض لك المنيو أو أرشّح لك أقرب صنف متوفر.",
  "حوّلت محادثتك لفريق المطعم، ويردّون عليك في أقرب وقت 🙏",
  "تمام، مسحت الطلب ونبدأ من جديد. وش تحب تطلب؟",
  "لين الحين العميل ما أكّد الطلب صراحةً.",
]) {
  ok(`clean Najdi is not false-flagged: «${clean.slice(0, 40)}…»`, offend(clean).length === 0);
}

console.log(`\nTOOL-LAYER DIALECT PROOF: ${pass} passed, ${fail} failed  (${saudiChecked} Saudi strings linted, ${conditionals} dialect conditionals)`);
process.exit(fail === 0 ? 0 : 1);
