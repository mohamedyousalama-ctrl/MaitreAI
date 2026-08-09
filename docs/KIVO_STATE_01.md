# KIVO_STATE-01 — Evidence-backed current-state snapshot

**Status:** ACTIVATES ON AUDITED MERGE — candidate until the pull request carrying it is independently cleared by KIVO-AUDITOR and merged to `main`; upon that merge it becomes the accepted KIVO_STATE-01 snapshot without further amendment. In both states it is an evidence record, not approval and not implementation authority.<br>
**Snapshot date:** 9 August 2026<br>
**Repository baseline:** `main` at `6e71a242cf9ae6b631c857c190146a0966c946da`<br>
**Roadmap at baseline:** Git blob `8565adeb13deaf361d3bec90a08224e222fe60d9`; SHA-256 `9500aa8806c615a38a25d84728e745f2762a961c28f3e45ffae1e3da1c6b8e6f`; 132,371 bytes; 1,845 lines<br>
**Source draft:** supplied `KIVO_STATE_01.md`; SHA-256 `337671f0eb8e8c43eeebc880ff843c8813b93d939005a489798614fda20ca8ea`; 8,618 bytes; 82 lines<br>
**Pilot:** **NO-GO**

## 1. Snapshot identity and evidence rules

This document corrects and expands the supplied source draft against the baseline above. It is a repository and governance snapshot, not a production attestation and not permission to implement, migrate, deploy or change an external system.

Capability states are used strictly:

- **ABSENT** — the claimed capability or required artefact was not found in the verified scope.
- **DESIGNED** — an approved or proposed design exists, but implementation is not established.
- **SOURCE EXISTS** — inspected in the named repository object at the baseline commit.
- **AUTOMATED PROOF** — the named executable proof passed; §21 identifies whether it was rerun here or inherited from the accepted 9 August package audit.
- **REPOSITORY APPLICATION RECORD** — an in-repository `.APPLIED.md` record exists; no fresh live database read-back was performed here.
- **PRODUCTION READ-BACK** — a dated, authorized production result exists in accepted evidence. No new production read-back occurred here.
- **PILOT PROVEN** — a complete governed pilot result exists. No capability in this snapshot is classified PILOT PROVEN.
- **SCALE PROVEN** — governed scale evidence exists. No capability in this snapshot is classified SCALE PROVEN.
- **UNVERIFIED** — the inspected evidence cannot establish the claim.

`GOVERNED`, `INHERITED AUDIT EVIDENCE`, `rerun` and `GitHub live metadata` identify provenance; they do not upgrade a capability state.

Repository source proves what is committed. It does not by itself prove what is deployed, enabled, configured, reachable or functioning in production. A passing unit or proof script proves only its asserted local scope. Builder statements, PR descriptions and package prose were treated as claims until matched to source, test output or an accepted governance record.

## 2. Repository and roadmap state

- Live `refs/heads/main` resolved to `6e71a242cf9ae6b631c857c190146a0966c946da`; the same object was fetched as `origin/main`. **SOURCE EXISTS.**
- The baseline is the merge commit for PR #565, the documentation-only clarification of PR #562. Its direct parents are `f75cab7fd73b6be29ef79fdce427c26addb4c763` and approved PR head `9a85cdbab5b3de8a13f2805bd812e37f095d8497`. **SOURCE EXISTS / GitHub live metadata.**
- `docs/KIVO_AGENT_ROADMAP.md` remains the authoritative repository roadmap. This snapshot does not replace its decisions, blockers, execution order or history.
- `supabase/migrations/` contains 105 files: 103 SQL files, `0104_safety_ingress_evidence.APPLIED.md` and `README.md`. **SOURCE EXISTS.** This count is a repository inventory, not a live ledger measurement.
- Logical migration label `0105` remains reserved for `order_acceptance_contract_v1`; `0106` remains reserved and BLOCKED for the governed control-plane work; `0077` remains unapplied and unauthorized. **GOVERNED.**
- The roadmap retains pilot **NO-GO**, Egypt V1 as WhatsApp plus cash/COD only, and website and voice lanes as V2. Saudi commercial use remains subject to the roadmap's provenance/licence and legal-governance gates. **GOVERNED.**

