// ============================================================================
// WO-VOICE-1 — fail-closed phonetic safety net, blocking CI gate.
// Consumes #338's eval set (scripts/voice/khalid-voice-eval-set.json) as the source
// of truth. Deterministic + offline (NO OpenAI key, NO spend): it tests the phonetic
// NET on the annotated utterances + the ratified garble map, not a live STT call.
//
// Asserts:
//   1. RECALL — every mustFlag STT item fires the net (safety-positive).
//   2. CONTROL — the clean order (STT-20) does NOT fire; STT-19 over-flag tolerated.
//   3. GARBLE  — curated garbled allergy transcripts (marker+noun garbles from the
//      ratified phoneticNearExamples) still fire — the fail-closed value.
//   4. COVERAGE — the phoneticNearExamples garble→base map is near-matched at/above
//      a floor (documented intentional non-matches: real words like «لبنان»).
//   5. DRIFT   — the module lexicon ⊇ the eval set's stt.safetyLexicon (no silent
//      divergence between prod code and the ratified vocabulary).
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  detectPhoneticSafetyNet,
  nearestSafetyTerm,
  SAFETY_LEXICON,
} from "../lib/ai/phonetic-safety-net.ts";
import { normalizeAr } from "../lib/ai/allergen-gate.ts";

const here = dirname(fileURLToPath(import.meta.url));
const evalSet = JSON.parse(
  readFileSync(join(here, "voice", "khalid-voice-eval-set.json"), "utf8")
) as {
  stt: {
    items: Array<{ id: string; spoken: string; mustFlag?: boolean; acceptableFlag?: boolean; safetyTerms: string[] }>;
    safetyLexicon: Record<string, string[] | string>;
  };
  failClosedThreshold: { phoneticNearExamples: Record<string, string[]> };
};

let passed = 0;
let failed = 0;
const fail = (msg: string) => { failed++; console.error("  ✗ " + msg); };
const ok = (msg: string) => { passed++; if (process.env.VERBOSE) console.log("  ✓ " + msg); };

// --- 1. RECALL: every mustFlag item fires -----------------------------------
for (const it of evalSet.stt.items) {
  if (!it.mustFlag) continue;
  const hit = detectPhoneticSafetyNet(it.spoken);
  if (hit.fired) ok(`${it.id} fires (reason=${hit.reason}, term=${hit.term})`);
  else fail(`${it.id} MUST flag but net did not fire — "${it.spoken}" [terms: ${it.safetyTerms.join(", ")}]`);
}

// --- 2. CONTROL: clean order must NOT fire; STT-19 over-flag tolerated -------
for (const it of evalSet.stt.items) {
  if (it.mustFlag) continue;
  const hit = detectPhoneticSafetyNet(it.spoken);
  if (it.acceptableFlag) {
    ok(`${it.id} over-flag tolerated (fired=${hit.fired})`);
  } else if (!hit.fired) {
    ok(`${it.id} clean control does not fire`);
  } else {
    fail(`${it.id} FALSE POSITIVE — clean control fired (reason=${hit.reason}, term=${hit.term}) — "${it.spoken}"`);
  }
}

// --- 3. GARBLE: curated garbled allergy transcripts still fire ---------------
// Built from the ratified phoneticNearExamples: a garbled marker and/or a garbled
// allergen noun in a realistic carrier. These are the cases the exact gate MISSES.
const GARBLED_TRANSCRIPTS = [
  "عندي حساسي من المقسرات",        // marker garble (حساسي) + noun garble (مقسرات→مكسرات)
  "انا حساسه من الفسدق",           // noun garble فسدق→فستق
  "ودي اكل بس عندي حساسيه من البيظ", // noun garble بيظ→بيض
  "ما ابي غلوتين ابدا",            // noun garble غلوتين→جلوتين (bare garbled allergen, rule B-i)
  "يطلع لي طفح لما اكل سمق",       // symptom طفح + noun garble سمق→سمك
  // WO-KHALID (Saudi-behavior audit Part B) — added Saudi confusion pairs that fire today:
  "ما ابي بلوتين ابدا",            // noun garble بلوتين→جلوتين (audit pair; rule B-i)
  "ابي اكل بس ما ابي النبن",       // noun garble النبن→لبن (audit pair; bare garbled allergen, no marker)
];
for (const t of GARBLED_TRANSCRIPTS) {
  const hit = detectPhoneticSafetyNet(t);
  if (hit.fired) ok(`garble fires: "${t}" (reason=${hit.reason})`);
  else fail(`GARBLE MISS — fail-closed net did not fire on "${t}"`);
}

// --- 4. COVERAGE: phoneticNearExamples near-match floor ----------------------
// Intentional non-matches: real words that happen to be edit-near a short safety
// term (e.g. «لبنان» the country vs «لبن»). Catching these would raise the live
// false-positive rate — excluded by design, tuned via the ratified path if needed.
const INTENTIONAL_NONMATCH = new Set(["لبنان"].map(normalizeAr));
let covHit = 0, covTot = 0;
const covMisses: string[] = [];
for (const [base, garbles] of Object.entries(evalSet.failClosedThreshold.phoneticNearExamples)) {
  for (const g of garbles) {
    const gn = normalizeAr(g);
    if (INTENTIONAL_NONMATCH.has(gn)) continue;
    covTot++;
    // a garble "covers" if it either equals the base (post-normalize) or near-matches
    // some safety term, or fires inside a neutral food carrier.
    const near = nearestSafetyTerm(g);
    const inCarrier = detectPhoneticSafetyNet(`ابي اكل ${g} بس`);
    if (near || inCarrier.fired || gn === normalizeAr(base)) covHit++;
    else covMisses.push(`${g}→${base}`);
  }
}
const coverage = covTot ? covHit / covTot : 1;
const COVERAGE_FLOOR = 0.9;
if (coverage >= COVERAGE_FLOOR) ok(`phonetic coverage ${(coverage * 100).toFixed(1)}% (${covHit}/${covTot}) ≥ floor`);
else fail(`phonetic coverage ${(coverage * 100).toFixed(1)}% (${covHit}/${covTot}) < ${COVERAGE_FLOOR * 100}% — misses: ${covMisses.join(", ")}`);

// --- 5. DRIFT: module lexicon ⊇ eval safetyLexicon --------------------------
const lex = new Set(SAFETY_LEXICON.map(normalizeAr));
const missingFromModule: string[] = [];
for (const [group, terms] of Object.entries(evalSet.stt.safetyLexicon)) {
  if (!Array.isArray(terms)) continue; // skip the "note" string
  for (const term of terms) {
    const tn = normalizeAr(term);
    // a lexicon term is "covered" if it (or a normalized form) is in the module set,
    // or the net fires on it directly (phrases / near forms).
    if (lex.has(tn) || detectPhoneticSafetyNet(term).fired || [...lex].some((l) => tn.includes(l) || l.includes(tn))) continue;
    missingFromModule.push(`${group}:${term}`);
  }
}
if (missingFromModule.length === 0) ok("module lexicon ⊇ eval safetyLexicon (no drift)");
else fail(`module lexicon MISSING eval terms: ${missingFromModule.join(", ")}`);

// --- summary ----------------------------------------------------------------
console.log(`\nVOICE SAFETY NET PROOF: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
