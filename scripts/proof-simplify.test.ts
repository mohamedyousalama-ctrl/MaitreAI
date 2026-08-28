// WO-SIMPLIFY proof — the allergy-simple posture + the reply-assembly fix pack (Parts A–E).
// PART A: allergy_simple mode — first mention → menu deflection + human offer (no hold, no
//   escalation, no memory write); repeat → normal + throttled re-offer; the no-reassure floor and
//   the session-scoped canonical kitchen-ticket line survive unconditionally.
// PART B: draft lifecycle — finalized closes the basket, an explicit reset archives, a >12h stale
//   draft is archived (the ghost-draft fix).
// PART C: recap fires only on mutation/total/finalize turns, never on an info-collection turn; the
//   ask-back head-match replaces a partial question instead of duplicating it.
// PART D: the turn contract is scoped to an active unmet goal; a post-completion social turn is a
//   legal terminal state (no handoff appendix), and an identical next-step is never repeated.
// PART E: ONE final-compose pass orders every reply, and the recap renders ONLY from a consistent
//   priced draft (an empty/wrong «الإجمالي:» is impossible).
// Run: node --conditions=react-server --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types scripts/proof-simplify.test.ts
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  detectAllergyOrDiseaseMention,
  mentionsDiseaseCondition,
  allergySimpleDeflection,
  allergySimpleReoffer,
  isDirectIngredientOrSafetyQuestion,
  decideAllergySimple,
  buildTicketAllergyNote,
  countPriorAllergyMentions,
  turnsSinceLastAllergyOffer,
  collectConversationAllergenTerms,
  REOFFER_THROTTLE_TURNS,
} from "../lib/ai/allergy-simple.ts";
import { assertsAllergenSafety } from "../lib/ai/allergen-gate.ts";
import { assertsDiseaseDietClaim } from "../lib/ai/disease-diet-guard.ts";
import { scanBannedAllergyPhrases } from "../lib/ai/allergen-companion.ts";
import { isExplicitResetIntent, decideDraftLifecycle, DRAFT_ARCHIVE_MS, DRAFT_RESUME_FRESHNESS_MS } from "../lib/ai/draft-lifecycle.ts";
import { isDraftPricedConsistent, renderDraftRecap, containsRenderedRecap } from "../lib/ai/recap-render.ts";
import { injectPendingQuestion, questionHead } from "../lib/ai/askback-injection.ts";
import { enforceTurnContract, salesNextStepLine, honestHandoffLine, hasActiveUnmetGoal, isSocialClosingTurn } from "../lib/ai/turn-contract.ts";
import { composeFinalReply } from "../lib/ai/reply-compose.ts";
import { buildMenuListPresentation } from "../lib/ai/tools.ts";
import { respond } from "../lib/ai/respond.ts";
import type { OrderDraft } from "../lib/ai/tools.ts";
import type { LlmMessage } from "../lib/ai/llm/types.ts";

process.env.AI_ADAPTER = "mock";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };
const eq = (n: string, a: unknown, b: unknown) => ok(`${n}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`, a === b);

const draftOf = (qty: number, over: Partial<OrderDraft> = {}): OrderDraft =>
  ({
    lines: [{ itemId: "pizza", name: "بيتزا مارجريتا", quantity: qty, unitPrice: 195, choices: [], modifiers: [], lineTotal: 195 * qty }],
    fulfillment: "pickup", deliveryZone: null, address: null, deliveryFee: 0,
    subtotal: 195 * qty, tax: 0, taxRate: 0, total: 195 * qty, currency: "ج.م", paymentMethod: null, finalized: false, ...over,
  }) as unknown as OrderDraft;

