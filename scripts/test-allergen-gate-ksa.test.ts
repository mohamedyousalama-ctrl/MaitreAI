// ============================================================================
// MaitreAI — KSA-dialect allergen-gate coverage eval (Najdi/Hijazi).
// Run: node --experimental-strip-types scripts/test-allergen-gate-ksa.test.ts
//
// This is the KSA-dialect EXTENSION of the allergen eval set required by the
// safety-dialect review (docs/KSA_ALLERGEN_DIALECT_REVIEW.md). It exercises the
// LOCKED deterministic base gate (lib/ai/allergen-gate.ts detectAllergenAvoidance)
// — the reviewed, safety-critical layer whose vocabulary can only change via the
// ratified path (reviewed PR + full eval rerun + PM sign-off).
//
// HONEST, CI-SAFE CONTRACT (so this can land BEFORE the vocab change is ratified):
//   • REGRESSION cases (currentlyCovered: true) — MUST fire. Hard fail if they don't.
//     This protects the KSA coverage the gate ALREADY has.
//   • NEGATIVE cases (expectFire: false) — MUST NOT fire. Hard fail if they do.
//   • GAP cases (currentlyCovered: false) — currently MISS on the base gate. They are
//     the PROPOSED new coverage. Reported as a coverage gap, NOT a hard fail by default,
//     so this file is green on today's LOCKED gate.
//
//   Once PM signs off and the proposed additions merge into allergen-gate.ts, run with
//   KSA_GATE_RATIFIED=1 to make the GAP cases BLOCKING — proving the gaps are closed and
//   nothing regressed. That is the CI flip that ratifies KSA go-live for this layer.
//
// `currentlyCovered` was set from an EXECUTED probe of the base gate (see the review
// doc). Some gaps are additionally mitigated in prod by the separate symptom-detector
// layer (allergen-gate-symptoms.ts), which has its OWN pending review — noted per-case
// but NOT relied on here, because this file audits the base LOCKED vocabulary.
// ============================================================================
import { detectAllergenAvoidance } from "../lib/ai/allergen-gate.ts";

interface KsaCase {
  text: string;
  expectFire: boolean;
  /** True = the LOCKED base gate already fires on this today (executed probe). */
  currentlyCovered: boolean;
  region: "najd" | "hijaz" | "eastern" | "all";
  category: string;
  /**
   * Which layer OWNS closing this gap:
   *  - "base"    → detectAllergenAvoidance (this review's ratified-path proposals).
   *               Under KSA_GATE_RATIFIED=1 these MUST be closed by the base gate.
   *  - "symptom" → the separate symptom-detector layer (allergen-gate-symptoms.ts),
   *               which has its OWN pending review. Routed there, tracked here as
   *               informational only — the base gate is not expected to close them.
   * Only meaningful for gap cases (currentlyCovered:false, expectFire:true).
   */
  targetLayer?: "base" | "symptom";
  /** Optional: mitigated by the separate symptom-detector layer today (reasoned). */
  symptomLayerMitigates?: boolean;
}

