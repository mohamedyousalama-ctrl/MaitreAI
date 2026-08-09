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
**Last updated:** 26 July 2026 — founder V1/V2 scope decision recorded in §3.2; the 25 July truth snapshot above is retained as history<br>
**Last updated:** 27 July 2026 — `KV-D06-001` Revision 14 founder approval and its signed six-clause addendum recorded in §3.3; the 26 July entry above is retained as history<br>
**Last updated:** 27 July 2026, second entry — `WO-PREFLIGHT-KVD06-REV14-001` results, the founder Option A decision and sub-findings PF-L1 and PF-R1 recorded in §3.3.6-§3.3.11; the entries above are retained as history<br>
**Last updated:** 9 August 2026 — scope notes added clarifying the 27 Jul 2026 execution and access-denial wording in §3.3 and §18; all prior text retained byte-unchanged<br>
**Last updated:** 9 August 2026, second entry — `docs/KIVO_STATE_01.md` added as the evidence-backed current-state snapshot, accepted upon the independently audited merge of the change carrying this entry; no scope, blocker, authorization or execution-order change<br>
**Last updated:** 9 August 2026, third entry — narrowed Egypt V1 founder scope decision adopted through `docs/KIVO_FOUNDER_DECISION_DELTA_2026-08-09.md`; scope/governance adoption only, no blocker, authorization, reservation or execution-order change; the entries above are retained as history<br>
**Repository evidence baseline:** [`0d8ae003d2390cab099cc72bcb2c50d1008b3696`](https://github.com/mohamedyousalama-ctrl/MaitreAI/commit/0d8ae003d2390cab099cc72bcb2c50d1008b3696)

This is the independently reviewed `main` baseline after PR #553, not a claim
that `main` can never move.

**Current-state snapshot record — activates on audited merge.** [`docs/KIVO_STATE_01.md`](./KIVO_STATE_01.md), SHA-256 `848e8f61f5756eae347f58784395d4cf9f8e703e20970bd90f1b1cb2e0b3fbee`, 32,544 bytes and 262 lines, records an evidence-classed repository/source snapshot at `main` `6e71a242cf9ae6b631c857c190146a0966c946da`. It becomes the accepted snapshot automatically upon independent KIVO-AUDITOR clearance and merge of the change carrying this record; until then it is a candidate. Acceptance is as a candidate only: it is not approval and changes no scope, blocker, migration reservation, execution order or production state. The next separately scoped technical work remains the seven-state application ownership implementation-and-proof work required by `KV-D06-002`; migration-specification drafting remains blocked. Package v1.3 correction, Python parity, production verification and Linear Prompt B remain blocked pending independent audit and merge of the snapshot candidate and their own explicit work orders. Pilot remains **NO-GO**.

**Founder decision delta register — 9 August 2026 — ACTIVATES ON AUDITED MERGE.** [`docs/KIVO_FOUNDER_DECISION_DELTA_2026-08-09.md`](./KIVO_FOUNDER_DECISION_DELTA_2026-08-09.md) records the binding founder decision **"APPROVE NARROWED EGYPT V1"** and resolves every conversation-only item in KIVO_STATE-01 §20. Kivo V1 is Karim's controlled WhatsApp order vertical slice for busy SMB and medium restaurants with one branch or a maximum of two to three branches: Egyptian-Arabic customer conversations → grounded structured order with deterministic menu and price truth → explicit current-version customer confirmation → restaurant acceptance or rejection → exactly one versioned correct-branch printed kitchen ticket. The initial controlled pilot is five New Cairo restaurants using their own drivers and cash/COD only. Merchant onboarding, minimal manual/agent control, safety, tenant isolation, idempotency, printer reliability, audit, monitoring and rollback are V1 enablers, not a full restaurant operating system. Kivo logistics, driver application, tracking, full KDS, online payments, website/voice ordering, campaigns/loyalty, deep POS/ERP integration, Saudi activation and large-chain support are deferred. Reliable printing is a **required V1 outcome whose technical mechanism remains ADR-gated** — a printer architecture ADR covering QZ Print versus other safe mechanisms, branch routing, health, retry, duplicate suppression and controlled reprint is required before any mechanism is selected. The register supersedes three prior V1 classifications, each retained byte-unchanged as history: customer memory is deferred unless a later separately governed decision adds minimum necessary bounded memory; the separate broad Egyptian food encyclopedia product is deferred while Egyptian-Arabic interaction and menu-grounded restaurant-specific knowledge remain required; and kitchen scope is settled as printed-ticket-in, full-KDS-deferred. The 12 October 2026 pilot start is a **gate-dependent planning forecast, not a guarantee**: delay moves the date rather than deleting tests, audit or UAT. This adoption is scope and governance only. It authorizes no code, SQL, migration specification, migration label, database or production access, deployment, Meta or Vercel action, printer installation or pilot launch. `KV-D06-001` / `P0-CTRL-01`, `KV-D06-002`, `P0-ORD-01`, `P0-WA-01`, the safety gates and every other open blocker, migration reservation and execution-order rule are unchanged; `0105` and `0106` remain reserved as governed with `0106` BLOCKED; `0077` remains unapplied and unauthorized; migration drafting remains blocked behind `KV-D06-002`; the next separately scoped technical work remains the seven-state application ownership implementation-and-proof work. Pilot remains **NO-GO**.

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

**Law — same-change roadmap update.** Any approved change affecting V1/V2 scope, readiness,
dependencies, blocker state, execution order or backlog **must update this authoritative roadmap
in the same Git change**, recording the founder-local date and a clear last-update and history
entry. A scope or state change landed without its roadmap update in the same change is not
governed.

**Law — an absent flag proves nothing.** An absent feature-flag key **never** proves intentional
disablement. It proves only that the key is not present, and `isFeatureExplicitlyEnabled`
therefore evaluates false. Founder intent must be recorded explicitly in this file; absence must
never again be cited as evidence of intent without a recorded disposition.

---

## 1. Founder summary

### 1.1 What Kivo Agent is

Karim is the customer-facing worker inside Kivo. He receives restaurant conversations, understands the request, uses real menu and operational data, builds the order, protects safety and money truth, hands control to staff when required, and records structured facts for the wider Kivo system.

Karim is **not** the whole product. He is the frontline agent connected to a shared BRAIN and to governed restaurant modules.

### 1.2 Current verdict

**Pilot status: NO-GO.**

The product is pre-commercial and must not accept the first public order until the go-live gates in this document pass.

The most urgent current facts are:

1. **The conversation control plane is partially present and operator claim is broken.**
   Migration 0099 has a production ledger row and its schema/triggers are present,
   but six functions are absent. Both console claim routes depend on the absent
   `control_claim`. `KV-D06-001` is CRITICAL, OPEN and BLOCKING.
2. **WhatsApp ingress is blocked.** Production callbacks are being rejected with HTTP `401` before Karim runs. The rejected identifier is visible in the founder's Meta test-number screen, but its equality to production `WHATSAPP_PHONE_NUMBER_ID` remains unproven.
3. **Safety ingress migration 0104 is applied**, but the E0 application integration and real PostgreSQL proof are not cleared.
4. **Confirmed-order acceptance is not repaired.** R0 only centralized the existing contract; R1 must add the durable confirmation and acceptance facts.
5. **The pending-order population grew during remediation.** Production currently has 127 non-test Wesaya orders in `pending_confirmation`; the latest was created on 23 July while C-01 was open. New non-test order creation must be stopped before WhatsApp is restored.
6. **Payment truth, one-active-writer and alert delivery remain unproven.**

### 1.3 What happens next

Two repository gates are complete:

- PR #554 is **MERGED** at
  `21268dcd7594f2a77e062dcdc72660bbdb4221c5`, activating this authoritative
  roadmap.
- PR #553 is **MERGED** at
  `0d8ae003d2390cab099cc72bcb2c50d1008b3696` as source-only history without
  reapplying migration 0104.

The active controlled order is:

1. Record and securely redesign `KV-D06-001`; do not replay migration 0099.
2. Define and approve the reversible maintenance/drain control required for database rollout.
3. Enforce P0-ORD-01, the temporary freeze on new non-test Wesaya order creation.
4. Repair P0-WA-01 WhatsApp signature verification and prove the existing webhook accepts and persists one non-order test message.
5. Remove or govern P0-SHADOW-01, the public shadow BRAIN ingress route.
6. Rebuild and run the E0 database verification correctly.
7. Finish E0 and E1 as one pilot safety increment, then prove durable ingress and terminal scanning live.
8. Complete order acceptance truth and the remaining pilot blockers.
9. Run the complete live proof before any public order.

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
| Conversation control plane (0099) | **BLOCKED**; `KV-D06-001` **CRITICAL, OPEN** | Ledger row `20260721235747 / conversation_control_plane` exists; the schema, control epoch, assignment table and triggers are present, but `_control_set_ctx` and five `control_*` application functions are absent |
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

### P0-CTRL-01 / KV-D06-001 — Secure the conversation control plane

**State: CRITICAL, OPEN and BLOCKING.**

Migration `0099_conversation_control_plane.sql` is recorded as applied, but
production lacks `_control_set_ctx`, `control_apply_transition`,
`control_escalate_to_hold`, `control_claim`, `control_reassign` and
`control_release_to_ai`.

Both live console claim routes call the absent `control_claim`, including the
console-v2 route used by Wesaya. Operator claim therefore fails.

The missing repository functions must not be replayed or restored as written.
Their source lacks narrow execution grants and complete tenant/actor validation.
The existing assignment history also permits privileged mutation, and its audit
function can silently lose records.

The secure forward correction must also:

- make return-to-Kivo one atomic transition;
- remove the direct legacy release update;
- inventory and reconcile every ownership writer;
- move the shared control contract out of the console-only module boundary;
- make assignment history mechanically immutable;
- prove tenant isolation, actor authorization, concurrency and audit behaviour against real PostgreSQL.

Audit failure policy:

- a transition toward human or safe control may commit only if its normal audit
  event or a separate durable audit-failure record commits in the same transaction;
- return to AI, close, idle and reassignment fail completely if their audit event fails;
- silent audit loss is forbidden.

No replay of `0099`, raw ownership shortcut, application, migration or production
write is authorized. `0106` remains reserved but blocked. No replacement
migration label is assigned yet. Pilot status remains **NO-GO**.

**Revision 14 design approval — 27 Jul 2026.** The secure forward design is now recorded as
**approved with a signed six-clause addendum** in §3.3. That approval is design and governance
approval only. It does **not** close this entry, does **not** authorize SQL, a migration, a
migration label, database access, application implementation or deployment, and does **not**
change any statement above. `KV-D06-001` / `P0-CTRL-01` remain **CRITICAL, OPEN and BLOCKING**
until implementation and independent evidence exist.

### P0-ORD-01 — Stop the pending-order population from growing

**State:** **OPEN and BLOCKING.** VERIFIED live condition; the mandatory containment is not implemented.<br>
**Named work order:** `WO-ENG-P0-ORDER-FREEZE`

The first reconciliation observed 126 Wesaya pending orders. Production now contains 127 non-test pending orders; the newest was created during remediation on 23 July. No public operation is approved, but the existing test flow can still create rows that look non-test and actionable under legacy rules.

No existing feature or server control can guarantee this freeze, and no application-layer
feature flag can: an application guard is bypassable by every other writer that reaches
the table. The founder's binding direction is **Option B** — an explicitly enabled,
reversible **protected database state** plus a **database-level trigger on `orders`** that
refuses the finalization write.

The exact database design — table, columns, predicates, trigger definition and SQL — is
**not defined here**. It remains subject to independent approval before any migration is
prepared, and nothing in this entry authorizes a migration, an application, a database
write or a production action.

**Exclusive file territory:**

The implementation territory is **not yet fixed**; it follows from the approved Option B
design. It is expected to comprise one approved migration under the reserved-but-blocked
label recorded in §12.1a, plus a focused executable proof of the containment against real
PostgreSQL. Neither exists, and neither may be created before the design is approved.

`lib/tenant/tier.ts`, `lib/messaging/respond-and-send.ts` and
`scripts/fixtures/wesaya-production-flags.ts` are **no longer required implementation
files** for this work order. The superseded `order_finalization_freeze` feature-flag
mechanism is withdrawn and must not be built.

Option B is migration-bearing: one approved migration is in scope once the design is
approved. No payment, acceptance or unrelated application file is in scope.

**Sequencing against E0:**

1. Pause `wo-e0-safety-ingress`; it must not change or rebase concurrently.
2. Complete and independently approve the exact Option B database design. No SQL may be prepared before that design is cleared.
3. Build one migration-bearing work order from current `origin/main`: the logical `0106` source, its focused real-PostgreSQL proofs, and no application file unless separately approved.
4. Run the governed isolated-CLI preflight described in `DEPLOYMENT.md` §B: allocate one 14-digit execution version, approve the exact SQL bytes and hash, copy them unchanged into the execution file, and prove the dry run lists exactly one pending migration.
5. After explicit founder approval, apply the exact approved bytes once. Read back the ledger row, schema, trigger, permissions and protected-state default, then run the approved real-database proofs. Merging or deploying repository files is not migration application.
6. After successful production read-back, preserve on `main` the byte-identical logical `0106` source and its `.APPLIED.md` mapping to the 14-digit execution version.
7. With separate explicit founder approval, enable the protected containment state for Wesaya and read it back from the database.
8. Independently prove that a confirmation attempt creates no order row, sends no “order placed” message and creates the required durable critical alert.
9. Rebase E0 onto the resulting `main`, verify the enabled containment remains intact, then resume E0.

This is a sequential work order that must finish before E0 resumes. The database migration must exist and pass production read-back before the protected state can be enabled.

**Acceptance before WhatsApp signature repair:**

1. The protected containment state is explicitly enabled for Wesaya in production and read back from the database.
2. A confirmation attempt creates no order row.
3. No “order placed” customer message is sent.
4. A durable critical alert identifies the blocked finalization.
5. Non-order channel testing remains available.
6. The frozen baseline remains 127 non-test pending rows.
7. The flow alerts and stops if that baseline increases.

Operational instruction alone is insufficient.

**Founder-controlled lift point:**

The protected containment state remains explicitly enabled through channel repair and remediation. It may be lifted only when:

1. E0–E3 and R1/R1b/R1c are deployed at their approved revisions.
2. The durable R1 cutover record exists and matches its ledger row.
3. Every order lacking current-attempt confirmation and provider provenance is proven absent from actionable surfaces.
4. The pre-lift Wesaya non-test baseline is recorded and has not increased.
5. All other substantive safety, order, payment, writer, alert and isolation proofs required before the complete live proof have passed; the freeze-lift mechanics themselves are excluded from this precondition.
6. The founder gives explicit approval for one controlled live-proof order.

The founder then authorizes disabling the protected containment state. The PM disables it, reads the disabled state back from the database, and records that **post-lift** read-back. The earlier containment-enabled read-back is a remediation record preserved by Git history and the work-order application record. The complete live-order proof runs after the lift. Any failure immediately restores the containment and returns to report-before-repair governance.

Option B adds **no** Wesaya feature key. The dated 34-key statement in §2.4 remains valid and is unaffected by this containment.

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

### 3.1 Parallel lane — legal identity, public legal pages and Meta

This lane runs **beside** the technical containment sequence. It does **not** reorder, gate or
weaken `KV-D06-001` / `P0-CTRL-01`, `P0-MAINT-01`, `P0-ORD-01`, `P0-WA-01`, `P0-SHADOW-01`, E0
or E1. Nothing in this subsection approves legal text, code, deployment or a Meta submission.

**Verified facts recorded by this entry:**

1. The founder has ruled that **City Baker must be removed as Kivo's current public legal
   identity**.
2. Kivo's current public legal owner/operator will be **the Saudi establishment**.
3. The exact Saudi legal name, English rendering, registration number, VAT number, address,
   telephone and official email remain **UNVERIFIED** until the founder supplies the official
   documents. No such value may be written into any surface before that.
4. At the **pre-PR `main` baseline**, **eleven** repository paths outside this roadmap entry
   contained City Baker: `README.md`, `app/contact/page.tsx`, `app/data-deletion/page.tsx`,
   `app/privacy/page.tsx`, `app/terms/page.tsx`, `components/SiteFooter.tsx`,
   `components/landing/Landing.tsx`, `components/landing/copy.ts`,
   `docs/KIVO_UPGRADED_CONCEPT_ROADMAP.md`, `docs/product/LANDING_BRIEF.md`, `middleware.ts`.
   **This roadmap entry itself becomes the twelfth repository path**, because it records the
   historical and legal correction. The count therefore reads: eleven pre-existing paths plus
   this governance record.
5. At the **pre-PR `main` baseline** there were **zero** Saudi-establishment references.
   **This roadmap entry creates the first one.**
5a. Both roadmap references above are **governance and history, not a public website surface**.
   They do not satisfy, weaken or partially discharge the public-removal gate. That gate still
   requires **City Baker to be absent from every current public surface**, and it is unaffected
   by City Baker continuing to appear in this governance record and in historical documents.
6. The current Privacy, Terms and Data Deletion pages are **drafts** and contain unresolved
   decisions or claims requiring verification.
7. `legal-pages-delivery.zip` is **input material only** — not approved legal text and not
   repository authority.
8. **Historical evidence must not be rewritten.** City Baker is removed from current public and
   controlling surfaces; historical records remain and remain clearly marked historical.
9. Pilot status remains **NO-GO**.

**Governed backlog:**

| ID | Item | State |
|---|---|---|
| P0-LEGAL-01 | Saudi legal identity and document manifest | **BLOCKED** pending founder document upload and independent verification |
| P0-LEGAL-02 | Verified data-practice and Saudi PDPL manifest | **PLANNED**; requires a complete inventory of collected data, purposes, legal bases, providers, storage locations, sharing, retention, deletion, cross-border transfers, rights, complaint process and DPO assessment |
| P0-LEGAL-03 | Saudi legal review | **BLOCKED** pending P0-LEGAL-01 and P0-LEGAL-02. No legal page may be presented as final before counsel approval |
| P0-WEB-LEGAL-01 | Arabic and English About, Privacy, Terms, Data Deletion and Contact pages, plus the public footer | **BLOCKED** pending the approved legal identity and legal text. No placeholder or draft warning may remain at release |
| P0-DELETE-01 | Operational data-deletion procedure | **PLANNED**. Must cover identity verification, request tracking, controller-versus-processor routing, databases, logs, backups, Meta credentials, providers, legal holds, completion evidence and a synthetic end-to-end test |
| P0-META-01 | Meta Business Verification and domain verification | **BLOCKED** pending verified Saudi documents, consistent website identity and public legal pages |
| P0-META-02 | Minimum WhatsApp permission and App Review scope | **PLANNED** pending independent verification against current official Meta requirements. Expected minimum is `whatsapp_business_management` and `whatsapp_business_messaging`. No additional permission may be requested without a proven code use case |
| P0-META-03 | Reviewer-ready Meta evidence package | **BLOCKED** pending working Embedded Signup and P0-META-02. Must include a safe test business, written reviewer instructions, permission-specific videos, consent, send/receive proof, webhook proof, revocation/deletion proof, and no real customer data or exposed secret |
| P0-META-04 | Production URL and submission verification | **BLOCKED**. All required URLs must be public HTTPS pages, accessible without login, return successfully, work on mobile, be linked from the footer and contain no placeholders |
| P0-META-05 | Correct `docs/META_SETUP_GUIDE.md` | **PLANNED and BLOCKING before App Review submission.** The current guide is **incomplete** on permission scope — the evidence is quoted in full immediately below this table. **P0-META-02 supersedes it** and requires the independently verified minimum pair `whatsapp_business_management` **and** `whatsapp_business_messaging`. Until P0-META-05 closes, the guide is **incomplete and non-authoritative** on permission scope |

**P0-META-05 evidence — quoted in full, no line numbers, no ellipsis.**

The permission bullet in `docs/META_SETUP_GUIDE.md` reads, complete and verbatim:

```
- `whatsapp_business_management` — lets us manage WABAs (WhatsApp Business Accounts) on behalf of restaurant owners.
```

The guide names that same permission twice more — in its *Request Advanced Access* step and in
its App Review approval checklist — and defines no other permission bullet.

Search-verifiable statement: `docs/META_SETUP_GUIDE.md` contains **zero occurrences** of
`whatsapp_business_messaging`. Reproduce with
`rg -c 'whatsapp_business_messaging' docs/META_SETUP_GUIDE.md`, which returns no count because
there are no matches. That absence, not any line position, is the defect P0-META-05 closes.

**Scope distinction:**

1. `P0-LEGAL-01` through `P0-WEB-LEGAL-01` are **V1 public-launch gates**.
2. Meta **Advanced Access for external restaurant WhatsApp accounts** is a **commercial
   restaurant-onboarding gate**.
3. The **Wesaya-only exemption is conditional, not automatic.** It applies to a controlled
   Wesaya-only proof on Kivo's own business data **only when all three of the following are
   independently verified**:
   1. the Meta app remains in **Development mode**;
   2. the test user holds an **approved role** on the Meta app;
   3. Wesaya routes through the **global `env_fallback` number** matched to the configured
      `WHATSAPP_PHONE_NUMBER_ID` — the `env_fallback` branch in
      [`lib/messaging/webhook-routing.ts`](../lib/messaging/webhook-routing.ts).

   The exemption **ends immediately** if either of the following occurs:
   - the app changes to **Live mode**; or
   - Wesaya moves to **per-tenant Embedded Signup credentials**.

   If **any** condition is unverified, Meta Advanced Access **remains blocking**. None of the
   three conditions has been verified by this entry.
4. Meta approval **never** overrides Kivo's safety, order, payment or pilot gates.

### 3.2 Founder V1/V2 scope decision — 26 Jul 2026

**Binding founder decision, 26 Jul 2026: “APPROVE ALL — V1 is WhatsApp and cash/COD only.”**

This closes all five open founder decisions recorded in the audited evidence baseline
(SCOPE013 §9). It is a **scope and classification decision only**. It authorizes no
implementation, no configuration, no flag change, no migration, no deployment and no production
action, and it does not weaken any existing order, acceptance, payment-truth or safety gate.

**Evidence baseline.** This decision is recorded against `SCOPE013.md`, an evidence artefact held
**outside Git** and independently approved by KIVO-AUDITOR:
SHA-256 `7a3fd3c4dc950ef4db4e54aae2b453ec23b7b307203f38508a582d026e4c9de2`, 55569 bytes, 555 lines.
SCOPE013 is **evidence, not repository authority** — this file remains the authority. Its
production counts are the **audited baseline at its recorded pin**, not newly re-queried current
values.

**V1 scope.** V1 includes the previously approved capabilities: the new restaurant console UI;
human control of customer conversations; limited console commands to Kivo; temporary restaurant
instructions; permanent restaurant instructions; staff-to-Kivo WhatsApp instructions; customer
memory; and the Egyptian encyclopedia. Because the console UI is V1, these console capabilities
remain V1 requirements: notification display; acknowledgment identity; acknowledgment escalation;
kitchen board; kitchen-ticket generation; shift control screen; shift preflight; and the
More/health screen.

**Scope note — added 9 Aug 2026.** The narrowed Egypt V1 founder decision recorded in
[`docs/KIVO_FOUNDER_DECISION_DELTA_2026-08-09.md`](./KIVO_FOUNDER_DECISION_DELTA_2026-08-09.md)
supersedes part of the V1 capability list above and the derived classifications in §3.2.1 and the
§9 audited readiness inventory, all retained byte-unchanged as history: **customer memory** is now
deferred for V1 unless a later separately governed decision adds the minimum necessary bounded
memory (delta row 12); the separate broad **Egyptian food encyclopedia** product is now deferred,
while Egyptian-Arabic interaction and menu-grounded restaurant-specific knowledge remain required
(delta row 13); **kitchen scope** is settled as exactly one versioned correct-branch printed
kitchen ticket in V1 with the full kitchen board/KDS deferred (delta row 8); and **reliable
printing** is a required V1 outcome whose technical mechanism remains ADR-gated (delta row 9),
superseding the `qz_print` "settled outside V1" classification as to the printing outcome only —
no mechanism is selected and no printer action is authorized. WhatsApp-only and cash/COD-only are
reconfirmed unchanged. This note changes no blocker, gate, reservation, execution order or
historical text.

**V1 customer channel: WhatsApp only.**

**V1 payment scope: cash/COD only.** No online or card payment. No PSP integration. No optional
canonical-payment-method subsystem. This does **not** authorize an unsafe payment default and does
**not** weaken R4A, R4, the payment-truth gates or any acceptance gate.

**V2 scope.** The website channel; voice notes; and full natural-language restaurant-to-Kivo
conversation.

**Settled exclusions from V1**, future prioritization not yet scheduled: `conversation_outcomes`,
`callback_requests`, `qz_print`, `manager_command_recognition`, `psp_payments` and
`canonical_payment_methods`. These are **no longer** UNCLASSIFIED and no longer carry
FOUNDER DECISION REQUIRED.

#### 3.2.1 Disposition of all thirteen absent Wesaya flag keys

Exhaustive. Thirteen keys, each exactly once. Recording a disposition here **does not mutate any
live flag**; every key below remains absent in production and therefore effectively OFF.

| # | Absent key | Disposition | Governed intended state |
|---:|---|---|---|
| 1 | `customer_memory` | **Required for V1**, deliberately kept OFF | The capability is required for V1. The live key is absent. Absence is **not** treated as activation or completion. Intended state is **OFF** until its V1 prerequisites, protections and live proof pass |
| 2 | `staff_command_channel` | **Required for V1**, deliberately kept OFF | As above; additionally gated behind `P0-WA-01` |
| 3 | `standing_instructions` | **Required for V1**, deliberately kept OFF | As above |
| 4 | `kitchen_ticket` | **Required for V1**, deliberately kept OFF | As above |
| 5 | `khalid_persona` | **Intentionally excluded from Egypt V1** | Remains **OFF** |
| 6 | `ksa_encyclopedia` | **Intentionally excluded from Egypt V1** | Remains **OFF**; see §3.2.2 |
| 7 | `conversation_outcomes` | **Settled outside V1** | Remains **OFF** for V1 |
| 8 | `callback_requests` | **Settled outside V1** | Remains **OFF** for V1 |
| 9 | `qz_print` | **Settled outside V1** | Remains **OFF** for V1 |
| 10 | `voice_notes` | **Settled outside V1 — V2** | Remains **OFF** for V1; see §3.2.3 |
| 11 | `manager_command_recognition` | **Settled outside V1** | Remains **OFF** for V1 |
| 12 | `psp_payments` | **Settled outside V1** | Remains **OFF** for V1; excluded by the cash/COD-only ruling |
| 13 | `canonical_payment_methods` | **Settled outside V1** | Remains **OFF** for V1; excluded by the cash/COD-only ruling |

#### 3.2.2 KSA corpus ruling

The KSA encyclopedia is **outside Egypt V1** and **remains disabled**. Its current provenance and
commercial redistribution licence are **unverified**. It **must not be shipped, redistributed or
commercially activated** until every source, attribution and licence is documented and
independently approved. If provenance cannot be proven, the corpus must be **replaced with
lawfully sourced content**. This ruling does **not** block Egypt V1. No licence or provenance
claim is asserted here.

#### 3.2.3 Voice ruling and `P0-VOICE-01`

Migration `0077` **remains unapplied**, and **must not be applied for V1**. `voice_notes` remains
**OFF** and is **V2**. The live source/schema contradiction — deployed source reading and writing
three columns absent from production — **must be removed** by reverting or safely removing the
current source references to those three absent columns. Voice may return **only** through a
separately approved V2 design and the governed migration ceremony.

| ID | Item | State |
|---|---|---|
| P0-VOICE-01 | Remove the live voice source/schema contradiction by reverting or safely removing the source references to the three absent `conversations` columns | **OPEN; V1 hygiene repair. BLOCKING before pilot go-live.** This is a repair of the live source/schema contradiction only. It is **not** activation of voice and **not** authorization to apply `0077`. It does not enter the E0/E1 safety increment and does not displace `KV-D06-001` / `P0-CTRL-01`, `P0-MAINT-01`, `P0-ORD-01`, `P0-WA-01` or `P0-SHADOW-01`; it is worked after them. |

### 3.3 `KV-D06-001` Revision 14 — founder approval and signed addendum — 27 Jul 2026

**Binding founder decision, 27 Jul 2026: “APPROVE D-1, D-2 AND D-3 — adopt the six-clause
Revision 14 addendum and the recommended PM engineering rulings.”**

This is a **design and governance approval only**. It authorizes no SQL, no migration preparation,
no migration number, no database access, no application implementation, no deployment, no
configuration change, no message, no order, no flag change, no Supabase write, no Meta action, no
Vercel action and no production action. Nothing in §3.3 was executed: **no probe, query, sweep or
preflight was run by the change that records it.**

**Scope note — added 9 Aug 2026.** The paragraph above describes the 27 Jul 2026 change that recorded D-1, D-2 and D-3, at which time §3.3 comprised §3.3.1–§3.3.5 only. "Nothing in §3.3 was executed" is a statement about that recording change, not about later events, and "no database access" does not negate D-2 — which itself authorized a SELECT-only production preflight. KIVO-AUDITOR subsequently executed that preflight on 27 Jul 2026 under `WO-PREFLIGHT-KVD06-REV14-001`; §3.3.6–§3.3.11 record its results. No Builder production access ever occurred, and no mutating access of any kind was authorized or performed by anyone. This note changes no decision, gate, blocker, count or historical text.

**Governed artefact.**

| Field | Value |
|---|---|
| Artefact | `WO-SPEC-KVD06-SECURE-CONTROL-V1 — REVISION 14` |
| SHA-256 | `f5eda59d06bdb4e72af183ab70deaec5dbb0041a02b6c5ba59bad21e456f6c37` |
| Bytes | 156,719 |
| Lines | 2,140 |

Revision 14 is **founder-approved with the signed six-clause addendum recorded in §3.3.2**. The
artefact is **evidence held outside Git, not repository authority** — this file remains the
authority, and the authoritative revision is always the version present on `main`.

**Activation.** This record is **founder-approved on 27 Jul 2026** and **ACTIVATES ON MERGE**: it
becomes an authoritative roadmap record only when the PR carrying it reaches `main`.

**Blocker state is unchanged.** `KV-D06-001` and `P0-CTRL-01` remain **CRITICAL, OPEN and
BLOCKING**. Only the obsolete “design not approved” wording is superseded, and it is replaced by
the accurate position: the Revision 14 design is approved with its signed addendum; implementation
and evidence remain **open**; **no SQL or migration is authorized**; and **`0106` remains reserved
and BLOCKED**.

#### 3.3.1 Founder decisions — recorded verbatim

**D-1 — protected structures and alert-lane separation.**

> “I approve `control_alert_intents` (B-1) and `member_identity_versions` under Option A (B-11) as
> new protected structures. I further approve separating the alert-intent lane — A3, F19, B-7 and
> B-8 — from the `KV-D06-001` closure path into its own increment; closing `KV-D06-001` does not
> require it, and the alert lane remains blocking for pilot go-live.”

Recorded consequences:

- B-1's **protected-structure design decision is approved**. Implementation and proof remain open.
- **No stage creating A3 may be scheduled until B-7 and B-8 close.**
- **B-7 and B-8 remain OPEN and block pilot go-live.**
- B-11's **Option A governance decision is approved**. Implementation and proof remain open.
- Implementation and proof of **both** structures remain open; approval of a design is not
  approval of a migration, and no migration label is assigned to either.
- A member's role may change; **historical evidence must never be rewritten**.

**D-2 — read-only production preflight.**

> “I authorize a SELECT-only production preflight comprising VP-1 (service-role `auth.uid()`
> behaviour), PF20 (silently-failing A1 inserts), the L-A/L-B legacy-row classification, and the
> `service_role` A1-reader dependency sweep. These create and change no state, send no message,
> create no order, and change no flag, configuration or deployment. Results are reported to
> KIVO-AUDITOR before any migration specification is drafted.”

This entry **records the authorization and executes nothing**. No VP-1, PF20, classification or
dependency-sweep probe was run by the change that records this decision. The preflight is carried
out only under the separate work order described in §3.3.5.

**D-3 — conditional ownership transfer and forced RLS.**

> “I approve in principle transferring ownership of `conversation_assignment_events` and forcing
> RLS at stage M-5, conditional on the dependency sweep in D-2 finding no `service_role` reader.”

Recorded consequences:

- **B-2 remains OPEN**, pending the dependency sweep and the required application and read-back
  evidence.
- **If any `service_role` reader is found, the approval lapses** until the design explicitly grants
  that access.
- **Nothing in this record performs or prepares that ownership transfer**, and no SQL, migration or
  database action is authorized by it.

#### 3.3.2 Signed Revision 14 addendum — exactly six clauses

| ID | Clause |
|---|---|
| **AD-1 — Roadmap alignment** | Revision 14 is read against roadmap `c94ab596…` at `main` `a0160626…`, containing the §0.3 laws, the §3.2 founder decision, `P0-VOICE-01`, its §10 Operations gate and the §12.1 `0077` record. PR #560 closed **no** technical blocker |
| **AD-2 — `P0-CTRL-01` interleave** | `P0-CTRL-01` executes as additive **M-0…M-4**, then **`P0-MAINT-01`**, then mutating **M-5…M-9**. The roadmap's overall ordering remains `P0-CTRL-01` → `P0-MAINT-01` → `P0-ORD-01`; this clause records the **internal interleave** only and reorders nothing else |
| **AD-3 — Alert-lane separation** | **A3, F19, B-7 and B-8 form a separate increment.** They are **not** required to close `KV-D06-001`, but they remain **mandatory before pilot go-live** |
| **AD-4 — `P0-VOICE-01` sequencing** | `P0-VOICE-01` must finish **before control-plane caller conversion**. This does **not** activate voice, does **not** authorize `0077`, and does **not** change its priority relative to `P0-ORD-01` or `P0-WA-01`. `0077` remains **unapplied and unauthorized** |
| **AD-5 — B-13 evidence first** | Run **PF20 before** asking for a founder outage-risk decision. **Escalate only if PF20 identifies live silent A1 failures** |
| **AD-6 — B-9 deferred** | `actor_label` remains **CHECK-constrained to NULL**. **No personal-data disclosure is authorized**, and **no `KV-D06-001` stage depends on an actor label** |

The addendum has **exactly six clauses**. No seventh clause exists, and none may be added without a
new signed founder decision.

#### 3.3.3 Approved KIVO-PM engineering rulings

| # | Ruling |
|---:|---|
| 1 | **Widen the application ownership-state model and `LEGAL_TRANSITIONS` from five to all seven production states**, including `HOLD_UNCLAIMED` and `AI_RESUME_PENDING`. `KV-D06-002` closes **only on implementation and proof** |
| 2 | **Repair the five legacy rows — L-A: 4 and L-B: 1 — inside the governed maintenance window.** **No** founder exception and **no** permanent carve-out is granted |
| 3 | **Adopt Revision 14 §15.4 staged caller rollout, the R-3 mandatory runtime path flag and §15.5 rollback contract** |
| 4 | **No migration stage may combine additive and revoking work** |
| 5 | **Keep the alert sweep and delivery work in the separated alert increment.** Both remain **mandatory for pilot go-live** |
| 6 | **Run PF20 before any B-13 founder escalation** |
| 7 | **Keep `actor_label` NULL and non-blocking** |
| 8 | **Complete `P0-VOICE-01` before caller conversion**, while keeping `0077` **unapplied and unauthorized** |

These are approved **engineering rulings**. They define required design and sequencing. They
authorize no SQL, no migration, no database access, no deployment and no production action.

#### 3.3.4 Findings register — Revision 14

Added without renumbering any existing finding. `KV-D06-003` is outside this record and is neither
created nor altered here.

| ID | Finding | State |
|---|---|---|
| `KV-D06-002` | The application ownership-state model has **five** states while the production/control contract requires **seven** | **OPEN; HARD PREREQUISITE; BLOCKING.** Closes only on implementation and proof |
| `KV-D06-004` | Deployed voice source references **three production-absent columns** | **OPEN**; governed by `P0-VOICE-01`; **blocks caller conversion and pilot go-live** |
| `KV-D06-005` | **No proven alert-sweep invoker**, timing contract, stuck-run detection, retry or catch-up bound | **OPEN**; separated alert lane; **PILOT BLOCKING** |
| `KV-D06-006` | **No proven human alert-delivery and acknowledgment boundary** | **OPEN**; separated alert lane; **PILOT BLOCKING** |
| `KV-D06-007` | **No approved actor-label source** | **DEFERRED; NON-BLOCKING.** `actor_label` remains **NULL**; **no disclosure authorized** |
| `KV-D06-008` | Production `service_role` `auth.uid()` behaviour is **unverified** | **CLOSED BY FOUNDER DESIGN DISPOSITION — SA2 removed; SA1 retained; VP-1 no longer required** (§3.3.7). Closed **by design disposition, not by successful execution of VP-1**. VP-1 remains historically **BLOCKED**; no `kv_probe_actor()` function may be created; no production DDL probe is authorized. Closing this finding does **not** authorize migration-specification drafting |
| `KV-D06-009` | Caller conversion, staged rollout and rollback remain **unimplemented** | **OPEN**; **BLOCKING caller conversion and revocation** |
| `KV-D06-010` | Immutable member identity versioning | **Option A founder-approved**; implementation and proof **OPEN** |
| `KV-D06-011` | The audit bridge may convert **silent A1 failures into visible errors** | **OPEN.** PF20 **PASS** (§3.3.8) — no non-zero suspected live silent-failure population was identified and the B-13 founder outage-risk escalation condition did **not** fire; no outage trade-off was accepted. Remains an **M-2 design and monitoring obligation**: the audit bridge must still make future audit failures **visible**, never silently swallowed |

#### 3.3.5 Next authorized stage

After this roadmap record is **independently audited and merged**, the next technical activity is a
**separate read-only preflight work order** containing **only**:

1. **VP-1** — service-role `auth.uid()` behaviour;
2. **PF20** — silently-failing A1 inserts;
3. the **L-A/L-B legacy-row classification**;
4. the **`service_role` A1-reader dependency sweep**.

That work order is **SELECT-only**. It creates and changes no state, sends no message, creates no
order, and changes no flag, configuration or deployment. **No migration specification may be
drafted before the preflight results are reported to KIVO-AUDITOR.** No migration label, including
`0106`, is assigned or unblocked by this record, and pilot status remains **NO-GO**.


#### 3.3.6 Preflight execution and source — `WO-PREFLIGHT-KVD06-REV14-001`

The read-only preflight authorized by D-2 and scheduled in §3.3.5 **has now been executed**. §3.3.5 is
retained unchanged as the historical authorization; §3.3.6 to §3.3.11 record what it returned, and
§3.3.11 states the current next stage.

**Attribution.** Every production result below is **KIVO-AUDITOR's read-only preflight output**. The
Builder did **not** independently re-run any production query, and nothing here is a Builder
observation of production.

**Recorded scope of the preflight:**

- **17 SELECT statements**
- **zero** database writes
- **zero** DDL
- **zero** RPC creation
- **zero** repository or GitHub mutation
- **zero** configuration, deployment or production-behaviour change
- **no** message and **no** order
- **no** credential and **no** personal data reproduced

**Recorded baseline.** The preflight ran against `main`
`8b734f145fc8b7b165139e2d8d8d8708adb1df93` and roadmap
`b56ed0c513ab0e334c2b1a4b66bf7b5372cfa78cdbab05e9e0181bc1754509e5`.

#### 3.3.7 Founder decision — Option A — 27 Jul 2026

**Binding founder decision, 27 Jul 2026: “APPROVE OPTION A — remove SA2, rely on SA1, and record the
preflight results, PF-L1 and PF-R1 in the roadmap and Revision 14 governance record before any
migration specification.”**

Recorded verbatim:

> “I approve Option A: remove SA2 from every planned system function and rely on SA1, the proven
> EXECUTE-grant separation, as the service/system authority boundary. VP-1 is no longer required for
> the approved design. No production DDL probe is authorized.”

This decision is added **inside** the Revision 14 governance record. It does **not** modify the signed
six-clause addendum in §3.3.2 and does **not** create an AD-7.

Recorded effects:

- **SA2 is withdrawn from the approved design.** It is not a live requirement of any planned system
  function and must not be reintroduced without a new signed founder decision.
- **SA1 remains the sole service/system authority boundary** — the proven EXECUTE-grant separation.
- **VP-1 stays historically BLOCKED but is no longer required** by the approved design.
- **No `kv_probe_actor()` function may be created.** No production DDL probe is authorized.
- **B-10 is closed as not applicable to the approved design.**
- **`KV-D06-008` is closed by design disposition, not by successful execution of VP-1.**
- **No SQL, migration or implementation occurred**, and none is authorized by this decision.
- **No migration specification becomes authorized merely because B-10 closes.**

#### 3.3.8 PF20 result and B-13

- **PF20 PASS.**
- `anon`, `authenticated` and `service_role` **still held INSERT** on
  `conversation_assignment_events`.
- **No non-zero suspected live silent-failure population was identified.**
- The temporal evidence was a **strong negative indicator, not proof of zero historical failures.**
- **The B-13 founder outage-risk escalation condition did not fire.**
- **No outage trade-off was accepted.**
- **`KV-D06-011` and B-13 remain OPEN** as an **M-2 design and monitoring obligation**.
- The audit bridge **must still make future audit failures visible** rather than silently swallowed.

**B-13 is not closed.** AD-5's requirement is satisfied only in the sense that PF20 ran first and
returned no escalation trigger.

#### 3.3.9 Legacy classification — 27 Jul 2026 preflight snapshot — and PF-L1

The figures below are a **dated 27 Jul 2026 preflight snapshot**, not an eternal invariant. They are
KIVO-AUDITOR's read-only output at that moment and must be re-read before any action depends on them.

| Item | 27 Jul 2026 snapshot |
|---|---:|
| Total conversations | 27 |
| L-A | 4 — reproduced exactly, **zero safety holds** |
| L-B | 1 — reproduced exactly, **zero safety holds** |
| L-C | 6 — **all with NULL actor** |
| Rows in `HUMAN_IDLE`, `SYSTEM_HOLD`, `HOLD_UNCLAIMED` or `AI_RESUME_PENDING` | 0 |

L-C **increased from 4 to 6** after the Revision 14 baseline: **two additional NULL-actor A1 rows were
written on 26 Jul 2026.**

##### PF-L1 — L-C is live and growing

- **L-C is not a fixed historical set of four rows.**
- **The existing trigger continues producing NULL-actor rows** until the M-2 bridge and caller
  conversion land.
- **The fixed-set quarantine concept is replaced with a predicate:** *every applicable A1 row written
  before the verified M-2 bridge activation boundary and carrying a NULL actor is quarantined as
  pre-bridge evidence.*
- **The boundary must be established by governed application and read-back evidence, never guessed
  from a date.**
- **Future rows written after the verified bridge boundary must not be silently absorbed into the
  quarantine.**
- **B-4 remains OPEN.**
- **L-A remains preserve-and-claimable.**
- **L-B remains scheduled for governed `clear_stale_assignee` repair after installation.**
- **No row was altered, deleted, backfilled or reclassified by the preflight.**

#### 3.3.10 A1-reader dependency sweep, production authority facts, and PF-R1

**Sweep result:**

- **Zero application readers** found in `app/` or `lib/`.
- **Zero dependent views, rules or materialized views** found.
- **No `service_role` reader** was found in the repository or the database dependency graph.
- **The sweep could not prove absence** in unavailable external consumers or in the uninspectable Edge
  Function. This is a stated evidence limitation, not a clean negative.
- **D-3's conditional approval remains effective and did not lapse.**
- **B-2 remains OPEN** pending application and read-back evidence.

**Production facts recorded by the preflight (KIVO-AUDITOR read-only output):**

| Fact | Value |
|---|---|
| Table owner | `postgres` |
| RLS enabled | true |
| FORCE RLS | false |
| `service_role` has `BYPASSRLS` | true |
| `postgres` has `BYPASSRLS` | true |
| API role table privileges | currently broad |
| `service_role` is a member of `authenticated` | no |

##### PF-R1 — FORCE RLS does not contain BYPASSRLS roles

1. **FORCE RLS does not constrain `service_role` while it has `BYPASSRLS`.**
2. **Revoking the service-role table grant is the control that removes its direct access.**
3. **FORCE RLS is also ineffective against the current `postgres` owner**, because that role has
   `BYPASSRLS`.
4. **Ownership transfer to the approved non-BYPASSRLS control owner is therefore load-bearing.**
5. **M-5 must read back all six of:**
   - the intended owner;
   - owner `rolbypassrls = false`;
   - RLS enabled;
   - FORCE RLS enabled;
   - service-role grants revoked as designed;
   - required application paths still functioning.
6. **The design must never claim FORCE RLS alone contains `service_role`.**

#### 3.3.11 Status after this decision, and the next safe stage

| Item | Status after 27 Jul 2026 |
|---|---|
| B-10 / `KV-D06-008` | **CLOSED BY FOUNDER DESIGN DISPOSITION** — SA2 removed; SA1 retained; VP-1 no longer required |
| B-13 / `KV-D06-011` | **OPEN.** PF20 passed; no founder escalation; the M-2 design and monitoring obligation remains |
| B-4 | **OPEN.** PF-L1 added; quarantine is **predicate-based**, not a fixed set |
| B-2 | **OPEN.** D-3 remains effective; PF-R1 constrains M-5 |
| `KV-D06-002` | **OPEN; HARD PREREQUISITE; BLOCKING** |
| Every other blocker and finding | **Unchanged.** No additional blocker is closed by this record |

**Migration-specification drafting remains BLOCKED.** Completing the preflight does not unblock it:
`KV-D06-002` is still an **unimplemented hard prerequisite**, and no migration label — including
`0106` — is assigned or unblocked here.

**Next safe stage.** After this roadmap record is **independently audited and merged**, the next
technical work is a **separately scoped implementation-and-proof work order for the seven-state
application ownership model**:

1. add `HOLD_UNCLAIMED`;
2. add `AI_RESUME_PENDING`;
3. update `LEGAL_TRANSITIONS`;
4. prove `setOwnershipState` accepts both states correctly;
5. prove escalation reaches `HOLD_UNCLAIMED`.

That work order carries **no database or migration change unless separately authorized**. **No part of
that implementation is created by this roadmap record**, and pilot status remains **NO-GO**.


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
| P0-CTRL-01 / KV-D06-001 | **CRITICAL; OPEN; BLOCKING; Revision 14 design approved with the signed six-clause addendum (§3.3)** — implementation and evidence remain open; no SQL or migration is authorized; `0106` remains reserved and BLOCKED | Independent clearance of the secure forward design and explicit founder approval before implementation |
| P0-MAINT-01 | **OPEN; BLOCKING; design not approved** | P0-CTRL-01 rollout boundary plus a verified reversible block, drain, read-back and restore mechanism |
| P0-ORD-01 / `WO-ENG-P0-ORDER-FREEZE` | **OPEN; BLOCKING; Option B design not approved** | Approved protected database state plus a database-level `orders` trigger; merge before E0 resumes; baseline stays 127 |
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

### Parallel lane — legal identity, public legal pages and Meta

Runs beside the phases above. It does **not** reorder or weaken the `KV-D06-001`,
`P0-MAINT-01`, `P0-ORD-01`, `P0-WA-01`, E0 or E1 sequence, and no phase above waits on it.
Full detail in §3.1.

| Item | State | Depends on |
|---|---|---|
| P0-LEGAL-01 | **BLOCKED** | Founder document upload plus independent verification |
| P0-LEGAL-02 | **PLANNED** | The complete data-practice and PDPL inventory named in §3.1 |
| P0-LEGAL-03 | **BLOCKED** | P0-LEGAL-01 and P0-LEGAL-02; counsel approval before any page is final |
| P0-WEB-LEGAL-01 | **BLOCKED** | Approved legal identity and approved legal text; no placeholder at release |
| P0-DELETE-01 | **PLANNED** | The procedure and synthetic end-to-end test named in §3.1 |
| P0-META-01 | **BLOCKED** | Verified Saudi documents, consistent website identity, public legal pages |
| P0-META-02 | **PLANNED** | Independent verification against current official Meta requirements |
| P0-META-03 | **BLOCKED** | Working Embedded Signup and P0-META-02 |
| P0-META-04 | **BLOCKED** | Public HTTPS URLs with no placeholder, verified independently |
| P0-META-05 | **PLANNED; BLOCKING before App Review submission** | Correcting `docs/META_SETUP_GUIDE.md` to the P0-META-02 permission pair; the guide is non-authoritative until it closes |

### V1 readiness inventory — audited baseline

Imported from the independently approved evidence baseline `SCOPE013.md`
(SHA-256 `7a3fd3c4dc950ef4db4e54aae2b453ec23b7b307203f38508a582d026e4c9de2`, 55569 bytes,
555 lines) §6, rows 1-23. Every figure below is the **audited baseline at that artefact's recorded
pin**, not a newly re-queried current value. One primary evidence class per row; any additional
blocker sits in its own column. Evidence states are **not** relabelled because scope is now
decided.

| # | Capability (one testable unit) | Scope | Evidence class | Blocker | Wesaya evidence (audited baseline) |
|---:|---|---|---|---|---|
| 1 | New restaurant console UI shell | V1 | BUILT BUT LIVE PROOF MISSING | none | console_v2=true; console-v2 routes shipped |
| 2 | Human control of customer conversations (claim/takeover) | V1 | BUILT BUT BROKEN | P0-CTRL-01 / KV-D06-001 | both claim routes call control_claim; function absent in production |
| 3 | Conversation control audit trail | V1 | BUILT BUT LIVE PROOF MISSING | P0-CTRL-01 | 4 Wesaya conversation_assignment_events rows, written by the surviving trigger |
| 4 | Console menu availability / 86 write path | V1 | PROVEN WORKING | none | 39 operator events, 19 unavailable, 20 restored, 2 actors, 2026-06-27 to 2026-07-15 |
| 5 | Agent honours an 86'd item on the next turn | V1 | UNPROVEN | none | no live proof performed |
| 6 | Limited console commands to Kivo | V1 | BUILT BUT LIVE PROOF MISSING | none | individual session-authenticated routes exist; no defined command set |
| 7 | Notification display | V1 | BUILT BUT LIVE PROOF MISSING | none | 153 Wesaya system alert rows across 7 code-critical types; 4 dismissed via the manager-only route, consistent with the banner rendering but not proof of it |
| 8 | Acknowledgment identity | V1 | ABSENT | none | system_alerts has no actor column; dismissed_at records no who |
| 9 | Acknowledgment escalation | V1 | ABSENT | none | no unacknowledged-escalation mechanism exists in schema or code |
| 10 | Kitchen board (read-only) | V1 | BUILT BUT LIVE PROOF MISSING | none | app/api/handoff/board/route.ts, ungated, tenant-scoped |
| 11 | Kitchen-ticket generation | V1 | BUILT BUT OFF | none | kitchen_ticket ABSENT FLAG -> EFFECTIVELY OFF |
| 12 | Temporary restaurant instructions | V1 | BUILT BUT LIVE PROOF MISSING | none | 1 Wesaya tonight_notes row; path ungated; prompt consumption and expiry unproven |
| 13 | Permanent restaurant instructions | V1 | BUILT BUT OFF | none | standing_instructions ABSENT FLAG -> EFFECTIVELY OFF; 0 rows |
| 14 | Staff WhatsApp command implementation | V1 | BUILT BUT OFF | P0-WA-01 | pause, live, eightysix, restore, confirm, status, note_allergen defined; ABSENT FLAG |
| 15 | Staff WhatsApp registration / configuration | V1 | BUILT BUT OFF | none | Wesaya has ZERO staff-number registrations; the only 2 platform rows belong to tenant 9244d8ef-66b1-417a-a012-41a389ab1abf, "Sweet Shop — سويت شوب", active=false, and are therefore not Wesaya configuration and not evidence of a live registration path for the pilot tenant |
| 16 | Customer-memory storage | V1 | BUILT BUT OFF | none | customer_memory ABSENT FLAG -> EFFECTIVELY OFF; 0 rows platform-wide |
| 17 | Customer-memory expiry / correction / deletion | V1 | ABSENT | none | no TTL, no operator correction path, no per-field deletion |
| 18 | Memory-allergy behavior | V1 | BUILT BUT BROKEN | none | memory_allergy_gate=true but bypassed by allergy_simple=true, and source table empty |
| 19 | Egyptian encyclopedia | V1 | ABSENT | none | zero occurrences anywhere; knowledge/ contains only ksa/ |
| 20 | Shift control screen | V1 | BUILT BUT LIVE PROOF MISSING | none | shipped with a tested pure model |
| 21 | Shift preflight checklist | V1 | ABSENT | none | no pre-shift readiness checklist exists in code |
| 22 | More / health screen | V1 | ABSENT | none | nav item is an aria-disabled placeholder; no route |
| 23 | WhatsApp channel ingress | V1 | BUILT BUT BROKEN | P0-WA-01 | production callbacks rejected 401 |

### Post-V1 classifications after the 26 Jul 2026 founder decision

Rows 24-33 of the same audited baseline, with the founder decision applied. Evidence classes are
carried over unchanged; only the Scope column is now settled. No row remains UNCLASSIFIED.

| # | Capability | Scope after the decision | Evidence class | Blocker | Wesaya evidence (audited baseline) |
|---:|---|---|---|---|---|
| 24 | Website channel | **V2** | BUILT BUT LIVE PROOF MISSING | none | ACTIVE_CHANNELS includes website; zero website conversation rows |
| 25 | KSA encyclopedia | SETTLED EXCLUSION — outside Egypt V1 | BUILT BUT OFF | none | khalid_persona and ksa_encyclopedia both ABSENT for Wesaya |
| 26 | Voice notes | **V2** | BUILT BUT BROKEN | 0077 unapplied; P0-VOICE-01 | live source/schema contradiction; voice_notes ABSENT FLAG |
| 27 | Conversation outcomes | SETTLED OUTSIDE V1 — future backlog, not scheduled | BUILT BUT OFF | none | conversation_outcomes ABSENT FLAG; 0 rows platform-wide |
| 28 | Callback requests | SETTLED OUTSIDE V1 — future backlog, not scheduled | BUILT BUT OFF | none | callback_requests ABSENT FLAG |
| 29 | QZ print | SETTLED OUTSIDE V1 — future backlog, not scheduled | BUILT BUT OFF | none | qz_print ABSENT FLAG |
| 30 | Manager command recognition | SETTLED OUTSIDE V1 — future backlog, not scheduled | BUILT BUT OFF | none | manager_command_recognition ABSENT FLAG |
| 31 | PSP payments | SETTLED OUTSIDE V1 — future backlog, not scheduled | BUILT BUT OFF | none | psp_payments ABSENT FLAG |
| 32 | Canonical payment methods | SETTLED OUTSIDE V1 — future backlog, not scheduled | BUILT BUT OFF | none | canonical_payment_methods ABSENT FLAG |
| 33 | Full natural-language restaurant-to-Kivo conversation | SETTLED — V2 | ABSENT | none | no surface exists; correctly excluded from V1 |

### Required V1 launch state — exhaustive

Imported from the same audited baseline, §7. **Exhaustive for every V1 capability above**: rows
1-23 each carry exactly one requirement, keyed by readiness row number. No V1 capability is
omitted, folded into another, or left implicit. Rows 24-33 carry no V1 requirement.

| Row | Capability | Required V1 launch state |
|---:|---|---|
| 1 | New restaurant console UI shell | Live proof on the shipped shell. |
| 2 | Human control of customer conversations | P0-CTRL-01 repaired and independently proven. |
| 3 | Conversation control audit trail | Every control transition writes a correct, tenant-scoped assignment event with the real actor, proven against real PostgreSQL after P0-CTRL-01. Recorded as its own requirement, not inside human control. |
| 4 | Console menu availability / 86 write path | Already PROVEN WORKING. No outstanding requirement; it must not regress. |
| 5 | Agent honours an 86'd item on the next turn | Live proof against a real 86 toggle. Remains UNPROVEN and blocking until that proof exists. |
| 6 | Limited console commands to Kivo | A defined, testable command set with proof. |
| 7 | Notification display | Proof that a real operator sees a live alert in the console banner. |
| 8 | Acknowledgment identity | An actor-bearing acknowledgment record, distinct from dismissed_at, so receipt is provable rather than inferred. |
| 9 | Acknowledgment escalation | A mechanism that escalates an alert left unacknowledged past a defined window, plus the roadmap-mandated phone drill proving delivery and escalation. |
| 10 | Kitchen board | Live proof that the read-only board buckets real kitchen-bound orders. |
| 11 | Kitchen-ticket generation | kitchen_ticket enabled with a generation proof. |
| 12 | Temporary restaurant instructions | Prompt-consumption and expiry proof. |
| 13 | Permanent restaurant instructions | Enablement plus injection proof. |
| 14 | Staff WhatsApp command implementation | Enablement plus a command proof, after P0-WA-01. |
| 15 | Staff WhatsApp registration / configuration | At least one verified Wesaya staff-number registration, proven not to leak into the customer lane. |
| 16 | Customer-memory storage | Enablement with a write proof for the pilot tenant. |
| 17 | Customer-memory expiry / correction / deletion | Built and proven before any customer-facing surfacing of memory. |
| 18 | Memory-allergy behavior | Either supplied with data and proven, or turned off, so the live flag vector stops implying protection that cannot fire. |
| 19 | Egyptian encyclopedia | Corpus built with documented provenance and licensing, per-entry and pack-level versioning, native Egyptian review, and a test proving allergen-gate output is byte-identical when it is enabled. |
| 20 | Shift control screen | Live proof on the shipped screen. |
| 21 | Shift preflight checklist | The checklist built, then proven. |
| 22 | More / health screen | The screen built, then proven. |
| 23 | WhatsApp channel ingress | P0-WA-01 repaired and independently proven, with a live inbound-to-reply proof on the pilot tenant. |

This inventory **adds and classifies backlog work**. It does not authorize implementation and does
not change the active technical ordering: `KV-D06-001` / `P0-CTRL-01`, `P0-MAINT-01`,
`P0-ORD-01`, `P0-WA-01`, `P0-SHADOW-01`, E0 and E1 keep their existing positions and states.

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
- [ ] Both console claim routes succeed against the real production-schema contract
- [ ] Every privileged control function validates tenant and actor inside the database
- [ ] Return-to-Kivo is one atomic operation
- [ ] No production ownership writer bypasses the canonical control contract
- [ ] Assignment history is immutable and audit-degradation behaviour is proven
- [ ] `P0-VOICE-01` closed: no deployed source reads or writes `voice_notes_day`, `voice_notes_sent` or `voice_cost_usd`, with `0077` still unapplied.

### Legal identity, public legal pages and Meta

Parallel-lane gates (§3.1). They do not gate the technical sequence above, and the technical
sequence does not gate them.

- [ ] Founder documents received and independently matched
- [ ] One consistent Saudi identity across the website, Meta portfolio, domain, email and submitted documents
- [ ] City Baker absent from every current public surface
- [ ] Final Arabic and English legal pages approved
- [ ] Deletion process tested with synthetic data
- [ ] Public production URLs independently verified
- [ ] Domain and business verification completed
- [ ] Minimum permissions independently confirmed
- [ ] App Review evidence independently audited
- [ ] `docs/META_SETUP_GUIDE.md` is corrected to the independently verified permission pair and is no longer marked incomplete or non-authoritative
- [ ] The verified data-practice and Saudi PDPL manifest under `P0-LEGAL-02` is independently approved
- [ ] Explicit founder approval before Meta submission

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
- [ ] The protected containment state is disabled and read back from the database before the complete live proof
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
7. A stubbed RPC test cannot prove a database function exists; every required RPC must have a real PostgreSQL contract and role-access proof.

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
- `0077_voice_budget.sql` is prepare-only and unapplied. Its three `conversations` columns do not exist in production; see §3.2.3 and `P0-VOICE-01`.

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

### 12.1b Conversation control plane (0099) — partially present, blocked

- **Ledger row.** `supabase_migrations.schema_migrations` contains
  `20260721235747 / conversation_control_plane`. The schema, control epoch,
  assignment table and triggers are present in production.
- **Absent functions.** Six functions named by
  `0099_conversation_control_plane.sql` are absent from production:
  `_control_set_ctx`, `control_apply_transition`, `control_escalate_to_hold`,
  `control_claim`, `control_reassign` and `control_release_to_ai`. A ledger row
  is therefore not proof that the objects a migration names exist.
- **Broken live routes.** Both live console claim routes call the absent
  `control_claim`: the legacy route
  [`app/api/conversations/[id]/assignee/route.ts`](../app/api/conversations/%5Bid%5D/assignee/route.ts)
  and the console-v2 route
  [`app/(console-v2)/c/(app)/conversations/claim/route.ts`](../app/%28console-v2%29/c/%28app%29/conversations/claim/route.ts)
  used by Wesaya. Operator claim fails.
- **No replay and no byte-for-byte restoration.** `0099` must not be replayed,
  and its function bodies must not be restored as written. Their source lacks
  narrow execution grants and complete tenant/actor validation.
- **Non-atomic handback.** Return-to-Kivo is not one atomic transition and must
  be redesigned as one.
- **Legacy direct release.** The direct legacy release update bypasses the
  canonical control contract and must be removed.
- **Audit and immutability defects.** The assignment history permits privileged
  mutation and must be made mechanically immutable; the audit function can
  silently lose records, and silent audit loss is forbidden.
- **`0106` reserved but blocked.** The `0106` reservation recorded in §12.1a is
  unchanged and remains blocked. No migration has been created, prepared,
  approved or applied under it.
- **No replacement label.** No replacement migration label is assigned for the
  secure forward correction. Assigning one is a separate approved decision.
- **Pilot status.** The pilot remains **NO-GO**. No application, migration or
  production write is authorized by this entry.
- **Revision 14 approval changes nothing here.** The `KV-D06-001` Revision 14 design was
  founder-approved on 27 Jul 2026 with the signed six-clause addendum (§3.3). That is design
  and governance approval only. **No SQL is authorized, no migration is prepared, no migration
  label is assigned, and `0106` remains reserved and blocked.** No migration specification may
  be drafted before the §3.3.5 read-only preflight results are reported to KIVO-AUDITOR. Every
  migration-ceremony requirement in §12.3 and `DEPLOYMENT.md` §B continues to apply unchanged.
- **The completed preflight does not unblock migration drafting.** The §3.3.5 preflight ran on
  27 Jul 2026 and its results are recorded in §3.3.6-§3.3.11. Migration-specification drafting
  **remains BLOCKED** because `KV-D06-002`, the seven-state application ownership model, is still
  an **unimplemented hard prerequisite**. Closing `KV-D06-008` by founder design disposition
  authorizes **no** migration specification, **no** migration label and **no** SQL. `0105` remains
  reserved and `0106` remains reserved and blocked.

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
| Conversation control-plane migration | [`supabase/migrations/0099_conversation_control_plane.sql`](../supabase/migrations/0099_conversation_control_plane.sql) |
| Shared control module requiring redesign | [`lib/console/conversation-control.ts`](../lib/console/conversation-control.ts) |
| Legacy claim/release route | [`app/api/conversations/[id]/assignee/route.ts`](../app/api/conversations/%5Bid%5D/assignee/route.ts) |
| Console-v2 claim route | [`app/(console-v2)/c/(app)/conversations/claim/route.ts`](../app/%28console-v2%29/c/%28app%29/conversations/claim/route.ts) |
| Stub-only control proof | [`scripts/proof-control.test.ts`](../scripts/proof-control.test.ts) |
| Public privacy page (draft) | [`app/privacy/page.tsx`](../app/privacy/page.tsx) |
| Public terms page (draft) | [`app/terms/page.tsx`](../app/terms/page.tsx) |
| Public data-deletion page (draft) | [`app/data-deletion/page.tsx`](../app/data-deletion/page.tsx) |
| Public contact page | [`app/contact/page.tsx`](../app/contact/page.tsx) |
| Public site footer | [`components/SiteFooter.tsx`](../components/SiteFooter.tsx) |
| Meta setup reference — **INCOMPLETE and NON-AUTHORITATIVE on permission scope until P0-META-05 closes**; it names only `whatsapp_business_management`, never `whatsapp_business_messaging` | [`docs/META_SETUP_GUIDE.md`](./META_SETUP_GUIDE.md) |
| WhatsApp webhook routing decision — code evidence for the `env_fallback` route that the conditional Wesaya-only exemption depends on (§3.1) | [`lib/messaging/webhook-routing.ts`](../lib/messaging/webhook-routing.ts) |
| Data-deletion documentation | [`docs/DATA_DELETION.md`](./DATA_DELETION.md) |
| Privacy data inventory | [`docs/brain/PRIVACY_DATA_INVENTORY.md`](./brain/PRIVACY_DATA_INVENTORY.md) |

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

1. `P0-CTRL-01 / KV-D06-001` secure forward design is approved and proven.
2. `P0-MAINT-01` maintenance and drain procedure is approved.
3. P0-ORD-01 containment is specified, approved and executed.
4. P0-WA-01 repair packet is approved and executed against a non-order message.
5. P0-SHADOW-01 is removed or governed.
6. A new independent builder writes the E0 PostgreSQL verification from the live schema contract.
7. E0/E1 safety increment proceeds only after the real proof passes.

K2 must close before any future migration is applied. K4 must close before the R1 cutover. Neither may be silently treated as complete.

No later roadmap item may jump ahead of an unresolved earlier safety or truth gate.

On 27 Jul 2026 the founder approved the `KV-D06-001` Revision 14 design with its signed
six-clause addendum (§3.3). Decision 1 above is therefore **approved in design only**; its
remaining work is implementation and independent proof. The next authorized technical activity
is the **separate read-only preflight work order** in §3.3.5 — VP-1, PF20, the L-A/L-B
legacy-row classification and the `service_role` A1-reader dependency sweep, SELECT-only. No
migration specification may be drafted before its results reach KIVO-AUDITOR.

That preflight ran on 27 Jul 2026 and its results are recorded in §3.3.6-§3.3.11, together with
the founder Option A decision. The next authorized technical work is therefore no longer the
preflight but a **separately scoped implementation-and-proof work order for the seven-state
application ownership model** (§3.3.11). Migration-specification drafting **remains blocked**
because `KV-D06-002` is still an unimplemented hard prerequisite.

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
| 25 Jul 2026 | KV-D06-001 recorded as CRITICAL, OPEN and BLOCKING: migration 0099 has a ledger row but six control-plane functions are absent; two live console claim routes are broken; unsafe replay is prohibited; secure control and maintenance design now precede P0-ORD-01 while 0106 remains reserved but blocked |
| 25 Jul 2026 | KV-D06-001 roadmap correction: repaired seven repository-relative links and aligned the Phase 1 state/dependency columns; scope and sequence unchanged |
| 26 Jul 2026 | PR #557 correction 2: restored the pre-existing §1.3 and §16 acceptance language verbatim while retaining the two new control and maintenance predecessors; no safety gate or proof obligation was removed |
| 26 Jul 2026 | P0-ORD-01 reconciled with the founder's selected Option B: the containment is protected database state plus a database-level `orders` trigger, the `order_finalization_freeze` feature-flag mechanism is withdrawn, the mechanism-bound file territory and the thirty-fifth-feature-key claim are removed, enable/read-back/lift language is restated against the protected state, the exact database design remains subject to independent approval, `0106` stays reserved and blocked, and P0-ORD-01 stays OPEN and BLOCKING with every other fact, gate and sequence unchanged |
| 26 Jul 2026 | P0-ORD-01 migration-sequence clarification: the E0 sequencing now separates design approval, the migration-bearing work order, the governed `DEPLOYMENT.md` §B isolated-CLI preflight, one founder-approved application with full production read-back, the `.APPLIED.md` preservation step, and a separately approved protected-state enablement; the prior "merge it alone and deploy it" step was removed because merging or deploying repository files does not apply a database migration, and the containment cannot be enabled before the migration exists and passes production read-back |
| 26 Jul 2026 | Legal/Meta governance backlog opened as a parallel lane (§3.1, §9, §10, §14.2): recorded the founder ruling removing City Baker as the current public legal identity, the Saudi establishment as the incoming public legal owner/operator, the eleven current City Baker paths, zero references to the Saudi establishment name, the draft status of the Privacy/Terms/Data Deletion pages, and `legal-pages-delivery.zip` as input material only; added P0-LEGAL-01 to P0-LEGAL-03, P0-WEB-LEGAL-01, P0-DELETE-01 and P0-META-01 to P0-META-04 with their states, the V1-versus-onboarding scope distinction, ten legal/Meta go-live gates and eight source anchors. Backlog and governance only — this approves no legal text, no code, no deployment and no Meta submission; all Saudi identity values remain UNVERIFIED pending founder documents; historical records are unchanged; the KV-D06-001, P0-MAINT-01, P0-ORD-01, P0-WA-01, E0 and E1 sequence is unchanged; `0105` and `0106` reservations are unchanged; pilot remains NO-GO |
| 26 Jul 2026 | Legal/Meta backlog correction after auditor findings F-1 to F-5: **F-1** restated the repository counts as a pre-PR baseline of eleven City Baker paths plus this entry as the twelfth, and zero Saudi-establishment references plus this entry as the first, with both marked governance/history and explicitly not discharging the public-removal gate, so no count becomes false on merge; **F-2** added `P0-META-05` (PLANNED and BLOCKING before App Review submission) recording that `docs/META_SETUP_GUIDE.md` names only `whatsapp_business_management` and never `whatsapp_business_messaging`, that P0-META-02 supersedes it with the verified minimum pair, and marked the §14.2 anchor incomplete and non-authoritative until it closes; **F-3** made the Wesaya-only exemption conditional on three independently verified conditions — Development mode, an approved test-user role, and the global `env_fallback` number matched to `WHATSAPP_PHONE_NUMBER_ID` — ending immediately on Live mode or per-tenant Embedded Signup, with Meta Advanced Access remaining blocking while any condition is unverified and none verified by this entry; **F-4** added the `lib/messaging/webhook-routing.ts` source anchor as the code evidence for that `env_fallback` route; **F-5** corrected the pull-request body's line citation. Backlog and governance only — approves no legal text, no code, no deployment and no Meta submission; Saudi identity values remain UNVERIFIED; historical records unchanged; the KV-D06-001, P0-MAINT-01, P0-ORD-01, P0-WA-01, E0 and E1 sequence unchanged; `0105` and `0106` reservations unchanged; pilot remains NO-GO |
| 26 Jul 2026 | Legal/Meta backlog correction 2, closing the two non-blocking auditor recommendations. **R-1** removed every remaining absolute line-number reference to `docs/META_SETUP_GUIDE.md` and replaced it with durable evidence: the permission bullet is now quoted complete and verbatim in a fenced block beneath the §3.1 backlog table, with no ellipsis; the guide is noted to name that same permission twice more, in its Request Advanced Access step and its App Review approval checklist, and to define no other permission bullet; and a search-verifiable statement records **zero occurrences** of `whatsapp_business_messaging`, reproducible with `rg -c 'whatsapp_business_messaging' docs/META_SETUP_GUIDE.md`. The line numbers previously cited inside the F-1 to F-5 history row on this unmerged branch were removed in the same pass so no unstable reference survives; that row is otherwise unchanged and this row discloses the edit rather than making it silently. **R-2** added two §10 gates: one requiring `docs/META_SETUP_GUIDE.md` to be corrected to the independently verified permission pair and no longer marked incomplete or non-authoritative, and one closing the auditor's completeness gap by requiring the `P0-LEGAL-02` verified data-practice and Saudi PDPL manifest to be independently approved. Backlog and governance only — approves no legal text, no code, no deployment and no Meta submission; Saudi identity values remain UNVERIFIED; the KV-D06-001, P0-MAINT-01, P0-ORD-01, P0-WA-01, E0 and E1 sequence unchanged; `0105` and `0106` reservations unchanged; pilot remains NO-GO |
| 26 Jul 2026 | Founder V1/V2 scope decision recorded (§0.3 laws, §3.2, §9 audited baseline). Evidence baseline `SCOPE013.md` independently approved by KIVO-AUDITOR at SHA-256 `7a3fd3c4dc950ef4db4e54aae2b453ec23b7b307203f38508a582d026e4c9de2`, 55569 bytes, 555 lines, and recorded as evidence held outside Git rather than repository authority. All five open founder decisions are closed by the binding ruling “APPROVE ALL — V1 is WhatsApp and cash/COD only”: V1 is WhatsApp-only with cash/COD only, no online or card payment, no PSP integration and no canonical-payment-method subsystem; the website channel, voice notes and full natural-language restaurant-to-Kivo conversation are V2; and `conversation_outcomes`, `callback_requests`, `qz_print`, `manager_command_recognition`, `psp_payments` and `canonical_payment_methods` are settled outside V1 with future prioritization not yet scheduled. All thirteen absent Wesaya flag keys received explicit dispositions in §3.2.1, so absence may never again be cited as founder intent. KSA commercial use remains prohibited pending documented, independently approved provenance and licence, without blocking Egypt V1. Migration `0077` remains unapplied and unauthorized, `voice_notes` remains OFF and V2, and the live voice source/schema contradiction is now governed backlog `P0-VOICE-01`, a V1 hygiene repair that is neither voice activation nor authorization to apply `0077`. The 23-row V1 readiness inventory and the exhaustive 23-row required launch-state table were imported unchanged from the audited baseline, with evidence states preserved and identified as the baseline at its recorded pin rather than newly re-queried values. No implementation, configuration, flag change, migration, deployment or production action occurred; the KV-D06-001, P0-CTRL-01, P0-MAINT-01, P0-ORD-01, P0-WA-01, E0 and E1 sequence, the `0105` and `0106` reservations, the migration-ceremony rules, the PR #559 Meta/legal backlog and every existing NO-GO gate are unchanged; pilot remains NO-GO |
| 26 Jul 2026 | Correction 1 to the founder V1/V2 scope decision after KIVO-AUDITOR rejection of head `b21e2fae8edb3332954aae7879450f8494b9cc00`. `P0-VOICE-01` is restated as OPEN and as **BLOCKING before pilot go-live**, so the live voice source/schema contradiction now explicitly blocks go-live rather than sitting as an unplaced repair. Its placement is made explicit: it is worked **after** the existing safety-critical sequence, it does **not** enter the E0/E1 safety increment, and it does **not** displace `KV-D06-001` / `P0-CTRL-01`, `P0-MAINT-01`, `P0-ORD-01`, `P0-WA-01` or `P0-SHADOW-01`. A matching gate was appended to the §10 Operations list requiring `P0-VOICE-01` closed — no deployed source reading or writing `voice_notes_day`, `voice_notes_sent` or `voice_cost_usd`, with `0077` still unapplied — and that gate blocks pilot go-live only; it does not alter or enter the E0/E1 execution sequence. §12.1 migration truth now records `0077_voice_budget.sql` as prepare-only and unapplied with its three `conversations` columns absent from production. `0077` remains **unauthorized**: nothing here approves applying it, and the governed migration ceremony, the `0105` and `0106` reservations and the existing 0104 statement are unchanged. No code, SQL, migration, flag, configuration, deployment, Supabase, Vercel, Meta or production action occurred; this correction is documentation only. Pilot remains NO-GO |
| 27 Jul 2026 | `KV-D06-001` Revision 14 founder approval recorded (§3.3, §9 Phase 1, §12.1b, §16). The founder signed **“APPROVE D-1, D-2 AND D-3 — adopt the six-clause Revision 14 addendum and the recommended PM engineering rulings.”** **D-1** approves `control_alert_intents` (B-1) and `member_identity_versions` under Option A (B-11) as new protected structures and separates the alert-intent lane — A3, F19, B-7 and B-8 — from the `KV-D06-001` closure path into its own increment: closing `KV-D06-001` does not require it, no stage creating A3 may be scheduled until B-7 and B-8 close, and B-7/B-8 remain OPEN and block pilot go-live. **D-2** authorizes a SELECT-only production preflight — VP-1, PF20, the L-A/L-B legacy-row classification and the `service_role` A1-reader dependency sweep — whose results reach KIVO-AUDITOR before any migration specification is drafted; **no probe was executed by this record**. **D-3** approves in principle transferring ownership of `conversation_assignment_events` and forcing RLS at stage M-5, conditional on that sweep finding no `service_role` reader; B-2 remains OPEN and the approval lapses if a reader is found. Revision 14 is recorded at SHA-256 `f5eda59d06bdb4e72af183ab70deaec5dbb0041a02b6c5ba59bad21e456f6c37`, 156719 bytes, 2140 lines, as evidence held outside Git, approved with its **six-clause** addendum: AD-1 roadmap alignment against `c94ab596…` at `a0160626…` with PR #560 closing no technical blocker; AD-2 the `P0-CTRL-01` internal interleave M-0…M-4, then `P0-MAINT-01`, then M-5…M-9, leaving the overall `P0-CTRL-01` → `P0-MAINT-01` → `P0-ORD-01` ordering unchanged; AD-3 alert-lane separation, mandatory before pilot go-live; AD-4 `P0-VOICE-01` before control-plane caller conversion without activating voice, authorizing `0077` or changing its priority against `P0-ORD-01` or `P0-WA-01`; AD-5 PF20 evidence before any B-13 founder escalation; AD-6 `actor_label` deferred and CHECK-constrained to NULL with no disclosure authorized. Eight KIVO-PM engineering rulings were approved, covering the five-to-seven ownership-state widening including `HOLD_UNCLAIMED` and `AI_RESUME_PENDING`, repair of the five legacy rows (L-A: 4, L-B: 1) inside the governed maintenance window with no exception or carve-out, adoption of the §15.4 staged caller rollout with the R-3 runtime path flag and §15.5 rollback contract, the prohibition on combining additive and revoking work in one migration stage, retention of the alert sweep and delivery work in the separated increment, PF20 before B-13 escalation, `actor_label` NULL and non-blocking, and `P0-VOICE-01` before caller conversion. Nine findings were added without renumbering any existing finding — `KV-D06-002`, `KV-D06-004`, `KV-D06-005`, `KV-D06-006`, `KV-D06-007`, `KV-D06-008`, `KV-D06-009`, `KV-D06-010` and `KV-D06-011`; `KV-D06-003` was neither created nor altered. Only the obsolete “design not approved” wording on the `P0-CTRL-01` / `KV-D06-001` Phase 1 row was replaced; both remain **CRITICAL, OPEN and BLOCKING**, implementation and evidence remain open, and `0106` remains reserved and BLOCKED. The next authorized technical activity is the separate SELECT-only preflight work order. No implementation, SQL, migration preparation, migration number, database access, flag, configuration, deployment, Supabase, Meta, Vercel or production action was authorized or taken; `0105` remains reserved, `0077` remains unapplied and unauthorized, V1 remains WhatsApp and cash/COD only with website and voice V2, and pilot remains NO-GO |
| 27 Jul 2026 | Revision 14 preflight results and the founder **Option A** decision recorded (§3.3.6-§3.3.11, §3.3.4, §12.1b, §16). The founder signed **“APPROVE OPTION A — remove SA2, rely on SA1, and record the preflight results, PF-L1 and PF-R1 in the roadmap and Revision 14 governance record before any migration specification.”** **SA2 is removed** from every planned system function and **SA1 is retained** as the sole service/system authority boundary; VP-1 stays historically BLOCKED but is no longer required, no `kv_probe_actor()` may be created and no production DDL probe is authorized. **B-10 / `KV-D06-008` is CLOSED BY FOUNDER DESIGN DISPOSITION** — by design, not by successful execution of VP-1 — and closing it authorizes no migration specification. All production results come from KIVO-AUDITOR's read-only `WO-PREFLIGHT-KVD06-REV14-001`: 17 SELECT statements, zero writes, zero DDL, zero RPC creation, zero repository or GitHub mutation, zero configuration, deployment or production-behaviour change, no message, no order and no credential or personal data reproduced, run against `main` `8b734f145fc8b7b165139e2d8d8d8708adb1df93` and roadmap `b56ed0c513ab0e334c2b1a4b66bf7b5372cfa78cdbab05e9e0181bc1754509e5`; **the Builder re-ran no production query**. **PF20 PASSED** — `anon`, `authenticated` and `service_role` still held INSERT on `conversation_assignment_events`, no non-zero suspected live silent-failure population was identified, the temporal evidence was a strong negative indicator rather than proof of zero historical failures, the B-13 escalation condition did not fire and no outage trade-off was accepted; **B-13 / `KV-D06-011` remains OPEN** as an M-2 design and monitoring obligation requiring future audit failures to be visible. **PF-L1** records that L-C is live and growing: the 27 Jul 2026 snapshot showed 27 conversations, L-A 4 and L-B 1 both reproduced exactly with zero safety holds, L-C 6 all NULL-actor — up from 4 after two further NULL-actor A1 rows on 26 Jul 2026 — and zero rows in `HUMAN_IDLE`, `SYSTEM_HOLD`, `HOLD_UNCLAIMED` or `AI_RESUME_PENDING`; the fixed-set quarantine is replaced by a predicate over the verified M-2 bridge activation boundary, that boundary must come from governed application and read-back evidence rather than a guessed date, later rows must not be silently absorbed, **B-4 remains OPEN**, L-A stays preserve-and-claimable, L-B stays scheduled for governed `clear_stale_assignee` repair, and no row was altered, deleted, backfilled or reclassified. **PF-R1** records that FORCE RLS does not contain BYPASSRLS roles: the sweep found zero application readers in `app/` or `lib/`, zero dependent views, rules or materialized views and no `service_role` reader, but could not prove absence in unavailable external consumers or the uninspectable Edge Function, so **D-3's conditional approval remains effective and did not lapse** and **B-2 remains OPEN**; with owner `postgres`, RLS enabled, FORCE RLS false and both `service_role` and `postgres` holding `BYPASSRLS`, revoking the service-role grant is the control that removes direct access, ownership transfer to the approved non-BYPASSRLS control owner is load-bearing, M-5 must read back intended owner, owner `rolbypassrls = false`, RLS enabled, FORCE RLS enabled, revoked service-role grants and still-functioning application paths, and the design must never claim FORCE RLS alone contains `service_role`. `KV-D06-002` remains **OPEN, HARD PREREQUISITE and BLOCKING**, so **migration-specification drafting remains blocked**; the next technical work is a separately scoped implementation-and-proof work order for the seven-state application ownership model. No implementation, SQL, migration preparation, migration number, database write, Supabase access, configuration, deployment, Meta, Vercel or production mutation was authorized or performed; `0105` remains reserved, `0106` remains reserved and BLOCKED, `0077` remains unapplied and unauthorized, the signed six-clause addendum and D-1/D-2/D-3 are unchanged with no AD-7 created, V1 remains WhatsApp and cash/COD only with website and voice V2, and pilot remains NO-GO |
| 9 Aug 2026 | Scope clarification of the two 27 Jul 2026 rows above, both retained byte-unchanged. Their closing denial clauses — "…database access, flag, configuration, deployment, Supabase, Meta, Vercel or production action was authorized or taken" and "…no implementation, SQL, migration preparation, migration number, database write, Supabase access, configuration, deployment, Meta, Vercel or production mutation was authorized or performed" — are scoped to the Builder and to the documentation changes those rows record. They do not deny the founder-authorized auditor preflight the same records attribute: D-2 authorized a SELECT-only production preflight, and KIVO-AUDITOR executed exactly 17 production SELECT statements on 27 Jul 2026 under WO-PREFLIGHT-KVD06-REV14-001, with zero writes, zero DDL and zero errors. Auditor read-only SELECT access was authorized and occurred; Builder production access never occurred; no mutating database, Supabase, configuration, deployment or production action was authorized or performed by anyone. Documentation only — no gate, blocker, count, decision or evidence value changes; pilot remains NO-GO |
| 9 Aug 2026 | `KIVO_STATE_01` adoption candidate added as `docs/KIVO_STATE_01.md`, recording an evidence-backed repository/source snapshot at `main` `6e71a242cf9ae6b631c857c190146a0966c946da` and correcting the supplied draft's stale baseline, PR states, next-work wording, five-state-versus-seven-state boundary, test attribution, production-language boundaries, onboarding detail, scope conflicts and founder/package decision status. Documentation and source verification only: no blocker closes, no scope or execution order changes, no SQL or migration specification is authorized, `0105` and `0106` remain reserved as governed, `0106` remains BLOCKED, `0077` remains unapplied and unauthorized, the next separately scoped technical work remains the seven-state application ownership implementation-and-proof work required by `KV-D06-002`, migration drafting remains blocked, package v1.3 correction and Linear Prompt B remain blocked pending independent audit and merge, and pilot remains NO-GO |
| 9 Aug 2026 | Narrowed Egypt V1 founder scope decision adopted — **scope/governance adoption only**. The founder decision "APPROVE NARROWED EGYPT V1" is recorded verbatim in the new `docs/KIVO_FOUNDER_DECISION_DELTA_2026-08-09.md`, which resolves every KIVO_STATE-01 §20 conversation-only item: Egypt V1 with New Cairo initial area; ICP of busy SMB/medium restaurants with one to a maximum of two-to-three branches and large chains excluded; a five-restaurant New Cairo pilot cohort with backups qualified but not participants unless formally substituted; restaurants' own drivers with Kivo logistics/driver app/tracking V2; cash/COD only reconfirmed; the WhatsApp vertical slice ending in exactly one versioned correct-branch printed kitchen ticket; minimal manual/agent operator control as a V1 enabler rather than a restaurant OS; printed-ticket-in/full-KDS-deferred kitchen scope; reliable printing as a required V1 outcome with its mechanism ADR-gated (QZ Print versus other safe mechanisms, branch routing, health, retry, duplicate suppression, controlled reprint); onboarding and go-live evidence as V1 enablers; all safety, isolation, idempotency, audit, monitoring and rollback obligations unchanged and mandatory; customer memory deferred unless a later separately governed decision adds minimum necessary bounded memory; the separate Egyptian food encyclopedia product deferred while Egyptian-Arabic interaction and menu-grounded knowledge remain required; and website/voice, campaigns/loyalty, deep POS/ERP and Saudi/Khalid activation deferred. Commercial dispositions recorded as policy, not implementation: a gate-dependent 12 October 2026 pilot-start forecast with a one-month governed pilot window (12 October–8 November 2026 if on target, review 9–13 November), a first-three-months revenue objective that proves no readiness, the 15/30/55 payment schedule subject to correct contract wording and never represented as implemented billing, and the Order Readiness Blueprint signing deliverable never represented as live software. A dated scope note in §3.2 marks the superseded memory, encyclopedia and kitchen classifications; §3.2, §3.2.1 and the §9 audited inventory are retained byte-unchanged as history. "Full power" is bounded to the governed order flow and creates no model authority over money, confirmation, acceptance, tenancy, safety or printing. No code, SQL, migration specification, migration label, database/production access, deployment, Meta/Vercel action, printer installation or pilot launch is authorized; `KV-D06-001` / `P0-CTRL-01`, `KV-D06-002`, `P0-ORD-01`, `P0-WA-01`, `P0-SHADOW-01`, the safety gates and every other blocker are unchanged; `0105` and `0106` remain reserved with `0106` BLOCKED; `0077` remains unapplied and unauthorized; migration drafting remains blocked behind `KV-D06-002`; the next separately scoped technical work remains the seven-state application ownership implementation-and-proof; `docs/KIVO_STATE_01.md` remains byte-identical accepted evidence; and pilot remains NO-GO |
