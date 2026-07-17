// WO-V1.0-GOAL-LOGIC (Slice 1) — RED-FIRST: prove the front-of-turn RULE + the Final Validator
// GENERALIZE across the intent matrix (the category, not the cases). The reactive pipeline
// generated a reply then post-hoc guards swapped canned strings that LEAK banned words
// («من السيستم»/«أبني الطلب», prompt.ts:326) and seed an anchoring loop, and never REASONED
// about ambiguous input (a bare «1000» got the canned deferral). Fix: intent-reasoning at the
// FRONT (ambiguous→ask / price→tool-only / clear→act); guards demote to a backstop; a
// numeral-provenance validator + banned-word scrubber close the fabricated-number + jargon leak.
// Run: node --conditions=react-server --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types scripts/proof-goal-logic.test.ts
import { readFileSync } from "fs";
import { resolve } from "path";
import { isMidItemClarifier, respond } from "../lib/ai/respond.ts";
import { classifyGoal, isPriceRequest } from "../lib/ai/goal-interpreter.ts";
import { buildClarifyingQuestion } from "../lib/ai/clarification.ts";
import { validateNumerals, stripBlockedNumerals } from "../lib/ai/numeral-provenance.ts";
import { scrubBannedWords, hasBannedWord } from "../lib/ai/banned-words.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

const ITEMS = [
  { id: "1", name: "عرض كاديا", price: 320, variants: [] },
  { id: "2", name: "عرض ميجا ميل", price: 150, variants: [] },
  { id: "3", name: "بيتزا ببروني", price: 120, variants: [] },
] as unknown as import("../lib/types.ts").MenuItem[];
const STATE = (o = {}) => ({ itemNames: ITEMS.map((i) => i.name), offerNames: ["عرض كاديا", "عرض ميجا ميل"], atConfirmationPoint: false, hasOpenDraft: false, ...o });
const READ_OK = { intent: "build_order", confidence: "high" as const, understood: true };
const READ_BAD = { intent: "unknown", confidence: "low" as const, understood: false };

