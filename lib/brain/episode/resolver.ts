import { detectEpisodeTextSignals } from "./normalization";
import { assertOneActiveMutableEpisode, isTerminalPhase } from "./state-machine";
import type {
  EpisodeFocusCandidate,
  EpisodeFocusDecision,
  EpisodeInboundEvent,
  EpisodeResolverFacts,
  EpisodeSnapshot,
  EpisodeTurnForContext,
} from "./types";

function byUpdatedAtDesc(a: EpisodeSnapshot, b: EpisodeSnapshot): number {
  return Date.parse(b.updatedAt ?? b.createdAt ?? "") - Date.parse(a.updatedAt ?? a.createdAt ?? "");
}

function scopedEpisodes(event: EpisodeInboundEvent, facts: EpisodeResolverFacts): EpisodeSnapshot[] {
  return facts.episodes
    .filter((episode) => episode.tenantId === event.tenantId && episode.threadId === event.threadId)
    .slice()
    .sort(byUpdatedAtDesc);
}

function currentActiveEpisode(episodes: readonly EpisodeSnapshot[]): EpisodeSnapshot | null {
  return episodes.find((episode) => episode.activeMutable) ?? null;
}

function latestCommittedEpisode(episodes: readonly EpisodeSnapshot[]): EpisodeSnapshot | null {
  return episodes.find((episode) => episode.lifecycleState === "committed" && episode.committedOrderId) ?? null;
}

function currentCandidate(episode: EpisodeSnapshot): EpisodeFocusCandidate {
  return {
    kind: "current_episode",
    episodeId: episode.id,
    reason: `active ${episode.lifecycleState} episode`,
  };
}

function newEpisodeCandidate(reason: string): EpisodeFocusCandidate {
  return { kind: "new_episode", reason };
}

function priorCandidate(episode: EpisodeSnapshot): EpisodeFocusCandidate {
  return {
    kind: "prior_committed_order",
    episodeId: episode.id,
    committedOrderId: episode.committedOrderId ?? undefined,
    reason: "customer referenced a prior committed order",
  };
}

function decision(args: Omit<EpisodeFocusDecision, "shouldCreateEpisode"> & { shouldCreateEpisode?: boolean }): EpisodeFocusDecision {
  return {
    ...args,
    shouldCreateEpisode: args.shouldCreateEpisode ?? args.relation === "START_NEW",
  };
}

export function resolveEpisodeFocus(event: EpisodeInboundEvent, facts: EpisodeResolverFacts): EpisodeFocusDecision {
  const episodes = scopedEpisodes(event, facts);
  const activeInvariant = assertOneActiveMutableEpisode(episodes);
  const active = currentActiveEpisode(episodes);
  const latest = episodes[0] ?? null;
  const committed = latestCommittedEpisode(episodes);
  const signals = detectEpisodeTextSignals(event.observedText);
  const evidence = signals.matched.map((match) => `matched:${match}`);

  if (!activeInvariant.ok) {
    return decision({
      relation: "AMBIGUOUS_NEEDS_CLARIFICATION",
      tenantId: event.tenantId,
      threadId: event.threadId,
      shouldCreateEpisode: false,
      confidence: "high",
      evidence: [`invariant:${activeInvariant.reason}`],
      competingCandidates: episodes.filter((episode) => episode.activeMutable).map(currentCandidate),
    });
  }

  if (signals.cancelOrder) {
    return decision({
      relation: "SUPPORT_OR_STATUS",
      tenantId: event.tenantId,
      threadId: event.threadId,
      targetEpisodeId: active?.id,
      confidence: "high",
      evidence: [...evidence, "cancel intent belongs to active episode handling"],
      competingCandidates: active ? [currentCandidate(active)] : [{ kind: "support", reason: "cancel without active episode" }],
    });
  }

  const explicitNewOrder = signals.newOrder || signals.resetOrder;
  if (explicitNewOrder) {
    if (active && !isTerminalPhase(active.lifecycleState)) {
      return decision({
        relation: "AMBIGUOUS_NEEDS_CLARIFICATION",
        tenantId: event.tenantId,
        threadId: event.threadId,
        targetEpisodeId: active.id,
        shouldCreateEpisode: false,
        confidence: "high",
        evidence: [...evidence, "new-order language conflicts with active mutable episode"],
        competingCandidates: [currentCandidate(active), newEpisodeCandidate("explicit new-order/reset phrase")],
      });
    }
    return decision({
      relation: "START_NEW",
      tenantId: event.tenantId,
      threadId: event.threadId,
      confidence: "high",
      evidence: [...evidence, "explicit new-order/reset phrase"],
      competingCandidates: [newEpisodeCandidate("explicit new-order/reset phrase")],
    });
  }

  if (signals.priorOrderReference) {
    return decision({
      relation: "REFERENCE_PRIOR_ORDER",
      tenantId: event.tenantId,
      threadId: event.threadId,
      referencedEpisodeId: committed?.id,
      referencedCommittedOrderId: committed?.committedOrderId ?? undefined,
      confidence: committed ? "high" : "medium",
      evidence: [...evidence, "committed order reference is immutable"],
      competingCandidates: committed ? [priorCandidate(committed)] : [{ kind: "prior_committed_order", reason: "reference phrase without matching committed episode" }],
    });
  }

  if (signals.supportOrStatus) {
    return decision({
      relation: "SUPPORT_OR_STATUS",
      tenantId: event.tenantId,
      threadId: event.threadId,
      targetEpisodeId: active?.id,
      confidence: "high",
      evidence: [...evidence, "support/status signal does not create episode boundary"],
      competingCandidates: active ? [currentCandidate(active)] : [{ kind: "support", reason: "support/status message" }],
    });
  }

  if (!active && !latest && signals.orderingIntent) {
    return decision({
      relation: "START_NEW",
      tenantId: event.tenantId,
      threadId: event.threadId,
      confidence: "medium",
      evidence: [...evidence, "first ordering intent on thread"],
      competingCandidates: [newEpisodeCandidate("first ordering intent on thread")],
    });
  }

  if (!active && latest && isTerminalPhase(latest.lifecycleState) && signals.orderingIntent) {
    return decision({
      relation: "START_NEW",
      tenantId: event.tenantId,
      threadId: event.threadId,
      confidence: "medium",
      evidence: [...evidence, "ordering intent after terminal episode"],
      competingCandidates: [newEpisodeCandidate("terminal episode cannot be reopened")],
    });
  }

  return decision({
    relation: "CONTINUE_CURRENT",
    tenantId: event.tenantId,
    threadId: event.threadId,
    targetEpisodeId: active?.id ?? latest?.id,
    shouldCreateEpisode: false,
    confidence: active ? "medium" : "low",
    evidence: active ? ["default:active mutable episode"] : ["default:no semantic boundary signal"],
    competingCandidates: active ? [currentCandidate(active)] : latest ? [currentCandidate(latest)] : [],
  });
}

export function episodeContextFor(episodeId: string, turns: readonly EpisodeTurnForContext[]): readonly EpisodeTurnForContext[] {
  return turns.filter((turn) => turn.episodeId === episodeId);
}
