# BINDING GOVERNANCE ADJUDICATION

## AGENT-WO-002 / WO-SPEC-KVD06-M0-M4-ADDITIVE-CONTROL-PLANE-001

**Date:** 11 August 2026
**Scope:** Conflicts A and B only
**Authority effect:** Specification reconciliation only. No implementation, SQL, migration, database access or production action is authorized.

---

## Conflict A — L-A claimability and PR #569

### A-1. Governing application contract

The canonical application ownership contract merged through PR #569 at approved head `7687df3ddfc4ea07b77a58e28afa9aca9f6fac76` governs application-level claimability.

The governing application rule is:

- `CLAIMABLE_FROM` is exactly:
  - `AI_ACTIVE`
  - `HOLD_UNCLAIMED`
  - `HUMAN_IDLE`
  - `SYSTEM_HOLD`
- `HUMAN_ACTIVE` is not a claimable source state.
- A `HUMAN_ACTIVE` conversation succeeds through `canClaim` only when `assigned_member_id` already equals the claiming member, as an idempotent success.
- `HUMAN_ACTIVE` with `assigned_member_id IS NULL` is not claimable.
- `HUMAN_ACTIVE` assigned to another member is not claimable.

PR #569 must not be reopened, rewritten or bypassed inside this specification work order.

### A-2. Limited supersession of Revision 14

The following Revision 14 requirements are superseded only to the extent that they require unassigned `HUMAN_ACTIVE` to be claimable or require `canClaim` to be widened during R-3:

- §7.1 D7’s inclusion of `HUMAN_ACTIVE` with a NULL assignee as a claim source;
- §7.1’s declared `canClaim` divergence;
- §13’s L-A classification of “PRESERVE and CLAIMABLE”;
- §15.4 R-3’s requirement to widen `canClaim` to accept `HUMAN_ACTIVE` with a NULL assignee.

No other Revision 14 state, transition, safety, tenant, ownership, audit or rollout requirement is superseded by this ruling.

### A-3. Legacy L-A disposition

The historical L-A population is legacy data requiring governed disposition. It is not a permanent application-contract exception and must not be made claimable through a separate application implementation.

Before R-3, a separately approved legacy-row maintenance and disposition work order must inspect the contemporaneous population matching:

`ownership_state = 'HUMAN_ACTIVE' AND assigned_member_id IS NULL`

The work order must cover every row returned by that contemporaneous preflight. It must not rely on the historical count of four.

For a row that still represents an unclaimed, non-safety human escalation, the required normalized state is:

- `ownership_state = 'HOLD_UNCLAIMED'`;
- `assigned_member_id IS NULL`;
- `is_safety_hold = false`;
- no fabricated or automatically invented member assignment;
- restaurant and conversation identity preserved;
- durable, per-row disposition and audit evidence produced.

If a preflight-identified row has already changed through a legitimate governed operation, the evidence must identify its resulting state and prove that it no longer carries the invalid L-A shape. It must not be rewritten merely to reproduce a historical classification.

### A-4. Mandatory R-3 entry invariant

R-3 is **BLOCKED** until independently accepted evidence proves all of the following:

1. The contemporaneous L-A preflight covered the complete governed population.
2. Every row identified by that preflight has a recorded disposition.
3. No member was fabricated or silently assigned to satisfy the gate.
4. The following post-disposition invariant holds:

   `count(conversations where ownership_state = 'HUMAN_ACTIVE' and assigned_member_id IS NULL) = 0`
5. The PR #569 canonical `CLAIMABLE_FROM` and `canClaim` behavior remains byte- and behavior-consistent with the merged application contract.

This ruling establishes a prerequisite and required outcome only. It does not authorize the preflight, maintenance action, database write or production execution needed to satisfy it.

L-B and other legacy classes remain governed by their existing separate requirements and are not adjudicated here.

---

## Conflict B — M-2 audit-bridge function identity

### B-1. Exact surviving PostgreSQL identity

The exact surviving PostgreSQL function identity after M-2 is:

`public.log_assignment_event() RETURNS trigger`

It has zero arguments.

`kv_legacy_assignment_bridge` is a behavioral and conceptual label for the repaired M-2 body of `public.log_assignment_event()`. It is not a separate PostgreSQL function name or identity.

The specification must not create, require or claim the existence of:

`public.kv_legacy_assignment_bridge()`

### B-2. Function-continuity invariant

M-2 repairs `public.log_assignment_event()` in place.

Across M-2:

- its schema remains `public`;
- its function name remains `log_assignment_event`;
- its zero-argument signature remains unchanged;
- its return type remains `trigger`;
- its PostgreSQL function OID remains unchanged;
- its body changes to the governed audit-bridge behavior;
- `prosecdef` becomes `TRUE`;
- its owner becomes `kivo_control_owner`;
- its `proconfig` becomes `{search_path=""}`;
- its former PUBLIC direct-execution grant is removed.

The repaired function performs the behavior identified conceptually as `kv_legacy_assignment_bridge`.

### B-3. Trigger-continuity invariant

The existing trigger remains:

`trg_log_assignment_event ON public.conversations`

Across M-2 and every later stage:

- the trigger is never dropped;
- the trigger is never recreated;
- the `pg_trigger` row and trigger OID remain unchanged;
- its relation remains `public.conversations`;
- its `tgfoid` remains unchanged;
- its `tgfoid` resolves to the surviving `public.log_assignment_event()` function;
- the number of triggers on `public.conversations` remains exactly three.

There must be no interval without the audit trigger.

### B-4. Replacement §9.5 and M-2 language

Replace identity-ambiguous audit-bridge wording with:

> **AUDIT-BRIDGE REPAIR.** The trigger object `trg_log_assignment_event` and its target function identity `public.log_assignment_event()` survive continuously. M-2 replaces the body and security attributes of `public.log_assignment_event()` in place with the behavior conceptually labelled `kv_legacy_assignment_bridge`. The label does not name a second PostgreSQL function. The function becomes SECURITY DEFINER, is owned by `kivo_control_owner`, has `search_path` pinned to the empty path, implements BR1–BR6 and no longer silently swallows audit-write failures. The trigger is not dropped or recreated, its OID and `tgfoid` remain unchanged, and its `tgfoid` continues to resolve to `public.log_assignment_event()`.

### B-5. Replacement FB1 language

> **FB1 ****`public.log_assignment_event() RETURNS trigger`**
> Behavioral role: `kv_legacy_assignment_bridge`.
> `kv_legacy_assignment_bridge` is a conceptual label only and is not a PostgreSQL function identity.
> After M-2, `public.log_assignment_event()` is SECURITY DEFINER, owned by `kivo_control_owner`, and has `SET search_path=''`. Its body implements Revision 14 §9.5 BR1–BR6. The continuously existing `trg_log_assignment_event` trigger remains attached to `public.conversations` and continues to reference this same function OID. The former PUBLIC EXECUTE grant on `public.log_assignment_event()` is revoked so the trigger function cannot be invoked directly through that grant.

### B-6. Replacement R18 language

> **R18 AUDIT BRIDGE:** Before and after M-2, `trg_log_assignment_event` is the same continuously existing trigger object on `public.conversations`, and its `tgfoid` is unchanged and resolves to the same zero-argument function identity, `public.log_assignment_event()`. After M-2, that function has `prosecdef = TRUE`, owner `kivo_control_owner`, `proconfig = {search_path=""}`, and the governed audit-bridge body. No `public.kv_legacy_assignment_bridge()` function exists. The trigger count on `public.conversations` remains exactly three.

### B-7. Replacement proof language

> **PR59 — AUDIT BRIDGE IS PRIVILEGE-INDEPENDENT:** After M-2, the surviving `public.log_assignment_event()` function, operating in the `kv_legacy_assignment_bridge` behavioral role, produces the required A1 row for each tested legacy direct update even after A1 write privileges are removed from the tested API roles. The pre-M-2 body of the same function identity demonstrates the former silent gap.

> **PR60 — AUDIT BRIDGE FAILS LOUDLY:** A seeded failure in the audit insert performed by the post-M-2 body of `public.log_assignment_event()` aborts the originating update and is not swallowed. The pre-M-2 body of the same function identity demonstrates the former swallowed-failure behavior.

> **PR61 — AUDIT BRIDGE SKIP GUARD:** The skip guard inside the post-M-2 body of `public.log_assignment_event()` causes a governed control operation to produce exactly one canonical A1 row and zero bridge rows. A legacy direct write produces exactly one non-canonical bridge row and zero canonical rows. Neither path produces two rows.

> **PR77 — TRIGGER INVENTORY AND CONTINUITY:** `public.conversations` has exactly three triggers at every governed stage boundary. `trg_log_assignment_event` is never absent, dropped or recreated. Its trigger OID and `tgfoid` remain unchanged across M-2, and its `tgfoid` continuously resolves to `public.log_assignment_event()`. Zero conversation triggers are dropped.

> **PR80 — FUNCTION INVENTORY:** After SCOPE-1, the inventory contains exactly sixteen control functions, one audit-bridge function identity `public.log_assignment_event()`, and one MIV maintenance function. No `public.kv_legacy_assignment_bridge()` function exists. After SCOPE-2, the inventory contains exactly nineteen control functions plus the same surviving `public.log_assignment_event()` audit-bridge function and the MIV maintenance function. The applicable functions are SECURITY DEFINER, have pinned `search_path`, and are owned by `kivo_control_owner`; `public.log_assignment_event()` has no PUBLIC EXECUTE grant after M-2.

### B-8. Identity interpretation rule

Every reference in FB1, R18, PR59, PR60, PR61, PR77 and PR80 must use `public.log_assignment_event()` as the PostgreSQL function identity.

The term `kv_legacy_assignment_bridge` may appear only as:

`the kv_legacy_assignment_bridge behavioral role`

or:

`the audit-bridge behavior implemented by public.log_assignment_event()`

It must never be presented as a separately created, replaced, granted, owned, invoked or trigger-targeted PostgreSQL function.

---

## Authority boundary

This adjudication resolves specification precedence and object identity only.

It does not:

- implement legacy-row repair;
- authorize a production preflight or mutation;
- authorize SQL or migration drafting;
- assign a migration number;
- access or change a database;
- modify GitHub;
- reopen or modify PR #569;
- close `P0-CTRL-01` or another blocker;
- authorize deployment or pilot operation.

**Pilot remains NO-GO.**