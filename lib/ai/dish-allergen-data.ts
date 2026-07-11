// ============================================================================
// MaitreAI — MenuItem → DishAllergenData mapper (WO-COMPANION W2) — PURE.
// The bridge that lets W1's two-axis truth model (computeDishTruthState, unchanged)
// read the W2 per-dish data. W1 shipped the READER; this is the adapter that feeds
// it the real MenuItem fields so the honest truth-states light up as data lands.
//
// Consulted ONLY from the companion §6 checkpoint (respond.ts), which runs only when
// allergy_companion_mode is ON — so flag-off behavior is byte-identical. Deploy-safe:
// every field is optional; a pre-0083 MenuItem (no axis-2 fields) maps to the same
// "unknown"-resolving shape W1 used, so nothing regresses before the data exists.
//
// VERIFICATION SEMANTICS (spec §2 + PM ruling A): the "verified" axes are the review
// STAMPS — allergensReviewedAt (axis 1: ingredient/allergen) and prepVerifiedAt (axis
// 2: preparation). Editing an axis CLEARS its stamp (server-side), so a stale badge
// can never survive a content change; here we simply reflect the stamp's presence.
// ============================================================================

import type { MenuItem } from "@/lib/types";
import type { DishAllergenData, PrepStatus } from "@/lib/ai/allergen-companion";
import { isValidPrepStatus } from "@/lib/ai/allergen-prep-vocab";

/** Map a MenuItem (or nothing) to the DishAllergenData shape computeDishTruthState
 *  reads. Pure + defensive: a null item, or an item without any W2 data, resolves to
 *  the W1 "unknown" behavior (ingredientVerified only true when the allergen review
 *  stamp is present; prep unknown/unverified). */
export function dishDataFromMenuItem(item: MenuItem | null | undefined): DishAllergenData {
  if (!item) return { allergens: null };
  const prep = item.prepStatus && isValidPrepStatus(item.prepStatus) ? (item.prepStatus as PrepStatus) : "unknown";
  return {
    allergens: item.allergens ?? null,
    // Axis 1 verified ⇔ the allergen review stamp is present (existing pattern).
    ingredientVerified: !!item.allergensReviewedAt,
    ingredients: item.ingredients ?? null,
    // Axis 2.
    prepStatus: prep,
    // Axis 2 verified ⇔ the prep review stamp is present.
    prepVerified: !!item.prepVerifiedAt,
  };
}
