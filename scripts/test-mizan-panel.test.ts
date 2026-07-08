// Unit tests for the MIZAN native-panel aggregation (pure). Proves: ≥3-reviewer gating,
// inter-reviewer variance is surfaced (not silently averaged), under-reviewed items stay
// PENDING-HUMAN, and authenticity is NEVER machine-scored. Run:
//   node --experimental-strip-types scripts/test-mizan-panel.test.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  HUMAN_SUITE_IDS, MIN_REVIEWERS, VARIANCE_RANGE_FLAG,
  collectByScenario, aggregateItem, aggregateSuite, panelGateStatus,
} from "./mizan/mizan-panel-score.mjs";
import { evaluateGate } from "./mizan/mizan-score.mjs";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

const DIMS = ["authenticity", "warmth_karam", "register_fit"];
const rev = (id: string, scenarioId: string, dims: any, notes = "") => ({ reviewerId: id, scores: [{ scenarioId, suiteId: 1, dims, notes }] });

// --- constants ---------------------------------------------------------------
ok("const: MIN_REVIEWERS is 3", MIN_REVIEWERS === 3);
ok("const: VARIANCE_RANGE_FLAG is 4", VARIANCE_RANGE_FLAG === 4);
ok("const: human suites 1,9,10,11,12", JSON.stringify(HUMAN_SUITE_IDS) === JSON.stringify([1, 9, 10, 11, 12]));

// --- collectByScenario -------------------------------------------------------
const c1 = collectByScenario([
  rev("r1", "S1-01", { authenticity: 8, warmth_karam: 8, register_fit: 9 }),
  rev("r2", "S1-01", { authenticity: 7, warmth_karam: 7, register_fit: 8 }),
]);
ok("collect: groups reviewers by scenario", (c1.byScenario.get("S1-01") || []).length === 2);
const cSkip = collectByScenario([{ reviewerName: "no-id", scores: [{ scenarioId: "S1-01", dims: {} }] } as any]);
ok("collect: skips file with no reviewerId (never counts as a reviewer)", cSkip.byScenario.size === 0 && cSkip.skipped.length === 1);
const cDup = collectByScenario([
  rev("r1", "S1-01", { authenticity: 8 }),
  rev("r1", "S1-01", { authenticity: 4 }), // same reviewer, same item → counts once
]);
ok("collect: dedupes same reviewer+scenario", (cDup.byScenario.get("S1-01") || []).length === 1);

// --- aggregateItem -----------------------------------------------------------
const item3 = aggregateItem("S1-01", [
  { reviewerId: "r1", dims: { authenticity: 8, warmth_karam: 8, register_fit: 9 }, notes: "" },
  { reviewerId: "r2", dims: { authenticity: 8, warmth_karam: 7, register_fit: 8 }, notes: "" },
  { reviewerId: "r3", dims: { authenticity: 9, warmth_karam: 8, register_fit: 8 }, notes: "" },
], DIMS);
ok("item: 3 reviewers → SCORED", item3.status === "SCORED" && item3.reviewerCount === 3);
ok("item: authenticity mean ~8.33", Math.abs(item3.dims.authenticity.mean - 25 / 3) < 1e-9);
ok("item: itemMean computed", item3.itemMean != null && item3.itemMean > 7);
ok("item: consistent scores → NOT high-variance", item3.highVariance === false);

// ★ variance surfaced: one reviewer says 3, another 9 → range 6 ≥ 4 → HIGH-VARIANCE (not a silent 6)
const itemHV = aggregateItem("S1-02", [
  { reviewerId: "r1", dims: { authenticity: 3, warmth_karam: 7, register_fit: 8 }, notes: "" },
  { reviewerId: "r2", dims: { authenticity: 6, warmth_karam: 7, register_fit: 7 }, notes: "" },
  { reviewerId: "r3", dims: { authenticity: 9, warmth_karam: 8, register_fit: 7 }, notes: "" },
], DIMS);
ok("item: sharp disagreement → HIGH-VARIANCE flagged", itemHV.status === "HIGH-VARIANCE" && itemHV.highVariance === true);
ok("item: high-variance is on the right dimension", itemHV.dims.authenticity.highVariance === true && itemHV.dims.register_fit.highVariance === false);
ok("item: range captured (3..9 = 6)", itemHV.dims.authenticity.range === 6);

// ★ under-reviewed items are NEVER machine-scored — they stay PENDING-HUMAN.
const item2 = aggregateItem("S1-03", [
  { reviewerId: "r1", dims: { authenticity: 8 }, notes: "" },
  { reviewerId: "r2", dims: { authenticity: 9 }, notes: "" },
], DIMS);
ok("item: 2 reviewers (< 3) → PENDING-HUMAN", item2.status === "PENDING-HUMAN");
const item0 = aggregateItem("S1-04", [], DIMS);
ok("item: 0 reviewers → PENDING-HUMAN, itemMean null (never guessed)", item0.status === "PENDING-HUMAN" && item0.itemMean === null);

