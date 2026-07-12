// ============================================================================
// MaitreAI — Allergy-Companion deterministic helpers (spec §0 + §1b) — PURE.
//
// Two safety-critical, deterministic pieces used only when allergy_companion_mode
// is ON (flag-OFF → never imported into the live path; behavior byte-identical):
//
//   1. scanBannedAllergyPhrases — the §0 RED-LINE enforcement. Kivo must NEVER
//      assert food safety. Any allergy-context reply (LLM-generated OR deterministic
//      authored text — recovery reply, checkpoint recap) is scanned for the banned
//      vocabulary; a hit is blocked/rewritten upstream and logged (§4 audit).
//
//   2. computeDishTruthState — the §1b TWO-AXIS (ingredient × preparation) truth
//      model. W1 ships the reader; the W2 data migration populates the fields. With
//      no data (W1), EVERY dish resolves to "unknown" → Kivo honestly can't confirm.
//      As W2 data lands, dishes light up to the richer states with NO W1 code change.
// ============================================================================

import { normalizeAr } from "./allergen-gate";

// ---------------------------------------------------------------------------
// §1a.2 — the KITCHEN-READABLE allergy note (the note the kitchen cooks from).
// Human-readable Arabic, never tokens: «⚠️ حساسية: بيض، مكسرات». The session union
// is MONOTONIC — later mentions only ADD allergens, never drop earlier ones (eggs
// then nuts → BOTH). order-create copies the full union at that moment onto the order.
// ---------------------------------------------------------------------------
const NOTE_PREFIX = "⚠️ حساسية: ";
/** A generic/unnamed allergy mention (no specific allergen isolated) → this label. */
const GENERIC_LABEL = "حساسية";

/** Parse the allergen labels out of an existing note (empty ⇒ []). */
export function parseAllergyNote(note: string | null | undefined): string[] {
  const s = String(note ?? "").replace(NOTE_PREFIX, "").trim();
  if (!s) return [];
  return s.split(/[،,]/).map((x) => x.trim()).filter(Boolean);
}

/** Build the kitchen-readable note from a list of Arabic allergen labels (dedup, order-preserving). */
export function buildAllergyNote(allergens: string[]): string {
  const uniq: string[] = [];
  for (const a of allergens.map((x) => String(x ?? "").trim()).filter(Boolean)) {
    if (!uniq.includes(a)) uniq.push(a);
  }
  return uniq.length ? NOTE_PREFIX + uniq.join("، ") : "";
}

/** Normalize a raw detector term into a kitchen label. «الحساسية»/null/empty → generic. */
export function allergenLabel(term: string | null | undefined): string {
  const t = String(term ?? "").trim();
  if (!t || t === "الحساسية") return GENERIC_LABEL;
  return t;
}

/**
 * MONOTONIC union: merge new allergen label(s) into an existing note. NEVER drops an
 * allergen already present — a re-mention of one allergen cannot clobber another named
 * earlier in the session. Returns the updated kitchen-readable note.
 */
export function mergeAllergyNote(existing: string | null | undefined, newAllergens: Array<string | null | undefined>): string {
  const merged = parseAllergyNote(existing);
  for (const raw of newAllergens) {
    const label = allergenLabel(raw);
    if (label && !merged.includes(label)) merged.push(label);
  }
  return buildAllergyNote(merged);
}

// ---------------------------------------------------------------------------
// §0 — BANNED PHRASES (verbatim from the spec). Enforced on every allergy-context
// reply. Arabic entries are matched on normalizeAr'd text; «safe» on raw (Latin).
// The short/common Arabic tokens («امن», «عادي») use Arabic-boundary assertions so
// they don't fire mid-word (e.g. «الأمان» / «الحساسية» never trips «امن»).
// ---------------------------------------------------------------------------
const BANNED_AR: Array<{ re: RegExp; label: string }> = [
  { re: /(?<![ء-ي])امن(?![ء-ي])/, label: "آمن" },              // آمن → امن (normalized)
  { re: /مضمون/, label: "مضمون" },
  { re: /(?<![ء-ي])عادي(?![ء-ي])/, label: "عادي" },
  { re: /ما ?عليك(?![ء-ي])/, label: "ما عليك" },
  { re: /ما ?يضرك/, label: "ما يضرك" },
  { re: /مايضرك/, label: "ما يضرك" },
  { re: /خالي ?تماما/, label: "خالي تماماً" },
  { re: /بدون ?اي ?تلامس/, label: "بدون أي تلامس" },
  { re: /يناسب ?الحساسيه/, label: "يناسب الحساسية" },
];
// English — «safe» as a standalone word (NOT «safety»/«safely»).
const BANNED_EN = /\bsafe\b/i;

