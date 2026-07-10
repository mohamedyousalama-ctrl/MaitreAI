// ============================================================================
// MaitreAI — Two-axis allergy-data coverage meter (WO-COMPANION W2) — PURE.
// The onboarding nudge: how many menu items have VERIFIED ingredient data and
// VERIFIED prep data, so an operator sees «٨ من ١٨ صنف مؤكّدة المكونات» and knows
// what's left. No order-volume field exists in the menu data, so "bestseller" is
// approximated by the full available menu (or a caller-supplied subset).
//
// "Verified" = the review STAMP is present (axis 1: allergensReviewedAt; axis 2:
// prepVerifiedAt) — the same stamps the truth model and the editor use. Pure so the
// meter, the API, and the test share one definition.
// ============================================================================

import type { MenuItem } from "@/lib/types";

export interface AxisCoverage {
  /** Items considered (available menu items, or the caller's subset). */
  total: number;
  /** Items whose ingredient/allergen data is human-verified (axis-1 stamp present). */
  ingredientVerified: number;
  /** Items whose preparation data is human-verified (axis-2 stamp present). */
  prepVerified: number;
  /** Items verified on BOTH axes (fully companion-ready). */
  bothVerified: number;
}

/** Compute two-axis coverage over the given items (defaults to all available). Pure. */
export function computeAllergyCoverage(items: MenuItem[]): AxisCoverage {
  const considered = items.filter((i) => i.available !== false);
  let ing = 0, prep = 0, both = 0;
  for (const i of considered) {
    const ingOk = !!i.allergensReviewedAt;
    const prepOk = !!i.prepVerifiedAt;
    if (ingOk) ing++;
    if (prepOk) prep++;
    if (ingOk && prepOk) both++;
  }
  return { total: considered.length, ingredientVerified: ing, prepVerified: prep, bothVerified: both };
}

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
const toAr = (n: number): string => String(n).replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)]);

/** «٨ من ١٨ صنف مؤكّدة المكونات» / «… مؤكّدة التحضير» — the operator-facing lines. */
export function coverageLabelsAr(c: AxisCoverage): { ingredient: string; prep: string } {
  return {
    ingredient: `${toAr(c.ingredientVerified)} من ${toAr(c.total)} صنف مؤكّدة المكونات`,
    prep: `${toAr(c.prepVerified)} من ${toAr(c.total)} صنف مؤكّدة التحضير`,
  };
}
