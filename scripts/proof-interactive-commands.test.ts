// WO-FIX-INTERACTIVE — behavioral proof for deterministic WhatsApp tap commands.
// Run:
//   node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types scripts/proof-interactive-commands.test.ts

import { respond } from "../lib/ai/respond.ts";
import { DEFAULT_PAYMENT_CONFIG } from "../lib/payments/config.ts";
import type { OrderDraft } from "../lib/ai/tools.ts";
import { respondAndSendWhatsApp } from "../lib/messaging/respond-and-send.ts";
import {
  handleTypedInteractiveAction,
  interactiveCommandFromId,
} from "../lib/messaging/typed-actions.ts";
import {
  decideRecoveryAction,
  emergencyEscalationReason,
  RECOVERY_CHOICE_CONTINUE,
  RECOVERY_CHOICE_REALERT,
} from "../lib/ai/allergen-companion-flow.ts";

let pass = 0;
let fail = 0;

function ok(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    pass++;
    return;
  }
  fail++;
  console.log("  FAIL", name, detail ?? "");
}

function eq(name: string, actual: unknown, expected: unknown) {
  ok(`${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`, actual === expected);
}

type Call = {
  table: string;
  op: string;
  payload?: unknown;
  select?: string | null;
  filters: { col: string; val: unknown }[];
};

const nowIso = new Date().toISOString();

const categoryRows = [
  { id: "cat-burgers", restaurant_id: "restaurant-interactive", name: "برجر", sort: 1 },
  { id: "cat-desserts", restaurant_id: "restaurant-interactive", name: "حلويات", sort: 2 },
];

const menuRows = [
  {
    id: "item-burger",
    restaurant_id: "restaurant-interactive",
    category_id: "cat-burgers",
    name: "برجر كلاسيك",
    name_en: null,
    description: "لحم وصوص",
    price: 100,
    image_url: "",
    available: true,
    unavailable_until: null,
    ingredients: [],
    allergens: [],
    image_kind: "real",
    image_status: "approved",
  },
  {
    id: "item-dessert",
    restaurant_id: "restaurant-interactive",
    category_id: "cat-desserts",
    name: "كيك",
    name_en: null,
    description: "",
    price: 50,
    image_url: "",
    available: true,
    unavailable_until: null,
    ingredients: [],
    allergens: ["فول سوداني"],
    image_kind: "real",
    image_status: "approved",
  },
];

function draftWithBurger(qty = 1): OrderDraft {
  return {
    lines: [
      {
        itemId: "item-burger",
        name: "برجر كلاسيك",
        quantity: qty,
        unitPrice: 100,
        choices: [],
        modifiers: [],
        lineTotal: 100 * qty,
      },
    ],
    fulfillment: "pickup",
    deliveryZone: null,
    address: null,
    deliveryFee: 0,
    subtotal: 100 * qty,
    tax: 0,
    taxRate: 0,
    total: 100 * qty,
    currency: "ج.م",
    paymentMethod: null,
    finalized: false,
  };
}

