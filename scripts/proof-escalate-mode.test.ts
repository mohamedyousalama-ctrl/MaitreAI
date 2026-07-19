// ============================================================================
// WO escalate-mode proof — founder "escalate-always" posture.
//
// PART A: the repeating HOLD reply rotates across THREE deterministic templates
//   by hold count (cycles repeat); T3 renders the branch phone when present and
//   omits the direct-contact line cleanly when absent; no template promises an
//   immediate HUMAN reply or states opening hours.
// PART B: the UNCONDITIONAL output floor now also blocks disease/diet suitability
//   claims (replaced with the careful line); allergen-safety claims still blocked
//   (regression); normal replies untouched.
//
// Run: node --conditions=react-server --import ./scripts/prompt-snapshot-loader.mjs \
//        --experimental-strip-types scripts/proof-escalate-mode.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { calmHoldReply, calmHoldingReply, calmNewAllergyReply } from "../lib/ai/allergy-calm-hold.ts";
import { scanBannedAllergyPhrases } from "../lib/ai/allergen-companion.ts";
import { assertsDiseaseDietClaim, diseaseDietCarefulLine } from "../lib/ai/disease-diet-guard.ts";
import { assertsAllergenSafety } from "../lib/ai/allergen-gate.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗", name); } };

const CAREFUL_LINE = "في مواضيع الصحة والحساسية بنفضّل حد من الفريق يأكدلك بنفسه 🙏 أحوّلك لحد من الفريق؟";
const DIRECT_LINE = "لو حابب تتواصل مباشرة:";

// ── PART A — three rotating deterministic hold templates ─────────────────────
{
  const T1 = calmHoldingReply("egyptian", 0, null);
  const T2 = calmHoldingReply("egyptian", 1, null);
  const T3 = calmHoldingReply("egyptian", 2, null);

  // 1–3: three DISTINCT templates for counts 0,1,2.
  ok("A1: count 0 → T1", T1.startsWith("تمام يا فندم"));
  ok("A2: count 1 → T2", T2.startsWith("لسه محوّل طلبك"));
  ok("A3: count 2 → T3", T3.startsWith("طلبك محفوظ"));
  ok("A: the three templates are all distinct", T1 !== T2 && T2 !== T3 && T1 !== T3);

  // 4–6: the cycle repeats deterministically (3→T1, 4→T2, 5→T3) — same string each time.
  ok("A4: count 3 → T1 (cycle repeats)", calmHoldingReply("egyptian", 3, null) === T1);
  ok("A5: count 4 → T2 (cycle repeats)", calmHoldingReply("egyptian", 4, null) === T2);
  ok("A6: count 6 → T1 (two full cycles)", calmHoldingReply("egyptian", 6, null) === T1);

  // Determinism: identical inputs → byte-identical outputs across repeated calls.
  ok("A: deterministic — repeated calls with same count are identical",
    calmHoldingReply("egyptian", 1, null) === calmHoldingReply("egyptian", 1, null) &&
    calmHoldingReply("saudi", 5, "0100") === calmHoldingReply("saudi", 5, "0100"));

  // 7: phone present → T3 includes the direct-contact line AND the number.
  const T3phone = calmHoldingReply("egyptian", 2, "0100 123 4567");
  ok("A7: phone present → T3 includes the direct-contact line + number",
    T3phone.includes(DIRECT_LINE) && T3phone.includes("0100 123 4567"));

  // 8: phone absent → the direct-contact sentence is omitted cleanly (no leak).
  ok("A8: phone absent (null) → direct-contact sentence omitted, no placeholder leak",
    !T3.includes(DIRECT_LINE) && !T3.includes("{BRANCH_PHONE}") && !T3.includes("{"));
  const T3empty = calmHoldingReply("egyptian", 2, "   ");
  ok("A8b: phone blank/whitespace → treated as absent, sentence omitted",
    !T3empty.includes(DIRECT_LINE) && T3empty === T3);

  const all = [T1, T2, T3, T3phone];
  // 9: no template contains the old false-immediacy phrase «على طول».
  ok("A9: no template contains «على طول»", all.every((t) => !t.includes("على طول")));

  // 10: no template states opening hours (no clock digits + ص/م, no «الساعة»/«مفتوحين»).
  ok("A10: no template states opening hours",
    all.every((t) => !/الساعه|الساعة|مفتوحين|من \d|بنقفل|بنفتح/.test(t)));

  // 11: any «فورًا» immediacy about the HUMAN reply is CONDITIONAL on availability
  //     («أول ما ... متاح»), never an unconditional promise of an instant reply.
  ok("A11: «فورًا» about human reply is guarded by «أول ما ... متاح» (conditional, not a promise)",
    all.every((t) => !t.includes("فورًا") || (t.includes("أول ما") && t.includes("متاح"))));

  // 12: the three templates are §0 banned-phrase clean.
  ok("A12: T1/T2/T3 are banned-phrase clean",
    all.every((t) => scanBannedAllergyPhrases(t).length === 0));

  // Regression: start + new-allergy templates are UNCHANGED (pinned exact strings).
  ok("A: start template unchanged (logic-untouched)",
    calmHoldReply("egyptian") === "في حساسية هنا — مش هنكمل الطلب غير لما أتأكد من المطبخ، وهرجعلك على طول 🙏");
  ok("A: new-allergy template still renders (unchanged)",
    calmNewAllergyReply("egyptian").startsWith("أضفت ملاحظة الحساسية"));
}

