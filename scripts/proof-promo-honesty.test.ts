// ============================================================================
// Proof: the agent never promises money the system does not take off the bill.
//
// LIVE EVIDENCE (demo order #1004, production). Asked «في عروض عندكم؟», Khalid replied
// «عندنا عرض الافتتاح 🌟 — خصم 15% على كل الطلبات!» — and the order that closed a minute
// later read subtotal 55.00, discount_total 0.00, total 77.05. Full price. He promised a
// discount to a customer and the bill did not move.
//
// THREE separate defects produced that one sentence:
//   1. lib/order-pricing.ts contains NO discount arithmetic — the word does not appear.
//      `orders.discount_total` is written 0 on every row, while lib/render/receipt.ts
//      already renders a discount line for a field nothing ever fills.
//   2. Every promo in production is CODE-GATED («AHLAN15», «OPEN15»). A coded promo is
//      redeemed, not automatic — so the fix is NOT to auto-apply these, which would hand
//      discounts to people who never qualified. The fix is to stop claiming they apply.
//   3. The demo tenant's own promo record contradicted itself: caption «على أول طلب»,
//      scopeLabel «كل الطلبات». promoDescription() renders scopeLabel, so the agent
//      repeated the wrong half — «كل الطلبات» — as fact.
//
// Run: node --conditions=react-server --import ./scripts/webhook-route-loader.mjs --experimental-strip-types scripts/proof-promo-honesty.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { promoPromptLine, promoDescription } from "../lib/promo.ts";
import { buildCustomerAgentSystemPrompt } from "../lib/ai/prompt.ts";
import type { OperatorPromotion } from "../lib/types.ts";

let pass = 0, fail = 0;
const ok = (name: string, condition: boolean) => {
  if (condition) pass++;
  else { fail++; console.log("  FAIL", name); }
};
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const promo = {
  id: "p1", name: "عرض الافتتاح", type: "percent_off",
  config: { amount: 15, scopeType: "first_order", scopeLabel: "أول طلب", caption: "خصم ١٥٪ على أول طلب" },
  code: "AHLAN15", schedule: {}, state: "active", spent: 0, budgetCap: null,
  createdAt: "", updatedAt: "",
} as unknown as OperatorPromotion;

// ── 1. the line the AGENT reads carries the whole truth ──────────────────────
{
  const line = promoPromptLine(promo, "ر.س");
  ok("the headline discount is still stated", line.includes("خصم 15%"));
  ok("THE CODE is included — without it the customer cannot claim the offer", line.includes("AHLAN15"));
  ok("and it is marked as NOT applied automatically", line.includes("غير مطبَّق تلقائياً"));

  // A promo with no code must not invent one, but must still carry the applicability truth.
  const noCode = promoPromptLine({ ...promo, code: "" } as OperatorPromotion, "ر.س");
  ok("a code-less promo says no code", !noCode.includes("بكود"));
  ok("a code-less promo is STILL marked not-automatic", noCode.includes("غير مطبَّق تلقائياً"));

  // promoDescription stays the plain human phrase — the console renders it.
  ok("promoDescription itself is unchanged (plain phrase)", promoDescription(promo, "ر.س") === "خصم 15% على أول طلب");
}

// ── 2. the RULE forbids the sentence that caused #1004 ───────────────────────
{
  const prompt = read("lib/ai/prompt.ts");
  ok("the rule states the offer is NOT applied automatically", /THE OFFER IS NOT APPLIED AUTOMATICALLY/.test(prompt));
  ok("the rule requires handing over the code", /you MUST give the customer that code/.test(prompt));
  ok("the rule forbids implying a readback total is discounted",
    /NEVER say or imply that a total you read back already includes a discount/.test(prompt));
  ok("the rule bans the three phrasings that assert application",
    prompt.includes("طبّقته لك") && prompt.includes("الخصم مطبّق") && prompt.includes("بعد الخصم"));
  ok("the promo BLOCK header repeats it where the data is listed",
    /NOT applied to any total\./.test(prompt));
}

// ── 3. it actually reaches the built prompt, for a real tenant ───────────────
{
  const ctx = {
    profile: { name: "مطعم الديرة", currency: "ر.س", timezone: "Asia/Riyadh", businessType: "restaurant" },
    dialect: "saudi", menuItems: [], modifiers: [], branches: [], deliveryAreas: [],
    policies: { refund: "", cancellation: "", delivery: "", replacement: "", payment: "" },
    faqs: [], aiTone: { personality: "friendly", responseLength: "short", emojiUsage: "minimal", language: "ar", greeting: "" },
    mode: "live", isOpen: true, autoAccept: false, personaName: "خالد",
    activePromotions: [promo],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const built = buildCustomerAgentSystemPrompt(ctx as any);
  ok("the built prompt carries the code beside the offer", built.includes("AHLAN15"));
  ok("the built prompt marks the offer not-automatic", built.includes("غير مطبَّق تلقائياً"));
  ok("the built prompt does NOT claim «كل الطلبات» for a first-order promo", !built.includes("خصم 15% على كل الطلبات"));
}

// ── 4. THE STANDING TRUTH: nothing applies a discount, so nothing may claim one ──
// If someone later builds the redemption engine, THIS assertion is the one that should
// fail — and its failure is the signal to revisit every rule above, not to delete it.
{
  const pricing = read("lib/order-pricing.ts");
  ok("lib/order-pricing.ts still has no discount arithmetic (if this fails, the rules above need revisiting)",
    !/discount/i.test(pricing));
  const seed = read("scripts/seed-demo-ksa-tenant.mjs");
  ok("the demo promo record no longer contradicts its own caption",
    !/scopeLabel: "كل الطلبات"/.test(seed) && /scopeLabel: "أول طلب"/.test(seed));
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} promo-honesty: ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
