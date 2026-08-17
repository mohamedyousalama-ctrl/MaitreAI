# KIV-146 — BOUNDED PRODUCTION-CHANGE MAINTENANCE AND ROLLBACK PROCEDURE

**One-restaurant WhatsApp-first controlled alpha · KIV-142 rebaseline**

| Field | Value |
|---|---|
| Issue | KIV-146 — Define bounded production-change maintenance and rollback procedure for alpha |
| Milestone | G2 — Security, order truth, WhatsApp & safety |
| Authored | 17 August 2026 |
| Status | **DRAFT — awaiting fresh independent review.** Not accepted. Not self-approved. |
| Governs | KIV-14 (Change Class A) and KIV-25 (Change Class B) only |
| Replaces | The standalone full P0-MAINT / M2 maintenance-interleave program as an alpha milestone (KIV-142 §"Maintenance/control-plane simplification") |
| Authorizes | **Nothing.** This document is a procedure/evidence gate. |

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
  Change Class B in KIV-144 (Done). Completion and independent acceptance of KIV-146 is a
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
| **Executor** | Runs preflight, before-state capture, the one authorized mutation, after-state read-back, evidence packaging | Approve its own result; adapt, repair or improvise; widen scope; run a second attempt |
| **Independent reviewer** | Accepts or blocks the result (KIV-145 for Class B; KIV-159 condition 5 for Class A) | Have participated in execution |

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
| Authority | KIV-159 APPROVE (not yet recorded at authoring time) | KIV-144 (Done) |
| Nature | Additive DDL + one insert into a new table | Mutating owner / RLS / grant change on existing objects |
| Reversible by transaction alone | **Yes** (§5.2) | **No** — needs the §4 before-state to reverse (§5.4) |
| Block/drain required | **No** (§4.2) | **Conditional** (§4.3) |

Nothing else. A change that is not one of these two is out of scope; do not stretch this
procedure to cover it, and do not treat KIV-144 as covering Class A (KIV-159 says so
explicitly).

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

**PF-4a — `kivo_control_owner` must not pre-exist** (KIV-14 mandated text):

```sql
select
  r.rolname, r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcreatedb,
  r.rolcanlogin, r.rolreplication, r.rolbypassrls
from pg_roles r
where r.rolname = 'kivo_control_owner';
```

**PF-4b — no standing membership on it** (KIV-14 mandated text):

