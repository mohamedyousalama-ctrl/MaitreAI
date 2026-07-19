// WO-ADDR proof: written address → named-zone match, ambiguity question, optional
// pin fallback, no-match miss signal, old-draft restatement, and flag-off identity.
// Run: node --conditions=react-server --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types scripts/proof-address-flow.test.ts
import { buildCustomerAgentSystemPrompt } from "../lib/ai/prompt.ts";
import { buildOldDraftRestatementReply, DRAFT_REOPEN_RESTATEMENT_MS, shouldRestateRestorableDraft } from "../lib/ai/draft-restatement.ts";
import { emptyDraft, executeTool, ORDER_TOOLS, orderToolsForDelivery, type ToolContext, type OrderDraft } from "../lib/ai/tools.ts";
import { matchAddressToZones } from "../lib/delivery/address.ts";
import { DEFAULT_PAYMENT_CONFIG } from "../lib/payments/config.ts";
import type { Branch, DeliveryArea, MenuItem, Modifier } from "../lib/types.ts";

let pass = 0, fail = 0;
const ok = (name: string, condition: boolean) => {
  if (condition) pass++;
  else { fail++; console.log("  ❌", name); }
};
const eq = (name: string, actual: unknown, expected: unknown) => {
  ok(`${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`, actual === expected);
};

const zones: DeliveryArea[] = [
  { id: "catch", name: "الجيزه كلها", deliveryFee: 30, minOrder: 0, estimatedTime: "45 دقيقة", active: true },
  { id: "coop", name: "التعاون هرم", deliveryFee: 31, minOrder: 0, estimatedTime: "45 دقيقة", active: true },
  { id: "talbeya", name: "الطالبية هرم", deliveryFee: 55, minOrder: 0, estimatedTime: "45 دقيقة", active: true },
  { id: "mishaal", name: "مشعل هرم", deliveryFee: 45, minOrder: 0, estimatedTime: "45 دقيقة", active: true },
  { id: "faisal", name: "فيصل", deliveryFee: 40, minOrder: 0, estimatedTime: "45 دقيقة", active: true },
];
const branches: Branch[] = [];
const modifiers: Modifier[] = [];
const menu: MenuItem[] = [
  {
    id: "fillet",
    name: "فيليه سوبريم",
    price: 100,
    category: "ساندويتشات",
    available: true,
    description: "",
    imageUrl: "",
    modifierIds: [],
    ingredients: [],
    allergens: [],
    variants: [],
    choiceGroups: [],
  },
];

function ctx(draft: OrderDraft = emptyDraft("ج")): ToolContext {
  return {
    menuItems: menu,
    modifiers,
    deliveryAreas: zones,
    branches,
    geoRouting: false,
    addressFlowV2: true,
    draft,
    signals: [],
    escalation: null,
    presentation: null,
    photoRequests: [],
    taxMode: "inclusive",
    taxRate: 0,
    paymentConfig: DEFAULT_PAYMENT_CONFIG,
    resendReceipt: false,
    userConfirmed: false,
    explicitHuman: false,
  };
}

function draftWithLine(): OrderDraft {
  const draft = emptyDraft("ج");
  draft.lines.push({
    itemId: "fillet",
    name: "فيليه سوبريم",
    quantity: 1,
    unitPrice: 100,
    choices: [],
    modifiers: [],
    lineTotal: 100,
  });
  draft.subtotal = 100;
  draft.total = 100;
  return draft;
}

// 1-2. Pure matcher: unique zone when enough distinctive text is present.
{
  const match = matchAddressToZones("شارع التعاون هرم بجوار السنتر", zones);
  eq("unique matcher chooses التعاون هرم", match.kind, "unique");
  if (match.kind === "unique") eq("unique matcher fee provenance candidate", match.zone.deliveryFee, 31);
}

// 3-5. Ambiguous هرم text yields one targeted question listing candidates, no pin demand.
{
  const match = matchAddressToZones("شارع الهرم", zones);
  eq("ambiguous matcher stays ambiguous", match.kind, "ambiguous");
  if (match.kind === "ambiguous") {
    ok("ambiguous candidates include cooperation", match.candidates.some((c) => c.zone.name === "التعاون هرم"));
    ok("ambiguous candidates include talbeya", match.candidates.some((c) => c.zone.name === "الطالبية هرم"));
    ok("ambiguous question names zone options", match.question.includes("التعاون هرم") && match.question.includes("الطالبية هرم"));
    ok("ambiguous question is targeted", /^قريب من إيه —/.test(match.question));
    ok("ambiguous question does not demand a pin", !/مطلوب|لازم|لوكيشن|موقع/.test(match.question));
  }
}

