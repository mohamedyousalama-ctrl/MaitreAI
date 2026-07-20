// WO-LEAKGUARD proof — internal text can never reach a customer + address-completeness flow.
//
// PART A: the OUTBOUND REGISTER GUARD (lib/ai/outbound-register.ts) rejects any candidate
//   outbound carrying a tool identifier (derived from the LIVE registry), a model directive
//   («استدعِ», «اطلب من العميل», «call the tool», «tool_use», JSON tool args), or a raw stack/
//   error marker — and the single assembler REPLACES a blocked reply with a frozen honest
//   fallback (never a partial patch), logging the rejected text to signals (never sent). Normal
//   Arabic replies — including the allergy deflection — pass through untouched.
// PART B: delivery readiness is DETERMINISTIC — a zone-only capture makes the frozen address ask
//   the turn's single question, the recap CTA is suppressed while a finalize-required field is
//   missing, and finalize_draft failures map to frozen customer-safe lines (never raw validator
//   text). Replays tonight's Wesaya leak: «التعاون هرم» → address question → early «تأكيد الطلب»
//   → NO internal text, address ask again → full address → recap+CTA → confirm ✓.
// PART C: an answered modifier is not re-asked when a redundant coalesced re-add omits it.
// Run: node --conditions=react-server --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types scripts/proof-leakguard.test.ts
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  isCustomerSafeText,
  inspectOutbound,
  TOOL_IDENTIFIERS,
} from "../lib/ai/outbound-register.ts";
import {
  needsStreetAddress,
  finalizeRequiredFieldMissing,
  deliveryMissingFields,
  frozenAddressAsk,
  frozenDraftHoldingLine,
  frozenGenericLine,
  frozenSafetyDeflection,
  frozenEmptyDraftLine,
  classifyFinalizeFailure,
  finalizeFailureReply,
} from "../lib/ai/delivery-readiness.ts";
import { composeFinalReply } from "../lib/ai/reply-compose.ts";
import { honestHandoffLine } from "../lib/ai/turn-contract.ts";
import { renderDraftRecap } from "../lib/ai/recap-render.ts";
import {
  emptyDraft,
  executeTool,
  ORDER_TOOLS,
  type ToolContext,
  type OrderDraft,
} from "../lib/ai/tools.ts";
import { respond } from "../lib/ai/respond.ts";
import { allergySimpleDeflection } from "../lib/ai/allergy-simple.ts";
import { DEFAULT_PAYMENT_CONFIG } from "../lib/payments/config.ts";
import type { DeliveryArea, MenuItem } from "../lib/types.ts";
import type { LlmMessage } from "../lib/ai/llm/types.ts";

process.env.AI_ADAPTER = "mock";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };
const eq = (n: string, a: unknown, b: unknown) => ok(`${n}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`, a === b);

// Internal markers that must NEVER appear in any delivered reply.
const LEAK_MARKERS = ["استدعِ", "اطلب من العميل", "لم يتم تسجيل", "tool_use", "set_delivery_address", "finalize_draft"];
const noLeak = (reply: string) => LEAK_MARKERS.every((m) => !reply.includes(m)) && isCustomerSafeText(reply);

const zones: DeliveryArea[] = [
  { id: "catch", name: "الجيزه كلها", deliveryFee: 30, minOrder: 0, estimatedTime: "45 دقيقة", active: true },
  { id: "coop", name: "التعاون هرم", deliveryFee: 31, minOrder: 0, estimatedTime: "45 دقيقة", active: true },
  { id: "talbeya", name: "الطالبية هرم", deliveryFee: 55, minOrder: 0, estimatedTime: "45 دقيقة", active: true },
];

const draftOf = (over: Partial<OrderDraft> = {}): OrderDraft =>
  ({
    lines: [{ itemId: "pizza", name: "بيتزا مارجريتا", quantity: 1, unitPrice: 195, choices: [], modifiers: [], lineTotal: 195 }],
    fulfillment: "pickup", deliveryZone: null, address: null, deliveryFee: 0,
    subtotal: 195, tax: 0, taxRate: 0, total: 195, currency: "ج.م", paymentMethod: null, finalized: false, ...over,
  }) as unknown as OrderDraft;

