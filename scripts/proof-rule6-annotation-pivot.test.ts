// ============================================================================
// Week-2 orchestration annotation pivot proof.
//
// Run:
//   node --conditions=react-server --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types scripts/proof-rule6-annotation-pivot.test.ts
// ============================================================================
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  respond,
  RULE6_ANNOTATION_PIVOT_DIRECTIVE,
  RULE6_ANNOTATION_PIVOT_LIVE_REASON,
  RULE6_ANNOTATION_PIVOT_SHADOW_REASON,
} from "../lib/ai/respond.ts";
import { buildClarifyingQuestion } from "../lib/ai/clarification.ts";
import { scrubBannedWords } from "../lib/ai/banned-words.ts";

let pass = 0;
let fail = 0;
const ok = (name: string, condition: boolean) => {
  if (condition) pass++;
  else {
    fail++;
    console.log("  ❌", name);
  }
};

process.env.AI_ADAPTER = "mock";

const READ_BAD = { intent: "unknown", confidence: "medium" as const, understood: false };

function brain(pivot: boolean) {
  return {
    profile: { name: "Wesaya", currency: "ج.م", timezone: "Africa/Cairo", businessType: "restaurant" },
    dialect: "egyptian",
    menuItems: [
      {
        id: "fillet-super-hot",
        name: "فيليه سوبر حار",
        category: "ساندوتشات",
        price: 120,
        available: true,
        description: "",
        imageUrl: "",
        modifierIds: [],
        ingredients: [],
        allergens: [],
      },
      {
        id: "pizza",
        name: "بيتزا",
        category: "بيتزا",
        price: 180,
        available: true,
        description: "",
        imageUrl: "",
        modifierIds: [],
        ingredients: [],
        allergens: [],
      },
    ],
    modifiers: [],
    branches: [],
    deliveryAreas: [],
    policies: {},
    faqs: [],
    aiTone: { responseLength: "balanced", emojiUsage: "balanced" },
    mode: "test",
    isOpen: true,
    autoAccept: false,
    goalLogic: true,
    goalLogicRule6AnnotationPivot: pivot,
  } as never;
}

const expectedClarify = scrubBannedWords(
  buildClarifyingQuestion({ kind: "unclear", candidates: [], dialect: "egyptian" })
).text;

// Flag OFF — byte-identical deterministic read_not_understood behavior.
{
  const out = await respond({
    brain: brain(false),
    history: [],
    userMessage: "حاجة مبهمة",
    initialDraft: null,
    perceptionRead: READ_BAD,
  });
  ok("flag OFF: deterministic goal interpreter still handles rule-6 read_not_understood",
    out.model === "deterministic_goal_interpreter" && out.stopReason === "goal_clarify");
  ok("flag OFF: reply remains the exact grounded unclear clarification",
    out.reply === expectedClarify);
  ok("flag OFF: usage/tool/draft shape remains deterministic",
    out.usage.inputTokens === 0 &&
    out.usage.outputTokens === 0 &&
    out.usage.cacheReadTokens === 0 &&
    out.toolNames.length === 0 &&
    out.draft.lines.length === 0);
  ok("flag OFF: returned signals are unchanged and contain no annotation-pivot live/shadow signal",
    out.signals.length === 1 &&
    out.signals[0].detail.reason === "goal_clarify" &&
    out.signals[0].detail.kind === "unclear" &&
    !out.signals.some((s) => [RULE6_ANNOTATION_PIVOT_LIVE_REASON, RULE6_ANNOTATION_PIVOT_SHADOW_REASON].includes(String(s.detail.reason))));
}

// Flag ON — only the residual rule-6 ask path pivots to the normal model loop.
{
  const out = await respond({
    brain: brain(true),
    history: [],
    userMessage: "حاجة مبهمة",
    initialDraft: null,
    perceptionRead: READ_BAD,
  });
  ok("flag ON: read_not_understood pivots to model loop instead of deterministic goal_clarify",
    out.model === "mock" && out.stopReason !== "goal_clarify");
  ok("flag ON: live signal is attached to the normal RespondResult",
    out.signals.some((s) =>
      s.type === "missing_data" &&
      s.detail.reason === RULE6_ANNOTATION_PIVOT_LIVE_REASON &&
      s.detail.previousReason === "read_not_understood" &&
      s.detail.source === "goal_logic_rule6"
    ));
}

// Flag ON inherits the same final scrubber as every other model turn.
{
  const out = await respond({
    brain: brain(true),
    history: [],
    userMessage: "نبني الطلب من السيستم",
    initialDraft: null,
    perceptionRead: READ_BAD,
  });
  ok("flag ON: pivoted model reply is scrubbed, not returned raw",
    !out.reply.includes("السيستم") &&
    !out.reply.includes("نبني الطلب") &&
    out.reply.includes("نرتّب الطلب"));
}

