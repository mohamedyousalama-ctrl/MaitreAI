// ============================================================================
// WO-EMERGENCY-OVERRIDE — an ACTIVE medical emergency escalates on every allergy
// posture, not just two of them.
//
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-emergency-override.test.ts
//
// THE DEFECT THIS PINS
// --------------------
// customer-turn.ts dispatches allergy handling through one else-if chain. Only two
// branches handled an active emergency — `calmHoldCandidate` and `enterCompanion` —
// and BOTH require `!allergySimpleOn`. The simple-allergy deflection sat ABOVE them
// and never checked for an emergency.
//
// So on a tenant running `allergy_simple`, «حلقي يتورم» ("my throat is swelling")
// was answered with the menu-pointer deflection: escalate false, no hold, no staff
// alert. The emergency handling existed one branch below and was unreachable.
//
// Worse, `safetyEmergencyHit` was itself gated on `(companionOn || calmHoldOn)`, so
// on that tenant the emergency was never even DETECTED.
//
// THE ORDERING IS THE DEFECT. An else-if chain dispatches the first match, so a
// branch that sits below the deflection cannot fire when the deflection matches.
// That is why this file asserts POSITION and not merely presence: a test that only
// checked "an emergency branch exists" passed throughout the entire life of the bug.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { detectAllergenEmergency } from "../lib/ai/allergen-emergency.ts";

const ROOT = process.cwd();
let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok  ${label}`); }
  else { fail++; console.log(`  ✗   ${label}`); }
};

// Statements only — the prose above documents the very ordering it bans, and a raw
// text scan would match its own explanation.
const src = readFileSync(resolve(ROOT, "lib/ai/customer-turn.ts"), "utf8")
  .split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");

// ── 1. the detector genuinely fires on a real emergency ────────────────────
// Behaviour, not wiring: if these stop firing the override is armed on nothing.
ok("«حلقي يتورم» (throat swelling) is detected as an active emergency",
  detectAllergenEmergency("حلقي يتورم").fired === true);
ok("«ما اقدر اتنفس» (can't breathe) is detected", detectAllergenEmergency("ما اقدر اتنفس").fired === true);
ok("English «anaphylaxis» is detected", detectAllergenEmergency("anaphylaxis").fired === true);
ok("an ordinary allergy mention is NOT an emergency (the override must not swallow normal flow)",
  detectAllergenEmergency("عندي حساسية من المكسرات").fired === false);
ok("empty input is not an emergency", detectAllergenEmergency("").fired === false);

// ── 2. detection is ungated ────────────────────────────────────────────────
// It used to read `(companionOn || calmHoldOn) ? detect(...) : {fired:false}`, so a
// simple-posture tenant could not detect an emergency at all.
const hitAssign = /const safetyEmergencyHit\s*=\s*([^;]+);/.exec(src)?.[1] ?? "";
ok("safetyEmergencyHit is computed unconditionally, not behind a posture flag",
  /detectAllergenEmergency\(/.test(hitAssign) && !/companionOn|calmHoldOn|allergySimpleOn|\?/.test(hitAssign));

// ── 3. THE ORDERING — the actual invariant ─────────────────────────────────
const posEmergency = src.indexOf("} else if (safetyEmergencyHit.fired) {");
const posDeflect   = src.indexOf("} else if (allergySimpleDeflect && allergySimpleDecision) {");
const posCalmHold  = src.indexOf("} else if (calmHoldCandidate) {");
const posCompanion = src.indexOf("} else if (enterCompanion) {");

ok("an unconditional emergency branch exists in the dispatch chain", posEmergency > 0);
ok("the simple-allergy deflection branch still exists", posDeflect > 0);
ok("THE FIX: the emergency branch is dispatched BEFORE the simple-allergy deflection",
  posEmergency > 0 && posDeflect > 0 && posEmergency < posDeflect);
ok("the emergency branch also precedes calm-hold and companion (it wins on every posture)",
  posEmergency > 0 && posEmergency < posCalmHold && posEmergency < posCompanion);

// ── 4. it routes to the ratified emergency behaviour ───────────────────────
// WO-SAFETY-MODEL-V3 §5: no hold, urgent guidance, LOUD staff alert. Freezing the
// thread during a medical emergency produces silence, which was judged worse.
const branch = posEmergency > 0 ? src.slice(posEmergency, posDeflect) : "";
ok("the emergency branch produces companionEmergencyResult (the ratified handler)",
  /companionEmergencyResult\(/.test(branch));
ok("the emergency branch does NOT fall through to the menu deflection",
  !/allergySimpleDeflectionResult\(/.test(branch));

// ── 5. the alert the branch depends on still exists ────────────────────────
// companionEmergencyResult must keep emitting a staff alert; without it the override
// escalates into silence, which is the outcome it exists to prevent.
const handler = /function companionEmergencyResult\([\s\S]*?\n}/.exec(src)?.[0] ?? "";
ok("companionEmergencyResult still emits a notify_without_hold staff alert",
  /notify_without_hold/.test(handler));
ok("companionEmergencyResult still does not freeze the thread (escalate: false, per §5)",
  /escalate:\s*false/.test(handler));

console.log(`\nEMERGENCY-OVERRIDE PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
