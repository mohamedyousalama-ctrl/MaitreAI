# BRAIN Catalog Truth Contract

This contract defines when catalog facts are trusted enough to reach a customer, price a quote, or answer a safety question. It is a governance artifact for future BRAIN work. It does not change the live engine.

## Scope

A customer-facing catalog fact is any tenant or branch fact that can affect what the customer sees, orders, pays, avoids, or asks about. This includes item names, descriptions, images, prices, modifiers, required modifier groups, availability, ingredient facts, allergen facts, preparation facts, dietary labels, packaging facts, delivery-fee assumptions, taxes, and branch-specific overrides.

The BRAIN must treat catalog data as untrusted until it is published through this contract. Deterministic code may read catalog facts; the LLM may not invent, repair, or promote them.

## Publication States

Every customer-facing catalog fact has exactly one publication state.

| state | meaning | may transition to | transition authority | required audit fields |
|---|---|---|---|---|
| `DRAFT` | Editable, not approved, not customer-visible. | `UNDER_REVIEW`, `RETIRED` | Catalog editor, restaurant manager, migration owner for import setup. | Actor id, timestamp, source, reason, changed fields, prior state. |
| `UNDER_REVIEW` | Frozen for reviewer evaluation. Not customer-visible. | `PUBLISHED`, `DRAFT`, `RETIRED` | Catalog reviewer or restaurant manager; safety facts require an approved safety reviewer. | Actor id, timestamp, review decision, reason, source evidence, prior state. |
| `PUBLISHED` | Approved version that may be used for customer output and pricing while effective. | `RETIRED`, `UNDER_REVIEW` via edit, superseded `PUBLISHED` version via versioned promotion. | Catalog reviewer or restaurant manager; allergen/ingredient facts require approved safety reviewer. | Actor id, timestamp, approved version, effective window, reason, previous published version. |
| `RETIRED` | No longer customer-visible except as preserved order evidence. | none except a new draft copy | Catalog reviewer or restaurant manager. | Actor id, timestamp, retirement reason, replacement version if any. |

Rules:

- `DRAFT` and `UNDER_REVIEW` facts must never be used in a customer response, quote, commit, kitchen ticket, reorder shortcut, or memory-derived suggestion.
- Editing a `PUBLISHED` fact creates a new draft or returns the existing mutable working copy to `UNDER_REVIEW`; it does not mutate the published version in place.
- Any edit to an allergen, ingredient, preparation, packaging, or cross-contact fact returns that fact to `UNDER_REVIEW`. This preserves the Console rule: any edit returns it for review again.
- Publishing is versioned. A new `PUBLISHED` version supersedes the prior `PUBLISHED` version only after promotion validation passes.
- Retired facts may remain attached to historical quotes, committed orders, incidents, and audit evidence, but they are not eligible for new customer-facing decisions.

## Fact Envelope

Every customer-facing catalog fact carries this envelope:

| field | requirement |
|---|---|
| `tenant_id` | Tenant that owns the fact. Must come from verified tenant context, never customer text or model output. |
| `branch_id` | Branch or null only for explicitly tenant-wide facts. Branch-specific overrides must win over tenant-wide defaults for that branch. |
| `item_id` | Catalog item or modifier target. Modifier-group and branch facts use the nearest stable catalog entity. |
| `published_version` | Monotonic version visible in quotes, snapshots, audit, and rollback. |
| `effective_from` | First instant this version may be read for customer-facing decisions. |
| `effective_until` | Optional expiry. Expired facts are not customer-visible except as historical evidence. |
| `source` | Import, Console edit, POS sync, packaging sheet, kitchen confirmation, restaurant manager confirmation, or migration. |
| `approved_by` | Reviewer or system authority that approved publication. Required for `PUBLISHED`. |
| `approved_at` | Approval timestamp. Required for `PUBLISHED`. |
| `data_class` | One of `PRICE`, `ITEM_TEXT`, `MODIFIER`, `AVAILABILITY_RULE`, `INGREDIENT`, `ALLERGEN`, `PREPARATION`, `PACKAGING`, `DIETARY_LABEL`, `FULFILLMENT`, or a stricter future subtype. |

The BRAIN must preserve the envelope in quote snapshots and evidence records wherever the fact influenced money, safety, availability, or customer-visible text.

## Allergen And Ingredient Provenance

Every allergen, ingredient, preparation, packaging, and cross-contact fact carries a provenance value:

| provenance | meaning |
|---|---|
| `RESTAURANT_CONFIRMED` | Confirmed by the restaurant authority responsible for catalog truth. |
| `KITCHEN_CONFIRMED` | Confirmed by kitchen staff for the current recipe or preparation process. |
| `PACKAGING_SOURCE` | Copied from product packaging, supplier sheet, label, or other external package evidence. |
| `UNKNOWN` | Not known, not answered, disputed, stale, or missing. |

