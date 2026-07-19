// ============================================================================
// MaitreAI — Memory allergy gate (PURE, no I/O).
// Converts stored customer-memory allergy notes into kitchen-readable allergen
// labels, then checks the current draft against real menu allergen data.
// ============================================================================

import type { MenuItem } from "@/lib/types";
import type { OrderDraft } from "@/lib/ai/tools";
import {
  ALLERGENS,
  canonicalToArLabel,
  mapAllergenValue,
  type AllergenKey,
} from "@/lib/ai/allergen-vocab";
import {
  computeDishTruthState,
  parseAllergyNote,
  type DishAllergenData,
  type DishTruthState,
} from "@/lib/ai/allergen-companion";
import { normalizeAr } from "@/lib/ai/allergen-gate";
import { dishDataFromMenuItem } from "@/lib/ai/dish-allergen-data";

export interface MemoryAllergyGateMatch {
  allergen: string;
  itemName: string;
  state: Extract<DishTruthState, "contains" | "escalation_required">;
}

export interface MemoryAllergyGateHit {
  fired: boolean;
  term: string | null;
  matchedAllergens: string[];
  itemNames: string[];
  matches: MemoryAllergyGateMatch[];
}

export const EMPTY_MEMORY_ALLERGY_GATE_HIT: MemoryAllergyGateHit = {
  fired: false,
  term: null,
  matchedAllergens: [],
  itemNames: [],
  matches: [],
};

function unique(values: string[]): string[] {
  const out: string[] = [];
  for (const value of values.map((v) => v.trim()).filter(Boolean)) {
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termRegex(term: string): RegExp {
  const flexible = normalizeAr(term).split(" ").map(escapeReg).join(" (?:ال)?");
  return new RegExp(`(?<![ء-ي])(?:ال)?${flexible}(?![ء-ي])`);
}

function textMentionsTerm(text: string, term: string): boolean {
  const n = normalizeAr(text);
  const t = normalizeAr(term);
  if (!n || !t) return false;
  return termRegex(t).test(n);
}

function allergenKeyToLabel(key: AllergenKey): string {
  return canonicalToArLabel(key) ?? key;
}

function keyFor(value: string): AllergenKey | null {
  return mapAllergenValue(value);
}

function labelsMentionedInText(text: string): string[] {
  const labels: string[] = [];
  const direct = keyFor(text);
  if (direct) labels.push(allergenKeyToLabel(direct));

  for (const def of ALLERGENS) {
    const terms = [def.key, def.arLabel, def.enLabel, ...def.gateTerms, ...def.aliases];
    if (terms.some((term) => textMentionsTerm(text, term))) {
      labels.push(def.arLabel);
    }
  }

  return unique(labels);
}

function memoryNotePieces(note: string): string[] {
  return unique([
    ...parseAllergyNote(note),
    ...note.split(/[،,;\n]/g),
    note,
  ]);
}

/** Extract deterministic allergen labels from customer_memory.inferred. */
export function extractMemoryAllergyLabels(inferred: unknown): string[] {
  const source = inferred && typeof inferred === "object"
    ? (inferred as { allergy_notes?: unknown }).allergy_notes
    : null;
  const notes = Array.isArray(source)
    ? source.filter((v): v is string => typeof v === "string")
    : typeof source === "string"
      ? [source]
      : [];

  const labels: string[] = [];
  for (const note of notes) {
    for (const piece of memoryNotePieces(note)) {
      labels.push(...labelsMentionedInText(piece));
    }
  }
  return unique(labels);
}

function dataMentionsAllergen(values: string[] | null | undefined, allergen: string): boolean {
  if (!Array.isArray(values)) return false;
  const targetKey = keyFor(allergen);
  return values.some((value) => {
    const valueKey = keyFor(value);
    if (targetKey && valueKey) return targetKey === valueKey;
    return textMentionsTerm(value, allergen) || textMentionsTerm(allergen, value);
  });
}

function memoryAllergyDishState(
  data: DishAllergenData,
  item: MenuItem,
  allergen: string
): Extract<DishTruthState, "contains" | "escalation_required"> | null {
  if (dataMentionsAllergen(data.allergens, allergen) || dataMentionsAllergen(data.ingredients, allergen)) {
    return "contains";
  }
  const state = computeDishTruthState(data, allergen);
  if (state === "contains") return "contains";
  if (
    state === "escalation_required" &&
    (dataMentionsAllergen(data.crossContactRisks, allergen) ||
      (typeof item.preparationNotes === "string" && textMentionsTerm(item.preparationNotes, allergen)))
  ) {
    return "escalation_required";
  }
  return null;
}

/**
 * Memory-sourced allergies arm the deterministic gate only when a stored allergen
 * intersects the current draft's real menu allergen/cross-contact data. Unknown or
 * verified-clear items do not fire.
 */
export function detectMemoryAllergyDraftIntersection(input: {
  memoryAllergens: string[];
  draft: OrderDraft | null | undefined;
  menuItems: MenuItem[];
}): MemoryAllergyGateHit {
  const memoryAllergens = unique(input.memoryAllergens);
  const lines = input.draft?.lines ?? [];
  if (!memoryAllergens.length || !lines.length) return EMPTY_MEMORY_ALLERGY_GATE_HIT;

  const byId = new Map(input.menuItems.map((item) => [item.id, item]));
  const matches: MemoryAllergyGateMatch[] = [];
  for (const line of lines) {
    const item = byId.get(line.itemId);
    if (!item) continue;
    const data = dishDataFromMenuItem(item);
    for (const allergen of memoryAllergens) {
      const state = memoryAllergyDishState(data, item, allergen);
      if (!state) continue;
      matches.push({ allergen, itemName: item.name || line.name, state });
    }
  }

  if (!matches.length) return EMPTY_MEMORY_ALLERGY_GATE_HIT;
  const matchedAllergens = unique(matches.map((match) => match.allergen));
  return {
    fired: true,
    term: matchedAllergens[0] ?? null,
    matchedAllergens,
    itemNames: unique(matches.map((match) => match.itemName)),
    matches,
  };
}