// ─────────────────────────── PART A — allergy_simple ─────────────────────────────────────────
{
  // Detector REUSE — the union fires on the same signals the engine uses.
  ok("A1: allergy avoidance fires the detector", detectAllergyOrDiseaseMention("عندي حساسية من المكسرات").fired);
  ok("A2: symptom fires the detector", detectAllergyOrDiseaseMention("بتحسس من اللبن وبيوجعني بطني").fired);
  ok("A3: disease condition input is detected", mentionsDiseaseCondition("انا عندي سكر") && detectAllergyOrDiseaseMention("انا مريض سكر").fired);
  ok("A4: a plain order is NOT an allergy mention", !detectAllergyOrDiseaseMention("عايز بيتزا وسط").fired);

  // Deflection templates (2 variants) — carry the menu core + human offer, and NEVER reassure.
  for (const v of [0, 1]) {
    const t = allergySimpleDeflection("egyptian", v);
    ok(`A5.${v}: variant carries the menu-core «المكونات … المنيو»`, /المكونات/.test(t) && /المنيو/.test(t));
    ok(`A5.${v}: variant carries the human offer`, /أحوّلك/.test(t));
    ok(`A5.${v}: variant NEVER reassures (no-reassure floor holds)`,
      !assertsAllergenSafety(t) && !assertsDiseaseDietClaim(t) && scanBannedAllergyPhrases(t).length === 0);
  }
  ok("A6: the two variants are distinct + rotation is deterministic", allergySimpleDeflection("egyptian", 0) !== allergySimpleDeflection("egyptian", 1) && allergySimpleDeflection("egyptian", 2) === allergySimpleDeflection("egyptian", 0));
  ok("A7: the re-offer line is banned-clean + carries the human offer", scanBannedAllergyPhrases(allergySimpleReoffer("egyptian")).length === 0 && /أحوّلك/.test(allergySimpleReoffer("egyptian")));

  // Decision: first mention → deflect; repeat → normal; repeat direct-Q past throttle → reoffer.
  eq("A8: first mention → deflect", decideAllergySimple({ history: [], userMessage: "عندي حساسية من المكسرات" }).action, "deflect");
  const firstDeflect: LlmMessage[] = [{ role: "user", content: "عندي حساسية من المكسرات" }, { role: "assistant", content: allergySimpleDeflection("egyptian", 0) }];
  eq("A9: repeat mention right after the offer → normal (no re-deflect)", decideAllergySimple({ history: firstDeflect, userMessage: "وكمان عندي حساسية من البيض" }).action, "normal");
  // Build a history where the last offer is > THROTTLE assistant turns ago.
  const spaced: LlmMessage[] = [{ role: "user", content: "عندي حساسية من المكسرات" }, { role: "assistant", content: allergySimpleDeflection("egyptian", 0) }];
  for (let i = 0; i < REOFFER_THROTTLE_TURNS + 1; i++) { spaced.push({ role: "user", content: `سؤال ${i}` }, { role: "assistant", content: `رد ${i}` }); }
  eq("A10: repeat direct ingredient-Q past the throttle → reoffer", decideAllergySimple({ history: spaced, userMessage: "طيب فيه مكسرات في البيتزا؟" }).action, "reoffer");
  ok("A11: throttle honored — a direct-Q WITHIN the window does not re-offer", decideAllergySimple({ history: firstDeflect, userMessage: "فيه مكسرات؟" }).action !== "reoffer");
  ok("A12: direct ingredient/safety question detector", isDirectIngredientOrSafetyQuestion("فيه لبن؟") && isDirectIngredientOrSafetyQuestion("ده آمن؟") && !isDirectIngredientOrSafetyQuestion("تمام شكرا"));

  // Kitchen-ticket canonical line (UNCONDITIONAL floor) — canonical entities only, session-scoped.
  eq("A13: ticket line drops trigger/symptom words → canonical entities only",
    buildTicketAllergyNote(["حساسه", "حكه", "قمح", "حساسية", "بيض"]), "⚠️ العميل ذكر حساسية/حالة صحية: قمح، بيض");
  eq("A14: an allergy mention with no substance → «غير محدد»", buildTicketAllergyNote(["حساسية"]), "⚠️ العميل ذكر حساسية/حالة صحية: غير محدد");
  ok("A15: collect conversation terms gathers named allergens across turns",
    collectConversationAllergenTerms([{ role: "user", content: "عندي حساسية من المكسرات" }] as LlmMessage[], "وكمان من البيض").length >= 1);

  // Prior-mention counting + throttle distance.
  eq("A16: countPriorAllergyMentions counts firing customer turns", countPriorAllergyMentions([{ role: "user", content: "عندي حساسية" }, { role: "assistant", content: "x" }] as LlmMessage[]), 1);
  ok("A17: turnsSinceLastAllergyOffer is Infinity when no offer was sent", turnsSinceLastAllergyOffer([{ role: "assistant", content: "أهلاً" }] as LlmMessage[]) === Infinity);

  // The send-menu mechanism is reusable (the deflection points at the real menu).
  const pres = buildMenuListPresentation([{ id: "pizza", name: "بيتزا", price: 195, available: true, category: "بيتزا", description: "", imageUrl: "", modifierIds: [], ingredients: [], allergens: [], variants: [], choiceGroups: [] } as never], "ج.م");
  ok("A18: buildMenuListPresentation builds a tappable list from available items", !!pres && pres.kind === "list" && pres.sections[0].rows[0].id === "item:pizza");
  ok("A19: no available items → null (honest, no empty list)", buildMenuListPresentation([], "ج.م") === null);
}

