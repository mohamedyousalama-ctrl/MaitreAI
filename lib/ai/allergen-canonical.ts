// ============================================================================
// MaitreAI — Allergen CANONICALIZATION (WO-MEMFIX) — PURE, no I/O.
//
// The allergy-memory extractor once stored raw TRIGGER words verbatim as if they
// were allergens: a production warning rendered «مسجّل حساسية من حساسه، حكه، قمح،
// حساسية، بيض» — "allergy" and "itching" listed as SUBSTANCES beside real ones.
// The note-builder (allergen-companion.ts) kept whatever term the gate handed it,
// so a symptom word («حكه» itching) or the mention word itself («حساسية») became a
// stored "allergen".
//
// This module is the single, deterministic answer to "is this token a real allergen
// SUBSTANCE, and if so what is its canonical entity?". It maps trigger phrases →
// canonical allergen ENTITIES only. Symptom / trigger / mention words (حساسية،
// حساسه، حكه، هرش، تعب، ضيق تنفس …) resolve to NOTHING and are never stored or
// rendered as substances. An allergy mention with no identifiable substance yields
// the EMPTY set (allergen = null: the mention is recorded, but no substance is listed).
//
// Entity vocabulary is sourced from the already-vetted controlled vocab
// (allergen-vocab.ts) so it can never drift from what the deterministic gate matches;
// «فراولة» (strawberry) is the one mission entity outside the 9-key vocab and is added
// here. Matching mirrors the gate's boundary-aware, «ال»-tolerant, normalizeAr'd form.
//
// This module is a LEAF over allergen-gate (normalizeAr) + allergen-vocab (the table):
// neither imports this module, so there is no cycle.
// ============================================================================

import { normalizeAr } from "./allergen-gate";
import { ALLERGENS, type AllergenKey } from "./allergen-vocab";

/** The controlled canonical allergen ENTITIES this system ever stores or renders.
 *  Kitchen-readable Arabic labels (the mission set). These are the ONLY substances
 *  a warning may list; everything else is a symptom/trigger and is dropped. */
export const CANONICAL_ALLERGENS = [
  "بيض",
  "ألبان",
  "قمح",
  "مكسرات",
  "فول سوداني",
  "سمسم",
  "سمك",
  "جمبري/محار",
  "صويا",
  "فراولة",
] as const;

export type CanonicalAllergen = (typeof CANONICAL_ALLERGENS)[number];

// Controlled-vocab key → the mission canonical label. The vocab arLabels differ in a
// couple of spots (gluten→«جلوتين», shellfish→«قشريات ومحار»); the mission set is the
// customer-facing truth, so we normalize onto it (wheat → «قمح», shellfish → «جمبري/محار»).
const KEY_TO_CANONICAL: Record<AllergenKey, CanonicalAllergen> = {
  peanut: "فول سوداني",
  tree_nut: "مكسرات",
  dairy: "ألبان",
  gluten: "قمح",
  egg: "بيض",
  sesame: "سمسم",
  soy: "صويا",
  shellfish: "جمبري/محار",
  fish: "سمك",
};

// «فراولة» (strawberry) — a mission canonical entity NOT in the 9-key controlled vocab.
const STRAWBERRY_TERMS = ["فراولة", "فراوله", "strawberry", "strawberries"] as const;

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// One boundary-aware matcher per known variant → canonical label. Boundary + «ال»
// tolerance are IDENTICAL to the gate/vocab (so «البيض» matches «بيض», «الجلوتين» →
// «قمح»), and every source string is normalizeAr'd first. Sorted longest-first so the
// most specific variant wins (e.g. «فول سوداني» before «سوداني»).
interface Variant {
  re: RegExp;
  canonical: CanonicalAllergen;
  len: number;
}
const VARIANTS: readonly Variant[] = (() => {
  const out: Variant[] = [];
  const seen = new Set<string>();
  const push = (term: string, canonical: CanonicalAllergen) => {
    const n = normalizeAr(term);
    if (!n) return;
    const dedupKey = `${n}→${canonical}`;
    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);
    const flexible = n.split(" ").map(escapeReg).join(" (?:ال)?");
    out.push({ re: new RegExp(`(?<![ء-ي])(?:ال)?${flexible}(?![ء-ي])`), canonical, len: n.length });
  };
  for (const def of ALLERGENS) {
    const canonical = KEY_TO_CANONICAL[def.key];
    push(def.key, canonical);
    push(def.arLabel, canonical);
    push(def.enLabel, canonical);
    for (const t of def.gateTerms) push(t, canonical);
    for (const a of def.aliases) push(a, canonical);
  }
  for (const t of STRAWBERRY_TERMS) push(t, "فراولة");
  return out.sort((a, b) => b.len - a.len);
})();

/**
 * Map ONE raw term to its canonical allergen ENTITY, or null when the term names no
 * real substance (a symptom/trigger/mention word like «حساسية»/«حكه», or anything
 * unrecognized). Pure + deterministic — mirrors the gate's normalized, boundary-aware
 * matching, so a term is recognized exactly how the gate would see it.
 */
export function canonicalAllergen(term: string | null | undefined): CanonicalAllergen | null {
  const n = normalizeAr(String(term ?? ""));
  if (!n) return null;
  for (const v of VARIANTS) {
    if (v.re.test(n)) return v.canonical;
  }
  return null;
}

/** True iff `term` names a real allergen SUBSTANCE (not a symptom/trigger/mention word). */
export function isCanonicalAllergen(term: string | null | undefined): boolean {
  return canonicalAllergen(term) !== null;
}

/**
 * The CANONICAL SET for a list of raw terms: every term mapped to its canonical
 * allergen entity, symptom/trigger/mention words DROPPED, de-duplicated, order-preserving.
 * The garbage case «حساسه، حكه، قمح، حساسية، بيض» → {«قمح»، «بيض»} only. An allergy
 * mention with no identifiable substance → [] (allergen = null). Pure.
 */
export function canonicalizeAllergens(terms: ReadonlyArray<string | null | undefined>): CanonicalAllergen[] {
  const out: CanonicalAllergen[] = [];
  for (const term of terms) {
    const canonical = canonicalAllergen(term);
    if (canonical && !out.includes(canonical)) out.push(canonical);
  }
  return out;
}

/**
 * Defensive FILTER: keep only the terms that name a real allergen SUBSTANCE, VERBATIM
 * (the customer's own word — «لبن» stays «لبن»), dropping symptom/trigger/mention words
 * and de-duplicating. Unlike canonicalizeAllergens this does NOT rewrite the label, so it
 * is safe to feed a downstream matcher that keys on the original entity strings (the
 * memory-allergy gate). Pure.
 */
export function filterAllergenEntities(terms: ReadonlyArray<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const raw of terms) {
    const term = String(raw ?? "").trim();
    if (!term || !isCanonicalAllergen(term)) continue;
    if (!out.includes(term)) out.push(term);
  }
  return out;
}

/** True iff `term` is the generic/unnamed allergy MENTION word («حساسية»/«الحساسية»),
 *  as opposed to a symptom word («حساسه»/«حكه») or a real substance. The mention word
 *  is what a bare «عندي حساسية» yields — it is NOT a substance, but it does mark that an
 *  allergy was mentioned (→ generic label for the kitchen note; never a listed substance). */
export function isGenericAllergyMention(term: string | null | undefined): boolean {
  return /حساسي/.test(normalizeAr(String(term ?? "")));
}
