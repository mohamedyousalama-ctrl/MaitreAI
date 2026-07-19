// ============================================================================
// WO-STATE-TRUTH proof — zone-state persistence (A), ask-back repair (B), assent
// vocabulary (C), plus the MANDATORY end-to-end multi-turn scenario that reproduces
// the DB-proven production failure and shows it resolved.
//
// The production conversation failed 5 ways: (1) the chosen zone was never persisted,
// so ambiguity re-detected every turn and finalize told the customer «مش ضمن مناطق
// التوصيل» — contradicting its own recap; (2) the ask-back containment check missed the
// model's *bold* variant and double-asked; (3) it kept re-appending the stale question
// after resolution; (4) «اكد» wasn't recognized as assent → the recap looped.
//
// Run: node --conditions=react-server --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types scripts/proof-state-truth.test.ts
// ============================================================================
import {
  selectZoneFromReply,
  persistZoneToDraft,
  clearPersistedZone,
  hasPersistedZone,
} from "../lib/ai/zone-state.ts";
import {
  emptyDraft,
  executeTool,
  type ToolContext,
  type OrderDraft,
} from "../lib/ai/tools.ts";
import { matchAddressToZones } from "../lib/delivery/address.ts";
import { replyContainsQuestion, injectPendingQuestion } from "../lib/ai/askback-injection.ts";
import { isExplicitOrderConfirmation } from "../lib/ai/order-confirm.ts";
import { respond } from "../lib/ai/respond.ts";
import { DEFAULT_PAYMENT_CONFIG } from "../lib/payments/config.ts";
import type { DeliveryArea, MenuItem, Modifier, Branch } from "../lib/types.ts";
import type { LlmMessage } from "../lib/ai/llm/types.ts";

process.env.AI_ADAPTER = "mock";

let pass = 0, fail = 0;
const ok = (name: string, condition: boolean) => {
  if (condition) pass++;
  else { fail++; console.log("  ❌", name); }
};
const eq = (name: string, actual: unknown, expected: unknown) => {
  ok(`${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`, actual === expected);
};
const countOccurrences = (haystack: string, needle: string): number =>
  needle ? haystack.split(needle).length - 1 : 0;

// ── fixtures ─────────────────────────────────────────────────────────────────
// «المطبعة والمحولات هرم» (fee 38 — the production zone) plus other «… هرم» zones so the
// address «الهرم …» is genuinely ambiguous and «الهرم» alone stays a non-answer.
const TARGET = "المطبعة والمحولات هرم";
const ADDRESS = "الهرم. شارع اللبيني";
const zones: DeliveryArea[] = [
  { id: "catch", name: "الجيزه كلها", deliveryFee: 30, minOrder: 0, estimatedTime: "45 دقيقة", active: true },
  { id: "coop", name: "التعاون هرم", deliveryFee: 31, minOrder: 0, estimatedTime: "45 دقيقة", active: true },
  { id: "talbeya", name: "الطالبية هرم", deliveryFee: 55, minOrder: 0, estimatedTime: "45 دقيقة", active: true },
  { id: "matbaa", name: TARGET, deliveryFee: 38, minOrder: 0, estimatedTime: "45 دقيقة", active: true },
  { id: "faisal", name: "فيصل", deliveryFee: 40, minOrder: 0, estimatedTime: "45 دقيقة", active: true },
];
const menu: MenuItem[] = [
  { id: "fillet", name: "فيليه سوبريم", price: 100, category: "ساندويتشات", available: true,
    description: "", imageUrl: "", modifierIds: [], ingredients: [], allergens: [], variants: [], choiceGroups: [] },
];
const modifiers: Modifier[] = [];
const branches: Branch[] = [];

function ctx(draft: OrderDraft): ToolContext {
  return {
    menuItems: menu, modifiers, deliveryAreas: zones, branches,
    geoRouting: false, addressFlowV2: true, draft, signals: [], escalation: null,
    presentation: null, photoRequests: [], taxMode: "inclusive", taxRate: 0,
    paymentConfig: DEFAULT_PAYMENT_CONFIG, resendReceipt: false, userConfirmed: false, explicitHuman: false,
  };
}
function deliveryDraftWithLine(over: Partial<OrderDraft> = {}): OrderDraft {
  const d = emptyDraft("ج");
  d.fulfillment = "delivery";
  d.lines.push({ itemId: "fillet", name: "فيليه سوبريم", quantity: 1, unitPrice: 100, choices: [], modifiers: [], lineTotal: 100 });
  d.subtotal = 100; d.total = 100;
  return { ...d, ...over };
}