## 3. PR state

Live GitHub metadata was checked on 9 August 2026.

| PR | Exact state at snapshot | Evidence-backed meaning |
|---|---|---|
| #562 | closed, merged, non-draft; head `643e4bffd0c36e285faff584595c1e14fe871699`; merge `f75cab7fd73b6be29ef79fdce427c26addb4c763`; base `8b734f145fc8b7b165139e2d8d8d8708adb1df93` | Revision 14 SELECT-only preflight results, founder Option A, PF-L1 and PF-R1 are now on `main`. |
| #565 | closed, merged, non-draft; head `9a85cdbab5b3de8a13f2805bd812e37f095d8497`; merge `6e71a242cf9ae6b631c857c190146a0966c946da`; base `f75cab7fd73b6be29ef79fdce427c26addb4c763` | Clarifies that the earlier execution denials covered Builder/documentation activity and do not negate the authorized auditor preflight. |
| #563 | open, draft, unmerged; head `c7bf4ee36aa4d567546c805bbad05fcf41030ea4`; 4 files, +946/−0 | Read-only Conversation Desktop prototype; held and not current `main` capability. |
| #564 | open, draft, unmerged; head `de4aea06a9002a27ff0fe44173fcd12a2cc2d462`; 1 documentation file, +963/−0 | Market-win strategy input, not implementation or production authority. |
| #350 | open, draft, unmerged; head `a35e21db804fca5b770298131af7e299a3250620`; 35 files, +50/−5,843 | CUTOVER-2 removal candidate explicitly held for R4; not current `main`. |

The only open PRs returned by the live repository search were #350, #563 and #564. No open PR is treated as merged source truth.

## 4. Capability matrix