// A delivery draft with a resolved zone but NO street address (tonight's zone-only capture).
const zoneOnlyDelivery = (over: Partial<OrderDraft> = {}): OrderDraft =>
  draftOf({
    fulfillment: "delivery", deliveryZone: "التعاون هرم", deliveryFee: 31,
    zone: { zoneId: "coop", zoneName: "التعاون هرم", deliveryFee: 31 } as OrderDraft["zone"],
    address: null, subtotal: 195, total: 226, ...over,
  });

// ─────────────────────────── PART A — register guard unit battery ────────────────────────────
{
  // The identifier set is DERIVED from the live registry (not a hardcoded copy).
  eq("A0: TOOL_IDENTIFIERS is exactly the live registry's tool names", JSON.stringify([...TOOL_IDENTIFIERS].sort()), JSON.stringify(ORDER_TOOLS.map((t) => t.name).sort()));
  for (const real of ["set_delivery_address", "add_to_order", "finalize_draft", "present_menu", "remove_from_order", "set_fulfillment"]) {
    ok(`A0.${real}: the real tool name is in the guarded set`, TOOL_IDENTIFIERS.includes(real));
  }
  // Every tool identifier is blocked when it appears in an otherwise-normal Arabic reply.
  let allToolsBlocked = true;
  for (const id of TOOL_IDENTIFIERS) {
    if (isCustomerSafeText(`تمام يا فندم، ${id} كمان 🙏`)) allToolsBlocked = false;
  }
  ok("A1: EVERY tool identifier is blocked inside a normal-looking reply", allToolsBlocked);

  // Model-directive patterns → blocked.
  ok("A2: «… ثم استدعِ set_delivery_address» (tonight's leak) is blocked", !isCustomerSafeText("لم يتم تسجيل عنوان التوصيل. اطلب من العميل العنوان الكامل ثم استدعِ set_delivery_address."));
  ok("A3: «قم باستدعاء الأداة» is blocked", !isCustomerSafeText("قم باستدعاء الأداة دلوقتي"));
  ok("A4: «اطلب من العميل العنوان» (directive framing) is blocked", !isCustomerSafeText("اطلب من العميل العنوان الكامل"));
  ok("A5: English «call the tool» is blocked", !isCustomerSafeText("please call the tool now"));
  ok("A6: a raw «tool_use» block name is blocked", !isCustomerSafeText("tool_use: {}"));
  ok("A7: a JSON object of tool args is blocked", !isCustomerSafeText('{"address": "شارع ٩", "zone_name": "التعاون"}'));
  // Raw stack / error markers → blocked.
  ok("A8: «Error: …» is blocked", !isCustomerSafeText("Error: cannot read property"));
  ok("A9: «TypeError» is blocked", !isCustomerSafeText("TypeError: undefined is not a function"));
  ok("A10: a «at lib/…» stack frame is blocked", !isCustomerSafeText("at lib/ai/tools.ts:998"));
  // inspectOutbound classifies the first violation.
  eq("A11: inspectOutbound classes a tool id", inspectOutbound("خد بالك add_to_order").kind, "tool_identifier");
  eq("A12: inspectOutbound classes a directive", inspectOutbound("استدعِ الأداة").kind, "model_directive");
  eq("A13: inspectOutbound classes an error marker", inspectOutbound("Error: boom").kind, "error_marker");

  // Normal Arabic replies (incl. the deflection + recap + handoff + frozen lines) pass UNTOUCHED.
  ok("A14: a normal add reply passes", isCustomerSafeText("تمام، أضفت البيتزا للطلب. أجهّزلك الطلب؟"));
  ok("A15: the allergy-simple deflection passes untouched", isCustomerSafeText(allergySimpleDeflection("egyptian", 0)) && isCustomerSafeText(allergySimpleDeflection("egyptian", 1)));
  ok("A16: a rendered recap block passes", isCustomerSafeText(renderDraftRecap(draftOf(), { dialect: "egyptian" })));
  ok("A17: the honest handoff line passes", isCustomerSafeText(honestHandoffLine("egyptian")));
  ok("A18: every frozen fallback line is itself customer-safe",
    [frozenAddressAsk("egyptian"), frozenDraftHoldingLine("egyptian"), frozenGenericLine("egyptian"), frozenSafetyDeflection("egyptian"), frozenEmptyDraftLine("egyptian")].every(isCustomerSafeText));
  ok("A19: an empty/whitespace reply is trivially safe", isCustomerSafeText("") && isCustomerSafeText("   "));
}

