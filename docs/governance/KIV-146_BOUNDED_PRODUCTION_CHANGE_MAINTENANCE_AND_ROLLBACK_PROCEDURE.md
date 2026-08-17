# KIV-146 — BOUNDED PRODUCTION-CHANGE MAINTENANCE AND ROLLBACK PROCEDURE

**One-restaurant WhatsApp-first controlled alpha · KIV-142 rebaseline**

| Field | Value |
|---|---|
| Issue | KIV-146 — Define bounded production-change maintenance and rollback procedure for alpha |
| Milestone | G2 — Security, order truth, WhatsApp & safety |
| Authored | 17 August 2026 |
| Revision | **REVISION 3** — remediates KIV-160 Attempt 2 BLOCK findings N-1, N-2, N-3 and cleanups OBS-1, OBS-2, OBS-3 |
| Supersedes | Revision 2, commit `af1567b49a50e138ff3ba464cb2fe470c9ef1f96` (BLOCKED by KIV-160 Attempt 2) · Revision 1, commit `369faa747c48b10a01749b092e50a65e15f4d159` (BLOCKED by Attempt 1) |
| Status | **DRAFT — awaiting a fresh independent Engineering review (KIV-160 Attempt 3) of this exact revision.** Not accepted. Not self-approved. |
| Governs | KIV-14 (Change Class A) and KIV-25 (Change Class B) only |
| Replaces | The standalone full P0-MAINT / M2 maintenance-interleave program as an alpha milestone (KIV-142 §"Maintenance/control-plane simplification") |
| Authorizes | **Nothing.** This document is a procedure/evidence gate. |
| Authority status as at | **2026-08-17T18:02:46Z** (§2.1) |

### Revision 3 change log — KIV-160 Attempt 2 findings

| Finding | Disposition | Sections changed |
|---|---|---|
| **N-1** — live-ingress circular dependency: the hold could not be released until read-back 6 passed, and read-back 6 could not run while the hold was engaged | Fixed. **New §7.5** defines the two — and only two — permitted Class B execution orders, as pre-decided step sequences L-0 … L-9 and Q-0 … Q-6, with no in-window executor judgement | **§7.5**, §4.3, §7.2, §7.3, §6 (HS-29) |
| **N-2** — the exact materialized restoration SQL was only self-read by the executor | Fixed. **§5.4.2 RM-VERIFY**: the literal materialized text is independently verified by fingerprint, by a separately released verifier who is not the executor, **before** the forward mutation; the executor may run only the verified fingerprint | **§5.4.2**, §1, §2.7 item 5, §8.1 (E-9), §6 (HS-26 extended, HS-28) |
| **N-3** — restoration trigger covered only "committed + verification failed" | Fixed. **§5.4.1 state map S-1 … S-4** covers full commit, partial commit across invariant groups, any post-commit HARD STOP, and unknown outcome after session loss — each with its mandatory read-only determination and a pre-decided restoration-or-holding-state verdict, plus a default-deny rule | **§5.4.1**, §5.4.5, §6 |
| **OBS-1** — new-object inventory incomplete versus exact `0108` | Fixed. **New §2.6.1** carries the complete named inventory: **41 constraints (39 explicitly named + 2 system-named primary keys) and 9 standalone indexes**, correcting Revision 2's "11 indexes/constraints" | **§2.6 / §2.6.1**, §3.2 (B-9), §7.1, §5.2, §5.3 |
| **OBS-2** — a pre-change record alone cannot prove ingress was not live for the whole window | Fixed. Two objective ingress-state points **IS-1** and **IS-2** plus unchanged inbound row-count deltas; a §7.3.1 deferral now requires all of them | §3.2 (B-14), **§7.3.1**, §7.5, §8.1 (E-6, E-10), §6 (HS-25 extended) |
| **OBS-3** — `exactly one` vs `at most one` inert membership | Clarified without weakening `0108` semantics | §7.1 |

**F-1 … F-7 (KIV-160 Attempt 1) remain CLOSED.** Revision 3 does not reopen or redesign them.
Where Revision 3 touches a section that carried an F-fix, it extends that fix and never relaxes
it; §9.2 records the specific no-regression checks.

Revision 3 is documentation-only. No migration, source, runtime or production artifact was
changed. `0108` is untouched.

---

## 0. WHAT THIS DOCUMENT IS, AND WHAT IT IS NOT

### 0.1 It is

The single procedure that must be satisfied for a **specific, already-authorized, individually
named production change** on the one-restaurant alpha path. It is instantiated per change, not
run as a standing program.

### 0.2 It is not

* Not a maintenance program, maintenance-mode control plane, interleave scheduler, on-call
  rota, status page, or generic drain/queue infrastructure.
* Not a backup/restore or PITR runbook. Point-in-time recovery and project restore are
  **explicitly excluded as rollback mechanisms** (§5.6).
* Not production authority. Founder authority for Change Class A lives in KIV-159; for
  Change Class B in KIV-144. **§2.1 is the single place this document states their status, as at
  one timestamp** — do not restate it elsewhere. Completion and independent acceptance of KIV-146 is a
  **precondition** of those authorities being exercised, never a substitute for them.
* Not a licence to touch anything outside the exact boundary in §2.

### 0.3 Deliberately excluded (do not build to satisfy this issue)

Maintenance-mode toggles or a maintenance control plane; generic connection draining or
request-queue infrastructure; multi-restaurant cohort or backup-substitution machinery;
printing/retry/reprint architecture; M6–M9 control-plane stages; KIV-88 advisory repair;
order-truth implementation; WhatsApp/Meta configuration; deployment tooling; monitoring or
alerting build-out. Each is either deferred by KIV-142 or owned by a different issue.

---

## 1. ROLES AND SEPARATION

| Role | Holds | May not |
|---|---|---|
| **Founder** | Production authority for the named change (KIV-159 / KIV-144) | — |
| **PM** | Fresh-reads custody, pins the exact source bytes, releases exactly one executor, receives HARD STOP reports | Execute the mutation |
| **Executor** | Runs preflight, before-state capture, the one authorized mutation, after-state read-back, evidence packaging | Approve its own result; adapt, repair or improvise; widen scope; run a second attempt; **be the sole approver of the materialized restoration text (§5.4.2)** |
| **Restoration verifier** (Class B only) | Independently verifies the exact literal materialized restoration text before the forward mutation — **RM-VERIFY**, §5.4.2 | Be the executor; have authored the restoration skeleton; execute anything |
| **Independent reviewer** | Accepts or blocks the result (KIV-145 for Class B; KIV-159 condition 5 for Class A) | Have participated in execution |

The **restoration verifier** is separately released by PM. It may come from the same independent
Engineering lane as the acceptance reviewer, and the two may be the same window provided that
window is neither the executor nor the skeleton's author. RM-VERIFY is a short read-only check
of a short mechanical text (§5.4.2) — it is not new maintenance infrastructure, and nothing in
this procedure requires building any.

**Single-executor rule.** Exactly one executor, one session, one authorized attempt.
Concurrent or successive executors on the same authorization is a HARD STOP (§6, HS-19).

**No self-acceptance rule.** The executor's own after-state read-back is evidence, never
acceptance. Downstream G2 work may not rely on a production result until the independent
reviewer accepts it.

---

## 2. PREFLIGHT AND THE EXACT AFFECTED BOUNDARY

### 2.1 The two change classes this procedure governs

| | **Change Class A** | **Change Class B** |
|---|---|---|
| Issue | KIV-14 — M-1 / `0108` first production application | KIV-25 — minimum alpha security hardening |
| Authority issue | KIV-159 | KIV-144 |
| Authority status | **Done** — recorded 2026-08-17T15:59:34Z | **Done** — recorded 2026-08-17T15:59:19Z |
| Nature | Additive DDL + one insert into a new table | Mutating owner / RLS / grant change on existing objects |
| Reversible by transaction alone | **Yes** (§5.2) | **No** — needs the §3.3 before-state to restore (§5.4) |
| Block/drain required | **No** (§4.2) | **Conditional** (§4.3) |
| Post-execution acceptance | KIV-159 condition 5 — separately released independent reviewer (§7.4) | KIV-145 (§7.4) |

**Authority status is stated as at 2026-08-17T18:02:46Z**, the single timestamp for every
authority fact in this document. Both authorities existed when Revision 2 was written; neither
is pending. Anyone re-reading this document later must re-read KIV-159 and KIV-144 rather than
rely on this table.

**What those authorities do and do not do.** Each creates authority only. Neither executes
production, and neither substitutes for the §2.7 entry checklist — KIV-159 condition 1 makes
independent acceptance of *this procedure* a precondition of Class A execution, and PM must
separately release the exact executor. A change that is not Class A or Class B is out of scope;
do not stretch this procedure to cover it, and do not treat KIV-144 as covering Class A
(KIV-159 says so explicitly).

### 2.2 Target identity — PF-1

The only permitted production target is the Supabase project confirmed by KIV-75:

```
project name : MaitreAi
project ref  : zlighrbsjexrozrmuwpw
```

The executor must state the connected project ref back from the live session before any other
step. Any other ref, any ambiguity, any inability to display it = **HARD STOP (HS-1)**.

### 2.3 Source pin — PF-2 (Change Class A)

PM pins the execution to these exact bytes. The identities below were verified independently
during KIV-146 authoring by reading the repository and the GitHub PR record; **the executor
must recompute them at pin time and compare, not trust this table**.

| Item | Value |
|---|---|
| Repository | `mohamedyousalama-ctrl/MaitreAI` |
| Custody commit | `d5b4b1dd0925964ae44d55e125893081afddc651` — normal 2-parent merge of PR #575, merged 2026-08-17T14:55:21Z |
| Merge parents | base `24c09b4ca117443984db2c43bdb9a3619daeb156`, head `dd2058d8e1a440c46efc99bbe8a057b16adebf07` |
| Branch carrying it | `feat/kiv12-m0-constraint-prestage` |
| `supabase/migrations/0108_kiv13_m1_additive_scope1.sql` | git blob `7b500626331dd4eaf4620d29c95953740f6e5541` · 90,235 bytes · SHA-256 `00cd7b7fe2ee581df7b9d038301123db45a80962fe8a6ad3c0435e2893dea9ee` |
| `supabase/migrations/0107_kiv12_m0_constraint_prestage.sql` | git blob `d492d2e58fee28c93fd84ec71081dc71c81fce0b` · 4,096 bytes · SHA-256 `3c40c6280b99d6f8a78c5081054b25d3438d47f205f2646c66796e4adefc74a6` |

Two facts PM must carry into the pin decision, both verified, neither of which this procedure
authorizes anyone to "fix":

1. **`0107` is byte-identical to the M-0 file already applied in production** (blob and
   SHA-256 both match the identities recorded in KIV-14 for the 14 Aug Phase A application).
   M-0 therefore needs no re-application and is **out of this procedure's mutation boundary**.
