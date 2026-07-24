// ============================================================================
// WO-EVIDENCE-1 — the corpus RUNNER. Drives every corpus case through the CURRENT
// deterministic ingress detector and reports which pass and which the detector
// MISSES. It reports; it does not fix, tune, or assert-fail. Misses are findings.
//
// Detector under test (read-only imports; not modified): the composed ingress signal
// `detectAllergyOrDiseaseMention` (allergen avoidance ∪ symptom ∪ phonetic safety
// net) — the same call the ingress path uses (lib/ai/customer-turn.ts) — plus the
// individual detectors reported for granularity. Symptom detection is ON in the
// committed Wesaya production flag vector (allergen_symptom_detection: true), and
// detectAllergyOrDiseaseMention runs it unconditionally, so this reflects production.
//
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/proof-detector-corpus.ts
// ============================================================================

// Extensionless imports: this is a non-.test.ts file so tsc includes it (tsc resolves
// the .ts); the ts-ext-loader adds the .ts extension at Node runtime.
import { ALLERGEN_DETECTOR_CORPUS, CORPUS_CATEGORIES, type CorpusCase, type CorpusCategory } from "./fixtures/allergen-detector-corpus";
import { detectAllergenAvoidance } from "../lib/ai/allergen-gate";
import { detectAllergenSymptom } from "../lib/ai/allergen-gate-symptoms";
import { detectAllergyOrDiseaseMention, detectAllergyRetraction } from "../lib/ai/allergy-simple";
import { detectAllergenEmergency } from "../lib/ai/allergen-emergency";
import { detectPhoneticSafetyNet } from "../lib/ai/phonetic-safety-net";

interface Result {
  c: CorpusCase;
  mentionFired: boolean; // the composed ingress signal (avoidance ∪ symptom ∪ phonetic)
  avoidance: boolean;
  symptom: boolean;
  phonetic: boolean;
  emergency: boolean;
  retraction: boolean;
  outcome: "PASS" | "MISS" | "RECORD"; // MISS = detector disagrees with the safety-correct expectation
}

function run(c: CorpusCase): Result {
  const opts = c.isVoiceTranscript ? { isVoiceTranscript: true } : undefined;
  const mentionFired = detectAllergyOrDiseaseMention(c.text, opts).fired;
  const avoidance = detectAllergenAvoidance(c.text).fired;
  const symptom = detectAllergenSymptom(c.text).fired;
  const phonetic = detectPhoneticSafetyNet(c.text, c.isVoiceTranscript ? { isVoiceTranscript: true } : {}).fired;
  const emergency = detectAllergenEmergency(c.text).fired;
  const retraction = detectAllergyRetraction(c.text);
  let outcome: Result["outcome"];
  if (c.expect === "record_only") outcome = "RECORD";
  else if (c.expect === "signal") outcome = mentionFired ? "PASS" : "MISS";
  else outcome = mentionFired ? "MISS" : "PASS"; // no_signal
  return { c, mentionFired, avoidance, symptom, phonetic, emergency, retraction, outcome };
}

const results = ALLERGEN_DETECTOR_CORPUS.map(run);
const flags = (r: Result) =>
  [r.avoidance && "avoid", r.symptom && "symptom", r.phonetic && "phonetic", r.emergency && "emerg", r.retraction && "retract"].filter(Boolean).join("+") || "none-fired";

console.log("================ ALLERGEN DETECTOR CORPUS — RESULTS ================\n");

// Per-category summary.
console.log("Category                total  pass  MISS  record");
console.log("------------------------------------------------------------");
let tTotal = 0, tPass = 0, tMiss = 0, tRecord = 0;
for (const cat of CORPUS_CATEGORIES) {
  const rs = results.filter((r) => r.c.category === cat);
  const pass = rs.filter((r) => r.outcome === "PASS").length;
  const miss = rs.filter((r) => r.outcome === "MISS").length;
  const rec = rs.filter((r) => r.outcome === "RECORD").length;
  tTotal += rs.length; tPass += pass; tMiss += miss; tRecord += rec;
  console.log(`${cat.padEnd(22)}  ${String(rs.length).padStart(4)}  ${String(pass).padStart(4)}  ${String(miss).padStart(4)}  ${String(rec).padStart(5)}`);
}
console.log("------------------------------------------------------------");
console.log(`${"TOTAL".padEnd(22)}  ${String(tTotal).padStart(4)}  ${String(tPass).padStart(4)}  ${String(tMiss).padStart(4)}  ${String(tRecord).padStart(5)}`);

// Every MISS, grouped by category, exact text preserved.
console.log("\n================ MISSES (findings — exact text preserved) ================");
let anyMiss = false;
for (const cat of CORPUS_CATEGORIES) {
  const misses = results.filter((r) => r.c.category === cat && r.outcome === "MISS");
  if (misses.length === 0) continue;
  anyMiss = true;
  console.log(`\n[${cat}] — ${misses.length} miss(es):`);
  for (const r of misses) {
    const kind = r.c.expect === "signal" ? "SILENT (expected a signal, detector fired NONE)" : "FALSE POSITIVE (expected no signal, detector fired)";
    console.log(`  • ${r.c.id}: «${r.c.text}»`);
    console.log(`      ${kind}`);
    console.log(`      allergen: ${r.c.allergen ?? "—"} · detectors: ${flags(r)} · why hard: ${r.c.whyHard}${r.c.nativeReview ? " · [NATIVE-REVIEW]" : ""}`);
  }
}
if (!anyMiss) console.log("\n(no misses — but an adversarial corpus that passes completely is probably not adversarial enough)");

// Record-only cases: report the detector's behaviour without judging it.
console.log("\n================ RECORD-ONLY (negation/retraction — reported, not judged) ================");
for (const r of results.filter((x) => x.outcome === "RECORD")) {
  console.log(`  • ${r.c.id}: «${r.c.text}»`);
  console.log(`      mention.fired=${r.mentionFired} · retraction=${r.retraction} · detectors: ${flags(r)}${r.c.nativeReview ? " · [NATIVE-REVIEW]" : ""}`);
}

// Cases flagged for native-speaker review.
const nr = results.filter((r) => r.c.nativeReview);
console.log(`\n================ FLAGGED FOR NATIVE-SPEAKER REVIEW (${nr.length}) ================`);
for (const r of nr) console.log(`  • ${r.c.id} [${r.c.category}]: «${r.c.text}» — ${r.c.whyHard}`);

const misses = results.filter((r) => r.outcome === "MISS").length;
console.log(`\n================ SUMMARY ================`);
console.log(`total=${tTotal} pass=${tPass} MISS=${misses} record=${tRecord} nativeReview=${nr.length}`);
console.log("Misses are findings for the PM and auditor. The detector was NOT modified.");