// ── A — THE RULE generalizes: one classifier, many intents (category, not cases) ─────────
ok("A: bare «1000» → ASK (no slot binds a bare number)", classifyGoal({ userMessage: "1000", read: READ_BAD, state: STATE() }).action === "ask");
ok("A: bare «١٥٠٠» → ASK even with a confident read (deterministic backstop)", classifyGoal({ userMessage: "١٥٠٠", read: READ_OK, state: STATE() }).action === "ask");
{
  const d = classifyGoal({ userMessage: "العرض", read: READ_OK, state: STATE() });
  ok("A: referent-less «العرض» (≥2 offers) → ASK naming the candidates", d.action === "ask" && d.kind === "referent" && d.candidates.length === 2);
}
ok("A: clear «عايز بيتزا ببروني» → ACT (run the tool loop)", classifyGoal({ userMessage: "عايز بيتزا ببروني", read: READ_OK, state: STATE() }).action === "act");
ok("A: «بكام الأوردر» → PRICE (tool-only routing, model never states a number)", classifyGoal({ userMessage: "بكام الأوردر", read: READ_OK, state: STATE() }).action === "price");
ok("A: «ماشي» off a confirmation point → ASK (agree to what?)", classifyGoal({ userMessage: "ماشي", read: READ_OK, state: STATE({ atConfirmationPoint: false }) }).action === "ask");
ok("A: «ماشي» AT a confirmation point → ACT (confirm)", classifyGoal({ userMessage: "ماشي", read: READ_OK, state: STATE({ atConfirmationPoint: true }) }).action === "act");
ok("A: headcount «يكفي ١٠ أشخاص» → ASK honestly (Slice-2 planner not built — never a fabricated plan)",
  classifyGoal({ userMessage: "عايز أكل يكفي ١٠ أشخاص", read: READ_OK, state: STATE() }).kind === "headcount");
{
  const d = classifyGoal({ userMessage: "حاجة مبهمة", read: READ_BAD, state: STATE() });
  ok("A: cold-open read-not-understood → ASK/unclear (skip-on-doubt preserved)",
    d.action === "ask" && d.kind === "unclear" && d.reason === "read_not_understood");
}
{
  const d = classifyGoal({
    userMessage: "عايز فيليه سوبر حار",
    read: { intent: "build_order", confidence: "medium", understood: false },
    state: STATE(),
  });
  ok("A: live cold-open build_order + unsure read defers to model for «عايز فيليه سوبر حار»",
    d.action === "act" && d.reason === "read_unsure_but_order_intent");
}
for (const intent of ["browse", "modify", "ask_item", "ask_offers"] as const) {
  const d = classifyGoal({
    userMessage: intent === "ask_offers" ? "فيه عروض؟" : "عايز أطلب",
    read: { intent, confidence: "medium", understood: false },
    state: STATE(),
  });
  ok(`A: cold-open ${intent} + unsure read defers to model`, d.action === "act" && d.reason === "read_unsure_but_order_intent");
}
for (const intent of ["unknown", "smalltalk"] as const) {
  const d = classifyGoal({
    userMessage: intent === "smalltalk" ? "عامل ايه" : "حاجة مبهمة",
    read: { intent, confidence: "medium", understood: false },
    state: STATE(),
  });
  ok(`A: cold-open ${intent} + unsure read STILL asks`, d.action === "ask" && d.kind === "unclear" && d.reason === "read_not_understood");
}
for (const phrase of ["خمسة حار وخمسة عادي", "خلي الماء 4", "تأكيد الطلب"]) {
  const d = classifyGoal({ userMessage: phrase, read: READ_BAD, state: STATE({ hasOpenDraft: true }) });
  ok(`A: open draft + unsure read defers to model for «${phrase}»`,
    d.action === "act" && d.reason === "read_unsure_defer_to_model");
}
{
  const d = classifyGoal({ userMessage: "تأكيد الطلب", read: READ_BAD, state: STATE({ atConfirmationPoint: true }) });
  ok("A: confirmation point + unsure read defers to model for «تأكيد الطلب»",
    d.action === "act" && d.reason === "read_unsure_defer_to_model");
}
ok("A: isPriceRequest is a pure predicate", isPriceRequest("بكام") === true && isPriceRequest("عايز بيتزا") === false);

// ── B — Clarification questions are GROUNDED (name real candidates), never canned/evasive ─
{
  const q = buildClarifyingQuestion({ kind: "referent", candidates: ["عرض كاديا", "عرض ميجا ميل"], dialect: "egyptian" });
  ok("B: referent clarify names the real offers", q.includes("عرض كاديا") && q.includes("عرض ميجا ميل"));
  const bn = buildClarifyingQuestion({ kind: "bare_number", candidates: [], dialect: "egyptian" });
  ok("B: bare-number clarify asks what the number means (not a canned deferral)", /عدد|مبلغ/.test(bn) && !/السيستم|أبني الطلب/.test(bn));
  ok("B: no clarify line contains a banned word", !hasBannedWord(q) && !hasBannedWord(bn));
}

