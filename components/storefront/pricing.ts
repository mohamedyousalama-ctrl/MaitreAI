// ============================================================================
// MaitreAI — Storefront cart selections + PREVIEW pricing (Phase 3 Step 2).
// Browser-only. A cart line stores SELECTIONS BY ID (variant id, option ids,
// modifier ids, qty) — never a final number. Prices here are a PREVIEW only,
// recomputed straight from the loaded menu data (item/variant/option/modifier);
// nothing is invented. The authoritative total is recomputed server-side at
// checkout (Step 3) from these same ids.
// ============================================================================

import type { MenuItem, Modifier } from "@/lib/types";

export interface Selection {
  variantId: string | null;
  optionIds: string[]; // chosen choice-group option ids (across all groups)
  modifierIds: string[];
}

export interface CartLine extends Selection {
  lineId: string; // unique per cart line
  itemId: string;
  quantity: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function activeVariants(item: MenuItem) {
  return (item.variants ?? []).filter((v) => v.active);
}

export function itemModifiers(item: MenuItem, modifiers: Modifier[]) {
  return modifiers.filter((m) => m.active && item.modifierIds.includes(m.id));
}

function allOptions(item: MenuItem) {
  return (item.choiceGroups ?? []).flatMap((g) => g.options);
}

/** Unit price = variant price (or base) + chosen option deltas + chosen modifier impacts. */
export function unitPrice(item: MenuItem, sel: Selection, modifiers: Modifier[]): number {
  const variant = activeVariants(item).find((v) => v.id === sel.variantId);
  const base = variant ? variant.price : item.price;
  const optionDelta = allOptions(item)
    .filter((o) => o.active && sel.optionIds.includes(o.id))
    .reduce((s, o) => s + o.priceDelta, 0);
  const modifierDelta = itemModifiers(item, modifiers)
    .filter((m) => sel.modifierIds.includes(m.id))
    .reduce((s, m) => s + m.priceImpact, 0);
  return round2(base + optionDelta + modifierDelta);
}

export function lineTotal(item: MenuItem, line: CartLine, modifiers: Modifier[]): number {
  return round2(unitPrice(item, line, modifiers) * line.quantity);
}

export function cartSubtotal(lines: CartLine[], itemById: Map<string, MenuItem>, modifiers: Modifier[]): number {
  return round2(
    lines.reduce((s, l) => {
      const item = itemById.get(l.itemId);
      return item ? s + lineTotal(item, l, modifiers) : s;
    }, 0)
  );
}

/** Human-readable list of the chosen options for a line (variant, picks, add-ons). */
export function selectionSummary(item: MenuItem, sel: Selection, modifiers: Modifier[]): string[] {
  const parts: string[] = [];
  const variant = activeVariants(item).find((v) => v.id === sel.variantId);
  if (variant) parts.push(variant.name);
  for (const g of item.choiceGroups ?? []) {
    for (const o of g.options) if (sel.optionIds.includes(o.id)) parts.push(o.label);
  }
  for (const m of itemModifiers(item, modifiers)) if (sel.modifierIds.includes(m.id)) parts.push(m.name);
  return parts;
}

/** Whether a selection satisfies required size + each group's min/max. */
export function isSelectionValid(item: MenuItem, sel: Selection): boolean {
  if (activeVariants(item).length > 0 && !sel.variantId) return false;
  for (const g of item.choiceGroups ?? []) {
    const n = g.options.filter((o) => o.active && sel.optionIds.includes(o.id)).length;
    if (n < g.minSelect || n > g.maxSelect) return false;
  }
  return true;
}

export function newLineId(): string {
  return `l_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
