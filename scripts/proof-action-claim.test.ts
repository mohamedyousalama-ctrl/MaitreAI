// WO-ACTION-CLAIM-GUARD — prove the fabricated-action guard: a reply that CLAIMS a draft
// modification when NO draft mutation actually happened («هخلي البيتزا... واحدة بس ✅» with zero
// tool calls) is caught, re-run ONCE with a strict use-the-tools directive, and — if the retry
// still fabricates — replaced with a fixed honest clarify + a guard signal row. Flag OFF is
// byte-identical (the guard never runs). Deterministic detectors, no model calls in the guard.
// Run: node --conditions=react-server --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types scripts/proof-action-claim.test.ts
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  detectModificationClaim,
  draftFingerprint,
  claimNeedsMutationRetry,
  retrySucceeded,
  actionClaimClarify,
  ACTION_CLAIM_RETRY_DIRECTIVE,
  DRAFT_MUTATION_TOOLS,
} from "../lib/ai/action-claim-guard.ts";
import { respond } from "../lib/ai/respond.ts";

process.env.AI_ADAPTER = "mock";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// A draft with one pizza line at the given quantity (only the fingerprint-relevant fields matter).
const draftWith = (quantity: number, total = quantity * 195) =>
  ({
    lines: [{ itemId: "pizza", name: "بيتزا مارجريتا", quantity, unitPrice: 195, choices: [], modifiers: [], lineTotal: total }],
    fulfillment: null, deliveryZone: null, address: null, deliveryFee: 0,
    subtotal: total, tax: 0, taxRate: 0, total, currency: "ج.م", paymentMethod: null, finalized: false,
  }) as unknown as import("../lib/ai/tools.ts").OrderDraft;

const ITEM_NAMES = ["بيتزا مارجريتا", "كولا"];

// ── A — detectModificationClaim: Arabic variants DETECTED, greetings/questions NOT ───────────
ok("A1: the live bug «هخلي البيتزا... واحدة بس ✅» IS detected", detectModificationClaim("هخلي البيتزا... واحدة بس ✅", ITEM_NAMES));
ok("A2: «عدّلت الكمية للطلب» (past verb + order word) IS detected", detectModificationClaim("عدّلت الكمية للطلب"));
ok("A3: «تم التعديل ✅ خليتها واحدة» IS detected", detectModificationClaim("تم التعديل ✅ خليتها واحدة"));
ok("A4: «أضفت لك على الطلب» (hamza-form verb) IS detected", detectModificationClaim("أضفت لك على الطلب"));
ok("A5: «شيلت البيتزا من الأوردر» IS detected", detectModificationClaim("شيلت البيتزا من الأوردر", ITEM_NAMES));
ok("A6: bare «٢× ✅» quantity-multiplier stamp IS detected", detectModificationClaim("خلاص كده ٢× ✅"));
ok("A7: greeting «أهلاً وسهلاً بيك في مطعمنا 😊» is NOT detected", !detectModificationClaim("أهلاً وسهلاً بيك في مطعمنا 😊"));
ok("A8: question «تحب أعدّل الكمية؟» is NOT detected (offer, not a claim)", !detectModificationClaim("تحب أعدّل الكمية؟"));
ok("A9: question «عايز تطلب إيه؟» is NOT detected", !detectModificationClaim("عايز تطلب إيه؟"));
ok("A10: the guard's own clarify line is NOT self-detected", !detectModificationClaim(actionClaimClarify("egyptian"), ITEM_NAMES));
ok("A11: empty text is NOT detected", !detectModificationClaim(""));
ok("A12: a bare price recap «الإجمالي ٣٩٠ ج.م ✅» (no quantity word) is NOT detected", !detectModificationClaim("الإجمالي ٣٩٠ ج.م ✅"));