| Capability | Current evidence-backed state | Primary evidence | Open boundary or blocker |
|---|---|---|---|
| WhatsApp ingress | Source path exists with tenant routing outcomes `per_tenant`, `env_fallback` and `drop`; 9/9 routing assertions passed. | `app/api/whatsapp/webhook/route.ts`; `lib/messaging/webhook-routing.ts`; **SOURCE EXISTS / AUTOMATED PROOF — rerun / PRODUCTION READ-BACK — inherited for 401** | `P0-WA-01` blocks pilot. Live end-to-end reply is unverified. |
| WhatsApp outbound | Text, interactive, image, audio and template paths exist with retry/capacity/media handling. | `lib/messaging/outbound.ts`; **SOURCE EXISTS** | Live delivery and tenant configuration are unverified. |
| Shared orchestration | HTTP and WhatsApp paths use the shared customer-turn orchestration. | `lib/ai/customer-turn.ts` (1,781 lines); `lib/messaging/respond-and-send.ts`; **SOURCE EXISTS** | Runtime deployment and live parity are unverified. |
| Menu grounding | Menu/search and menu-presentation source paths exist. | `lib/ai/customer-turn.ts`; `lib/ai/tools.ts`; menu APIs; **SOURCE EXISTS** | Full live tenant journey remains unverified. |
| Typed tools | Fifteen tool names are defined; package name `request_human` maps to source `escalate_to_human`; source uses `set_payment_method`, not `set_payment_choice`. | `lib/ai/tools.ts`; **SOURCE EXISTS** | A smaller package list is a target contract, not the current inventory. |
| Deterministic pricing | Pricing and money-guard source exists. The accepted audit reports 62/62 pricing assertions. | pricing modules and `scripts/test-order-pricing.test.ts`; **SOURCE EXISTS / INHERITED AUDIT EVIDENCE** | Fresh rerun could not start because installed dependencies lacked `server-only`; no pricing assertion ran in this work order. |
| Confirmation detector | Explicit-confirmation detector exists; 34/34 confirmation-gate assertions passed. | `lib/ai/order-confirm.ts`; `scripts/proof-confirm-gate.test.ts`; **SOURCE EXISTS / AUTOMATED PROOF — rerun** | Detector proof is not durable confirmation provenance. |
| Durable confirmation provenance | No version-bound, current-attempt durable provenance contract was found. | Repository search and accepted backlog; **ABSENT / INHERITED AUDIT EVIDENCE** | R1 remains blocked. |
| Order idempotency | Deterministic order UUID and duplicate guards exist; 21/21 proof assertions passed. | `lib/db/orders-create.ts`; `scripts/proof-dup-order.test.ts`; **SOURCE EXISTS / AUTOMATED PROOF — rerun** | Source explicitly says SELECT→INSERT is not fully atomic; R1b remains open. |
| Restaurant acceptance | Target contract and `0105` reservation are governed; no complete durable acceptance contract is implemented. | Roadmap; repository search; **DESIGNED / ABSENT** | R1/R1b/R1c and `P0-ORD-01`; `0105` is reserved, not assigned to an authorized migration file. |
| Allergen safety | Multi-module allergen/safety source exists; 78/78 allergen-gate assertions passed. | `lib/safety/`; `lib/ai/`; `scripts/test-allergen-gate.test.ts`; **SOURCE EXISTS / AUTOMATED PROOF — rerun** | End-to-end production path is unverified; `allergy_simple` precedence remains governed backlog. |
| Safety alerts | Persistence/routing source and migrations exist. | `lib/alerts/`; alert APIs; `0040_system_alerts.sql`; `0064_alert_routing.sql`; **SOURCE EXISTS / PRODUCTION READ-BACK — inherited for the dated 153-row count** | Acknowledgment identity and escalation remain absent/open; the alert lane blocks pilot. The count was not refreshed. |
| Human takeover | UI/API source exists, but current production claim functions are recorded absent. | console/claim routes; roadmap; **SOURCE EXISTS / PRODUCTION READ-BACK — inherited** | `KV-D06-001` / `P0-CTRL-01` remain OPEN and BLOCKING. |
| One-writer authority | Epoch/send-gate source is deploy-safe and inert when its prerequisites are unavailable. | `lib/messaging/send-gate.ts`; ownership source; **SOURCE EXISTS** | No complete one-writer proof; `0099` is prepare-only and control-plane work remains blocked. |
| Conversation Desktop | Prototype exists only in draft PR #563. | Live PR metadata and its exact head; **SOURCE EXISTS on unmerged head / GitHub live metadata** | Held, unmerged, read-only and not navigation-exposed. |
| Console/manual operation | Console-v2 and manager surfaces exist in source. | `app/console-v2/`; manager routes/pages; **SOURCE EXISTS** | Live proof is missing; complete manual-plus-agent operating contract has no accepted artefact. |
| Kitchen board | Read API source exists. | `app/api/handoff/board/route.ts`; **SOURCE EXISTS** | Live proof missing; package/roadmap V1 scope conflict remains unresolved. |
| Kitchen ticket | Feature is flag-gated and defaults OFF when absent. | feature-flag source and roadmap; **SOURCE EXISTS / GOVERNED** | V1 scope conflict unresolved; not production-proven. |
| Printer | `qz_print` schema/flag material exists and defaults OFF. | `0076_printer_config.sql`; flag source; **SOURCE EXISTS** | Settled outside V1; no V1 activation authorized. |
| Merchant onboarding | Twelve API route files plus manager onboarding UI exist; provisioning defaults to setup/inactive. | onboarding APIs and console page; **SOURCE EXISTS** | No live tenant journey proof; D5 allergen-preservation regression remains open. |
| Cash/COD payment | Egypt V1 cash/COD boundary is governed; atomic settlement/capture SQL source exists. | roadmap §3.2; `0092`/`0093`; **GOVERNED / SOURCE EXISTS / PRODUCTION READ-BACK — inherited for 115 `payment_unspecified` rows** | Production application and live settlement behavior are unverified in this work order. |
| Customer memory | API, memory and allergy-gate source exists. | `app/api/customer-memory/route.ts`; `lib/intelligence/customer-memory.ts`; `lib/ai/memory-allergy-gate.ts`; migration `0026`; **SOURCE EXISTS / PRODUCTION READ-BACK — inherited for the zero-row baseline** | Governed flag is absent/OFF; expiry, correction and per-field deletion are absent. Package/roadmap V1 scope conflict remains open. |
| Egyptian food encyclopedia | No Egyptian corpus or implementation was found; only Saudi knowledge/persona material exists. | `knowledge/ksa/`; `lib/ai/personas/ksa-encyclopedia.ts`; repository search; **ABSENT** | Roadmap V1 requirement conflicts with the package's post-pilot placement; founder scope disposition required. |
| Analytics and cost | Usage events, cost views, KPI and insights source exists. | `0095_usage_cost_events.sql`; `0096_cost_views.sql`; insights routes/pages; `lib/insights/order-kpis.ts`; **SOURCE EXISTS** | D6: cost views lack an evidenced `security_invoker` boundary; live grants/exposure are unverified. |
| Python target architecture | No Python service/backend target exists; the sole Python file is a voice scoring script. | `scripts/voice/score_bakeoff.py`; repository inventory; **ABSENT** | Exact target repository/commit/services/environments/access are not supplied. |
| TypeScript/Python parity | No parity suite or parity run exists. | Repository and package-evidence search; **ABSENT** | Cannot begin until the Python target is identified and governed. |
| Five-state ownership model | Current application transitions govern `AI_ACTIVE`, `HUMAN_ACTIVE`, `HUMAN_IDLE`, `SYSTEM_HOLD`, `CLOSED`; 37/37 tests passed. | `lib/db/ownership.ts`; `scripts/test-ownership-transitions.test.ts`; **SOURCE EXISTS / AUTOMATED PROOF — rerun** | This is the current model, not the approved target. |
| Seven-state ownership model | Founder-approved target adds `HOLD_UNCLAIMED` and `AI_RESUME_PENDING`; not implemented. | roadmap §3.3; **DESIGNED / GOVERNED** | `KV-D06-002` is OPEN, HARD PREREQUISITE and BLOCKING. This is the next separately scoped technical work. |

