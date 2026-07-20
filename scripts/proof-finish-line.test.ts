// WO-FINISH-LINE proof — the three tonight-proven finishers, gated on `finish_line`.
// (A) DETERMINISTIC RECAP: the order recap (items, modifiers, fees, total, allergy line,
//     «أجهّزلك الطلب؟») is RENDERED BY CODE from the priced draft — Arabic-Indic, complete
//     every time — killing the truncated model recaps («تحب "», «وكمان است») + the 6-call loop.
// (B) TURN CONTRACT: every reply must carry a question, a recap, or a handoff; else the
//     deterministic next-step is appended — killing the bare future-promise dead-end
//     («هختارلك أحسن تنوع!» → silence).
// (C) BULK THRESHOLD: a single request implying > 8 items short-circuits to a human handoff
//     instead of driving the tool loop into the 6-iteration cap (the 20-pizza party order).
// Flag OFF → none of it runs → byte-identical. Deterministic; the guard makes zero model calls.
// Run: node --conditions=react-server --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types scripts/proof-finish-line.test.ts
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  renderDraftRecap,
  containsRenderedRecap,
  recapDue,
  applyDeterministicRecap,
  shortLeadIn,
  recapConfirmAsk,
  recapConfirmedHeader,
} from "../lib/ai/recap-render.ts";
import {
  hasQuestion,
  hasHandoffLine,
  hasFuturePromise,
  honestHandoffLine,
  enforceTurnContract,
} from "../lib/ai/turn-contract.ts";
import {
  impliedItemCount,
  exceedsBulkThreshold,
  bulkHandoffReply,
  bulkHandoffReason,
  BULK_ITEM_THRESHOLD,
} from "../lib/ai/bulk-threshold.ts";
import { respond } from "../lib/ai/respond.ts";
import type { OrderDraft } from "../lib/ai/tools.ts";
import type { LlmMessage } from "../lib/ai/llm/types.ts";

process.env.AI_ADAPTER = "mock";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };
const eq = (n: string, a: unknown, b: unknown) => ok(`${n}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`, a === b);

// A draft with `qty` pizzas (+ options), priced; only fields the renderer reads matter.
const draftOf = (qty: number, over: Partial<OrderDraft> = {}): OrderDraft =>
  ({
    lines: [{
      itemId: "pizza", name: "بيتزا مارجريتا", quantity: qty, unitPrice: 195,
      variant: { name: "وسط", price: 195 },
      choices: [], modifiers: [{ name: "جبنة زيادة", priceImpact: 0 }], lineTotal: 195 * qty,
    }],
    fulfillment: "pickup", deliveryZone: null, address: null, deliveryFee: 0,
    subtotal: 195 * qty, tax: 0, taxRate: 0, total: 195 * qty, currency: "ج.م",
    paymentMethod: null, finalized: false, ...over,
  }) as unknown as OrderDraft;

