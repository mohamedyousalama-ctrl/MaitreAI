// ============================================================================
// MIZAN — native-panel aggregation (WO-KHALID-STEP5). PURE: no I/O, no agent, no
// runtime change. Imported by the aggregate harness (mizan-aggregate.mjs) and the
// unit test (test-mizan-panel). Mirrors the mizan-score.mjs discipline.
//
// ★★ ABSOLUTE RULE: this module NEVER produces a score. It only READS scores that real
// humans submitted and AGGREGATES them. There is no LLM, no heuristic, no machine guess
// anywhere in this file. An item with fewer than MIN_REVIEWERS human scores stays
// PENDING-HUMAN — it does NOT get a computed placeholder. Removing this rule would destroy
// the Option-A honesty design of Steps 4-5.
//
// It also SURFACES inter-reviewer disagreement: if reviewers diverge sharply on an item,
// that item is flagged HIGH-VARIANCE (adjudicate) instead of being silently averaged to a
// misleading middle number. Disagreement is signal, not noise.
// ============================================================================

/** Human-hook suite ids from mizan-suites.json (1 dialect / 9 tone / 10 upsell / 11 complaint
 *  / 12 karam). Only these are panel-scored; the machine/safety suites are untouched. */
export const HUMAN_SUITE_IDS = [1, 9, 10, 11, 12];
/** Minimum distinct human reviewers before an item is considered scored at all. Below this it
 *  stays PENDING-HUMAN (never a machine fill). PM constraint: ≥3 reviewers per item. */
export const MIN_REVIEWERS = 3;
/** A dimension whose reviewer scores span ≥ this range (e.g. one gives 3, another 9 → span 6)
 *  is flagged HIGH-VARIANCE so it is adjudicated rather than trusted as a clean mean. */
export const VARIANCE_RANGE_FLAG = 4;

const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const spread = (arr) => (arr.length ? Math.max(...arr) - Math.min(...arr) : 0);

/** Group reviewer result files → a Map(scenarioId → [{reviewerId, dims, notes, suiteId}]).
 *  Files missing a reviewerId are SKIPPED (returned in `skipped`) — we never attribute an
 *  anonymous/ malformed submission as a valid reviewer, which would let <3 real people
 *  masquerade as a full panel. */
export function collectByScenario(reviewerFiles) {
  const map = new Map();
  const skipped = [];
  const seen = new Set(); // dedupe: one reviewer can only count once per scenario
  for (const rf of reviewerFiles || []) {
    const reviewerId = rf && rf.reviewerId ? String(rf.reviewerId).trim() : "";
    if (!reviewerId) { skipped.push({ reason: "missing reviewerId", file: rf && rf.reviewerName }); continue; }
    for (const s of (rf.scores || [])) {
      if (!s || !s.scenarioId) continue;
      const key = `${s.scenarioId}::${reviewerId}`;
      if (seen.has(key)) continue; // same reviewer scored this item twice → count once
      seen.add(key);
      if (!map.has(s.scenarioId)) map.set(s.scenarioId, []);
      map.get(s.scenarioId).push({ reviewerId, dims: s.dims || {}, notes: s.notes || "", suiteId: s.suiteId });
    }
  }
  return { byScenario: map, skipped };
}

/** Aggregate ONE item (scenario) across its reviewers, per rubric dimension.
 *  reviewerScores: [{reviewerId, dims:{dim:number}, notes}]
 *  Returns per-dimension {mean,range,values,highVariance,count}, the item mean (across
 *  dimensions), reviewerCount, collected notes, and a status. */
export function aggregateItem(scenarioId, reviewerScores, dimensions) {
  const list = reviewerScores || [];
  const reviewerCount = list.length;
  const dims = {};
  const dimMeans = [];
  let anyHighVariance = false;
  for (const d of dimensions) {
    const vals = list.map((r) => Number(r.dims?.[d])).filter((v) => Number.isFinite(v));
    const m = mean(vals);
    const rg = spread(vals);
    const highVariance = vals.length >= 2 && rg >= VARIANCE_RANGE_FLAG;
    if (highVariance) anyHighVariance = true;
    dims[d] = { mean: m, range: rg, values: vals, highVariance, count: vals.length };
    if (m != null) dimMeans.push(m);
  }
  const itemMean = mean(dimMeans);
  // An item is SCORED only when EVERY rubric dimension has ≥ MIN_REVIEWERS finite human scores —
  // not merely when ≥3 reviewer rows exist. The UI lets a reviewer export with dimensions left
  // blank; without this, three mostly-empty submissions (or one filled dimension) would resolve
  // to SCORED/PASS off a mean of only the present dimensions. Any under-scored dimension keeps the
  // whole item PENDING-HUMAN (Codex P1). PENDING-HUMAN always wins — never a partial pass/fail.
  const everyDimComplete = dimensions.length > 0 && dimensions.every((d) => dims[d].count >= MIN_REVIEWERS);
  const scored = reviewerCount >= MIN_REVIEWERS && everyDimComplete;
  const notes = list.map((r) => ({ reviewerId: r.reviewerId, note: r.notes || "" })).filter((n) => n.note);
  return {
    scenarioId, reviewerCount, dims, itemMean, highVariance: anyHighVariance, notes, everyDimComplete,
    status: !scored ? "PENDING-HUMAN" : anyHighVariance ? "HIGH-VARIANCE" : "SCORED",
  };
}

/** Aggregate a whole human suite (a manifest suite object with .scenarios and .rubric).
 *  gateValue is the mean of item means — but ONLY when every item has ≥ MIN_REVIEWERS
 *  reviewers. If ANY item is under-reviewed the suite gateValue is null → the gate reads
 *  PENDING-HUMAN. We never gate a release on a partially-reviewed suite. */
export function aggregateSuite(suite, byScenario) {
  const dimensions = (suite.rubric && suite.rubric.dimensions) || [];
  const items = (suite.scenarios || []).map((sc) => aggregateItem(sc.id, byScenario.get(sc.id) || [], dimensions));
  const minReviewers = items.length ? Math.min(...items.map((i) => i.reviewerCount)) : 0;
  const anyPending = items.some((i) => i.status === "PENDING-HUMAN");
  const anyHighVariance = items.some((i) => i.highVariance);
  const gateValue = anyPending ? null : mean(items.map((i) => i.itemMean).filter((v) => v != null));
  const status = anyPending ? "PENDING-HUMAN" : anyHighVariance ? "HIGH-VARIANCE" : "SCORED";
  return { suiteId: suite.id, name: suite.name, dimensions, items, minReviewers, gateValue, status, highVariance: anyHighVariance, pending: anyPending };
}

/** Combine the aggregate with the manifest gate + the existing evaluateGate. High-variance is
 *  surfaced ALONGSIDE the pass/fail so a divergent panel is adjudicated, not silently trusted.
 *  evaluateGate is the SAME function MIZAN Step 4 uses — we do not rebuild the gate. */
export function panelGateStatus(gate, suiteAgg, evaluateGate) {
  const base = evaluateGate(gate, suiteAgg ? suiteAgg.gateValue : null); // null → PENDING-HUMAN
  if (suiteAgg && suiteAgg.highVariance && base !== "PENDING-HUMAN") {
    return { status: base, flagged: true, label: `${base} ⚠️ HIGH-VARIANCE (adjudicate)` };
  }
  return { status: base, flagged: false, label: base };
}