2. **The default branch `main` (tip `14ace39`) does not carry `0107` or `0108`.** The KIV-14
   source stack lives on `feat/kiv12-m0-constraint-prestage`, and PR #575 merged into that
   branch, not into `main`. The pin must therefore be taken from custody commit `d5b4b1dd`.
   Whether the stack is later merged to `main` is a separate repository decision under
   separate authority; it is **not** a step of this procedure and must not be performed to
   make the pin look tidier.

Fingerprint mismatch of any kind, or a pin taken from any other commit or branch =
**HARD STOP (HS-2)**.

### 2.4 Runner proof — PF-3 (Change Class A)

`0108` carries no top-level `BEGIN`/`COMMIT` and states that its fail-closed guarantees exist
**only** under a whole-file single transaction. The executor must therefore use:

```
psql --single-transaction -v ON_ERROR_STOP=1 -f 0108_kiv13_m1_additive_scope1.sql
```

or a runner independently proved to wrap the entire file in one transaction. Statement-by-
statement application is a governance violation, not a style choice: under autocommit a
mid-file failure leaves the `kivo_control_owner` role and its bootstrap `SET`/`INHERIT`
membership and schema `CREATE` grant behind. Inability to prove single-transaction wrapping =
**HARD STOP (HS-3)**.

### 2.5 SELECT-only production preflight — PF-4

Read-only, separately Founder-authorized, run immediately before the mutation, in the same
session and against the same pinned target. **Recording these here does not authorize running
them.**

**Byte-identity rule for PF-4a and PF-4b.** The two statements below are reproduced
**byte-identically from the KIV-14 mandated text**, unreflowed, including line breaks, spacing
and clause order. The executor must nevertheless re-copy them from KIV-14 at execution time and
diff them against this file. If the two differ in any byte, **KIV-14 is authoritative** and the
divergence is a **HARD STOP (HS-2)** reported to PM — not something to reconcile in the moment.

**PF-4a — `kivo_control_owner` must not pre-exist** (KIV-14 mandated text, verbatim):

```sql
select
  r.rolname,
  r.rolsuper,
  r.rolinherit,
  r.rolcreaterole,
  r.rolcreatedb,
  r.rolcanlogin,
  r.rolreplication,
  r.rolbypassrls
from pg_roles r
where r.rolname = 'kivo_control_owner';
```

**PF-4b — no standing membership on it** (KIV-14 mandated text, verbatim):

```sql
select
  member_role.rolname as member_role,
  target_role.rolname as granted_role,
  grantor_role.rolname as grantor_role,
  m.admin_option,
  m.inherit_option,
  m.set_option
from pg_auth_members m
join pg_roles member_role on member_role.oid = m.member
join pg_roles target_role on target_role.oid = m.roleid
join pg_roles grantor_role on grantor_role.oid = m.grantor
where target_role.rolname = 'kivo_control_owner'
   or member_role.rolname = 'kivo_control_owner'
order by member_role.rolname, target_role.rolname, grantor_role.rolname;
```

Expected: **zero rows from each**. Any returned row = **HARD STOP (HS-4)**. Do not drop,
alter, grant, revoke, repair or improvise.

**PF-4c — N2, `PUBLIC` must not hold `CREATE` on schema `public`:**

```sql
select has_schema_privilege('public', 'public', 'CREATE');
```

Expected: **false**. If true, `0108`'s bootstrap-only `CREATE` grant cannot be cleanly
withdrawn — `has_schema_privilege()` still reports `CREATE` via `PUBLIC` — and section 16 is
*designed* to abort and roll the whole migration back. That outcome is correct. Do not "fix"
it in the moment: **HARD STOP (HS-5)**, escalate to PM.

**PF-4d — `0107` dependency still present:**

```sql
select 1 from pg_constraint
where conname = 'conversations_restaurant_id_id_key'
  and conrelid = 'public.conversations'::regclass;
```

Expected: one row. Absent = **HARD STOP (HS-6)** (`0108` would abort on its own header check).

**PF-4e (Change Class B only) — the before-state of every invariant to be changed** must be
readable and read back *before* the change, per §3.3. If it cannot be captured, Class B must
not execute: its restoration is defined by that capture and nothing else. **HARD STOP (HS-7)**.

**PF-4f (Change Class A) — no unexpected pre-existing function matches the lockdown
patterns.** Adopted from the KIV-160 reviewer recommendation (F-7).

`0108` section 15 does not enumerate its functions by name. It loops over `pg_proc` selecting
every function in schema `public` whose name matches `kv_control_%`, `kv_sys_control_%` or
`kv_tg_%`, and for each match performs `ALTER FUNCTION ... OWNER TO kivo_control_owner` and
`REVOKE ALL ON FUNCTION ... FROM public, anon, authenticated, service_role`. Any pre-existing
function matching one of those patterns — however it came to exist — would therefore be
silently re-owned and stripped of its grants, which is a change to a pre-existing object and
outside the additive boundary declared in §2.6.

This read-only preflight closes that gap without touching the migration:

```sql
select
  p.oid::regprocedure                as function_signature,
  pg_catalog.pg_get_userbyid(p.proowner) as current_owner
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.proname like 'kv_control_%'
    or p.proname like 'kv_sys_control_%'
    or p.proname like 'kv_tg_%')
order by 1;
```

Expected: **zero rows** before the first Class A application. Any returned row = **HARD STOP
(HS-24)**. Do not drop, rename, re-own or re-grant the offending function, and do not edit
`0108` to narrow its pattern — both are outside this procedure's authority. Report the exact
signature and owner to PM for adjudication.

`0108` is **not modified** by this procedure. PF-4f is a read-only assertion about production
state, added because the migration's wildcard is a source characteristic the procedure can
guard but must not change.

### 2.6 Exact affected boundary

**Change Class A — objects this change may create or write. Nothing else.**

*New role:* `kivo_control_owner` — `NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE
NOINHERIT NOREPLICATION`.

**Expected membership state at success** (stated here to agree exactly with §7.1 and `0108`
section 16; the governed production executor is a non-superuser):

* `0108` section 1B temporarily grants `kivo_control_owner` to the executing role `WITH INHERIT
  TRUE, SET TRUE`, and grants that role bootstrap-only `CREATE` on schema `public`. **Section 16
  withdraws both before the migration can succeed**, and its verification fails closed, so an
  incomplete withdrawal aborts and rolls the whole migration back.
* At success, **no surviving membership may confer the ability to act as the role**: zero
  memberships carry `set_option` or `inherit_option`.
* For the **governed non-superuser executor** (`postgres`: `rolsuper=false`,
  `rolcreaterole=true`), **exactly one membership record remains** — the one PostgreSQL creates
  automatically during `CREATE ROLE` — and it must be held by the executing role itself, with
  `admin_option=true`, `set_option=false`, `inherit_option=false`, and a **superuser grantor**.
  A membership held by any other role, or recorded by a non-superuser grantor, is rejected by
  section 16 by name.
* A superuser executor would leave **no** membership record. That case is not the governed
  production path and must not be arranged to make this assertion simpler.

So the correct expectation is **"no membership that can act as the role, and at most one
inert `ADMIN`-only record held by the executor"** — not "granted to no role".

*New tables (3), owned by `kivo_control_owner`, RLS enabled **and** forced:*
`public.member_identity_versions` (MIV), `public.control_operations` (A0),
`public.conversation_audit_failures` (A2).

*New constraints and indexes on those tables:* **41 constraints and 9 standalone indexes** —
the complete named inventory is **§2.6.1**, which is the authoritative list for the B-9 capture,
the §5.2 residue checklist, the §5.3 reversal and the §7.1 after-state assertions.

*New triggers (9), all on the three new tables:* `tg_miv_close_only`, `tg_miv_no_delete`,
`tg_miv_no_truncate`, `tg_a0_no_update`, `tg_a0_no_delete`, `tg_a0_no_truncate`,
`tg_a2_no_update`, `tg_a2_no_delete`, `tg_a2_no_truncate`.

*New type (1):* `public.kv_control_result`.

*New functions (21):* five trigger functions — `public.kv_tg_evidence_immutable()`,
`kv_tg_evidence_no_truncate()`, `kv_tg_miv_close_only()`, `kv_tg_a0_audit_exclusivity()`,
`kv_tg_a2_parent_guard()` — and sixteen control functions F1–F16, exact signatures in §5.3.

*New policies (15):* eight on the new tables (`miv_control_owner_ins`, `miv_control_owner_sel`,
`miv_control_owner_upd`, `miv_member_sel`, `a0_control_owner_ins`, `a0_control_owner_sel`,
`a2_control_owner_ins`, `a2_control_owner_sel`) and **seven on pre-existing tables**
(`conversations_control_owner_rw`, `members_control_owner_sel`, `restaurants_control_owner_sel`,
`customers_control_owner_sel`, `messages_control_owner_sel`, `a1_control_owner_ins`,
`a1_control_owner_sel`).

*Schema change to one pre-existing table:* eight **nullable, no-default** columns added to
`public.conversation_assignment_events` (A1) — `transition_id`, `operation_id`, `actor_kind`,
`is_canonical`, `actor_member_version`, `actor_user_id`, `actor_label`, `actor_role`.

*Additive grants to `kivo_control_owner` only:* `USAGE` on schemas `public`, `auth`,
`extensions`; `EXECUTE` on `extensions.digest(bytea,text)`; `SELECT` on `public.conversations`,
`public.members`, `public.restaurants`, `public.customers`; column-scoped
`SELECT (id, restaurant_id, conversation_id)` on `public.messages`; `SELECT, INSERT` on A1;
column-scoped `INSERT` (8 columns) and `UPDATE` (9 columns) on `public.conversations`.
Plus the designed `EXECUTE` grants asserted in **§7.1** to `authenticated` / `service_role`,
and `SELECT` on MIV to `authenticated`.

*Mechanism note (see PF-4f).* The ownership transfer and `EXECUTE` lockdown of the 21 functions
is applied by `0108` through a wildcard scan of `public` for `kv_control_%`,
`kv_sys_control_%` and `kv_tg_%`. The boundary above is therefore only exact if **no other
function in `public` matches those patterns**. PF-4f asserts that read-only before execution,
and §7.1 asserts it again afterwards.

*The only row writes:* the MIV initialization — one version-1 row per existing member, into
the new MIV table only, `N = count(public.members)` **at application time** (population-
relative; no historical count is an execution invariant).

*Plus, if the runner records it:* exactly one migration-ledger row for `0108`.