// WO-LIVE-2-F2b — «عادي» ("regular") is BOTH a banned safety-assurance token AND a
// FLAVOR option in Egyptian food ordering («عادي، حار، أو مكس؟»). Blocking the flavor
// question froze ordering for exactly the allergy-noted customers Wesaya serves. Flavor
// enumeration ≠ safety assurance: «عادي» is exempt ONLY when EVERY sentence that contains
// it ALSO enumerates another flavor-option token (حار/سبايسي/مكس + normalized variants).
// A bare «عادي» in ANY other frame — including a mixed reply where one sentence has it
// without a flavor token — stays banned. Matched on the normalizeAr'd text.
const FLAVOR_OPTION_RE = /(?<![ء-ي])(حار|حراق|سبايسي|سبيسي|سبايس|مكس|ميكس)(?![ء-ي])/;
const ADI_RE = /(?<![ء-ي])عادي(?![ء-ي])/;
/** True iff every sentence that contains «عادي» also enumerates another flavor option —
 *  i.e. every «عادي» hit is flavor enumeration, never a bare safety assurance. Sentences
 *  split on TERMINAL punctuation only (؟ ? . ! newline), NOT commas — a flavor list is
 *  comma-separated («عادي، حار، مكس»), so it must stay one sentence. */
function adiIsFlavorEnumerationOnly(normalized: string): boolean {
  const withAdi = normalized.split(/[؟?.!\n]+/).filter((s) => ADI_RE.test(s));
  return withAdi.length > 0 && withAdi.every((s) => FLAVOR_OPTION_RE.test(s));
}

/** Return every banned §0 phrase present in `text` (empty ⇒ clean). Pure. */
export function scanBannedAllergyPhrases(text: string): string[] {
  const raw = String(text ?? "");
  if (!raw.trim()) return [];
  const n = normalizeAr(raw);
  const hits: string[] = [];
  for (const { re, label } of BANNED_AR) {
    if (!re.test(n)) continue;
    // F2b flavor-enumeration exemption — applies ONLY to «عادي».
    if (label === "عادي" && adiIsFlavorEnumerationOnly(n)) continue;
    if (!hits.includes(label)) hits.push(label);
  }
  if (BANNED_EN.test(raw)) hits.push("safe");
  return hits;
}

/** True iff `text` contains any §0 banned allergy-safety phrase. */
export function hasBannedAllergyPhrase(text: string): boolean {
  return scanBannedAllergyPhrases(text).length > 0;
}

// ---------------------------------------------------------------------------
// §1b — TWO-AXIS truth model (ingredient × preparation).
// ---------------------------------------------------------------------------

/** The honest truth-state Kivo may report for one dish × one allergen. Never a
 *  guarantee — always a statement about DATA. Ordered protective-first. */
export type DishTruthState =
  | "contains"            // ingredient/allergen data lists the allergen → recommend against
  | "clear_verified"      // no allergen listed AND prep controlled/verified
  | "clear_prep_unknown"  // no allergen listed as ingredient, but prep/cross-contact unknown
  | "severe_shared_risk"  // severe allergen + shared prep → lean protective (kitchen check)
  | "unknown";            // no verified ingredient data at all → can't confirm

export type PrepStatus = "controlled" | "shared_risk" | "unknown";

/** The (staged) per-dish data the truth model reads. Every field is OPTIONAL: in W1
 *  none of the W2 columns exist, so a dish arrives with only legacy `allergens`
 *  (or nothing) and resolves to "unknown". W2 populates ingredients/prep_status/etc. */
export interface DishAllergenData {
  /** Legacy allergen tags (canonical keys or Arabic labels), if reviewed. */
  allergens?: string[] | null;
  /** Whether the allergen tags were human-verified (existing allergens_reviewed_at pattern). */
  ingredientVerified?: boolean | null;
  /** W2: explicit ingredient list (human-entered). */
  ingredients?: string[] | null;
  /** W2: preparation/cross-contact status. */
  prepStatus?: PrepStatus | null;
  /** W2: whether prep_status was human-verified. */
  prepVerified?: boolean | null;
}

/**
 * Compute the honest two-axis truth-state for `allergenKey` on `dish`. Pure and
 * defensive — with no W2 data (W1) it returns "unknown" for every dish, so Kivo
 * always says it can't confirm. `severe` marks allergens where a shared-risk prep
 * should lean protective (§1b severe row). NEVER returns a "safe" verdict — the
 * strongest positive is "clear_verified" ("data shows no X"), which callers phrase
 * as a data statement, never a guarantee.
 */
export function computeDishTruthState(
  dish: DishAllergenData | null | undefined,
  allergenKey: string,
  severe = false
): DishTruthState {
  const d = dish ?? {};
  const key = normalizeAr(allergenKey);
  const listed = (arr: string[] | null | undefined) =>
    Array.isArray(arr) && arr.some((a) => normalizeAr(a).includes(key) || key.includes(normalizeAr(a)));

  // Axis 1 — ingredient: does verified data list the allergen?
  const inAllergens = listed(d.allergens);
  const inIngredients = listed(d.ingredients);
  if (inAllergens || inIngredients) return "contains";

  // No allergen listed — but is the INGREDIENT data itself trustworthy/present?
  const haveIngredientData = d.ingredientVerified === true || (Array.isArray(d.ingredients) && d.ingredients.length > 0);
  if (!haveIngredientData) return "unknown"; // W1 default: no data → can't confirm

  // Axis 2 — preparation.
  const prep: PrepStatus = d.prepStatus ?? "unknown";
  if (prep === "controlled" && d.prepVerified === true) return "clear_verified";
  if (severe && prep === "shared_risk") return "severe_shared_risk";
  return "clear_prep_unknown"; // ingredient clear, prep unverified/shared
}
