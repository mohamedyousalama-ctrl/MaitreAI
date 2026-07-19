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
ok("flag-off path remains legacy routeInteractive -> runCustomerTurn",
  /typedConfirmMessage \?\? \(coalesced\.count > 1 \? rawText : routeInteractive\(lastInteractiveId, rawText\)\.text\)/.test(bridge));
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
console.log("  pass-through: non-numeric, compound text, no pending question, flag-off source path");
console.log(`\n${fail === 0 ? "PASS" : "FAIL"} typed-quantity: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