**Change Class A explicitly does not, and must not be allowed to:** revoke anything from any
existing principal; change the owner of any pre-existing object; enable or force RLS on any
pre-existing table; add, alter or drop a trigger on any pre-existing table; add
`NOT NULL`/`CHECK`/`UNIQUE`/`FK` to any populated pre-existing table; write any pre-existing
row. It must not touch `public.log_assignment_event()` (M-2/KIV-15), the four A1 evidence
triggers (M-5), A1 backfill/ownership/revocation, `fk_a1_parent_core`, A3,
`control_alert_intents`, F17–F19, or any other SCOPE-2 material.

**Change Class B — the boundary is exactly the seven minimum alpha security invariants**
named in KIV-25 / KIV-144: intended database owner; owner `rolbypassrls = false` / no unsafe
BYPASSRLS path; RLS enabled; FORCE RLS enabled where governed; intended
service/application grants and revocations; required alpha application paths still working;
exact rollback and before/after evidence. Nothing broader. Every object touched must be named
in the authorization *before* execution — an unnamed object is out of boundary.

**Out of boundary for both classes:** customer, message, order, menu or member row data; any
`public.members` write; Meta/WhatsApp configuration; application deployment; restaurant
activation; the Khalid project; alpha/Pilot GO; KIV-88 advisories; M-2/R-3/R-4/M-5+.

### 2.6.1 Complete constraint and index inventory for the three new tables (OBS-1)

Revision 2 listed 11 objects here. That was incomplete: it carried only the standalone
`CREATE INDEX` statements plus two foreign keys, and omitted every inline table constraint.
Corrected against exact `0108` (blob `7b500626…`), the full inventory is **41 constraints and
9 standalone indexes**. `0108` contains no `ALTER TABLE ... ADD CONSTRAINT`; every constraint
below is declared inline in its `CREATE TABLE`.

**`public.member_identity_versions` (MIV) — 6 named constraints**

`miv_pkey` (PK, `member_id, version`) · `miv_identity_key` (UNIQUE) · `miv_role_check` (CHECK) ·
`miv_version_check` (CHECK) · `miv_valid_time_check` (CHECK) · `fk_miv_member` (FK →
`public.members(id)`, `ON UPDATE RESTRICT ON DELETE RESTRICT`).

**`public.control_operations` (A0) — 20 named constraints + 1 system-named primary key**

System-named PK on `id`: **`control_operations_pkey`** (declared inline as a column-level
`primary key`, so PostgreSQL names it; it is not named in the source text).

`a0_1_operation_identity` (UNIQUE) · `a0_2_transition_unique` (UNIQUE) · `a0_3_operation_name` ·
`a0_4_operation_status` · `a0_5_audit_kind` · `a0_6_fingerprint` · `a0_7_actor_kind` ·
`a0_8_applied_changed` · `a0_9_nonapplied_unchanged` · `a0_10_changed_epoch` ·
`a0_11_unchanged_epoch` · `a0_12_outcome_shape` · `a0_13_actor_coherence` · `a0_14_modes` ·
`a0_15_actor_role` · `a0_16_alerted_operation` · `a0_17_actor_label_null` ·
`a0_18_scope1_no_alert_intent` (all CHECK) · `fk_a0_1_conversation` (FK) ·
`fk_a0_2_actor_identity` (FK).

**`public.conversation_audit_failures` (A2) — 13 named constraints + 1 system-named primary key**

System-named PK on `id`: **`conversation_audit_failures_pkey`**.

`a2_1_transition_unique` (UNIQUE) · `a2_2_actor_kind` · `a2_3_to_mode` · `a2_4_failure_category` ·
`a2_5_sqlstate` · `a2_6_fingerprint` · `a2_7_epoch` · `a2_8_actor_coherence` · `a2_9_actor_role` ·
`a2_10_actor_label_null` (all CHECK) · `fk_a2_1_conversation` (FK) · `fk_a2_2_actor_identity` (FK) ·
`fk_a2_parent_core` (FK).

**Standalone indexes — 9**

`ux_miv_open_version` (partial UNIQUE, `member_id` where `valid_to is null`) ·
`ux_a0_evidence_core` (UNIQUE) · `a0_restaurant_created_idx` · `a0_conversation_created_idx` ·
`a0_actor_member_idx` · `a2_restaurant_occurred_idx` · `a2_actor_member_idx` ·
`a2_restaurant_conversation_idx` · `a2_operation_idx`.

**Totals and how to count them.**

| Class | Count |
|---|---|
| Explicitly named constraints in the source | **39** (6 MIV + 20 A0 + 13 A2) |
| System-named primary keys (inline column-level) | **2** |
| **Constraints total** (`pg_constraint`) | **41** |
| Standalone indexes (`CREATE INDEX` / `CREATE UNIQUE INDEX`) | **9** |
| Foreign keys specifically | **6** — `fk_miv_member`, `fk_a0_1_conversation`, `fk_a0_2_actor_identity`, `fk_a2_1_conversation`, `fk_a2_2_actor_identity`, `fk_a2_parent_core` |
| Index relations expected in `pg_class` | **16** — the 9 standalone plus 7 backing indexes for the PK/UNIQUE constraints (`miv_pkey`, `miv_identity_key`, `control_operations_pkey`, `a0_1_operation_identity`, `a0_2_transition_unique`, `conversation_audit_failures_pkey`, `a2_1_transition_unique`) |

**Counting rule for assertions.** Existence checks (B-9, §7.1) query `pg_constraint` for the 41
and `pg_class`/`pg_indexes` for the 16 index relations. Do not mix the two counts: a check that
expects "9 indexes" against `pg_class` will fail on the 7 backing indexes and produce a false
HARD STOP. The two system-named primary keys are asserted **by table and contype**, not by
guessing the name, since their names come from PostgreSQL rather than from `0108`.

**Reversal note.** All 41 constraints and all 16 index relations are dropped implicitly with
their tables at §5.3 step 4. None is dropped separately, and none may be dropped separately.

### 2.7 Entry checklist — all must be true, in order

1. The change is Change Class A or B, named in a recorded Founder authorization.
2. **KIV-146 is complete and independently accepted** (KIV-159 condition 1).
3. For Class B: KIV-14 has completed and been independently verified (KIV-25 is blocked by it).
4. PM has fresh-read custody and pinned the exact bytes (§2.3).
5. The reversal path for this exact change already exists, per §5.1:
   * **Class A** — the post-commit reversal script of §5.3 is authored, independently reviewed
     and carries its **own separate Founder authorization**, held unused.
   * **Class B** — all four of: the restoration skeleton of §5.4.2 is authored and
     independently reviewed; the §3 capture is complete; the skeleton is **fully materialized**
     into literal statement text against that capture; and that exact literal text has a
     recorded **RM-VERIFY PASS from the restoration verifier at the same SHA-256 the executor
     holds** (§5.4.2). Not materialized = **HARD STOP (HS-26)**. Materialized but not
     independently verified at the matching fingerprint = **HARD STOP (HS-28)**. Both stop
     *before* the forward change.
6. PF-1 through PF-4 pass, PF-4f included for Class A.
7. PM has released exactly one named executor for exactly one attempt.
8. Alpha WhatsApp ingress state is known and recorded (§4.3).

Any item unsatisfied = do not start.

---

## 3. BEFORE-STATE CAPTURE

### 3.1 Rules

* Captured **before** any block/drain and before the mutation, in the same session, against
  the PF-1 target.
* **Query-text parity rule:** the after-state read-back (§7) reuses byte-identical query text,
  so before/after comparison is mechanical rather than interpretive. Store the query text
  itself as an evidence artifact and hash it.
* **Non-disclosing:** counts, flags, role attributes, object existence, privilege bits and
  fingerprints only. Never capture message bodies, customer PII, member emails, phone numbers,
  credentials, connection strings or API keys.
* Every capture line carries the statement timestamp. The capture is append-only; a re-run is
  a new artifact, never an overwrite.
* A capture that is incomplete, unreadable, or that the executor cannot read back = **HARD
  STOP (HS-8)**. For Class B this is absolute: the capture *is* the rollback.

### 3.2 Capture set — both classes

| # | Capture | Notes |
|---|---|---|
| B-1 | `select current_database(), current_user, version()` | plus the project ref stated back |
| B-2 | Pinned source fingerprints recomputed locally (§2.3) | SHA-256, byte count, git blob |
| B-3 | `select count(*) from public.members` → **this is `N`** | the contemporaneous count the MIV rule uses |
| B-4 | `select count(*) from public.conversations` | expected 28 at authoring time; record actual |
| B-5 | `select count(*) from public.conversation_assignment_events` | expected 7 at authoring time; record actual |
| B-6 | Role inventory: `rolname, rolsuper, rolcanlogin, rolbypassrls, rolcreatedb, rolcreaterole, rolinherit, rolreplication` for `postgres`, `service_role`, `authenticated`, `anon`, `kivo_control_owner` | |
| B-7 | PF-4b `pg_auth_members` result | |
| B-8 | PF-4c `has_schema_privilege('public','public','CREATE')` | |
| B-9 | Existence check for every §2.6 object: role, 3 tables, **the complete §2.6.1 inventory — 41 constraints and 16 index relations**, 9 triggers, 15 policies, type, 21 functions, 8 A1 columns | expected: all absent for Class A. Use the §2.6.1 counting rule |
| B-10 | Owner, `relrowsecurity`, `relforcerowsecurity` for every governed table | the pre-change values Class B must be able to restore |
| B-11 | Grant set for every governed table and function: grantee, privilege type, column scope | the pre-change values Class B must be able to restore |
| B-12 | Migration ledger: `max(version)` and whether a `0108` row exists | |
| B-13 | Non-disclosing member fingerprint evidence consistent with the KIV-14 baseline method | proves `public.members` was not mutated, without disclosing it |
| B-14 | **IS-1 — ingress-state evidence point (OBS-2).** The enabled/disabled state of the governed alpha ingress control named in the KIV-25 authorization, plus `count(public.messages)`, recorded together with the B-4 and B-5 counts and one statement timestamp | the pre-change half of the whole-window ingress proof; its end-of-window counterpart is **IS-2** (§7.3.1) |

### 3.3 Class B additional requirement

B-10 and B-11 must be captured **per object named in the authorization**, and read back before
proceeding. A Class B change whose exact prior owner, RLS flags and grant set are not on record
has no defined restoration and must not execute (HS-7).

These captured values are also the inputs the §5.4.2 restoration plan is **materialized** from,
before the forward change runs. Capture is therefore not merely evidence for Class B — it is a
precondition of having any reversal at all.

---

## 4. REVERSIBLE BLOCK / DRAIN — ONLY WHERE NECESSARY

### 4.1 Necessity test

A block or drain is permitted **only** when the specific change would otherwise (a) break a
live application path mid-change, or (b) allow concurrent writes to reach an object whose
access rules are changing. If neither holds, blocking is prohibited: it adds an outage and a
recovery step the change does not need.

### 4.2 Change Class A — **no block, no drain**

