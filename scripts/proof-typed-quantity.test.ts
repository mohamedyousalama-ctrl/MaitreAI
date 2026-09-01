// WO-QTY — deterministic bare quantity answers.
// Run: node --experimental-strip-types scripts/proof-typed-quantity.test.ts

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  draftFromQuantityPrompt,
  isQuantityButtonsPresentation,
  parseBareQuantityAnswer,
  quantityFromInteractiveId,
} from "../lib/messaging/quantity-fill.ts";

let pass = 0, fail = 0;
const ok = (name: string, condition: boolean) => {
  if (condition) pass++;
  else {
    fail++;
    console.log("  FAIL", name);
  }
};
const eq = (name: string, actual: unknown, expected: unknown) =>
  ok(`${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`, actual === expected);

const bridge = readFileSync(resolve(process.cwd(), "lib/messaging/respond-and-send.ts"), "utf8");
const typed = readFileSync(resolve(process.cwd(), "lib/messaging/typed-actions.ts"), "utf8");
const quantity = readFileSync(resolve(process.cwd(), "lib/messaging/quantity-fill.ts"), "utf8");
const tier = readFileSync(resolve(process.cwd(), "lib/tenant/tier.ts"), "utf8");
const tools = readFileSync(resolve(process.cwd(), "lib/ai/tools.ts"), "utf8");
const flagsDoc = readFileSync(resolve(process.cwd(), "docs/flags.md"), "utf8");

eq("tap 3 id resolves", quantityFromInteractiveId("qty:3"), 3);
eq("typed ASCII 3 resolves", parseBareQuantityAnswer("3"), 3);
eq("typed Arabic-Indic ٢ resolves", parseBareQuantityAnswer("٢"), 2);
eq("typed Egyptian word تلاتة resolves", parseBareQuantityAnswer("تلاتة"), 3);
eq("typed Saudi/MSA word ثلاثة resolves", parseBareQuantityAnswer("ثلاثة"), 3);
eq("typed ٢٠ resolves", parseBareQuantityAnswer("٢٠"), 20);
eq("non-numeric passes through", parseBareQuantityAnswer("تمام"), null);
eq("compound text is not bare quantity", parseBareQuantityAnswer("٣ كاديا"), null);
eq("out-of-scope 21 passes through", parseBareQuantityAnswer("21"), null);
eq("unknown qty id passes through", quantityFromInteractiveId("qty:100"), null);

// FILLERS AND COUNTERS. «وحده بس» — "just one" — is the most common spoken answer to a
// quantity question and used to return null, so the basket stayed empty and the agent
// asked again. The closed filler/counter lists must not widen into "strip any token":
// the null cases below are the fence that proves they did not.
eq("«وحده بس» resolves", parseBareQuantityAnswer("وحده بس"), 1);
eq("«واحدة بس» resolves", parseBareQuantityAnswer("واحدة بس"), 1);
eq("«بس واحد» resolves (filler first)", parseBareQuantityAnswer("بس واحد"), 1);
eq("«اتنين بس» resolves", parseBareQuantityAnswer("اتنين بس"), 2);
eq("«٢ بس» resolves", parseBareQuantityAnswer("٢ بس"), 2);
eq("«واحدة فقط» resolves", parseBareQuantityAnswer("واحدة فقط"), 1);
eq("«واحدة لو سمحت» resolves (multi-word filler)", parseBareQuantityAnswer("واحدة لو سمحت"), 1);
eq("«تكفى واحد» resolves (Saudi politeness)", parseBareQuantityAnswer("تكفى واحد"), 1);
// Khalid asks «كم حبة تبي؟»; the idiomatic answer is the dual, not a numeral.
eq("dual «حبتين» resolves", parseBareQuantityAnswer("حبتين"), 2);
eq("dual «طبقين» resolves", parseBareQuantityAnswer("طبقين"), 2);
eq("counter «حبة واحدة» resolves", parseBareQuantityAnswer("حبة واحدة"), 1);
eq("counter «٣ حبات» resolves", parseBareQuantityAnswer("٣ حبات"), 3);
eq("counter «صحن واحد» resolves", parseBareQuantityAnswer("صحن واحد"), 1);
// THE FENCE. A dish name is not a filler; a filler alone is not a quantity.
eq("«بس» alone is not a quantity", parseBareQuantityAnswer("بس"), null);
eq("«حبة» alone is not a quantity", parseBareQuantityAnswer("حبة"), null);
eq("«واحد كبسة» is still compound", parseBareQuantityAnswer("واحد كبسة"), null);
eq("«٣ كاديا» is still compound", parseBareQuantityAnswer("٣ كاديا"), null);