// ─────────────────────────── PART A — DETERMINISTIC RECAP ────────────────────────────────────
{
  const r = renderDraftRecap(draftOf(2), { dialect: "egyptian" });
  ok("A1: recap lists the item line with quantity + name", r.includes("بيتزا مارجريتا"));
  ok("A2: recap renders the modifier/variant options", r.includes("وسط") && r.includes("جبنة زيادة"));
  ok("A3: recap carries the total line «الإجمالي:»", /الإجمالي\s*:/.test(r));
  ok("A4: recap ends with the readback confirm ask «أجهّزلك الطلب؟»", r.trim().endsWith("أجهّزلك الطلب؟"));
  ok("A5: figures are Arabic-Indic (٣٩٠), never Western (390)", r.includes("٣٩٠") && !r.includes("390"));
  ok("A5b: quantity is Arabic-Indic (٢×)", r.includes("٢×"));
}
{
  // Truncation reproduction: the model recap truncated mid-word («تحب "»); the code recap is COMPLETE.
  const truncated = 'طلبك: ٢× بيتزا... تحب "';
  const code = renderDraftRecap(draftOf(2), { dialect: "egyptian" });
  ok("A6: the model recap was truncated (unterminated)", truncated.trim().endsWith('"'));
  ok("A6b: the CODE recap is complete — carries the total AND the confirm ask", /الإجمالي\s*:/.test(code) && code.includes("أجهّزلك الطلب؟"));
  ok("A6c: the code recap never truncates a word — ends on the confirm ask", code.trim().endsWith("أجهّزلك الطلب؟"));
}
{
  const r = renderDraftRecap(draftOf(1), { dialect: "egyptian", allergyNote: "⚠️ حساسية: بيض" });
  ok("A7: a real «⚠️ حساسية …» note renders as the allergy line", r.includes("⚠️ حساسية: بيض"));
  const r2 = renderDraftRecap(draftOf(1), { dialect: "egyptian", allergyNote: "حكة" });
  ok("A7b: a non «⚠️ حساسية» note is NOT rendered (no garbage substance line)", !r2.includes("حكة"));
}
{
  const empty = draftOf(0, { lines: [], subtotal: 0, total: 0 }) as OrderDraft;
  eq("A8: an empty draft renders the honest «السلة فارغة.» (no fabricated total)", renderDraftRecap(empty, { dialect: "egyptian" }), "السلة فارغة.");
}
{
  const c = renderDraftRecap(draftOf(2), { dialect: "egyptian", phase: "confirmed" });
  ok("A9: confirmed phase heads with «تم تسجيل الطلب … ✅»", c.startsWith(recapConfirmedHeader()));
  ok("A9b: confirmed phase does NOT carry the readback ask", !c.includes("أجهّزلك الطلب؟"));
  ok("A9c: confirmed phase still carries the total", /الإجمالي\s*:/.test(c));
}
eq("A10: recapConfirmAsk is the DB-proven Egyptian «أجهّزلك الطلب؟»", recapConfirmAsk("egyptian"), "أجهّزلك الطلب؟");
ok("A11: containsRenderedRecap detects the total line", containsRenderedRecap("… الإجمالي: ٣٩٠ ج.م") && !containsRenderedRecap("أهلاً بيك 😊"));
// recapDue gating (pure).
ok("A12: recapDue TRUE when flag on + a mutation tool ran + draft has lines + no safety event",
  recapDue({ flagOn: true, canOrder: true, draft: draftOf(2), toolNames: ["add_to_order"], safetyEvent: false }));
ok("A12b: recapDue FALSE when the flag is off (byte-identical)",
  !recapDue({ flagOn: false, canOrder: true, draft: draftOf(2), toolNames: ["add_to_order"], safetyEvent: false }));
ok("A12c: recapDue FALSE on a safety-event turn (never overwrite a safety line)",
  !recapDue({ flagOn: true, canOrder: true, draft: draftOf(2), toolNames: ["add_to_order"], safetyEvent: true }));
ok("A12d: recapDue FALSE when no recap-trigger tool ran",
  !recapDue({ flagOn: true, canOrder: true, draft: draftOf(2), toolNames: ["present_menu"], safetyEvent: false }));
ok("A12e: recapDue FALSE for an empty draft",
  !recapDue({ flagOn: true, canOrder: true, draft: draftOf(0, { lines: [] }) as OrderDraft, toolNames: ["add_to_order"], safetyEvent: false }));
{
  const lead = applyDeterministicRecap("تمام يا فندم 😊", draftOf(2), { dialect: "egyptian" });
  ok("A13: applyDeterministicRecap keeps a SHORT model lead-in above the code block", lead.startsWith("تمام يا فندم 😊\n"));
  ok("A13b: … and appends the complete code recap under it", containsRenderedRecap(lead) && lead.includes("أجهّزلك الطلب؟"));
  eq("A13c: shortLeadIn drops a recap-like lead-in (carries a ×)", shortLeadIn("٢× بيتزا الإجمالي"), "");
}

