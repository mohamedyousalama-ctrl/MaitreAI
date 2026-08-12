# Kivo Agent — living work-order backlog

**Status:** CANDIDATE — activates on the independently audited merge of the pull request that adds it<br>
**Created:** 10 August 2026<br>
**Scope:** the operational execution queue for all Karim V1 engineering work<br>
**Pilot:** **NO-GO**

---

## 1. Governance rules

1. **The roadmap remains authoritative** for governance and historical truth.
   [`docs/KIVO_AGENT_ROADMAP.md`](./KIVO_AGENT_ROADMAP.md) decides scope, blockers, execution
   order and history. This backlog never overrides it.
2. **This backlog is the current executable queue** — what may be worked next, by whom, against
   which evidence. It is an operational view, not a second source of governance truth.
3. **Every implementation PR updates both the backlog and the roadmap in the same change.** A
   state change landed in one without the other is not governed.
4. **No row advances on Builder assertion alone.** Every forward transition needs the evidence
   named in its own row.
5. **Status sequence:**
   `PLANNED → APPROVED → IN PROGRESS → BUILT / AUDIT PENDING → AUDIT CLEARED / MERGE PENDING → MERGED → VERIFIED COMPLETE`
6. **`BLOCKED` and `DEFERRED` are explicit states, not comments.** A row that cannot proceed
   carries the state and names what unblocks it.
7. **Every row carries owner, dependency, evidence required, branch/PR/head, current state and
   next action.** A row missing any of these is not ready to be worked.
8. **Corrections preserve rejected heads.** A correction is a normal commit whose direct parent is
   the rejected head — never an amend, rebase or force-push.
9. **No task may infer production authority from a source merge.** Merging source proves the
   repository changed. It proves nothing about production, deployment, the database or the pilot.

---

## 2. Ordered rows

| ID | Work | Owner | Dependency | Evidence required | Branch / PR / head | State | Next action |
|---|---|---|---|---|---|---|---|
| `AGENT-WO-001` | Seven-state application ownership model (`KV-D06-002`) | KIVO-BUILDER | PR #568 verified merge; `WO-ENG-KVD06-002-SEVEN-STATE-APPLICATION-MODEL-001` | Focused ownership suite, cross-module parity proof, control proof, TypeScript, lint, build and full unit suite — all from the final committed tree | `feat/kvd06-seven-state-app-model-20260809`; draft PR and exact head recorded in the PR body and Builder handback | **BUILT / AUDIT PENDING** | Handoff order on the corrected immutable head: Builder handback → KIVO V1 PRODUCT & ENGINEERING QUALITY LEAD re-gate → only if accepted, KIVO-AUDITOR exact-head review |
| `AGENT-WO-002` | M-0–M-4 additive control-plane specification and proof design | KIVO-PM | Verified completion of `AGENT-WO-001`; separate founder work order | Frozen specification `WO-SPEC-KVD06-M0-M4-ADDITIVE-CONTROL-PLANE-001` at SHA-256 `61f9d74378f60b025112f6e98455b168067e66b9f2caa545f57dc74c491a4364` (9,819 bytes), accepted at the Product & Engineering Quality Gate and independently cleared by KIVO-AUDITOR; binding adjudication at SHA-256 `8eb016e5bfd583310bd8627b0eb6108049bdea240ce1c0f8283ef648c5df3a9e` (11,034 bytes); both held byte-identically under `docs/governance/` | `docs/kvd06-m0m4-spec-custody-queue-20260811`; custody PR merged and merge-verified into `main`; exact merge commit recorded in the roadmap history | **VERIFIED COMPLETE** | None — durable specification custody and queue governance are established. This completion establishes custody and governance only and grants no production, database, deployment or pilot authority |
| `AGENT-WO-002A` | Pre-maintenance control-plane implementation and proof: `M-0` → `M-1` → `M-2` → `R-3` → `R-4` | KIVO-BUILDER | Verified completion of `AGENT-WO-002` — **met**; founder-approved implementation WO — **exists**; all stage-specific entry gates | The exact independently cleared proof obligations from the frozen specification, with disposable-PostgreSQL-only destructive and failure-injection proofs where specified. **Stage status.** `KIV-11` / `CTRL-02` PF5/PF6 entry evidence is independently accepted, so the M-0 entry gate is satisfied. `M-0` is **built as a candidate** carrying the authorized migration candidate `supabase/migrations/0107_kiv12_m0_constraint_prestage.sql` with a Builder local disposable-PostgreSQL proof of 46 / 46 PASS — Builder evidence only, **BUILT / QUALITY CORRECTION PENDING** — not accepted, not merged, not applied and not production-deployed. Automatic Vercel Preview deployment(s) occurred for PR #571; these are non-production preview deployments and did not constitute production deployment or production database application of `0107`. Production deployments, production DB access, production queries, writes, DDL and remediation are all ZERO. Primary proof evidence is custodied at `scripts/proof-kiv12-m0-disposable-pg.py` and `docs/governance/KIV-12_M0_DISPOSABLE_PG_PROOF_2026-08-12.txt`, supplied for independent Quality verification. `M-1` has **not started**. `R-3` remains separately blocked by its governed prerequisites — the adjudicated L-A disposition evidence gate and `P0-VOICE-01` | `feat/kiv12-m0-constraint-prestage`; draft M-0 PR and exact head recorded in the PR body and Builder handback | **IN PROGRESS** | Independent KIVO V1 PRODUCT & ENGINEERING QUALITY LEAD exact-head review of the `KIV-12` M-0 candidate. `M-1` must not begin until that verdict is accepted and PM processes it. R-3 additionally remains blocked until the adjudicated L-A disposition evidence gate is independently accepted and `P0-VOICE-01` is complete |
| `AGENT-WO-003` | `P0-MAINT-01` interleave and production-maintenance proof | KIVO-PM | Verified completion of `AGENT-WO-002A`; its own governed entry conditions; separate founder work order | Reversible block, drain, read-back and restore mechanism proven | not started | **BLOCKED** | Wait for governed entry conditions |
| `AGENT-WO-004` | M-5–M-9 mutating control-plane implementation and proof | KIVO-BUILDER | `AGENT-WO-002` and `AGENT-WO-003`; separate founder / production authority | Real-PostgreSQL proofs plus the six PF-R1 read-backs at M-5 | not started | **BLOCKED** | Wait for both predecessors and explicit production authority |
| `AGENT-WO-005` | Durable current-version customer confirmation and restaurant acceptance | KIVO-BUILDER | Control plane accepted; separate work order | Durable cutover record, provenance-bound acceptance, real-database proofs | not started | **BLOCKED** | Wait for control-plane acceptance |
| `AGENT-WO-006` | WhatsApp ingress and outbound live repair and proof | KIVO-PM + founder | Meta/WhatsApp human prerequisites plus a separate work order | Production webhook 200, one persisted message, one reply, zero new `invalid_signature` over the observation window | not started | **BLOCKED** | Wait for the human Meta/WhatsApp prerequisites |
| `AGENT-WO-007` | Safety ingress, E0/E1 and alert-lane proof | KIVO-BUILDER | Governed safety dependencies | E0 real-PostgreSQL verification, E1 acknowledgment and escalation, alert-lane delivery proof | not started | **BLOCKED** | Wait for the governed safety dependencies |
| `AGENT-WO-008` | Existing Karim brain / intelligence inventory | KIVO-BUILDER | Read-only source work; separate approved work order | A source-verified inventory with explicit evidence classes | not started | **PLANNED** | Request the approving work order |
| `AGENT-WO-009` | Egyptian Arabic golden-scenario corpus | KIVO V1 PRODUCT & ENGINEERING QUALITY LEAD | `AGENT-WO-008` inventory plus founder-reviewed expected behaviour | Reviewed scenarios with expected behaviour signed off | not started | **PLANNED** | Request the approving work order |
| `AGENT-WO-010` | Karim behaviour remediation: conversation, order, sales, CS and escalation | KIVO-BUILDER | Golden scenarios; separately sliced work orders | Per-slice regression proof against the golden corpus | not started | **BLOCKED** | Wait for `AGENT-WO-009` |
| `AGENT-WO-011` | Printer ADR and deterministic correct-branch print proof | KIVO-PM | Order truth stable; separate work order | Approved ADR plus a deterministic correct-branch print proof | not started | **BLOCKED** | Wait for stable order truth; no mechanism may be selected before the ADR |
| `AGENT-WO-012` | End-to-end Karim V1 pilot-readiness proof | KIVO-PM + founder | All mandatory V1 gates | The complete live proof named in the roadmap go-live gates | not started | **BLOCKED** | Wait for every mandatory V1 gate |