// ─────────────────────────── PART A — compose-level block + REPLACE + fallback ───────────────
{
  const Q = "قريب من إيه — التعاون هرم ولا الطالبية هرم؟";
  // A blocked reply is REPLACED wholesale, the rejected text logged, the delivered text safe.
  const blocked = composeFinalReply({ core: "تمام، استدعِ set_delivery_address", draft: emptyDraft("ج.م"), dialect: "egyptian", canOrder: true, toolNames: [], safetyEvent: false, flagOn: true });
  ok("B1: a token-carrying reply is blocked+replaced", blocked.registerBlocked && noLeak(blocked.text));
  ok("B2: the rejected text is logged to signals (never sent)", blocked.signals.some((s) => s.detail?.reason === "outbound_register_blocked" && String(s.detail?.rejected ?? "").includes("استدعِ")));
  eq("B2b: the block kind is recorded", blocked.registerBlockKind, "tool_identifier");

  // Fallback = the pending question when one exists.
  const withPending = composeFinalReply({ core: "استدعِ add_to_order", draft: emptyDraft("ج.م"), dialect: "egyptian", canOrder: true, toolNames: [], safetyEvent: false, flagOn: true, pendingQuestion: Q });
  ok("B3: blocked + pending → fallback IS the pending question", withPending.registerBlocked && withPending.text === Q);

  // Fallback = holding line (+ address ask) for an open draft with no pending question.
  const openPickup = composeFinalReply({ core: "استدعِ finalize_draft", draft: draftOf(), dialect: "egyptian", canOrder: true, toolNames: [], safetyEvent: false, flagOn: true });
  ok("B4: blocked + open pickup draft → holding line, no address ask", openPickup.registerBlocked && openPickup.text === frozenDraftHoldingLine("egyptian"));
  const openZoneOnly = composeFinalReply({ core: "استدعِ finalize_draft", draft: zoneOnlyDelivery(), dialect: "egyptian", canOrder: true, toolNames: [], safetyEvent: false, flagOn: true });
  ok("B5: blocked + zone-only delivery draft → holding + FROZEN address ask", openZoneOnly.registerBlocked && openZoneOnly.text.includes(frozenAddressAsk("egyptian")) && noLeak(openZoneOnly.text));

  // Fallback = generic honest line for an empty draft with nothing pending.
  const emptyState = composeFinalReply({ core: "Error: boom at lib/ai/x.ts", draft: emptyDraft("ج.م"), dialect: "egyptian", canOrder: true, toolNames: [], safetyEvent: false, flagOn: true });
  ok("B6: blocked + empty draft → generic honest line", emptyState.registerBlocked && emptyState.text === frozenGenericLine("egyptian"));

  // SAFETY CONTENT preserved: a blocked SAFETY turn falls back to the safety deflection (never an order line).
  const safetyBlocked = composeFinalReply({ core: "استدعِ escalate_to_human", draft: draftOf(), dialect: "egyptian", canOrder: true, toolNames: [], safetyEvent: true, flagOn: true });
  ok("B7: blocked SAFETY turn → safety deflection (content preserved, not an order line)", safetyBlocked.registerBlocked && safetyBlocked.text === frozenSafetyDeflection("egyptian"));

  // A clean recap turn is NOT blocked (no false positive on normal assembler output).
  const clean = composeFinalReply({ core: "تمام يا فندم", draft: draftOf(), dialect: "egyptian", canOrder: true, toolNames: ["add_to_order"], safetyEvent: false, flagOn: true });
  ok("B8: a normal recap turn is NOT blocked", !clean.registerBlocked && noLeak(clean.text));
}

