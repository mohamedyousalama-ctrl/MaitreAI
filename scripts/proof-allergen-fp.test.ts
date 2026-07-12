// ============================================================================
// WO-ALLERGEN-FP — the live false-positive precision proof. RED-FIRST behaviorally:
// on origin/main the live message «ارسل لي المني ولو تكرمت» trips the phonetic net as
// a VOICE transcript with term «لوز» (almond) — no almond word is present. This file
// asserts it does NOT fire; that assertion is RED on the old matcher, GREEN after the
// affix-stem precision guard lands.
//
// Root cause: the phonetic net's affix-stripper reduced the common word «ولو»
// ("even if / please") → «لو», a 2-char stem that near-matched the 3-char allergen
// «لوز» at edit-distance 1. The fix refuses to fall back to a sub-MIN_NEAR_LEN stem —
// a genuine garbled disclosure always leaves a ≥3-char stem — so RECALL is preserved.
//
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-allergen-fp.test.ts
// ============================================================================

import { detectPhoneticSafetyNet, nearestSafetyTerm } from "../lib/ai/phonetic-safety-net.ts";
import { detectAllergenAvoidance, normalizeAr } from "../lib/ai/allergen-gate.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("  ✗", n); } };

// ══ LEG 1 — the LIVE false positive is GONE (typed AND voice) ═════════════════
{
  const live = "ارسل لي المني ولو تكرمت"; // "send me the menu please" — «المني» typo for «المنيو»
  ok("LEG1: live message does NOT trip the phonetic net — TYPED",
    detectPhoneticSafetyNet(live).fired === false);
  ok("LEG1: live message does NOT trip the phonetic net — VOICE transcript (was «لوز»)",
    detectPhoneticSafetyNet(live, { isVoiceTranscript: true }).fired === false);
  ok("LEG1: the base allergen gate never fired on it either", detectAllergenAvoidance(live).fired === false);
  // The specific culprit token no longer near-matches any allergen.
  ok("LEG1: «ولو» no longer near-matches «لوز» (or any safety term)",
    nearestSafetyTerm("ولو") === null);
}

// ══ LEG 2 — other common «و»/«ال»-prefixed short words stay clean (TYPED) ═════
// Precision is enforced on the TYPED path (a typed word is not an STT garble). The
// VOICE net is deliberately fail-closed (over-escalation acceptable, under- is not),
// so we do NOT claim voice-cleanliness for generic look-alikes — only that the
// specific affix-strip FP («ولو»→«لوز») is gone in BOTH modes (LEG1).
{
  const clean = [
    "ولو سمحت ابغى المني",        // «ولو» + menu typo — the live frame
    "ودي اطلب ولا يهمك",          // «ولا» common negation
    "المني حق الاطفال ولو تكرمت", // menu again, different frame
    "وش عندكم اليوم ولو ما عليك", // casual
  ];
  ok("LEG2: common «ولو/ولا»-bearing ordering turns do NOT trip (typed)",
    clean.every((m) => detectPhoneticSafetyNet(m).fired === false));
}

// ══ LEG 3 — RECALL PRESERVED: real (garbled) disclosures STILL fire ═══════════
{
  // A genuine garbled voice disclosure keeps a ≥3-char stem after affix strip → fires.
  ok("RECALL: «والمكسرات تأذيني» still fires (stripped stem «مكسرات» ≥ 3)",
    detectPhoneticSafetyNet("والمكسرات تأذيني", { isVoiceTranscript: true }).fired === true);
  ok("RECALL: a garbled «سودني» → «سوداني» still fires (voice)",
    detectPhoneticSafetyNet("سودني", { isVoiceTranscript: true }).fired === true);
  // Typed typo disclosure with intent still fires (the typed-scope path is unaffected).
  ok("RECALL: typed «بتعبني البيظ» (egg typo + intent) still fires",
    detectPhoneticSafetyNet("بتعبني البيظ").fired === true);
  // An EXACT allergy marker still fires (voice + typed).
  ok("RECALL: «عندي حساسيه» still fires (exact marker)",
    detectPhoneticSafetyNet("عندي حساسيه").fired === true);
  // A REAL almond mention is still caught by the base gate (unaffected by this fix).
  ok("RECALL: real almond «عندي حساسية من اللوز» still detected by the base gate",
    detectAllergenAvoidance("عندي حساسية من اللوز").fired === true &&
    detectAllergenAvoidance("عندي حساسية من اللوز").term === normalizeAr("لوز"));
  // And a real garbled almond «اللوز» itself still near-matches when actually present.
  ok("RECALL: the allergen «لوز» is still reachable when genuinely present",
    nearestSafetyTerm("لوز")?.term === normalizeAr("لوز"));
}

console.log(`\nWO-ALLERGEN-FP PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
