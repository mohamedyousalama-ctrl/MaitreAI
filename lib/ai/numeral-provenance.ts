// ============================================================================
// MaitreAI — WO-V1.0-GOAL-LOGIC (Slice 1): the FINAL VALIDATOR — numeral-provenance guard.
//
// PURE (no I/O). Doctrine §3C: every customer-facing numeral must trace to an allowed source —
//   {C} customer message · {M} verified menu (THIS item's real price/qty) · {Q} quote engine
//   (tool-computed totals/fees/tax) · {D} verified delivery/promo · ({P} planner — Slice 2).
// Any untraceable numeral is BLOCKED and the reply regenerated without it (the caller then
// tool-routes a price or strips a stray). This is the real root-fix for the fabricated-numeral
// class («عرض كاديا — ١٥٠» when كاديا is really ٣٢٠) — STRONGER than fabricatesMoney, which only
// asked "is 150 a menu price somewhere?" (yes → it slipped through).
//
// Three composed locks:
//   1. PAIR-BINDING (supersedes WO-LIVE6-PRICE-TRUTH): a numeral bound to a NAMED item must
//      equal THAT item's {M} price — else it's untraceable and regenerated to the {M} value.
//   2. SET-MEMBERSHIP (generalizes fabricatesMoney): any remaining currency-adjacent numeral
//      not in {C}∪{M}∪{Q}∪{D} → BLOCKED (reported to the caller for tool-route / strip).
//   3. BANNED-WORD SCRUB (banned-words.ts): the waiter-jargon net, at the very end.
//
// The pure module reports the analysis + the pair-repaired, scrubbed text; the caller
// (respond.ts, flag goal_logic) performs the terminal block→regenerate action (tool-route a
// price numeral, strip a stray one) — bounded, never a canned line, never a loop.
// ============================================================================

import type { MenuItem } from "@/lib/types";
import { repairPriceTruth } from "./price-truth";
import { currencyAdjacentAmounts } from "./money-guard";
import { scrubBannedWords } from "./banned-words";

export interface NumeralSources {
  /** {C} numerals the customer said this turn. */
  customer: number[];
  /** {Q} tool-computed numerals this turn (usedMoneyTool outputs — totals/fees/tax). */
  tool: number[];
  /** {D} verified delivery/promo numerals (zone fees, minimums, promo amounts). */
  deliveryPromo: number[];
}

export interface NumeralValidation {
  /** Pair-repaired + banned-scrubbed text (the {M}-traceable regeneration of mis-bound prices). */
  text: string;
  /** Item→price mis-attributions repaired to the item's {M} price (the «150»→«320» class). */
  repaired: { item: string; quoted: number; real: number }[];
  /** Currency-adjacent numerals with NO provenance — the caller must tool-route or strip these. */
  blocked: number[];
  /** Banned waiter-jargon words rewritten to host language. */
  scrubbed: string[];
}

/** {M} — every verified menu numeral: item base + variant prices, choice deltas, modifier
 *  impacts. (Menu quantities like «٦ قطع» live in the item name/prose and are treated as
 *  customer/menu text, not currency numerals — the guard only judges currency-adjacent numbers.) */
function verifiedMenuNumerals(items: MenuItem[]): Set<number> {
  const s = new Set<number>();
  const add = (n: number) => { if (Number.isFinite(n) && n > 0) s.add(Math.round(n * 100) / 100); };
  for (const i of items) {
    add(i.price);
    for (const v of i.variants ?? []) add(v.price);
    for (const g of i.choiceGroups ?? []) for (const o of g.options) add(o.priceDelta);
  }
  return s;
}

function inAllowed(n: number, allowed: Set<number>): boolean {
  for (const a of allowed) if (Math.abs(a - n) < 0.5) return true;
  return false;
}

/**
 * Validate every customer-facing numeral against its provenance. Returns the pair-repaired +
 * banned-scrubbed text, the repairs applied, the untraceable numerals the caller must act on,
 * and the banned words scrubbed. Pure; the caller performs the terminal block→regenerate.
 */
export function validateNumerals(args: {
  text: string;
  currency: string;
  menuItems: MenuItem[];
  sources: NumeralSources;
}): NumeralValidation {
  const { text, currency, menuItems, sources } = args;
  if (!text || !text.trim()) return { text, repaired: [], blocked: [], scrubbed: [] };

  // Lock 1 — pair-binding: repair a numeral bound to a NAMED item to that item's {M} price.
  const pt = repairPriceTruth(text, currency, menuItems);
  const repaired = pt.repairs.map((r) => ({ item: r.item, quoted: r.quoted, real: r.real }));
  let out = pt.text;

  // Lock 2 — set-membership: the allowed provenance set {C}∪{M}∪{Q}∪{D}. Any currency-adjacent
  // numeral in the (already pair-repaired) text not in this set is untraceable → blocked.
  const allowed = new Set<number>();
  for (const n of sources.customer) if (Number.isFinite(n)) allowed.add(Math.round(n * 100) / 100);
  for (const n of sources.tool) if (Number.isFinite(n)) allowed.add(Math.round(n * 100) / 100);
  for (const n of sources.deliveryPromo) if (Number.isFinite(n)) allowed.add(Math.round(n * 100) / 100);
  for (const n of verifiedMenuNumerals(menuItems)) allowed.add(n);

  const blocked: number[] = [];
  for (const amt of currencyAdjacentAmounts(out, currency)) {
    if (!inAllowed(amt, allowed)) blocked.push(amt);
  }

  // Lock 3 — banned-word scrub (the very end).
  const scrub = scrubBannedWords(out);
  out = scrub.text;

  return { text: out, repaired, blocked, scrubbed: scrub.scrubbed };
}

/**
 * Terminal for the "block → regenerate" step (strip-for-stray): remove the currency token for
 * each BLOCKED (untraceable) amount from the text, leaving the surrounding host language intact
 * («التوصيل ٩٩٩ ج.م عندنا» → «التوصيل عندنا»). Deterministic; no second model call, no canned
 * line. A price the interpreter routed to the tool is already {Q}-traceable and never reaches
 * here; this only excises a fabricated numeral the model slipped in.
 */
export function stripBlockedNumerals(text: string, blocked: number[], currency: string): string {
  if (!blocked.length || !text) return text;
  const cur = currency.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const curTok = `(?:${cur}|ج\\.?\\s?م|ر\\.?\\s?س|ريال|جنيه)`;
  const DIG = "[0-9٠-٩۰-۹]+(?:[.,][0-9٠-٩۰-۹]+)?";
  let out = text;
  for (const amt of blocked) {
    // Match either «NNN cur» or «cur NNN», where NNN equals this blocked amount (post-normalize).
    const re = new RegExp(`(${DIG})\\s*${curTok}|${curTok}\\s*(${DIG})`, "gu");
    out = out.replace(re, (m, a, b) => {
      const numStr = a ?? b ?? "";
      const val = parseFloat(numStr.replace(/[٠-٩]/g, (d: string) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(",", "."));
      return Math.abs(val - amt) < 0.5 ? "" : m;
    });
  }
  return out.replace(/[ \t]{2,}/g, " ").replace(/\s+([،.!؟?])/g, "$1").trim();
}