// ─────────────────────────── PART B — draft lifecycle ────────────────────────────────────────
{
  ok("B1: explicit reset intents detected", isExplicitResetIntent("عايز اعمل طلب جديد") && isExplicitResetIntent("الغي الطلب كله") && isExplicitResetIntent("نبدأ من الأول"));
  ok("B2: a normal order-build is NOT a reset", !isExplicitResetIntent("عايز اطلب بيتزا") && !isExplicitResetIntent("زود واحدة كمان"));
  eq("B3: finalized draft → basket closed (no resume)", decideDraftLifecycle({ finalized: true, lineCount: 2, ageMs: 1000, resetIntent: false }).action, "finalized");
  eq("B4: reset intent → archive the open draft", decideDraftLifecycle({ finalized: false, lineCount: 2, ageMs: 1000, resetIntent: true }).action, "reset");
  eq("B5: > 12h stale open draft → archived (ghost-draft fix)", decideDraftLifecycle({ finalized: false, lineCount: 2, ageMs: DRAFT_ARCHIVE_MS + 1, resetIntent: false }).action, "archived_stale");
  eq("B6: fresh open draft → resume", decideDraftLifecycle({ finalized: false, lineCount: 2, ageMs: 1000, resetIntent: false }).action, "resume");
  eq("B7: past the resume window but ≤ 12h → abandoned (not resumed)", decideDraftLifecycle({ finalized: false, lineCount: 2, ageMs: DRAFT_RESUME_FRESHNESS_MS + 1, resetIntent: false }).action, "abandoned");
  ok("B8: only resume returns resume=true; archive/abandon/finalized start clean",
    decideDraftLifecycle({ finalized: false, lineCount: 2, ageMs: 1000, resetIntent: false }).resume === true &&
    [decideDraftLifecycle({ finalized: true, lineCount: 2, ageMs: 1, resetIntent: false }), decideDraftLifecycle({ finalized: false, lineCount: 2, ageMs: 1, resetIntent: true }), decideDraftLifecycle({ finalized: false, lineCount: 2, ageMs: DRAFT_ARCHIVE_MS + 1, resetIntent: false })].every((r) => r.resume === false));
  eq("B9: no lines → none", decideDraftLifecycle({ finalized: false, lineCount: 0, ageMs: 1, resetIntent: false }).action, "none");
}