// ─────────────────────────── PART B — TURN CONTRACT ──────────────────────────────────────────
ok("B1: hasQuestion detects «؟»", hasQuestion("تحب إيه؟") && !hasQuestion("تمام كده"));
ok("B2: hasHandoffLine detects a transfer/team line", hasHandoffLine("هحوّلك دلوقتي") && hasHandoffLine("نبّهت الفريق") && !hasHandoffLine("تمام يا فندم"));
ok("B3: hasFuturePromise detects «هختارلك» (fused) + «هجهّزلك» (diacritics)", hasFuturePromise("هختارلك أحسن تنوع!") && hasFuturePromise("هجهّزلك الطلب") && !hasFuturePromise("اخترت لك بيتزا خلصت"));
{
  const r = enforceTurnContract({ text: "تمام، تحب تضيف مشروب؟", dialect: "egyptian", draft: draftOf(0, { lines: [] }) as OrderDraft });
  ok("B4: a reply WITH a question satisfies the contract — not appended", !r.appended);
}
{
  const r = enforceTurnContract({ text: "الإجمالي: ٣٩٠ ج.م", dialect: "egyptian", draft: draftOf(0, { lines: [] }) as OrderDraft });
  ok("B5: a reply carrying a rendered recap satisfies the contract — not appended", !r.appended);
}
{
  const r = enforceTurnContract({ text: "هحوّلك لفريق المطعم 🙏", dialect: "egyptian", draft: draftOf(0, { lines: [] }) as OrderDraft });
  ok("B6: a reply carrying a handoff line satisfies the contract — not appended", !r.appended);
}
{
  // THE tonight bug: a bare future-promise, no question/recap/handoff, empty draft → handoff appended.
  const r = enforceTurnContract({ text: "هختارلك أحسن تنوع!", dialect: "egyptian", draft: draftOf(0, { lines: [] }) as OrderDraft });
  ok("B7: «هختارلك أحسن تنوع!» (none of a/b/c) → next-step APPENDED", r.appended);
  ok("B7b: … the future-promise is flagged", r.futurePromise);
  eq("B7c: … with an empty draft the next-step is the honest handoff", r.kind, "handoff");
  ok("B7d: … the delivered text now carries the handoff line", r.text.includes(honestHandoffLine("egyptian")));
}
{
  // Same dead-end but a draft exists → the next-step is a rendered draft recap + «أكمّل؟».
  const r = enforceTurnContract({ text: "هجهّزلك حاجة حلوة", dialect: "egyptian", draft: draftOf(2) });
  eq("B8: none-of-three + an open draft → the next-step is a draft recap", r.kind, "draft_recap");
  ok("B8b: … the appended recap is complete (total present)", containsRenderedRecap(r.text) && r.text.includes("أكمّل؟"));
}
{
  // No double-append (integrates with ask-back): a pending question already relayed → satisfied.
  const q = "قريب من إيه — التعاون هرم ولا الطالبية هرم؟";
  const r = enforceTurnContract({ text: `تمام، ${q}`, dialect: "egyptian", draft: draftOf(0, { lines: [] }) as OrderDraft, pendingQuestion: q });
  ok("B9: a reply already relaying the pending question is NOT appended again (no double-ask)", !r.appended);
}
{
  // An escalation set this turn satisfies (c) even with no handoff word in the text.
  const r = enforceTurnContract({ text: "تمام", dialect: "egyptian", draft: draftOf(0, { lines: [] }) as OrderDraft, escalated: true });
  ok("B10: an escalation set this turn satisfies the contract", !r.appended);
}

