import { resolveEpisodeFocus } from "../resolver";
import type { EpisodeBoundaryScore, EpisodeGoldScenario } from "./types";
import { EPISODE_BOUNDARY_GOLD_SET, EPISODE_BOUNDARY_GOLD_SET_VERSION } from "./data";

function div(num: number, den: number): number {
  return den === 0 ? 1 : Number((num / den).toFixed(4));
}

export function scoreEpisodeBoundaryGoldSet(
  scenarios: readonly EpisodeGoldScenario[] = EPISODE_BOUNDARY_GOLD_SET
): EpisodeBoundaryScore {
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let exact = 0;
  let turns = 0;

  for (const scenario of scenarios) {
    for (const turn of scenario.turns) {
      turns++;
      const predicted = resolveEpisodeFocus(
        {
          tenantId: turn.tenant_id,
          threadId: turn.thread_id,
          sourceEventId: turn.turn_id,
          observedText: turn.input_text,
          observedAt: turn.observed_at,
          safetyTriageClass: (turn.safety_state.triage_class as never) ?? null,
          humanTakeoverRequested: turn.operations.includes("request_human"),
        },
        { episodes: turn.episodes, now: turn.observed_at }
      );

      if (predicted.relation === turn.expected_focus_relation) exact++;

      const predictedBoundary = predicted.relation === "START_NEW";
      const goldBoundary = turn.episode_relation === "new_episode";
      if (predictedBoundary && goldBoundary) truePositive++;
      if (predictedBoundary && !goldBoundary) falsePositive++;
      if (!predictedBoundary && goldBoundary) falseNegative++;
    }
  }

  return {
    version: EPISODE_BOUNDARY_GOLD_SET_VERSION,
    turnCount: turns,
    scenarioCount: scenarios.length,
    boundaryPrecision: div(truePositive, truePositive + falsePositive),
    boundaryRecall: div(truePositive, truePositive + falseNegative),
    truePositive,
    falsePositive,
    falseNegative,
    exactRelationAccuracy: div(exact, turns),
  };
}

export function formatEpisodeBoundaryScore(score: EpisodeBoundaryScore): string {
  return [
    `BRAIN EPISODE GOLD SET ${score.version}`,
    `scenarios=${score.scenarioCount}`,
    `turns=${score.turnCount}`,
    `boundary_precision=${score.boundaryPrecision.toFixed(4)}`,
    `boundary_recall=${score.boundaryRecall.toFixed(4)}`,
    `exact_relation_accuracy=${score.exactRelationAccuracy.toFixed(4)}`,
  ].join(" ");
}