// ─────────────────────────── PART E — consistency guard + assembler ──────────────────────────
{
  ok("E1: a fully priced draft is consistent", isDraftPricedConsistent(draftOf(2)));
  ok("E2: an empty draft is consistent (renders «السلة فارغة.», never a total)", isDraftPricedConsistent(draftOf(0, { lines: [] }) as OrderDraft));
  ok("E3: a draft with a missing total is INCONSISTENT", !isDraftPricedConsistent(draftOf(2, { total: undefined as unknown as number })));
  ok("E4: a line with a missing lineTotal is INCONSISTENT", !isDraftPricedConsistent({ ...draftOf(2), lines: [{ itemId: "p", name: "بيتزا", quantity: 2, unitPrice: 195, choices: [], modifiers: [], lineTotal: undefined }] } as unknown as OrderDraft));
  ok("E5: a NaN total is INCONSISTENT (empty الإجمالي impossible)", !isDraftPricedConsistent(draftOf(2, { total: NaN })));

  // The single assembler renders the recap ONLY from a consistent draft; else it skips + signals.
  const good = composeFinalReply({ core: "تمام", draft: draftOf(2), dialect: "egyptian", canOrder: true, toolNames: ["add_to_order"], safetyEvent: false, flagOn: true });
  ok("E6: consistent draft + mutation → recap rendered with the total", good.recapRendered && containsRenderedRecap(good.text));
  const bad = composeFinalReply({ core: "تمام", draft: draftOf(2, { total: undefined as unknown as number }), dialect: "egyptian", canOrder: true, toolNames: ["add_to_order"], safetyEvent: false, flagOn: true });
  ok("E7: inconsistent draft → recap SKIPPED + draft_inconsistent_recap_skipped signal", bad.recapSkippedInconsistent && !containsRenderedRecap(bad.text) && bad.signals.some((s) => s.detail?.reason === "draft_inconsistent_recap_skipped"));
  ok("E8: an inconsistent draft never emits an empty/undefined «الإجمالي:»", !/الإجمالي\s*[:：]\s*(?:undefined|NaN|\s*$)/m.test(bad.text));

  // Ordering: core → recap → single trailing question. Exactly one question.
  const composed = composeFinalReply({ core: "تمام يا فندم", draft: draftOf(2), dialect: "egyptian", canOrder: true, toolNames: ["add_to_order"], safetyEvent: false, flagOn: true });
  eq("E9: assembler output carries exactly ONE question (the recap CTA)", (composed.text.match(/[؟?]/g) ?? []).length, 1);
  ok("E10: a safety-event turn never gets a cheerful recap", !composeFinalReply({ core: "صحتك تهمنا", draft: draftOf(2), dialect: "egyptian", canOrder: true, toolNames: ["add_to_order"], safetyEvent: true, flagOn: true }).recapRendered);
}

// ─────────────────────────── PART C — recap placement + askback head-match ───────────────────
{
  const Q = "قريب من إيه — التعاون هرم، الطالبية هرم ولا مشعل هرم؟";
  ok("C1: questionHead is the leading clause head «قريب من ايه»", questionHead(Q).startsWith("قريب من ايه"));
  // HEAD-match: the model wrote a PARTIAL «قريب من إيه؟» — replace it, don't duplicate.
  const partial = injectPendingQuestion("تمام يا فندم، قريب من إيه؟", Q);
  eq("C2: a partial ask is REPLACED (not appended)", partial.mode, "replaced");
  eq("C3: … so the full question appears exactly ONCE", (partial.text.match(/قريب من إيه/g) ?? []).length, 1);
  ok("C3b: … and there is exactly one question mark", (partial.text.match(/[؟?]/g) ?? []).length === 1);
  // Full question already present → unchanged (no double-ask).
  eq("C4: the full question already present → unchanged", injectPendingQuestion(`تمام. ${Q}`, Q).mode, "unchanged");
  // No head present + real content → appended on its own line (legacy behavior preserved).
  eq("C5: no head present → appended", injectPendingQuestion("أضفت البيتزا للطلب وكله تمام كده", Q).mode, "appended");

  // Recap SUPPRESSED on an info-collection turn (a pending deterministic question exists).
  const infoTurn = composeFinalReply({ core: "قولي عنوانك الكامل", draft: draftOf(2), dialect: "egyptian", canOrder: true, toolNames: ["set_delivery_address"], safetyEvent: false, flagOn: true, pendingQuestion: Q });
  ok("C6: pending-question turn → NO readback recap (info-collection)", !infoTurn.recapRendered && !containsRenderedRecap(infoTurn.text));
  eq("C7: … the reply carries EXACTLY ONE question, rendered last", (infoTurn.text.match(/[؟?]/g) ?? []).length, 1);
  ok("C8: … and that one question is the deterministic question", infoTurn.text.trim().endsWith(Q) || infoTurn.text.includes(Q));
}

