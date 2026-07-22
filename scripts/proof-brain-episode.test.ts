// ============================================================================
// WO-BRAIN-1 behavior proof.
//
// Pure in-memory proof for episode focus resolution, the three-axis state model,
// transition-table properties, and episode-boundary gold-set scoring.
//
// Run:
//   node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/proof-brain-episode.test.ts
// ============================================================================

import {
  EPISODE_TRANSITION_TABLE,
  activeMutableForPhase,
  applyEpisodePhaseTransition,
  assertOneActiveMutableEpisode,
  deriveEpisodeAxes,
  episodeContextFor,
  resolveEpisodeFocus,
  validateAppliedActiveMutableCheck,
  type EpisodePhase,
  type EpisodeSnapshot,
} from "../lib/brain/episode/index.ts";
import {
  EPISODE_BOUNDARY_GOLD_SET,
  formatEpisodeBoundaryScore,
  scoreEpisodeBoundaryGoldSet,
} from "../lib/brain/episode/gold-set/index.ts";

const tenantA = "00000000-0000-4000-8000-00000000000a";
const tenantB = "00000000-0000-4000-8000-00000000000b";
const threadA = "10000000-0000-4000-8000-00000000000a";
const threadB = "10000000-0000-4000-8000-00000000000b";
const committedEp = "30000000-0000-4000-8000-000000001125";
const draftEp = "30000000-0000-4000-8000-000000000201";

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    pass++;
    return;
  }
  fail++;
  console.error("  x FAIL:", name, detail ?? "");
}

function episode(args: Partial<EpisodeSnapshot> & Pick<EpisodeSnapshot, "id" | "tenantId" | "threadId" | "lifecycleState">): EpisodeSnapshot {
  return {
    id: args.id,
    tenantId: args.tenantId,
    threadId: args.threadId,
    customerId: args.customerId ?? null,
    lifecycleState: args.lifecycleState,
    activeMutable: args.activeMutable ?? activeMutableForPhase(args.lifecycleState),
    owner: args.owner ?? "AI",
    ownershipGeneration: args.ownershipGeneration ?? 1,
    episodeRevision: args.episodeRevision ?? 0,
    currentQuoteId: args.currentQuoteId ?? null,
    committedOrderId: args.committedOrderId ?? null,
    createdAt: args.createdAt ?? "2026-07-22T10:00:00.000Z",
    updatedAt: args.updatedAt ?? "2026-07-22T10:00:00.000Z",
    closedAt: args.closedAt ?? null,
  };
}

function event(text: string, tenantId = tenantA, threadId = threadA) {
  return {
    tenantId,
    threadId,
    sourceEventId: "90000000-0000-4000-8000-000000000001",
    observedText: text,
    observedAt: "2026-07-22T10:05:00.000Z",
  };
}

function committedEpisode(): EpisodeSnapshot {
  return episode({
    id: committedEp,
    tenantId: tenantA,
    threadId: threadA,
    lifecycleState: "committed",
    activeMutable: false,
    committedOrderId: "40000000-0000-4000-8000-000000001125",
    closedAt: "2026-07-22T10:01:00.000Z",
  });
}

function draftEpisode(): EpisodeSnapshot {
  return episode({
    id: draftEp,
    tenantId: tenantA,
    threadId: threadA,
    lifecycleState: "collecting",
    activeMutable: true,
    updatedAt: "2026-07-22T10:04:00.000Z",
  });
}

function proofOriginalBug() {
  const prior = committedEpisode();
  const result = resolveEpisodeFocus(event("عاوز اوردر تاني"), {
    episodes: [prior],
    now: "2026-07-22T10:05:00.000Z",
  });
  const newEpisodeId = "30000000-0000-4000-8000-000000009999";
  const context = episodeContextFor(newEpisodeId, [
    { episodeId: committedEp, text: "عايز بوكس حفلة لعشرة افراد", createdAt: "2026-07-22T09:55:00.000Z" },
    { episodeId: newEpisodeId, text: "عاوز اوردر تاني", createdAt: "2026-07-22T10:05:00.000Z" },
    { episodeId: newEpisodeId, text: "واحد كشري وبيبسي", createdAt: "2026-07-22T10:06:00.000Z" },
  ]);

  check("original bug scenario resolves to START_NEW", result.relation === "START_NEW" && result.shouldCreateEpisode, result);
  check("new episode context excludes prior bulk phrase", !context.some((turn) => /حفلة|عشرة/.test(turn.text)), context);
}