// ── PART B — disease/diet no-reassure output floor ──────────────────────────
{
  // 13–17 (+more): disease/diet suitability claims are DETECTED (→ will be replaced).
  const diseaseClaims = [
    "الطبق ده مناسب لمرضى السكري",
    "ده صحي لمرضى الضغط",
    "الأكل ده ينفع لمريض السكر",
    "ده دايت خالص متخافش",
    "الحلو ده خالي من السكر تمامًا",
    "مفيهوش سكر خالص",
    "الأكل مناسب للضغط والكوليسترول",
    "لو عندك سكر عادي كله تمام",
  ];
  for (const c of diseaseClaims) {
    ok(`B: disease/diet claim detected → «${c.slice(0, 18)}…»`, assertsDiseaseDietClaim(c) === true);
  }

  // Allergen-safety claims still blocked (regression — the extension ADDS, never removes).
  ok("B: allergen-safety claim still detected (regression) — «آمن»",
    assertsAllergenSafety("الصنف ده آمن من ناحية الحساسية") === true);
  ok("B: allergen-safety claim still detected (regression) — «مفيهوش بندق»",
    assertsAllergenSafety("الأكل ده مفيهوش بندق خالص") === true);

  // Normal replies are UNTOUCHED by both floors (no false positive).
  const normal = [
    "تمام هجهزلك الطلب حالًا",
    "السعر مناسب جدًا للوجبة دي",
    "عايز بيتزا كبيرة ولا وسط؟",
    "أضفت البيتزا للطلب، تحب تزود مشروب؟",
  ];
  for (const c of normal) {
    ok(`B: normal reply untouched — «${c.slice(0, 16)}…»`,
      assertsDiseaseDietClaim(c) === false && assertsAllergenSafety(c) === false);
  }

  // The careful replacement line renders correctly, is banned-clean, and does NOT
  // itself re-trigger either floor (no infinite replace).
  ok("B: careful replacement line renders exactly", diseaseDietCarefulLine("egyptian") === CAREFUL_LINE);
  ok("B: careful line is banned-phrase clean", scanBannedAllergyPhrases(CAREFUL_LINE).length === 0);
  ok("B: careful line does not re-trigger disease/diet or allergen floors",
    assertsDiseaseDietClaim(CAREFUL_LINE) === false && assertsAllergenSafety(CAREFUL_LINE) === false);
}

// ── WIRING — the disease/diet floor is UNCONDITIONAL in respond.ts ──────────
{
  const rs = read("lib/ai/respond.ts");
  const guardIdx = rs.indexOf("assertsDiseaseDietClaim(text)");
  ok("W: respond.ts imports the disease/diet guard",
    /import \{ assertsDiseaseDietClaim, diseaseDietCarefulLine \} from ".\/disease-diet-guard";/.test(rs));
  ok("W: respond.ts blocks the claim and replaces with the careful line",
    guardIdx > 0 && rs.indexOf("text = diseaseDietCarefulLine(input.brain.dialect);") > guardIdx);
  ok("W: the disease/diet floor is UNCONDITIONAL (guarded only by text presence, no flag)",
    /if \(text\.trim\(\) && assertsDiseaseDietClaim\(text\)\) \{/.test(rs));
  // Regression: the allergen-safety guard is still present and unconditional.
  ok("W: allergen-safety output guard still present (regression)",
    /if \(text\.trim\(\) && assertsAllergenSafety\(text\)\) \{/.test(rs));

  // The caller rotates by hold count and passes the branch phone (text-only wiring).
  const send = read("lib/messaging/respond-and-send.ts");
  ok("W: caller rotates the hold reply by prior hold count + branch phone",
    /calmHoldingReply\(dialect, priorHoldCount \?\? 0, branchPhone\)/.test(send));
  ok("W: caller reads the restaurant's stored display phone",
    /\.from\("restaurants"\)[\s\S]*?\.select\("phone"\)/.test(send));
}

console.log(`\nWO ESCALATE-MODE PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