const CASES: KsaCase[] = [
  // ── explicit allergy word forms ──────────────────────────────────────────
  { text: "عندي حساسية من السمك", expectFire: true, currentlyCovered: true, region: "all", category: "explicit-حساسية" },
  { text: "حساسيتي من المكسرات", expectFire: true, currentlyCovered: true, region: "all", category: "explicit-حساسية" },
  { text: "عندي حساسيه من اللبن", expectFire: true, currentlyCovered: true, region: "all", category: "explicit-حساسية" },
  { text: "عندي حساسية القمح", expectFire: true, currentlyCovered: true, region: "all", category: "explicit-حساسية" },
  // GAP: adjective «حساس/حساسة/حساسين» (I am allergic) — /حساسي/ needs the «ية», misses «حساس».
  { text: "أنا حساس من الفول السوداني", expectFire: true, currentlyCovered: false, region: "all", category: "GAP:adjective-حساس", symptomLayerMitigates: false },
  { text: "أنا حساسة من البيض", expectFire: true, currentlyCovered: false, region: "all", category: "GAP:adjective-حساس", symptomLayerMitigates: false },
  // GAP: reaction verbs «أتحسس/يتحسس/يجيني تحسس» — no «حساسي» substring.
  { text: "أتحسس من الحليب", expectFire: true, currentlyCovered: false, region: "all", category: "GAP:verb-تحسس", symptomLayerMitigates: false },
  { text: "يجيني تحسس من الفستق", expectFire: true, currentlyCovered: false, region: "najd", category: "GAP:verb-تحسس", symptomLayerMitigates: false },
  // GAP: transliterated «ألرجيا / آلرجي / الرجي».
  { text: "ألرجيا من البيض", expectFire: true, currentlyCovered: false, region: "all", category: "GAP:translit-allergy", symptomLayerMitigates: false },
  { text: "عندي الرجي من الجلوتين", expectFire: true, currentlyCovered: false, region: "all", category: "GAP:translit-allergy", symptomLayerMitigates: false },

  // ── avoidance / can't-eat (Najdi/Hijazi negations) ───────────────────────
  { text: "ما أقدر آكل مكسرات", expectFire: true, currentlyCovered: true, region: "all", category: "cant-eat" },
  { text: "ما اقدر اكل سمسم", expectFire: true, currentlyCovered: true, region: "all", category: "cant-eat" },
  { text: "ما ينفع آكل قمح", expectFire: true, currentlyCovered: true, region: "all", category: "cant-eat" },
  { text: "ما أقدر آكل جوز أبداً", expectFire: true, currentlyCovered: true, region: "all", category: "cant-eat" },
  // GAP: Najdi «مو قادر» negation.
  { text: "مو قادر آكل جمبري", expectFire: true, currentlyCovered: false, region: "najd", category: "GAP:najdi-مو-قادر", symptomLayerMitigates: false },
  // GAP: Najdi «ما يصير / ما يجوز» (not permissible to eat).
  { text: "ما يصير آكل لبن", expectFire: true, currentlyCovered: false, region: "najd", category: "GAP:najdi-ما-يصير", symptomLayerMitigates: false },

  // ── harm verbs ────────────────────────────────────────────────────────────
  { text: "الفول السوداني يضرني", expectFire: true, currentlyCovered: true, region: "all", category: "harm-verb" },
  { text: "البيض يتعبني", expectFire: true, currentlyCovered: true, region: "all", category: "harm-verb" },
  // GAP: feminine subject harm «تأذيني/تضرني» (المكسرات = fem plural agreement).
  { text: "المكسرات تأذيني", expectFire: true, currentlyCovered: false, region: "all", category: "GAP:harm-تأذيني", symptomLayerMitigates: false },

  // ── symptom / reaction language (Najdi phrasing) — base gate has no symptom set
  { text: "يطلع لي حساسية من اللوز", expectFire: true, currentlyCovered: true, region: "najd", category: "symptom+حساسية" },
  { text: "يجيني حكة من السمسم", expectFire: true, currentlyCovered: false, region: "najd", category: "GAP:symptom-حكة", symptomLayerMitigates: true },
  { text: "وجهي ينتفخ لما آكل مكسرات", expectFire: true, currentlyCovered: false, region: "all", category: "GAP:symptom-swelling", symptomLayerMitigates: false },
  { text: "يطلع لي طفح من السمك", expectFire: true, currentlyCovered: false, region: "all", category: "GAP:symptom-rash", symptomLayerMitigates: true },
  { text: "ما أقدر أتنفس بعد ما آكل جمبري", expectFire: true, currentlyCovered: false, region: "all", category: "GAP:symptom-breath", symptomLayerMitigates: false },
  { text: "حلقي يضيق من البيض", expectFire: true, currentlyCovered: false, region: "all", category: "GAP:symptom-throat", symptomLayerMitigates: false },
  { text: "يجيني كتمة لما آكل قمح", expectFire: true, currentlyCovered: false, region: "all", category: "GAP:symptom-choking", symptomLayerMitigates: false },
  { text: "يجيني رد فعل من الطحينة", expectFire: true, currentlyCovered: false, region: "all", category: "GAP:reaction", symptomLayerMitigates: false },

  // ── named conditions (Najdi phrasing) ────────────────────────────────────
  { text: "ما أتحمل اللاكتوز", expectFire: true, currentlyCovered: false, region: "all", category: "GAP:condition-lactose", symptomLayerMitigates: false },
  { text: "عندي أنيميا الفول", expectFire: true, currentlyCovered: false, region: "all", category: "GAP:condition-favism", symptomLayerMitigates: true },

  // ── NEGATIVES — must NOT fire (positive intent, no avoidance) ─────────────
  { text: "أبغى صنف فيه مكسرات", expectFire: false, currentlyCovered: false, region: "all", category: "neg-wants-it" },
  { text: "أحب اللوز مره", expectFire: false, currentlyCovered: false, region: "najd", category: "neg-likes-it" },
  { text: "عطني كبسة بالمكسرات", expectFire: false, currentlyCovered: false, region: "najd", category: "neg-wants-it" },
];