## 5. Agent orchestration and brain

`lib/ai/customer-turn.ts` is the shared TypeScript orchestration path and is called through `lib/messaging/respond-and-send.ts` by the WhatsApp webhook. The source includes menu grounding, typed tool dispatch, safety gates, draft/order handling and escalation behavior. This is **SOURCE EXISTS**, not proof of deployment or production traffic.

The package language describing a Python brain is target architecture. No Python runtime, service boundary, deployment manifest or parity harness for that target is present. The repository's only Python file, `scripts/voice/score_bakeoff.py`, does not supply such a backend.

## 6. Tools and deterministic authority

The current typed-tool inventory is 15 names: `send_item_photos`, `add_to_order`, `remove_from_order`, `set_fulfillment`, `set_delivery_address`, `get_order_summary`, `finalize_draft`, `clear_order`, `escalate_to_human`, `present_menu`, `present_quantity`, `present_order_actions`, `present_payment_methods`, `set_payment_method` and `resend_receipt`.

Tool names and source-level guards are not proof of durable authority. Pricing is implemented deterministically in source, but the 62/62 pricing result is **INHERITED AUDIT EVIDENCE** because this work order's fresh command stopped before assertions when `server-only` was unavailable. Confirmation detection, duplicate-order guards and safety tests were rerun successfully; their exact scopes are recorded in §21.

## 7. Merchant onboarding

The baseline contains exactly twelve files under `app/api/onboarding/`: `provision-tenant/route.ts`, `embedded-signup/route.ts`, `menu/ingest/route.ts`, `menu/draft/route.ts`, `menu/publish/route.ts`, `config/branches/route.ts`, `config/hours/route.ts`, `config/zones/route.ts`, `config/zones/[id]/route.ts`, `config/persona/route.ts`, `allergy-coverage/route.ts` and `go-live/route.ts`. The manager-console onboarding page and its separate test-drive API also exist. Provisioning creates safe defaults with `agent_mode='setup'` and `active=false`.

