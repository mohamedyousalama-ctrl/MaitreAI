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
ok("A: read-not-understood → ASK (skip-on-doubt toward asking)", classifyGoal({ userMessage: "حاجة مبهمة", read: READ_BAD, state: STATE() }).action === "ask");
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
    eg.scrubbed.length === 2 && !hasBannedWord(eg.text) && eg.text.includes("أجهّز الطلب") && !eg.text.includes("السيستم"));
  const clean = scrubBannedWords("تمام ✅ أضفتلك بيتزا ببروني لطلبك.");
  ok("D: a clean reply is returned byte-identical (scrubbed = [])", clean.scrubbed.length === 0 && clean.text === "تمام ✅ أضفتلك بيتزا ببروني لطلبك.");
}

// ── E — source wiring: front interpreter (ASK short-circuit) + validator supersedes + scrub ─
const rs = readFileSync(resolve(process.cwd(), "lib/ai/respond.ts"), "utf8");
const ct = readFileSync(resolve(process.cwd(), "lib/ai/customer-turn.ts"), "utf8");
const fl = readFileSync(resolve(process.cwd(), "lib/tenant/tier.ts"), "utf8");
ok("E: respond.ts runs the front Goal Interpreter gated on goalLogic, before the model loop",
  /if \(input\.brain\.goalLogic && canOrder\)\s*\{[\s\S]{0,400}?classifyGoal\(/.test(rs) &&
  rs.indexOf("classifyGoal(") < rs.indexOf("for (let i = 0; i < MAX_ITERATIONS"));
ok("E: AMBIGUOUS short-circuits with a grounded clarify + banned scrub (no model loop)",
  /decision\.action === "ask"[\s\S]{0,400}?buildClarifyingQuestion\(/.test(rs) && /stopReason: "goal_clarify"/.test(rs));
ok("E: the Final Validator SUPERSEDES fabricatesMoney/price_truth when goalLogic ON",
  /if \(input\.brain\.goalLogic\)\s*\{[\s\S]{0,900}?validateNumerals\([\s\S]{0,900}?stripBlockedNumerals\(/.test(rs) &&
  /\} else \{[\s\S]{0,700}?fabricatesMoney\(text, currency, knownPrices\)/.test(rs));
ok("E: a final banned-word scrub runs before the reply returns (goalLogic ON)",
  /input\.brain\.goalLogic && text\.trim\(\)\)\s*\{[\s\S]{0,200}?scrubBannedWords\(text\)/.test(rs));
ok("E: customer-turn sets goalLogic from the flag AND bundles perception ON",
  /goalLogic: isFeatureExplicitlyEnabled\("goal_logic", tenantFeatures\)/.test(ct) &&
  /goalLogicOn[\s\S]{0,160}?perceptionOn = \(isFeatureExplicitlyEnabled\("perception", tenantFeatures\) \|\| goalLogicOn\)/.test(ct) &&
  /perceptionRead: perception/.test(ct));
ok("E: the flag is registered in the ProFeature union", /"goal_logic"/.test(fl));

console.log(`\n${fail === 0 ? "✅" : "❌"} goal-logic: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