`0108` is additive: it revokes nothing, re-owns nothing pre-existing, enables/forces RLS on no
pre-existing table, adds no trigger to a pre-existing table, and writes only its own new MIV
table. There is no live path to protect and no concurrent-write exposure.

The one real contention is lock acquisition: `ALTER TABLE public.conversation_assignment_events
ADD COLUMN ...` needs a brief `ACCESS EXCLUSIVE` lock on A1, and — because the whole file is
one transaction — that lock is held to commit. The correct control is **fail-fast, not drain**:

```
set lock_timeout = '5s';
set statement_timeout = '15min';
```

set at session start, before the file runs. If the lock cannot be taken within
`lock_timeout`, the statement errors, the transaction rolls back completely, and nothing is
left behind. That is a clean abort (HS-13), not a partial change. Do **not** cancel or
terminate other backends to get the lock; do not `ALTER TABLE ... ADD COLUMN` outside the
file; do not split the file to shorten the lock.

Choose a low-traffic window. A window choice is not authority to proceed without §2.7.

### 4.3 Change Class B — conditional, reversible, minimal

Class B revokes grants and transfers ownership on **live** objects. It therefore *can* break
the alpha application path mid-change.

* **If alpha WhatsApp ingress is not live** (the state at authoring time — Pilot/alpha is
  NO-GO): no block or drain is required or permitted. Record the ingress state as evidence.
* **If alpha ingress is live**: the only permitted block is a **reversible pause of ingress
  using the existing safety ingress/hold control** (the alpha-critical safety control of
  KIV-142 item 8), engaged immediately after the §3 capture and reverted in §7.3. Record the
  exact control used, the engage timestamp, and the revert timestamp.

**Prohibited as a "drain" or block, in every case:** disabling RLS or dropping policies;
granting `BYPASSRLS`; revoking from `postgres`; deleting or renaming credentials; pausing the
Supabase project; terminating client backends; taking the application offline by deployment or
configuration change (deployment is out of boundary); any change not named in the
authorization. If the only way to protect a path is one of these, the change is not ready —
**HARD STOP (HS-9)**.

**Revert rule.** Every block engaged must be reverted, and the revert must be verified, not
assumed. An unreverted block at end of window is an incomplete change.

**Ordering is fixed by §7.5, not by this section.** Engaging a hold here commits the change to
the live-ingress sequence §7.5.1, in which the hold is engaged at L-1, released at L-5 under
the L-4 gate, and re-engaged at L-8 on failure. Which branch applies is decided by the recorded
IS-1 ingress state (capture line B-14) before any mutation, never in-window.

---

## 5. EXACT ROLLBACK / RESTORE

### 5.1 Rollback-before-execute rule, and which authority covers which reversal

The reversal path for the specific change must be **authored and independently reviewed before
the forward change runs** (§2.7 item 5). Rollback is never improvised after a failure. Outside
the two reversal paths defined below, an executor facing an unexpected state has exactly one
authorized move: stop and report (§6).

Authority differs by class, and the difference is deliberate:

| | Reversal path | Covered by the forward authorization? |
|---|---|---|
| **Class A** | R-A transactional rollback (§5.2) — the database performs it | **Yes.** It is the migration's own designed failure behaviour, not a further action |
| **Class A** | R-B post-commit reversal (§5.3) | **No.** Requires its own separate Founder authorization, obtained before the forward run and held unused |
| **Class B** | Bounded restoration to the captured before-state (§5.4) | **Yes**, strictly within the §5.4 bounds |
| **Class B** | Anything beyond bounded restoration | **No.** New Founder authorization required; until it exists, the §5.4 holding state applies |

### 5.2 Tier R-A — transactional rollback (primary; the *only* rollback for Class A)

This is the designed path and the reason Class A needs no restore mechanism.

Any failure anywhere inside the single transaction — including `0108`'s own fail-closed
guards — causes PostgreSQL to undo the entire file: the role, its bootstrap `SET`/`INHERIT`
membership, the bootstrap schema `CREATE` grant, all objects, and the MIV rows. The 14 Aug
Phase A failure (`SQLSTATE 42501`, `must be able to SET ROLE "kivo_control_owner"`) is the
worked example: it rolled back completely and left no residue.

**Executor actions on transactional rollback — exactly these:**

1. Do **not** retry. Do **not** repair. Do **not** edit the file. Do **not** grant, revoke or
   `SET ROLE` anything.
2. Capture verbatim: the failing statement, the full error text, the `SQLSTATE`, the timestamp.
3. Run the **residue checklist** (read-only) and record every result:
   * `kivo_control_owner` absent from `pg_roles`;
   * `public.member_identity_versions`, `public.control_operations`,
     `public.conversation_audit_failures` all absent;
   * `public.kv_control_result` absent;
   * all 21 functions absent; all 9 triggers absent; all 15 policies absent;
   * **all 41 constraints and all 16 index relations of §2.6.1 absent** (they fall with their
     tables, so this is a check that the tables really are gone, not a separate cleanup);
   * all eight A1 columns absent;
   * no `0108` migration-ledger row;
   * `count(public.members)` = `N` from B-3, with no evidence of mutation;
   * `count(public.conversations)` = B-4; `count(public.conversation_assignment_events)` = B-5;
   * `has_schema_privilege('kivo_control_owner','public','CREATE')` not applicable (role absent).
4. Report to PM. **Any residue at all = HARD STOP (HS-14)** and an incident, because it means
   the transaction wrapper did not hold.

### 5.3 Tier R-B — post-commit reversal (Change Class A), governed and manual

Applies **only** if `0108` committed and an authorized decision is made to reverse it. Never
part of a replay. Requires its own Founder authorization; the reversal script must exist and
be reviewed before the forward run (§5.1).

**Pre-reversal guard — mandatory.** Before dropping the eight A1 columns:

```sql
select count(*) from public.conversation_assignment_events
where transition_id is not null or operation_id is not null
   or actor_kind is not null or is_canonical is not null
   or actor_member_version is not null or actor_user_id is not null
   or actor_label is not null or actor_role is not null;
```

Expected: `0`. **Non-zero = HARD STOP.** Non-null values mean a later stage populated
canonical evidence; dropping the columns would destroy it. Reversal is then not available
without a separate adjudication.

Equally: reversal must **not** delete MIV rows individually — MIV carries no-delete and
no-truncate triggers by design. MIV is removed by dropping the table, or not at all.

**Exact reversal, one transaction, `ON_ERROR_STOP=1`, in this order:**

1. **Drop the seven policies on pre-existing tables** —
   `a1_control_owner_sel`, `a1_control_owner_ins` on `public.conversation_assignment_events`;
   `messages_control_owner_sel` on `public.messages`;
   `customers_control_owner_sel` on `public.customers`;
   `restaurants_control_owner_sel` on `public.restaurants`;
   `members_control_owner_sel` on `public.members`;
   `conversations_control_owner_rw` on `public.conversations`.
2. **Drop the eight A1 columns** (guard above must have passed): `actor_role`, `actor_label`,
   `actor_user_id`, `actor_member_version`, `is_canonical`, `actor_kind`, `operation_id`,
   `transition_id`.
3. **Drop the sixteen control functions — by exact signature, never by wildcard.** `0108`
   *applies* its lockdown by pattern (§2.6 mechanism note); reversal must not. A pattern-based
   `DROP` would delete any unrelated pre-existing function matching `kv_control_%`,
   `kv_sys_control_%` or `kv_tg_%`. Drop exactly these sixteen and, in step 5, exactly the five
   trigger functions. If a signature is absent, stop and report — do not substitute a pattern
   match:
   * `public.kv_control_create_conversation(uuid,uuid,uuid,text)`
   * `public.kv_sys_control_create_conversation(uuid,uuid,uuid,text)`
   * `public.kv_control_claim(uuid,uuid,uuid,text)`
   * `public.kv_control_reassign(uuid,uuid,uuid,uuid,text)`
   * `public.kv_control_return_to_kivo(uuid,uuid,uuid,text)`
   * `public.kv_control_release_hold(uuid,uuid,uuid,text,text)`
   * `public.kv_control_clear_stale_assignee(uuid,uuid,uuid,text)`
   * `public.kv_control_close(uuid,uuid,uuid,text,text)`
   * `public.kv_control_set_human_idle(uuid,uuid,uuid,text)`
   * `public.kv_control_escalate(uuid,uuid,uuid,boolean,text,text)`
   * `public.kv_sys_control_escalate(uuid,uuid,uuid,boolean,text,text)`
   * `public.kv_sys_control_reopen_closed(uuid,uuid,uuid,uuid,text)`
   * `public.kv_sys_control_timeout_return(uuid,uuid,uuid,bigint,boolean,integer,text,timestamptz,text)`
   * `public.kv_control_create_safety_conversation(uuid,uuid,uuid,text,uuid,text,text,text)`
   * `public.kv_control_transition(uuid,uuid,uuid,text,text,boolean,uuid,text,text,uuid,text,text,text,text)`
   * `public.kv_control_assert_actor(uuid,text,boolean)`
4. **Drop the three tables**, in FK order — `public.conversation_audit_failures`, then
   `public.control_operations`, then `public.member_identity_versions`. **All 41 constraints and
   all 16 index relations of §2.6.1**, plus their triggers and eight policies, go with them and
   are **never dropped separately**. No `CASCADE`: if a drop needs `CASCADE`, something outside
   the boundary depends on it — stop instead.
5. **Drop the five trigger functions** (now unreferenced): `public.kv_tg_a2_parent_guard()`,
   `public.kv_tg_a0_audit_exclusivity()`, `public.kv_tg_miv_close_only()`,
   `public.kv_tg_evidence_no_truncate()`, `public.kv_tg_evidence_immutable()`.
6. **Drop the type** `public.kv_control_result`.
7. **Revoke the additive grants** from `kivo_control_owner`: the column-scoped `INSERT`/`UPDATE`
   on `public.conversations`; `SELECT, INSERT` on A1; column-scoped `SELECT` on
   `public.messages`; `SELECT` on `public.customers`, `public.restaurants`, `public.members`,
   `public.conversations`; `EXECUTE` on `extensions.digest(bytea,text)`; `USAGE` on schemas
   `extensions`, `auth`, `public`.
8. **Drop the role** `kivo_control_owner`. By this point it should own nothing and hold no
   privilege; the inert `ADMIN`-only membership record described in §2.6 is removed with the
   role and is not an obstacle. If the drop reports dependent objects, stop — the enumeration
   above is incomplete for the actual state (HS-18).
9. **Delete the `0108` migration-ledger row only**, if one was inserted.

**Out of reversal scope:** `0107`/M-0 stays applied. Reversing M-0 is not covered by this
procedure and would need its own authorization. Nothing may be dropped that is not listed above.

**Reversal verification:** re-run the §3.2 capture set with byte-identical query text and
require equality to the before-state, plus the §5.2 residue checklist. Record both.

