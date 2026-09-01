// ============================================================================
// PROOF — the phonetic near-miss net reaches no live path.
//
// Run: node --experimental-strip-types scripts/proof-phonetic-net-unwired.test.ts
//
// THE RULING. `detectPhoneticSafetyNet` fires on words that merely SOUND like an allergen —
// «كنافة بالجبن»→لبن, «موز»→لوز, «رز أبيض»→بيض — and each trip is a full safety hold. On the
// live demo it turned «هلا والله», a plain greeting, into an allergy consultation. The
// Founder ruled it out of every live path.
//
// WHY A PROOF AND NOT A DELETION. The module is sound and a future ruling may want it back,
// and stored `agent_runs` rows still name `phonetic_safety_net` as a hold source, so the
// name has to stay findable. That leaves the obvious hazard: a working, well-documented
// detector sitting in the tree, one import away from being re-wired by someone who reads its
// doctrine and not the ruling. This is what makes re-enabling it a deliberate act.
//
// The EXACT detectors are untouched and are asserted to still be wired, because "we removed
// the guessing" and "we removed the safety gate" are very different changes and only one of
// them was authorized.
// ============================================================================

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

let pass = 0;
const fails: string[] = [];
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; } else { fails.push(label); console.log(`  FAIL ${label}`); }
};

const ROOT = process.cwd();
const OWNER = "lib/ai/phonetic-safety-net.ts";

// Every source file in the product, walked — not a hand-listed set, because the whole point
// is to cover the file that does not exist yet.
const sources: string[] = [];
const walk = (dir: string) => {
  for (const e of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (["node_modules", ".next", ".git", ".claude", "scripts"].includes(e.name)) continue;
    const child = dir === "." ? e.name : `${dir}/${e.name}`;
    if (e.isDirectory()) walk(child);
    else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(e.name)) sources.push(child);
  }
};
for (const d of ["app", "lib", "components"]) if (existsSync(resolve(ROOT, d))) walk(d);

console.log("\n── THE SCAN IS REAL ────────────────────────────────────────────");
ok(`the walk found the product's sources (${sources.length})`, sources.length >= 100);
ok("…including the module itself", sources.includes(OWNER));

console.log("\n── AND NOTHING CALLS IT ────────────────────────────────────────");
{
  // THE DETECTOR, NOT THE FILE. `lib/ai/voice-aliases.ts` legitimately imports `levenshtein`,
  // `stripAffix` and `nearestSafetyTerm` from this module — string helpers that have nothing
  // to do with firing a safety hold. Banning the PATH would force those to move for no
  // reason; what must not come back is the one function that decides a hold.
  //
  // COMMENTS DO NOT COUNT. Several files now explain in prose why the net was removed, and a
  // scan that reads those as callers reports the removal as a failure — a guard that goes red
  // on its own documentation gets deleted by the next person, which is worse than no guard.
  const PATTERN = /detectPhoneticSafetyNet\s*\(|\bdetectPhoneticSafetyNet\b\s*[,}]/;
  const codeOf = (f: string) =>
    readFileSync(resolve(ROOT, f), "utf8")
      .split("\n")
      .filter((l) => {
        const t = l.trimStart();
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
      })
      .join("\n");

  const callers = sources.filter((f) => f !== OWNER && PATTERN.test(codeOf(f)));
  ok(`no live file calls or imports the detector${callers.length ? ` — ${callers.join(", ")}` : ""}`,
    callers.length === 0);

  // POSITIVE CONTROL. Without this, a typo in the pattern leaves the scan green and vacuous —
  // the failure mode this repo has now paid for several times over.
  for (const probe of [
    'import { detectPhoneticSafetyNet } from "@/lib/ai/phonetic-safety-net";',
    'import { detectPhoneticSafetyNet, other } from "./phonetic-safety-net";',
    "  phoneticSafetyNet: detectPhoneticSafetyNet(text, {}).fired,",
    "  const hit = detectPhoneticSafetyNet(t);",
  ]) {
    ok(`the scan still detects: ${probe.slice(0, 46)}…`, PATTERN.test(probe));
  }
  // …and does NOT fire on prose explaining the removal, or on the helper imports that stay.
  for (const benign of [
    "// The phonetic near-miss net was the third term here. Removed by Founder ruling.",
    "  source: \"allergen_gate\" | \"phonetic_safety_net\" | \"memory_allergy_gate\",",
    'import { levenshtein, stripAffix, nearestSafetyTerm } from "./phonetic-safety-net";',
  ]) {
    ok(`…and stays quiet on: ${benign.slice(0, 44)}…`, !PATTERN.test(benign));
  }
}

console.log("\n── THE EXACT DETECTORS ARE STILL WIRED ─────────────────────────");
{
  // "We removed the guessing" and "we removed the safety gate" are different changes, and
  // only one was authorized. A customer who says «عندي حساسية من المكسرات» in plain words
  // must still be heard — on the live WhatsApp path and on both demo routes.
  const mustStillDetect: Array<[string, string[]]> = [
    ["lib/messaging/respond-and-send.ts", ["detectAllergenAvoidance", "detectAllergenSymptom", "detectAllergenEmergency"]],
    ["lib/ai/customer-turn.ts", ["detectAllergenAvoidance", "detectAllergenSymptom", "detectAllergenEmergency"]],
    ["app/api/demo/voice/route.ts", ["detectAllergenAvoidance", "detectAllergenSymptom", "detectAllergenEmergency"]],
    ["app/api/demo/turn/route.ts", ["detectAllergenAvoidance", "detectAllergenSymptom", "detectAllergenEmergency"]],
    ["lib/ai/safety-bridge.ts", ["detectAllergenAvoidance", "detectAllergenSymptom", "detectAllergenEmergency"]],
  ];
  for (const [file, detectors] of mustStillDetect) {
    const src = existsSync(resolve(ROOT, file)) ? readFileSync(resolve(ROOT, file), "utf8") : "";
    ok(`${file} exists`, src.length > 0);
    for (const d of detectors) ok(`  …still runs ${d}`, src.includes(d));
  }

  // AND THE LEXICON IS UNTOUCHED. Narrowing the word list would be a different, unauthorized
  // way to reach the same "fewer holds" outcome, and it would be invisible.
  const gate = readFileSync(resolve(ROOT, "lib/ai/allergen-gate.ts"), "utf8");
  for (const term of ["لبن", "حليب", "مكسرات", "بيض", "قمح", "سمك", "صويا", "جلوتين"]) {
    ok(`the allergen lexicon still contains «${term}»`, gate.includes(term));
  }
}

console.log(`\n${fails.length ? "FAIL" : "PASS"} phonetic-net-unwired: ${pass}/${pass + fails.length} passed`);
if (fails.length) { for (const f of fails) console.log(`   ✗ ${f}`); process.exit(1); }