// ─────────────────────────── PART C — BULK THRESHOLD ─────────────────────────────────────────
eq("C1: impliedItemCount reads «٢٠ بيتزا» as 20", impliedItemCount("عايز ٢٠ بيتزا مارجريتا"), 20);
eq("C2: a price «٣٢٠ ج.م» is NOT counted as items", impliedItemCount("الإجمالي ٣٢٠ ج.م"), 0);
eq("C3: a normal build «٣ بيتزا» reads as 3 (below threshold)", impliedItemCount("عايز ٣ بيتزا"), 3);
eq("C4: a clock time «الساعة ٩» is NOT counted", impliedItemCount("تعالى الساعة ٩"), 0);
eq("C5: a phone/id (4+ digits) is NOT counted", impliedItemCount("رقمي ٠١٢٣٤٥"), 0);
ok("C6: > 8 exceeds the threshold; ≤ 8 does not (boundary)", exceedsBulkThreshold("٢٠ بيتزا حفله") && !exceedsBulkThreshold("عايز ٨ بيتزا") && exceedsBulkThreshold("عايز ٩ بيتزا"));
eq("C7: BULK_ITEM_THRESHOLD is 8", BULK_ITEM_THRESHOLD, 8);
ok("C8: bulkHandoffReply (egyptian) is the DB-proven copy + «هحوّلك دلوقتي»", bulkHandoffReply("egyptian").includes("هحوّلك دلوقتي") && bulkHandoffReply("egyptian").includes("أحسن سعر وتشكيلة"));
ok("C9: the handoff reply itself satisfies the turn contract (carries a handoff line)", hasHandoffLine(bulkHandoffReply("egyptian")));
ok("C10: bulkHandoffReason names the implied count", bulkHandoffReason(20).includes("20"));

// ─────────────────────────── END-TO-END through respond() (mock adapter) ─────────────────────
const BRAIN = (extra: Record<string, unknown>) => ({
  profile: { name: "Wesaya", currency: "ج.م", timezone: "Africa/Cairo", businessType: "restaurant" },
  dialect: "egyptian",
  menuItems: [{ id: "pizza", name: "بيتزا مارجريتا", category: "بيتزا", price: 195, available: true, description: "", imageUrl: "", modifierIds: [], ingredients: [], allergens: [], variants: [], choiceGroups: [] }],
  modifiers: [], branches: [], deliveryAreas: [], policies: {}, faqs: [],
  aiTone: { responseLength: "balanced", emojiUsage: "balanced" },
  mode: "test", isOpen: true, autoAccept: false, ...extra,
}) as never;

// PART A end-to-end — the deterministic fast-path finalize renders the CODE recap (confirmed).
const readbackHistory: LlmMessage[] = [{ role: "assistant", content: "طلبك: ٢× بيتزا مارجريتا، الإجمالي ٣٩٠ ج.م. تأكيد الطلب؟" }];
// A PLAIN line (no variant/modifier) so the finalize re-price matches the flat menu item.
const finalizeDraft = (): OrderDraft => ({
  lines: [{ itemId: "pizza", name: "بيتزا مارجريتا", quantity: 2, unitPrice: 195, choices: [], modifiers: [], lineTotal: 390 }],
  fulfillment: "pickup", deliveryZone: null, address: null, deliveryFee: 0,
  subtotal: 390, tax: 0, taxRate: 0, total: 390, currency: "ج.م", paymentMethod: null, finalized: false,
}) as unknown as OrderDraft;
{
  const out = await respond({ brain: BRAIN({ finishLine: true }), history: readbackHistory, userMessage: "أكد", initialDraft: finalizeDraft() });
  ok("EA1: flag ON — the finalize reply is the CODE recap (confirmed header)", out.reply.startsWith(recapConfirmedHeader()));
  ok("EA1b: flag ON — the recap is complete + Arabic-Indic (٣٩٠, no 390)", containsRenderedRecap(out.reply) && out.reply.includes("٣٩٠") && !out.reply.includes("390"));
  ok("EA1c: flag ON — zero model calls (deterministic fast-path)", out.calls_used === 0);
}
{
  const out = await respond({ brain: BRAIN({}), history: readbackHistory, userMessage: "أكد", initialDraft: finalizeDraft() });
  ok("EA2: flag OFF — the finalize reply is the legacy tool summary (no confirmed header)", !out.reply.startsWith(recapConfirmedHeader()));
  ok("EA2b: flag OFF — legacy summary uses Western digits (390)", out.reply.includes("390"));
}

