// ============================================================================
// MaitreAI — Two-axis menu allergy-data writers (WO-COMPANION W2) — SERVER helper.
// The companion-gated write path for per-dish ingredient×preparation data. Used by
// the console_v2 dashboard editor (direct manager write + verify-stamp) and the
// gated change-request apply. Deliberately SEPARATE from the shared updateMenuItemDb
// so the legacy/flag-off write paths stay byte-identical.
//
// DEPLOY-SAFE (the #409 standing verification point): every write that touches a 0083
// column PROBES for the undefined-column signal (Postgres 42703) and returns
// { columnsMissing: true } instead of throwing — so code that lands before the apply
// degrades gracefully, never crashes.
//
// VERIFY-STAMP DISCIPLINE (PM ruling A): a content EDIT to an axis CLEARS that axis's
// review stamp (allergens_reviewed_at for ingredient/allergen; prep_verified_at for
// prep) — verification attaches to specific content and must never survive a change.
// A separate VERIFY action re-stamps it. Two axes, symmetric.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidAllergenKey } from "@/lib/ai/allergen-vocab";
import { sanitizeCrossContactTags, isValidPrepStatus, isValidKitchenCanIsolate } from "@/lib/ai/allergen-prep-vocab";

const UNDEFINED_COLUMN = "42703";
function isColumnMissing(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === UNDEFINED_COLUMN || /column .* does not exist|does not exist/i.test(error.message ?? ""));
}

export interface AxisWriteResult {
  ok: boolean;
  /** A 0083 column is not applied yet → the caller reports "feature not provisioned". */
  columnsMissing?: boolean;
  error?: string;
}

export interface IngredientAxisPatch {
  ingredients?: string[];
  /** Canonical allergen keys (validated against the controlled vocab). */
  allergens?: string[];
}

/**
 * Axis 1 (ingredient/allergen) EDIT: write ingredients/allergens and CLEAR the
 * allergen review stamp (a content change invalidates the verification). The
 * ingredient/allergen columns predate 0083, so this write is always applicable
 * (no columnsMissing branch for the plain fields; the stamp columns are 0055).
 */
export async function saveIngredientAxis(
  admin: SupabaseClient,
  restaurantId: string,
  itemId: string,
  patch: IngredientAxisPatch
): Promise<AxisWriteResult> {
  const update: Record<string, unknown> = {};
  if (patch.ingredients !== undefined) update.ingredients = patch.ingredients;
  if (patch.allergens !== undefined) {
    for (const a of patch.allergens) {
      if (!isValidAllergenKey(a)) return { ok: false, error: "invalid_allergen" };
    }
    update.allergens = [...new Set(patch.allergens)];
  }
  if (!Object.keys(update).length) return { ok: true };
  // Ruling A — a content edit CLEARS the axis-1 verify stamp.
  update.allergens_reviewed_at = null;
  update.allergens_reviewed_by = null;
  update.updated_at = new Date().toISOString();
  const { error } = await admin.from("menu_items").update(update).eq("id", itemId).eq("restaurant_id", restaurantId);
  return { ok: !error, error: error?.message };
}

/** Axis 1 VERIFY: stamp the allergen review (mirrors the existing allergens-review
 *  route). The manager confirms the current ingredient/allergen data is kitchen-true. */
export async function verifyIngredientAxis(
  admin: SupabaseClient,
  restaurantId: string,
  itemId: string,
  verifiedBy: string
): Promise<AxisWriteResult> {
  const now = new Date().toISOString();
  const { error } = await admin
    .from("menu_items")
    .update({ allergens_reviewed_at: now, allergens_reviewed_by: verifiedBy, updated_at: now })
    .eq("id", itemId)
    .eq("restaurant_id", restaurantId);
  return { ok: !error, error: error?.message };
}

export interface PrepAxisPatch {
  prepStatus?: string | null;
  crossContactRisks?: string[];
  kitchenCanIsolate?: string | null;
  preparationNotes?: string | null;
}

/**
 * Axis 2 (preparation) EDIT: write the prep fields and CLEAR the prep verify stamp.
 * DEPLOY-SAFE — touches 0083 columns, so a missing column → { columnsMissing: true }.
 */
export async function savePrepAxis(
  admin: SupabaseClient,
  restaurantId: string,
  itemId: string,
  patch: PrepAxisPatch
): Promise<AxisWriteResult> {
  const update: Record<string, unknown> = {};
  if (patch.prepStatus !== undefined) {
    if (patch.prepStatus !== null && !isValidPrepStatus(patch.prepStatus)) return { ok: false, error: "invalid_prep_status" };
    update.prep_status = patch.prepStatus;
  }
  if (patch.crossContactRisks !== undefined) update.cross_contact_risks = sanitizeCrossContactTags(patch.crossContactRisks);
  if (patch.kitchenCanIsolate !== undefined) {
    if (patch.kitchenCanIsolate !== null && !isValidKitchenCanIsolate(patch.kitchenCanIsolate)) return { ok: false, error: "invalid_isolate" };
    update.kitchen_can_isolate = patch.kitchenCanIsolate;
  }
  if (patch.preparationNotes !== undefined) update.preparation_notes = patch.preparationNotes;
  if (!Object.keys(update).length) return { ok: true };
  // Ruling A — a content edit CLEARS the axis-2 verify stamp.
  update.prep_verified_at = null;
  update.prep_verified_by = null;
  update.updated_at = new Date().toISOString();
  const { error } = await admin.from("menu_items").update(update).eq("id", itemId).eq("restaurant_id", restaurantId);
  if (isColumnMissing(error)) return { ok: false, columnsMissing: true };
  return { ok: !error, error: error?.message };
}

/** Axis 2 VERIFY: stamp the prep review. DEPLOY-SAFE (0083 columns). */
export async function verifyPrepAxis(
  admin: SupabaseClient,
  restaurantId: string,
  itemId: string,
  verifiedBy: string
): Promise<AxisWriteResult> {
  const now = new Date().toISOString();
  const { error } = await admin
    .from("menu_items")
    .update({ prep_verified_at: now, prep_verified_by: verifiedBy, updated_at: now })
    .eq("id", itemId)
    .eq("restaurant_id", restaurantId);
  if (isColumnMissing(error)) return { ok: false, columnsMissing: true };
  return { ok: !error, error: error?.message };
}
