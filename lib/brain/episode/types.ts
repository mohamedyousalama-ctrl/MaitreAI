import type { BrainOwner, ISODateTime, UUID } from "../types";
import type { BrainSafetyTriageClass } from "../ingress/types";

export type EpisodeFocusRelation =
  | "CONTINUE_CURRENT"
  | "START_NEW"
  | "REFERENCE_PRIOR_ORDER"
  | "SUPPORT_OR_STATUS"
  | "AMBIGUOUS_NEEDS_CLARIFICATION";

export type EpisodePhase =
  | "collecting"
  | "quoted"
  | "awaiting_confirmation"
  | "committed"
  | "abandoned"
  | "cancelled"
  | "human_controlled"
  | "expired";

export type EpisodeSafetyAxis = "none" | "possible" | "disclosed" | "blocked" | "human_required";

export interface EpisodeSnapshot {
  readonly id: UUID;
  readonly tenantId: UUID;
  readonly threadId: UUID;
  readonly customerId?: UUID | null;
  readonly lifecycleState: EpisodePhase;
  readonly activeMutable: boolean;
  readonly owner: BrainOwner;
  readonly ownershipGeneration: number;
  readonly episodeRevision: number;
  readonly currentQuoteId?: UUID | null;
  readonly committedOrderId?: UUID | null;
  readonly createdAt?: ISODateTime;
  readonly updatedAt?: ISODateTime;
  readonly closedAt?: ISODateTime | null;
}

export interface EpisodeInboundEvent {
  readonly tenantId: UUID;
  readonly threadId: UUID;
  readonly sourceEventId: UUID;
  readonly observedText: string;
  readonly observedAt: ISODateTime;
  readonly safetyTriageClass?: BrainSafetyTriageClass | null;
  readonly humanTakeoverRequested?: boolean;
}

export interface EpisodeResolverFacts {
  readonly episodes: readonly EpisodeSnapshot[];
  readonly now: ISODateTime;
}

export interface EpisodeFocusCandidate {
  readonly kind: "current_episode" | "new_episode" | "prior_committed_order" | "support";
  readonly episodeId?: UUID;
  readonly committedOrderId?: UUID;
  readonly reason: string;
}

export interface EpisodeFocusDecision {
  readonly relation: EpisodeFocusRelation;
  readonly tenantId: UUID;
  readonly threadId: UUID;
  readonly targetEpisodeId?: UUID;
  readonly referencedEpisodeId?: UUID;
  readonly referencedCommittedOrderId?: UUID;
  readonly shouldCreateEpisode: boolean;
  readonly confidence: "high" | "medium" | "low";
  readonly evidence: readonly string[];
  readonly competingCandidates: readonly EpisodeFocusCandidate[];
}

export interface EpisodeAxes {
  readonly phase: EpisodePhase;
  readonly ownership: {
    readonly owner: BrainOwner;
    readonly ownershipGeneration: number;
  };
  readonly safety: EpisodeSafetyAxis;
}

export type EpisodePhaseEvent =
  | "quote_created"
  | "customer_confirm_requested"
  | "customer_confirmed"
  | "cart_changed"
  | "customer_cancelled"
  | "customer_abandoned"
  | "lease_expired"
  | "order_phase_human_hold"
  | "human_released_order_phase"
  | "safety_disclosure_recorded"
  | "human_takeover_recorded"
  | "start_new_request";

export interface EpisodeTransition {
  readonly from: EpisodePhase;
  readonly event: EpisodePhaseEvent;
  readonly to: EpisodePhase;
  readonly guard: string;
}

export interface EpisodeTurnForContext {
  readonly episodeId: UUID;
  readonly text: string;
  readonly createdAt: ISODateTime;
}
