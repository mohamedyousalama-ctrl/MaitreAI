// Legacy WO-S0-TYPED proof, updated by WO-FIX-INTERACTIVE.
// Run:
//   node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types scripts/proof-typed-interactive-actions.test.ts

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { routeInteractive } from "../lib/messaging/interactive-router.ts";
import { interactiveCommandFromId } from "../lib/messaging/typed-actions.ts";

let pass = 0, fail = 0;
const ok = (name: string, condition: boolean) => {
  if (condition) pass++;
  else {
    fail++;
    console.log("  FAIL", name);
  }
};

const bridge = readFileSync(resolve(process.cwd(), "lib/messaging/respond-and-send.ts"), "utf8");

const fixedIds = [
  "set_pickup",
  "set_delivery",
  "confirm_order",
  "add_more",
  "cancel_order",
  "pay_cod",
  "pay_vodafone_cash",
  "pay_counter",
];

for (const id of fixedIds) {
  ok(`parser recognizes ${id}`, interactiveCommandFromId(id)?.id === id);
  ok(`legacy router rejects ${id} instead of mapping to text`, routeInteractive(id, "TITLE").rejectedId === id && routeInteractive(id, "TITLE").text === "");
}

for (const id of ["qty:1", "qty:2", "qty:99"]) {
  ok(`parser recognizes ${id}`, interactiveCommandFromId(id)?.id === id);
  ok(`legacy router rejects ${id}`, routeInteractive(id, "raw").rejectedId === id);
}

ok("item:<id> is a first-class typed command", interactiveCommandFromId("item:item-1")?.kind === "select_item");
ok("cat:<id> is a first-class typed command", interactiveCommandFromId("cat:cat-1")?.kind === "select_category");
ok("unknown ids do not become commands", interactiveCommandFromId("evil_force_paid") === null);
ok("unknown ids do not fall through the legacy router", routeInteractive("evil_force_paid", "raw").text === "");

ok("known-id typed branch no longer depends on typed_interactive_actions",
  !/isFeatureExplicitlyEnabled\("typed_interactive_actions", convFlags\)[\s\S]{0,120}isTypedInteractiveActionId/.test(bridge));
ok("typed branch is entered for any inbound interactive id",
  /if \(cleanInteractiveId\)/.test(bridge));
ok("coalesced safety text wins over a trailing tap",
  /burstSafetyTakesPriority/.test(bridge) && /tapSafetyText = coalesced\.count === 1 \? "" : rawText/.test(bridge));
ok("typed branch runs the allergy sentinels on tapSafetyText",
  /const tapSafetyText = coalesced\.count === 1 \? "" : rawText/.test(bridge) &&
  /detectAllergenAvoidance\(tapSafetyText\)\.fired/.test(bridge) &&
  /detectAllergenSymptom\(tapSafetyText\)\.fired/.test(bridge) &&
  /detectPhoneticSafetyNet\(tapSafetyText, \{ sttConfidence: null, isVoiceTranscript: false \}\)\.fired/.test(bridge) &&
  /detectAllergenEmergency\(tapSafetyText\)\.fired/.test(bridge));
ok("confirm_order delegates to the existing confirm/allergen gate",
  /typedConfirmMessage = typed\.userMessage/.test(bridge));
ok("non-confirm typed actions return before runCustomerTurn",
  bridge.indexOf("return { status: \"responded\", reply: typedReply") > 0 &&
  bridge.indexOf("return { status: \"responded\", reply: typedReply") < bridge.indexOf("outcome = await runCustomerTurn("));

console.log("\nWO-S0-CORPUS replay summary");
console.log(`  fixed controls: ${fixedIds.join(", ")}`);
console.log("  parametric controls: qty:1..99");
console.log("  item/category controls: item:<id>, cat:<id>");
console.log("  unknown ids: deterministic retry reply in respond-and-send, never text fallback");
console.log(`\n${fail === 0 ? "PASS" : "FAIL"} typed-interactive-actions: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