// The exact ambiguity question the address produces (candidate order is deterministic).
const AMB = matchAddressToZones(ADDRESS, zones);
if (AMB.kind !== "ambiguous") { console.log("  ❌ fixture: address must be ambiguous"); process.exit(1); }
const Q = AMB.question;
ok("fixture: ambiguity candidates include the target zone", AMB.candidates.some((c) => c.zone.name === TARGET));

// ══════════════════════════════════════════════════════════════════════════════
// PART A — ZONE STATE TRUTH
// ══════════════════════════════════════════════════════════════════════════════

// A1 — exact-name selection.
{
  const z = selectZoneFromReply(TARGET, ADDRESS, zones);
  ok("A1: exact zone-name reply selects the target zone", z?.name === TARGET);
}
// A2 — fuzzy selection («المطبعة محولات» → «المطبعة والمحولات هرم»).
{
  const z = selectZoneFromReply("المطبعة محولات", ADDRESS, zones);
  ok("A2: fuzzy reply «المطبعة محولات» selects «المطبعة والمحولات هرم»", z?.name === TARGET);
}
// A3 — a non-answer that is still shared by several candidates selects nothing.
ok("A3: «الهرم» (shared by several candidates) selects no zone", selectZoneFromReply("الهرم", ADDRESS, zones) === null);
// A4 — a pleasantry selects nothing.
ok("A4: «تمام» selects no zone", selectZoneFromReply("تمام", ADDRESS, zones) === null);
// A5 — no pending ambiguity (unique address) → not a candidate-selection context.
ok("A5: no selection when the stored address is not ambiguous",
  selectZoneFromReply(TARGET, "فيصل", zones) === null);

// A6 — persist through the tool: a candidate-selection reply persists the zone-of-truth
// AND keeps the original address text (no token folding).
{
  const c = ctx(deliveryDraftWithLine({ address: ADDRESS, deliveryZone: null, deliveryFee: 0 }));
  const r = executeTool("set_delivery_address", { address: "المطبعة محولات" }, c);
  ok("A6: candidate selection succeeds (not an error)", !r.isError);
  ok("A6b: draft.zone persisted with the target name", hasPersistedZone(c.draft) && c.draft.zone!.zoneName === TARGET);
  eq("A6c: persisted zone id", c.draft.zone!.zoneId, "matbaa");
  eq("A6d: persisted delivery fee is the zone-row fee", c.draft.deliveryFee, 38);
  eq("A6e: legacy deliveryZone mirrors the selection", c.draft.deliveryZone, TARGET);
  eq("A6f: the original address text is preserved (not folded)", c.draft.address, ADDRESS);
  eq("A6g: total = subtotal + fee", c.draft.total, 138);
}
// A7 — silence after persist: a later ambiguity re-detection stays silent when a zone is set.
{
  const c = ctx(deliveryDraftWithLine({ address: ADDRESS }));
  persistZoneToDraft(c.draft, zones[3]); // المطبعة والمحولات هرم
  // Re-running the executor with the SAME reply must NOT re-ambiguate or re-ask.
  ok("A7: hasPersistedZone true after persist", hasPersistedZone(c.draft));
  const again = executeTool("set_delivery_address", { address: "المطبعة محولات" }, c);
  ok("A7b: no ambiguity signal is re-emitted once a zone is persisted",
    !c.signals.some((s) => s.detail.reason === "address_zone_ambiguous"));
  ok("A7c: the persisted zone survives", hasPersistedZone(c.draft) && c.draft.zone!.zoneName === TARGET);
  ok("A7d: reply is not the ambiguity question", !again.content.includes("قريب من إيه"));
}
// A8 — finalize validates against the persisted zone (never «مش ضمن مناطق التوصيل»).
{
  const c = ctx(deliveryDraftWithLine({ address: ADDRESS }));
  persistZoneToDraft(c.draft, zones[3]);
  c.userConfirmed = true;
  const r = executeTool("finalize_draft", {}, c);
  ok("A8: finalize succeeds against the persisted zone", !r.isError);
  ok("A8b: draft is finalized", c.draft.finalized === true);
  ok("A8c: no out-of-zone contradiction", !/مش ضمن|خارج.*التوصيل/.test(r.content));
  ok("A8d: the persisted fee is priced into the finalized total", c.draft.total === 138);
}
// A9 — changing the address text CLEARS the persisted zone (and rebinds to the new one).
{
  const c = ctx(deliveryDraftWithLine({ address: ADDRESS }));
  persistZoneToDraft(c.draft, zones[3]); // 38
  const r = executeTool("set_delivery_address", { address: "التعاون هرم بجوار السنتر" }, c);
  ok("A9: address change re-resolves without error", !r.isError);
  ok("A9b: the OLD persisted zone did not stick", c.draft.zone!.zoneName !== TARGET);
  eq("A9c: the zone rebinds to the new address's zone", c.draft.deliveryZone, "التعاون هرم");
  eq("A9d: the fee follows the new zone", c.draft.deliveryFee, 31);
}
// A10 — clearPersistedZone leaves no `zone` key (byte-identical serialization for zone-less drafts).
{
  const d = deliveryDraftWithLine({ address: ADDRESS });
  persistZoneToDraft(d, zones[3]);
  clearPersistedZone(d);
  ok("A10: clearPersistedZone removes the key entirely", !("zone" in d));
}

