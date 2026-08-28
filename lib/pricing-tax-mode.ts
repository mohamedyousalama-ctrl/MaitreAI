// ============================================================================
// MaitreAI — the tax-mode union and its narrowing gate.
//
// DELIBERATELY NOT IN lib/order-pricing.ts. That module is `server-only`, and
// lib/db/brain.ts — which must carry a typed `taxMode` — is reachable from the
// console's client stores (lib/order-store.ts → lib/store.ts → lib/db/brain.ts).
// A value import of a server-only module from that chain throws at bundle time.
// The union and its narrowing are pure, so they live here and order-pricing
// re-exports them; nothing needs to know which module it came from.
// ============================================================================

export type PricingTaxMode = "inclusive" | "added";

/** Narrow an unchecked `restaurants.tax_mode` read into the real union.
 *
 *  This type used to be declared `"inclusive" | "added" | string`, which TypeScript
 *  collapses to plain `string` — so the union documented an intent it did not enforce,
 *  and every DB read flowed in unchecked. `computeTax` adds VAT only on an exact
 *  `=== "added"` match, so ANY unrecognised value silently meant "prices already include
 *  tax": on a KSA tenant charging 15% on top, a typo would have Khalid state that the
 *  price includes VAT when it does not. A false statement about money, with nothing
 *  logged anywhere.
 *
 *  Migration 0122 adds the CHECK constraint that makes a bad value impossible at rest.
 *  This is the second layer: the fallback is unchanged, but it is no longer SILENT. */
export function asPricingTaxMode(value: unknown): PricingTaxMode {
  if (value === "added" || value === "inclusive") return value;
  if (value !== null && value !== undefined && value !== "") {
    console.error("[pricing] unrecognised tax_mode, treating prices as tax-inclusive", { value });
  }
  return "inclusive";
}
