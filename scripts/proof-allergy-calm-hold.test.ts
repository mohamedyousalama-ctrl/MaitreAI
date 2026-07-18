// ============================================================================
// WO-CALM proof — deterministic allergy hold.
//
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-allergy-calm-hold.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { detectAllergenAvoidance } from "../lib/ai/allergen-gate.ts";
import { detectAllergenSymptom } from "../lib/ai/allergen-gate-symptoms.ts";
import { detectAllergenEmergency } from "../lib/ai/allergen-emergency.ts";
import { detectPhoneticSafetyNet } from "../lib/ai/phonetic-safety-net.ts";
import { scanBannedAllergyPhrases } from "../lib/ai/allergen-companion.ts";
import { calmHoldReply, calmHoldingReply, calmNewAllergyReply } from "../lib/ai/allergy-calm-hold.ts";
import { emergencyReply } from "../lib/ai/allergen-companion-flow.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗", name); } };

// A — Replay corpus: same or stricter detector outcomes, one fixed customer copy.
{
  const cases = [
    { text: "عندي حساسية من المكسرات", kind: "base" },
    { text: "من غير بندق عشان عندي حساسية", kind: "base" },
    { text: "بطني بتوجعني وبتحسس من اللبن", kind: "symptom" },
    { text: "حلقي بيتورم دلوقتي ومش عارف أتنفس", kind: "emergency" },
  ];
  for (const c of cases) {
    const fired =
      detectAllergenAvoidance(c.text).fired ||
      detectAllergenSymptom(c.text).fired ||
      detectAllergenEmergency(c.text).fired ||
      detectPhoneticSafetyNet(c.text).fired;
    ok(`A: corpus ${c.kind} fires deterministic safety detector`, fired);
  }
  ok("A: initial calm copy is the exact fixed template",
    calmHoldReply("egyptian") === "في حساسية هنا — مش هنكمل الطلب غير لما أتأكد من المطبخ، وهرجعلك على طول 🙏");
  ok("A: holding/new-allergy/emergency templates are banned-phrase clean",
    [calmHoldReply("egyptian"), calmHoldingReply("egyptian"), calmNewAllergyReply("egyptian"), emergencyReply("egyptian")]
      .every((t) => scanBannedAllergyPhrases(t).length === 0));
}

// B — notify_without_hold is structurally impossible on the calm flag branch.
{
  const ct = read("lib/ai/customer-turn.ts");
  const calmResult = ct.slice(ct.indexOf("function calmHoldResult"), ct.indexOf("async function enterCalmAllergyHold"));
  const calmBranch = ct.slice(ct.indexOf("} else if (calmHoldCandidate)"), ct.indexOf("} else if (combinedAllergenHit.fired && !companionOn)"));
  const holdFn = ct.slice(ct.indexOf("async function enterCalmAllergyHold"), ct.indexOf("/** WO-VOICE-QUALITY"));
  ok("B: allergy_calm_hold is explicitly gated",
    /const calmHoldOn = isFeatureExplicitlyEnabled\("allergy_calm_hold", tenantFeatures\);/.test(ct));
  ok("B: calm branch precedes the legacy forced notify_without_hold branch",
    ct.indexOf("} else if (calmHoldCandidate)") >= 0 &&
    ct.indexOf("} else if (calmHoldCandidate)") < ct.indexOf("} else if (combinedAllergenHit.fired && !companionOn)"));
  ok("B: calm result never emits notify_without_hold",
    calmResult.length > 0 && !/notify_without_hold/.test(calmResult));
  ok("B: calm branch never calls runRespond, so fewer customer messages and zero LLM calls",
    calmBranch.length > 0 && !/runRespond\(/.test(calmBranch));
  ok("B: SYSTEM_HOLD write happens before the critical alert",
    holdFn.indexOf('setOwnershipState(admin, args.conversationId, "SYSTEM_HOLD"') >= 0 &&
    holdFn.indexOf('setOwnershipState(admin, args.conversationId, "SYSTEM_HOLD"') < holdFn.indexOf("recordCriticalAlert(admin"));
}

// C — Held turns: detectors run first, new allergy appends, symptoms get emergency guidance, no Brain.
{
  const rs = read("lib/messaging/respond-and-send.ts");
  const fn = rs.slice(rs.indexOf("async function handleCalmHeldInbound"), rs.indexOf("/** Send the full web-menu link once"));
  ok("C: held helper is gated on allergy_calm_hold and safety-held state",
    /isFeatureExplicitlyEnabled\("allergy_calm_hold", features\)/.test(fn) && /isSafetyHeld\(\{ ownership_state: ownershipState/.test(fn));
  ok("C: held helper runs allergen, symptom, phonetic, emergency, and human detectors",
    /detectAllergenAvoidance\(messageText\)/.test(fn) &&
    /detectAllergenSymptom\(messageText\)/.test(fn) &&
    /detectPhoneticSafetyNet\(messageText/.test(fn) &&
    /detectAllergenEmergency\(messageText\)/.test(fn) &&
    /isExplicitHumanRequest\(messageText\)/.test(fn));
  ok("C: explicit human door is after detector declarations",
    fn.indexOf("const explicitHuman = isExplicitHumanRequest(messageText);") > fn.indexOf("const emergencyHit = detectAllergenEmergency(messageText);"));
  ok("C: new allergy appends the note and acknowledges by template",
    /mergeAllergyNote\(existingNote, noteTerms\)/.test(fn) && /calmNewAllergyReply\(dialect\)/.test(fn));
  ok("C: symptoms or emergency use the emergency-guidance template",
    /const emergency = emergencyHit\.fired \|\| symptomHit\.fired;/.test(fn) && /emergencyReply\(dialect\)/.test(fn));
  ok("C: held helper never calls runCustomerTurn",
    fn.length > 0 && !/runCustomerTurn\(/.test(fn));
}

// D — Style guard catches moralizing phrases.
{
  ok("D: سلامتك فوق كل حاجة is banned", scanBannedAllergyPhrases("سلامتك فوق كل حاجة عندنا").includes("سلامتك فوق كل حاجة"));
  ok("D: بضمير is banned", scanBannedAllergyPhrases("هنختار بضمير").includes("بضمير"));
  ok("D: أهم من أي بيع is banned", scanBannedAllergyPhrases("سلامتك أهم من أي بيع").includes("أهم من أي بيع"));
}

console.log(`\nWO-CALM PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
