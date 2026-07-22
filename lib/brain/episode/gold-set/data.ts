import type { EpisodeSnapshot } from "../types";
import type { EpisodeGoldScenario } from "./types";

export const EPISODE_BOUNDARY_GOLD_SET_VERSION = "brain-episode-boundary-v1";

const tenantA = "00000000-0000-4000-8000-00000000000a";
const tenantB = "00000000-0000-4000-8000-00000000000b";
const threadA = "10000000-0000-4000-8000-00000000000a";
const threadB = "10000000-0000-4000-8000-00000000000b";

function episode(args: Partial<EpisodeSnapshot> & Pick<EpisodeSnapshot, "id" | "tenantId" | "threadId" | "lifecycleState">): EpisodeSnapshot {
  const phaseIsActiveMutable =
    args.lifecycleState === "collecting" ||
    args.lifecycleState === "quoted" ||
    args.lifecycleState === "awaiting_confirmation" ||
    args.lifecycleState === "human_controlled";
  const activeMutable = args.activeMutable ?? phaseIsActiveMutable;

  return {
    id: args.id,
    tenantId: args.tenantId,
    threadId: args.threadId,
    customerId: args.customerId ?? null,
    lifecycleState: args.lifecycleState,
    activeMutable,
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

function baseTurn(args: {
  readonly id: string;
  readonly text: string;
  readonly episodes: readonly EpisodeSnapshot[];
  readonly correctEpisodeId: string | null;
  readonly relation: "new_episode" | "same_episode" | "reopen_existing" | "ignore_duplicate" | "handoff_only" | "no_order_episode";
  readonly focus: "CONTINUE_CURRENT" | "START_NEW" | "REFERENCE_PRIOR_ORDER" | "SUPPORT_OR_STATUS" | "AMBIGUOUS_NEEDS_CLARIFICATION";
  readonly intent: string;
  readonly operations?: readonly string[];
  readonly entities?: Record<string, unknown>;
  readonly cartDelta?: Record<string, unknown>;
  readonly safety?: Record<string, unknown>;
  readonly responsePlan?: string;
  readonly outcome?: string;
  readonly evidence: readonly string[];
  readonly observedAt?: string;
  readonly tenantId?: string;
  readonly threadId?: string;
}) {
  return {
    turn_id: args.id,
    tenant_id: args.tenantId ?? tenantA,
    thread_id: args.threadId ?? threadA,
    input_text: args.text,
    observed_at: args.observedAt ?? "2026-07-22T10:05:00.000Z",
    episodes: args.episodes,
    correct_episode_id: args.correctEpisodeId,
    episode_relation: args.relation,
    expected_focus_relation: args.focus,
    user_intent: args.intent,
    operations: args.operations ?? [],
    entities: args.entities ?? {},
    cart_delta: args.cartDelta ?? { type: "no_op" },
    next_required_field: null,
    safety_state: args.safety ?? { state: "none" },
    correct_response_plan_type: args.responsePlan ?? "ask_clarification",
    expected_order_outcome: args.outcome ?? "none",
    evidence_refs: args.evidence,
  };
}

const ep1125 = episode({
  id: "30000000-0000-4000-8000-000000001125",
  tenantId: tenantA,
  threadId: threadA,
  lifecycleState: "committed",
  activeMutable: false,
  committedOrderId: "40000000-0000-4000-8000-000000001125",
  updatedAt: "2026-07-22T10:01:00.000Z",
  closedAt: "2026-07-22T10:01:00.000Z",
});

const epDraft = episode({
  id: "30000000-0000-4000-8000-000000000201",
  tenantId: tenantA,
  threadId: threadA,
  lifecycleState: "collecting",
  activeMutable: true,
  updatedAt: "2026-07-22T10:04:00.000Z",
});

export const EPISODE_BOUNDARY_GOLD_SET: readonly EpisodeGoldScenario[] = [
  {
    id: "original-bug-order-1125-new-order",
    title: "Original bug: committed order then a second small order",
    population: "Boundaries",
    turns: [
      baseTurn({
        id: "bug-1125-t1",
        text: "عاوز اوردر تاني",
        episodes: [ep1125],
        correctEpisodeId: null,
        relation: "new_episode",
        focus: "START_NEW",
        intent: "order",
        operations: ["start_new_episode"],
        entities: { prior_phrase_forbidden: "بوكس حفلة لعشرة افراد" },
        cartDelta: { type: "new_cart" },
        outcome: "draft_updated",
        evidence: ["order #1125 committed", "explicit Egyptian new-order phrase"],
      }),
    ],
  },
  {
    id: "back-to-back-no-gap",
    title: "Back-to-back orders in one sitting with no time gap",
    population: "Back-to-back turns",
    turns: [
      baseTurn({
        id: "btb-t1",
        text: "اعمل اوردر جديد بسرعة",
        episodes: [ep1125],
        correctEpisodeId: null,
        relation: "new_episode",
        focus: "START_NEW",
        intent: "order",
        operations: ["start_new_episode"],
        outcome: "draft_updated",
        evidence: ["explicit new-order language", "no reliance on elapsed time"],
      }),
    ],
  },
  {
    id: "abandoned-return-days-later",
    title: "Customer abandons mid-order and returns days later",
    population: "Abandoned episodes",
    turns: [
      baseTurn({
        id: "abandon-t1",
        text: "عايز طلب تاني النهارده",
        observedAt: "2026-07-25T12:00:00.000Z",
        episodes: [
          episode({
            id: "30000000-0000-4000-8000-000000000301",
            tenantId: tenantA,
            threadId: threadA,
            lifecycleState: "abandoned",
            activeMutable: false,
            updatedAt: "2026-07-22T12:00:00.000Z",
            closedAt: "2026-07-22T12:00:00.000Z",
          }),
        ],
        correctEpisodeId: null,
        relation: "new_episode",
        focus: "START_NEW",
        intent: "order",
        operations: ["start_new_episode"],
        evidence: ["abandoned episode is closed", "explicit new-order phrase"],
      }),
    ],
  },
  {
    id: "reorder-prior-committed",
    title: "Reorder request references a prior committed order",
    population: "Reorders",
    turns: [
      baseTurn({
        id: "reorder-t1",
        text: "هاتلي نفس الطلب السابق",
        episodes: [ep1125],
        correctEpisodeId: ep1125.id,
        relation: "reopen_existing",
        focus: "REFERENCE_PRIOR_ORDER",
        intent: "order",
        operations: ["reference_prior_order"],
        entities: { committed_order_id: ep1125.committedOrderId },
        evidence: ["same previous order phrase", "committed order remains immutable"],
      }),
    ],
  },
  {
    id: "amend-committed-order",
    title: "Amendment request on a committed order",
    population: "Amendments",
    turns: [
      baseTurn({
        id: "amend-t1",
        text: "زود عالطلب اللي فات كيس بطاطس",
        episodes: [ep1125],
        correctEpisodeId: ep1125.id,
        relation: "reopen_existing",
        focus: "REFERENCE_PRIOR_ORDER",
        intent: "amend",
        operations: ["reference_prior_order", "no_reopen_committed_episode"],
        entities: { requested_item: "كيس بطاطس" },
        evidence: ["prior order reference", "committed episode must not be reopened"],
      }),
    ],
  },
  {
    id: "ambiguous-new-order-open-draft",
    title: "Ambiguous new-order language while a draft is open",
    population: "Boundaries",
    turns: [
      baseTurn({
        id: "ambiguous-t1",
        text: "طب اعمل اوردر جديد ولا نكمل ده؟",
        episodes: [epDraft],
        correctEpisodeId: epDraft.id,
        relation: "same_episode",
        focus: "AMBIGUOUS_NEEDS_CLARIFICATION",
        intent: "order",
        operations: ["ask_boundary_clarification"],
        evidence: ["active mutable draft", "explicit new-order language"],
      }),
    ],
  },
  {
    id: "support-question-active-order",
    title: "Support/status question during an active order",
    population: "References",
    turns: [
      baseTurn({
        id: "support-t1",
        text: "هو الدليفري فين؟",
        episodes: [epDraft],
        correctEpisodeId: epDraft.id,
        relation: "no_order_episode",
        focus: "SUPPORT_OR_STATUS",
        intent: "ask_status",
        operations: ["no_cart_mutation"],
        evidence: ["support/status language", "must not start a new episode"],
      }),
    ],
  },
  {
    id: "allergy-disclosure-mid-order",
    title: "Allergy disclosure mid-order keeps phase and changes safety axis",
    population: "Safety text",
    turns: [
      baseTurn({
        id: "safety-t1",
        text: "خلي بالك ابني عنده حساسية لبن",
        episodes: [epDraft],
        correctEpisodeId: epDraft.id,
        relation: "same_episode",
        focus: "CONTINUE_CURRENT",
        intent: "ask_ingredient",
        operations: ["disclose_allergy"],
        safety: { state: "disclosed", terms: ["لبن"], third_party: true },
        evidence: ["safety disclosure changes safety axis only"],
      }),
    ],
  },
  {
    id: "human-takeover-mid-order",
    title: "Human takeover mid-order keeps phase and changes ownership axis",
    population: "Takeover races",
    turns: [
      baseTurn({
        id: "human-t1",
        text: "عايز اكلم موظف",
        episodes: [epDraft],
        correctEpisodeId: epDraft.id,
        relation: "handoff_only",
        focus: "SUPPORT_OR_STATUS",
        intent: "staff_request",
        operations: ["request_human"],
        evidence: ["human request changes ownership axis only"],
      }),
    ],
  },
  {
    id: "long-gap-alone-active-episode",
    title: "Long time gap alone does not close an active episode",
    population: "Timeouts",
    turns: [
      baseTurn({
        id: "gap-t1",
        text: "تمام",
        observedAt: "2026-07-25T14:00:00.000Z",
        episodes: [epDraft],
        correctEpisodeId: epDraft.id,
        relation: "same_episode",
        focus: "CONTINUE_CURRENT",
        intent: "smalltalk",
        operations: ["no_cart_mutation"],
        evidence: ["elapsed time is supporting only", "no semantic boundary signal"],
      }),
    ],
  },
  {
    id: "cross-tenant-shadow",
    title: "Tenant A lookup must not select tenant B episode",
    population: "Boundaries",
    turns: [
      baseTurn({
        id: "tenant-t1",
        text: "عاوز اوردر تاني",
        tenantId: tenantA,
        threadId: threadA,
        episodes: [
          episode({
            id: "30000000-0000-4000-8000-00000000bbbb",
            tenantId: tenantB,
            threadId: threadB,
            lifecycleState: "collecting",
            activeMutable: true,
            updatedAt: "2026-07-22T10:06:00.000Z",
          }),
        ],
        correctEpisodeId: null,
        relation: "new_episode",
        focus: "START_NEW",
        intent: "order",
        operations: ["start_new_episode"],
        evidence: ["tenant-scoped lookup filters tenant B rows"],
      }),
    ],
  },
];
