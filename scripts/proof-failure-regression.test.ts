// ============================================================================
// Week-1 orchestration roadmap — FAILURE-REGRESSION REPLAY HARNESS.
//
// Run before/after any Week 2+ orchestration change; all cases must stay green.
// These are real production failures A-D from the Week-1 cycle, kept together so
// the annotation pivot cannot silently reintroduce an old routing bug.
//
// Run:
//   node --conditions=react-server --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types scripts/proof-failure-regression.test.ts
// ============================================================================
import { classifyGoal } from "../lib/ai/goal-interpreter.ts";
import { isExplicitOrderConfirmation } from "../lib/ai/order-confirm.ts";
import { buildCustomerAgentSystemPrompt } from "../lib/ai/prompt.ts";
import { isMidItemClarifier } from "../lib/ai/respond.ts";
import { coalesceInbound, type CoalesceRow } from "../lib/messaging/inbound-coalescing.ts";

let pass = 0;
let fail = 0;
const ok = (name: string, condition: boolean) => {
  if (condition) pass++;
  else {
    fail++;
    console.log("  ❌", name);
  }
};

const READ_BAD = { intent: "unknown", confidence: "low" as const, understood: false };
const STATE = (overrides: Record<string, unknown> = {}) => ({
  itemNames: ["برجر", "مياه"],
  offerNames: [],
  atConfirmationPoint: false,
  hasOpenDraft: false,
  ...overrides,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function promptCtx(overrides: Record<string, unknown> = {}): any {
  return {
    profile: { name: "مطعم تجريبي", currency: "ج.م", timezone: "Africa/Cairo", businessType: "restaurant" },
    dialect: "egyptian",
    menuItems: [],
    modifiers: [],
    branches: [],
    deliveryAreas: [],
    policies: { refund: "", cancellation: "", delivery: "", replacement: "", payment: "" },
    faqs: [],
    aiTone: { personality: "friendly", responseLength: "short", emojiUsage: "minimal", language: "ar", greeting: "" },
    mode: "live",
    isOpen: true,
    autoAccept: false,
    personaName: "كريم",
    ...overrides,
  };
}

// FAILURE A — live perception over-deflection; fixed by #498/#500.
// Bad Haiku perception must not eat a legitimate mid-order utterance when order context exists.
{
  const decision = classifyGoal({
    userMessage: "خمسة حار وخمسة عادي",
    read: READ_BAD,
    state: STATE({ hasOpenDraft: true }),
  });
  ok("FAILURE A (#498/#500): open-draft + bad read defers to model, not ask",
    decision.action === "act" && decision.reason === "read_unsure_defer_to_model");
}
{
  const decision = classifyGoal({
    userMessage: "تأكيد الطلب",
    read: READ_BAD,
    state: STATE({ atConfirmationPoint: true }),
  });
  ok("FAILURE A (#498): confirmation-point + bad read defers to model, not unclear",
    decision.action === "act" && decision.reason === "read_unsure_defer_to_model");
}

// FAILURE B — live mid-item not-yet-committed shape; fixed by #500.
// Burger variant clarifier had no draft line yet, so the last assistant clarifier is the order-context signal.
{
  const history = [{ role: "assistant" as const, content: "تمام ٢ برجر، تحب الحجم عادي ولا دوبل؟" }];
  const initialDraft = null;
  const hasOrderContext = !!initialDraft?.lines?.length || isMidItemClarifier(history);
  const decision = classifyGoal({
    userMessage: "خلي الماء ٤",
    read: READ_BAD,
    state: STATE({ hasOpenDraft: hasOrderContext }),
  });
  ok("FAILURE B (#500): live clarifier «عادي ولا دوبل؟» is detected as mid-item context",
    isMidItemClarifier(history));
  ok("FAILURE B (#500): clarifier + empty draft + «خلي الماء ٤» reaches model, not goal_clarify",
    hasOrderContext && decision.action === "act" && decision.reason === "read_unsure_defer_to_model");
}
{
  const coldOpenDecision = classifyGoal({
    userMessage: "خلي الماء ٤",
    read: READ_BAD,
    state: STATE({ hasOpenDraft: false, atConfirmationPoint: false }),
  });
  ok("FAILURE B guard (#498/#500): cold-open bad read still deflects as unclear",
    coldOpenDecision.action === "ask" && coldOpenDecision.kind === "unclear" && coldOpenDecision.reason === "read_not_understood");
}

// FAILURE C — greeting bundled with substance; coalescing verified intact and prompt fixed by #502.
// The coalescer must MERGE a burst («هاي» + «أنا معايا ٥٠ جنيه»), not select only one message.
{
  const rows: CoalesceRow[] = [
    { sender: "customer", text: "هاي", created_at: "2026-07-16T10:00:00.000Z", meta: null },
    { sender: "customer", text: "أنا معايا ٥٠ جنيه", created_at: "2026-07-16T10:00:01.000Z", meta: null },
  ];
  const merged = coalesceInbound(rows, { enabled: true, watermarkMs: null });
  ok("FAILURE C (verified + #502): coalesceInbound merges a 2-message greeting+substance burst",
    merged?.count === 2 && merged.mergedText.includes("هاي") && merged.mergedText.includes("أنا معايا ٥٠ جنيه"));
  const karimPrompt = buildCustomerAgentSystemPrompt(promptCtx());
  const khalidPrompt = buildCustomerAgentSystemPrompt(promptCtx({
    dialect: "saudi",
    personaName: "خالد",
    khalidPersona: true,
    ksaRegion: "najd",
    profile: { name: "مطعم الديرة", currency: "ر.س", timezone: "Asia/Riyadh", businessType: "restaurant" },
  }));
  ok("FAILURE C (#502): prompt carries bundled greeting+substance instruction for Karim",
    karimPrompt.includes("BUNDLED GREETING + SUBSTANCE") &&
    karimPrompt.includes("does NOT override greet-once discipline"));
  ok("FAILURE C (#502): prompt carries bundled greeting+substance instruction for Khalid",
    khalidPrompt.includes("BUNDLED GREETING + SUBSTANCE") &&
    khalidPrompt.includes("same dialect/register (سعودي)"));
}

// FAILURE D — live #1018 confirmation false-match; fixed by #499.
// New-order/allergy-status text must not confirm a stale order, while genuine confirmations remain true.
ok("FAILURE D (#499 live #1018): new-order + allergy-status sentence is NOT an order confirmation",
  !isExplicitOrderConfirmation("عاوز طلب جديد بس قبل الطلب الجديد حاب ااكد انه ما عندي حساسية من البيض"));
for (const phrase of ["تأكيد الطلب", "أكد الطلب الجديد", "تمام", "أيوه", "confirm"]) {
  ok(`FAILURE D (#499): genuine confirmation stays TRUE for «${phrase}»`,
    isExplicitOrderConfirmation(phrase));
}

console.log(`\nFAILURE-REGRESSION: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