### 5.4 Change Class B bounded restoration — one unambiguous rule

Class B has no transactional free ride: an owner transfer or a revoke that commits stays
committed. Revision 1 left the authority for reversing it ambiguous — it demanded a
pre-authorized reversal while defining that reversal from values that only exist at execution
time. This section replaces that with a single rule.

#### 5.4.1 The rule, and the complete failure-state map

**The KIV-25 forward-change authorization covers exactly one further action: a bounded
restoration of the originally authorized named objects to their exact §3.3 captured
before-state.** Nothing else is covered.

Bounded restoration is **restoration, not a second forward attempt**, and therefore **does not
violate HS-19**. The single-attempt rule governs forward mutations. Saying so explicitly is the
point: without it, an executor facing a failed verification would be frozen between an unsafe
committed state and a rule that appears to forbid acting.

##### 5.4.1.1 The four post-commit states (N-3)

Class B runs **one transaction per invariant group** (§5.4.3), so "committed" is not binary
across the change. Every way the change can end after at least one group has committed is
mapped below. **The executor matches the observed facts to exactly one row and follows it. No
inference, no in-window policy choice.**

| State | What it is | Mandatory read-only determination, first | Bounded restoration authorized? | Holding state? |
|---|---|---|---|---|
| **S-1** | **Full commit + verification failure.** Every invariant group committed, and a §7 verification failed — read-backs 1–5 (§7.2), read-back 6 (§7.3), or the §7.5 L-7 post-release re-verification | Re-read, read-only, the actual current owner / RLS / FORCE RLS / grant state of **every** named object, and record it beside the captured before-state | **Yes** — under the original authorization, scoped to §5.4.3 | Only if the restoration itself fails (§5.4.5) |
| **S-2** | **Partial commit.** At least one invariant group committed; a later group errored or aborted | Determine **per group** which committed and which did not, and **per object** the actual current state, read-only | **Yes** — applied to the **committed groups only**. Groups that did not commit have nothing to restore and must not be touched | Only if the restoration itself fails |
| **S-3** | **Any HARD STOP after at least one group committed** — including HS-12 (unexpected SQL error), HS-22 (a §7 assertion failed), HS-25 (read-back 6 condition), HS-13, HS-10, HS-11 | The same per-group and per-object read-only determination as S-2 | **Yes**, except in the S-3E cases below | Only if the restoration itself fails |
| **S-3E** | **S-3 exceptions.** The HARD STOP is **HS-20** (an object outside the authorized named set was read-modified), or **HS-24 / HS-18-style boundary breaches**, or the actual state **cannot be determined read-only** | Attempt the read-only determination; record that it could not be completed, or record the out-of-boundary object | **No.** Restoration is bounded to the named object set, so a breach of that set cannot be repaired inside this authority | **Yes — §5.4.5 immediately** |
| **S-4** | **Unknown commit outcome** after session or connectivity loss (HS-15) | **Mandatory and first: re-establish a read-only session and determine, per group and per object, the actual committed state from the catalog. No mutation of any kind — not restoration, not cleanup, not a retry — until that determination is complete and recorded in E-9** | **Only after determination**, and only if it resolves cleanly to S-1 or S-2 → then follow that row. If it resolves to S-3E, or cannot be resolved read-only, → **no** | **Yes**, whenever S-4 does not resolve cleanly to S-1 or S-2 |

##### 5.4.1.2 Default-deny

**If the observed facts match no row, or match more than one row, the holding state (§5.4.5)
applies.** The executor does not pick the closest row, does not blend rows, and does not
proceed on the reading that permits more action. Ambiguity resolves toward doing nothing.

##### 5.4.1.3 Two rules that hold in every state

* The **read-only determination always comes first**. In every row above, no mutating statement
  may be issued before the determination is complete and written to E-9. This is what makes
  "unknown outcome" safe.
* Entering bounded restoration under S-1, S-2 or S-3 is **still not a second attempt under
  HS-19**, and still may run **only** the RM-VERIFY-verified text of §5.4.2.

##### 5.4.1.4 Class A has no equivalent

Class A applies `0108` as **one whole-file transaction** (PF-3), so it has no partial-commit
state: it either committed entirely or rolled back entirely (§5.2). The S-1…S-4 map is a Class B
construct and must not be read across to Class A. Class A's post-commit reversal remains §5.3,
under its own separate Founder authorization (§5.1).

#### 5.4.2 Skeleton, materialization, and independent verification of the exact text (N-2)

Revision 2 separated the *plan* from the *values* but left the executor as the only reader of
the literal SQL that could actually run against production. Revision 3 closes that: **the exact
executable text is independently verified before the forward mutation.**

1. **Skeleton — authored and independently reviewed.** Before the forward change (§2.7 item 5)
   the executor authors a **restoration plan skeleton**: the exact ordered statement forms,
   naming every originally authorized object, with the captured values left as named
   placeholders. The independent reviewer reviews this skeleton.
2. **Capture.** The §3 before-state capture is taken, including §3.3 per named object.
3. **Materialization.** The executor binds each placeholder to the concrete value read from the
   §3.3 capture, producing the **literal statement text that would be run**. The executor
   computes its **SHA-256, byte count and line count** and files it as artifact **E-9-RM**.
4. **RM-VERIFY — independent verification of that exact text.** The **restoration verifier**
   (§1), who is not the executor and did not author the skeleton, receives E-9-RM **by
   fingerprint** and checks, read-only, all seven:
   1. every statement is an instance of a statement in the reviewed skeleton — **no statement
      exists without a skeleton counterpart**;
   2. statement **count and order** match the skeleton;
   3. every bound value equals the corresponding value in the **§3.3 capture artifact itself**,
      not in any executor summary of it;
   4. every object named appears in the **KIV-25 authorization's named-object set**;
   5. every statement restores only owner, `relrowsecurity`, `relforcerowsecurity` or a captured
      grant — **nothing else**;
   6. **no statement grants `BYPASSRLS`**, touches an unnamed object, creates or drops anything,
      or writes row data;
   7. the SHA-256 the verifier checked **equals** the SHA-256 the executor holds.
   The verifier records **PASS or BLOCK against that exact SHA-256**. Only PASS proceeds.
5. **Freeze.** The verified text is frozen by fingerprint. **The executor may execute only text
   whose SHA-256 equals the RM-VERIFY-PASSed value.** It re-computes the fingerprint immediately
   before any restoration and compares.
6. **Only then may the forward change run.**

**Fail-closed conditions, all before the forward mutation:**

* materialization cannot be completed, or the capture is incomplete → **HARD STOP (HS-26)**;
* the materialized text has no RM-VERIFY PASS, or the PASS is recorded against a different
  SHA-256 than the executor holds, or the verifier BLOCKed → **HARD STOP (HS-28)**;
* at restoration time the recomputed fingerprint differs from the verified one → **HARD STOP
  (HS-28)**; the drifted text is never run and never re-materialized in-window.

So: the plan is pre-reviewed, the values are captured before execution, **and the exact literal
statements that could hit production carry an independent PASS at a matching fingerprint** —
before there is anything to restore. Executor self-read is explicitly **not** sufficient.

#### 5.4.3 Bounds on the restoration

* **Objects:** only the objects named in the original KIV-25 authorization. An object not named
  there may not be touched even to restore it — that is HS-20.
* **State:** only owner, `relrowsecurity`, `relforcerowsecurity`, and the captured grant set
  (same grantees, same privilege types, same column scopes). Revoke exactly what the forward
  change added; restore exactly what it removed.
* **Text:** only the **RM-VERIFY-PASSed** materialized text of §5.4.2, identified by its exact
  SHA-256 and re-fingerprinted immediately before use. **No adaptation, no newly invented SQL,
  no in-window authoring, no re-materialization in-window.** A statement that is not in the
  verified text is not run.
* **Scope under S-2:** when §5.4.1 resolves to a partial commit, only the statements belonging
  to the **committed groups** are run. Statements for groups that never committed are skipped,
  not adapted; skipping them is recorded in E-9.
* **No privilege** is restored that the capture does not show. **`BYPASSRLS` is never granted**
  as part of a restoration, whatever the capture appears to show — if the capture shows the
  prior owner held it, that is a finding for PM, not a value to restore silently.
* **Transaction:** one transaction per invariant group, `ON_ERROR_STOP=1`.
* **Ingress:** any §4.3 ingress hold stays engaged throughout the restoration and is reverted
  only after §5.4.4 verification passes.

#### 5.4.4 Mandatory obligations, all three

1. **Full transcript** of the restoration, to the §8 E-7/E-9 standard.
2. **Verification**: re-run the §3.2 capture set with byte-identical query text and require
   equality to the recorded before-state, per object and per privilege.
3. **PM notification** the moment restoration is entered — not at the end of the window. The
   notification states which objects, which verification failed, and the materialized plan
   reference.

A restoration that is not transcribed, not verified, or not notified is not complete, and the
change may not be reported as reverted.

#### 5.4.5 Holding state — when restoration is not available or does not complete

The holding state is entered whenever §5.4.1 routes to it — **S-3E**, an unresolvable **S-4**,
the §5.4.1.2 default-deny rule, or a bounded restoration that has itself failed part-way. It is
defined so that no one has to invent one under pressure:

1. **Stop all mutation immediately.** No retry of the forward change, no retry of a failed
   restoration statement, no repair, no cleanup.
2. **Ingress:** if the alpha ingress was live, the §4.3 ingress hold **stays engaged**. If it
   was not live, it stays not-live — it must not be brought up to "test" anything.
3. **Notify PM at once**, with the transcript, the exact statement that failed, the `SQLSTATE`,
   and a read-only statement of the current actual state of every named object.
4. **Capture and freeze evidence** (§8). Nothing is overwritten.
5. **Wait.** Any further action — completing the restoration, rolling forward, or any other
   remediation — requires a **new Founder authorization** and a fresh PM executor release. The
   executor does not choose between them.
6. The holding state is an incident. KIV-145 must treat it as a **blocking finding**, not a
   partial pass.

This condition is **HS-27**.

### 5.5 Reversal is not recovery of downstream effects

If reversal follows a period in which the application ran against the changed state, the
reversal restores structure only. Any downstream data question is a separate, separately
authorized matter.

### 5.6 Explicitly not rollback mechanisms

Point-in-time recovery; Supabase project restore, pause or branch reset; restoring a snapshot;
dropping unrelated objects; disabling RLS; granting `BYPASSRLS`; editing `0108`; renumbering
migrations; creating a `0109` "fix". None of these is authorized by this procedure, and none
may be invoked to escape a HARD STOP.

---

## 6. HARD STOP / ABORT CONDITIONS