// ─────────────────────────── PART D — turn-contract scoping ──────────────────────────────────
{
  ok("D1: an open unconfirmed draft is an active unmet goal", hasActiveUnmetGoal(draftOf(2)));
  ok("D2: a finalized draft with nothing pending is NOT an active goal", !hasActiveUnmetGoal(draftOf(2, { finalized: true })));
  ok("D3: a pending question is an active unmet goal", hasActiveUnmetGoal(draftOf(0, { lines: [] }) as OrderDraft, "قريب من إيه؟"));
  ok("D4: social-closing turns detected; order intent disqualifies", isSocialClosingTurn("شكراً جزيلاً") && isSocialClosingTurn("تمام خلاص") && !isSocialClosingTurn("شكرا بس عايز اضيف بيتزا"));

  // A post-completion social «شكراً» → NO handoff appendix (the DB-proven 3× bug).
  const social = enforceTurnContract({ text: "العفو يا فندم 🙏", dialect: "egyptian", draft: draftOf(0, { lines: [] }) as OrderDraft, socialClosing: true });
  ok("D5: social terminal turn → NO next-step appended", !social.appended && social.socialTerminal === true);
  // The same reply on an ACTIVE build turn still runs the contract.
  const active = enforceTurnContract({ text: "هختارلك أحسن تنوع", dialect: "egyptian", draft: draftOf(0, { lines: [] }) as OrderDraft, socialClosing: false });
  ok("D6: active build turn with a bare future-promise → next-step appended", active.appended);
  // Never repeat an identical next-step the previous outbound already ended with.
  //
  // WO-KHALID-SALES-NUDGE: the ordinary terminal next-step is now the sales question, not
  // the handoff, so the dedup case is tested with the nudge. The handoff dedup is kept
  // and tested too — it still applies on a safety turn, where the handoff is the step.
  const nudge = salesNextStepLine("egyptian");
  const repeat = enforceTurnContract({ text: "معلش", dialect: "egyptian", draft: draftOf(0, { lines: [] }) as OrderDraft, socialClosing: false, previousOutbound: `تمام ${nudge}` });
  ok("D7: an identical next-step is NOT repeated across turns", !repeat.appended);

  const handoff = honestHandoffLine("egyptian");
  const repeatHandoff = enforceTurnContract({ text: "معلش", dialect: "egyptian", draft: draftOf(0, { lines: [] }) as OrderDraft, socialClosing: false, safetyEvent: true, previousOutbound: `تمام ${handoff}` });
  ok("D7b: the handoff is not repeated either, on a safety turn", !repeatHandoff.appended);

  // And the ordinary turn must NOT offer to fetch a human — the defect this replaced.
  const ordinary = enforceTurnContract({ text: "تمام، سجّلت ملاحظتك.", dialect: "egyptian", draft: draftOf(0, { lines: [] }) as OrderDraft });
  ok("D7c: an ordinary turn gets a sales next-step, never a handoff offer",
    ordinary.kind === "sales_nudge" && !ordinary.text.includes(handoff));
}

// ─────────────────── END-TO-END through respond() (mock adapter) ─────────────────────────────
const BRAIN = (extra: Record<string, unknown>) => ({
  profile: { name: "Wesaya", currency: "ج.م", timezone: "Africa/Cairo", businessType: "restaurant" },
  dialect: "egyptian",
  menuItems: [{ id: "pizza", name: "بيتزا مارجريتا", category: "بيتزا", price: 195, available: true, description: "", imageUrl: "", modifierIds: [], ingredients: [], allergens: [], variants: [], choiceGroups: [] }],
  modifiers: [], branches: [], deliveryAreas: [], policies: {}, faqs: [],
  aiTone: { responseLength: "balanced", emojiUsage: "balanced" },
  mode: "test", isOpen: true, autoAccept: false, ...extra,
}) as never;

// PART E end-to-end — the confirmed finalize recap is skipped when the draft is inconsistent.
{
  const inconsistent: OrderDraft = { lines: [{ itemId: "pizza", name: "بيتزا مارجريتا", quantity: 2, unitPrice: 195, choices: [], modifiers: [], lineTotal: 390 }], fulfillment: "pickup", deliveryZone: null, address: null, deliveryFee: 0, subtotal: 390, tax: 0, taxRate: 0, total: undefined as unknown as number, currency: "ج.م", paymentMethod: null, finalized: false } as unknown as OrderDraft;
  const history: LlmMessage[] = [{ role: "assistant", content: "طلبك: ٢× بيتزا مارجريتا. تأكيد الطلب؟" }];
  const out = await respond({ brain: BRAIN({ finishLine: true }), history, userMessage: "أكد", initialDraft: inconsistent });
  ok("EE1: an inconsistent finalize never ships an empty/undefined «الإجمالي:»", !/الإجمالي\s*[:：]\s*(?:undefined|NaN|\s*$)/m.test(out.reply));
}