// PART B end-to-end — a bare future-promise reply gets the deterministic next-step appended.
{
  const out = await respond({ brain: BRAIN({ finishLine: true }), history: [], userMessage: "هختارلك أحسن تنوع", initialDraft: null });
  ok("EB1: flag ON — the mock's future-promise echo gets a next-step appended", out.reply.includes(honestHandoffLine("egyptian")));
  ok("EB1b: flag ON — a turn_contract_next_step signal is recorded", out.signals.some((s) => s.type === "missing_data" && s.detail.reason === "turn_contract_next_step"));
}
{
  const out = await respond({ brain: BRAIN({}), history: [], userMessage: "هختارلك أحسن تنوع", initialDraft: null });
  ok("EB2: flag OFF — the reply is NOT modified by the contract (byte-identical path)", !out.reply.includes(honestHandoffLine("egyptian")));
  ok("EB2b: flag OFF — no turn_contract signal", !out.signals.some((s) => s.detail?.reason === "turn_contract_next_step"));
}

// PART C end-to-end — a > 8-item request short-circuits to a handoff, NO tool-building.
{
  const out = await respond({ brain: BRAIN({ finishLine: true }), history: [], userMessage: "عايزين ٢٠ بيتزا مارجريتا لحفلة", initialDraft: null });
  eq("EC1: flag ON — bulk request short-circuits (stopReason)", out.stopReason, "bulk_handoff");
  ok("EC1b: flag ON — the honest handoff line is delivered", out.reply === bulkHandoffReply("egyptian"));
  ok("EC1c: flag ON — the conversation escalates (handoff) + a bulk_threshold signal", out.escalate === true && out.signals.some((s) => s.type === "escalation" && s.detail.source === "bulk_threshold"));
  ok("EC1d: flag ON — NO tool-building attempted (zero model calls)", out.calls_used === 0);
}
{
  const out = await respond({ brain: BRAIN({}), history: [], userMessage: "عايزين ٢٠ بيتزا مارجريتا لحفلة", initialDraft: null });
  ok("EC2: flag OFF — no bulk short-circuit (byte-identical path)", out.stopReason !== "bulk_handoff" && out.calls_used === 1);
}

// ─────────────────── MULTI-TURN SCENARIO — reproduce tonight (no promise-and-silence) ────────
{
  // Turn 1: build an order (normal turn). The contract guarantees turn 1 is not a dead end.
  const t1 = await respond({ brain: BRAIN({ finishLine: true }), history: [], userMessage: "عايز بيتزا", initialDraft: null });
  ok("S1: turn 1 (build) does NOT dead-end — carries a question OR a handoff next-step",
    hasQuestion(t1.reply) || hasHandoffLine(t1.reply) || containsRenderedRecap(t1.reply));
  // Turn 2: «٢٠ بيتزا … حفله» — tonight's party order. Deterministic handoff, never a bare promise.
  const history2: LlmMessage[] = [{ role: "user", content: "عايز بيتزا" }, { role: "assistant", content: t1.reply }];
  const t2 = await respond({ brain: BRAIN({ finishLine: true }), history: history2, userMessage: "عايزين ٢٠ بيتزا مارجريتا حفله", initialDraft: null });
  eq("S2: turn 2 (٢٠ بيتزا…حفله) → deterministic bulk handoff", t2.stopReason, "bulk_handoff");
  ok("S2b: turn 2 is NOT a promise-and-silence — it hands off + escalates", hasHandoffLine(t2.reply) && t2.escalate === true);
  ok("S2c: turn 2 satisfies the turn contract on its own (handoff line present)", hasHandoffLine(t2.reply));
  ok("S2d: turn 2 spent zero model calls (never entered the 6-iteration tool loop)", t2.calls_used === 0);
}