// ★ Codex P1: 3 reviewers but a dimension left blank by one → NOT fully scored → PENDING-HUMAN.
const itemPartialDim = aggregateItem("S1-05", [
  { reviewerId: "r1", dims: { authenticity: 8, warmth_karam: 8, register_fit: 8 }, notes: "" },
  { reviewerId: "r2", dims: { authenticity: 8, warmth_karam: 8, register_fit: 8 }, notes: "" },
  { reviewerId: "r3", dims: { authenticity: 8, warmth_karam: 8 /* register_fit omitted */ }, notes: "" },
], DIMS);
ok("item: 3 reviewers but a blank dimension → PENDING-HUMAN (not a partial pass)", itemPartialDim.status === "PENDING-HUMAN" && itemPartialDim.everyDimComplete === false);
const itemAllDims = aggregateItem("S1-06", [
  { reviewerId: "r1", dims: { authenticity: 8, warmth_karam: 8, register_fit: 8 }, notes: "" },
  { reviewerId: "r2", dims: { authenticity: 8, warmth_karam: 8, register_fit: 8 }, notes: "" },
  { reviewerId: "r3", dims: { authenticity: 8, warmth_karam: 8, register_fit: 8 }, notes: "" },
], DIMS);
ok("item: 3 reviewers all dimensions complete → SCORED", itemAllDims.status === "SCORED" && itemAllDims.everyDimComplete === true);

// --- aggregateSuite ----------------------------------------------------------
const here = dirname(fileURLToPath(import.meta.url));
const M = JSON.parse(readFileSync(join(here, "mizan", "mizan-suites.json"), "utf8"));
const suite1 = M.suites.find((s: any) => s.id === 1);

// full panel: 3 reviewers on ALL 4 suite-1 items → suite resolves to a real gate value
function fullReviewer(id: string, base: number) {
  return {
    reviewerId: id,
    scores: suite1.scenarios.map((sc: any) => ({
      scenarioId: sc.id, suiteId: 1,
      dims: { authenticity: base, warmth_karam: base, register_fit: base }, notes: "",
    })),
  };
}
const full = collectByScenario([fullReviewer("r1", 8), fullReviewer("r2", 8), fullReviewer("r3", 8)]);
const aggFull = aggregateSuite(suite1, full.byScenario);
ok("suite: all items ≥3 reviewers → SCORED, gateValue computed", aggFull.status === "SCORED" && Math.abs(aggFull.gateValue - 8) < 1e-9);
ok("suite: minReviewers reflects the panel size", aggFull.minReviewers === 3);

// partial panel: one item under-reviewed → whole suite PENDING-HUMAN, gateValue null
const partial = collectByScenario([fullReviewer("r1", 8), fullReviewer("r2", 8),
  { reviewerId: "r3", scores: [{ scenarioId: "S1-01", suiteId: 1, dims: { authenticity: 8, warmth_karam: 8, register_fit: 8 }, notes: "" }] }]);
const aggPartial = aggregateSuite(suite1, partial.byScenario);
ok("suite: any under-reviewed item → PENDING-HUMAN + gateValue null (never gated on partial)", aggPartial.status === "PENDING-HUMAN" && aggPartial.gateValue === null);

// --- panelGateStatus (reuses the SAME evaluateGate as Step 4) ----------------
const dialectGate = M.launchGates.find((g: any) => g.id === "dialect_authenticity");
ok("gate: null value → PENDING-HUMAN (unresolved slot)", panelGateStatus(dialectGate, aggPartial, evaluateGate).status === "PENDING-HUMAN");
const aggPass = aggregateSuite(suite1, collectByScenario([fullReviewer("r1", 8), fullReviewer("r2", 8), fullReviewer("r3", 8)]).byScenario);
ok("gate: mean 8 ≥ 7.5 → PASS", panelGateStatus(dialectGate, aggPass, evaluateGate).status === "PASS");
const aggFail = aggregateSuite(suite1, collectByScenario([fullReviewer("r1", 5), fullReviewer("r2", 5), fullReviewer("r3", 5)]).byScenario);
ok("gate: mean 5 < 7.5 → FAIL", panelGateStatus(dialectGate, aggFail, evaluateGate).status === "FAIL");
// high-variance is surfaced ALONGSIDE the pass/fail, not hidden by the average
const aggHV = aggregateSuite(suite1, collectByScenario([
  { reviewerId: "r1", scores: suite1.scenarios.map((sc: any) => ({ scenarioId: sc.id, suiteId: 1, dims: { authenticity: 8, warmth_karam: 8, register_fit: 8 }, notes: "" })) },
  { reviewerId: "r2", scores: suite1.scenarios.map((sc: any) => ({ scenarioId: sc.id, suiteId: 1, dims: { authenticity: 8, warmth_karam: 8, register_fit: 8 }, notes: "" })) },
  { reviewerId: "r3", scores: suite1.scenarios.map((sc: any, i: number) => ({ scenarioId: sc.id, suiteId: 1, dims: { authenticity: i === 0 ? 3 : 8, warmth_karam: 8, register_fit: 8 }, notes: "" })) },
]).byScenario);
const pgHV = panelGateStatus(dialectGate, aggHV, evaluateGate);
ok("gate: high-variance surfaced alongside pass/fail", pgHV.flagged === true && pgHV.label.includes("HIGH-VARIANCE"));

// --- manifest sanity: human suites all have a rubric --------------------------
const humanSuites = M.suites.filter((s: any) => HUMAN_SUITE_IDS.includes(s.id));
ok("manifest: 5 human suites resolved by the panel", humanSuites.length === 5);
ok("manifest: every human suite has rubric dimensions + threshold", humanSuites.every((s: any) => s.rubric && s.rubric.dimensions.length > 0 && s.rubric.threshold >= 7.5));
ok("manifest: dialect gate is the human launch gate on suite 1", dialectGate.suite === 1 && dialectGate.metric === "human");

console.log(`\nMIZAN PANEL UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
