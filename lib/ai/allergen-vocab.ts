// ============================================================================
// MaitreAI — Controlled allergen vocabulary (WB-ALLERGEN-1) — PURE, no side effects.
//
// The SINGLE source of truth that the console menu editor, the LLM prompt, and
// (later) the deterministic gate all align to. It maps a small CONTROLLED list of
// canonical allergen keys to their Arabic display label and — critically — to the
// EXACT Arabic term forms the existing deterministic gate already matches
// (lib/ai/allergen-gate.ts ALLERGEN_TERMS). No new detection terms are invented
// here: every `gateTerm` below is one the gate already keys on, so this vocab can
// never claim to detect something the gate doesn't.
//
// This module is PURE and is imported by NOTHING yet (the editor/gate wiring lands
// in later WB-ALLERGEN steps). It only establishes the canonical mapping and the
// helpers that migrate existing free-text allergen data to canonical keys.
//
// This module is a LEAF: it imports nothing from the gate. WB-ALLERGEN-3 is
// expected to have the GATE import THIS vocab (to cross-reference per-item data),
// so the dependency must point gate → vocab; importing the gate here would create
// a cycle. To guarantee matching never drifts from the gate, normalizeArabic below
// is byte-identical to allergen-gate.ts normalizeArabic() (keep the two in sync — the
// vocab test asserts the key equivalences).
// ============================================================================

/** Normalize Arabic for robust matching — IDENTICAL to allergen-gate.ts normalizeArabic()
 *  (tashkeel/tatweel, alef/ya/ta-marbuta/hamza variants, spacing; lowercases Latin).
 *  Kept in sync deliberately; this module stays a leaf (no gate import). */