function makeFakeAdmin(args: {
  inbound?: { text: string; interactiveId?: string | null };
  priorDraftRows?: { meta: Record<string, unknown>; created_at: string; text?: string | null }[];
  featureFlags?: Record<string, unknown> | null;
  allergyNote?: string | null;
} = {}) {
  const calls: Call[] = [];
  const inbound = args.inbound ?? { text: "", interactiveId: null };
  const featureFlags = args.featureFlags ?? {};
  const priorDraftRows = args.priorDraftRows ?? [];
  const customerRow = {
    sender: "customer",
    text: inbound.text,
    created_at: nowIso,
    meta: inbound.interactiveId ? { interactiveId: inbound.interactiveId } : {},
  };
  const historyRowsDesc = [
    customerRow,
    ...priorDraftRows.map((row) => ({
      sender: "ai",
      text: row.text ?? "الإجمالي 100 ج.م. تأكيد الطلب؟",
      created_at: row.created_at,
      meta: row.meta,
    })),
  ];

  function hasFilter(call: Call, col: string, val: unknown): boolean {
    return call.filters.some((filter) => filter.col === col && filter.val === val);
  }

  function restaurantRow() {
    return {
      id: "restaurant-interactive",
      name: "مطعم الاختبار",
      logo_url: "",
      phone: "",
      email: "",
      currency: "ج.م",
      country: "EG",
      default_language: "ar",
      dialect: "egyptian",
      timezone: "Asia/Riyadh",
      business_type: "restaurant",
      ai_tone: {},
      brain_score: 0,
      is_open: true,
      closed_message: null,
      accept_preorders: false,
      hours: {},
      agent_mode: "live",
      auto_accept_orders: false,
      agent_persona_name: null,
      tax_mode: "inclusive",
      tax_rate: 0,
      payment_config: DEFAULT_PAYMENT_CONFIG,
      feature_flags: featureFlags,
    };
  }

  function resultFor(call: Call) {
    if (call.table === "conversations" && call.op === "select") {
      if ((call.select ?? "").includes("allergy_note")) {
        return { data: { allergy_note: args.allergyNote ?? null }, error: null };
      }
      return {
        data: {
          id: "conversation-interactive",
          owner: "ai",
          channel: "whatsapp",
          customer_id: "customer-interactive",
          escalation_reason: null,
          updated_at: nowIso,
          ownership_state: "AI_ACTIVE",
          is_safety_hold: false,
          control_epoch: 1,
          customers: { phone: "201000000000" },
        },
        error: null,
      };
    }
    if (call.table === "conversations" && call.op === "update") return { data: [], error: null };
    if (call.table === "restaurants") return { data: restaurantRow(), error: null };
    if (call.table === "branches") return { data: [], error: null };
    if (call.table === "menu_categories") return { data: categoryRows, error: null };
    if (call.table === "menu_items") return { data: menuRows, error: null };
    if (
      [
        "menu_item_variants",
        "menu_item_choice_groups",
        "menu_item_choice_options",
        "modifiers",
        "menu_item_modifiers",
        "delivery_zones",
        "policies",
        "faqs",
        "promotions",
        "conversation_signals",
        "system_alerts",
      ].includes(call.table)
    ) {
      return { data: [], error: null };
    }
    if (call.table === "messages" && call.op === "select") {
      if ((call.select ?? "").includes("sender,text,created_at,meta")) return { data: historyRowsDesc, error: null };
      if ((call.select ?? "").includes("meta, created_at") && hasFilter(call, "sender", "ai")) {
        return { data: priorDraftRows, error: null };
      }
      return { data: [], error: null };
    }
    if (call.table === "messages" && call.op === "insert") {
      return { data: { id: `message-${calls.filter((c) => c.table === "messages" && c.op === "insert").length}` }, error: null };
    }
    if (call.table === "messages" && call.op === "update") return { data: [], error: null };
    if (call.table === "agent_runs") return { data: { id: "agent-run-unexpected" }, error: null };
    return { data: [], error: null };
  }

  const from = (table: string) => {
    const call: Call = { table, op: "query", select: null, filters: [] };
    const remember = (op: string, payload?: unknown) => {
      call.op = op;
      call.payload = payload;
      if (!calls.includes(call)) calls.push(call);
    };
    const builder: Record<string, unknown> = {};
    builder.select = (cols?: string) => {
      if (call.op === "query") call.op = "select";
      call.select = cols ?? "*";
      if (!calls.includes(call)) calls.push(call);
      return builder;
    };
    builder.insert = (payload: unknown) => {
      remember("insert", payload);
      return builder;
    };
    builder.upsert = (payload: unknown) => {
      remember("upsert", payload);
      return builder;
    };
    builder.update = (payload: unknown) => {
      remember("update", payload);
      return builder;
    };
    for (const method of ["eq", "neq", "is", "not", "gt", "gte", "lt", "lte", "order", "limit", "in", "contains"]) {
      builder[method] = (col?: string, val?: unknown) => {
        if (method === "eq" && col) call.filters.push({ col, val });
        return builder;
      };
    }
    builder.maybeSingle = async () => resultFor(call);
    builder.single = async () => resultFor(call);
    builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(resultFor(call)).then(resolve, reject);
    return builder;
  };

  return {
    client: { from, rpc: async () => ({ data: null, error: null }) } as never,
    calls,
  };
}

function insertedMessages(calls: Call[]) {
  return calls.filter((call) => call.table === "messages" && call.op === "insert").map((call) => call.payload as Record<string, unknown>);
}