// ─────────────────────────── PART B — readiness + finalize failure mapping ───────────────────
{
  ok("C1: a zone-only delivery draft needs a street address", needsStreetAddress(zoneOnlyDelivery()));
  ok("C2: a delivery draft WITH address does NOT need one", !needsStreetAddress(zoneOnlyDelivery({ address: "شارع ٩ عمارة ٣" })));
  ok("C3: a pickup draft never needs a delivery address", !needsStreetAddress(draftOf()));
  eq("C4: the zone-only draft's missing field is [address]", JSON.stringify(deliveryMissingFields(zoneOnlyDelivery())), JSON.stringify(["address"]));
  ok("C5: finalizeRequiredFieldMissing is true for the zone-only draft, false when ready",
    finalizeRequiredFieldMissing(zoneOnlyDelivery()) && !finalizeRequiredFieldMissing(zoneOnlyDelivery({ address: "شارع ٩" })));

  // finalize failure classification → frozen customer-safe line (never raw validator text).
  eq("C6: missing address classifies as missing_address", classifyFinalizeFailure(zoneOnlyDelivery()), "missing_address");
  eq("C6b: → maps to the FROZEN address ask", finalizeFailureReply("missing_address", zoneOnlyDelivery(), "egyptian"), frozenAddressAsk("egyptian"));
  eq("C7: empty draft classifies as empty_draft", classifyFinalizeFailure(emptyDraft("ج.م")), "empty_draft");
  ok("C7b: → maps to an honest empty-draft line (no internal text)", noLeak(finalizeFailureReply("empty_draft", emptyDraft("ج.م"), "egyptian")!));
  eq("C8: a missing-fulfillment draft classifies as no_fulfillment", classifyFinalizeFailure(draftOf({ fulfillment: null })), "no_fulfillment");
  eq("C8b: no_fulfillment has no frozen line (caller owns the buttons)", finalizeFailureReply("no_fulfillment", draftOf({ fulfillment: null }), "egyptian"), null);
  eq("C9: a graceful delivery notice passes through as delivery_notice", classifyFinalizeFailure(draftOf({ fulfillment: "delivery", deliveryZone: "التعاون هرم", address: "ش ٩" }), { toolContent: "الحد الأدنى لطلب التوصيل لـالتعاون هرم هو ٥٠ ج.م" }), "delivery_notice");
  eq("C10: a stale version classifies as stale_version → re-recap (no frozen line here)", finalizeFailureReply(classifyFinalizeFailure(draftOf(), { staleVersion: true }), draftOf(), "egyptian"), null);
  eq("C11: an unknown failure yields no frozen line (caller → register fallback)", finalizeFailureReply("unknown", draftOf({ fulfillment: "delivery", deliveryZone: "التعاون هرم", address: "ش ٩" }), "egyptian"), null);

  // Recap CTA suppression at the assembler: a zone-only delivery recap turn carries NO «أجهّزلك».
  const suppressed = composeFinalReply({ core: "تمام", draft: zoneOnlyDelivery(), dialect: "egyptian", canOrder: true, toolNames: ["set_fulfillment"], safetyEvent: false, flagOn: true, pendingQuestion: frozenAddressAsk("egyptian") });
  ok("C12: zone-only turn → CTA «أجهّزلك» suppressed, NO glued recap, address ask is the single trailing directive",
    !suppressed.text.includes("أجهّزلك") && !/الإجمالي/.test(suppressed.text) && suppressed.text.trimEnd().endsWith(frozenAddressAsk("egyptian")));
  // A READY delivery draft keeps its CTA (suppression is scoped to missing fields only).
  const ready = composeFinalReply({ core: "تمام", draft: zoneOnlyDelivery({ address: "شارع ٩ عمارة ٣" }), dialect: "egyptian", canOrder: true, toolNames: ["add_to_order"], safetyEvent: false, flagOn: true });
  ok("C13: a READY delivery draft still shows the recap CTA", ready.recapRendered && /أجهّزلك/.test(ready.text));
}