**Meaning of HARD STOP.** Stop at once. Do not adapt, repair, improvise, retry, widen scope,
or take "one more read to be sure" beyond the read-backs listed here. Preserve all evidence.
Report to PM with the exact condition, verbatim error text and captured state. **A HARD STOP
consumes the authorization**: resumption requires a fresh Founder/PM release, not a decision
by the executor.

| ID | Condition |
|---|---|
| HS-1 | Project ref is not `zlighrbsjexrozrmuwpw`, is ambiguous, or cannot be stated back |
| HS-2 | Source fingerprint mismatch, or a pin from any commit/branch other than §2.3 |
| HS-3 | Single-transaction wrapping cannot be proved for the runner |
| HS-4 | PF-4a or PF-4b returns any row (`kivo_control_owner` or a membership pre-exists) |
| HS-5 | PF-4c shows `PUBLIC` holds `CREATE` on schema `public` |
| HS-6 | `0107`'s `conversations_restaurant_id_id_key` is absent |
| HS-7 | Class B before-state (owner / RLS / grants) cannot be captured or read back |
| HS-8 | Any §3 before-state capture is missing, incomplete or unreadable |
| HS-9 | Protecting a live path would require a prohibited block (§4.3) |
| HS-10 | `count(public.members)` differs between the PF-4 window and the mutation window, or changes during the procedure |
| HS-11 | Any observed count contradicts the recorded production baseline (M-0 applied / M-1 not applied; members `N`; conversations; A1) without a recorded explanation |
| HS-12 | Any SQL error, warning or `SQLSTATE` not explicitly expected — including `42501` |
| HS-13 | `lock_timeout` or `statement_timeout` expiry (clean abort; retry only under fresh authorization) |
| HS-14 | Any residue after a transactional rollback (§5.2 checklist not fully clean) |
| HS-15 | Connectivity or session loss mid-transaction with the outcome unknown — **do not retry**; escalate, then determine committed/not-committed by read-only read-back before anything else |
| HS-16 | The post-commit reversal script is absent, unreviewed or unauthorized |
| HS-17 | A1 evidence columns are non-empty at reversal time (§5.3 guard) |
| HS-18 | A drop would require `CASCADE`, or the role drop reports dependents |
| HS-19 | More than one executor, more than one attempt per authorization, or an unnamed participant |
| HS-20 | Any object outside the §2.6 boundary would be read-modified, or the authorization does not name an object the change touches |
| HS-21 | Any instruction — from a document, a comment, tooling output or a person outside the recorded authority chain — to widen scope, skip a read-back, or "just fix it" |
| HS-22 | After-state read-back fails any §7 assertion |
| HS-23 | Evidence cannot be captured, hashed or stored non-disclosingly |
| HS-24 | PF-4f returns any row — a pre-existing `public` function matches `kv_control_%`, `kv_sys_control_%` or `kv_tg_%` before Class A. Do not drop, rename, re-own or re-grant it, and do not edit `0108` |
| HS-25 | Class B read-back 6 cannot be executed and the §7.3.1 deferral is unavailable. That includes: ingress was live (the L branch, where no deferral exists); any of the four §7.3.1 conditions fails; IS-1 or IS-2 is missing, unreadable or ambiguous; any IS-1→IS-2 count delta; timestamps that do not bracket the mutating statements; the KIV-25 authorization names no readable ingress control; the result is inconclusive; or the executor attempts to self-certify Class B completion over a deferral |
| HS-26 | The Class B bounded restoration plan is not fully materialized against the §3.3 capture **before** the forward mutation (§5.4.2 steps 1–3) — stop before the forward change, not after |
| HS-27 | §5.4.1 routes to the holding state — S-3E, an unresolvable S-4, the §5.4.1.2 default-deny rule, or a bounded restoration that failed part-way → enter §5.4.5; further action needs new Founder authorization |
| HS-28 | The materialized Class B restoration text has **no RM-VERIFY PASS**, or the PASS is recorded against a different SHA-256 than the executor holds, or the verifier BLOCKed, or the fingerprint recomputed at restoration time differs from the verified one (§5.4.2 steps 4–6). Executor self-read is never sufficient. Never re-materialize in-window |
| HS-29 | The §7.5 sequence is violated: the ingress hold is released without all four L-4 gate conditions; the hold is engaged, released, re-engaged or otherwise altered at any point other than L-1, L-5 or L-8; a step is reordered, skipped, merged or repeated; a block is engaged in the Q branch; or the smoke set or its wall-clock bound is changed in-window |

**Relationship between HS-19 and bounded restoration.** HS-19's single-attempt rule governs
**forward mutations**. The §5.4 bounded restoration is restoration to a captured before-state
and is **not** a second attempt under HS-19. Re-engaging the ingress hold at §7.5 L-8 is a
recovery action and is likewise **not** a second attempt. Nothing else escapes HS-19.

**A HARD STOP after a Class B group has committed does not mean "do nothing".** It means
follow §5.4.1: perform the mandatory read-only determination first, then take exactly the
verdict that state's row gives — bounded restoration under the RM-VERIFY-PASSed text, or the
§5.4.5 holding state. The general "stop and report" rule of this section is what applies
**before** anything has committed.

**No-silent-repair rule.** There is no condition under which the executor invents a fix. The
14 Aug Phase A run is the standard to reproduce: it hit `42501`, stopped without repair,
workaround, source edit, privilege change, alternate execution path or downstream action.

---

## 7. AFTER-STATE VERIFICATION AND APPLICATION RECOVERY

### 7.1 Change Class A after-state read-backs

Run with byte-identical query text to §3.2 where applicable. Every assertion must hold; any
failure is HS-22.

**Role:** `kivo_control_owner` exists with `rolcanlogin=false`, `rolsuper=false`,
`rolbypassrls=false`, `rolcreatedb=false`, `rolcreaterole=false`, `rolinherit=false`,
`rolreplication=false`; `has_schema_privilege('kivo_control_owner','public','CREATE')` =
**false** (the bootstrap grant was withdrawn).

**Membership:** at most **one** row in `pg_auth_members` for `kivo_control_owner`; if present
it is `admin_option=true, set_option=false, inherit_option=false`, its member is the governed
executor, and its grantor is a superuser. Anything else means section 16's cleanup did not
complete as designed.

*Clarification of `at most one` versus §2.6's `exactly one` (OBS-3).* Both are correct at their
own scope and neither weakens `0108`. Section 16 enforces the upper bound `≤ 1` — it raises
when more than one membership remains — and that bound holds for **any** executor, which is why
the assertion here is `at most one`. §2.6 states what the **governed production path**
specifically expects: a non-superuser executor triggers PostgreSQL's automatic `CREATE ROLE`
grant, so **exactly one** inert record is expected there, while a superuser executor would leave
none. The executor records which of the two cases applies, and the recorded case must match the
executor's actual `rolsuper` value from capture B-6. A count of zero under a non-superuser
executor, or any count above one under either, is HS-22.

**Tables:** all three exist, owner `kivo_control_owner`, `relrowsecurity=true` **and**
`relforcerowsecurity=true`.

**Objects:** the **complete §2.6.1 inventory — 41 constraints and 16 index relations** — plus
9 triggers, 15 policies, the type, and all 21 functions present, applying the §2.6.1 counting
rule (`pg_constraint` for the 41; `pg_class`/`pg_indexes` for the 16; the two system-named
primary keys asserted by table and `contype`, not by name). Every function owned by
`kivo_control_owner`; `EXECUTE` revoked from `PUBLIC`, `anon`,
`authenticated`, `service_role` and then granted **only** as designed — the nine member
functions to `authenticated`, the five system functions to `service_role`, and F15
`kv_control_transition` / F16 `kv_control_assert_actor` granted to **no one**. Nothing granted
to `anon` or `PUBLIC` anywhere.

**Pattern closure (PF-4f counterpart):** re-run the PF-4f query. It must now return **exactly
21 rows — the 21 functions of §2.6 and no others**, all owned by `kivo_control_owner`. A 22nd
match means an unrelated function was re-owned and had its grants stripped by the wildcard
scan, i.e. the change went outside its declared boundary. That is HS-22, and it is also a
finding PM must adjudicate before any reversal is attempted.

**A1:** the eight columns exist, are nullable, and every one is **entirely NULL** — M-1 adds
no data to A1.

**MIV:** `count(public.member_identity_versions)` = `N` from B-3 = `count(public.members)`;
every member has exactly **one** row; every row is version 1 and open; `ux_miv_open_version`
enforces it.

**Unchanged baselines:** `count(public.members)` = B-3 with no evidence of mutation (B-13
fingerprint method); `count(public.conversations)` = B-4;
`count(public.conversation_assignment_events)` = B-5.

**Ledger:** exactly one new row, for `0108`, and no other.

**Baseline consequence:** on full pass, the production baseline advances to
**M-0 applied / M-1 applied**. That advance is provisional until independently verified
(KIV-159 condition 5) and confers no downstream authority.

### 7.2 Change Class B after-state — the six PF-R1 read-backs

All six, in this exact form, per PF-R1:

1. the **intended owner**;
2. owner **`rolbypassrls = false`**;
3. **RLS enabled**;
4. **FORCE RLS enabled**;
5. **service-role grants revoked as designed**;
6. **required application paths still functioning** — **when** it runs is fixed by **§7.5**
   (after the ingress hold is released in the live branch; in sequence in the not-live branch),
   and the only permitted deferral is defined in **§7.3.1**, which never treats a deferral as a
   pass.

**Read-backs 1–5 versus read-back 6.** Read-backs 1–5 are pure catalog reads: they need no
traffic and are runnable while an ingress hold is engaged. Read-back 6 needs live ingress. That
asymmetry is why §7.5 gates hold release on 1–5 and runs 6 after release — and why 1–5 must
then be **re-read after** the smoke check (§7.5 L-7), since releasing ingress puts real traffic
against the changed grants.

Plus PF-R1's standing constraints: FORCE RLS does **not** constrain a role holding
`BYPASSRLS`; revoking the service-role table grant is the control that removes its direct
access; ownership transfer to the non-`BYPASSRLS` control owner is load-bearing; and the
result must **never** claim FORCE RLS alone contains `service_role`. A report that makes that
claim is not acceptable evidence regardless of the read-back values.

### 7.3 Application recovery, and the only permitted deferral of read-back 6

1. **Revert every block engaged in §4**, in reverse order, and verify the revert by read-back.
   No block may outlive the window.

   **For Class B the revert is not free-standing — it is step L-5 of the §7.5 sequence, and
   §7.5 is authoritative.** Revision 2 said the hold was reverted "only after §7.2 has passed";
   that was circular, because §7.2 includes read-back 6, whose smoke flow begins with WhatsApp
   ingress being accepted, which the hold prevents. §7.5 replaces that with an explicit release
   gate on read-backs **1–5 only**, followed by read-back 6 after release and a mandatory
   re-verification afterwards. Do not apply this item to Class B independently of §7.5.