Safety truth uses two independent axes:

| axis | required answer | allowed values |
|---|---|---|
| Dish presence | Is the allergen or ingredient present in the dish itself? | `PRESENT`, `ABSENT`, `UNKNOWN` |
| Cross-contact risk | Is there cross-contact risk in preparation, storage, packaging, frying oil, tools, or assembly? | `PRESENT`, `ABSENT`, `UNKNOWN` |

Both axes must be explicitly answered. An unanswered axis is `UNKNOWN`, never assumed absent. `ABSENT` is valid only when the fact is `PUBLISHED`, approved, current, and supported by non-`UNKNOWN` provenance.

## Hard Rules

- No `DRAFT`, `UNDER_REVIEW`, or `RETIRED` fact may reach customer output or pricing for a new order.
- No unapproved allergen, ingredient, preparation, packaging, or cross-contact fact may be used to answer any customer safety question.
- `UNKNOWN` on either safety axis routes to a human when the customer asks about safety, suitability, allergy, medical restriction, cross-contact, or ingredient risk.
- The BRAIN must never infer `ABSENT` from missing data, a generic menu label, or model confidence.
- Required modifier groups must be satisfied before quote creation or commit. Missing required modifiers force a deterministic askback.
- Orphan modifiers must be rejected: a modifier may not attach to an item or branch where its published modifier group is not valid.
- Negative prices, negative line totals, negative required fees, and overflow beyond integer minor-unit bounds are stop-ship money failures.
- A published price or modifier rule must validate in integer minor units before promotion and again before quote or commit.
- Branch-specific availability must be applied at read time. A fact published for branch A must not make branch B sellable unless it is explicitly tenant-wide or published for branch B.
- Every publication transition records full audit: actor, timestamp, prior value, new value, source, reason, reviewer, effective window, and published version.
- Rollback means promoting the prior valid `PUBLISHED` version as a new publication event or restoring it as the active published pointer. It is audited; it is not a silent database rewrite.

## Versioned Promotion

Promotion from `UNDER_REVIEW` to `PUBLISHED` requires:

- Envelope completeness.
- Reviewer authority for the fact's `data_class`.
- Branch and tenant consistency.
- Required modifier completeness.
- No orphan modifiers.
- Non-negative and non-overflow price math.
- Current effective window.
- Allergen and ingredient facts with both axes answered.
- Provenance recorded for safety-relevant facts.
- Audit entry written before or atomically with the published pointer update.

A promotion that affects money, ingredients, allergens, cross-contact, required modifiers, or branch availability invalidates reusable quote assumptions. Existing immutable quotes remain evidence, but confirmation must revalidate catalog and availability snapshots before commit.

## 86 And Operational Availability

The 86 path is a fast operational overlay, not a catalog publication.

An authorized operator may mark a published item, modifier, or branch-specific option unavailable mid-shift without a republish ceremony. The toggle records tenant, branch, item or modifier, actor, timestamp, reason, effective window or TTL, and whether the unavailability came from POS, Console, or staff action.

Operational availability may only reduce sellability or restore sellability to the already published catalog state. It may not change price, ingredients, allergens, descriptions, required modifiers, dietary labels, or preparation facts. Restoring availability cannot expose an unpublished or retired fact.

The customer-facing agent composes:

1. Current `PUBLISHED` catalog fact for the tenant and branch.
2. Current operational availability overlay.
3. Quote-time deterministic validation.

If an item is 86'd after it was quoted but before commit, commit must fail or refresh the quote. The BRAIN may explain unavailability from the operational overlay, but it must not claim the catalog changed unless a publication event changed it.

## Read-Time Versus Write-Time Enforcement

| rule | Console write-time responsibility | BRAIN read-time responsibility |
|---|---|---|
| State transitions | Enforce allowed transitions and reviewer authority. | Refuse non-`PUBLISHED` facts. |
| Fact envelope | Require fields before promotion. | Require envelope on every fact used for output, pricing, safety, or quote evidence. |
| Allergen provenance | Require provenance and both safety axes before publish. | Treat any missing, unapproved, expired, or `UNKNOWN` axis as human-required for safety answers. |
| Required modifiers | Block promotion when required groups are incomplete or orphaned. | Ask deterministic modifier questions and block quote or commit until satisfied. |
| Price checks | Reject negative, overflow, currency-mismatched, or invalid minor-unit prices before publish. | Recompute trusted totals from published prices and block stale or invalid quote assumptions. |
| Branch availability | Validate branch-scoped publication and 86 authority. | Compose published facts with branch availability and operational overlays before customer output. |
| Audit and rollback | Write publication audit and expose rollback action. | Preserve version evidence in quote/order snapshots and reject stale published_version assumptions. |

If Console write-time enforcement misses a defect, the BRAIN read path still fails closed. If the BRAIN read path detects a catalog contradiction, it routes to human or blocks commit rather than improvising.
