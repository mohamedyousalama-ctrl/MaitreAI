import type {
  EpisodeAxes,
  EpisodeInboundEvent,
  EpisodePhase,
  EpisodePhaseEvent,
  EpisodeSnapshot,
  EpisodeTransition,
} from "./types";

const activeMutablePhases: ReadonlySet<EpisodePhase> = new Set([
  "collecting",
  "quoted",
  "awaiting_confirmation",
  "human_controlled",
]);

const terminalPhases: ReadonlySet<EpisodePhase> = new Set([
  "committed",
  "abandoned",
  "cancelled",
  "expired",
]);

export const EPISODE_TRANSITION_TABLE: readonly EpisodeTransition[] = [
  { from: "collecting", event: "quote_created", to: "quoted", guard: "cart priced from current published facts" },
  { from: "collecting", event: "customer_abandoned", to: "abandoned", guard: "explicit abandonment or operator timeout policy" },
  { from: "collecting", event: "customer_cancelled", to: "cancelled", guard: "explicit cancel intent for the active episode" },
  { from: "collecting", event: "lease_expired", to: "expired", guard: "episode expiry policy, not human ownership lease expiry" },
  { from: "collecting", event: "order_phase_human_hold", to: "human_controlled", guard: "explicit order-phase hold, separate from ownership axis" },
  { from: "collecting", event: "safety_disclosure_recorded", to: "collecting", guard: "safety axis changes only" },
  { from: "collecting", event: "human_takeover_recorded", to: "collecting", guard: "ownership axis changes only" },

  { from: "quoted", event: "cart_changed", to: "collecting", guard: "customer changes mutable cart after quote" },
  { from: "quoted", event: "customer_confirm_requested", to: "awaiting_confirmation", guard: "current quote id belongs to this episode" },
  { from: "quoted", event: "customer_cancelled", to: "cancelled", guard: "explicit cancel intent for the active episode" },
  { from: "quoted", event: "customer_abandoned", to: "abandoned", guard: "explicit abandonment or operator timeout policy" },
  { from: "quoted", event: "lease_expired", to: "expired", guard: "quote/episode expiry policy" },
  { from: "quoted", event: "order_phase_human_hold", to: "human_controlled", guard: "explicit order-phase hold, separate from ownership axis" },
  { from: "quoted", event: "safety_disclosure_recorded", to: "quoted", guard: "safety axis changes only" },
  { from: "quoted", event: "human_takeover_recorded", to: "quoted", guard: "ownership axis changes only" },

  { from: "awaiting_confirmation", event: "customer_confirmed", to: "committed", guard: "immutable unexpired quote confirmed and order committed" },
  { from: "awaiting_confirmation", event: "cart_changed", to: "collecting", guard: "confirmation invalidated by customer cart change" },
  { from: "awaiting_confirmation", event: "customer_cancelled", to: "cancelled", guard: "explicit cancel intent for the active episode" },
  { from: "awaiting_confirmation", event: "lease_expired", to: "expired", guard: "confirmation prompt expiry policy" },
  { from: "awaiting_confirmation", event: "order_phase_human_hold", to: "human_controlled", guard: "explicit order-phase hold, separate from ownership axis" },
  { from: "awaiting_confirmation", event: "safety_disclosure_recorded", to: "awaiting_confirmation", guard: "safety axis changes only" },
  { from: "awaiting_confirmation", event: "human_takeover_recorded", to: "awaiting_confirmation", guard: "ownership axis changes only" },

  { from: "human_controlled", event: "human_released_order_phase", to: "collecting", guard: "operator returns the order phase to active collection" },
  { from: "human_controlled", event: "customer_cancelled", to: "cancelled", guard: "explicit cancel intent while human-held" },
  { from: "human_controlled", event: "customer_abandoned", to: "abandoned", guard: "explicit abandonment or operator timeout policy" },
  { from: "human_controlled", event: "safety_disclosure_recorded", to: "human_controlled", guard: "safety axis changes only" },
  { from: "human_controlled", event: "human_takeover_recorded", to: "human_controlled", guard: "ownership axis changes only" },

  { from: "committed", event: "start_new_request", to: "committed", guard: "terminal episode stays immutable; create a separate episode" },
  { from: "abandoned", event: "start_new_request", to: "abandoned", guard: "closed episode stays closed; create a separate episode" },
  { from: "cancelled", event: "start_new_request", to: "cancelled", guard: "closed episode stays closed; create a separate episode" },
  { from: "expired", event: "start_new_request", to: "expired", guard: "closed episode stays closed; create a separate episode" },
];

export function activeMutableForPhase(phase: EpisodePhase): boolean {
  return activeMutablePhases.has(phase);
}

export function isTerminalPhase(phase: EpisodePhase): boolean {
  return terminalPhases.has(phase);
}

export function validateAppliedActiveMutableCheck(episode: Pick<EpisodeSnapshot, "lifecycleState" | "activeMutable">): boolean {
  return episode.activeMutable === activeMutableForPhase(episode.lifecycleState);
}

export function assertOneActiveMutableEpisode(episodes: readonly EpisodeSnapshot[]): { ok: true } | { ok: false; reason: string } {
  const seen = new Set<string>();
  for (const episode of episodes) {
    if (!episode.activeMutable) continue;
    const key = `${episode.tenantId}:${episode.threadId}`;
    if (seen.has(key)) return { ok: false, reason: "second_active_mutable_episode" };
    seen.add(key);
  }
  return { ok: true };
}

export function applyEpisodePhaseTransition(phase: EpisodePhase, event: EpisodePhaseEvent): EpisodePhase | null {
  return EPISODE_TRANSITION_TABLE.find((transition) => transition.from === phase && transition.event === event)?.to ?? null;
}

export function deriveEpisodeAxes(episode: EpisodeSnapshot, event?: Pick<EpisodeInboundEvent, "safetyTriageClass" | "humanTakeoverRequested">): EpisodeAxes {
  let safety = "none" as EpisodeAxes["safety"];
  if (event?.safetyTriageClass) {
    safety =
      event.safetyTriageClass === "EXPLICIT_CUSTOMER_DISCLOSURE" || event.safetyTriageClass === "THIRD_PARTY_DISCLOSURE"
        ? "disclosed"
        : event.safetyTriageClass === "UNCERTAIN_SAFETY_SIGNAL"
          ? "human_required"
          : "possible";
  }

  return {
    phase: episode.lifecycleState,
    ownership: {
      owner: event?.humanTakeoverRequested ? "HUMAN" : episode.owner,
      ownershipGeneration: event?.humanTakeoverRequested ? episode.ownershipGeneration + 1 : episode.ownershipGeneration,
    },
    safety,
  };
}