// ── B — draftFingerprint: stable, and changes exactly when the quantity/total changes ────────
ok("B1: fingerprint is stable for the same draft", draftFingerprint(draftWith(2)) === draftFingerprint(draftWith(2)));
ok("B2: fingerprint CHANGES when the quantity changes 2 → 1 (the live bug's real signal)", draftFingerprint(draftWith(2)) !== draftFingerprint(draftWith(1)));
ok("B3: fingerprint of an empty/null draft is stable", draftFingerprint(null) === draftFingerprint(undefined));

// ── C — the decision logic (the 6 core cases, deterministic, no adapter) ─────────────────────
const FP2 = draftFingerprint(draftWith(2));
ok("C1: claim + NO tool + unchanged draft → needs retry (BLOCK)", claimNeedsMutationRetry({
  replyText: "هخلي البيتزا واحدة ✅", itemNames: ITEM_NAMES, executedTools: [], beforeFingerprint: FP2, afterFingerprint: FP2,
}) === true);
ok("C2: claim + a mutation tool executed → passes untouched (no retry)", claimNeedsMutationRetry({
  replyText: "هخلي البيتزا واحدة ✅", itemNames: ITEM_NAMES, executedTools: ["add_to_order"], beforeFingerprint: FP2, afterFingerprint: FP2,
}) === false);
ok("C3: claim + fingerprint CHANGED → passes (a real mutation happened)", claimNeedsMutationRetry({
  replyText: "هخلي البيتزا واحدة ✅", itemNames: ITEM_NAMES, executedTools: [], beforeFingerprint: FP2, afterFingerprint: draftFingerprint(draftWith(1)),
}) === false);
ok("C4: NO claim → passes (guard never fires)", claimNeedsMutationRetry({
  replyText: "أهلاً بيك، تحب تطلب إيه؟", itemNames: ITEM_NAMES, executedTools: [], beforeFingerprint: FP2, afterFingerprint: FP2,
}) === false);
ok("C5: retry MUTATES (mutation tool ran) → send the retry reply", retrySucceeded({
  executedToolsSinceRetry: ["remove_from_order"], fingerprintBeforeRetry: FP2, fingerprintAfterRetry: FP2,
}) === true);
ok("C5b: retry MUTATES (fingerprint changed) → send the retry reply", retrySucceeded({
  executedToolsSinceRetry: [], fingerprintBeforeRetry: FP2, fingerprintAfterRetry: draftFingerprint(draftWith(1)),
}) === true);
ok("C6: retry STILL fabricates (no tool, unchanged fp) → clarify (NOT a send)", retrySucceeded({
  executedToolsSinceRetry: ["get_order_summary"], fingerprintBeforeRetry: FP2, fingerprintAfterRetry: FP2,
}) === false);
ok("C7: get_order_summary / present_* are NOT draft-mutation tools; add_to_order IS",
  !DRAFT_MUTATION_TOOLS.has("get_order_summary") && !DRAFT_MUTATION_TOOLS.has("present_menu") && DRAFT_MUTATION_TOOLS.has("add_to_order"));

// ── D — END-TO-END through respond() + the mock adapter (which echoes the user text) ─────────
const BRAIN = (extra: Record<string, unknown>) => ({
  profile: { name: "Wesaya", currency: "ج.م", timezone: "Africa/Cairo", businessType: "restaurant" },
  dialect: "egyptian",
  menuItems: [{ id: "pizza", name: "بيتزا مارجريتا", category: "بيتزا", price: 195, available: true, description: "", imageUrl: "", modifierIds: [], ingredients: [], allergens: [] }],
  modifiers: [], branches: [], deliveryAreas: [], policies: {}, faqs: [],
  aiTone: { responseLength: "balanced", emojiUsage: "balanced" },
  mode: "test", isOpen: true, autoAccept: false, ...extra,
}) as never;

// The mock echoes the user text into the reply, so a claim in the user message becomes a
// claim in the model reply — with ZERO tool calls and an unchanged (empty) draft.
const CLAIM_MSG = "هخلي الطلب واحدة ✅";