// PART D end-to-end — «شكراً» after completion (empty draft, nothing pending) gets NO handoff appendix.
{
  const history: LlmMessage[] = [{ role: "assistant", content: "تم تسجيل الطلب بانتظار تأكيد المطعم ✅" }];
  const out = await respond({ brain: BRAIN({ finishLine: true }), history, userMessage: "شكراً جزيلاً 🙏", initialDraft: null });
  ok("EE2: a social «شكراً» close carries NO handoff appendix", !out.reply.includes("خليني أوصلك بحد من الفريق"));
  ok("EE2b: … and no turn_contract next-step signal fired", !out.signals.some((s) => s.detail?.reason === "turn_contract_next_step"));
}

// PART A end-to-end — allergy_simple ON: the recap never carries the (possibly garbage) allergy line.
{
  const history: LlmMessage[] = [{ role: "assistant", content: "تمام" }];
  const out = await respond({ brain: BRAIN({ finishLine: true, allergySimple: true, sessionAllergyNote: "⚠️ حساسية: حساسه، حكه، قمح" }), history, userMessage: "زود بيتزا كمان", initialDraft: draftOf(2) });
  ok("EE3: allergy_simple ON — the recap never renders the (legacy garbage) allergy line", !out.reply.includes("حساسه") && !out.reply.includes("حكه"));
}

// ─────────────────── MULTI-TURN SCENARIO — replay today's Wesaya conversation shape ───────────
{
  // Turn: address-collection turn (pending zone question) — the reply is the QUESTION ONLY, no
  // recap glued on, no duplicated «قريب من إيه».
  const Q = "قريب من إيه — التعاون هرم ولا الطالبية هرم؟";
  const addressTurn = composeFinalReply({ core: "قولي عنوانك الكامل، قريب من إيه؟", draft: draftOf(2), dialect: "egyptian", canOrder: true, toolNames: ["set_delivery_address"], safetyEvent: false, flagOn: true, pendingQuestion: Q });
  ok("S1: address turn = ONE question, no recap, no duplicated «قريب من إيه»",
    !containsRenderedRecap(addressTurn.text) && (addressTurn.text.match(/قريب من إيه/g) ?? []).length === 1 && (addressTurn.text.match(/[؟?]/g) ?? []).length === 1);

  // Turn: allergy mention (flag ON) → deflection + menu + human offer; decision never holds/writes.
  const d = decideAllergySimple({ history: [], userMessage: "عندي حساسية من المكسرات" });
  ok("S2: allergy mention (flag ON) → deflection (menu + human offer), no hold/escalation",
    d.action === "deflect" && /المنيو/.test(allergySimpleDeflection("egyptian", d.variantIndex)) && /أحوّلك/.test(allergySimpleDeflection("egyptian", d.variantIndex)));

  // Turn: «شكراً» after completion → warm close, NO handoff appendix.
  const close = enforceTurnContract({ text: "العفو، في خدمتك دايماً 🙏", dialect: "egyptian", draft: draftOf(0, { lines: [] }) as OrderDraft, socialClosing: isSocialClosingTurn("شكراً") });
  ok("S3: «شكراً» after completion → warm close, NO handoff appendix", !close.appended);

  // Turn: a second order starts a CLEAN draft (reset intent archives the prior).
  ok("S4: an explicit «طلب جديد» archives the prior draft (fresh basket)", decideDraftLifecycle({ finalized: false, lineCount: 2, ageMs: 1000, resetIntent: isExplicitResetIntent("طلب جديد") }).action === "reset");

  // Turn: yesterday's stale draft is archived silently — no ghost question.
  ok("S5: yesterday's >12h draft is archived (no ghost resurfacing)", decideDraftLifecycle({ finalized: false, lineCount: 2, ageMs: DRAFT_ARCHIVE_MS + 3600_000, resetIntent: false }).resume === false);

  // Invariant across the pack: no assembled reply carries two questions or an empty الإجمالي.
  const replies = [addressTurn.text, allergySimpleDeflection("egyptian", 0), close.text, renderDraftRecap(draftOf(2), { dialect: "egyptian" })];
  ok("S6: no reply carries TWO questions", replies.every((r) => (r.match(/[؟?]/g) ?? []).length <= 1));
  ok("S7: no reply shows an empty «الإجمالي:»", replies.every((r) => !/الإجمالي\s*[:：]\s*(?:undefined|NaN|\s*$)/m.test(r)));
}

