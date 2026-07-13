// ============================================================================
// MaitreAI — WO-VOICE-DEEPGRAM-SPIKE: CANONICAL SLOT extraction (PURE, no I/O).
// The comparison harness must NOT diff transcripts character-by-character — two
// adapters that spell «مية» vs «مئة» or «اتنين» vs «إثنين» are the SAME order. So we
// reduce each transcript to its canonical slots — item(s), quantity, negation — and
// compare THOSE. Adapter-agnostic: it takes a transcript string, never an adapter.
//
//   items    : the deterministic menu candidates (WO-VOICE-ALIASES resolver), by name.
//   quantity : a best-effort single value — handles single numbers, compound
//              hundreds+tens («مية وخمسين»→150), and negation-corrections («٩ مش ٨»→9,
//              the asserted pre-negation number).
//   negation : whether a correction/negation token is present (مش/غير/بدل/بدون/لا).
// ============================================================================

import { normalizeAr } from "../allergen-gate";
import { resolveVoiceCandidates } from "../voice-aliases";

/** Normalized number-word → integer (standard + Egyptian dialect + tens/hundreds). */
const NUM: Record<string, number> = {
  "واحد": 1, "وحده": 1, "اتنين": 2, "اثنين": 2, "ثنين": 2, "تلاته": 3, "ثلاثه": 3, "تلات": 3, "ثلاث": 3,
  "اربعه": 4, "اربع": 4, "خمسه": 5, "خمس": 5, "سته": 6, "ست": 6, "سبعه": 7, "سبع": 7,
  "تمنيه": 8, "ثمانيه": 8, "تماني": 8, "ثمان": 8, "تسعه": 9, "تسع": 9, "عشره": 10, "عشر": 10,
  "عشرين": 20, "ثلاثين": 30, "تلاتين": 30, "اربعين": 40, "خمسين": 50, "ستين": 60, "سبعين": 70, "تمانين": 80, "تسعين": 90,
  "ميه": 100, "مية": 100, "مئه": 100, "ميتين": 200,
};

/** Negation / correction tokens (normalized). */
const NEG = new Set(["مش", "غير", "بدل", "بدون", "لا", "مو", "مب"]);
/** WO-VOICE-HCW honesty-note 1 — negation words that keep meaning a NEGATION when a leading
 *  conjunction «و» is attached («ومش محتاج» → neg). Deliberately EXCLUDES «لا», because
 *  «ولا» is usually the disjunction "or" («حار ولا عادي»), not a negation. */
const NEG_WAW_STRIPPABLE = new Set(["مش", "غير", "بدل", "بدون", "مو", "مب"]);
function isNegToken(t: string): boolean {
  return NEG.has(t) || (t.startsWith("و") && NEG_WAW_STRIPPABLE.has(t.slice(1)));
}
/** WO-VOICE-HCW honesty-note 2 — address-context words: a number right after one of these
 *  is a STREET/building number, not an order quantity («شارع عشرة» → not qty 10). */
const ADDRESS_WORDS = new Set(["شارع", "طريق", "حي", "ميدان", "عماره", "مبني", "دور", "شقه", "بلوك", "كمبوند"]);

/** Value of a number token: try the raw form, then with a leading conjunction «و» and/or
 *  the definite article «ال» stripped («التسعة»→«تسعة», «وخمسين»→«خمسين»), then digits. */
function numValue(tok: string): number | null {
  let base = tok;
  if (base.startsWith("و")) base = base.slice(1);
  if (base.startsWith("ال")) base = base.slice(2);
  if (NUM[tok] !== undefined) return NUM[tok];
  if (NUM[base] !== undefined) return NUM[base];
  const digits = tok.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  if (/^[0-9]+$/.test(digits)) return parseInt(digits, 10);
  return null;
}

/** Combine a run of number values: a hundreds base absorbs a following smaller value
 *  («مية وخمسين» = 100 + 50 = 150); otherwise the first value governs. */
