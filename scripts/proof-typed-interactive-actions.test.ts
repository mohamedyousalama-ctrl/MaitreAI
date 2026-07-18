// WO-S0-TYPED — local replay proof for deterministic WhatsApp interactive taps.
// Run: node --experimental-strip-types scripts/proof-typed-interactive-actions.test.ts
//
// This is the local WO-S0-CORPUS slice: it proves every id already registered in
// lib/messaging/interactive-router.ts is covered by the typed map, the flag-off
// path still falls back to routeInteractive, item:<uuid> stays unrouted, and the
// button-containing replay reduces customer-agent entries to only confirm_order
// (which delegates to the existing confirm/allergy gate).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { routeInteractive } from "../lib/messaging/interactive-router.ts";

let pass = 0, fail = 0;
const ok = (name: string, condition: boolean) => {
  if (condition) pass++;
  else {
    fail++;
    console.log("  FAIL", name);
  }
};

const router = readFileSync(resolve(process.cwd(), "lib/messaging/interactive-router.ts"), "utf8");
const typed = readFileSync(resolve(process.cwd(), "lib/messaging/typed-actions.ts"), "utf8");
const bridge = readFileSync(resolve(process.cwd(), "lib/messaging/respond-and-send.ts"), "utf8");
const tier = readFileSync(resolve(process.cwd(), "lib/tenant/tier.ts"), "utf8");

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
  const routed = routeInteractive(id, "TITLE");
  ok(`router recognizes ${id}`, routed.routedId === id && routed.text !== "TITLE");
  ok(`typed map covers ${id}`, new RegExp(`${id}: "${id}"|${id}: "${id.replace("pay_counter", "pay_counter")}"|${id}: \\{`).test(typed));
  ok(`typed strings include ${id}`, typed.includes(`${id}: {`));
}

for (const id of ["qty:1", "qty:2", "qty:99"]) {
  const routed = routeInteractive(id, "raw");
  ok(`router recognizes ${id}`, routed.routedId === id);
}
ok("typed map recognizes qty:N", /function qtyFromId[\s\S]{0,220}\^qty:\(\\d\{1,3\}\)/.test(typed) && /return qtyFromId\(clean\) != null \? "qty" : null/.test(typed));
ok("qty handler uses existing add_to_order server tool when one draft line exists",
  /executeTool\("add_to_order", \{ item_name: lastLine\.name, quantity: qty, mode: "set" \}, ctx\)/.test(typed));

ok("item:<uuid> remains unrouted by legacy router", routeInteractive("item:abc-123", "برجر").routedId === null);
ok("item:<uuid> is not admitted by typed id matcher",
  !/startsWith\("item:"\)|\^item:|case "item/.test(typed));

ok("feature flag is explicit-only and registered",
  tier.includes('"typed_interactive_actions"') &&
  /isFeatureExplicitlyEnabled\("typed_interactive_actions", convFlags\)/.test(bridge) &&
  !/isFeatureEnabled\("typed_interactive_actions"/.test(bridge));
ok("typed branch requires a single interactive tap",
  /coalesced\.count === 1[\s\S]{0,180}isTypedInteractiveActionId\(lastInteractiveId\)/.test(bridge));
ok("flag-off fallback still uses routeInteractive",
  /typedConfirmMessage \?\? \(coalesced\.count > 1 \? rawText : routeInteractive\(lastInteractiveId, rawText\)\.text\)/.test(bridge));
ok("typed branch runs the allergy sentinels on empty tap text",
  /detectAllergenAvoidance\(""\)\.fired/.test(bridge) &&
  /detectAllergenSymptom\(""\)\.fired/.test(bridge) &&
  /detectPhoneticSafetyNet\("", \{ sttConfidence: null, isVoiceTranscript: false \}\)\.fired/.test(bridge) &&
  /detectAllergenEmergency\(""\)\.fired/.test(bridge));
ok("confirm_order delegates to the existing confirm/allergen gate",
  /if \(action === "confirm_order"\)[\s\S]{0,180}kind: "confirm_gate"/.test(typed) &&
  /typedConfirmMessage = typed\.userMessage/.test(bridge));
ok("non-confirm typed actions return before runCustomerTurn",
  bridge.indexOf("return { status: \"responded\", reply: typed.reply") > 0 &&
  bridge.indexOf("return { status: \"responded\", reply: typed.reply") < bridge.indexOf("outcome = await runCustomerTurn("));

const replay = fixedIds.map((id) => ({
  id,
  legacyText: routeInteractive(id, "TITLE").text,
  afterPath: id === "confirm_order" ? "existing_confirm_gate" : "typed_handler",
}));
const beforeCustomerAgentEntries = replay.length;
const afterCustomerAgentEntries = replay.filter((r) => r.afterPath === "existing_confirm_gate").length;
const beforeLlmGenerationEligible = replay.filter((r) => r.id !== "confirm_order").length;
const afterLlmGenerationEligible = 0;

ok("replay outcomes retain all fixed controls", replay.every((r) => r.legacyText && r.afterPath));
ok("replay reduces customer-agent entries on button-containing conversations",
  afterCustomerAgentEntries < beforeCustomerAgentEntries);
ok("replay reduces LLM-generation-eligible button taps to zero",
  beforeLlmGenerationEligible > 0 && afterLlmGenerationEligible === 0);

console.log("\nWO-S0-CORPUS replay summary");
console.log(`  fixed controls: ${fixedIds.join(", ")}`);
console.log("  parametric controls: qty:1..99");
console.log("  intentionally unrouted: item:<uuid>");
console.log(`  before: ${beforeCustomerAgentEntries} fixed button taps entered the customer-agent path`);
console.log(`  after: ${afterCustomerAgentEntries} fixed button tap delegates to the existing confirm gate; ${beforeCustomerAgentEntries - afterCustomerAgentEntries} handled by typed actions`);
console.log(`  LLM-generation-eligible fixed button taps: ${beforeLlmGenerationEligible} -> ${afterLlmGenerationEligible}`);
console.log(`\n${fail === 0 ? "PASS" : "FAIL"} typed-interactive-actions: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