const savedEnv = {
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
  AI_ADAPTER: process.env.AI_ADAPTER,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

try {
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.AI_ADAPTER = "mock";
  delete process.env.ANTHROPIC_API_KEY;

  eq("parser: item id maps to select_item command", interactiveCommandFromId("item:item-burger")?.kind, "select_item");
  eq("parser: category id maps to select_category command", interactiveCommandFromId("cat:cat-burgers")?.kind, "select_category");
  eq("parser: qty id maps to quantity command", interactiveCommandFromId("qty:3")?.kind, "choose_quantity");
  eq("parser: confirm id maps to confirm command", interactiveCommandFromId("confirm_order")?.kind, "confirm_order");
  eq("parser: allergy continue id is registered", interactiveCommandFromId(RECOVERY_CHOICE_CONTINUE)?.action, "allergy_recovery_continue");
  eq("parser: allergy realert id is registered", interactiveCommandFromId(RECOVERY_CHOICE_REALERT)?.action, "allergy_recovery_realert");
  eq("parser: unknown id is not a command", interactiveCommandFromId("evil_force_paid"), null);

  const directA = makeFakeAdmin();
  const itemA = await handleTypedInteractiveAction(directA.client, {
    restaurantId: "restaurant-interactive",
    conversationId: "conversation-interactive",
    interactiveId: "item:item-burger",
    features: {},
    safetyProbe: {},
  });
  const itemWritesA = insertedMessages(directA.calls);
  const itemDraftA = itemWritesA.find((m) => (m.meta as Record<string, unknown> | undefined)?.typedAction)?.meta as Record<string, unknown>;
  ok("known item id executes select_item as a typed command", itemA.kind === "handled" && itemA.action === "select_item", itemA);
  ok("item command mutates draft through item id, not label text",
    ((itemDraftA?.draft as OrderDraft | undefined)?.lines ?? [])[0]?.itemId === "item-burger",
    itemDraftA);

  const directB = makeFakeAdmin();
  const itemB = await handleTypedInteractiveAction(directB.client, {
    restaurantId: "restaurant-interactive",
    conversationId: "conversation-interactive",
    interactiveId: "item:item-burger",
    features: {},
    safetyProbe: {},
  });
  ok("same item id tapped twice has the same deterministic reply", itemA.kind === "handled" && itemB.kind === "handled" && itemA.reply === itemB.reply);

  const directCat = makeFakeAdmin();
  const category = await handleTypedInteractiveAction(directCat.client, {
    restaurantId: "restaurant-interactive",
    conversationId: "conversation-interactive",
    interactiveId: "cat:cat-burgers",
    features: {},
    safetyProbe: {},
  });
  ok("category id executes select_category and returns an interactive item list",
    category.kind === "handled" &&
      category.action === "select_category" &&
      category.presentation?.kind === "list" &&
      category.presentation.sections[0]?.rows[0]?.id === "item:item-burger",
    category);

  const bridgeKnown = makeFakeAdmin({
    inbound: { interactiveId: "item:item-burger", text: "عايز حاجة عادية ممكن تتفهم غلط" },
  });
  const knownResult = await respondAndSendWhatsApp(
    bridgeKnown.client,
    "restaurant-interactive",
    "conversation-interactive"
  );
  const knownWrites = insertedMessages(bridgeKnown.calls);
  const knownTyped = knownWrites.find((m) => (m.meta as Record<string, unknown> | undefined)?.typedAction)?.meta as Record<string, unknown>;
  ok("known tap returns before any customer-agent/LLM run", knownResult.status === "responded" && !bridgeKnown.calls.some((c) => c.table === "agent_runs"), { knownResult, calls: bridgeKnown.calls });
  ok("visible label text is ignored in favor of the item id",
    ((knownTyped?.draft as OrderDraft | undefined)?.lines ?? [])[0]?.itemId === "item-burger" &&
      JSON.stringify(knownTyped).includes("عايز حاجة عادية ممكن تتفهم غلط") === false,
    knownTyped);

  const bridgeUnknown = makeFakeAdmin({
    inbound: { interactiveId: "evil_force_paid", text: "برجر كلاسيك" },
  });
  const unknownResult = await respondAndSendWhatsApp(
    bridgeUnknown.client,
    "restaurant-interactive",
    "conversation-interactive"
  );
  const unknownWrites = insertedMessages(bridgeUnknown.calls);
  ok("unknown id produces deterministic clarification and no agent run",
    unknownResult.status === "responded" &&
      unknownWrites.some((m) => (m.meta as Record<string, unknown> | undefined)?.kind === "unknown_interactive_id") &&
      !bridgeUnknown.calls.some((c) => c.table === "agent_runs"),
    { unknownResult, unknownWrites });
  ok("unknown id is logged and does not write an order draft",
    unknownWrites.some((m) => (m.sender as string) === "system" && (m.meta as Record<string, unknown> | undefined)?.kind === "unknown_interactive_id") &&
      !unknownWrites.some((m) => Boolean(((m.meta as Record<string, unknown> | undefined)?.draft as OrderDraft | undefined)?.lines?.length)),
    unknownWrites);

  const staleQty = makeFakeAdmin({
    priorDraftRows: [{ created_at: new Date(Date.now() - 46 * 60 * 1000).toISOString(), meta: { draft: draftWithBurger() } }],
  });
  const staleQtyResult = await handleTypedInteractiveAction(staleQty.client, {
    restaurantId: "restaurant-interactive",
    conversationId: "conversation-interactive",
    interactiveId: "qty:2",
    features: {},
    safetyProbe: {},
  });
  const staleQtyDraft = insertedMessages(staleQty.calls).find((m) => (m.meta as Record<string, unknown> | undefined)?.typedAction)?.meta as Record<string, unknown>;
  ok("stale quantity prompt does not mutate current order state",
    staleQtyResult.kind === "handled" &&
      staleQtyResult.action === "qty" &&
      (((staleQtyDraft?.draft as OrderDraft | undefined)?.lines ?? []).length === 0),
    { staleQtyResult, staleQtyDraft });

  const confirmFake = makeFakeAdmin();
  const confirm = await handleTypedInteractiveAction(confirmFake.client, {
    restaurantId: "restaurant-interactive",
    conversationId: "conversation-interactive",
    interactiveId: "confirm_order",
    features: {},
    safetyProbe: {},
  });
  const confirmMessage = confirm.kind === "confirm_gate" ? confirm.userMessage : "";
  const allergyOutcome = await respond({
    brain: {
      profile: { name: "مطعم الاختبار", currency: "ج.م", timezone: "Asia/Riyadh", businessType: "restaurant" },
      dialect: "egyptian",
      menuCategories: categoryRows.map((c) => ({ id: c.id, name: c.name, sort: c.sort })),
      menuItems: [
        {
          id: "item-dessert",
          name: "كيك",
          category: "حلويات",
          price: 50,
          available: true,
          description: "",
          imageUrl: "",
          modifierIds: [],
          ingredients: [],
          allergens: ["فول سوداني"],
        },
      ],
      modifiers: [],
      branches: [],
      deliveryAreas: [],
      policies: { refund: "", cancellation: "", delivery: "", replacement: "", payment: "" },
      faqs: [],
      aiTone: {},
      mode: "live",
      isOpen: true,
      autoAccept: false,
      taxMode: "inclusive",
      taxRate: 0,
      paymentConfig: DEFAULT_PAYMENT_CONFIG,
      allergyCompanion: true,
      sessionAllergyNote: "⚠️ حساسية: فول سوداني",
      allergyAcknowledged: false,
    },
    history: [{ role: "assistant", content: "الإجمالي 50 ج.م. تحب تأكيد الطلب؟" }],
    userMessage: confirmMessage,
    initialDraft: {
      ...draftWithBurger(),
      lines: [{ itemId: "item-dessert", name: "كيك", quantity: 1, unitPrice: 50, choices: [], modifiers: [], lineTotal: 50 }],
      subtotal: 50,
      total: 50,
    },
  });
  ok("confirm_order command still enters the existing allergy checkpoint gate",
    allergyOutcome.stopReason === "allergy_checkpoint" && allergyOutcome.draft.finalized === false,
    allergyOutcome);

  const recoveryBase = {
    ownershipState: "SYSTEM_HOLD",
    escalationReason: "allergy",
    isIdle: false,
    recoveryPending: true,
    messageText: "",
  };
  eq("allergy recovery continue button outcome unchanged",
    decideRecoveryAction({ ...recoveryBase, interactiveId: RECOVERY_CHOICE_CONTINUE }),
    "resume_continue");
  eq("allergy recovery realert button outcome unchanged",
    decideRecoveryAction({ ...recoveryBase, interactiveId: RECOVERY_CHOICE_REALERT }),
    "realert");
  eq("allergy recovery emergency continue remains held",
    decideRecoveryAction({
      ...recoveryBase,
      escalationReason: emergencyEscalationReason("انسداد الحلق"),
      interactiveId: RECOVERY_CHOICE_CONTINUE,
    }),
    "emergency_held");

  console.log("STALENESS GAP: item/category ids are resolved against the current menu, but exact prompt lineage is not expressible until scoped prompts/action tokens land in the BRAIN contract.");
  ok("staleness limitation is explicitly documented by this proof", true);
} finally {
  restoreEnv();
}

console.log(`INTERACTIVE COMMANDS PROOF: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
