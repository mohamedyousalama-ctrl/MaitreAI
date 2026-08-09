# KIVO Founder Decision Delta Register — Narrowed Egypt V1 — 9 August 2026

**Status:** Founder scope/governance decision register. ACTIVATES ON AUDITED MERGE — it becomes the governing record of the 9 August 2026 founder scope decision when the pull request carrying it is independently cleared by KIVO-AUDITOR and merged to `main`.<br>
**Register date:** 9 August 2026<br>
**Repository baseline:** `main` at `55ed2994f9941dce2b00351bbd3f1cf8f01767aa` (merge of PR #566)<br>
**Companion snapshot:** [`docs/KIVO_STATE_01.md`](./KIVO_STATE_01.md) — accepted evidence at Git blob `018acf45248ea45c41bd3f2225dcea42553a8424`; it is an evidence record, not implementation authority, and is unchanged by this register<br>
**Authoritative roadmap:** [`docs/KIVO_AGENT_ROADMAP.md`](./KIVO_AGENT_ROADMAP.md) — remains the single authoritative roadmap; this register is adopted into it by the same Git change<br>
**Pilot:** **NO-GO**

## 1. Purpose

KIVO_STATE-01 §20 records founder/package decisions that existed only in conversation and accepted package evidence, and states that a separate founder-decision delta register is required before any conversation-only commercial decision can become repository-governed truth. This document is that register. It resolves every §20 item with an explicit disposition and distinguishes, for every row:

1. **founder-approved product intent** — what the founder has decided the product should be;
2. **roadmap adoption state** — what this register, once audited and merged, makes repository-governed;
3. **source/implementation evidence** — what exists in the repository, using the KIVO_STATE-01 evidence states;
4. **production/pilot evidence** — what is proven live;
5. **remaining gate or decision** — what must still happen.

**Adoption of intent is not proof of anything else.** For every row in this register, adoption of the founder-approved intent into repository governance does not prove implementation, deployment, production operation, pilot success or scale. Evidence states never upgrade because scope is decided.

## 2. The founder decision — recorded verbatim

> **APPROVE NARROWED EGYPT V1 — Kivo V1 is Karim's controlled WhatsApp order vertical slice for busy SMB and medium restaurants with one branch or a maximum of two to three branches: manage Egyptian-Arabic customer conversations, build a grounded structured order with deterministic menu and price truth, obtain explicit current-version customer confirmation, obtain restaurant acceptance or rejection, and produce exactly one versioned correct-branch printed kitchen ticket. The initial controlled pilot is five New Cairo restaurants using their own drivers and cash/COD only. Merchant onboarding, minimal manual/agent control, safety, tenant isolation, idempotency, printer reliability, audit, monitoring and rollback are necessary V1 enablers—not expansion into a full restaurant operating system. Kivo logistics, driver application, tracking, full KDS, online payments, website/voice ordering, campaigns/loyalty, deep POS/ERP integration, Saudi activation and large-chain support are deferred.**

### 2.1 Bounded meaning of "full power"

"Full power" means complete authority inside this explicitly bounded and governed order flow. It does **not** authorize:

- unrestricted model actions of any kind;
- invented prices, items, availability or totals — menu and price truth remain deterministic application/database facts (roadmap §6.1);
- customer confirmation by inference — confirmation must be explicit and bound to the current order version;
- restaurant acceptance by inference — acceptance/rejection must be an authoritative server/database transition;
- uncontrolled printing — printing is governed, deduplicated and audited under the required printer architecture ADR (§4 row 9);
- model authority over money state, order state, tenancy boundaries, safety behavior or the print path;
- production access of any kind;
- any V2 or deferred capability.

This bounding creates no new model authority. Every constitution rule in roadmap §6 continues to apply unchanged.

## 3. What this register does and does not do

**It does:** record the founder decision above as repository-governed scope; resolve the KIVO_STATE-01 §20 conversation-only items with the dispositions in §4 and §5; and require the roadmap adoption record carried in the same Git change.

**It does not:** authorize any code, SQL, migration specification, migration numbering or label, database or Supabase access, deployment, Vercel action, Meta/WhatsApp configuration, printer selection/installation/testing, production verification, package v1.3 finalization or re-audit, Python work or parity claims, Linear Prompt B, or pilot launch. It closes, reorders or weakens no blocker. `KV-D06-001`, `P0-CTRL-01`, `KV-D06-002`, `P0-ORD-01`, `P0-WA-01`, the safety gates and every other open blocker remain exactly as governed. `0105` and `0106` remain reserved as governed; `0106` remains BLOCKED; `0077` remains unapplied and unauthorized. Migration drafting remains blocked behind `KV-D06-002`. The next separately scoped technical work remains the seven-state application ownership implementation-and-proof work required by `KV-D06-002`; it is not performed or altered here. Pilot remains **NO-GO**.

## 4. Governed V1 decisions

Each row resolves the corresponding scope question. Evidence states are those defined in KIVO_STATE-01 §1. They are quoted from that accepted snapshot, taken at `main` `6e71a242cf9ae6b631c857c190146a0966c946da`, and remain valid at this register's `55ed2994f9941dce2b00351bbd3f1cf8f01767aa` baseline because the only intervening change, the PR #566 merge, modified documentation only. None is upgraded by this register.

| # | Decision | Founder-approved product intent | Roadmap adoption state (on audited merge) | Source/implementation evidence | Production/pilot evidence | Remaining gate or decision |
|---:|---|---|---|---|---|---|
| 1 | Market and area | Egypt V1; initial area is New Cairo | ADOPTED as governed V1 scope | Egyptian-Arabic conversation source exists (SOURCE EXISTS); no New-Cairo-specific artefact exists or is required | None; no pilot has run | All pilot gates; pilot remains NO-GO |
| 2 | ICP | Busy SMB and medium restaurants; one branch or a maximum of two to three branches; large chains excluded | ADOPTED as governed V1 ICP; large-chain support DEFERRED | Multi-tenant and branch source exists (SOURCE EXISTS); no ICP-specific enforcement artefact exists or is required | None | Merchant qualification during onboarding; no engineering gate created |
| 3 | Pilot cohort | Five New Cairo restaurants. Backup restaurants may be qualified but are **not** pilot participants unless formally substituted for a named participant | ADOPTED as governed pilot definition | Onboarding source exists (SOURCE EXISTS, twelve API routes plus console UI per KIVO_STATE-01 §7) | No live tenant journey proven; no restaurant signed into the pilot by this register | Restaurant qualification, signing, onboarding evidence and every pilot gate |
| 4 | Delivery boundary | Restaurants use their own drivers. Kivo logistics, driver application/marketplace and tracking are V2 | ADOPTED; Kivo logistics/driver app/tracking DEFERRED to V2 | No Kivo driver-marketplace implementation exists (consistent with roadmap §4.3) | None | A separately governed V2 decision before any logistics work |
| 5 | Payment boundary | Cash/COD only. Online/card/wallet/Apple Pay/PSP are deferred | ADOPTED; reconfirms the 26 Jul 2026 cash/COD-only ruling (roadmap §3.2); online payments DEFERRED | COD settlement/capture SQL source exists (`0092`/`0093`, SOURCE EXISTS); server-enforced cash-only (R4A) not started | Production application and live settlement behavior UNVERIFIED; 115 `payment_unspecified` events remain untraced | R4A/R4 payment-truth work; the money go-live gates |
| 6 | Core product | Egyptian-Arabic WhatsApp conversation → grounded structured order → explicit current-version customer confirmation → restaurant acceptance/rejection → exactly one versioned correct-branch printed kitchen ticket | ADOPTED as the V1 vertical slice | Conversation, orchestration, menu grounding, confirmation detector and idempotency source exist (SOURCE EXISTS / AUTOMATED PROOF per KIVO_STATE-01 §4); durable confirmation provenance ABSENT; durable acceptance contract DESIGNED/ABSENT; printed ticket not implemented for V1 (see row 9) | End-to-end live proof absent; WhatsApp ingress blocked by `P0-WA-01` (HTTP 401) | R0b/R1/R1b/R1c/R5 acceptance chain; `P0-WA-01`; printer ADR; the complete live proof |
| 7 | Manual/agent model | A minimal shared-truth operator control is a V1 enabler. A broad restaurant OS is **not** V1 | ADOPTED; "minimal" bounds V1 operator scope | Console-v2 and manager surfaces exist (SOURCE EXISTS); operator claim is broken in production; six control-plane functions absent | Claim routes fail live (`KV-D06-001` / `P0-CTRL-01` CRITICAL, OPEN, BLOCKING) | `KV-D06-001` / `P0-CTRL-01` secure control plane, beginning with `KV-D06-002` seven-state ownership work |
| 8 | Kitchen boundary | The printed kitchen ticket outcome is V1. A full kitchen board/KDS is deferred. The "ticket contract" must not be conflated with a full KDS | ADOPTED; resolves the KIVO_STATE-01 §17 kitchen-scope conflict: ticket outcome IN, full KDS DEFERRED | Kitchen-board read API exists (SOURCE EXISTS) but is not a V1 requirement under this decision; `kitchen_ticket` is flag-gated and defaults OFF | No live kitchen proof | Printer architecture ADR (row 9); ticket generation proof before pilot |
| 9 | Printer boundary | Reliable printing is V1. The technical mechanism is **not selected** by this decision | ADOPTED as a required V1 outcome with the mechanism ADR-GATED: a printer architecture ADR is required covering QZ Print versus other safe mechanisms, branch routing, printer health, retry, duplicate suppression and controlled reprint | `qz_print` schema/flag material exists (`0076_printer_config.sql`, SOURCE EXISTS) and defaults OFF; it is prior evidence, not a selected mechanism | None; no printer is installed, selected or tested | The printer architecture ADR, then separately authorized implementation and proof; no printer action is authorized by this register |
| 10 | Onboarding | Merchant configuration and go-live evidence for the five pilot restaurants are V1 enablers | ADOPTED | Twelve onboarding API routes plus manager UI exist (SOURCE EXISTS); D5 allergen-preservation regression remains open | No complete live tenant journey proven | D5 resolution; evidence-backed end-to-end onboarding proof under separate authority |
| 11 | Safety and control | Tenant isolation, deterministic money/order state, one-writer behavior, safety escalation, idempotency/outbox, audit, monitoring and rollback remain mandatory | ADOPTED; nothing is weakened | Safety/allergen source exists with passing local proofs (SOURCE EXISTS / AUTOMATED PROOF); one-writer, alert delivery and escalation remain unproven | Alert lane, acknowledgment identity, escalation and one-writer behavior unproven; all remain PILOT BLOCKING | E0/E1 increment, separated alert lane, R5, isolation attack suite and all §10 gates |
| 12 | Memory | Customer memory is **deferred** unless a later, separately governed decision adds the minimum necessary bounded memory. Existing source is not activation authority | ADOPTED; resolves the KIVO_STATE-01 §17/§20 memory conflict: the 26 Jul 2026 "memory in V1" classification is superseded — memory is now DEFERRED for V1 | Memory source exists (SOURCE EXISTS); governed flag absent/OFF; expiry, correction and per-field deletion ABSENT | Zero rows platform-wide at the audited baseline | A separate governed founder decision before any bounded-memory activation; source existence confers no authority |
| 13 | Egyptian food knowledge | Egyptian-Arabic interaction is required. A separate broad "Egyptian food encyclopedia" product is **deferred**. Menu-grounded restaurant-specific knowledge remains required | ADOPTED; resolves the KIVO_STATE-01 §17/§20 encyclopedia conflict: the 26 Jul 2026 "Egyptian encyclopedia in V1" requirement is superseded — the encyclopedia product is DEFERRED; Egyptian-Arabic interaction and menu grounding stay V1 | Egyptian-Arabic conversation and menu-grounding source exist (SOURCE EXISTS); no Egyptian corpus exists (ABSENT) — now consistent with scope | None | None for the deferred encyclopedia; menu-grounded behavior must be proven through the existing V1 gates, which this register leaves unchanged. |
| 14 | Other deferred scope | Website/voice ordering, autonomous campaigns/loyalty/growth actions, deep POS/ERP integration and Saudi/Khalid commercial activation are deferred | ADOPTED; consistent with roadmap §3.2 (website/voice V2), §3.2.2 (KSA corpus ruling) and §4.3 | Various source exists for some items (e.g. voice, KSA persona) and remains OFF/excluded | None | Each requires its own separately governed decision; `P0-VOICE-01` hygiene repair remains open and unchanged |

## 5. Commercial and scheduling dispositions

| # | Decision | Founder-approved intent | Roadmap adoption state (on audited merge) | Source/implementation evidence | Production/pilot evidence | Remaining gate or decision |
|---:|---|---|---|---|---|---|
| 15 | Pilot timing | Planning target: controlled pilot start on **12 October 2026**, conditional on **every** gate. It is not authority to bypass any gate; delay moves the date rather than deleting tests, audit or UAT | ADOPTED as a gate-dependent planning forecast, not a commitment or launch authorization | Not applicable — a date has no source artefact | None; pilot remains NO-GO | Every §10 go-live gate; independent audit; founder go decision |
| 16 | Pilot duration | One month of governed real operation: 12 October – 8 November 2026 if launch occurs on target; review 9–13 November 2026 | ADOPTED as the governed pilot window definition, dates conditional on row 15 | Not applicable | None | Pilot launch (row 15) must occur first |
| 17 | Revenue objective | Revenue begins within the first three months where a valid signed agreement permits. This is a business goal, **not** proof of product readiness or of recurring revenue | ADOPTED as a business objective only | Not applicable | No revenue proof exists | Signed agreements with correct legal wording; product gates are unaffected by the objective |
| 18 | 15/30/55 schedule | Founder-approved commercial policy: 15% at signing, 30% after the first trial month, remaining 55% after the following month — subject to correct contract/legal wording | ADOPTED as commercial policy only; it must **not** be represented as implemented billing | No billing implementation exists for this schedule | None | Contract/legal wording review; any billing implementation is separate, ungoverned-here work |
| 19 | Immediate signing value | Each qualified signed restaurant receives a restaurant Order Readiness Blueprint / workflow analysis. This must **not** be represented as software already live | ADOPTED as a commercial deliverable definition | Not a software artefact; nothing in the repository implements or needs to implement it | None | Delivery of each blueprint is a commercial obligation outside repository scope |

## 6. Relationship to prior governed decisions

- The 26 Jul 2026 decision "APPROVE ALL — V1 is WhatsApp and cash/COD only" (roadmap §3.2) remains the recorded historical decision. This register **narrows** the V1 capability set inside that boundary: WhatsApp-only and cash/COD-only are reconfirmed (rows 5, 6); customer memory and the Egyptian food encyclopedia move from V1-required to deferred (rows 12, 13); the kitchen scope is settled as printed-ticket-in, full-KDS-deferred (row 8); and printing moves from "settled outside V1" to "required V1 outcome, mechanism ADR-gated" (row 9). The historical §3.2 text, its flag-disposition table and the imported audited readiness inventory are preserved byte-unchanged as history; the roadmap adoption record carried with this register states which V1-scope classifications are superseded.
- The 27 Jul 2026 Revision 14 approvals, Option A, the signed six-clause addendum, PF-L1, PF-R1 and every §3.3 record are unchanged.
- KIVO_STATE-01 remains accepted evidence, byte-identical, and is not rewritten to simulate a new snapshot; its §20 table is resolved by this register, not by editing that document.

## 7. Pilot status

Pilot remains **NO-GO**. Nothing in this register changes any go-live gate, and the 12 October 2026 target in row 15 is a forecast that every gate can move.