**Parallel preparation.** `AGENT-WO-008` and `AGENT-WO-009` may be prepared **in parallel only when
their own work orders are approved**. They may **not** bypass the blocking runtime sequence: no
amount of inventory or corpus preparation advances `AGENT-WO-002` through `AGENT-WO-007`, and
neither row grants authority to change runtime behaviour.

---

## 3. Self-transition rule for the `AGENT-WO-001` pull request

This rule is the whole lifecycle of the current PR, written down in advance so no step depends on
a later judgement call:

- **While the PR is open:** `AGENT-WO-001` is **`BUILT / AUDIT PENDING`** and **`KV-D06-002`
  remains OPEN**. The PR being open, passing or persuasive changes nothing.
- **After independent clearance of the exact head:** `AGENT-WO-001` becomes
  **`AUDIT CLEARED / MERGE PENDING`** — **without altering the source**. Any push after clearance
  voids that clearance and the row returns to `BUILT / AUDIT PENDING`.
- **Upon founder merge and independent merge verification:** `AGENT-WO-001` becomes
  **`VERIFIED COMPLETE`** and the application-model obligation **`KV-D06-002` closes
  automatically**, with no further documentation amendment required.
- **That closure only makes the next separately scoped specification eligible.** It does **not**
  authorize SQL, migration-specification drafting, a migration label, database access or any
  production action.

### Self-transition rule for the `AGENT-WO-002` specification-custody pull request

- **While open after exact-head clearance:** `AGENT-WO-002` is **`AUDIT CLEARED / MERGE PENDING`**.
- **After Quality acceptance, KIVO-AUDITOR exact-head clearance, founder merge and independent merge
  verification:** `AGENT-WO-002` becomes **`VERIFIED COMPLETE`**.
- **That transition establishes durable specification custody and queue governance only.**
- It does **not** authorize `AGENT-WO-002A`, SQL, migration drafting, a migration label, production
  access, `P0-MAINT-01`, M-5+ or any pilot action.

---

## 4. Boundary

This backlog is documentation. It authorizes no code, SQL, migration, migration label, database or
Supabase access, deployment, Meta or Vercel action, printer installation or pilot launch. It closes
no blocker and changes no roadmap decision, reservation or execution order. `0105` remains
reserved, `0106` remains reserved and **BLOCKED**, and `0077` remains unapplied and unauthorized.
Pilot remains **NO-GO**.