// ── C — the Final Validator: numeral provenance (the «150» class) + scrub ─────────────────
{
  const v = validateNumerals({ text: "عرض كاديا — ١٥٠ ج.م", currency: "ج.م", menuItems: ITEMS, sources: { customer: [], tool: [], deliveryPromo: [320, 150, 120] } });
  ok("C: «عرض كاديا — ١٥٠» is repaired to its {M} price ٣٢٠ (pair-binding)", v.repaired.length === 1 && v.repaired[0].real === 320 && /عرض كاديا[^\n]*٣٢٠/.test(v.text));
}
{
  const v = validateNumerals({ text: "التوصيل ٩٩٩ ج.م", currency: "ج.م", menuItems: ITEMS, sources: { customer: [], tool: [], deliveryPromo: [320, 150, 120] } });
  ok("C: a fabricated untraceable numeral (٩٩٩ ∉ {C}∪{M}∪{Q}∪{D}) → BLOCKED", v.blocked.includes(999));
  ok("C: stripBlockedNumerals excises the blocked numeral (strip-for-stray, no canned line)", !/٩٩٩/.test(stripBlockedNumerals(v.text, v.blocked, "ج.م")));
}
{
  const v = validateNumerals({ text: "إجمالي طلبك ٤٧٠ ج.م", currency: "ج.م", menuItems: ITEMS, sources: { customer: [], tool: [470], deliveryPromo: [] } });
  ok("C: a tool-computed {Q} total (٤٧٠) is TRACEABLE → not blocked", v.blocked.length === 0);
}
{
  const v = validateNumerals({ text: "عرض كاديا بـ ٣٢٠ ج.م", currency: "ج.م", menuItems: ITEMS, sources: { customer: [], tool: [], deliveryPromo: [320] } });
  ok("C: a CORRECT {M} quote is untouched (no repair, not blocked)", v.repaired.length === 0 && v.blocked.length === 0);
}

// ── D — the banned-word scrubber closes the leak permanently (the OWN-fallbacks class) ────
{
  const eg = scrubBannedWords("أقدر أحسبهولك بدقة من السيستم، بس لازم أبني الطلب الأول. تحب أضيف إيه؟");
  ok("D: safeMoneyReply leak «من السيستم» + «أبني الطلب» is scrubbed to waiter language",
    eg.scrubbed.length === 2 && !hasBannedWord(eg.text) && eg.text.includes("أرتّب الطلب") && !eg.text.includes("السيستم"));
  const live = scrubBannedWords("حاضر! وبدأ نبني الطلب 👇");
  ok("D: live prep-implying bug is closed — «نبني الطلب» never rewrites to «نجهّز الطلب»",
    live.text.includes("نرتّب الطلب") && !/نجهّز|نجهز|تجهيز|أجهّز|أجهز|أجهّزه|أجهزه/.test(live.text));
  ok("D: all 4 build-verb rewrites map to the neutral «رتّب» family",
    scrubBannedWords("أبني الطلب").text === "أرتّب الطلب" &&
    scrubBannedWords("بناء الطلب").text === "ترتيب الطلب" &&
    scrubBannedWords("أبنيه").text === "أرتّبه" &&
    scrubBannedWords("نبني الطلب").text === "نرتّب الطلب");
  const mixed = scrubBannedWords("نبني الطلب من السيستم");
  ok("D: mixed jargon keeps both behaviors — drops «السيستم» and rewrites «نبني» neutrally",
    mixed.text === "نرتّب الطلب" && mixed.scrubbed.includes("نبني الطلب") && mixed.scrubbed.includes("من السيستم"));
  ok("D: other jargon drops still work",
    scrubBannedWords("من قاعدة البيانات").text === "" &&
    scrubBannedWords("أنا الذكاء الاصطناعي").text === "أنا");
  const clean = scrubBannedWords("تمام ✅ أضفتلك بيتزا ببروني لطلبك.");
  ok("D: a clean reply is returned byte-identical (scrubbed = [])", clean.scrubbed.length === 0 && clean.text === "تمام ✅ أضفتلك بيتزا ببروني لطلبك.");
}