// SAFETY: a quantity that parses cleanly must STILL not short-circuit a turn carrying an
// allergen / symptom / phonetic-net / emergency signal. The deterministic fill skips the
// entire customer-turn pipeline, allergen gate included, so the probe has to GATE — it
// used to be computed, passed in, and merely written to `meta`.
ok("the shared handler refuses on any safety signal, before it parses a quantity",
  /if \(safetyProbeFired\(args\.safetyProbe\)\) \{[\s\S]{0,140}reason: "safety_signal"/.test(typed) &&
  typed.indexOf('reason: "safety_signal"') < typed.indexOf("const qty = quantityFromInteractiveId"));
ok("«safety_signal» and «flag_off» are declared pass-through reasons, not ad-hoc strings",
  /reason: "non_numeric" \| "no_pending_quantity" \| "ambiguous_draft" \| "safety_signal" \| "flag_off";/.test(typed));
// The probe is a CLOSED STRUCT. It used to be Record<string, unknown>, so `{}` was legal —
// and `Object.values({}).some(Boolean)` is false, i.e. an empty probe read as "all clear".
// The demo route was in fact passing `{}`. Now that is a compile error.
// THREE now, not four: the phonetic near-miss net is gone by Founder ruling. The field was
// REMOVED from the struct rather than set to `false`, so any caller still passing it is a
// compile error instead of a value quietly ignored — the same reasoning that made this a
// closed struct in the first place.
// FOUR AGAIN, but not the same four. `phoneticSafetyNet` is gone — the near-miss GUESSING
// was retired — and `allergyContext` took the slot: the EXACT phrases and markers the
// vocabulary gate does not carry, with no distance function and no confidence input. The
// struct stays closed so adding a detector without wiring `safetyProbeFired` is a compile
// error rather than a silently ignored field.
ok("SafetyProbe is a closed struct with every detector required",
  /export interface SafetyProbe \{[\s\S]{0,400}allergenAvoidance: boolean;[\s\S]{0,400}allergenSymptom: boolean;[\s\S]{0,400}allergyContext: boolean;[\s\S]{0,400}allergenEmergency: boolean;/.test(typed) &&
  !/phoneticSafetyNet: boolean;/.test(typed) &&
  !/safetyProbe: Record<string, unknown>/.test(typed));
// Reading the four fields BY NAME means adding a fifth detector without wiring it here is
// a compile error, rather than a silently-ignored field.
ok("safetyProbeFired reads every field by name, not via Object.values",
  /export function safetyProbeFired\(probe: SafetyProbe\): boolean \{\s*return probe\.allergenAvoidance \|\| probe\.allergenSymptom \|\| probe\.allergyContext \|\| probe\.allergenEmergency;/.test(typed));
// The kill switch: a flag that cannot switch a surface off is not a kill switch. It was
// checked only at the WhatsApp call site, so the public demo stayed on the rail.
ok("the handler itself honours typed_quantity_fill, so both callers are covered",
  /if \(!isFeatureExplicitlyEnabled\("typed_quantity_fill", features\)\) \{[\s\S]{0,120}reason: "flag_off"/.test(typed));

const qtyPresentation = {
  kind: "buttons",
  buttons: [
    { id: "qty:1", title: "1" },
    { id: "qty:2", title: "2" },
    { id: "qty:3", title: "3" },
  ],
};
const draft = {
  finalized: false,
  lines: [{ itemId: "dish-1", name: "كاديا", quantity: 1 }],
};
ok("quantity button presentation is recognized", isQuantityButtonsPresentation(qtyPresentation));
ok("pending quantity prompt with buttons is recognized",
  !!draftFromQuantityPrompt({ text: "كام كاديا؟", meta: { draft, presentation: qtyPresentation } }));
ok("pending quantity prompt with item text is recognized",
  !!draftFromQuantityPrompt({ text: "كام كاديا؟", meta: { draft, presentation: null } }));
ok("no pending question passes through",
  draftFromQuantityPrompt({ text: "تحب أأكد الطلب؟", meta: { draft, presentation: null } }) === null);
ok("finalized draft is not pending",
  draftFromQuantityPrompt({ text: "كام كاديا؟", meta: { draft: { ...draft, finalized: true }, presentation: qtyPresentation } }) === null);

ok("flag is registered strict/default-off",
  tier.includes('"typed_quantity_fill"') &&
  flagsDoc.includes("`typed_quantity_fill`") &&
  flagsDoc.includes("Strict explicit flag"));
ok("bridge gates typed quantity fill explicitly",
  /isFeatureExplicitlyEnabled\("typed_quantity_fill", convFlags\)/.test(bridge) &&
  /handleTypedQuantityFill\(admin/.test(bridge));
ok("typed quantity branch sits before userMessage/model path",
  bridge.indexOf("handleTypedQuantityFill(admin") > 0 &&
  bridge.indexOf("handleTypedQuantityFill(admin") < bridge.indexOf("const userMessage =") &&
  bridge.indexOf("const userMessage =") < bridge.indexOf("outcome = await runCustomerTurn("));
ok("handled typed quantity returns before runCustomerTurn",
  bridge.indexOf("if (typed.kind === \"handled\")", bridge.indexOf("handleTypedQuantityFill(admin")) > 0 &&
  bridge.indexOf("return { status: \"responded\", reply: typed.reply", bridge.indexOf("handleTypedQuantityFill(admin")) <
    bridge.indexOf("outcome = await runCustomerTurn("));
ok("qty:N taps are handled before the typed_quantity_fill text feature",
  /if \(cleanInteractiveId\)/.test(bridge) &&
  /!cleanInteractiveId[\s\S]{0,120}isFeatureExplicitlyEnabled\("typed_quantity_fill", convFlags\)/.test(bridge));
ok("handler accepts tap id and typed text",
  /quantityFromInteractiveId\(args\.interactiveId\) \?\? parseBareQuantityAnswer\(args\.userMessage\)/.test(typed));
ok("non-numeric pass-through is explicit",
  typed.includes('return { kind: "pass_through", reason: "non_numeric" }'));
ok("no pending question pass-through is explicit",
  typed.includes('return { kind: "pass_through", reason: "no_pending_quantity" }'));
ok("ambiguous draft pass-through is explicit",
  typed.includes('return { kind: "pass_through", reason: "ambiguous_draft" }'));
ok("deterministic fill uses existing add_to_order set path",
  /executeTool\("add_to_order", \{ item_name: lastLine\.name, quantity: qty, mode: "set" \}, ctx\)/.test(typed));
ok("quantity buttons are emitted with typed ids",
  /id: "qty:1"[\s\S]{0,90}id: "qty:2"[\s\S]{0,90}id: "qty:3"/.test(tools));
ok("quantity helper documents the 1..20 bare-answer scope",
  quantity.includes("1..20") && quantity.includes("NUMBER_WORDS"));

console.log("\nWO-QTY proof summary");
console.log("  deterministic: tap qty:3, typed 3, typed ٢, typed تلاتة");
console.log("  pass-through: non-numeric, compound text, no pending question; qty:N taps handled before text fill");
console.log(`\n${fail === 0 ? "PASS" : "FAIL"} typed-quantity: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