```sql
select
  member_role.rolname as member_role,
  target_role.rolname as granted_role,
  grantor_role.rolname as grantor_role,
  m.admin_option, m.inherit_option, m.set_option
from pg_auth_members m
join pg_roles member_role  on member_role.oid  = m.member
join pg_roles target_role  on target_role.oid  = m.roleid
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
not execute: its rollback is defined by that capture and nothing else. **HARD STOP (HS-7)**.

### 2.6 Exact affected boundary

**Change Class A — objects this change may create or write. Nothing else.**

*New role:* `kivo_control_owner` — `NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE
NOINHERIT NOREPLICATION`, granted to no role at success.

*New tables (3), owned by `kivo_control_owner`, RLS enabled **and** forced:*
`public.member_identity_versions` (MIV), `public.control_operations` (A0),
`public.conversation_audit_failures` (A2).

*New indexes/constraints on those tables (11):* `ux_miv_open_version`, `fk_miv_member`,
`ux_a0_evidence_core`, `a0_restaurant_created_idx`, `a0_conversation_created_idx`,
`a0_actor_member_idx`, `fk_a2_parent_core`, `a2_restaurant_occurred_idx`,
`a2_actor_member_idx`, `a2_restaurant_conversation_idx`, `a2_operation_idx`.

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
Plus the designed `EXECUTE` grants of §7.2 to `authenticated` / `service_role`, and
`SELECT` on MIV to `authenticated`.

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

### 2.7 Entry checklist — all must be true, in order

1. The change is Change Class A or B, named in a recorded Founder authorization.
2. **KIV-146 is complete and independently accepted** (KIV-159 condition 1).
3. For Class B: KIV-14 has completed and been independently verified (KIV-25 is blocked by it).
4. PM has fresh-read custody and pinned the exact bytes (§2.3).
5. The **post-commit reversal script is already authored, independently reviewed and
   separately authorized** (§5.3 — rollback-before-execute rule).
6. PF-1 through PF-4 pass.
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
| B-9 | Existence check for every §2.6 object (role, 3 tables, 11 indexes/constraints, 9 triggers, 15 policies, type, 21 functions, 8 A1 columns) | expected: all absent for Class A |
| B-10 | Owner, `relrowsecurity`, `relforcerowsecurity` for every governed table | the pre-change values Class B must be able to restore |
| B-11 | Grant set for every governed table and function: grantee, privilege type, column scope | the pre-change values Class B must be able to restore |
| B-12 | Migration ledger: `max(version)` and whether a `0108` row exists | |
| B-13 | Non-disclosing member fingerprint evidence consistent with the KIV-14 baseline method | proves `public.members` was not mutated, without disclosing it |

### 3.3 Class B additional requirement

B-10 and B-11 must be captured **per object named in the authorization**, and read back before
proceeding. A Class B change whose exact prior owner, RLS flags and grant set are not on record
has no defined rollback and must not execute.

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

**Revert rule.** Every block engaged must be reverted in reverse order in §7.3, and the revert
must be verified, not assumed. An unreverted block at end of window is an incomplete change.

---

## 5. EXACT ROLLBACK / RESTORE

### 5.1 Rollback-before-execute rule

The reversal path for the specific change must be **authored, independently reviewed and
separately authorized before the forward change runs** (§2.7 item 5). Rollback is never
improvised after a failure. An executor facing an unexpected state has exactly one authorized
move: stop and report (§6).

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
3. **Drop the sixteen control functions** (exact signatures):
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
   `public.control_operations`, then `public.member_identity_versions`. Their indexes,
   constraints, triggers and eight policies go with them. No `CASCADE`: if a drop needs
   `CASCADE`, something outside the boundary depends on it — stop instead.
5. **Drop the five trigger functions** (now unreferenced): `public.kv_tg_a2_parent_guard()`,
   `public.kv_tg_a0_audit_exclusivity()`, `public.kv_tg_miv_close_only()`,
   `public.kv_tg_evidence_no_truncate()`, `public.kv_tg_evidence_immutable()`.
6. **Drop the type** `public.kv_control_result`.
7. **Revoke the additive grants** from `kivo_control_owner`: the column-scoped `INSERT`/`UPDATE`
   on `public.conversations`; `SELECT, INSERT` on A1; column-scoped `SELECT` on
   `public.messages`; `SELECT` on `public.customers`, `public.restaurants`, `public.members`,
   `public.conversations`; `EXECUTE` on `extensions.digest(bytea,text)`; `USAGE` on schemas
   `extensions`, `auth`, `public`.
8. **Drop the role** `kivo_control_owner`. It should hold nothing by then; if the drop reports
   dependent objects, stop — the enumeration above is incomplete for the actual state.
9. **Delete the `0108` migration-ledger row only**, if one was inserted.

**Out of reversal scope:** `0107`/M-0 stays applied. Reversing M-0 is not covered by this
procedure and would need its own authorization. Nothing may be dropped that is not listed above.

**Reversal verification:** re-run the §3.2 capture set with byte-identical query text and
require equality to the before-state, plus the §5.2 residue checklist. Record both.

### 5.4 Change Class B reversal

Class B has no transactional free ride: an owner transfer or a revoke that commits stays
committed. Its reversal is **exactly the §3.3 captured values**, replayed per object:

* `alter table <obj> owner to <captured owner>;`
* restore `relrowsecurity` / `relforcerowsecurity` to the captured booleans;
* re-grant precisely the captured grant set — same grantees, same privilege types, same column
  scopes — and revoke anything the change added.

Rules: one transaction per invariant group; no privilege is restored that the capture does not
show; `BYPASSRLS` is never granted as part of a reversal; and a reversal that would leave the
system in a state matching neither before nor after is not performed — stop and escalate.

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

**Tables:** all three exist, owner `kivo_control_owner`, `relrowsecurity=true` **and**
`relforcerowsecurity=true`.

**Objects:** 11 indexes/constraints, 9 triggers, 15 policies, the type, and all 21 functions
present; every function owned by `kivo_control_owner`; `EXECUTE` revoked from `PUBLIC`, `anon`,
`authenticated`, `service_role` and then granted **only** as designed — the nine member
functions to `authenticated`, the five system functions to `service_role`, and F15
`kv_control_transition` / F16 `kv_control_assert_actor` granted to **no one**. Nothing granted
to `anon` or `PUBLIC` anywhere.

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
6. **required application paths still functioning**.

Plus PF-R1's standing constraints: FORCE RLS does **not** constrain a role holding
`BYPASSRLS`; revoking the service-role table grant is the control that removes its direct
access; ownership transfer to the non-`BYPASSRLS` control owner is load-bearing; and the
result must **never** claim FORCE RLS alone contains `service_role`. A report that makes that
claim is not acceptable evidence regardless of the read-back values.

### 7.3 Application recovery

1. **Revert every block engaged in §4**, in reverse order, and verify the revert by read-back.
   No block may outlive the window.
2. **Confirm the required alpha application paths still work.** For Class B this is read-back 6
   and is mandatory. The bounded smoke set is: WhatsApp ingress accepted → conversation
   readable → operator can read conversations / orders / menu → outbound reply path available.
3. **Bounds on the smoke check.** Non-destructive and test-marked only. No real customer is
   messaged. No deployment, Meta/account action, restaurant action or alpha traffic is
   performed — all are outside this procedure. If the path check cannot be run inside those
   bounds, record it as **deferred to the governed alpha UAT** and say so plainly; do not
   claim a path works on inference.
4. **Nothing is "warmed up", re-run or nudged** to make a read-back pass.

### 7.4 Independent verification

The executor packages evidence and stops. Acceptance is a separate act by a fresh independent
reviewer — KIV-145 for Class B, KIV-159 condition 5 for Class A. Until then the result is
recorded but not relied upon, and no downstream G2 work proceeds on it.

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
| E-6 Block record | What was blocked, why it was necessary, engage and revert timestamps — or the recorded finding that no block was necessary |
| E-7 Execution transcript | The full runner transcript: command line, every statement outcome, all warnings, all errors, `SQLSTATE`s, start/end timestamps, and the commit-or-rollback outcome stated explicitly |
| E-8 After-state | Full §7 read-back, assertion by assertion, pass/fail each |
| E-9 Residue/reversal record | §5.2 checklist if rolled back; §5.3/§5.4 record if reversed |
| E-10 Path-check record | §7.3 result, or the explicit deferral |
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
4. gives exact rollback/restore steps for both change classes, including the pre-authored
   reversal rule and the named-object drop order (§5);
5. states closed failure and abort conditions (§6);
6. defines after-state verification and service/application recovery, including the six PF-R1
   read-backs (§7);
7. defines evidence custody (§8);
8. is specific enough to govern KIV-14 and KIV-25 without recreating the old broad maintenance
   program (§0.3);
9. creates no authority and authorizes no mutation.

### 9.1 Known limits the reviewer should test

* **Reviewer must independently recompute the §2.3 fingerprints.** They were verified once
  during authoring, from the repository and the GitHub PR record; they are a pin proposal, not
  an accepted custody fact.
* The `main`-versus-`feat/kiv12-m0-constraint-prestage` divergence (§2.3 note 2) is reported,
  not resolved. Whether the KIV-14 stack should reach `main` before production application is a
  PM/Founder call this procedure does not make.
* Class B's object list is necessarily generic here: KIV-25's authorization must name the exact
  objects before §2.6 can be treated as closed for that change.
* §7.3's path check may be unrunnable inside the current bounds (no deployment, no Meta, no
  restaurant action, alpha NO-GO). The procedure requires that to be declared as a deferral
  rather than papered over; the reviewer should check that this is acceptable for KIV-25's
  read-back 6, or route it back for tightening.

### 9.2 Non-authority

This document authorizes nothing. It does not authorize production or Supabase access, SQL or
migration execution, source or runtime change, deployment, Meta/account action, restaurant
action, Khalid-project action, or alpha/Pilot GO. Production remains **M-0 applied / M-1 not
applied**, `public.members` `N = 20`, Pilot/alpha **NO-GO**.