// ─────────────────── SOURCE WIRING — the three parts sit where the WO placed them ────────────
const rs = readFileSync(resolve(process.cwd(), "lib/ai/respond.ts"), "utf8");
const ct = readFileSync(resolve(process.cwd(), "lib/ai/customer-turn.ts"), "utf8");
const fl = readFileSync(resolve(process.cwd(), "lib/tenant/tier.ts"), "utf8");
const pr = readFileSync(resolve(process.cwd(), "lib/ai/prompt.ts"), "utf8");
ok("W1: the finish_line flag is registered in ProFeature", /"finish_line"/.test(fl));
ok("W2: customer-turn derives the flag and sets brain.finishLine", /finishLineOn = isFeatureExplicitlyEnabled\("finish_line", tenantFeatures\)/.test(ct) && /finishLine: finishLineOn/.test(ct));
ok("W3: BrainContext carries the optional finishLine flag", /finishLine\?: boolean;/.test(pr));
ok("W4: respond.ts imports the three finish-line modules", /from "\.\/recap-render"/.test(rs) && /from "\.\/turn-contract"/.test(rs) && /from "\.\/bulk-threshold"/.test(rs));
ok("W5 (PART C): the bulk short-circuit runs BEFORE the model loop, gated on the flag", /input\.brain\.finishLine && canOrder && exceedsBulkThreshold\(input\.userMessage\)/.test(rs));
{
  const bulkIdx = rs.indexOf("exceedsBulkThreshold(input.userMessage)");
  const loopIdx = rs.indexOf("for (let i = 0; i < MAX_ITERATIONS; i++)");
  ok("W5b (PART C): … the short-circuit is above the tool loop", bulkIdx > 0 && bulkIdx < loopIdx);
}
// WO-SIMPLIFY (PART E) — the recap render + ask-back settle + turn contract were unified into ONE
// deterministic final-compose pass (lib/ai/reply-compose.ts), called once from respond.ts under
// the flag. These wiring expectations were updated to match that single-assembler structure.
const rc = readFileSync(resolve(process.cwd(), "lib/ai/reply-compose.ts"), "utf8");
ok("W6 (PART A/E): the single assembler gates the recap render on recapDue + applyDeterministicRecap", /recapDue\(\{/.test(rc) && /applyDeterministicRecap\(text, input\.draft/.test(rc));
ok("W6b (PART E): respond.ts calls the single final-compose pass under the flag", /if \(input\.brain\.finishLine\) \{/.test(rs) && /composeFinalReply\(\{/.test(rs));
ok("W7 (PART A): the fast-path finalize renders the confirmed recap under the flag (consistency-guarded)", /input\.brain\.finishLine && recapConsistent\s*\n?\s*\?\s*renderDraftRecap\(ctx\.draft, \{ dialect: input\.brain\.dialect, allergyNote: input\.brain\.allergySimple \? null : ctx\.sessionAllergyNote, phase: "confirmed" \}\)/.test(rs));
{
  // In the single assembler the order is recap → ask-back → turn contract (no double-append).
  const recapIdx = rc.indexOf("applyDeterministicRecap(text, input.draft");
  const askbackIdx = rc.indexOf("injectPendingQuestion(text, pending)");
  const contractIdx = rc.indexOf("enforceTurnContract({");
  ok("W8 (PART B/E): the turn contract runs AFTER the ask-back settle (no double-append)", contractIdx > askbackIdx && askbackIdx > recapIdx && recapIdx > 0);
  const composeIdx = rs.indexOf("composeFinalReply({");
  const returnIdx = rs.indexOf("return {\n    reply: text,");
  ok("W8b (PART B/E): … and the compose pass runs BEFORE the reply is returned", composeIdx > 0 && composeIdx < returnIdx);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} proof-finish-line: ${pass}/${pass + fail} passed`);
console.log("sample recap:", renderDraftRecap(draftOf(2), { dialect: "egyptian", allergyNote: "⚠️ حساسية: بيض" }).replace(/\n/g, " ⏎ "));
console.log("sample bulk handoff:", bulkHandoffReply("egyptian"));
if (fail > 0) process.exit(1);