2. **Confirm the required alpha application paths still work.** For Class B this is read-back 6
   and is **mandatory**. The bounded smoke set is: WhatsApp ingress accepted → conversation
   readable → operator can read conversations / orders / menu → outbound reply path available.
3. **Bounds on the smoke check.** Non-destructive and test-marked only. No real customer is
   messaged. No deployment, Meta/account action, restaurant action or alpha traffic is
   performed — all are outside this procedure. A path is never reported working on inference.

#### 7.3.1 Deferral of read-back 6 — the exact and only permitted condition

Revision 1 called read-back 6 mandatory and simultaneously let the executor mark it deferred.
That was fail-open: it let the executor self-decide that the check was unrunnable and route
around HS-22. The rule is now closed.

**A deferral is permitted only when the recorded §4.3 evidence proves the alpha ingress was not
live for the whole window.** There is no other permitted condition. This is the **not-live
branch, Q-5, of the §7.5 sequence**; in the live branch a deferral does not exist at all.

**Proving "the whole window" (OBS-2).** A pre-change record alone cannot prove a window. The
proof requires **two objective ingress-state points plus unchanged inbound deltas**, all three
of which must hold:

| | Point | Content |
|---|---|---|
| **IS-1** | At §3 capture, **before** the change (capture line **B-14**) | The enabled/disabled state of the governed alpha ingress control named in the KIV-25 authorization, plus `count(public.messages)`, `count(public.conversations)` (B-4) and `count(public.conversation_assignment_events)` (B-5), with one statement timestamp |
| **IS-2** | At **end of window**, after all other read-backs and before evidence packaging (§7.5 Q-5) | The same four values, read with **byte-identical query text**, with its own statement timestamp |

The deferral is permitted **only if all of the following hold together**:

1. IS-1 shows the governed ingress control **not enabled**;
2. IS-2 shows the governed ingress control **not enabled**;
3. all three counts are **identical** between IS-1 and IS-2 — no inbound message, conversation
   or assignment event arrived during the window;
4. the IS-1 and IS-2 timestamps **bracket** every mutating statement in the transcript.

Any delta in any count, either point showing the control enabled, a missing or ambiguous point,
or timestamps that do not bracket the work, means ingress was live or its state is unproven.
The deferral is then unavailable and the condition is **HARD STOP (HS-25)**.

If the KIV-25 authorization does not name a governed ingress control whose state can be read
read-only, IS-1 and IS-2 cannot be recorded, so no deferral is provable — also **HS-25**.

When that exact condition holds, the deferral carries all of the following, together:

* it is recorded in **E-10** as **`READ-BACK 6 NOT EXECUTED — DEFERRED`**, citing the E-6
  ingress-state evidence that permits it;
* it is **explicitly not accepted as KIV-25 completion**. Class B is **incomplete** while it
  stands. The executor may not report KIV-25 as done, satisfied, or passing;
* it is carried as an **explicit blocking precondition into KIV-145 and into alpha GO**, and
  stays blocking **until the path check is actually executed and passes**. KIV-145 may not
  issue a PASS over a standing deferral;
* it is stated in the handback as an open blocking item, in those words, not as a footnote.

**Outside that exact non-live condition, inability to run the path check is a HARD STOP
(HS-25).** That includes: ingress was live and the check cannot be run; the E-6 record is
missing, incomplete or ambiguous about liveness; the executor believes the check is
"impractical", "not meaningful here", or blocked by tooling; or the check ran and its result is
inconclusive. An inconclusive result is a failure, not a deferral.

**The executor may not self-certify completion on a deferral.** Recording a permitted deferral
is the executor's whole authority over read-back 6; deciding whether Class B is nevertheless
acceptable belongs to KIV-145 (§7.4). An attempt to self-certify is **HS-25**.

**A deferral never satisfies HS-22.** HS-22 fires for any §7 assertion that fails; §7.3.1 does
not exempt read-back 6 from it, it only defines the narrow case in which the read-back may go
unexecuted and remain openly outstanding.

4. **Nothing is "warmed up", re-run or nudged** to make a read-back pass.

### 7.4 Independent verification — no executor self-acceptance

The executor packages evidence and stops. Acceptance is a separate act by a reviewer who is
**separately released by PM, did not author this procedure, and did not execute the change**:

* **Class A** — KIV-159 condition 5: separate independent post-execution verification, required
  before any downstream G2 work may rely on the production result. The executor's own §7.1
  read-back is that reviewer's input, never a substitute for them.
* **Class B** — KIV-145, which independently establishes the intended state and every read-back
  including the application-path non-regression, and which must BLOCK on a standing §7.3.1
  deferral or any unproven security fact.

Until that acceptance is recorded the result is evidence only. Nothing downstream proceeds on
it, and no executor statement — however complete — converts it into acceptance.

### 7.5 Class B execution sequences — the only two permitted orders (N-1)

Revision 2 contained a circular dependency for live ingress: §4.3 engaged a hold, §7.3 released
it only after §7.2 passed, §7.2 included read-back 6, and read-back 6's smoke flow begins with
WhatsApp ingress being accepted — which the hold prevents. The live branch could therefore
never complete, and §7.3.1's deferral is unavailable when ingress is live. That trap sat on an
alpha-critical safety control.

This section replaces it. **There are exactly two permitted Class B orders, chosen once by the
recorded IS-1 ingress state, before any mutation. Every branch below is pre-decided; no step
requires executor judgement, and no step permits an in-window policy choice.**

Which sequence applies is not a choice: **IS-1 (B-14) enabled → §7.5.1 (L). IS-1 not enabled →
§7.5.2 (Q).** If IS-1 cannot be read, neither sequence starts — that is HS-25 at the entry
checklist, before any mutation.

#### 7.5.1 Live-ingress sequence — L-0 … L-9

| Step | Action | Pre-decided outcome |
|---|---|---|
| **L-0** | §2.7 entry checklist complete, including the RM-VERIFY PASS of §5.4.2 and the §3 capture with **IS-1 recorded as enabled** | Any item unsatisfied → do not start |
| **L-1** | **Engage the reversible ingress hold** (§4.3), using the governed safety ingress/hold control only. Record the engage timestamp in E-6 | Prohibited block methods (§4.3) are never used |
| **L-2** | **Execute the forward change** — one transaction per invariant group, `ON_ERROR_STOP=1` | Any error → §5.4.1 state map (S-2 or S-3), **hold stays engaged** |
| **L-3** | **Held-state read-backs: run read-backs 1–5 only** (§7.2 items 1–5 — intended owner; owner `rolbypassrls=false`; RLS enabled; FORCE RLS enabled; service-role grants revoked as designed). These are catalog reads and need no traffic. Record every value | **All five must pass.** Any failure → §5.4.1 (S-1/S-2/S-3), **hold stays engaged**. Read-back 6 is **not** attempted here |
| **L-4** | **Release gate.** The hold may be released if and only if **all four** hold: (a) read-backs 1–5 all passed at L-3; (b) the ingress hold is the only block engaged per E-6; (c) no HARD STOP is outstanding; (d) §5.4.1 has not been entered | Any one false → **do not release**. Releasing outside this gate is **HS-29** |
| **L-5** | **Release the ingress hold.** Record the release timestamp in E-6 | **Release is a recovery step, not an acceptance signal.** It does not mean the change passed, and it is never reported as one |
| **L-6** | **Read-back 6 / bounded smoke**, now runnable because ingress is up. The fixed smoke set of §7.3 item 2, test-marked and non-destructive, run **once**, within the wall-clock bound stated in the KIV-25 authorization | Pass → L-7. Fail, error, or bound exceeded → **L-8**. An inconclusive result **is a failure** (§7.3.1) |
| **L-7** | **Post-release re-verification, mandatory.** Immediately re-run read-backs **1–5** with byte-identical query text, and record **IS-2** | Every value must **equal L-3 exactly**. Any difference → **L-8**. This is the step that catches a security invariant disturbed by real traffic after release |
| **L-8** | **Failure branch for L-6 or L-7.** **Immediately re-engage the ingress hold**, record the timestamp, then apply §5.4.1 | Re-engaging the hold is a **recovery action, not a new mutation**, and is **not** a second attempt under HS-19. An L-6 or L-7 failure is an S-1 verification failure unless §5.4.1 places it elsewhere. **§7.3.1 deferral is unavailable in this branch** — ingress was live |
| **L-9** | **Completion for executor purposes only.** Reached only when L-3 passed, L-6 passed, and L-7 matched L-3 exactly. Hold remains released. Package evidence | Acceptance remains KIV-145's under §7.4. The executor reports completion of the sequence, never acceptance of the change |

**Why this is not circular.** The release gate (L-4) depends only on read-backs 1–5, which do
not need traffic. Read-back 6 depends only on the release (L-5), which has already happened.
Nothing waits on itself.

**Why it cannot produce a false pass.** Release is explicitly not a pass (L-5); the security
invariants are re-read *after* traffic (L-7) and must match exactly; and completion (L-9)
requires all three of L-3, L-6 and L-7. Passing L-3 alone completes nothing.

#### 7.5.2 Not-live-ingress sequence — Q-0 … Q-6

| Step | Action | Pre-decided outcome |
|---|---|---|
| **Q-0** | §2.7 entry checklist complete, including RM-VERIFY PASS, and the §3 capture with **IS-1 recorded as not enabled** | Any item unsatisfied → do not start |
| **Q-1** | **No block is engaged and none is permitted** (§4.1, §4.3). Record that finding in E-6 | Engaging a block here is out of boundary |
| **Q-2** | **Execute the forward change** — one transaction per invariant group, `ON_ERROR_STOP=1` | Any error → §5.4.1 state map |
| **Q-3** | **Run read-backs 1–5** (§7.2) | Any failure → §5.4.1 (S-1/S-2/S-3) |
| **Q-4** | **Attempt read-back 6 / bounded smoke** within the same bounds as L-6 | Pass → Q-6. Fail or inconclusive → §5.4.1. Genuinely not runnable → Q-5 |
| **Q-5** | **Record IS-2** and evaluate §7.3.1 | All four §7.3.1 conditions hold → a **permitted deferral**, recorded as `READ-BACK 6 NOT EXECUTED — DEFERRED`, **Class B incomplete**, blocking on KIV-145 and alpha GO. Any condition fails → **HS-25** |
| **Q-6** | **Package evidence** | Acceptance remains KIV-145's. A standing deferral must be surfaced as an open blocking item, never as completion |

#### 7.5.3 Rules binding both sequences

* **No step may be reordered, skipped, merged or repeated.** Doing so is **HS-29**.
* **The ingress hold is touched only at L-1, L-5 and L-8** — engaged, released, re-engaged.
  Any other change to it, at any other point, in either sequence, is **HS-29**.