{
  // Flag ON: mock re-fabricates on retry too → discard → fixed honest clarify + a guard signal.
  const out = await respond({ brain: BRAIN({ actionClaimGuard: true }), history: [], userMessage: CLAIM_MSG, initialDraft: null });
  ok("D1: flag ON — a fabricated action claim is BLOCKED and replaced with the clarify", out.reply === actionClaimClarify("egyptian"));
  ok("D2: flag ON — a guard signal row (type='guard', reason='action_claim_without_mutation') is written",
    out.signals.some((s) => s.type === "guard" && s.detail.reason === "action_claim_without_mutation"));
  ok("D3: flag ON — the retry consumed a second model call (block → retry issued)", out.calls_used >= 2);
}
{
  // Flag OFF: byte-identical — the model echo passes through untouched, no guard signal.
  const out = await respond({ brain: BRAIN({}), history: [], userMessage: CLAIM_MSG, initialDraft: null });
  ok("D4: flag OFF — identical path: the reply is NOT the clarify", out.reply !== actionClaimClarify("egyptian"));
  ok("D5: flag OFF — the model echo (still carrying «هخلي») passes through", out.reply.includes("هخلي"));
  ok("D6: flag OFF — no guard signal is written", !out.signals.some((s) => s.type === "guard"));
  ok("D7: flag OFF — no retry: exactly one model call", out.calls_used === 1);
}
{
  // Flag ON + NO claim: the guard does not fire → identical to flag OFF, no signal, one call.
  const out = await respond({ brain: BRAIN({ actionClaimGuard: true }), history: [], userMessage: "السلام عليكم", initialDraft: null });
  ok("D8: flag ON + no claim — reply is NOT the clarify (guard inert)", out.reply !== actionClaimClarify("egyptian"));
  ok("D9: flag ON + no claim — no guard signal, single model call", !out.signals.some((s) => s.type === "guard") && out.calls_used === 1);
}

// ── E — source wiring: the flag is registered + read, and the guard sits at the validation stage
const rs = readFileSync(resolve(process.cwd(), "lib/ai/respond.ts"), "utf8");
const ct = readFileSync(resolve(process.cwd(), "lib/ai/customer-turn.ts"), "utf8");
const fl = readFileSync(resolve(process.cwd(), "lib/tenant/tier.ts"), "utf8");
const pr = readFileSync(resolve(process.cwd(), "lib/ai/prompt.ts"), "utf8");
ok("E1: the flag is registered in the ProFeature union", /"action_claim_guard"/.test(fl));
ok("E2: customer-turn derives the flag and sets brain.actionClaimGuard", /const actionClaimGuardOn = isFeatureExplicitlyEnabled\("action_claim_guard", tenantFeatures\);/.test(ct) && /actionClaimGuard: actionClaimGuardOn/.test(ct));
ok("E3: BrainContext carries the optional actionClaimGuard flag", /actionClaimGuard\?: boolean;/.test(pr));
ok("E4: respond.ts gates the guard on the flag AND canOrder", /const actionGuardOn = input\.brain\.actionClaimGuard === true && canOrder;/.test(rs));
ok("E5: respond.ts snapshots the draft fingerprint BEFORE the model loop", /draftFpBefore = actionGuardOn \? draftFingerprint\(ctx\.draft\)/.test(rs));
ok("E6: respond.ts blocks via claimNeedsMutationRetry then re-runs with the retry directive", /claimNeedsMutationRetry\(/.test(rs) && /ACTION_CLAIM_RETRY_DIRECTIVE/.test(rs));
ok("E7: respond.ts sends the clarify + a type='guard' signal when the retry still fabricates",
  /type: "guard", detail: \{ reason: "action_claim_without_mutation"/.test(rs) && /text = actionClaimClarify\(input\.brain\.dialect\)/.test(rs));
ok("E8: the retry directive is the strict use-the-tools line", /نفّذ التعديل فعليًا عبر الأدوات قبل الرد/.test(ACTION_CLAIM_RETRY_DIRECTIVE));

console.log(`\n${fail === 0 ? "✅" : "❌"} action-claim-guard: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