function proofBackToBackOrders() {
  const first = committedEpisode();
  const second = resolveEpisodeFocus(event("اعمل اوردر جديد بسرعة"), { episodes: [first], now: "2026-07-22T10:02:00.000Z" });
  const newDraft = episode({
    id: "30000000-0000-4000-8000-000000000777",
    tenantId: tenantA,
    threadId: threadA,
    lifecycleState: "collecting",
    activeMutable: true,
  });
  const continueSecond = resolveEpisodeFocus(event("واحد شاورما وفرايز"), { episodes: [first, newDraft], now: "2026-07-22T10:03:00.000Z" });

  check("back-to-back semantic new order starts separate episode", second.relation === "START_NEW", second);
  check("following item continues the new draft only", continueSecond.relation === "CONTINUE_CURRENT" && continueSecond.targetEpisodeId === newDraft.id, continueSecond);
}

function proofSecondActiveRejected() {
  const activeA = draftEpisode();
  const activeB = episode({
    id: "30000000-0000-4000-8000-000000000888",
    tenantId: tenantA,
    threadId: threadA,
    lifecycleState: "quoted",
    activeMutable: true,
  });
  const invariant = assertOneActiveMutableEpisode([activeA, activeB]);
  const result = resolveEpisodeFocus(event("عاوز اوردر تاني"), { episodes: [activeA, activeB], now: "2026-07-22T10:05:00.000Z" });

  check("logic-layer invariant rejects second active mutable episode", invariant.ok === false, invariant);
  check("resolver refuses to silently choose with two active episodes", result.relation === "AMBIGUOUS_NEEDS_CLARIFICATION", result);
}

function proofAmbiguousOpenDraft() {
  const result = resolveEpisodeFocus(event("طب اعمل اوردر جديد ولا نكمل ده؟"), {
    episodes: [draftEpisode()],
    now: "2026-07-22T10:05:00.000Z",
  });
  check("new-order language with open draft yields AMBIGUOUS", result.relation === "AMBIGUOUS_NEEDS_CLARIFICATION" && !result.shouldCreateEpisode, result);
}

function proofCommittedReferenceNotReopened() {
  const prior = committedEpisode();
  const result = resolveEpisodeFocus(event("زود عالطلب اللي فات كيس بطاطس"), {
    episodes: [prior],
    now: "2026-07-22T10:05:00.000Z",
  });
  check("reference to committed order does not reopen it", result.relation === "REFERENCE_PRIOR_ORDER" && result.referencedEpisodeId === prior.id && !result.shouldCreateEpisode, result);
}

function proofLongGapAloneDoesNotClose() {
  const oldDraft = episode({
    ...draftEpisode(),
    updatedAt: "2026-07-19T10:00:00.000Z",
  });
  const result = resolveEpisodeFocus(
    {
      ...event("تمام"),
      observedAt: "2026-07-22T10:00:00.000Z",
    },
    { episodes: [oldDraft], now: "2026-07-22T10:00:00.000Z" }
  );
  check("long time gap alone does not close active episode", result.relation === "CONTINUE_CURRENT" && result.targetEpisodeId === oldDraft.id, result);
}

function proofSafetyAxisOnly() {
  const draft = draftEpisode();
  const axes = deriveEpisodeAxes(draft, { safetyTriageClass: "THIRD_PARTY_DISCLOSURE" });
  check("safety disclosure mid-order leaves phase unchanged", axes.phase === draft.lifecycleState, axes);
  check("safety disclosure changes safety axis", axes.safety === "disclosed", axes);
}

function proofHumanTakeoverAxisOnly() {
  const draft = draftEpisode();
  const axes = deriveEpisodeAxes(draft, { humanTakeoverRequested: true });
  check("human takeover mid-order leaves phase unchanged", axes.phase === draft.lifecycleState, axes);
  check("human takeover changes ownership axis", axes.ownership.owner === "HUMAN" && axes.ownership.ownershipGeneration === draft.ownershipGeneration + 1, axes);
}