// ══════════════════════════════════════════════════════════════════════════════
// PART B — ASKBACK REPAIR
// ══════════════════════════════════════════════════════════════════════════════

const boldWhole = `*${Q}*`;
const boldWords = Q.split(" ").map((w) => `*${w}*`).join(" ");
// B1 — normalized containment catches the fully-bolded relay.
ok("B1: containment catches a fully *bold* question relay", replyContainsQuestion(`تمام ${boldWhole}`, Q));
// B2 — normalized containment catches word-level *bold* emphasis.
ok("B2: containment catches word-level *bold* emphasis", replyContainsQuestion(`اهلا ${boldWords} 🙏`, Q));
// B3 — a reply that already carries the bold question is left UNCHANGED (no double-ask).
{
  const r = injectPendingQuestion(`تمام ${boldWhole}`, Q);
  eq("B3: bold relay → mode unchanged (no duplicate append)", r.mode, "unchanged");
}
// B4 — single append: a substantive reply gets the question exactly once.
{
  const r = injectPendingQuestion("هجهزلك الطلب حالاً 👍", Q);
  eq("B4: substantive reply → appended once", r.mode, "appended");
  eq("B4b: the question appears exactly once", countOccurrences(r.text, Q), 1);
}
// B5 — an unrelated reply does NOT falsely contain the question.
ok("B5: unrelated reply does not contain the question", !replyContainsQuestion("اهلا بيك تحب تطلب ايه؟", Q));

// ══════════════════════════════════════════════════════════════════════════════
// PART C — ASSENT VOCABULARY
// ══════════════════════════════════════════════════════════════════════════════

const ASSENT_YES = ["اكد", "أكد", "تأكيد", "تأكيد الطلب", "تمام", "أيوه", "ايوه", "موافق", "اوكي", "ok", "يلا"];
for (const w of ASSENT_YES) ok(`C+: «${w}» is recognized as assent`, isExplicitOrderConfirmation(w));
// Negatives stay negative (questions / modifications / negated agreement / cancellation).
const ASSENT_NO: [string, string][] = [
  ["عندي أسئلة", "a question is not assent"],
  ["عايز اعدل الطلب", "a modification request is not assent"],
  ["مش موافق", "a negated agreement is not assent"],
  ["لا تأكد", "a negated confirm is not assent"],
  ["الغِ الطلب", "a cancellation is not assent"],
];
for (const [w, why] of ASSENT_NO) ok(`C-: «${w}» — ${why}`, !isExplicitOrderConfirmation(w));

