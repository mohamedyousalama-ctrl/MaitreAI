import type { EpisodeFocusRelation, EpisodeSnapshot } from "../types";

export type GoldEpisodeRelation =
  | "new_episode"
  | "same_episode"
  | "reopen_existing"
  | "ignore_duplicate"
  | "handoff_only"
  | "no_order_episode";

export interface EpisodeGoldTurn {
  readonly turn_id: string;
  readonly tenant_id: string;
  readonly thread_id: string;
  readonly input_text: string;
  readonly observed_at: string;
  readonly episodes: readonly EpisodeSnapshot[];
  readonly correct_episode_id: string | null;
  readonly episode_relation: GoldEpisodeRelation;
  readonly expected_focus_relation: EpisodeFocusRelation;
  readonly user_intent: string;
  readonly operations: readonly string[];
  readonly entities: Record<string, unknown>;
  readonly cart_delta: Record<string, unknown>;
  readonly next_required_field: string | null;
  readonly safety_state: Record<string, unknown>;
  readonly correct_response_plan_type: string;
  readonly expected_order_outcome: string;
  readonly evidence_refs: readonly string[];
}

export interface EpisodeGoldScenario {
  readonly id: string;
  readonly title: string;
  readonly population: string;
  readonly turns: readonly EpisodeGoldTurn[];
}

export interface EpisodeBoundaryScore {
  readonly version: string;
  readonly turnCount: number;
  readonly scenarioCount: number;
  readonly boundaryPrecision: number;
  readonly boundaryRecall: number;
  readonly truePositive: number;
  readonly falsePositive: number;
  readonly falseNegative: number;
  readonly exactRelationAccuracy: number;
}