const RATIFIED = process.env.KSA_GATE_RATIFIED === "1";

let pass = 0, fail = 0;
const regressionRows: string[] = [];
const gapRows: string[] = [];
const negRows: string[] = [];

for (const c of CASES) {
  const fired = detectAllergenAvoidance(c.text).fired;

  if (!c.expectFire) {
    // NEGATIVE — hard: must not fire.
    const good = fired === false;
    if (good) pass++; else { fail++; }
    negRows.push(`  ${good ? "✅" : "❌ FIRED (should not)"}  «${c.text}»`);
    continue;
  }

  if (c.currentlyCovered) {
    // REGRESSION — hard: must still fire.
    const good = fired === true;
    if (good) pass++; else { fail++; }
    regressionRows.push(`  ${good ? "✅" : "❌ REGRESSED (no longer fires)"}  [${c.region}] «${c.text}»`);
  } else {
    // GAP — proposed coverage. Which layer owns it?
    const layer: "base" | "symptom" =
      c.targetLayer ?? (/symptom|reaction|favism/.test(c.category) ? "symptom" : "base");
    const closed = fired === true;
    // Under ratification, only BASE-layer gaps are this review's responsibility to
    // close via detectAllergenAvoidance. SYMPTOM-layer gaps are routed to that
    // layer's own review and stay informational here.
    if (RATIFIED && layer === "base") { if (closed) pass++; else fail++; }
    const tag = layer === "symptom" ? " · (→ symptom-layer review)" : "";
    const mit = c.symptomLayerMitigates ? " · (symptom-layer mitigates today)" : "";
    const mark = closed ? "✅ CLOSED" : (RATIFIED && layer === "base") ? "❌ STILL OPEN" : "⚠️  GAP";
    gapRows.push(`  ${mark}  [${layer}] ${c.category}  [${c.region}] «${c.text}»${tag}${mit}`);
  }
}

const isSymptom = (c: KsaCase) =>
  (c.targetLayer ?? (/symptom|reaction|favism/.test(c.category) ? "symptom" : "base")) === "symptom";
const baseGaps = CASES.filter((c) => c.expectFire && !c.currentlyCovered && !isSymptom(c));
const symptomGaps = CASES.filter((c) => c.expectFire && !c.currentlyCovered && isSymptom(c));
const gapsClosed = gapRows.filter((r) => r.includes("CLOSED")).length;
const gapsTotal = CASES.filter((c) => c.expectFire && !c.currentlyCovered).length;

console.log("KSA-DIALECT ALLERGEN-GATE COVERAGE (base LOCKED gate: detectAllergenAvoidance)");
console.log(`Mode: ${RATIFIED ? "RATIFIED (gaps are BLOCKING)" : "PRE-RATIFICATION (gaps informational)"}\n`);
console.log("REGRESSION — already-covered KSA phrasings (must keep firing):");
console.log(regressionRows.join("\n"));
console.log("\nNEGATIVES — positive intent (must NOT fire):");
console.log(negRows.join("\n"));
console.log("\nGAPS — proposed new coverage (Najdi/Hijazi phrasings the base gate misses today):");
console.log(gapRows.join("\n"));
console.log(`\nGap ownership: ${baseGaps.length} base-gate proposals (this review's ratified path) · ${symptomGaps.length} symptom-layer (routed to that layer's review).`);
console.log(`Coverage: ${gapsClosed}/${gapsTotal} total gaps closed on the current base gate.`);
console.log(`KSA-ALLERGEN EVAL: ${pass} passed, ${fail} failed${RATIFIED ? "" : " (gaps not counted — pre-ratification)"}`);
process.exit(fail === 0 ? 0 : 1);