// ══════════════════════════════════════════════════════════════════════════════
// MANDATORY MULTI-TURN SCENARIO — the production conversation, end to end.
// order → توصيل → «الهرم. شارع اللبيني» → zone list → «الهرم» (non-answer → ONE re-ask,
// not duplicated) → «المطبعة محولات» (zone persisted + fee in recap) → «اكد» (advances:
// no stale question, no loop, NO out-of-zone contradiction). Sequential respond() turns
// carry the draft between them.
// ══════════════════════════════════════════════════════════════════════════════
const BRAIN = {
  profile: { name: "وصاية", currency: "ج", timezone: "Africa/Cairo", businessType: "restaurant" },
  dialect: "egyptian",
  menuItems: menu, modifiers, branches, deliveryAreas: zones,
  policies: {}, faqs: [], aiTone: { responseLength: "balanced", emojiUsage: "balanced" },
  mode: "live", isOpen: true, autoAccept: false, addressFlowV2: true,
} as never;

console.log("\n── multi-turn scenario ──");
{
  // Turn 0 (the model's set_delivery_address call on the «الهرم. شارع اللبيني» turn):
  // the written address is zone-ambiguous → the zone list is offered, no zone resolved.
  let draft = deliveryDraftWithLine();
  const seed = ctx(draft);
  const seedRes = executeTool("set_delivery_address", { address: ADDRESS }, seed);
  draft = seed.draft;
  ok("S0: the written address is ambiguous (zone list offered)", seedRes.isError === true && !!draft.address);
  ok("S0b: no zone resolved yet", !hasPersistedZone(draft) && draft.deliveryZone === null);

  // Turn 1 — «الهرم» is a NON-ANSWER (still shared by several candidates). ONE re-ask,
  // never duplicated.
  const t1 = await respond({
    brain: BRAIN,
    history: [{ role: "assistant", content: seedRes.content } as LlmMessage],
    userMessage: "الهرم",
    initialDraft: draft,
  });
  draft = t1.draft;
  ok("S1: the zone question is re-asked", t1.reply.includes(Q));
  eq("S1b: the question is asked exactly ONCE (not duplicated)", countOccurrences(t1.reply, Q), 1);
  ok("S1c: still no zone resolved after a non-answer", !hasPersistedZone(draft) && !draft.deliveryZone);

  // Turn 2 — «المطبعة محولات» selects the target candidate → zone persisted, fee in recap.
  const t2 = await respond({
    brain: BRAIN,
    history: [{ role: "assistant", content: t1.reply } as LlmMessage],
    userMessage: "المطبعة محولات",
    initialDraft: draft,
  });
  draft = t2.draft;
  ok("S2: the chosen zone is persisted to the draft", hasPersistedZone(draft) && draft.zone!.zoneName === TARGET);
  eq("S2b: the persisted fee is the zone-row fee (38)", draft.deliveryFee, 38);
  ok("S2c: the recap surfaces the fee", t2.reply.includes("38"));
  ok("S2d: the recap is a real order readback (has الإجمالي)", t2.reply.includes("الإجمالي"));
  ok("S2e: the stale zone question is NOT re-appended after resolution", !t2.reply.includes("قريب من إيه"));
  ok("S2f: a zone_selected_persisted audit signal is recorded",
    t2.signals.some((s) => s.detail.reason === "zone_selected_persisted"));

  // Turn 3 — «اكد» advances (fast-path finalize): no stale question, no loop, NO out-of-zone.
  ok("S3-pre: «اكد» is recognized as assent", isExplicitOrderConfirmation("اكد"));
  const t3 = await respond({
    brain: BRAIN,
    history: [{ role: "assistant", content: t2.reply } as LlmMessage],
    userMessage: "اكد",
    initialDraft: draft,
  });
  draft = t3.draft;
  ok("S3: the order advances to finalized", draft.finalized === true);
  ok("S3b: NO out-of-zone contradiction at finalize", !/مش ضمن|خارج.*التوصيل/.test(t3.reply));
  ok("S3c: NO stale zone question on the confirmation turn", !t3.reply.includes("قريب من إيه"));
  eq("S3d: the finalized total carries the persisted fee (100 + 38)", draft.total, 138);
  console.log("  transcript S2 recap :", t2.reply.replace(/\n/g, " ⏎ "));
  console.log("  transcript S3 finalize:", t3.reply.replace(/\n/g, " ⏎ "));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} proof-state-truth: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