// 6-8. Executor unique match applies the zone-row fee and recomputes the total.
{
  const c = ctx(draftWithLine());
  const result = executeTool("set_delivery_address", { address: "شارع التعاون هرم" }, c);
  ok("unique executor succeeds", !result.isError);
  eq("unique executor stores matched zone", c.draft.deliveryZone, "التعاون هرم");
  eq("unique executor fee from zone row", c.draft.deliveryFee, 31);
  eq("unique executor total includes matched fee", c.draft.total, 131);
  ok("unique executor does not ask for pin", !/لوكيشن|موقع/.test(result.content));
}

// 9-11. Executor ambiguity blocks fee selection and returns one targeted candidate question.
{
  const c = ctx(draftWithLine());
  const result = executeTool("set_delivery_address", { address: "شارع الهرم" }, c);
  ok("ambiguous executor returns an error for clarification", result.isError === true);
  eq("ambiguous executor does not select catch-all", c.draft.deliveryZone, null);
  eq("ambiguous executor does not apply a fee", c.draft.deliveryFee, 0);
  ok("ambiguous executor question lists zones", result.content.includes("التعاون هرم") && result.content.includes("الطالبية هرم"));
  ok("ambiguous executor explicitly forbids pin demand", result.content.includes("لا تطلب لوكيشن"));
}

// 12-15. No match applies catch-all only as preliminary, offers pin as option, and logs miss signal.
{
  const c = ctx(draftWithLine());
  const result = executeTool("set_delivery_address", { address: "شارع النخيل خلف المدرسة" }, c);
  ok("no-match executor succeeds with catch-all fallback", !result.isError);
  eq("no-match executor uses catch-all zone", c.draft.deliveryZone, "الجيزه كلها");
  eq("no-match executor uses catch-all fee", c.draft.deliveryFee, 30);
  ok("no-match label is preliminary", result.content.includes("رسوم مبدئية") && result.content.includes("لحد ما نحدد"));
  ok("no-match offers pin as an option", result.content.includes("يبعت اللوكيشن") && result.content.includes("أو يقول أقرب منطقة"));
  ok("no-match records a zone miss signal", c.signals.some((s) => s.detail.reason === "address_zone_no_match"));
}

// 16-17. Tool definitions: flag-off keeps legacy objects; flag-on changes set_delivery_address.
ok("flag OFF tool definitions preserve ORDER_TOOLS by reference", orderToolsForDelivery(false, false) === ORDER_TOOLS);
ok("flag ON tool definition mentions address matching", JSON.stringify(orderToolsForDelivery(false, true)).includes("match it against the tenant's named delivery zones"));

function promptCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    profile: { name: "وصاية", currency: "ج.م", timezone: "Africa/Cairo", businessType: "restaurant" },
    dialect: "egyptian",
    menuItems: [],
    modifiers: [],
    branches: [],
    deliveryAreas: zones,
    policies: { refund: "", cancellation: "", delivery: "", replacement: "", payment: "" },
    faqs: [],
    aiTone: { personality: "friendly", responseLength: "short", emojiUsage: "minimal", language: "ar", greeting: "" },
    mode: "live",
    isOpen: true,
    autoAccept: false,
    ...overrides,
  };
}

// 18-20. Prompt flag-off byte-identical; flag-on removes required-pin framing.
{
  const omitted = buildCustomerAgentSystemPrompt(promptCtx() as never);
  const off = buildCustomerAgentSystemPrompt(promptCtx({ addressFlowV2: false }) as never);
  const on = buildCustomerAgentSystemPrompt(promptCtx({ addressFlowV2: true, geoRouting: true }) as never);
  eq("flag OFF prompt byte-identical to omitted flag", off, omitted);
  ok("flag ON prompt does not demand pin first", !on.includes("ask the customer to SEND their WhatsApp location pin"));
  ok("flag ON prompt labels catch-all fee as preliminary", on.includes("رسوم مبدئية"));
}

// 21-23. Old draft restatement: only reopened/restorable drafts, with explicit summary.
{
  const draft = draftWithLine();
  ok("fresh draft is not restated", !shouldRestateRestorableDraft(draft, DRAFT_REOPEN_RESTATEMENT_MS - 1));
  ok("reopened restorable draft is restated", shouldRestateRestorableDraft(draft, DRAFT_REOPEN_RESTATEMENT_MS));
  eq("old draft restatement copy", buildOldDraftRestatementReply(draft), "عندك طلب سابق: ١× فيليه سوبريم — نكمله ولا نبدأ من جديد؟");
}

console.log(`\n${fail === 0 ? "✅" : "❌"} proof-address-flow: ${pass}/${pass + fail} passed`);
console.log("sample ambiguous question:", "قريب من إيه — التعاون هرم ولا الطالبية هرم؟");
if (fail > 0) process.exit(1);