* **The smoke set and its wall-clock bound are fixed** by §7.3 item 2 and the KIV-25
  authorization respectively. The executor does not choose, extend, retry or narrow either.
* **Deferral exists only in Q-5.** There is no deferral anywhere in the L sequence.
* Every timestamp in both sequences is recorded in E-6, and IS-1/IS-2 must bracket all mutating
  statements (§7.3.1).

---

## 8. EVIDENCE CUSTODY

### 8.1 The evidence set

| Artifact | Content |
|---|---|
| E-1 Authorization record | The Founder authorization, the PM release, the named executor, the single-attempt statement |
| E-2 Source pin | Recomputed SHA-256, byte count and git blob for each pinned file; custody commit and parents |
| E-3 Query text | The exact before/after query text, stored once and hashed (parity rule, §3.1) |
| E-4 Before-state | Full §3.2 capture with timestamps |
| E-5 Preflight | PF-1 … PF-4 results verbatim |
| E-6 Block and ingress record | What was blocked, why it was necessary — or the recorded finding that no block was necessary. For Class B it also carries: which §7.5 sequence applied and the IS-1 value that selected it; **IS-1 and IS-2 in full** (§7.3.1), the only evidence that can permit a deferral; and every §7.5 timestamp — L-1 engage, L-5 release, L-8 re-engage where applicable — which must bracket the mutating statements |
| E-7 Execution transcript | The full runner transcript: command line, every statement outcome, all warnings, all errors, `SQLSTATE`s, start/end timestamps, and the commit-or-rollback outcome stated explicitly |
| E-8 After-state | Full §7 read-back, assertion by assertion, pass/fail each |
| E-9 Residue / reversal / restoration record | §5.2 residue checklist if rolled back; §5.3 record if reversed post-commit. For Class B: the reviewed **skeleton**; **E-9-RM**, the exact materialized restoration text with its SHA-256, byte count and line count; the **RM-VERIFY record** — verifier identity, PASS/BLOCK, and the SHA-256 verified, which must equal E-9-RM's; the **§5.4.1 read-only determination** and which of S-1 … S-4 was matched; and — if restoration ran — its full transcript, the fingerprint recomputed immediately before use, any groups skipped under S-2, the §5.4.4 verification and the PM notification. If the holding state was entered, the §5.4.5 record instead |
| E-10 Path-check record | §7.3 / §7.5 result: which sequence ran, the L-3 read-back values, the L-6 smoke outcome, and the **L-7 post-release re-verification compared value-by-value against L-3**. If read-back 6 was not executed, the verbatim `READ-BACK 6 NOT EXECUTED — DEFERRED` marking, the IS-1/IS-2 evidence and count deltas permitting it (§7.3.1), and the statement that KIV-25 is incomplete and KIV-145 / alpha GO carry a blocking precondition |
| E-11 Manifest | SHA-256, byte count and line count of every artifact above, plus the authorizing issue IDs |

### 8.2 Custody rules

* **Fingerprint everything.** Every artifact gets SHA-256, byte count and line count, recorded
  in E-11. The manifest itself is hashed and that hash is posted to the governing Linear issue.
* **Append-only.** No prior transcript, capture or manifest is ever overwritten, renamed or
  edited. A correction is a new artifact that cites the one it corrects. This is the KIV-14
  standard already in force.
* **Non-disclosure.** Redacted artifacts only: no connection strings, credentials, service
  keys, JWTs, message bodies, customer PII, member emails or phone numbers. Membership
  evidence uses the non-disclosing fingerprint method (B-13), never member rows. If an
  unredacted transcript exists, it stays with the auditor and never enters the repository or
  Linear.
* **Two-place record.** Redacted artifacts land in `docs/governance/` under a normal
  documentation PR (its own separate authorization); the governing Linear issue carries the
  digests and the outcome. Neither alone is the record.
* **Chain closure.** E-2 → E-4 → E-7 → E-8 must be linkable by fingerprint into one
  unbroken chain from pinned bytes to verified after-state. A gap in that chain is a finding
  for the independent reviewer, not a formatting problem.
* **Retention.** Held until the alpha GO/NO-GO decision closes, and preserved thereafter as
  baseline evidence under the closed-evidence-chain control.
* **Failure is evidence.** A HARD STOP, an abort and a rollback are packaged with the same
  completeness as a success. The 14 Aug Phase A failure record is the precedent.

---

## 9. ACCEPTANCE CRITERIA FOR KIV-146

KIV-146 may close when a fresh independent reviewer confirms this procedure:

1. defines entry/preflight and the exact affected production boundary (§2);
2. defines before-state capture and read-back (§3);
3. requires reversible block/drain **only** where the specific change needs it, and says which
   of the two change classes needs it and why (§4);
4. gives exact rollback/restore steps for both change classes, including which authority covers
   which reversal (§5.1), the complete post-commit state map S-1 … S-4 with default-deny
   (§5.4.1), independent verification of the exact executable restoration text (§5.4.2), the
   named-object drop order (§5.3), and a defined holding state (§5.4.5);
5. states closed failure and abort conditions (§6);
6. defines after-state verification and service/application recovery, including the six PF-R1
   read-backs, the two non-circular execution sequences (§7.5), and the single closed deferral
   condition for read-back 6 with whole-window ingress proof (§7.3.1);
7. defines evidence custody (§8);
8. is specific enough to govern KIV-14 and KIV-25 without recreating the old broad maintenance
   program (§0.3);
9. creates no authority and authorizes no mutation.

### 9.1 Known limits the reviewer should test

* **Reviewer must independently recompute the §2.3 fingerprints.** They were verified during
  Revision 1 authoring from the repository and the GitHub PR record, and were independently
  recomputed as exact by KIV-160 Attempt 1; they remain a pin proposal, to be re-verified
  against the live custody state at pin time rather than trusted from this file.
* The `main`-versus-`feat/kiv12-m0-constraint-prestage` divergence (§2.3 note 2) is reported,
  not resolved. Whether the KIV-14 stack should reach `main` before production application is a
  PM/Founder call this procedure does not make.
* Class B's object list is necessarily generic here: KIV-25's authorization must name the exact
  objects before §2.6 can be treated as closed for that change. KIV-160 Attempt 1 adjudicated
  this treatment sufficiently fail-closed as an object-scope rule; §5.4.3 now binds the
  restoration to that same named-object set, so a generic KIV-25 execution has no restoration
  path and cannot pass §2.7 item 5.
* §7.3's path check may still be unrunnable inside the current bounds (no deployment, no Meta,
  no restaurant action, alpha NO-GO). This is not the executor's call: §7.3.1 permits
  non-execution **only** in the Q branch, only on IS-1/IS-2 whole-window evidence with zero
  count deltas, and only as an openly outstanding blocking precondition on KIV-145 and alpha GO.
  The reviewer should test that this closes F-1 and OBS-2 rather than relocating them.
* **The §7.5 sequences assume the KIV-25 authorization supplies two things this procedure
  cannot supply for it:** the name of a governed ingress control whose enabled/disabled state is
  readable read-only (without it, IS-1/IS-2 are impossible and §7.5's branch selection fails
  closed at HS-25), and the wall-clock bound for the L-6/Q-4 smoke check. The reviewer should
  confirm that requiring these of KIV-25 is acceptable, since specifying them here would mean
  designing KIV-25's object scope from this window.
* **RM-VERIFY (§5.4.2) adds one independent read-only check to the Class B critical path.** It
  is deliberately scoped to a short mechanical text and reuses the existing independent-reviewer
  mechanism; it builds no infrastructure. The reviewer should confirm this is the right
  trade-off against N-2's requirement, and that §2.7 item 5, §5.4.2, E-9 and HS-26/HS-28 agree
  exactly, since N-2 required those four to be consistent.
* **F-7 was adopted as PF-4f without touching `0108`.** PF-4f is a read-only assertion about
  production state; it neither narrows the migration's wildcard nor claims to. If the reviewer
  judges the wildcard itself unacceptable, that is a source finding against `0108` under
  separate authority, not something this procedure may fix.
* Revision 2 changed only this file. `0108`, `0107`, the proof harness and every runtime path
  are untouched, and Revision 1's commit was not amended or rewritten.

### 9.2 F-1 … F-7 no-regression record

KIV-160 Attempt 1's findings are closed. Revision 3 touched four sections that carry an F-fix;
in each case it **extends** the fix. The reviewer can check each in one step:

| Closed finding | Its Revision 2 fix | What Revision 3 did | Still closed because |
|---|---|---|---|
| **F-1** deferral fail-open | §7.3.1 narrows deferral to recorded not-live ingress; not KIV-25 completion; blocking on KIV-145 and alpha GO; no self-certification | Added the IS-1/IS-2 whole-window proof (OBS-2) and located deferral at exactly one step, Q-5 | The permitted condition got **strictly harder**, never easier; the L branch has no deferral at all |
| **F-2** restoration authority ambiguous | §5.4 single rule; restoration ≠ second attempt; bounded to captured values; transcript + verification + PM notification; holding state | N-2 added independent verification of the exact text; N-3 added the S-1 … S-4 map and default-deny | Every §5.4 bound is retained verbatim and two more gates were added ahead of the forward mutation |
| **F-3** membership state | §2.6 corrected to the governed non-superuser case | Untouched. §7.1 gained the OBS-3 clarification only | §2.6's text is unchanged; the clarification explains why `≤1` and `exactly 1` coexist and adds an HS-22 trigger |
| **F-4** stale authority wording | §2.1 single-timestamp table | Timestamp refreshed to the Revision 3 release; both statuses re-read and unchanged (Done) | Still exactly one timestamp, still one place |
| **F-5** cross-reference | §2.6 cites §7.1 | Untouched | — |
| **F-6** verbatim PF-4a/PF-4b | Byte-identical to KIV-14; executor re-copies and diffs; KIV-14 authoritative | **Not edited.** Byte identity re-verified by diff against the KIV-14 text during Revision 3 | The two code blocks are unchanged from Revision 2 |
| **F-7** wildcard preflight | PF-4f read-only; §7.1 pattern closure; §5.3 no-wildcard drops; `0108` untouched | Untouched, except that §2.6.1 now makes the object inventory it guards complete | PF-4f, the §7.1 counterpart and the §5.3 prohibition are unchanged; `0108` remains untouched |

No Revision 3 change relaxes a Revision 2 constraint. Where Revision 3 changes ordering (§7.5)
it removes an impossibility rather than a safeguard: the live branch previously could not
complete at all.

### 9.3 Non-authority

This document authorizes nothing. It does not authorize production or Supabase access, SQL or
migration execution, source or runtime change, deployment, Meta/account action, restaurant
action, Khalid-project action, or alpha/Pilot GO. Production remains **M-0 applied / M-1 not
applied**, `public.members` `N = 20`, Pilot/alpha **NO-GO**.
