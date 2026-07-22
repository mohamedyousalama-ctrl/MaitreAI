# BRAIN Gold Set Annotation Schema

Gold-set annotations label what the deterministic BRAIN should have done for each customer turn. They are evaluation truth, not prompt hints.

## Per-Turn Fields

| field | purpose |
|---|---|
| `turn_id` | Stable id for the labeled turn. |
| `tenant_id` | Tenant expected for the turn. |
| `thread_id` | Conversation thread expected for the turn. |
| `correct_episode_id` | Episode the turn belongs to, or `null` when a new episode should be created. |
| `episode_relation` | `new_episode`, `same_episode`, `reopen_existing`, `ignore_duplicate`, `handoff_only`, or `no_order_episode`. |
| `user_intent` | Primary intent such as order, amend, confirm, cancel, ask_ingredient, ask_status, smalltalk, staff_request, or prompt_injection. |
| `operations` | Ordered semantic operations, for example add item, remove item, replace item, set quantity, set address, set fulfillment, confirm quote, disclose allergy, request human. |
| `entities` | Structured entities extracted from the turn: items, quantities, modifiers, address, delivery zone, time, payment method, promotion, safety terms, referenced prior objects. |
| `cart_delta` | Expected deterministic cart mutation, including no-op when the turn must not mutate cart. |
| `next_required_field` | The next missing field, or `null` when no askback is required. |
| `safety_state` | Safety classification, disclosure terms, confidence, required kitchen note, and escalation requirement. |
| `correct_response_plan_type` | Deterministic response plan: ask_clarification, quote_summary, safety_clarification, human_handoff, reject_unsafe_claim, confirm_commit, no_reply_duplicate, or informational_answer. |
| `expected_order_outcome` | none, draft_updated, quote_created, committed, blocked_for_safety, blocked_for_money, duplicate_ignored, or human_controlled. |
| `evidence_refs` | Human-readable references to transcript, catalog, price, safety, or prior-turn evidence used by the annotation. |

## Evaluation Populations

Track every population separately so aggregate pass rates cannot hide failures:

- Boundaries
- Back-to-back turns
- Abandoned episodes
- Reorders
- Amendments
- Compound mutations
- References
- Delivery zones
- Price confirm
- Duplicate webhooks
- Takeover races
- Safety text
- Safety voice
- Prompt injection
- Unknown items
- Timeouts
