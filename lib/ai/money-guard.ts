// ============================================================================
// MaitreAI — Money-truth guard (pure, no runtime deps — unit-testable)
// Distinguishes the agent's CORE job (describing the menu with its real prices)
// from the danger the guard exists to stop (asserting a fabricated/computed
// ORDER TOTAL without the pricing tool). Used by lib/ai/respond.ts after the
// turn loop. Money in the actual order flow still comes from the order tools.
// ============================================================================

import type { BrainContext } from "./prompt";

// Order-TOTAL phrasing: a claim about the order's combined/sum amount. Stating
// one of these without the pricing tool is the real danger (a fabricated or
// computed total) — always blocked when no money tool ran this turn.
export const TOTAL_PHRASE =
  /(الإجمالي|الاجمالي|إجمالي|اجمالي|المجموع|الصافي|المبلغ الكلي|كله بـ|الكل بـ|الطلب بـ|طلبك بـ|total|subtotal)/iu;

/** Normalize Arabic-Indic / Eastern digits to Western so amounts can be parsed. */
export function toWesternDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

/** Money amounts in the reply: only numbers ADJACENT to a currency token, so
 *  quantities like «٦ قطع» or «الساعة ١١» are ignored (they aren't prices). */
export function currencyAdjacentAmounts(text: string, currency: string): number[] {
  const t = toWesternDigits(text);
  const cur = currency.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const curTok = `(?:${cur}|ج\\.?\\s?م|ر\\.?\\s?س|ريال|جنيه|جنيهاً|جنيها)`;
  const re = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${curTok}|${curTok}\\s*(\\d+(?:[.,]\\d+)?)`, "giu");
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const num = m[1] ?? m[2];
    if (num) out.push(parseFloat(num.replace(",", ".")));
  }
  return out;
}

/** Every real price the model may quote, from the live brain data: item /
 *  variant prices, choice deltas, modifier impacts, delivery fees/minimums.
 *  Quoting one of these while DESCRIBING the menu is legitimate (Type 1). */
export function knownMenuPrices(
  brain: Pick<BrainContext, "menuItems" | "modifiers" | "deliveryAreas">
): Set<number> {
  const s = new Set<number>();
  const add = (n: number) => { if (Number.isFinite(n) && n > 0) s.add(Math.round(n * 100) / 100); };
  for (const i of brain.menuItems) {
    add(i.price);
    for (const v of i.variants ?? []) add(v.price);
    for (const g of i.choiceGroups ?? []) for (const o of g.options) add(o.priceDelta);
  }
  for (const m of brain.modifiers) add(m.priceImpact);
  for (const z of brain.deliveryAreas) { add(z.deliveryFee); add(z.minOrder); }
  return s;
}

export function isKnownPrice(amount: number, known: Set<number>): boolean {
  for (const p of known) if (Math.abs(p - amount) < 0.5) return true;
  return false;
}

// --- non-menu product guard -------------------------------------------------
// PROACTIVELY offering a product that isn't on the menu (e.g. upselling a cola
// when the menu lists no soft drinks) is a fabrication the price guard can't
// catch (no number). We block ONLY a proactive upsell ("تحب أضيف…") of a known
// drink term that does NOT appear in any menu item name. Declining a non-menu
// item the customer ASKED for is unaffected (no upsell phrasing).
const UPSELL_CONTEXT =
  /(تحب\s+(?:أضيف|اضيف|تضيف|نضيف|تزود|نزود)|[أا]ضيف?لك|نضيف?لك|تحب\s+معاه|نزوّد|أزوّدك|ضيف\s+علي|تكمّلها\s+بـ|تحب\s+تضيف|عايز\s+تضيف|أضيف\s+معاه)/u;
// Common upsellable drinks frequently absent from a menu. Catching these (not an
// open-ended product list) keeps the guard conservative and false-positive-safe.
const NON_MENU_DRINK_TERMS = [
  "كوكاكولا", "كوكا كولا", "كوكا", "كولا", "بيبسي", "سفن اب", "سفن أب", "سفن", "سبرايت",
  "صودا", "سودا", "مشروب غازي", "مشروبات غازية", "فانتا", "ميرندا", "شويبس", "عصير",
  "ميلك شيك", "ميلكشيك", "موهيتو", "ايس تي", "آيس تي",
];

function stripDiacritics(s: string): string {
  return s.replace(/[ًٌٍَُِّْـ]/g, "");
}

/**
 * Returns the offending term when the reply PROACTIVELY offers/upsells a drink
 * that is not present in any menu item name; null otherwise. The caller replaces
 * such a reply with a safe pivot so the agent never invents a product.
 */
export function offersNonMenuProduct(text: string, menuItemNames: string[]): string | null {
  if (!UPSELL_CONTEXT.test(text)) return null;
  const t = stripDiacritics(text);
  const names = stripDiacritics(menuItemNames.join(" | "));
  for (const term of NON_MENU_DRINK_TERMS) {
    const bare = stripDiacritics(term);
    if (t.includes(bare) && !names.includes(bare)) return term;
  }
  return null;
}

/**
 * Money-truth guard. Returns true when the reply asserts money it shouldn't:
 *  - Type 2 (BLOCK): an order-total claim (sum/total phrasing) without the
 *    pricing tool, OR any currency amount that does NOT match a real menu price
 *    (an invented or computed figure).
 *  - Type 1 (ALLOW): currency amounts that all match real menu prices, in a
 *    descriptive (non-total) reply — i.e. the agent describing the menu.
 * Call only when NO money tool ran this turn; when one did, the figures came
 * from the tool and must be trusted (caller checks usedMoneyTool first).
 */
export function fabricatesMoney(text: string, currency: string, known: Set<number>): boolean {
  const t = toWesternDigits(text);
  if (TOTAL_PHRASE.test(t)) return true; // order-total claim without a tool
  const amounts = currencyAdjacentAmounts(text, currency);
  return amounts.some((a) => !isKnownPrice(a, known));
}
