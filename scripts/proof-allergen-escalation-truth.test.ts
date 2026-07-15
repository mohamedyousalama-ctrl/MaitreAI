// KVO-002/003/004 proof: escalation markers and cross-contact risks cannot resolve clear.
// Run: node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types scripts/proof-allergen-escalation-truth.test.ts

import { readFileSync } from "node:fs";
import { computeDishTruthState, scanBannedAllergyPhrases, type DishTruthState } from "../lib/ai/allergen-companion.ts";
import { buildCheckpointRecap, truthStatePhrase } from "../lib/ai/allergen-companion-flow.ts";
import { dishDataFromMenuItem } from "../lib/ai/dish-allergen-data.ts";
import type { MenuItem } from "../lib/types.ts";

let pass = 0;
let fail = 0;

function ok(name: string, condition: boolean): void {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
    return;
  }

  fail += 1;
  console.error(`FAIL ${name}`);
}

function item(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: "pizza-bbq",
    name: "بيتزا باربكيو",
    category: "بيتزا",
    price: 45,
    available: true,
    description: "",
    imageUrl: "",
    modifierIds: [],
    ingredients: [],
    allergens: [],
    ...overrides,
  } as MenuItem;
}

function rankOf(source: string, state: DishTruthState): number | null {
  const match = source.match(new RegExp(`${state}:\\s*(\\d+)`));
  return match ? Number(match[1]) : null;
}

const escalationItem = item({
  ingredients: ["عجينة", "جبنة", "صوص باربكيو"],
  allergens: [],
  allergensReviewedAt: "2026-07-15T00:00:00Z",
  prepStatus: "controlled",
  prepVerifiedAt: "2026-07-15T00:00:00Z",
  preparationNotes: "⚠️ يتطلب تصعيد: صوص الباربكيو يحتاج تأكيد بخصوص البيض",
});
const escalationData = dishDataFromMenuItem(escalationItem);
const escalationState = computeDishTruthState(escalationData, "بيض");

ok("mapper detects Arabic escalation marker without requiring emoji", escalationData.requiresEscalation === true);
ok("escalation marker is first-class escalation_required", escalationState === "escalation_required");
ok("escalation marker does not resolve clear_verified", escalationState !== "clear_verified");
ok("explicit escalation marker wins even when allergen is directly listed",
  computeDishTruthState({ allergens: ["بيض"], requiresEscalation: true }, "بيض") === "escalation_required");

const crossContactData = dishDataFromMenuItem(item({
  ingredients: ["دجاج", "خبز"],
  allergens: [],
  allergensReviewedAt: "2026-07-15T00:00:00Z",
  prepStatus: "controlled",
  prepVerifiedAt: "2026-07-15T00:00:00Z",
  crossContactRisks: ["بيض"],
}));
const crossContactState = computeDishTruthState(crossContactData, "بيض");
ok("crossContactRisks on queried allergen resolves escalation_required", crossContactState === "escalation_required");
ok("crossContactRisks on queried allergen never resolves clear_*", !crossContactState.startsWith("clear_"));

for (const dialect of ["saudi", "egyptian"]) {
  const phrase = truthStatePhrase("escalation_required", dialect);
  ok(`truthStatePhrase escalation_required is explicit for ${dialect}`,
    phrase.includes("المطبخ") && phrase.includes("موظف") && phrase.includes("قبل ما نكمل"));
  ok(`truthStatePhrase escalation_required has no clear/free/safe wording for ${dialect}`,
    !/آمن|امن|خالي|clear|free|safe/i.test(phrase) && scanBannedAllergyPhrases(phrase).length === 0);
}

const recap = buildCheckpointRecap(["بيض"], [{ name: "بيتزا باربكيو", state: "escalation_required" }], "saudi");
ok("checkpoint recap carries escalation-required phrase", recap.includes("بيتزا باربكيو") && recap.includes("المطبخ") && recap.includes("موظف"));
ok("checkpoint recap never phrases escalation_required as clear/free/safe",
  !/آمن|امن|خالي|clear|free|safe/i.test(recap) && scanBannedAllergyPhrases(recap).length === 0);

const respondSource = readFileSync("lib/ai/respond.ts", "utf8");
const escalationRank = rankOf(respondSource, "escalation_required");
const containsRank = rankOf(respondSource, "contains");
ok("respond TRUTH_RANK gives escalation_required rank 6", escalationRank === 6);
ok("respond TRUTH_RANK ranks escalation_required above contains", escalationRank !== null && containsRank !== null && escalationRank > containsRank);
ok("respond checkpoint selection still takes the max rank",
  /TRUTH_RANK\[st\]\s*>\s*TRUTH_RANK\[worst\]/.test(respondSource));
ok("checkpoint-selection escalation_required wins over clear_verified by rank",
  ["clear_verified", "escalation_required"].reduce((worst, state) =>
    (rankOf(respondSource, state as DishTruthState) ?? 0) > (rankOf(respondSource, worst as DishTruthState) ?? 0)
      ? state
      : worst
  ) === "escalation_required");

ok("regression: direct listed allergen still returns contains",
  computeDishTruthState({ allergens: ["بيض"], ingredientVerified: true }, "بيض") === "contains");
ok("regression: no ingredient data still returns unknown",
  computeDishTruthState(dishDataFromMenuItem(item()), "بيض") === "unknown");
ok("regression: verified controlled clear item still returns clear_verified",
  computeDishTruthState(dishDataFromMenuItem(item({
    ingredients: ["دجاج", "رز"],
    allergensReviewedAt: "2026-07-15T00:00:00Z",
    prepStatus: "controlled",
    prepVerifiedAt: "2026-07-15T00:00:00Z",
  })), "بيض") === "clear_verified");
ok("regression: ingredient clear with unknown prep still returns clear_prep_unknown",
  computeDishTruthState(dishDataFromMenuItem(item({
    ingredients: ["دجاج", "رز"],
    allergensReviewedAt: "2026-07-15T00:00:00Z",
    prepStatus: "unknown",
  })), "بيض") === "clear_prep_unknown");
ok("regression: severe shared prep still returns severe_shared_risk",
  computeDishTruthState(dishDataFromMenuItem(item({
    ingredients: ["دجاج"],
    allergensReviewedAt: "2026-07-15T00:00:00Z",
    prepStatus: "shared_risk",
  })), "فول سوداني", true) === "severe_shared_risk");

console.log(`\nALLERGEN-ESCALATION-TRUTH PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