function proofCrossTenantLookup() {
  const foreign = episode({
    id: "30000000-0000-4000-8000-00000000bbbb",
    tenantId: tenantB,
    threadId: threadB,
    lifecycleState: "collecting",
    activeMutable: true,
  });
  const result = resolveEpisodeFocus(event("عاوز اوردر تاني", tenantA, threadA), {
    episodes: [foreign],
    now: "2026-07-22T10:05:00.000Z",
  });
  check("tenant A lookup never returns tenant B episode", result.targetEpisodeId !== foreign.id && result.referencedEpisodeId !== foreign.id, result);
}

function proofTransitionProperties() {
  const phases: EpisodePhase[] = ["collecting", "quoted", "awaiting_confirmation", "committed", "abandoned", "cancelled", "human_controlled", "expired"];
  for (const transition of EPISODE_TRANSITION_TABLE) {
    const next = applyEpisodePhaseTransition(transition.from, transition.event);
    check(`transition table resolves ${transition.from}/${transition.event}`, next === transition.to, transition);
    check(
      `transition ${transition.from}/${transition.event} respects active_mutable CHECK`,
      validateAppliedActiveMutableCheck({ lifecycleState: transition.to, activeMutable: activeMutableForPhase(transition.to) }),
      transition
    );
  }

  const eventNames = [...new Set(EPISODE_TRANSITION_TABLE.map((transition) => transition.event))];
  for (const phase of phases) {
    let current = phase;
    for (const name of eventNames) {
      current = applyEpisodePhaseTransition(current, name) ?? current;
      check(`property sequence from ${phase} via ${name} keeps DB check`, validateAppliedActiveMutableCheck({ lifecycleState: current, activeMutable: activeMutableForPhase(current) }));
    }
  }

  const single = assertOneActiveMutableEpisode([draftEpisode(), committedEpisode()]);
  check("no legal sequence creates two active mutable episodes on one thread", single.ok === true, single);

  for (const phase of phases) {
    const existing = episode({
      id: `30000000-0000-4000-8000-00000000${phases.indexOf(phase).toString().padStart(4, "0")}`,
      tenantId: tenantA,
      threadId: threadA,
      lifecycleState: phase,
      activeMutable: activeMutableForPhase(phase),
    });
    const result = resolveEpisodeFocus(event("عاوز اوردر تاني"), {
      episodes: [existing],
      now: "2026-07-22T10:05:00.000Z",
    });
    const afterNewEpisode =
      result.shouldCreateEpisode
        ? [
            existing,
            episode({
              id: `30000000-0000-4000-8000-00000001${phases.indexOf(phase).toString().padStart(4, "0")}`,
              tenantId: tenantA,
              threadId: threadA,
              lifecycleState: "collecting",
              activeMutable: true,
            }),
          ]
        : [existing];
    check(
      `start-new guard from ${phase} never produces two active mutable episodes`,
      assertOneActiveMutableEpisode(afterNewEpisode).ok === true,
      { phase, result }
    );
  }
}

function proofGoldSetScorer() {
  const score = scoreEpisodeBoundaryGoldSet(EPISODE_BOUNDARY_GOLD_SET);
  console.log(formatEpisodeBoundaryScore(score));
  check("gold-set scorer runs with boundary precision", score.boundaryPrecision === 1, score);
  check("gold-set scorer runs with boundary recall", score.boundaryRecall === 1, score);
}

async function main() {
  proofOriginalBug();
  proofBackToBackOrders();
  proofSecondActiveRejected();
  proofAmbiguousOpenDraft();
  proofCommittedReferenceNotReopened();
  proofLongGapAloneDoesNotClose();
  proofSafetyAxisOnly();
  proofHumanTakeoverAxisOnly();
  proofCrossTenantLookup();
  proofTransitionProperties();
  proofGoldSetScorer();

  console.log(`BRAIN EPISODE PROOF: ${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
}

await main();