// ─────────────────── SOURCE WIRING — the parts sit where the WO placed them ──────────────────
const rs = readFileSync(resolve(process.cwd(), "lib/ai/respond.ts"), "utf8");
const ct = readFileSync(resolve(process.cwd(), "lib/ai/customer-turn.ts"), "utf8");
const fl = readFileSync(resolve(process.cwd(), "lib/tenant/tier.ts"), "utf8");
const pr = readFileSync(resolve(process.cwd(), "lib/ai/prompt.ts"), "utf8");
const ras = readFileSync(resolve(process.cwd(), "lib/messaging/respond-and-send.ts"), "utf8");
ok("W1: allergy_simple is registered in ProFeature", /"allergy_simple"/.test(fl));
ok("W2: BrainContext carries the optional allergySimple flag", /allergySimple\?: boolean;/.test(pr));
ok("W3: customer-turn derives the flag and sets brain.allergySimple", /allergySimpleOn = isFeatureExplicitlyEnabled\("allergy_simple", tenantFeatures\)/.test(ct) && /allergySimple: allergySimpleOn/.test(ct));
ok("W4 (PART A): the deflect branch precedes the calm-hold + legacy escalation branches", ct.indexOf("allergySimpleDeflect && allergySimpleDecision") > 0 && ct.indexOf("allergySimpleDeflect && allergySimpleDecision") < ct.indexOf("} else if (calmHoldCandidate)"));
ok("W5 (PART A): the calm-hold / companion / legacy escalation branches are bypassed under the flag", /calmHoldOn && !allergySimpleOn/.test(ct) && /companionOn && !allergySimpleOn/.test(ct) && /combinedAllergenHit\.fired && !companionOn && !allergySimpleOn/.test(ct));
// REPAIR (stale source-shape pin): the bypass was refactored from a single
// `memoryAllergyGateOn && !allergySimpleOn` conjunction into a nested `if`
// (customer-turn.ts: `if (memoryAllergyGateOn && ...) { if (!allergySimpleOn) {`).
// Behaviour is unchanged, so we pin the BEHAVIOUR structurally instead of the old
// literal: the customer_memory READ must be guarded by !allergySimpleOn. Removing
// that guard still fails this assertion.
const memReadIdx = ct.indexOf('.from("customer_memory")');
const memGateIdx = memReadIdx > 0 ? ct.lastIndexOf("memoryAllergyGateOn", memReadIdx) : -1;
ok("W6 (PART A): the customer-memory allergy READ is bypassed under the flag",
  memReadIdx > 0 && memGateIdx > 0 && /!allergySimpleOn/.test(ct.slice(memGateIdx, memReadIdx)));
ok("W7 (PART A): the safety-bridge injection is bypassed under the flag", /!isFeatureExplicitlyEnabled\("allergy_simple", features\)/.test(ras));
ok("W8 (PART A): the session-scoped canonical ticket note is written under the flag", /buildTicketAllergyNote\(/.test(ct) && /allergy_note: ticketNote/.test(ct));
ok("W9 (PART B): the loader uses the deterministic lifecycle decision", /decideDraftLifecycle\(\{/.test(ct) && /isExplicitResetIntent\(input\.userMessage\)/.test(ct));
ok("W10 (PART E): respond.ts calls the single final-compose pass under the flag", /if \(input\.brain\.finishLine\) \{/.test(rs) && /composeFinalReply\(\{/.test(rs));
ok("W11 (PART E): the confirmed finalize recap is consistency-guarded", /input\.brain\.finishLine && recapConsistent/.test(rs) && /isDraftPricedConsistent\(ctx\.draft\)/.test(rs));

console.log(`\n${fail === 0 ? "✅" : "❌"} proof-simplify: ${pass}/${pass + fail} passed`);
console.log("sample deflection:", allergySimpleDeflection("egyptian", 0));
console.log("sample ticket note:", buildTicketAllergyNote(["حساسه", "حكه", "قمح", "بيض"]));
if (fail > 0) process.exit(1);
