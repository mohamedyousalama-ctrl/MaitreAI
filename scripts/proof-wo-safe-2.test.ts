// ============================================================================
// WO-SAFE-2 proof harness — the allergen BASE gate is UNCONDITIONAL in code.
// Child safety must not depend on a feature-flag row being present. Source
// assertions confirm: the base input gate + is_safety_hold write + output guard
// no longer depend on the flag; the symptom EXTENSION stays flagged; agent/suggest
// runs the gate; and the paid-webhook raises paid_while_safety_held on a held order.
//
// Run: node --experimental-strip-types scripts/proof-wo-safe-2.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

// ---- customer-turn: base gate + safety-hold write UNCONDITIONAL ------------
const turn = read("lib/ai/customer-turn.ts");
check("base gate runs unconditionally (no flag ternary on allergenHit)",
  /const allergenHit = detectAllergenAvoidance\(input\.userMessage\);/.test(turn));
check("no allergenSafetyOn gating remains", !turn.includes("allergenSafetyOn"));
check("symptom EXTENSION stays flagged", /symptomDetectionOn = isFeatureExplicitlyEnabled\("allergen_symptom_detection", tenantFeatures\)/.test(turn));
// WO-SAFETY-MODEL-V3 (SINGLE DOOR): the AUTOMATIC is_safety_hold=true write is GONE — a
// transfer happens only on an explicit human request and lands HUMAN_ACTIVE with
// is_safety_hold:false. Child safety is now carried UNCONDITIONALLY by the notify-without-
// hold alert (recordCriticalAlert), still never flag-gated.
check("V3 single door: transfer sets is_safety_hold:false unflagged; safety NOTIFY is unconditional",
  /is_safety_hold: false,/.test(turn) && !/if \(allergenSafetyOn\)/.test(turn) && /recordCriticalAlert\(admin, \{/.test(turn));

// ---- respond: OUTPUT guard UNCONDITIONAL -----------------------------------
const respond = read("lib/ai/respond.ts");
check("output guard no longer flag-gated (no brain.deterministicAllergenSafety in the guard)",
  /if \(text\.trim\(\) && assertsAllergenSafety\(text\)\)/.test(respond));

// ---- agent/suggest: base gate present, safety draft not reassurance --------
const suggest = read("app/api/agent/suggest/route.ts");
check("(suggest) runs the deterministic base gate", suggest.includes("detectAllergenAvoidance(userMessage)"));
check("(suggest) a hit returns an ESCALATE safety draft (never reassurance)",
  /if \(hit\.fired\)[\s\S]*escalate: true[\s\S]*deterministic_allergen_gate/.test(suggest));

// ---- webhook: paid_while_safety_held alert ---------------------------------
const webhook = read("lib/payments/moyasar-webhook.ts");
check("(webhook) checks safety hold on a paid flip", webhook.includes("checkOrderSafetyHold(admin, restaurantId, session.order_id)"));
check("(webhook) raises paid_while_safety_held alert (money not blocked)",
  /type: "paid_while_safety_held"/.test(webhook) && webhook.includes("if (hold.held)"));

console.log(`\nWO-SAFE-2 PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
