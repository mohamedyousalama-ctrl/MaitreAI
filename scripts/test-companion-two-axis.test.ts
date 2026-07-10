// ============================================================================
// WO-COMPANION-W2 — two-axis data unit suite. RED-FIRST: imports the W2 mapper +
// vocab that DO NOT EXIST on main, so on the pre-W2 tree the import throws and every
// leg is RED. Proves the "light-up" (PM ruling C): populated MenuItem fields →
// computeDishTruthState surfaces verified-no / verified-yes, computeDishTruthState
// itself UNCHANGED. Also proves the vocab validators + the stamp-clear degrade.
//
// Run: node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types \
//        scripts/test-companion-two-axis.test.ts
// ============================================================================

import { computeDishTruthState } from "../lib/ai/allergen-companion.ts";
import { dishDataFromMenuItem } from "../lib/ai/dish-allergen-data.ts";
import {
  CROSS_CONTACT_TAGS,
  isValidCrossContactTag,
  isValidPrepStatus,
  isValidKitchenCanIsolate,
  sanitizeCrossContactTags,
  crossContactLabelAr,
  prepStatusLabelAr,
} from "../lib/ai/allergen-prep-vocab.ts";
import type { MenuItem } from "../lib/types.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("  ✗", n); } };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function item(over: Partial<MenuItem> = {}): MenuItem {
  return {
    id: "i1", name: "جريش", category: "أطباق", price: 20, available: true,
    description: "", imageUrl: "", modifierIds: [], ingredients: [], allergens: [],
    ...over,
  } as MenuItem;
}

// ── VOCAB — the controlled prep vocabulary ──────────────────────────────────
ok("vocab: 8 cross-contact tags (spec §2)", CROSS_CONTACT_TAGS.length === 8);
ok("vocab: shared_fryer is valid", isValidCrossContactTag("shared_fryer"));
ok("vocab: off-list tag rejected", !isValidCrossContactTag("shared_microwave"));
ok("vocab: prep_status enum", isValidPrepStatus("controlled") && isValidPrepStatus("shared_risk") && isValidPrepStatus("unknown") && !isValidPrepStatus("safe"));
ok("vocab: kitchen_can_isolate enum", isValidKitchenCanIsolate("yes") && !isValidKitchenCanIsolate("maybe"));
ok("vocab: sanitize drops off-list + dedups", JSON.stringify(sanitizeCrossContactTags(["shared_oil", "bogus", "shared_oil"])) === JSON.stringify(["shared_oil"]));
ok("vocab: Arabic labels present", crossContactLabelAr("shared_fryer").length > 0 && prepStatusLabelAr("controlled").length > 0);

// ── LIGHT-UP (ruling C) — populated fields surface honest truth-states ──────
// Pre-0083 item (no W2 data, no review stamp) → UNKNOWN (W1 default preserved).
ok("light-up: bare item (no data) → unknown",
  computeDishTruthState(dishDataFromMenuItem(item()), "بيض") === "unknown");

// Ingredient data lists the allergen → CONTAINS (recommend against).
ok("light-up: allergen listed → contains",
  computeDishTruthState(dishDataFromMenuItem(item({ allergens: ["بيض"], allergensReviewedAt: "2026-01-01T00:00:00Z" })), "بيض") === "contains");

// Ingredients present + axis-1 verified, but prep unknown → CLEAR_PREP_UNKNOWN
// (data shows no X as ingredient, but preparation not confirmed — verified-NO-yet).
ok("light-up: ingredients verified + prep unknown → clear_prep_unknown",
  computeDishTruthState(dishDataFromMenuItem(item({ ingredients: ["دجاج", "رز"], allergensReviewedAt: "2026-01-01T00:00:00Z" })), "بيض") === "clear_prep_unknown");

// BOTH axes verified clear → CLEAR_VERIFIED (the strongest DATA statement).
ok("light-up: both axes verified → clear_verified",
  computeDishTruthState(dishDataFromMenuItem(item({
    ingredients: ["دجاج", "رز"], allergensReviewedAt: "2026-01-01T00:00:00Z",
    prepStatus: "controlled", prepVerifiedAt: "2026-01-02T00:00:00Z",
  })), "بيض") === "clear_verified");

// Severe allergen + shared-risk prep → SEVERE_SHARED_RISK (lean protective).
ok("light-up: severe + shared_risk prep → severe_shared_risk",
  computeDishTruthState(dishDataFromMenuItem(item({
    ingredients: ["دجاج"], allergensReviewedAt: "2026-01-01T00:00:00Z", prepStatus: "shared_risk",
  })), "فول سوداني", true) === "severe_shared_risk");

// ── STAMP-CLEAR DEGRADE (ruling A) — clearing a stamp degrades the truth-state ──
// Axis-1: a dish whose ingredient data rests on the REVIEW STAMP (allergens confirmed,
// no separate ingredients list — the real «kitchen confirmed no egg» case). Editing
// the allergens clears the stamp → the dish falls back to UNKNOWN (can't confirm).
{
  const stampOnly = item({ allergens: [], allergensReviewedAt: "2026-01-01T00:00:00Z", prepStatus: "controlled", prepVerifiedAt: "2026-01-02T00:00:00Z" });
  ok("degrade: stamp-verified dish → clear_verified", computeDishTruthState(dishDataFromMenuItem(stampOnly), "بيض") === "clear_verified");
  const afterEdit = { ...stampOnly, allergensReviewedAt: null }; // server nulls the stamp on edit
  ok("degrade: axis-1 stamp cleared → degrades to unknown (badge can't outlive content)",
    computeDishTruthState(dishDataFromMenuItem(afterEdit), "بيض") === "unknown");
}
// Axis-2: both axes verified → clear_verified; a prep edit clears the prep stamp →
// drops to clear_prep_unknown (ingredient data still stands).
{
  const verified = item({ ingredients: ["دجاج", "رز"], allergensReviewedAt: "2026-01-01T00:00:00Z", prepStatus: "controlled", prepVerifiedAt: "2026-01-02T00:00:00Z" });
  ok("degrade: both-axes-verified dish → clear_verified", computeDishTruthState(dishDataFromMenuItem(verified), "بيض") === "clear_verified");
  const afterPrepEdit = { ...verified, prepVerifiedAt: null };
  ok("degrade: axis-2 stamp cleared → drops to clear_prep_unknown",
    computeDishTruthState(dishDataFromMenuItem(afterPrepEdit), "بيض") === "clear_prep_unknown");
}

// ── computeDishTruthState UNCHANGED — pure-fn contract (ruling C: logic fixed) ──
ok("truth-model unchanged: raw DishAllergenData still resolves as W1 documented",
  computeDishTruthState({ ingredients: ["دجاج"], ingredientVerified: true, prepStatus: "controlled", prepVerified: true }, "بيض") === "clear_verified");

console.log(`\nCOMPANION-TWO-AXIS UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
