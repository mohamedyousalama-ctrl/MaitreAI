# Kivo Agent — Authoritative Knowledge Base and Roadmap

**Status:** Core roadmap independently approved on 25 July 2026. The authoritative revision is always the version present on `main`.<br>
**Owner:** Mohamed Salama<br>
**Product:** Kivo<br>
**Frontline agent:** Karim / كريم<br>
**Pilot tenant:** Wesaya / وصاية, Cairo<br>
**Repository:** [`mohamedyousalama-ctrl/MaitreAI`](https://github.com/mohamedyousalama-ctrl/MaitreAI)<br>
**Production:** [`getkivo.io`](https://getkivo.io)<br>
**Supabase project:** `zlighrbsjexrozrmuwpw`<br>
**Truth snapshot:** 25 July 2026<br>
**Repository evidence baseline:** [`0d8ae003d2390cab099cc72bcb2c50d1008b3696`](https://github.com/mohamedyousalama-ctrl/MaitreAI/commit/0d8ae003d2390cab099cc72bcb2c50d1008b3696)

This is the independently reviewed `main` baseline after PR #553, not a claim
that `main` can never move.

---

## 0. Authority and use

This is the single current roadmap and knowledge index for **Karim and the Kivo Agent system**.

It has five jobs:

1. Explain what Karim is and what belongs inside or outside the agent.
2. Preserve the founder’s product knowledge, audit decisions and learning.
3. State the verified current condition without marketing language.
4. Control the order in which remediation and new-BRAIN work proceeds.
5. Link every material statement to durable evidence where that evidence exists.

### 0.1 Status language

Every material item uses one or more of these canonical proof and lifecycle states:

| State | Meaning |
|---|---|
| **VERIFIED** | Independently checked in code, GitHub, production data or a reproducible test |
| **MERGED** | Present on `main` |
| **APPLIED** | Present in the production database |
| **IN PROGRESS** | An approved work order is active |
| **BLOCKED** | Work must not proceed until its named dependency is cleared |
| **PLANNED** | Accepted scope, not started |
| **DEFERRED** | Explicitly postponed under a recorded decision |
| **HISTORICAL** | Useful background, not current authority |
| **REJECTED** | Disproved, unsafe or superseded |
| **UNPROVEN** | Plausible but not accepted as truth |

Operational qualifiers may accompany a canonical state but never replace its proof:

| Qualifier | Meaning |
|---|---|
| **OPEN** | Unresolved; no completion claim |
| **APPROVED** | Authorized by the named decision-maker; not necessarily merged, applied or complete |
| **READY** | The artefact or action is prepared for its named next gate |
| **BLOCKING** | Later named work must wait; normally paired with `BLOCKED`, `IN PROGRESS` or `PLANNED` |
| **NOT STARTED** | No active work order; equivalent to `PLANNED` only when scope has been accepted |
| **REPRODUCED** | A defect has an executable reproduction; it is not thereby repaired |
| **FROZEN** | Work or a branch is intentionally held and must not advance |
| **ACTIVATES ON MERGE** | The stated transition takes effect only when the named PR reaches `main` |

No qualifier satisfies an exit condition by itself.

### 0.2 Truth precedence

When sources disagree, use this order:

1. Current production database and deployment read-back
2. Code at the named commit
3. Passing executable reproduction
4. Applied migration record
5. Signed founder decision
6. Approved specification
7. Builder handback
8. Historical roadmap or conversational claim

A builder’s statement is never proof of its own work. A screenshot proves only what is visible in the screenshot. An inference remains an inference until verified.

### 0.3 Change rule

This file must be updated whenever any of these changes:

- production or `main`
- a launch blocker
- a migration
- an audit ruling
- a work-order state
- a signed exception
- a pilot gate
- a core BRAIN invariant

No parallel “current roadmap” may compete with this file. Older roadmaps remain available as history and must point here.

---

## 1. Founder summary

### 1.1 What Kivo Agent is

Karim is the customer-facing worker inside Kivo. He receives restaurant conversations, understands the request, uses real menu and operational data, builds the order, protects safety and money truth, hands control to staff when required, and records structured facts for the wider Kivo system.

Karim is **not** the whole product. He is the frontline agent connected to a shared BRAIN and to governed restaurant modules.

### 1.2 Current verdict

**Pilot status: NO-GO.**

The product is pre-commercial and must not accept the first public order until the go-live gates in this document pass.

The most urgent current facts are:

1. **WhatsApp ingress is blocked.** Production callbacks are being rejected with HTTP `401` before Karim runs. The rejected identifier is visible in the founder's Meta test-number screen, but its equality to production `WHATSAPP_PHONE_NUMBER_ID` remains unproven.
2. **Safety ingress migration 0104 is applied**, but the E0 application integration and real PostgreSQL proof are not cleared.
3. **Confirmed-order acceptance is not repaired.** R0 only centralized the existing contract; R1 must add the durable confirmation and acceptance facts.
4. **The pending-order population grew during remediation.** Production currently has 127 non-test Wesaya orders in `pending_confirmation`; the latest was created on 23 July while C-01 was open. New non-test order creation must be stopped before WhatsApp is restored.
5. **Payment truth, one-active-writer and alert delivery remain unproven.**

### 1.3 What happens next

Two repository gates are complete:

- PR #554 is **MERGED** at
  `21268dcd7594f2a77e062dcdc72660bbdb4221c5`, activating this authoritative
  roadmap.
- PR #553 is **MERGED** at
  `0d8ae003d2390cab099cc72bcb2c50d1008b3696` as source-only history without
  reapplying migration 0104.

The active controlled order is:

1. Enforce P0-ORD-01, the temporary freeze on new non-test Wesaya order creation.
2. Repair P0-WA-01 WhatsApp signature verification and prove the existing webhook accepts and persists one non-order test message.
3. Remove or govern P0-SHADOW-01, the public shadow BRAIN ingress route.
4. Rebuild and run the E0 database verification correctly.
5. Finish E0 and E1 as one pilot safety increment, then prove durable ingress and terminal scanning live.
6. Complete order acceptance truth and the remaining pilot blockers.
7. Run the complete live proof before any public order.

---

## 2. Verified project baseline

### 2.1 Git and deployment

| Fact | State | Evidence |
|---|---|---|
| Repository evidence baseline after PR #553 | **VERIFIED** at `0d8ae003d2390cab099cc72bcb2c50d1008b3696`; this records the reviewed baseline, not an immovable `main` | [Commit](https://github.com/mohamedyousalama-ctrl/MaitreAI/commit/0d8ae003d2390cab099cc72bcb2c50d1008b3696) |
| Authoritative roadmap activation | **MERGED** in PR #554 at `21268dcd7594f2a77e062dcdc72660bbdb4221c5` | [PR #554](https://github.com/mohamedyousalama-ctrl/MaitreAI/pull/554) |
| R0 shared acceptance contract | **MERGED** in PR #551 | [PR #551](https://github.com/mohamedyousalama-ctrl/MaitreAI/pull/551) |
| Safety reproduction harness | **MERGED** in PR #552 | [PR #552](https://github.com/mohamedyousalama-ctrl/MaitreAI/pull/552) |
| 0104 source reconciliation | **MERGED** in PR #553 at `0d8ae003d2390cab099cc72bcb2c50d1008b3696`; frozen SQL SHA-256 `560e060351c793990daa8f61bbdad95e998d508977e1610478881d7582c38b80` | [PR #553](https://github.com/mohamedyousalama-ctrl/MaitreAI/pull/553) |
| E0 application integration | **NOT MERGED** | Branch `wo-e0-safety-ingress` at `e1e0cc92b0fe476a7e6f52ac853c8da983fc7744` |
| Partial payment branch | **FROZEN** | `wo-eng-4-payment-defects-20260723` at `617de81`; incomplete and stale |

### 2.2 Production database

Verified by read-only query on 25 July 2026:

| Fact | Value |
|---|---:|
| Applied migration ledger rows | 65 |
| Latest applied migration | `20260724034339 / 0104_safety_ingress_evidence` |
| Platform-wide orders | 140 |
| Wesaya orders | 128 |
| Wesaya non-test orders | 127 |
| Wesaya test orders | 1 |
| Wesaya non-test `pending_confirmation` | 127 |
| Wesaya test `delivered` | 1 |

The first reconciliation counted 126 pending rows. The current total is not merely a corrected count: one further non-test `pending_confirmation` order was created on 23 July 2026 at `17:26:00.820036Z` while remediation was underway. The historical population was therefore not closed.

This does **not** rewrite the signed historical decision. It creates two mandatory controls:

1. stop new non-test Wesaya order creation before the WhatsApp channel is restored
2. make operational exclusion depend on durable confirmation/attempt provenance, never a hard-coded count

Seven orders have both `customer_id` and `conversation_id` null. Eight orders have `conversation_id` null. The seven both-null rows remain unresolved historical records consistent with deletion through `ON DELETE SET NULL`, but the actual deletion events cannot be reconstructed. All eight conversation-null rows are incompatible with any future key that requires `conversation_id` and must remain non-actionable.

### 2.3 Safety-ingress substrate

| Item | Current state |
|---|---|
| `webhook_envelopes` | 0 rows, re-verified 25 July 2026 |
| `channel_events` | 0 rows, re-verified 25 July 2026 |
| `ingress_safety_scans` | 0 rows, re-verified 25 July 2026 |
| `ingress_safety_evidence` | 0 rows, re-verified 25 July 2026 |
| Migration 0104 | **APPLIED**; source **MERGED** through PR #553 at `0d8ae003d2390cab099cc72bcb2c50d1008b3696`; SQL frozen at SHA-256 `560e060351c793990daa8f61bbdad95e998d508977e1610478881d7582c38b80` |
| E0 live webhook integration | **NOT MERGED** |
| Rollback-only production verification | **REJECTED; script defects can create false passes** |

### 2.4 Feature and operating posture

Production flag state was re-verified on 25 July 2026.

- Wesaya is pre-commercial and founder supervised.
- `delivery_runs` was disabled for all tenants.
- Wesaya has no applicable promotions; three expired rows were moved to `ended`.
- The Wesaya production flag row holds 34 keys, with every key true except `delivery_runs=false`.
- `allergy_simple=true` and `safety_bridge=true` coexist even though the legacy code disables the bridge in that combination. This is a confirmed governance contradiction.
- No card-payment path is approved for the Wesaya pilot.

---

## 3. P0 incident and containment register

### P0-ORD-01 — Stop the pending-order population from growing

**State:** VERIFIED live condition; mandatory code guard not implemented.<br>
**Named work order:** `WO-ENG-P0-ORDER-FREEZE`

The first reconciliation observed 126 Wesaya pending orders. Production now contains 127 non-test pending orders; the newest was created during remediation on 23 July. No public operation is approved, but the existing test flow can still create rows that look non-test and actionable under legacy rules.

No existing feature or server control can guarantee this freeze. The work order must add an explicitly enabled, reversible tenant feature `order_finalization_freeze` and enforce it immediately before `persistOrderFromDraft`.

**Exclusive file territory:**

- `lib/tenant/tier.ts` — declare the feature
- `lib/messaging/respond-and-send.ts` — block finalization before persistence
- `scripts/fixtures/wesaya-production-flags.ts` — capture the post-enable vector
- `scripts/proof-order-finalization-freeze.test.ts` — focused proof

No migration, payment, acceptance or other application file is in scope.

**Sequencing against E0:**

1. Pause `wo-e0-safety-ingress`; it must not change or rebase concurrently.
2. Build `WO-ENG-P0-ORDER-FREEZE` from current `origin/main` in the same engine mutation window that owns `respond-and-send.ts`.
3. Independently prove the freeze, merge it alone and deploy it.
4. Set `order_finalization_freeze=true` for Wesaya and read it back.
5. Rebase E0 onto the new `main`, verify the freeze remains intact, then resume E0.

This is sequential use of the E0→E2 file territory, not a parallel workstream.

**Acceptance before WhatsApp signature repair:**

1. Wesaya flag is explicitly true in production.
2. A confirmation attempt creates no order row.
3. No “order placed” customer message is sent.
4. A durable critical alert identifies the blocked finalization.
5. Non-order channel testing remains available.
6. The frozen baseline remains 127 non-test pending rows.
7. The flow alerts and stops if that baseline increases.

Operational instruction alone is insufficient.

**Founder-controlled lift point:**

The freeze remains explicitly true through channel repair and remediation. It may be lifted only when:

1. E0–E3 and R1/R1b/R1c are deployed at their approved revisions.
2. The durable R1 cutover record exists and matches its ledger row.
3. Every order lacking current-attempt confirmation and provider provenance is proven absent from actionable surfaces.
4. The pre-lift Wesaya non-test baseline is recorded and has not increased.
5. All other substantive safety, order, payment, writer, alert and isolation proofs required before the complete live proof have passed; the freeze-lift mechanics themselves are excluded from this precondition.
6. The founder gives explicit approval for one controlled live-proof order.

The PM then sets `order_finalization_freeze=false`, reads it back, and captures a new hashed production flag vector in `scripts/fixtures/wesaya-production-flags.ts`. That **post-lift** vector becomes the pilot fixture. The earlier freeze-on capture is a remediation fixture preserved by Git history and the work-order application record. The complete live-order proof runs after the lift. Any failure immediately restores the freeze and returns to report-before-repair governance.

Enabling the freeze adds a thirty-fifth Wesaya feature key. The dated 34-key statement in §2.4 is the pre-freeze baseline, not a permanent invariant, and must be updated when the guarded production vector changes.

### P0-WA-01 — Production callbacks fail signature verification

**State:** Callback failure VERIFIED; production-number mapping UNPROVEN; repair not started.

Observed evidence:

- production webhook requests are returning HTTP `401`
- the anomaly records contain `phone_number_id=1204305262760496` and no resolved restaurant
- the founder's Meta screenshot visibly labels `1204305262760496` as a test Phone Number ID
- the production `WHATSAPP_PHONE_NUMBER_ID` value cannot be read from the available read-only interfaces

Therefore, equality between the screenshot's test number and the production environment value is **UNPROVEN**. The screenshot does not establish the production configuration.

Accurate incident statement:

> The production WhatsApp webhook is rejecting observed callbacks with HTTP 401 before normal persistence or Karim. The rejected identifier appears in the founder's Meta test-number screen, but its relationship to the production environment configuration remains unproven.

Wesaya is documented as pre-commercial, but the technical impact cannot be narrowed to test traffic until the production identifier is compared through a secure execution path.

Likely cause:

- the Meta application signs with an App Secret that does not match the production `WHATSAPP_APP_SECRET`, or
- the webhook is associated with a different Meta application configuration than the secret stored in production.

The cause must be proven during repair. Do not rotate or copy a secret based only on the likelihood.

**Repair acceptance:**

1. P0-ORD-01 is active before any message test.
2. Identify the exact Meta application, Phone Number ID and production Vercel project without exposing secrets.
3. Prove whether the observed identifier equals production `WHATSAPP_PHONE_NUMBER_ID`.
4. Align the correct App Secret directly between Meta and Vercel.
5. Redeploy production.
6. Send the exact text `مساء الخير، اختبار اتصال فقط`. It contains no order intent, safety/allergy content, media or voice.
7. Prove the existing merged webhook returns `200`.
8. Prove the existing legacy path persists exactly one inbound message under the correct tenant.
9. Prove the expected outcome: Karim sends one normal non-safety reply through the legacy path.
10. Prove no order is created and no secret is logged.
11. Replay the same provider message ID through the legacy path and prove one persisted message and at most one customer reply.
12. Record the `invalid_signature` baseline at repair completion, then prove zero new rows for the confirmed production identifier during a 30-minute observation containing a fresh inbound message.

Durable BRAIN ingress and terminal safety scanning are **not** P0-WA-01 acceptance criteria because current `main` does not contain E0 wiring. They are E0 live acceptance criteria after the channel is restored. This removes the former P0/E0 circular dependency.

### P0-SHADOW-01 — Public shadow ingress route

**State:** VERIFIED deployed route; disposition not implemented.

[`app/api/brain/ingress/whatsapp/route.ts`](https://github.com/mohamedyousalama-ctrl/MaitreAI/blob/935afaf42a6e7912f842aa2b6fed9140de806648/app/api/brain/ingress/whatsapp/route.ts) is a second public WhatsApp ingress endpoint with its own tenant resolution, signature path and BRAIN store call.

Before pilot, it must be:

- removed if it has no governed purpose, or
- repaired and proven to share the one canonical ingress contract

It may not remain as an independently reachable writer into the ingress substrate.

---

## 4. Product vision

### 4.1 The wedge

Kivo’s first sellable promise is narrow:

> Connect a restaurant’s WhatsApp. Karim handles customer questions and orders using real restaurant data, protects safety and order truth, and gives staff clear control.

### 4.2 The strategic product

The wider product is the **Restaurant Direct Commerce OS**:

customer conversation → structured truth → order → restaurant acceptance → kitchen and fulfilment → payment truth → customer memory → insights → governed action → measured result.

The long-term moat is not chat style. It is:

1. durable structured truth
2. restaurant-specific insight
3. safe decisions
4. executable actions
5. measured feedback loops

### 4.3 What is not being built now

- shared driver marketplace
- complex route optimization
- broad CRM automation
- multi-industry expansion
- multiple channels before WhatsApp is proven
- advanced campaigns
- unsupervised administrative agents

The new BRAIN is an extension of the work already built. Karim is not being rebuilt from scratch.

---

## 5. Architecture and module boundaries

### 5.1 Core Kivo Agent

These capabilities belong to the core Karim/BRAIN contract:

- webhook verification and tenant resolution
- durable raw inbound
- safety scanning and evidence
- active intake-attempt identity
- catalog-grounded understanding
- deterministic order-state reduction
- missing-fact planning
- truthful pricing projection
- one-time finalization
- customer confirmation provenance
- human takeover and one-active-writer
- customer notifications and delivery result tracking
- conversation and order observability

### 5.2 Kivo modules

A module is a bounded business capability with its own truth, permissions, tests and lifecycle. It may consume facts from Karim, but it must not silently redefine the core order or safety contract.

| Capability | Classification | Rule |
|---|---|---|
| Menu/catalog | Core truth service | Karim may explain it, never invent it |
| Order building | Core agent capability | One active attempt, deterministic state |
| Restaurant acceptance | Order-operation module | Server/database transition is authoritative |
| Kitchen handoff | Operational module | Receives only accepted current-order facts |
| Delivery intake | Core order facts | Pickup/delivery, address, zone, fee and contact |
| Driver dispatch/tracking | Optional delivery module | Inactive until explicitly approved and isolated |
| Payments | Payment module | Owns sessions, provider events and money-state transitions |
| COD ledger | Finance/operations module | Consumes delivered-order truth |
| Alerts | Operational safety service | Persistence is not equivalent to human delivery |
| Insights | Future shared-BRAIN module | Reads structured truth; does not mutate orders |
| Marketing/growth | Future governed module | Requires approval, margin and consent controls |

Therefore, `delivery/kitchen` is not one undifferentiated agent folder. Kitchen handoff and delivery dispatch are modules. Delivery mode, address, zone and fee are core order facts shared with those modules.

### 5.3 Current bridge and new BRAIN

The system temporarily has two engines:

- **Legacy bridge:** current customer behaviour and order flow.
- **New BRAIN substrate:** durable ingress, thread/episode foundations and execution infrastructure being introduced gradually.

The controlled migration rule is:

1. introduce one invariant
2. prove it independently
3. activate the narrow path
4. keep legacy behaviour unchanged outside that boundary
5. retire the legacy path only after live proof

E0 activates only BRAIN ingress persistence. It must not create BRAIN threads, episodes, execution jobs, ownership decisions or outbound messages.

---

## 6. Kivo Agent constitution

These rules are non-negotiable.

### 6.1 Truth

1. Menu items, variants, choices, availability and prices come from authoritative restaurant data.
2. The model may communicate facts but may not manufacture them.
3. Totals, fees, discounts and payment state come from deterministic application/database logic.
4. Unknown information is labelled unknown; it is never guessed.

### 6.2 Safety

1. Customer-authored safety evidence is recorded before coalescing, ownership checks or model execution.
2. Safety behaviour must not disappear because a feature flag or human takeover is active.
3. A machine transcript is derived evidence, never labelled as the customer’s exact original words.
4. Historical safety disclosures never silently become the current order’s kitchen note.
5. Current-order propagation requires the same tenant and intake attempt.
6. A safety persistence failure stops normal processing and is retryable.
7. Recording an alert does not prove that a human received it.
8. Karim never claims an item is medically safe.

### 6.3 Active attempt

1. Exactly one open intake attempt owns the mutable draft.
2. Finalized, cancelled or reset attempts are immutable.
3. The next attempt starts only with durable new-draft creation.
4. A prior basket cannot donate items or facts to a new attempt.
5. One attempt can create at most one order.

### 6.4 Human control

1. At most one writer is authorized at the send boundary.
2. When a human owns the conversation, Karim does not send normal replies.
3. Safety evidence still records during human ownership.
4. Every ownership transition is tenant-bound, epoch-bound and auditable.

### 6.5 Idempotency and failure

1. Provider retries create one durable effect.
2. No path treats “already persisted” as “fully processed” unless every required stage is complete.
3. A failed critical write cannot be hidden by advancing a watermark.
4. Tests must prove both the intended effect and the absence of forbidden effects.
5. Broad exception handlers cannot count an unrelated error as a passing negative test.

### 6.6 Tenant isolation

1. Every business and evidence record is tenant-bound.
2. Privileged functions validate tenant parents internally.
3. Service-role access does not replace tenant validation.
4. Cross-tenant reads, writes, bindings and provider-message provenance must fail.

---

## 7. Farah’s Karim quality findings

Farah’s “Normal Customer” test is preserved as product evidence, not treated as a tone review.

### 7.1 Findings

| ID | Finding | Severity | Correct owner |
|---|---|---:|---|
| KF-01 | Karim offered an option and later contradicted its existence | High | Catalog truth |
| KF-02 | Karim asked again for item and quantity already supplied | Critical | Active attempt / missing-fact planner |
| KF-03 | A prior order’s basket appeared in the current order | Critical | Attempt isolation |
| KF-04 | “Order registered” appeared twice; duplicate DB order not yet proven | Critical suspected | Finalization/idempotency |
| KF-05 | Recommendation did not visibly explain why it fit “light, for one” | Medium | Recommendation planner |
| KF-06 | An early total was not clearly separated from unknown delivery fees | Low | Pricing projection |
| KF-07 | Address/phone collection did not use minimum-necessary context | Low | Delivery intake policy |
| KF-08 | An ambiguous reply after submission reopened the completed flow | High | Post-order router |
| KF-09 | Customer-visible reference `#1136` has no matching Wesaya `order_number` | High, unresolved | Receipt/finalization truth |

### 7.2 Corrections to initial interpretation

- Karim should not always ask a clarification before recommending.
- Offering a menu after an unavailable item is acceptable; invented or ungrounded alternatives are not.
- Address and phone do not automatically require separate turns.
- The source screenshot visibly contains reference `#1136`, but production Wesaya `order_number` values are contiguous from 1001 to 1128 and no order 1136 exists. The meaning of `#1136` is **UNPROVEN**. It may be a non-order reference or a customer-visible reference without a persisted order; it must be investigated with KF-04 rather than treated as resolved.
- ETA must not be promised without a trusted source.
- This report does not justify building delivery tracking.

### 7.3 Permanent BRAIN contracts derived from the report

- Catalog Truth
- Active Attempt
- Deterministic Reducer
- Missing-Fact Planner
- Summary Projection
- Terminal Finalization
- Post-order Router
- Delivery Intake Boundary
- Full turn observability

These findings extend the new BRAIN. They do not justify a prompt-only patch or a rewrite from zero.

---

## 8. Audit finding register

### 8.1 Critical

| ID | Finding | Current state | Required work |
|---|---|---|---|
| C-01 | Confirmed orders cannot enter the acceptance flow | Open | R1 |
| C-02 | Safety can be bypassed during human takeover | Reproduced | E0 + E1 |
| C-02a | Live flags advertise `safety_bridge=true`, but `allergy_simple=true` prevents the bridge from being evaluated; absent-operator coverage is unproven | Reproduced configuration; critical safety gap | E1 |
| C-03 | Customer image captions can lose safety disclosures | Reproduced | E0 + E2 |
| C-04 | Earlier message can be lost when coalescing is inactive/degraded | Narrowed and reproduced | E2 / watermark fix |
| C-05 | Cancelled order may remain payable | Open | R4 |
| C-06 | Payment event can leave order/session truth inconsistent and still be consumed | Open | R4 |

### 8.2 High

| ID | Finding | Current state | Required work |
|---|---|---|---|
| H-01 | Send route can bypass the single-writer guarantee | Open | R5 |
| H-02 | Duplicate-order prevention is not atomic | Production pattern supports concern | R1b |
| H-03 | Application money uses floating point | Deferred by signed pilot exception | R6 before merchant two |
| H-04 | Egypt cash-only behaviour is not server-enforced | Open | R4A |
| H-05 | Failed customer notifications lack durable recovery | Open | R1c/E1 intent pattern |
| H-06 | Legacy intake/acceptance boundary is inconsistent | Open | R1 and surface inventory |

### 8.3 Medium and governance

| ID | Finding | Current state |
|---|---|
| M-01 | Tenant isolation lacks complete live behavioural proof | Open |
| M-02 | Repository alone did not prove live migration/flag truth | Partially remediated by manifests and read-back |
| M-03 | Safety vocabulary is not yet one universal contract | Open |
| GOV-01 | `ROADMAP.md` falsely claimed current single-source authority | Resolved in PR #554; repository authority changes when that PR merges |
| GOV-02 | `DEPLOYMENT.md` documents an inoperable migration process | Must be corrected |
| GOV-03 | Hundreds of stale branches create deletion risk | Cleanup deferred; every active branch must rebase and show zero unexplained deletions |
| GOV-04 | Builder handbacks repeatedly overstated evidence | Author/verifier separation remains mandatory |
| GOV-05 | Pending population grew from 126 to 127 during remediation | P0-ORD-01 freeze plus durable-fact exclusion replaces hard-coded count |

### 8.4 Operational findings

| ID | Finding | Current state |
|---|---|---|
| F-1 | `delivery_runs` enabled despite UI flag off | Operationally closed; code boundary still needs R0b proof |
| F-3 | Safety alerts were stored but human receipt/escalation is unproven | Phone drill is mandatory |
| F-4 | `payment_unspecified` fired on 115 unique orders | Root cause incomplete; R4A blocked on trace |
| F-5 | Production/source revision claims were previously wrong | Current facts must always be re-read |
| NEW | Watermark-read failure degrades coalescing to a lossy path | Open; assigned to E2 |

---

## 9. Remediation and new-BRAIN roadmap

### Phase 0 — Knowledge and governance

| Item | State | Exit condition |
|---|---|---|
| K0 | **MERGED** through PR #554 | This independently approved file is repository authority |
| K1 | **MERGED** through PR #554 | PR #554 marks the old roadmaps historical and points them here |
| K2 | **MERGED**; **ACTIVATES ON MERGE** | `DEPLOYMENT.md` §B states the governed migration policy: the permitted §12.3 isolated-workspace application path and its four preconditions; no repository-level or broad `db push`; no historical replay; no dashboard paste; no migration repair; no re-application of an applied migration; applied migrations immutable absent a signed re-baseline; a brand-new environment requires a separate founder-approved bootstrap plan and a verified schema manifest |
| K3 | **MERGED** through PR #553 | PR #553 was independently reviewed and merged without reapplying 0104 |
| K4 | **OPEN** | Signed historical-risk record receives a 126→127 growth and predicate clarification |

### Phase 1 — Contain order creation and restore the channel

| Item | State | Depends on |
|---|---|---|
| P0-ORD-01 / `WO-ENG-P0-ORDER-FREEZE` | **BLOCKING; mandatory code guard** | Engine mutation lane; merge before E0 resumes; baseline stays 127 |
| P0-WA-01 | **BLOCKING** | `WO-ENG-P0-ORDER-FREEZE`, controlled Meta/Vercel alignment and successful legacy-path test |
| P0-SHADOW-01 | **BLOCKING BEFORE PILOT** | Remove or govern the second ingress route |

### Phase 2 — Safety ingress and response

| Item | Purpose | State | Depends on |
|---|---|---|---|
| E0 | Persist raw inbound and safety scan before anything can discard it | Migration applied; application unmerged; proof blocked | Correct verification; P0-WA-01 for live acceptance |
| E1 | During human takeover, create deterministic customer acknowledgment and human escalation | Specification not approved | E0 |
| E2 | Cover text, degraded bursts, image captions and voice-derived evidence | Planned | E0; narrowed C-04 |
| E3 | Bind exact current-attempt disclosure to the accepted order and kitchen handoff | Planned | E0 + R1 |

**Binding:** E0 and E1 are one pilot safety increment. E0 alone does not close C-02 and must never be represented as complete remediation.

### Phase 3 — Order and acceptance truth

| Item | Purpose | State | Depends on |
|---|---|---|---|
| R0 | Shared vocabulary and eligibility contract | **MERGED** PR #551; no behaviour change | — |
| R0b | Prove delivery tracking/run writers are inactive after cutover | Not started | R0 |
| R1 | Add current-attempt confirmation, message provenance, durable cutover and acceptance facts | Blocked; logical migration `order_acceptance_contract_v1`, repository sequence expected as 0105 | R0 + approved spec |
| R1b | Enforce atomic one-order-per-confirmation | Blocked | R1 |
| R1c | Durable, non-duplicating customer acceptance notification | Blocked | R1 |
| R5 | Enforce one assigned writer at the send boundary | Not started | R0 |

R1’s authoritative transition must include:

- tenant
- current intake attempt
- customer confirmation time
- confirmation provider-message provenance
- cancellation state
- test exclusion
- not already accepted
- the winning acceptance update

A pre-read check is insufficient because cancellation and acceptance can race.

### 9.1 Exact acceptance cutover

The cutover is not a count and is not inferred from a deployment date.

R1 must create one durable cutover record inside the same production migration transaction as the new acceptance facts. The record must include:

- tenant
- logical contract name `order_acceptance_contract_v1`
- database cutover timestamp
- approved SQL hash
- exact 14-digit execution version and execution name, embedded as approved SQL literals

The migration does not discover its own ledger row. The timestamped execution version is allocated first, inserted into the SQL as a literal, and included in final hash approval before dry-run or application. Post-application read-back then proves that the literal matches the ledger row written by the applier.

For actionability, time is secondary. An order is always non-actionable if any of these are absent:

- current-attempt identity
- `customer_confirmed_at`
- matching confirmation provider-message provenance

This excludes all legacy rows and any row accidentally created between schema application and application deployment. Before application, a read-only manifest of all existing Wesaya order IDs must be captured and hashed for historical reporting. The executable queue test uses the durable facts above, not the expected row count.

### Phase 4 — Payment truth

| Item | Purpose | State |
|---|---|---|
| R4A | Server-enforced Wesaya cash-only behaviour and canonical payment selection | Not started |
| R4 | Atomic cancelled-order/session/provider/event truth | Frozen partial branch; must be rebuilt from current `main` |
| R6 | Integer minor units end to end | Deferred for supervised Wesaya pilot; expires before merchant two |

R4A must not be written until the 115 `payment_unspecified` alerts are traced to:

- persisted order payment value
- customer-visible choice
- exact emitting code condition

### Phase 5 — Operator surfaces

Planned after the core truth contracts:

- menu availability / 86 control
- notification acknowledgment and escalation
- kitchen handoff
- shift preflight
- “More” health/status page

These screens consume authoritative facts. They must not invent separate status logic.

### Phase 6 — Pilot proof

The pilot remains blocked until every gate in section 10 passes.

### Phase 7 — Post-pilot agent improvement

After stable supervised orders:

1. expand Farah’s playbook into fixed regression fixtures
2. native review of Egyptian, Saudi and Arabizi corpus
3. catalog-grounded recommendations
4. missing-fact planner
5. deterministic correction/replacement reducer
6. post-order router
7. structured conversation outcomes
8. insights and governed action modules

---

## 10. Go-live gates

No public order is allowed until all are proven.

### Channel

- [ ] P0-ORD-01 prevents any new non-test order before channel repair
- [ ] Production webhook returns 200 for the controlled non-order test
- [ ] Correct tenant is resolved
- [ ] Existing legacy persistence records exactly one message
- [ ] Legacy duplicate delivery with the same `channel_message_id` persists one message and sends at most one reply
- [ ] Karim sends the expected normal reply to the exact non-order, non-safety text `مساء الخير، اختبار اتصال فقط`
- [ ] After repair, zero new `invalid_signature` rows appear for the confirmed production identifier during a 30-minute observation containing a fresh inbound
- [ ] No credentials appear in logs
- [ ] Public shadow ingress route is removed or governed by the canonical contract

### Safety

- [ ] E0 database verification passes against real PostgreSQL
- [ ] E0 integration is merged and deployed
- [ ] After E0 deployment, duplicate webhook delivery produces one envelope/event/scan
- [ ] After E0 deployment, scan reaches a terminal result before bridge release
- [ ] E1 acknowledgment and escalation are delivered
- [ ] Caption and degraded-burst reproductions pass
- [ ] Voice transcript provenance is correct
- [ ] Historical disclosure cannot contaminate a new order
- [ ] Current disclosure reaches the current order/kitchen note

### Orders

- [ ] R1 durable confirmation and acceptance facts are live
- [ ] R1b prevents concurrent duplicate orders
- [ ] R1c sends exactly one truthful acceptance notification
- [ ] Durable cutover record and pre-application order-ID manifest are preserved
- [ ] Every order lacking current-attempt confirmation plus provider provenance is absent from actionable surfaces
- [ ] No accepted order is displayed as awaiting confirmation

### Operations

- [ ] R5 one-active-writer proof passes
- [ ] R0b proves no new delivery-tracking row is created
- [ ] Critical phone alert drill proves delivery, acknowledgment and escalation
- [ ] Staff know the manual fallback
- [ ] Maximum supported concurrent conversations/orders is measured and documented

### Money

- [ ] R4A blocks confirmation if canonical payment resolution fails
- [ ] Wesaya cannot enter an unapproved card/wallet path
- [ ] Cancelled order cannot receive a normal paid flow
- [ ] Payment event transaction and duplicate-delivery tests pass

### Isolation and live story

- [ ] Two-tenant attack suite passes
- [ ] Production deployment SHA is captured and matches the approved pilot revision
- [ ] Wesaya non-test historical baseline has not increased before R1 cutover
- [ ] Founder approves the controlled freeze lift after the durable R1 cutover and all pre-live-proof gates
- [ ] `order_finalization_freeze=false` is read back before the complete live proof
- [ ] Post-lift production environment/feature vector is captured, hashed and becomes the approved pilot fixture
- [ ] Complete live proof passes:

  WhatsApp message → durable ingress → safety scan → Karim → current attempt → confirmation → one order → acceptance queue → restaurant acceptance → customer notification → kitchen handoff.

---

## 11. Testing system

### 11.1 Evidence labels

| Label | Use |
|---|---|
| OBSERVED | Visible in transcript, screenshot or output |
| REPORTED | Tester interpretation |
| INFERRED | Technical hypothesis |
| VERIFIED | Confirmed in code, data, logs or reproducible test |

### 11.2 Required test record

Every Karim test records:

- code revision
- tenant
- production-like flag fixture and its hash
- channel
- catalog snapshot/version
- conversation
- provider message ID
- intake attempt
- state before/after
- customer-visible response
- external side effects
- finalization result and order ID

### 11.3 Regression rules

1. Preserve the exact failing customer input.
2. Write the red reproduction before the fix.
3. Mark broken-behaviour tests clearly; never let a red acceptance suite appear green.
4. Verify the negative path failed for the intended reason.
5. Re-run focused, Karim-core, safety, type and build suites.
6. Run live proof before merging customer-facing behaviour.

### 11.4 Detector corpus

The current 50-case corpus reported:

- 39 passes
- 6 misses
- 5 record-only cases
- 20 native-review cases

The main gap is cross-script/Arabizi safety language, especially Arabizi symptoms and English-framed avoidance mixed with Arabic allergens. A phonetic false positive was also observed on a non-allergen salt restriction.

No detector policy is accepted until a native Egyptian/Saudi reviewer resolves the marked fixtures.

---

## 12. Data and migration governance

### 12.1 Current migration truth

- The production ledger contains 65 timestamp versions.
- Repository migration files use four-digit logical names.
- No repository `supabase/config.toml` exists.
- No CI workflow or package script applies migrations.
- The old documented `supabase db push` path is inoperable from the repository and would see the entire four-digit history as unmatched if linked.
- Production 0104 is already applied and must not be applied again.

### 12.1a Migration numbering

- `0105` remains **reserved** for the logical migration
  `order_acceptance_contract_v1`. That reservation is unchanged.
- `0106` is **reserved** for the P0-ORD-01 safety-containment migration. No such
  migration has been created, prepared, approved or applied. This entry reserves
  the logical label only.
- Four-digit logical labels **do not** define production execution order. They
  are filing labels only.
- Production execution order is determined solely by the approved **14-digit
  ledger version** in `supabase_migrations.schema_migrations`.
- A gap or an out-of-order four-digit label is therefore expected and harmless:
  `0106` may be applied before `0105` without any inconsistency, because the
  ledger version, not the label, records order.
- Future tooling **must never** sort, select or apply migrations by their
  four-digit labels.
- The signed R1 addendum is unaffected. Its cutover boundary is the **logical
  contract name** `order_acceptance_contract_v1` together with the exact 14-digit
  execution version embedded as approved SQL literals (§12.3 steps 5-6) — never
  the four-digit label. Nothing in the addendum changes.

### 12.2 PR #553

[PR #553](https://github.com/mohamedyousalama-ctrl/MaitreAI/pull/553) contains only:

- `supabase/migrations/0104_safety_ingress_evidence.sql`
- `supabase/migrations/0104_safety_ingress_evidence.APPLIED.md`

The SQL hash matches the approved applied artefact:

`560e060351c793990daa8f61bbdad95e998d508977e1610478881d7582c38b80`

Merging the files does not execute SQL because nothing scans the directory. Reapplication would nevertheless perform real DDL, including dropping/recreating a foreign key. The “already applied” warning is therefore binding.

### 12.3 Future migration ceremony

Before 0105:

1. reserve logical name `order_acceptance_contract_v1` and repository sequence `0105`
2. capture schema preflight
3. use an isolated, linked CLI workspace
4. fetch the remote timestamped history
5. generate one timestamped **execution file** named `<14-digit-version>_order_acceptance_contract_v1.sql`
6. embed that exact 14-digit version and execution name as literals in the cutover record SQL
7. finalize the SQL, compute its hash, and obtain founder approval of the exact bytes
8. copy those approved bytes to the execution file and prove the hash is unchanged
9. prove the dry run lists exactly one migration
10. apply once
11. verify the ledger row, embedded cutover mapping and schema
12. run real database proofs
13. preserve on `main` the byte-identical logical source `0105_order_acceptance_contract_v1.sql` plus an `.APPLIED.md` record mapping it to the timestamped execution version

No dashboard paste, migration repair or broad replay is allowed.

---

## 13. Working protocol

### 13.1 Roles

- **Founder:** business decisions, approvals and secure dashboard actions
- **PM/main window:** sequence, specifications, evidence review and final clearance
- **Claude Code:** repository operations and bounded implementation
- **Independent auditor:** challenges claims and approves/rejects gates

### 13.2 Builder rules

1. One work order per builder window.
2. One migration-bearing work order platform-wide.
3. Each work order has explicit file territory.
4. Corrections return to the originating window when available.
5. A builder never clears its own work.
6. Every branch starts from current `origin/main`.
7. Before handback: fetch, rebase, compare against `origin/main`, zero unexplained deletions.
8. No PR or merge without independent verification.
9. No behavioural repair hidden inside an audit or proof work order.
10. No production write without explicit founder approval.

### 13.3 Proof artefacts

A proof script must:

- exit non-zero on failure
- survive output capture
- validate live function and schema contracts before execution
- fail for the intended SQLSTATE/constraint
- prove non-zero in-transaction activity
- prove zero persistent rows after rollback
- never count insufficient privilege, unknown column or unreachable setup as a successful negative test

The existing E0 rollback-only script does not meet these conditions and must not run again.

---

## 14. Source index

### 14.1 Strategic and product sources

| Source | Authority | URL |
|---|---|---|
| Upgraded concept/new-BRAIN roadmap | Strategic direction; status claims are historical | [`docs/KIVO_UPGRADED_CONCEPT_ROADMAP.md`](https://github.com/mohamedyousalama-ctrl/MaitreAI/blob/935afaf42a6e7912f842aa2b6fed9140de806648/docs/KIVO_UPGRADED_CONCEPT_ROADMAP.md) |
| Master product roadmap | Product/company direction; not agent execution authority | [`MASTER_ROADMAP.md`](https://github.com/mohamedyousalama-ctrl/MaitreAI/blob/935afaf42a6e7912f842aa2b6fed9140de806648/MASTER_ROADMAP.md) |
| Product feature matrix | Historical capability inventory | [`docs/product/FEATURE_MATRIX.md`](https://github.com/mohamedyousalama-ctrl/MaitreAI/blob/935afaf42a6e7912f842aa2b6fed9140de806648/docs/product/FEATURE_MATRIX.md) |
| Old product roadmap | **HISTORICAL; must not be used as current truth** | [`ROADMAP.md`](https://github.com/mohamedyousalama-ctrl/MaitreAI/blob/935afaf42a6e7912f842aa2b6fed9140de806648/ROADMAP.md) |
| Saudi expansion | Future market reference | [`docs/KIVO_SAUDIZATION_ROADMAP.md`](https://github.com/mohamedyousalama-ctrl/MaitreAI/blob/935afaf42a6e7912f842aa2b6fed9140de806648/docs/KIVO_SAUDIZATION_ROADMAP.md) |
| Meta setup | WhatsApp setup reference; must be reconciled with P0-WA-01 | [`docs/META_SETUP_GUIDE.md`](https://github.com/mohamedyousalama-ctrl/MaitreAI/blob/935afaf42a6e7912f842aa2b6fed9140de806648/docs/META_SETUP_GUIDE.md) |
| Deployment guide | **STALE migration instructions; correction required** | [`DEPLOYMENT.md`](https://github.com/mohamedyousalama-ctrl/MaitreAI/blob/935afaf42a6e7912f842aa2b6fed9140de806648/DEPLOYMENT.md) |

### 14.2 Current code anchors

| Contract | URL |
|---|---|
| Acceptance contract | [`lib/orders/acceptance-contract.ts`](https://github.com/mohamedyousalama-ctrl/MaitreAI/blob/935afaf42a6e7912f842aa2b6fed9140de806648/lib/orders/acceptance-contract.ts) |
| POS acceptance route | [`app/api/orders/[id]/pos/route.ts`](https://github.com/mohamedyousalama-ctrl/MaitreAI/blob/935afaf42a6e7912f842aa2b6fed9140de806648/app/api/orders/%5Bid%5D/pos/route.ts) |
| Inbound coalescing | [`lib/messaging/inbound-coalescing.ts`](https://github.com/mohamedyousalama-ctrl/MaitreAI/blob/935afaf42a6e7912f842aa2b6fed9140de806648/lib/messaging/inbound-coalescing.ts) |
| Live message orchestration | [`lib/messaging/respond-and-send.ts`](https://github.com/mohamedyousalama-ctrl/MaitreAI/blob/935afaf42a6e7912f842aa2b6fed9140de806648/lib/messaging/respond-and-send.ts) |
| Customer turn | [`lib/ai/customer-turn.ts`](https://github.com/mohamedyousalama-ctrl/MaitreAI/blob/935afaf42a6e7912f842aa2b6fed9140de806648/lib/ai/customer-turn.ts) |
| Live WhatsApp webhook | [`app/api/whatsapp/webhook/route.ts`](https://github.com/mohamedyousalama-ctrl/MaitreAI/blob/935afaf42a6e7912f842aa2b6fed9140de806648/app/api/whatsapp/webhook/route.ts) |
| Public shadow BRAIN ingress route | [`app/api/brain/ingress/whatsapp/route.ts`](https://github.com/mohamedyousalama-ctrl/MaitreAI/blob/935afaf42a6e7912f842aa2b6fed9140de806648/app/api/brain/ingress/whatsapp/route.ts) |
| BRAIN ingress persistence | [`lib/brain/ingress/store.ts`](https://github.com/mohamedyousalama-ctrl/MaitreAI/blob/935afaf42a6e7912f842aa2b6fed9140de806648/lib/brain/ingress/store.ts) |
| Applied 0104 source | [PR #553](https://github.com/mohamedyousalama-ctrl/MaitreAI/pull/553) |

### 14.3 Audit and quality evidence

The following evidence must be preserved durably in the repository or fully represented here:

- `Kivo_Independent_Audit_2026-07-23.md`
- R-1 reconciliation and production baseline
- signed residual-risk decision and addendum
- migration manifest
- schema contract manifest v1/v2
- raw catalog capture
- 0104 application and read-back packet
- Farah’s original QA report
- `KIVO_Karim_QA_BRAIN_Playbook_v1`
- detector corpus and native-review decisions
- phone alert drill record
- tenant-isolation attack report
- final pilot proof

Until a source has a permanent repository URL, this file must carry its controlling conclusion and mark the source as awaiting archive.

---

## 15. Superseded and rejected claims

The following claims must not reappear:

1. “The shift screen is already safe.” R0 centralized old behaviour; R1 is still required.
2. “C-04 never reproduces.” The broad production-coalescing claim was wrong, but disabled/degraded coalescing loses the earlier disclosure.
3. “All historical pending orders are proven tests.” Tester identity and deletion history cannot be reconstructed.
4. “There are 126 current Wesaya pending orders.” Current production truth is 127 non-test pending plus one delivered test order.
5. “Alert persistence proves a human received it.” It does not.
6. “The migration pipeline is working.” There is no repository migration runner.
7. “0104 database behaviour is proven.” The migration is applied; the rollback-only proof is still invalid.
8. “The 401 failures are test-only.” The screenshot shows the rejected identifier on a Meta test-number screen, but equality with production `WHATSAPP_PHONE_NUMBER_ID` is unproven; impact must not be narrowed further.
9. “Delivery is fully disabled because the UI flag is off.” Code-level writer isolation still needs proof.
10. “Integer money is an enforced invariant.” It is aspirational; the current path uses floating point.

---

## 16. Current decision queue

Completed repository gates:

1. PR #554 is **MERGED** at `21268dcd7594f2a77e062dcdc72660bbdb4221c5`;
   the independently approved roadmap is repository authority.
2. PR #553 is **MERGED** at `0d8ae003d2390cab099cc72bcb2c50d1008b3696`
   as source-only history without reapplying migration 0104.

The active decisions, in order, are:

1. P0-ORD-01 containment is specified, approved and executed.
2. P0-WA-01 repair packet is approved and executed against a non-order message.
3. P0-SHADOW-01 is removed or governed.
4. A new independent builder writes the E0 PostgreSQL verification from the live schema contract.
5. E0/E1 safety increment proceeds only after the real proof passes.

K2 must close before any future migration is applied. K4 must close before the R1 cutover. Neither may be silently treated as complete.

No later roadmap item may jump ahead of an unresolved earlier safety or truth gate.

---

## 17. Response to independent audit

Draft v1 was rejected. The document owner corrected each finding after reviewing the auditor's evidence. Independent audit rulings remain separate evidence and are not authored by this document.

| # | Finding | Correction |
|---:|---|---|
| 1 | 126→127 was growth, not a count correction | Added P0-ORD-01 containment and the exact newest-row timestamp |
| 2 | Cutover undefined | Added durable cutover record, pre-application ID manifest and fact-based exclusion predicate |
| 3 | P0-WA-01/E0 circular dependency | P0 now proves the merged legacy path only; E0 owns durable ingress/terminal scan |
| 4 | Native-review count 19 vs 20 | Corrected to 20 from the fixture |
| 5 | `#1136` does not exist in production | Reclassified as KF-09, unresolved receipt/finalization truth |
| 6 | Screenshots used beyond their evidence | Meta and Farah screenshot conclusions relabelled OBSERVED/UNPROVEN |
| 7 | Test-only outage claim unproven | Removed; production environment mapping is an explicit repair proof |
| 8 | Public shadow ingress route missing | Added P0-SHADOW-01, source anchor and pilot gate |
| 9 | F-2 severity understated | Moved to critical C-02a and made absent-operator coverage an E1 proof |
| 10 | `0105` vs timestamped filename conflict | Separated logical repository source from timestamped execution file |
| 11 | Seven vs eight null relationships | Recorded seven both-null and eight conversation-null rows |
| 12 | Missing pilot blockers | Added order freeze, shadow route, concurrency ceiling, production SHA and environment vector |
| 13 | Undated empty-table checkpoint | Dated 25 July 2026 |

### 17.1 Response to v2 audit

| # | Finding | Owner correction |
|---:|---|---|
| 1 | Order-freeze control and file territory were undefined | Made `WO-ENG-P0-ORDER-FREEZE` a mandatory sequential engine work order with exact files and E0 pause/rebase rules |
| 2 | Channel test could exercise open safety defects | Fixed exact non-order/non-safety text and stated the expected normal legacy reply |
| 3 | Legacy duplicate-delivery gate was lost | Restored one-message/at-most-one-reply legacy idempotency proof |
| 4 | A single 200 did not prove the 401 stream stopped | Added zero-new-`invalid_signature` gate for a 30-minute fresh-inbound observation |
| 5 | Migration cannot discover its ledger version | Required preallocated version/name literals before final hash approval |
| 6 | Flag baseline was undated | Dated and re-stated the 25 July 2026 live flag read-back |
| 7 | Correction record conflated auditor and owner | Retitled this section and separated owner corrections from auditor rulings |

### 17.2 Response to v3 approval conditions

| ID | Approval condition | Owner correction |
|---|---|---|
| NC-1 | Freeze had no lift point and blocked the live proof | Added founder-controlled post-R1/post-safety lift, baseline/read-back requirements, post-lift fixture and immediate refreeze on failure |
| NC-2 | Phase table dropped the tracked P0 identifier | Restored `P0-ORD-01` beside its named work order |

### 17.3 Final precision amendments

| Item | Owner correction |
|---|---|
| Freeze precondition could read as self-referential | Limited it to other substantive proofs, excluding lift mechanics |
| Post-lift fixture location was unnamed | Named `scripts/fixtures/wesaya-production-flags.ts` and preserved the freeze-on capture through Git history/application record |
| 34-key baseline would become stale and checklist ordering was cosmetic | Marked 34 as the pre-freeze baseline, required update on change, and moved the unchanged-baseline check before lift |

## 18. Document history

| Date | Change |
|---|---|
| 25 Jul 2026 | First consolidated draft built from repository roadmaps, independent audit, R-1 evidence, E0/0104 work, Farah QA playbook, GitHub and production read-back |
| 25 Jul 2026 | Draft v2: corrected all 13 independent-audit findings; resubmission required |
| 25 Jul 2026 | Draft v3: targeted amendment closing seven v2 audit findings; delta-only re-audit required |
| 25 Jul 2026 | Draft v4: folded both mandatory v3 approval conditions before documentation PR |
| 25 Jul 2026 | Final PR version: folded three auditor-recorded precision items without changing approved scope or sequence |
| 25 Jul 2026 | Repository correction candidate: replaced Markdown hard-break whitespace, corrected the lifecycle status, and retained identical roadmap scope and sequence |
| 25 Jul 2026 | Activation candidate: made PR #554's self-activation states durable, aligned the executive sequence with the decision queue, and stated the K2/K4 deadlines |
| 25 Jul 2026 | Final candidate: defined every operational status qualifier and added P0-SHADOW-01 to the executive sequence |
| 25 Jul 2026 | Post-merge reconciliation: recorded PR #554 and PR #553 as completed repository gates, froze the 0104 source hash, and advanced the active queue to P0-ORD-01 |
| 25 Jul 2026 | K2 closure: documented the governed migration policy in `DEPLOYMENT.md` §B including the permitted §12.3 isolated-workspace application path, reconciled repository logical labels against the production ledger, and reserved logical label 0106 for the P0-ORD-01 containment migration with 0105 unchanged for `order_acceptance_contract_v1` |