The menu chain is explicit in `0036_menu_draft.sql`, `0050_menu_publish_upsert.sql`, `0055_allergen_review_state.sql` and `0088_publish_menu_draft_lockdown.sql`. Calling onboarding simply “unfinished” is inaccurate at the source level: a substantial end-to-end source workflow exists. Production application, a complete live tenant journey and pilot readiness nevertheless remain unproven.

The server-side go-live route rechecks WhatsApp configuration, a published menu, business hours and a passing allergy test-drive within seven days; delivery zones are advisory. Client-supplied readiness is not authoritative. The fresh publish-lockdown proof passed 13/13 assertions, but it covers grants/auth and route-to-RPC behavior, not a full live merchant journey or allergen preservation.

The D5 discrepancy remains: `0055_allergen_review_state.sql` preserves prior allergens when a draft value is empty, while `0088_publish_menu_draft_lockdown.sql` restores an expression that can replace them with an empty list. No production query was run and no production impact is asserted here.

## 8. Control plane and ownership

The current application state machine is five-state. Founder Option A removes SA2 from the approved design and retains SA1—the proven EXECUTE-grant separation—as the sole service/system authority mechanism. No live roadmap text requires SA2.

The approved seven-state target adds `HOLD_UNCLAIMED` and `AI_RESUME_PENDING`, but `KV-D06-002` remains OPEN, a HARD PREREQUISITE and BLOCKING. `0099` is prepare-only; its ledger presence does not prove the required production functions exist. The roadmap continues to record six absent control-plane functions and broken claim routes. The send gate is intentionally inert if epoch/control prerequisites are absent. One-writer correctness therefore remains unproven.

## 9. WhatsApp

The source webhook validates and routes inbound WhatsApp events through the shared orchestration path. Fresh routing tests passed 9/9. A second ingress path under `app/api/brain/ingress/whatsapp` remains explicitly non-live and governed by `P0-SHADOW-01`.

The roadmap's accepted production evidence records callbacks rejected with 401, so `P0-WA-01` remains BLOCKING. This work order did not contact Meta, send a message or perform a live inbound-to-outbound proof.

## 10. Orders, confirmation and acceptance

The explicit-confirmation detector passed 34/34 fresh assertions. Deterministic IDs and duplicate guards passed 21/21. These do not establish durable current-version confirmation provenance, fully atomic order creation or exactly-once restaurant acceptance. `lib/db/orders-create.ts` explicitly documents that its SELECT→INSERT reorder guard is not fully atomic.

R1, R1b and R1c remain blocked within the governed sequence. `order_acceptance_contract_v1` retains logical label `0105`, but no migration specification, file or application is authorized by this snapshot.

## 11. Safety and alerts

The baseline contains the allergen and safety source stack, and its fresh local proof passed 78/78 assertions. Migration `0104_safety_ingress_evidence.sql` is frozen and has a repository application record; this work order made no live read-back, so the claim is **REPOSITORY APPLICATION RECORD**, not fresh production verification.

Alert persistence and routing source exists. The accepted roadmap records 153 alert rows at its audited baseline, but that live count was not refreshed. Acknowledgment identity and escalation remain absent/open, and the separated alert increment remains mandatory before pilot go-live.

## 12. Payments

The governing Egypt V1 boundary is cash/COD only. Source for atomic COD settlement/capture exists in migrations `0092` and `0093`; its current production application and behavior are **UNVERIFIED** here. The roadmap's inherited audit records 115 `payment_unspecified` events and an incomplete root-cause trace; R4A/R4 remain governed work. PSP payments and canonical payment methods remain outside V1.

## 13. Manual/agent UI

Console-v2, manager and operational surfaces are present in source, but their complete live operation is unverified. Human claim depends on the blocked control-plane functions. No accepted artefact defines the full manual-plus-agent one-truth operating contract.

PR #563 is an open draft read-only Conversation Desktop prototype. It is not on `main`, is not navigation-exposed, and authorizes no send, ownership, order, database, migration, flag or deployment behavior.

## 14. Kitchen/ticket/printer boundary