// ─────────────────────────── PART C — answered-modifier dedupe ───────────────────────────────
{
  const sauceMenu: MenuItem[] = [{
    id: "shawarma", name: "شاورما", price: 60, category: "ساندويتشات", available: true, description: "", imageUrl: "",
    modifierIds: [], ingredients: [], allergens: [], variants: [],
    choiceGroups: [{ name: "الصوص", minSelect: 1, maxSelect: 1, options: [
      { label: "صوص أحمر", priceDelta: 0, active: true },
      { label: "صوص أبيض", priceDelta: 0, active: true },
    ] }],
  } as unknown as MenuItem];
  const mkCtx = (draft: OrderDraft): ToolContext => ({
    menuItems: sauceMenu, modifiers: [], deliveryAreas: zones, branches: [], geoRouting: false, addressFlowV2: true,
    draft, signals: [], escalation: null, presentation: null, photoRequests: [], taxMode: "inclusive", taxRate: 0,
    paymentConfig: DEFAULT_PAYMENT_CONFIG, resendReceipt: false, userConfirmed: false, explicitHuman: false,
  });

  // Nothing answered yet → the required sauce IS asked (the fill gate still works).
  const c1 = mkCtx(emptyDraft("ج.م"));
  const r1 = executeTool("add_to_order", { item_name: "شاورما", quantity: 1 }, c1);
  ok("D1: an unanswered required modifier is asked (gate intact)", r1.isError === true && r1.content.includes("يحتاج اختيار"));

  // Answer it once → the line carries the sauce.
  const c2 = mkCtx(emptyDraft("ج.م"));
  const r2 = executeTool("add_to_order", { item_name: "شاورما", quantity: 1, picks: ["صوص أحمر"] }, c2);
  ok("D2: answering the sauce adds the line with the chosen sauce", !r2.isError && c2.draft.lines[0]?.choices.some((ch) => ch.label === "صوص أحمر"));

  // Coalescing race — a redundant re-add WITHOUT the sauce must NOT re-ask (answered this window).
  const r3 = executeTool("add_to_order", { item_name: "شاورما", quantity: 1 }, c2);
  ok("D3: a redundant re-add is NOT re-asked (answered-modifier dedupe)", !r3.isError && !r3.content.includes("يحتاج اختيار"));
  ok("D3b: the inherited-dedupe signal is recorded", c2.signals.some((s) => s.detail?.reason === "modifier_dedupe_inherited"));
  ok("D3c: the line still carries the answered sauce", c2.draft.lines.every((l) => l.choices.some((ch) => ch.label === "صوص أحمر")));
}

// ─────────────────── MULTI-TURN SCENARIO — replay tonight's Wesaya conversation ───────────────
const BRAIN = (extra: Record<string, unknown>) => ({
  profile: { name: "Wesaya", currency: "ج.م", timezone: "Africa/Cairo", businessType: "restaurant" },
  dialect: "egyptian",
  menuItems: [{ id: "pizza", name: "بيتزا مارجريتا", category: "بيتزا", price: 195, available: true, description: "", imageUrl: "", modifierIds: [], ingredients: [], allergens: [], variants: [], choiceGroups: [] }],
  modifiers: [], branches: [], deliveryAreas: zones, policies: {}, faqs: [],
  aiTone: { responseLength: "balanced", emojiUsage: "balanced" },
  mode: "test", isOpen: true, autoAccept: false, finishLine: true, addressFlowV2: true, ...extra,
}) as never;