function normalizeArabic(s: string): string {
  return String(s ?? "")
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** The controlled set of allergen keys. Stored (canonical) values use these. */
export type AllergenKey =
  | "peanut"
  | "tree_nut"
  | "dairy"
  | "gluten"
  | "egg"
  | "sesame"
  | "soy"
  | "shellfish"
  | "fish";

export interface AllergenDef {
  key: AllergenKey;
  /** Arabic display label (what a manager sees in the editor / what the prompt prints). */
  arLabel: string;
  /** English label (display + English alias source). */
  enLabel: string;
  /**
   * The EXACT Arabic strings the deterministic gate (allergen-gate.ts ALLERGEN_TERMS)
   * already matches for this allergen. The union across all keys covers ALL of
   * ALLERGEN_TERMS (verified in scripts/test-allergen-vocab.test.ts) — nothing
   * invented, nothing dropped.
   */
  gateTerms: string[];
  /**
   * Extra legacy/free-text labels (incl. the current MenuItemForm suggestions and
   * common variants) that should migrate to this key but are NOT gate terms — e.g.
   * «أسماك» (fish plural; does not substring-match the gate's «سمك»), «فول صويا»,
   * «ألبان». Used only by the normalize helpers, never by detection.
   */
  aliases: string[];
}

// ---------------------------------------------------------------------------
// The canonical table. gateTerms are quoted verbatim from allergen-gate.ts:34-37.
// ---------------------------------------------------------------------------
export const ALLERGENS: readonly AllergenDef[] = [
  {
    key: "peanut",
    arLabel: "فول سوداني",
    enLabel: "Peanut",
    gateTerms: ["فول سوداني", "سوداني"],
    aliases: ["peanut", "peanuts", "groundnut"],
  },
  {
    key: "tree_nut",
    arLabel: "مكسرات",
    enLabel: "Tree nuts",
    // بندق فستق لوز كاجو «عين جمل» جوز مكسرات — all the gate's nut forms.
    gateTerms: ["بندق", "فستق", "لوز", "كاجو", "عين جمل", "جوز", "مكسرات"],
    aliases: ["nuts", "nut", "tree nut", "tree nuts", "مكسّرات"],
  },
  {
    key: "dairy",
    arLabel: "ألبان",
    enLabel: "Dairy",
    // «لاكتوز» promoted alias→gateTerm (KSA ratified-path: gate now keys on it too).
    gateTerms: ["لبن", "البان", "حليب", "لاكتوز"],
    aliases: ["ألبان", "الألبان", "منتجات الألبان", "dairy", "milk", "lactose"],
  },
  {
    key: "gluten",
    arLabel: "جلوتين",
    enLabel: "Gluten",
    gateTerms: ["جلوتين", "قمح"],
    aliases: ["gluten", "wheat"],
  },
  {
    key: "egg",
    arLabel: "بيض",
    enLabel: "Egg",
    gateTerms: ["بيض"],
    aliases: ["egg", "eggs"],
  },
  {
    key: "sesame",
    arLabel: "سمسم",
    enLabel: "Sesame",
    // «طحينه» (normalized طحينة) promoted alias→gateTerm (KSA ratified-path).
    gateTerms: ["سمسم", "طحينه"],
    aliases: ["sesame", "tahini", "طحينة"],
  },
  {
    key: "soy",
    arLabel: "صويا",
    enLabel: "Soy",
    gateTerms: ["صويا"],
    aliases: ["فول صويا", "soy", "soya", "soybean"],
  },
  {
    key: "shellfish",
    arLabel: "قشريات ومحار",
    enLabel: "Shellfish",
    // Generic-seafood gate terms (ماكولات بحريه / بحريات) map here with crustaceans/
    // shrimp; fish proper is its own key below. (A future cross-reference may treat
    // generic «seafood» as spanning both — that is gate logic, not this table.)
    gateTerms: ["جمبري", "قشريات", "ماكولات بحريه", "بحريات"],
    aliases: ["shellfish", "shrimp", "prawn", "crab", "محار", "ماكولات بحرية", "مأكولات بحرية", "seafood"],
  },
  {
    key: "fish",
    arLabel: "سمك",
    enLabel: "Fish",
    gateTerms: ["سمك"],
    aliases: ["أسماك", "اسماك", "fish"],
  },
] as const;

/** The 9 canonical keys, in display order. */
export const ALLERGEN_KEYS: readonly AllergenKey[] = ALLERGENS.map((a) => a.key);

// ---------------------------------------------------------------------------
// Lookup: normalized alias/term/label → canonical key. Built ONCE at module load.
// ---------------------------------------------------------------------------
const ALIAS_TO_KEY: ReadonlyMap<string, AllergenKey> = (() => {
  const m = new Map<string, AllergenKey>();
  const add = (s: string, key: AllergenKey) => {
    const n = normalizeArabic(s);
    if (n) m.set(n, key);
  };
  for (const def of ALLERGENS) {
    add(def.key, def.key); // the canonical key string itself (idempotent passthrough)
    add(def.arLabel, def.key);
    add(def.enLabel, def.key);
    for (const t of def.gateTerms) add(t, def.key);
    for (const a of def.aliases) add(a, def.key);
  }
  return m;
})();

// ---------------------------------------------------------------------------
// Helpers (all pure).
// ---------------------------------------------------------------------------

/** True iff `key` is one of the 9 canonical allergen keys. */
export function isValidAllergenKey(key: unknown): key is AllergenKey {
  return typeof key === "string" && ALLERGEN_KEYS.includes(key as AllergenKey);
}

/** Canonical key → Arabic display label (null for an unknown key). */
export function canonicalToArLabel(key: string): string | null {
  return ALLERGENS.find((a) => a.key === key)?.arLabel ?? null;
}

/** Canonical key → English label (null for an unknown key). */
export function canonicalToEnLabel(key: string): string | null {
  return ALLERGENS.find((a) => a.key === key)?.enLabel ?? null;
}

/** Map ONE value (canonical key, Arabic label, gate term, English/legacy alias) to a
 *  canonical key, or null if unmappable. Normalizes via normalizeArabic (identical to
 *  the gate's normalizeAr) so a value matches exactly how the gate would see it. */
export function mapAllergenValue(value: string): AllergenKey | null {
  const n = normalizeArabic(value);
  if (!n) return null;
  return ALIAS_TO_KEY.get(n) ?? null;
}

/** An Arabic display label → canonical key (alias of mapAllergenValue, kept for the
 *  editor's reverse lookup). */
export function arLabelToCanonical(label: string): AllergenKey | null {
  return mapAllergenValue(label);
}

export interface NormalizeAllergensResult {
  /** Canonical keys, de-duplicated, in canonical display order. */
  keys: AllergenKey[];
  /** Input values that could not be mapped to any canonical key (flagged, not guessed). */
  unmapped: string[];
}

/**
 * Migrate an array of free-text / legacy allergen values to canonical keys.
 * Maps what it can (case/diacritic-insensitive), DROPS nothing silently — every
 * unmappable value is returned in `unmapped` so a caller can flag it for review.
 * De-duplicates and returns keys in canonical order. Pure; does not mutate input.
 */
export function normalizeAllergenArray(arr: readonly string[] | null | undefined): NormalizeAllergensResult {
  const found = new Set<AllergenKey>();
  const unmapped: string[] = [];
  for (const raw of arr ?? []) {
    if (typeof raw !== "string") continue;
    const key = mapAllergenValue(raw);
    if (key) found.add(key);
    else if (raw.trim()) unmapped.push(raw.trim());
  }
  // Return in canonical order (stable), not insertion order.
  const keys = ALLERGEN_KEYS.filter((k) => found.has(k));
  return { keys, unmapped };
}
