// Unit tests for the §0 banned-phrase scan + §1b two-axis truth model (pure).
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/test-allergen-companion.test.ts
import { scanBannedAllergyPhrases, hasBannedAllergyPhrase, computeDishTruthState } from "../lib/ai/allergen-companion.ts";
let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// ── §0 banned-phrase scan — MUST catch every banned phrase ──
ok("آمن", hasBannedAllergyPhrase("الأكل ده آمن عليك"));
ok("مضمون", hasBannedAllergyPhrase("مضمون مفيهوش مكسرات"));
ok("عادي", hasBannedAllergyPhrase("كله عادي كُل براحتك"));
ok("ما عليك", hasBannedAllergyPhrase("ما عليك، الطبق ده تمام"));
ok("ما يضرك", hasBannedAllergyPhrase("ده ما يضرك أبداً"));
ok("خالي تماماً", hasBannedAllergyPhrase("خالي تماماً من البيض"));
ok("بدون أي تلامس", hasBannedAllergyPhrase("متحضّر بدون أي تلامس"));
ok("يناسب الحساسية", hasBannedAllergyPhrase("الطبق ده يناسب الحساسية"));
ok("safe (EN)", hasBannedAllergyPhrase("this dish is completely safe"));
ok("scan returns the label", scanBannedAllergyPhrases("الأكل آمن").includes("آمن"));

// ── MUST NOT catch — the ALLOWED §0 framing + benign text ──
ok("allowed framing: بيانات المكونات المعتمدة ما يظهر فيها البيض",
  !hasBannedAllergyPhrase("حسب بيانات المكونات المعتمدة ما يظهر فيها البيض"));
ok("allowed: أوصلك بموظف يتأكد", !hasBannedAllergyPhrase("أقدر أوصلك بموظف يتأكد لك الآن"));
ok("benign: صحتك أهم شي عندنا", !hasBannedAllergyPhrase("صحتك أهم شي عندنا"));
ok("safety ≠ safe (word boundary)", !hasBannedAllergyPhrase("our kitchen follows safety standards"));
ok("clean empty", !hasBannedAllergyPhrase(""));

// ── §1b two-axis truth model ──
const T = computeDishTruthState;
ok("W1 no data → unknown", T({}, "بيض") === "unknown");
ok("W1 null dish → unknown", T(null, "لبن") === "unknown");
ok("contains (allergen tag)", T({ allergens: ["بيض"] }, "بيض") === "contains");
ok("contains (ingredient list)", T({ ingredients: ["بيض", "دقيق"], ingredientVerified: true }, "بيض") === "contains");
ok("clear_verified (ingredient+prep verified)",
  T({ ingredients: ["دجاج", "رز"], ingredientVerified: true, prepStatus: "controlled", prepVerified: true }, "بيض") === "clear_verified");
ok("clear_prep_unknown (ingredient clear, prep unknown)",
  T({ ingredients: ["دجاج", "رز"], ingredientVerified: true, prepStatus: "unknown" }, "بيض") === "clear_prep_unknown");
ok("severe_shared_risk (severe + shared prep)",
  T({ ingredients: ["دجاج"], ingredientVerified: true, prepStatus: "shared_risk" }, "فول سوداني", true) === "severe_shared_risk");
ok("no ingredient data but not verified → unknown",
  T({ ingredients: [] }, "بيض") === "unknown");

console.log(`\nALLERGEN-COMPANION UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