// ── E — source wiring: front interpreter (ASK short-circuit) + validator supersedes + scrub ─
const rs = readFileSync(resolve(process.cwd(), "lib/ai/respond.ts"), "utf8");
const ct = readFileSync(resolve(process.cwd(), "lib/ai/customer-turn.ts"), "utf8");
const fl = readFileSync(resolve(process.cwd(), "lib/tenant/tier.ts"), "utf8");
ok("E: respond.ts runs the front Goal Interpreter gated on goalLogic, before the model loop",
  /if \(input\.brain\.goalLogic && canOrder\)\s*\{[\s\S]{0,700}?classifyGoal\(/.test(rs) &&
  rs.indexOf("classifyGoal(") < rs.indexOf("for (let i = 0; i < MAX_ITERATIONS"));
ok("E: respond.ts widens goal state with the Week-1 hasOrderContext soft signal",
  /const hasOrderContext = !!input\.initialDraft\?\.lines\.length \|\| isMidItemClarifier\(input\.history\);/.test(rs) &&
  /hasOpenDraft: hasOrderContext/.test(rs));
ok("E: AMBIGUOUS short-circuits with a grounded clarify + banned scrub (no model loop)",
  /decision\.action === "ask"[\s\S]{0,400}?buildClarifyingQuestion\(/.test(rs) && /stopReason: "goal_clarify"/.test(rs));
ok("E: the Final Validator SUPERSEDES fabricatesMoney/price_truth when goalLogic ON",
  /if \(input\.brain\.goalLogic\)\s*\{[\s\S]{0,900}?validateNumerals\([\s\S]{0,900}?stripBlockedNumerals\(/.test(rs) &&
  /\} else \{[\s\S]{0,700}?fabricatesMoney\(text, currency, knownPrices\)/.test(rs));
ok("E: a final banned-word scrub runs before the reply returns (goalLogic ON)",
  /input\.brain\.goalLogic && text\.trim\(\)\)\s*\{[\s\S]{0,200}?scrubBannedWords\(text\)/.test(rs));
ok("E: customer-turn sets goalLogic from the flag AND bundles perception ON",
  /const goalLogicOn = isFeatureExplicitlyEnabled\("goal_logic", tenantFeatures\);/.test(ct) &&
  /goalLogic: goalLogicOn/.test(ct) &&
  /const perceptionOn = \(isFeatureExplicitlyEnabled\("perception", tenantFeatures\) \|\| goalLogicOn\) && !combinedAllergenHit\.fired;/.test(ct) &&
  /perceptionRead: perception/.test(ct));
ok("E: the flag is registered in the ProFeature union", /"goal_logic"/.test(fl));

// ── F — Week-1 soft order context: a just-asked item clarifier is mid-order even
// with no committed draft line yet (variant/choice missing → add_to_order cannot push).
process.env.AI_ADAPTER = "mock";
const SOFT_CONTEXT_BRAIN = {
  profile: { name: "Wesaya", currency: "ج.م", timezone: "Africa/Cairo", businessType: "restaurant" },
  dialect: "egyptian",
  menuItems: [
    {
      id: "water", name: "مياه", category: "مشروبات", price: 20, available: true,
      description: "", imageUrl: "", modifierIds: [], ingredients: [], allergens: [],
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
} as never;
ok("F: standard item clarifier «عادي ولا دوبل؟» is detected",
  isMidItemClarifier([{ role: "assistant", content: "عادي ولا دوبل؟" }]));
ok("F: old clarifier is ignored when the immediately preceding turn is not assistant",
  !isMidItemClarifier([{ role: "assistant", content: "عادي ولا دوبل؟" }, { role: "user", content: "بعدها رسالة تانية" }]));
{
  const out = await respond({
    brain: SOFT_CONTEXT_BRAIN,
    history: [{ role: "assistant", content: "تمام ٢ برجر، تحب الحجم عادي ولا دوبل؟" }],
    userMessage: "خلي الماء ٤",
    initialDraft: null,
    perceptionRead: READ_BAD,
  });
  ok("F: live shape after item clarifier + empty draft + bad read reaches model (not goal_clarify)",
    out.stopReason !== "goal_clarify" && out.model === "mock");
}
{
  const out = await respond({
    brain: SOFT_CONTEXT_BRAIN,
    history: [],
    userMessage: "خلي الماء ٤",
    initialDraft: null,
    perceptionRead: READ_BAD,
  });
  ok("F: cold-open empty draft + no clarifier + bad read still deflects",
    out.stopReason === "goal_clarify");
}

console.log(`\n${fail === 0 ? "✅" : "❌"} goal-logic: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