The kitchen-board API is built in source but has no live proof. `kitchen_ticket` is flag-gated and defaults OFF when absent. Both are roadmap V1 requirements but are excluded by the package V1 boundary, so the conflict is recorded and not resolved here.

Printer support (`qz_print` and migration `0076`) is settled outside V1. This snapshot does not activate it or change that boundary.

## 15. Data, analytics and observability

Usage-cost events, cost views, order KPIs and insights surfaces exist. D6 remains open because `0096_cost_views.sql` creates cost views without the `security_invoker` option demonstrated elsewhere in `0060`; current production ownership, grants and exposure were not queried.

Observability source and persisted alert structures do not prove complete live alert delivery, acknowledgment identity, escalation or one-writer behavior. All such production claims remain bounded by the roadmap's accepted dated evidence or marked **UNVERIFIED**.

## 16. Python/target-architecture status

The supplied package's Python design is a proposal, not the current repository architecture. No Python backend, service inventory, environment mapping, deployment target or parity harness was supplied or found. Python implementation and TypeScript/Python parity work are therefore blocked pending a separately governed target and evidence set.

No package-derived engineering is authorized by adopting this snapshot.

## 17. D5/D6 and other confirmed discrepancies

| ID | Confirmed discrepancy | Evidence boundary | Required governance |
|---|---|---|---|
| D5 | Later menu-publish SQL can undo the earlier allergen-preservation fix; current fresh lockdown proof does not assert preservation. | **SOURCE EXISTS**; production effect **UNVERIFIED** | Regression proof and governed remediation before relying on preservation. |
| D6 | Cost views lack evidenced `security_invoker`; production grants/ownership/exposure were not inspected here. | **SOURCE EXISTS**; production exposure **UNVERIFIED** | Separate read-only verification and, if required, governed remediation. |
| Control states | Application logic is five-state while founder-approved target is seven-state. | **SOURCE EXISTS / GOVERNED** | `KV-D06-002` implementation-and-proof work order. |
| Confirmation | Detector exists, but durable version-bound provenance is absent. | **SOURCE EXISTS** | R1 sequence. |
| Idempotency | Deterministic ID exists; SELECT→INSERT path is not fully atomic. | **SOURCE EXISTS** | R1b sequence. |
| Onboarding claim | Onboarding source is substantial, but no complete live tenant journey is proven. | **SOURCE EXISTS / UNVERIFIED live** | Evidence-backed end-to-end proof under separate authority. |
| Memory scope | Source exists but flag is absent/OFF and package versus roadmap V1 scope conflicts. | **SOURCE EXISTS / GOVERNED** | Founder/package governance; no silent inclusion. |
| Egyptian encyclopedia | Roadmap requires V1; package places it post-pilot; current source has no Egyptian corpus. | **ABSENT / GOVERNED conflict** | Founder/package governance plus separately scoped implementation if approved. |
| Kitchen scope | Roadmap requires board/ticket for V1 while package excludes them. | **GOVERNED conflict** | Founder scope disposition. |
| Production language | Several package statements conflate source, test, application record and live state. | Accepted claim ledger/audit | Preserve the evidence labels in §1; do not upgrade claims without live evidence. |

## 18. Active blocker sequence

This snapshot does not reorder, close or weaken any roadmap blocker. The governed sequence remains:

1. `KV-D06-001` / `P0-CTRL-01` implementation and evidence, beginning with the separately scoped seven-state application ownership work required by `KV-D06-002`.
2. `P0-MAINT-01` within the approved Revision 14 interleave.
3. Remaining `P0-CTRL-01` stages, then `P0-ORD-01` without weakening its Option B protected-state containment.
4. `P0-WA-01` and `P0-SHADOW-01` before pilot.
5. The governed E0/E1 safety increment and its successors.
6. Acceptance-chain work R0b, R1, R1b, R1c and R5; payment-truth work R4A/R4.
7. `P0-VOICE-01` after the safety-critical sequence and before pilot go-live, without authorizing voice or migration `0077`.
8. D5, D6, FLAG-01, K4 and every remaining V1 launch-state gate.

