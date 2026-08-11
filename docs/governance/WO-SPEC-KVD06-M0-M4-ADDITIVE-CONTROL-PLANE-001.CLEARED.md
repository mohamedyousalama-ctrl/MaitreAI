# QUALITY RE-GATE REQUEST
## `WO-SPEC-KVD06-M0-M4-ADDITIVE-CONTROL-PLANE-001`

Re-perform the Product & Engineering Quality Gate on the corrected PM specification/proof-design candidate below. Your prior verdict was `QUALITY GATE REJECTED / BLOCKED` on four findings. This revision incorporates the binding escalation ruling for Findings 1–2 and PM corrections for Findings 3–4. No implementation, SQL, migration, repository mutation, database access, deployment or production action is authorized.

### 1. Stage interpretation remains unchanged

The WO/backlog name `M-0–M-4` denotes the governed **pre-maintenance half**. The binding Revision 14 stage identities remain:

`M-0 CONSTRAINT PRE-STAGE — NOT ADDITIVE → M-1 ADDITIVE → M-2 AUDIT-BRIDGE REPAIR — NOT ADDITIVE → R-3 APPLICATION DEPLOYMENT, DUAL-PATH → R-4 SOAK`.

`P0-MAINT-01` and M-5+ remain separately governed later work.

### 2. CORRECTION 1 — R-3 / L-A claimability

The merged PR #569 canonical application model is authoritative for application claimability. `CLAIMABLE_FROM` remains exactly:

- `AI_ACTIVE`
- `HOLD_UNCLAIMED`
- `HUMAN_IDLE`
- `SYSTEM_HOLD`

`HUMAN_ACTIVE` is not a claimable source. `HUMAN_ACTIVE` succeeds through `canClaim` only when already assigned to the claiming member. Unassigned `HUMAN_ACTIVE` is not claimable.

The binding adjudication therefore narrowly supersedes Revision 14 §7.1 D7, its declared `canClaim` divergence, the L-A phrase “PRESERVE and CLAIMABLE,” and the R-3 requirement to widen `canClaim`, **only to that extent**. No other Revision 14 contract is superseded.

Before R-3, a **separately approved** legacy-row maintenance/disposition WO must contemporaneously inspect every row matching:

`ownership_state = 'HUMAN_ACTIVE' AND assigned_member_id IS NULL`

Historical count `4` is not an execution invariant.

For a row still representing an unclaimed, non-safety human escalation, the required normalized result is:

`ownership_state = 'HOLD_UNCLAIMED'`  
`assigned_member_id IS NULL`  
`is_safety_hold = false`

with restaurant/conversation identity preserved, no fabricated member assignment, and durable per-row disposition/audit evidence.

If a preflight row has already legitimately changed, preserve that governed result and prove it no longer has the invalid L-A shape; do not rewrite it merely to recreate history.

**R-3 is BLOCKED** until independently accepted evidence proves:

1. the contemporaneous preflight covered the complete matching population;
2. every identified row has a recorded disposition;
3. no member was fabricated or silently assigned;
4. `count(conversations where ownership_state='HUMAN_ACTIVE' and assigned_member_id IS NULL) = 0`;
5. PR #569 `CLAIMABLE_FROM` / `canClaim` remain byte- and behavior-consistent with the merged contract.

This specification creates the prerequisite only. It does not authorize that preflight or maintenance operation. L-B remains separately governed.

### 3. CORRECTION 2 — exact M-2 function identity

The exact surviving PostgreSQL function identity is:

`public.log_assignment_event() RETURNS trigger`

with zero arguments.

`kv_legacy_assignment_bridge` is **only the behavioral/conceptual name** of its repaired M-2 body. No `public.kv_legacy_assignment_bridge()` PostgreSQL function may be created, required or claimed.

M-2 repairs `public.log_assignment_event()` **in place**. Across M-2:

- schema/name/zero-argument signature/trigger return type remain unchanged;
- PostgreSQL function OID remains unchanged;
- body becomes BR1–BR6 audit-bridge behavior;
- `prosecdef = TRUE`;
- owner becomes `kivo_control_owner`;
- `proconfig = {search_path=""}`;
- former PUBLIC direct EXECUTE grant is removed.

Existing `trg_log_assignment_event ON public.conversations` is never dropped or recreated. Its trigger OID and `tgfoid` remain unchanged, `tgfoid` continuously resolves to `public.log_assignment_event()`, `public.conversations` continuously has exactly three triggers, and there is no audit-trigger gap.

FB1, R18, PR59, PR60, PR61, PR77 and PR80 must all use `public.log_assignment_event()` as the database identity. `kv_legacy_assignment_bridge` may appear only as “behavioral role” or “audit-bridge behavior implemented by `public.log_assignment_event()`.”

### 4. CORRECTION 3 — mandatory dynamic MIV initialization

M-1 explicitly includes initialization/backfill of `member_identity_versions`.

At the governed contemporaneous M-1 preflight, capture:

`N = count(public.members)`

M-1 must create **exactly one version-1 open MIV row for every member present in that governed population**, writing only the newly created MIV table and mutating no existing `members` row.

Acceptance is population-relative, never hard-coded to historical `18`:

- every contemporaneous member has exactly one open MIV version;
- no member has zero or multiple open versions;
- each open version matches that member's current identity tuple;
- the partial unique open-version index exists;
- the three MIV immutability triggers exist.

The historical `18` remains historical source evidence only.

Immediately before M-2, the completeness/current-identity condition must be re-read. Any drift or missing/open-version mismatch is a **HARD STOP** requiring governed disposition; this specification does not silently repair it.

### 5. CORRECTION 4 — proof-responsibility partition

All Revision 14 proofs applicable wholly to M-0/M-1/M-2/R-3/R-4 and SCOPE-1 remain part of the future evidence contract. Cross-stage proofs are partitioned as follows.

**Due to the pre-maintenance increment:**

- **PR59:** audit-bridge privilege independence. Any temporary A1 privilege removal used to prove it occurs **only on disposable PostgreSQL**, never production under this WO.
- **PR60:** fail-loud audit insertion failure. Failure injection is **disposable PostgreSQL only**.
- **PR61:** governed-path skip guard versus legacy bridge exclusivity.
- **PR62:** only boundaries `M-0/M-1`, `M-1/M-2`, `M-2/R-3`, and `R-3/R-4`. Later M-5/R-6/M-7/R-8 boundaries are deferred.
- **PR65:** only the pre-revocation branch proving Class B/C caller safety and audit continuity after M-1/before R-3. Its post-M-7 branch is deferred.
- **PR66:** RB1 and RB2 only. The post-M-7/RB3 branch is deferred.
- **PR67:** R-3 Class-A repair.
- **PR68:** R-3 bypass-tripwire proof; any deliberate unconverted-writer injection is disposable-instance only.
- **PR77:** SCOPE-1 only — exactly three conversation triggers at each governed boundary; `trg_log_assignment_event` continuous; zero conversation-trigger drops; SCOPE-1 evidence/identity trigger inventory only. SCOPE-2 additions are deferred.
- **PR80:** SCOPE-1 inventory only — F1…F16, the single surviving audit-bridge identity `public.log_assignment_event()`, and MIV maintenance function. SCOPE-2 F17–F19 inventory is deferred.
- **PR81:** SCOPE separation remains due, proving excluded A3/F17/F18/F19 material does not enter this increment.

**PR78 / R1–R20 applicability before M-5:**

- **R1:** due.
- **R2:** due.
- **R3:** due only for A0/A2/MIV ownership by `kivo_control_owner`; A1 must still remain `postgres` before M-5; A3 deferred.
- **R4:** due for A0/A2/MIV; A1 M-5 portion and A3 portion deferred.
- **R5:** evaluate stage-specifically. M-1/M-2 must not prematurely revoke A1's legacy grants. Require the intended MIV/new-SCOPE-1 grant posture; defer final A1 post-M-5 restriction and A3 clauses.
- **R6:** deferred entirely to M-7.
- **R7:** due.
- **R8:** due.
- **R9:** due for F1…F16, `public.log_assignment_event()` after M-2, and MIV maintenance.
- **R10:** due only for SCOPE-1 policies/objects that exist before M-5; A1 hardening-dependent policy state and A3 are deferred.
- **R11:** due after every pre-maintenance stage.
- **R12:** due.
- **R13:** deferred SCOPE-2.
- **R14:** deferred SCOPE-2.
- **R15:** due for F1…F16 with F15/F16 internal/no-grantee semantics; F17 deferred.
- **R16:** due for `fk_a2_parent_core`, `ux_a0_evidence_core`, and the MIV identity bindings that exist in pre-maintenance SCOPE-1. `fk_a1_parent_core`/A1 hardening-dependent bindings and A3 bindings are deferred.
- **R17:** due with the **contemporaneous N-member rule**, not hard-coded `18`.
- **R18:** due using the corrected `public.log_assignment_event()` identity and continuity invariant.
- **R19:** due.
- **R20:** due at R-4 using the verified R-3 deployment boundary.

No proof language may imply M-5+, SCOPE-2, destructive production testing, or privilege revocation has been authorized.

### 6. Remaining source-faithful requirements

Preserve the previously accepted candidate requirements: PF5/PF6 hard stops; WhatsApp-only V1 product-scope distinction despite the inherited DB channel compatibility constraint; SA1-only authority with SA2 withdrawn; PF20 PASS without B-13 closure; PF-L1 verified M-2 boundary predicate; `actor_label = NULL`; `P0-VOICE-01` before R-3 caller conversion; mandatory R-3 runtime path flag; measured R-4 soak; truthful rollback; alert-lane separation; and no SQL/migration/database/production authority.

### Gate meaning

This is still **specification and executable-proof design only**. Acceptance does not establish any database object, migration, one-writer property, RLS/grant state, production behavior, blocker closure or pilot readiness.

Re-check the recovered governing files and the binding adjudication. Do not implement, independently audit, mutate GitHub, write SQL, access production, or authorize deployment.

Return exactly one verdict:

`QUALITY GATE ACCEPTED — M0–M4 PRE-MAINTENANCE SPECIFICATION AND PROOF DESIGN READY FOR KIVO-AUDITOR`

or

`QUALITY GATE REJECTED / BLOCKED`

If rejected, identify each remaining blocking clause and the minimum correction. Pilot remains **NO-GO**.