const transcript: string[] = [];
{
  // Turn 1 — zone-only capture «التعاون هرم»: fee applied + immediate FROZEN address ask, no CTA.
  const out1 = await respond({ brain: BRAIN({}), history: [], userMessage: "التعاون هرم", initialDraft: zoneOnlyDelivery() });
  transcript.push(out1.reply);
  ok("S1: zone-only turn delivers the frozen address ask", out1.reply.includes(frozenAddressAsk("egyptian")));
  ok("S1b: … with NO confirmation CTA, NO glued recap, and NO internal text (info-collection turn)",
    !out1.reply.includes("أجهّزلك") && !out1.reply.includes("أكمّل") && !/الإجمالي/.test(out1.reply) && noLeak(out1.reply));
  ok("S1c: … the zone fee stayed applied (٣١)", out1.draft.deliveryFee === 31);
  ok("S1d: … a delivery_address_required signal fired", out1.signals.some((s) => s.detail?.reason === "delivery_address_required"));

  // Turn 2 — the customer taps «تأكيد الطلب» EARLY (address still missing). The recap CTA had
  // invited confirmation → fast-path finalize → finalize fails. tonight it LEAKED the validator
  // string; now it maps to the frozen address ask, and NO internal text ships.
  const readback: LlmMessage[] = [{ role: "assistant", content: "طلبك: ١× بيتزا مارجريتا\nرسوم التوصيل: ٣١ ج.م\nالإجمالي: ٢٢٦ ج.م\nأجهّزلك الطلب؟" }];
  const out2 = await respond({ brain: BRAIN({}), history: readback, userMessage: "تأكيد الطلب", initialDraft: zoneOnlyDelivery() });
  transcript.push(out2.reply);
  ok("S2: early confirm on a zone-only draft delivers the address ask, NOT internal text", out2.reply.includes(frozenAddressAsk("egyptian")) && noLeak(out2.reply));
  ok("S2b: … the order is NOT finalized (confirmation blocked until address exists)", out2.draft.finalized !== true);
  ok("S2c: … the tonight-leak validator string never appears", !out2.reply.includes("لم يتم تسجيل عنوان التوصيل"));

  // Turn 3 — the customer sends the full street address → readiness satisfied, no address ask forced.
  const full = "شارع ٩ عمارة ٣ بجوار الصيدلية، التعاون";
  const out3 = await respond({ brain: BRAIN({}), history: [], userMessage: full, initialDraft: zoneOnlyDelivery({ address: full }) });
  transcript.push(out3.reply);
  ok("S3: with a street address present, the draft is finalize-ready (no missing field)", !finalizeRequiredFieldMissing(out3.draft) && noLeak(out3.reply));

  // Turn 4 — «أكد» at a real confirmation point → finalize SUCCEEDS, confirmed recap, no internal text.
  const out4 = await respond({ brain: BRAIN({}), history: readback, userMessage: "أكد", initialDraft: zoneOnlyDelivery({ address: full }) });
  transcript.push(out4.reply);
  ok("S4: a ready draft finalizes on «أكد»", out4.draft.finalized === true);
  ok("S4b: … the confirmed recap ships, customer-safe, with the total", /تم تسجيل الطلب/.test(out4.reply) && /الإجمالي/.test(out4.reply) && noLeak(out4.reply));

  // Whole-transcript invariant: not a single turn leaked internal text.
  ok("S5: NO turn in the whole scenario leaked internal text", transcript.every(noLeak));
}

// ─────────────────── FLAG-OFF legacy settle is guarded too (all tenants) ─────────────────────
{
  // finishLine OFF → the legacy settle path. A pending zone question is still injected, and the
  // register net still runs, so a mock reply can never carry internal text on the legacy path.
  const out = await respond({ brain: BRAIN({ finishLine: false }), history: [], userMessage: "التعاون هرم", initialDraft: zoneOnlyDelivery() });
  ok("F0: flag-OFF legacy settle delivers the frozen address ask, customer-safe", out.reply.includes(frozenAddressAsk("egyptian")) && noLeak(out.reply));
}

// ─────────────────── SOURCE WIRING — the parts sit where the WO placed them ──────────────────
const rc = readFileSync(resolve(process.cwd(), "lib/ai/reply-compose.ts"), "utf8");
const rs = readFileSync(resolve(process.cwd(), "lib/ai/respond.ts"), "utf8");
const tl = readFileSync(resolve(process.cwd(), "lib/ai/tools.ts"), "utf8");
const orIdx = rc.indexOf("inspectOutbound(text)");
const contractIdx = rc.indexOf("enforceTurnContract(");
ok("W1: the register guard runs AFTER the turn-contract stage (it is the LAST stage)", orIdx > contractIdx && contractIdx > 0);
ok("W2: the register guard derives tool names from the live registry", /ORDER_TOOLS\.map\(\(t\) => t\.name\)/.test(readFileSync(resolve(process.cwd(), "lib/ai/outbound-register.ts"), "utf8")));
ok("W3: respond.ts sets the frozen address ask as the pending question for a zone-only capture", /needsStreetAddress\(ctx\.draft\)/.test(rs) && /delivery_address_required/.test(rs));
ok("W4: the fast-path finalize maps failures via classifyFinalizeFailure (never raw text)", /classifyFinalizeFailure\(ctx\.draft/.test(rs) && /finalizeFailureReply\(/.test(rs));
ok("W5: the modifier dedupe lives in the add_to_order fill gate", /modifier_dedupe_inherited/.test(tl));

console.log(`\n${fail === 0 ? "✅" : "❌"} proof-leakguard: ${pass}/${pass + fail} passed`);
console.log("sample blocked→fallback:", composeFinalReply({ core: "استدعِ set_delivery_address", draft: zoneOnlyDelivery(), dialect: "egyptian", canOrder: true, toolNames: [], safetyEvent: false, flagOn: true }).text.replace(/\n/g, " ⏎ "));
if (fail > 0) process.exit(1);