`KV-D06-001` and `P0-CTRL-01` remain OPEN and BLOCKING as governed. `P0-ORD-01` remains OPEN and BLOCKING. `0105` and `0106` remain reserved as governed; `0106` remains BLOCKED. Migration drafting remains blocked behind `KV-D06-002`. Pilot remains **NO-GO**.

## 19. Exact next authorized technical work

Because PR #562 and its PR #565 clarification are merged, the previously authorized SELECT-only preflight is no longer the next activity. The exact next technical work is a **separately scoped implementation-and-proof work order for the seven-state application ownership model**, adding `HOLD_UNCLAIMED` and `AI_RESUME_PENDING` to the application contract while satisfying `KV-D06-002`.

This statement does not itself authorize that implementation. It authorizes no SQL, migration specification, migration-number assignment, database access, production verification, deployment, Python work or package-derived engineering. Migration-specification drafting remains blocked until `KV-D06-002` is closed through its governed evidence path.

Package v1.3 correction, Python parity, migration specification, production verification and Linear Prompt B remain blocked pending independent audit and merge of this adoption candidate and their own explicit work orders.

## 20. Founder/package decisions still requiring governance

The accepted package-verification artefacts distinguish conversational approval, package prose, roadmap authority, implementation and production proof. This snapshot preserves those distinctions. A separate founder-decision delta register is required before any conversation-only commercial decision can become repository-governed truth.

| Decision or claim | Package / conversation status | Repository-governance status | Implementation / production status |
|---|---|---|---|
| Five New Cairo pilot restaurants | Present in package; recorded as conversation-approved in the accepted audit | Not adopted as a roadmap rollout commitment | No five-restaurant rollout proof; pilot remains NO-GO |
| Restaurant-owned drivers in V1 | Present in package; recorded as conversation-approved | Not adopted as a complete roadmap operating contract | No complete implementation or live proof |
| Kivo logistics in V2 | Present in package; recorded as conversation-approved | Broadly consistent with later-lane treatment, but exact commercial rule is not governed | No implementation or production proof |
| 60-day build target | Recorded as conversation-approved | Not a roadmap delivery authorization | No delivery proof |
| Month-three revenue target | Recorded as conversation-approved | Not a roadmap commitment | No revenue proof |
| 15/30/55 commercial split | Recorded as conversation-approved | Not governed in the roadmap | No implemented billing/commercial proof |
| Immediate signing value | Recorded as conversation-approved | Not governed as a product capability | No implementation or production proof |
| Manual/agent operating model | Package-present and recorded as conversation-approved | Human control is V1-governed, but the complete operating contract is absent | Partial source only; live one-truth operation unverified |
| Customer memory in V1 | Package places it post-pilot | Roadmap requires it for V1; current flag remains absent/OFF and lifecycle controls are incomplete | Source exists; audited data state and live behavior not refreshed |
| Egyptian food encyclopedia in V1 | Package places it post-pilot | Roadmap requires it for V1 | Absent from current source |
| Kitchen board/ticket in V1 | Package excludes it | Roadmap requires it | Board source exists; ticket OFF; live proof absent |

These entries require founder/PM governance before they can change scope or create engineering authority. This document does not resolve them.

## 21. Evidence appendix with commit, files, tests and limitations

### Repository and artefact pins

