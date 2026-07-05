// WB-ALLERGEN-1 — unit tests for the controlled allergen vocabulary.
// Run: node --experimental-strip-types scripts/test-allergen-vocab.test.ts
import {
  ALLERGENS,
  ALLERGEN_KEYS,
  isValidAllergenKey,
  canonicalToArLabel,
  arLabelToCanonical,
  mapAllergenValue,
  normalizeAllergenArray,
  type AllergenKey,
} from "../lib/ai/allergen-vocab.ts";

let ok = 0, fail = 0;
const t = (c: boolean, m: string) => { c ? ok++ : (fail++, console.log("FAIL:", m)); };
const eq = (a: unknown, b: unknown, m: string) => t(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)} want ${JSON.stringify(b)})`);

// The gate's ALLERGEN_TERMS, copied verbatim from lib/ai/allergen-gate.ts:34-37.
// The vocab's gateTerms MUST cover every one of these (correspondence guarantee).
const GATE_ALLERGEN_TERMS = [
  "بندق", "فستق", "لوز", "كاجو", "عين جمل", "جوز", "مكسرات", "فول سوداني", "سوداني",
  "لبن", "البان", "حليب", "جلوتين", "قمح", "بيض", "سمسم", "صويا", "ماكولات بحريه", "بحريات", "سمك", "جمبري", "قشريات",
  // KSA ratified-path additions (docs/KSA_ALLERGEN_DIALECT_REVIEW.md §3c).
  "لاكتوز", "طحينه",
];

// 1) Nine canonical keys, each with arLabel + non-empty gateTerms.
eq(ALLERGEN_KEYS.length, 9, "9 canonical keys");
eq([...ALLERGEN_KEYS], ["peanut","tree_nut","dairy","gluten","egg","sesame","soy","shellfish","fish"], "key set");
for (const def of ALLERGENS) {
  t(def.arLabel.length > 0, `${def.key} has arLabel`);
  t(def.gateTerms.length > 0, `${def.key} has gateTerms`);
  eq(canonicalToArLabel(def.key), def.arLabel, `${def.key} canonicalToArLabel`);
}

// 2) CORRESPONDENCE: every gate ALLERGEN_TERM maps to exactly one canonical key.
for (const term of GATE_ALLERGEN_TERMS) {
  const k = mapAllergenValue(term);
  t(k !== null, `gate term «${term}» maps to a canonical key`);
}
// And the union of all gateTerms equals the gate set (nothing invented / nothing lost).
const unionGateTerms = ALLERGENS.flatMap((a) => a.gateTerms).sort();
eq(unionGateTerms, [...GATE_ALLERGEN_TERMS].sort(), "union of gateTerms == ALLERGEN_TERMS (exact coverage)");

// 3) Specific correspondences (spot-check the mapping).
eq(mapAllergenValue("بندق"), "tree_nut", "بندق → tree_nut");
eq(mapAllergenValue("فول سوداني"), "peanut", "فول سوداني → peanut");
eq(mapAllergenValue("سوداني"), "peanut", "سوداني → peanut");
eq(mapAllergenValue("لبن"), "dairy", "لبن → dairy");
eq(mapAllergenValue("البان"), "dairy", "البان → dairy");
eq(mapAllergenValue("حليب"), "dairy", "حليب → dairy");
eq(mapAllergenValue("قمح"), "gluten", "قمح → gluten");
eq(mapAllergenValue("جمبري"), "shellfish", "جمبري → shellfish");
eq(mapAllergenValue("قشريات"), "shellfish", "قشريات → shellfish");
eq(mapAllergenValue("سمك"), "fish", "سمك → fish");
eq(mapAllergenValue("لاكتوز"), "dairy", "لاكتوز → dairy (KSA gateTerm)");
eq(mapAllergenValue("طحينة"), "sesame", "طحينة → sesame (KSA gateTerm, normalized طحينه)");

// 4) normalizeAllergenArray migrates the CURRENT MenuItemForm free-text suggestions.
const formSuggestions = ["جلوتين", "ألبان", "بيض", "مكسرات", "فول صويا", "أسماك"];
const migrated = normalizeAllergenArray(formSuggestions);
eq(migrated.keys, ["tree_nut","dairy","gluten","egg","soy","fish"], "form suggestions → canonical (canonical order)");
eq(migrated.unmapped, [], "form suggestions all mapped (none unmapped)");

// 5) Both directions + label round-trip.
eq(arLabelToCanonical("ألبان"), "dairy", "arLabel ألبان → dairy");
eq(arLabelToCanonical("أسماك"), "fish", "legacy label أسماك → fish (note: not a gate substring of سمك)");
for (const def of ALLERGENS) eq(arLabelToCanonical(def.arLabel), def.key, `round-trip ${def.key}`);

// 6) Unmappable values are flagged, not guessed.
const mixed = normalizeAllergenArray(["مكسرات", "حار", "بصل", "dairy", "  ", "صويا"]);
eq(mixed.keys, ["tree_nut","dairy","soy"], "mixed maps known, dedups, canonical order");
eq(mixed.unmapped, ["حار", "بصل"], "unmappable (spicy/onion) flagged; blank ignored");
// A value that's ALREADY a canonical key passes through.
eq(mapAllergenValue("dairy"), "dairy", "canonical key passes through");
eq(mapAllergenValue("Tree Nuts"), "tree_nut", "English label (case-insensitive) maps");

// 7) isValidAllergenKey.
t(isValidAllergenKey("peanut"), "peanut is valid");
t(!isValidAllergenKey("nuts"), "nuts (label, not key) is NOT a valid key");
t(!isValidAllergenKey(""), "empty not valid");
t(!isValidAllergenKey(null), "null not valid");

// 8) Empty / null input.
eq(normalizeAllergenArray([]), { keys: [], unmapped: [] }, "empty array");
eq(normalizeAllergenArray(null), { keys: [], unmapped: [] }, "null input");

console.log(`\nALLERGEN-VOCAB UNIT: ${ok} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