// Unknown/gibberish under the flag reaches the model only with the no-invent / ask annotation.
{
  const out = await respond({
    brain: brain(true),
    history: [],
    userMessage: "؟!؟!",
    initialDraft: null,
    perceptionRead: READ_BAD,
  });
  ok("flag ON gibberish: model path is used with live annotation signal",
    out.model === "mock" && out.signals.some((s) => s.detail.reason === RULE6_ANNOTATION_PIVOT_LIVE_REASON));
  ok("flag ON gibberish: mock path does not fabricate an order",
    !/(أضفت|سجلت|سجّلت|أكدت|اتأكد|تم\s+تأكيد|طلبك\s+رقم)/u.test(out.reply));
  ok("flag ON gibberish: approved annotation tells the model to ask and not invent",
    RULE6_ANNOTATION_PIVOT_DIRECTIVE.includes("ask ONE specific clarifying question") &&
    RULE6_ANNOTATION_PIVOT_DIRECTIVE.includes("Do not invent items, quantities, delivery details, or a final order"));
}

const respondSource = readFileSync(resolve(process.cwd(), "lib/ai/respond.ts"), "utf8");
const customerTurnSource = readFileSync(resolve(process.cwd(), "lib/ai/customer-turn.ts"), "utf8");
const promptSource = readFileSync(resolve(process.cwd(), "lib/ai/prompt.ts"), "utf8");
const tierSource = readFileSync(resolve(process.cwd(), "lib/tenant/tier.ts"), "utf8");
const flagsDoc = readFileSync(resolve(process.cwd(), "docs/flags.md"), "utf8");
const pivotTailIndex = respondSource.indexOf("systemTail = composeSystemTail([...baseSystemTailParts, RULE6_ANNOTATION_PIVOT_DIRECTIVE]);");
const numeralValidatorIndex = respondSource.indexOf("validateNumerals({");
const finalScrubIndex = respondSource.indexOf("scrubBannedWords(text)");
const finalReturnIndex = respondSource.lastIndexOf("return {");

ok("source: pivot appends annotation into systemTail and falls through to the model loop",
  /RULE6_ANNOTATION_PIVOT_DIRECTIVE/.test(respondSource) &&
  /systemTail = composeSystemTail\(\[\.\.\.baseSystemTailParts, RULE6_ANNOTATION_PIVOT_DIRECTIVE\]\);/.test(respondSource) &&
  respondSource.indexOf("RULE6_ANNOTATION_PIVOT_DIRECTIVE") < respondSource.indexOf("for (let i = 0; i < MAX_ITERATIONS"));

ok("source: pivoted replies pass through the existing numeral validator and banned-word scrubber",
  pivotTailIndex >= 0 &&
  pivotTailIndex < numeralValidatorIndex &&
  numeralValidatorIndex < finalScrubIndex &&
  finalScrubIndex < finalReturnIndex);

ok("source: shadow signal is persisted separately and best-effort/non-fatal",
  customerTurnSource.includes("RULE6_ANNOTATION_PIVOT_SHADOW_REASON") &&
  customerTurnSource.includes("wouldHave: \"model_with_annotation\"") &&
  customerTurnSource.includes("if (error) console.error(\"[goal_logic] rule6 annotation pivot shadow log failed\", error)") &&
  customerTurnSource.includes("catch (e)") &&
  customerTurnSource.includes("console.error(\"[goal_logic] rule6 annotation pivot shadow log failed\", e)"));

ok("source: shadow signal is not appended to returned result.signals",
  !/result\s*=\s*\{[\s\S]{0,400}RULE6_ANNOTATION_PIVOT_SHADOW_REASON/.test(customerTurnSource) &&
  !/signals:\s*\[[^\]]*RULE6_ANNOTATION_PIVOT_SHADOW_REASON/.test(customerTurnSource));

ok("source: flag is explicit-only and wired onto BrainContext",
  customerTurnSource.includes("isFeatureExplicitlyEnabled(\"goal_logic_rule6_annotation_pivot\", tenantFeatures)") &&
  customerTurnSource.includes("goalLogicRule6AnnotationPivot: goalLogicRule6AnnotationPivotOn") &&
  promptSource.includes("goalLogicRule6AnnotationPivot?: boolean") &&
  tierSource.includes("\"goal_logic_rule6_annotation_pivot\"") &&
  flagsDoc.includes("Strict explicit flag"));

console.log(`\n${fail === 0 ? "✅" : "❌"} rule6-annotation-pivot: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