- Baseline commit: `6e71a242cf9ae6b631c857c190146a0966c946da`.
- Roadmap baseline: Git blob `8565adeb13deaf361d3bec90a08224e222fe60d9`; SHA-256 `9500aa8806c615a38a25d84728e745f2762a961c28f3e45ffae1e3da1c6b8e6f`; 132,371 bytes; 1,845 lines.
- Source draft: SHA-256 `337671f0eb8e8c43eeebc880ff843c8813b93d939005a489798614fda20ca8ea`; 8,618 bytes; 82 lines.
- Accepted package verification audit: `KIVO_PACKAGE_VERIFICATION_AUDIT.md`, SHA-256 `9dfc0ea47e9aa24c9b71a8240c66fe860930ef0094d19c7c08d3567f08d363ef`; 44,929 bytes; 301 lines.
- Accepted claim-evidence ledger: `KIVO_PACKAGE_CLAIM_EVIDENCE_LEDGER.xlsx`, SHA-256 `a9ce1606ecec2e102141390a9beaefaf926f689e8c62ac9013e74d65f4ef6168`; 27,549 bytes; 91 claim rows.
- Accepted correction backlog: `KIVO_PACKAGE_CORRECTION_BACKLOG.xlsx`, SHA-256 `a8d198281288a1006b71b4400a12af94ef408ce45e897c13dcf27207ea80a29e`; 14,700 bytes; 29 rows; zero rows marked READY at inspection.
- PR #562 approved head: `643e4bffd0c36e285faff584595c1e14fe871699`; merge: `f75cab7fd73b6be29ef79fdce427c26addb4c763`.
- PR #565 approved head: `9a85cdbab5b3de8a13f2805bd812e37f095d8497`; merge/current baseline: `6e71a242cf9ae6b631c857c190146a0966c946da`.

### Fresh local test results

`git diff --name-status 8b734f145fc8b7b165139e2d8d8d8708adb1df93 6e71a242cf9ae6b631c857c190146a0966c946da` returned only `M docs/KIVO_AGENT_ROADMAP.md`. The same comparison restricted to `app/`, `lib/` and `scripts/` returned empty. The source and test files used below are therefore byte-identical between the 9 August package-audit baseline and this snapshot baseline.

| Command | Exact result |
|---|---|
| `node --experimental-strip-types scripts/test-ownership-transitions.test.ts` | PASS — 37/37 |
| `node --experimental-strip-types scripts/test-webhook-routing.test.ts` | PASS — 9/9 |
| `node --conditions=react-server --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/proof-dup-order.test.ts` | PASS — 21/21 |
| `node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types scripts/proof-confirm-gate.test.ts` | PASS — 34/34 |
| `node --experimental-strip-types scripts/proof-security-1-publish-lockdown.test.ts` | PASS — 13/13 |
| `node --experimental-strip-types scripts/test-allergen-gate.test.ts` | PASS — 78/78 |
| `node --conditions=react-server --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/test-order-pricing.test.ts` | NOT RUN — loader stopped with `ERR_MODULE_NOT_FOUND` for `server-only`; zero assertions executed |

Fresh passing total: six suites and 192 assertions. Node emitted module-type warnings in several suites; no passing assertion was suppressed. The 62/62 pricing result remains **INHERITED AUDIT EVIDENCE**, not a fresh result.

### Preflight evidence and limitations inherited from merged governance

The Revision 14 preflight evidence predates PR #562 and records exactly 17 SELECT-only statements with zero SQL execution errors. It supports PF20, PF-L1, PF-R1 and the database half of the A1-reader sweep. The repository half was independently reproduced against its governed source baseline. The adopted redacted transcript is SHA-256 `0e24933a102073adf055746ddfe1594b7b2a244d3db323b52fb0216429c781cd`, 31,738 bytes, 482 lines; its manifest is SHA-256 `e5021e43973d6da00e0d2329ad4f20540ba8ad18b762a6ff1d4c3c27bd43f005`, 3,789 bytes, 94 lines. The private unredacted source is preserved by KIVO-AUDITOR.

Limitations must remain explicit:

1. No explicit read-only database transaction was opened; read-only character is evidenced by statement text and tool inventory, not transaction-level attestation.
2. VP-1 did not produce positive service-role-path evidence and remained BLOCKED; Option A made it unnecessary for the approved design.
3. Edge Function `oneoff-invite-fares` was enumerated but its source was not inspected.
4. Repository and database evidence came from separate read-only inspection paths.
5. PF20 temporal evidence is a strong negative indicator, not proof of zero historical failures.
6. No production, database, Supabase, Vercel, Meta or deployment access occurred in this adoption work order.

### Adoption boundary

This candidate changes documentation only. It closes no blocker, assigns no migration, authorizes no implementation, and does not alter Egypt V1 or Saudi scope. Builder handback is not clearance. Adoption requires independent audit and founder merge authority; this document has no governance effect until both occur. Pilot remains **NO-GO**.