function combine(vals: number[]): number {
  let total = vals[0];
  for (let k = 1; k < vals.length; k++) {
    if (vals[k] < total && total % 100 === 0) total += vals[k];
    else break;
  }
  return total;
}

/** Best-effort canonical quantity from a normalized transcript. Negation-aware: on a
 *  correction («٩ مش ٨») the ASSERTED (pre-negation) number wins. Null when no number. */
export function parseCanonicalQuantity(transcript: string): number | null {
  const toks = normalizeAr(String(transcript ?? "")).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const nums = toks
    .map((t, i) => ({ i, v: numValue(t) }))
    // honesty-note 2: drop a number that directly follows an address word (street/building #).
    .filter((x): x is { i: number; v: number } => x.v !== null && !(x.i > 0 && ADDRESS_WORDS.has(toks[x.i - 1])));
  if (nums.length === 0) return null;
  const negIdx = toks.findIndex((t) => isNegToken(t));
  if (negIdx >= 0) {
    const before = nums.filter((x) => x.i < negIdx);
    if (before.length) return combine(before.map((x) => x.v));
  }
  return combine(nums.map((x) => x.v));
}

export interface CanonicalSlots {
  items: string[];
  quantity: number | null;
  negation: boolean;
}

/**
 * Reduce a transcript to its canonical slots. Pure, adapter-agnostic. Item detection
 * reuses the live WO-VOICE-ALIASES resolver; an order-frame token is prepended so a
 * frameless dictation still surfaces its dish (slot extraction measures transcription,
 * not order intent — the frame gate is a live-pipeline concern, not a comparison one).
 */
export function extractCanonicalSlots(
  transcript: string,
  menuItemNames: Array<string | null | undefined>
): CanonicalSlots {
  const norm = normalizeAr(String(transcript ?? ""));
  const framed = `عايز ${transcript}`; // force the resolver's order-frame so items surface
  const items = Array.from(
    new Set(resolveVoiceCandidates(framed, { menuItemNames }).map((c) => c.item))
  ).sort();
  return {
    items,
    quantity: parseCanonicalQuantity(transcript),
    negation: norm.split(/[^\p{L}\p{N}]+/u).some((t) => isNegToken(t)),
  };
}

export interface SlotComparison {
  items: boolean;
  quantity: boolean;
  negation: boolean;
  all: boolean;
}

/** Compare two canonical-slot reads (NEVER characters). `all` is per-slot agreement. */
export function compareSlots(a: CanonicalSlots, b: CanonicalSlots): SlotComparison {
  const items = a.items.length === b.items.length && a.items.every((x, i) => x === b.items[i]);
  const quantity = a.quantity === b.quantity;
  const negation = a.negation === b.negation;
  return { items, quantity, negation, all: items && quantity && negation };
}

export interface AdapterTranscript { adapter: string; transcript: string; }
export interface AdapterSlots extends AdapterTranscript { slots: CanonicalSlots; }

/**
 * The comparison harness core (adapter-agnostic): reduce each adapter's transcript to
 * canonical slots and report whether ALL adapters agree per slot — NEVER a character
 * diff. The runner (scripts/voice/compare-adapters) supplies transcripts produced by
 * whatever adapters it ran (groq, deepgram, mock, …) over the SAME audio.
 */
export function buildSlotComparison(
  inputs: AdapterTranscript[],
  menuItemNames: Array<string | null | undefined>
): { rows: AdapterSlots[]; agreement: SlotComparison } {
  const rows: AdapterSlots[] = inputs.map((x) => ({ ...x, slots: extractCanonicalSlots(x.transcript, menuItemNames) }));
  const first = rows[0]?.slots ?? { items: [], quantity: null, negation: false };
  const items = rows.every((r) => r.slots.items.length === first.items.length && r.slots.items.every((x, i) => x === first.items[i]));
  const quantity = rows.every((r) => r.slots.quantity === first.quantity);
  const negation = rows.every((r) => r.slots.negation === first.negation);
  return { rows, agreement: { items, quantity, negation, all: items && quantity && negation } };
}
