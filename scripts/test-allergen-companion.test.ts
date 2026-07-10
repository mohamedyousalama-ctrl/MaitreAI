// Unit tests for the §0 banned-phrase scan + §1b two-axis truth model (pure).
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/test-allergen-companion.test.ts
import { scanBannedAllergyPhrases, hasBannedAllergyPhrase, computeDishTruthState, mergeAllergyNote, parseAllergyNote, allergenLabel } from "../lib/ai/allergen-companion.ts";
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

// ── §1a.2 note-union — kitchen-readable Arabic + MONOTONIC (never shrinks) ──
ok("note is kitchen-readable Arabic", mergeAllergyNote(null, ["بيض"]) === "⚠️ حساسية: بيض");
ok("union adds a second allergen", mergeAllergyNote("⚠️ حساسية: بيض", ["مكسرات"]) === "⚠️ حساسية: بيض، مكسرات");
// Bound 1: re-mention of one allergen must NOT clobber another named earlier.
ok("re-mention never drops earlier allergen", mergeAllergyNote("⚠️ حساسية: بيض، مكسرات", ["بيض"]) === "⚠️ حساسية: بيض، مكسرات");
ok("union dedups", mergeAllergyNote("⚠️ حساسية: بيض", ["بيض"]) === "⚠️ حساسية: بيض");
ok("eggs then nuts → BOTH", parseAllergyNote(mergeAllergyNote(mergeAllergyNote(null, ["بيض"]), ["مكسرات"])).length === 2);
ok("parse round-trips", JSON.stringify(parseAllergyNote("⚠️ حساسية: بيض، مكسرات")) === JSON.stringify(["بيض", "مكسرات"]));
ok("generic mention → حساسية label", allergenLabel("الحساسية") === "حساسية");
ok("null term → generic label", allergenLabel(null) === "حساسية");
ok("specific term kept", allergenLabel("فول سوداني") === "فول سوداني");
// Simulate a multi-allergen session accumulating monotonically across turns.
let note = "";
for (const t of ["بيض", "مكسرات", "بيض", "لبن"]) note = mergeAllergyNote(note, [t]);
ok("session union = all 3 distinct, order-preserving", note === "⚠️ حساسية: بيض، مكسرات، لبن");

console.log(`\nALLERGEN-COMPANION UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
