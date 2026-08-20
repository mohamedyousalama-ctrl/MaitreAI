# KIV-14 — A2 ACCEPTANCE-RECOVERY PROCEDURE

**One-restaurant WhatsApp-first controlled alpha · post-KIV-202 MAY STAND · post-PCSB-1/PCSB-2 capture-package HOLD**

| Field | Value |
|---|---|
| Issue | KIV-212 — Remediate KIV-209 procedure after KIV-210 Engineering BLOCK — stale baseline, persistent-session driver, PG17.6 topology |
| Milestone | G2 — Security, order truth, WhatsApp & safety |
| Authored | 20 August 2026 |
| Status | **DRAFT CANDIDATE — awaiting a fresh independent Engineering re-review → separate Quality → separate Auditor chain and external Linear PM terminal acceptance of these exact bytes.** Not accepted. Not self-approved. Builder does not self-approve. Not operative. Not a licence to start PCSB-3. |
| Governs | Whether, and how, **KIV-14 current-state acceptance** may later be declared from the already-committed exact-`0109` production state after KIV-202 Option A, including how a later PCSB-n becomes the **operative prospective baseline**, how invalidation of that baseline fails closed, how any future capture package must be pre-reviewed before authentication, and the pinned persistent-connection / PostgreSQL 17.6 tooling-validation contracts. It does **not** govern Change Class A2 forward execution, §5.7 reversal, Change Class B / KIV-25, deployment, Meta/WhatsApp, restaurant action, or Alpha GO. |
| Replaces | **Nothing until PM terminal acceptance of these exact bytes.** Accepted KIV-146 Revision 6 remains the historical/operative execution law for the KIV-200 window and the held-unused §5.7 path. Previously accepted recovery-procedure commit `235134849099a89bc4176c23914a3429087f6af6` remains the last accepted recovery-procedure text. Blocked KIV-209 candidate `597f79ba3784fe30806eed87f9ab4ec1f5876d14` is the exact predecessor being remediated and is **not** operative. Recovery **execution** remains HOLD pending this remediation chain. This document does not edit, supersede, weaken or silently rewrite Revision 6. |
| Authorizes | **Nothing.** This document is a procedure/evidence gate. Acceptance of this document is not production authority, not SQL authority, not PCSB-3 authority, not KIV-14 acceptance, not a waiver of any historical finding, and not KIV-25 / deployment / Alpha authority. |
| Candidate base | Exact blocked KIV-209 candidate commit `597f79ba3784fe30806eed87f9ab4ec1f5876d14`, whose sole parent is previously accepted recovery-procedure commit `235134849099a89bc4176c23914a3429087f6af6`. Current default `main` is **not** the candidate base. |

---

## 0. WHAT THIS DOCUMENT IS, AND WHAT IT IS NOT

### 0.1 It is

A **standalone, docs-only, fail-closed acceptance-recovery procedure** for one question:

> Can KIV-14 ever be accepted **as a current-state outcome** while the historical KIV-200
> execution remains permanently non-compliant evidence?

It answers that question by defining a **new prospective evidence and authority chain** from the
currently committed exact-`0109` state. It does **not** assume acceptance is possible merely because
the repaired runtime is technically healthy.

The KIV-209 revision closed two load-bearing gaps that the previously accepted bytes left
implicit after two separately governed read-only capture windows ended BLOCK:

1. lawful, append-only **PCSB-n lifecycle and promotion** to exactly one PM-accepted **operative
   prospective baseline**;
2. a completely pre-built, independently reviewed / hash-pinned **PCSB query and client package**
   before any future production authentication.

This KIV-212 remediation additionally closes the three KIV-210 Engineering BLOCK defects, plus
the two material wording cleanups, without widening scope:

3. **fail-closed invalidation** of a complete but stale operative baseline after material drift
   or package invalidation, so §6 / independent recovery review / §9 / AR-E-4 cannot proceed
   against invalidated evidence;
4. a **pinned persistent-connection host-driver contract**: one client connection object, P-0 as
   first SQL with **no SQL of any kind** preceding it, host-process row inspection, same-connection
   continuation through PS-TIME end, non-SQL backend-PID metadata before P-0, and mandatory
   PS-TIME-end reconciliation;
5. a **pinned PostgreSQL 17.6 tooling-validation topology** that classifies every non-shipped
   query as built-in/catalog-only (Class A) or Kivo/Supabase-dependent (Class B) and forbids
   ad-hoc object invention.

It remains a **prospective current-state acceptance procedure**, not a historical waiver.

### 0.2 It is not

* Not a rewrite, patch, waiver or second edition of accepted KIV-146 Revision 6.
* Not a reconstruction of the missing KIV-200 B-11 pre-state.
* Not a conversion of KIV-201 `INDEPENDENT A2 POST-REMEDIATION BLOCK` into PASS.
* Not KIV-14 acceptance, and not a Founder residual-risk decision by itself.
* Not production authority, SQL authority, credential authority, ledger authority, merge
  authority, or reversal authority.
* Not Change Class B / KIV-25 authority, deployment authority, Meta/WhatsApp authority,
  restaurant authority, or Alpha GO.
* Not a licence to manufacture production test state.
* Not a licence to overwrite, rename, complete, or upgrade incomplete **PCSB-1** or **PCSB-2**.
* Not standing authentication authority for PCSB-3 or any later capture window.

### 0.3 Recovery-path existence decision

A defensible recovery path **exists**, but only as **current-state acceptance despite permanently
non-compliant historical execution**. It does **not** exist as a claim that the KIV-200 window was
compliant, that HS-8 was cured, or that B-11 was recovered.

The path is lawful only if every later gate in this document passes, including an **explicit
Founder residual-risk / exception decision** for the irrecoverable historical HS-8 / B-11 gap.
That Founder decision is **not** invented here and is **not** implied by KIV-202 MAY STAND.
If any later gate fails, or if Founder declines the residual-risk decision, **no current-state
acceptance follows**. That failure does **not** automatically route to KIV-190 / §5.7.

If a later independent Engineering, Quality or Auditor review of **these bytes** concludes that
even an explicit Founder residual-risk decision would still be insufficient under the project's
governance law, that reviewer must return BLOCK on this candidate rather than invent authority.
Builder's design choice is that such a Founder decision **can** be sufficient **for current-state
acceptance only**, because Revision 6 §8.2 classifies a custody-chain gap as a **reviewer finding**,
KIV-202 already allowed the committed state to stand, and this procedure refuses to relabel the
broken historical chain as repaired. Builder does **not** claim it is sufficient for historical
execution compliance — that compliance is permanently impossible.

KIV-207 and KIV-208 did **not** close this path. They proved two capture-package / client-tooling
defects after a passing P-0. Recovery execution is therefore **HOLD for procedure/package
remediation**, not `NO LAWFUL CURRENT-STATE ACCEPTANCE PATH`, and not a reversal trigger.

### 0.4 The four distinctions that may never be collapsed

1. **Historical execution compliance** — permanently not clean. KIV-200 crossed accepted
   Revision 6 HS-8. KIV-201 found `B-11 PRE-STATE GAP UNRECOVERABLE FROM AUTHORITATIVE EVIDENCE`.
   That record is immutable.
2. **Current-state technical correctness and safety** — may be established **prospectively** by a
   new live + fixture evidence chain. This is not a rewrite of (1).
3. **Current-state acceptance** — a new governed decision based on the **new** evidence chain
   plus the Founder residual-risk decision in §9. It is never a rewrite of KIV-200 / KIV-201.
4. **Downstream KIV-25 / deployment / Alpha authority** — remains separate. Even a later
   `KIV-14 CURRENT-STATE ACCEPTANCE PASS` does not create it.

### 0.5 Relationship to accepted Revision 6

Accepted KIV-146 Revision 6 at commit `9092758fa60b6ac1024e7e8777ed177636c4faab`, blob
`c16f2bdc84173faefb98a065b02f9fe3b5e24d2a`, SHA-256
`a0471e6ec2de4ca2d44c2ac5787a2e8edbbe4699bb53417f31e49c704c2b3f11`, 315,439 bytes / 3,854 lines,
remains the **historical execution law** for the KIV-200 window and the **held-unused** §5.7
reversal path. This document:

* does **not** edit those bytes;
* does **not** reopen Change Class A2 forward execution (KIV-189 is CONSUMED / SPENT);
* does **not** satisfy, waive or create D-4 (KIV-202 declined `must not stand`; D-4 is NOT
  satisfied; KIV-190 remains UNUSED);
* does **not** disturb Change Class B / KIV-25 semantics;
* may **cite** Revision 6 query forms, P-0-first law, §7.1.1 assertion text, G5, and §8.2
  chain-closure vocabulary by pin, because those are the accepted technical contracts this
  recovery must still honour for **current-state** proof.

This document itself **authorizes no production access or SQL**. Any later live verification,
query-package preparation that is not itself production authentication, or fixture execution
requires a separately issued work order after these bytes are terminally accepted.

### 0.6 Relationship to the previously accepted recovery-procedure bytes

Commit `235134849099a89bc4176c23914a3429087f6af6` was terminally accepted on KIV-206 as the
operative KIV-14 A2 acceptance-recovery procedure. Those exact bytes remain historical accepted
text until a later PM terminal acceptance of a successor.

Blocked KIV-209 candidate commit `597f79ba3784fe30806eed87f9ab4ec1f5876d14` remediates those
accepted bytes for recapture promotion and pre-reviewed packaging. KIV-210 independently
returned `ENGINEERING BLOCK` on those exact bytes for stale-baseline, persistent-session, and
PostgreSQL 17.6 topology defects. Those blocked bytes are **not** operative.

These KIV-212 bytes are a **narrow remediation candidate** of that blocked successor. They
become operative **only** after a fresh Builder → Engineering → Quality → Auditor → PM
terminal-acceptance chain. Until that happens:

* recovery execution remains HOLD;
* no PCSB-3 or later production authentication may be released from this candidate;
* incomplete PCSB-1 and incomplete PCSB-2 remain append-only historical recovery-failure evidence;
* no operative prospective baseline exists.

---

## 1. IMMUTABLE HISTORICAL FACTS

The following are **immutable**. This procedure, any later executor, any reviewer, and any
Founder residual-risk decision must **never** soften, rewrite, reconstruct or relabel them.

1. KIV-200 exact `0109` **committed** on production (`MaitreAi` / `zlighrbsjexrozrmuwpw`).
   Command tags `DO DO DO CREATE FUNCTION DO DO` then `COMMIT`. Body MD5 changed from
   `a5d906876b3b70fa60db3b75ae356595` to `00a73f86a902ff222760ff8fcab8abf1`.
2. KIV-189 is **CONSUMED / SPENT**. No retry or second forward application exists.
3. KIV-200 crossed accepted Revision 6 **HS-8** because mandatory **B-11** was not captured
   before mutation. Incomplete §3 capture is HS-8. This cannot be retroactively rewritten as a
   clean preflight.
4. KIV-201 terminally found exactly `B-11 PRE-STATE GAP UNRECOVERABLE FROM AUTHORITATIVE EVIDENCE`.
5. **Current grants are not the missing historical B-11 pre-state** and may never be presented
   as such. Exact `0109` containing no table/function GRANT DDL is corroborating source evidence
   only; it does not close the missing E-4 capture.
6. KIV-201 returned `INDEPENDENT A2 POST-REMEDIATION BLOCK`, not PASS. PM terminally accepted
   that BLOCK. It is historical evidence and is not converted to PASS by this document or by
   KIV-202.
7. Two required Revision 6 §7.1.1 cases remain **NOT PROVED** in production:
   * actor with no open MIV row — all 20 current members have an open v1 row; manufacturing
     production state is forbidden;
   * invalid actor kind — callable member/system wrappers hardcode valid kinds; the only
     argument-bearing transition path is owner-only; no safe live authenticated path can supply
     an invalid kind.
8. KIV-165's historical 0108 execution/acceptance findings remain historical evidence and were
   **not** retroactively made clean by `0109`. Those findings include HS-12
   (`WARNING: no privileges were granted for "auth"`) and the absent 0108 ledger row.
9. KIV-173's member-path runtime defect is **technically discharged as proven by KIV-201**.
   That discharge is not KIV-14 acceptance.
10. KIV-202 Founder decision allows the repaired committed state to **stand**. It is **not**
    KIV-14 acceptance and **not** a waiver of any historical finding. Exact recorded decision:
    `DECISION — COMMITTED A2 STATE MAY STAND; DO NOT RELEASE KIV-190. Proceed only with a new governed acceptance-recovery procedure; KIV-14 remains blocked until independently accepted.`
11. KIV-190 remains Founder-approved / **UNUSED**. D-4 is **NOT** satisfied. This artifact
    creates **no** reversal authority. A future recovery BLOCK must not automatically consume
    or release KIV-190.
12. KIV-14 remains **blocked / not accepted**. KIV-25 remains blocked. Alpha remains **NO-GO**
    until later separately governed gates.
13. **PCSB-1** (KIV-207) is permanently **incomplete** historical recovery-failure evidence.
    P-0 was first SQL and PASSed. Client `psql` then rejected `\\if not :p0_members_rls_active`
    as invalid boolean `not f`. Remaining PS-* were not captured. This was **not** HS-41.
    Production committed writes = 0. KIV-190 remained UNUSED. PCSB-1 must never be overwritten,
    renamed, completed later, or upgraded to PASS.
14. **PCSB-2** (KIV-208) is permanently **incomplete** historical recovery-failure evidence.
    P-0 was first SQL and PASSed. Host-side inspection of the P-0 row gated continuation. The
    same session captured P-1…P-8, PF-4, G1–G3 and prospective table/column grants. A composed
    non-shipped function-grant query then failed with `column "function_signature" does not exist`
    at `ORDER BY function_signature::text`. `ON_ERROR_STOP=1` terminated psql. Remaining PS-*
    were incomplete. This was **not** HS-41. Production committed writes = 0. KIV-190 remained
    UNUSED. PCSB-2 must never be overwritten, renamed, completed later, or upgraded to PASS.
    Historical labels `PCSB-1` and `PCSB-2` remain factual and are not renamed.

---

## 2. PINNED CUSTODY (READ-ONLY; RECOMPUTE BEFORE ANY LATER EXECUTION)

Repository: `mohamedyousalama-ctrl/MaitreAI`

### 2.1 Accepted Revision 6 procedure

* commit `9092758fa60b6ac1024e7e8777ed177636c4faab`
* sole parent `c7400a1d0159daacd5af3f856bd918f3c485d074`
* path `docs/governance/KIV-146_BOUNDED_PRODUCTION_CHANGE_MAINTENANCE_AND_ROLLBACK_PROCEDURE.md`
* Git blob `c16f2bdc84173faefb98a065b02f9fe3b5e24d2a`
* SHA-256 `a0471e6ec2de4ca2d44c2ac5787a2e8edbbe4699bb53417f31e49c704c2b3f11`
* 315,439 bytes / 3,854 lines

These bytes must remain **unchanged** by this candidate.

### 2.2 Exact accepted `0109` source

* source commit `cc74e14c16a8b5e02d9ea9668976b83de7aeb872`
* path `supabase/migrations/0109_kiv174_member_actor_runtime_repair.sql`
* blob `8923ed066d21a5cbac5f6ffc47606aee9b5c9c07`
* SHA-256 `e1a185e3a38b41fe1c5c9e8f9ebbedaefd88b9151cf390cf0cf22aa9123fa9e3`
* 22,161 bytes / 425 lines
* non-comment privilege statements are only the temporary INHERIT-only membership grant/revoke
  inside the file; **no table/function GRANT DDL**

### 2.3 Accepted integration custody

* merge commit `585d340c6b7ec28618b22c6fec49fd271aa47813`
* parent order `d5b4b1dd0925964ae44d55e125893081afddc651` then `cc74e14c16a8b5e02d9ea9668976b83de7aeb872`
* `0107` blob `d492d2e58fee28c93fd84ec71081dc71c81fce0b`
* `0108` blob `7b500626331dd4eaf4620d29c95953740f6e5541`
* `0108` SHA-256 `00cd7b7fe2ee581df7b9d038301123db45a80962fe8a6ad3c0435e2893dea9ee`

This procedure may **reference** these objects by pinned Git identity. It does **not** merge
them, re-materialize them, or apply them.

### 2.4 Observed production identities at KIV-201 (historical; re-capture required later)

These are **historical independent observations**, not the new prospective baseline:

* repaired body MD5 `00a73f86a902ff222760ff8fcab8abf1`
* PF-4b2 topology `1/0/0/0/0/0`
* P-5 `auth_usage=false`, `auth_create=false`, `public_create=false`
* P-7 members_n=20, miv_rows=20, miv_open_rows=20, miv_non_v1_rows=0
* conversations n=28, CAE n=7
* PostgreSQL `17.6` / `server_version_num=170006`
* KIV-201 current-capture SHA-256s (historical only): table
  `4bd3bad87860f94edf0da9859628dc201744840e44815cc36a9264221711e8d5`; column
  `594728dbb1eaf0b3e3805fbd85b4b2b6e45c5cd5c23279accec03f68f8821120`; function
  `c217b19711468d36966e1a26739dc57e9a6d2870ab03397e8ecd5fba68d3ec25`

Any later live window must **re-capture**. Equality with these values is reconciliation, not
proof that KIV-200 B-11 existed.

### 2.5 Previously accepted recovery-procedure identity (historical accepted text)

* commit `235134849099a89bc4176c23914a3429087f6af6`
* sole parent `9092758fa60b6ac1024e7e8777ed177636c4faab`
* path `docs/governance/KIV-14_A2_ACCEPTANCE_RECOVERY_PROCEDURE.md`
* Git blob `94c1cd7a88846876fef9550ec75c31a616b409b6`
* SHA-256 `e454684b5928f0bcec8af6a7a172b9158ca818ef5952d78487f547dc44ab7ebe`
* 48,059 bytes / 881 lines

These bytes remain historical accepted procedure text until PM terminally accepts a successor.
They are **not** the KIV-212 candidate base.

### 2.6 Blocked KIV-209 revision candidate (historical; this candidate remediates it)

* commit `597f79ba3784fe30806eed87f9ab4ec1f5876d14`
* sole parent `235134849099a89bc4176c23914a3429087f6af6`
* branch at PM intake `claude/kiv-209-a2-acceptance-recovery-remediation`
* path `docs/governance/KIV-14_A2_ACCEPTANCE_RECOVERY_PROCEDURE.md`
* Git blob `c49eec6188beeda47c551f1e0fc0eb37f38ec67e`
* SHA-256 `dfa5a794adc855a2f22c9e17e3de8af1805a0d8f17dba946c17afd725aebde0d`
* 68,104 bytes / 1,179 lines
* KIV-210 verdict `ENGINEERING BLOCK — KIV-209 A2 ACCEPTANCE-RECOVERY PROCEDURE REVISION CANDIDATE`

These exact bytes are the **KIV-212 candidate base**. They are **not** operative.

---

## 3. ROLES, INDEPENDENCE, AND WHAT THIS DOCUMENT AUTHORIZES

### 3.1 Roles for **this procedure artifact**

| Role | Holds | May not |
|---|---|---|
| **Builder (KIV-212)** | Author these exact bytes on a fresh branch from `597f79ba…` | Self-approve; execute recovery; touch production; edit Revision 6 or `0109`; start PCSB-3 |
| **Engineering** | Independently review the exact pinned candidate bytes | Reuse the Builder context; execute recovery; invent production authority |
| **Quality** | Independently review the same unchanged bytes after Engineering PASS | Reuse Builder or Engineering context; execute recovery |
| **Auditor** | Terminal independent audit of the same unchanged bytes after Quality PASS | Self-edit; execute recovery; create PM acceptance |
| **PM** | Pin exact candidate bytes; create each downstream review issue only after the preceding gate; terminally accept or reject **this procedure** | Treat procedure acceptance as KIV-14 acceptance, as production authority, or as PCSB-3 release |
| **Founder** | Later residual-risk / exception decision **only after** recovery-evidence PASS, under §9 | Be inferred from KIV-202 MAY STAND; waive history; authorize KIV-25 / Alpha by silence |

No reviewer of **this procedure** may reuse `KIVO-A2-RECOVERY-PROCEDURE-BUILDER-212`,
`KIVO-A2-RECOVERY-PROCEDURE-BUILDER-209`, `KIVO-A2-RECOVERY-PROCEDURE-ENGINEERING-210`,
`KIVO-A2-ACCEPTANCE-BUILDER-203`, `KIVO-A2-ACCEPTANCE-ENGINEERING-204`,
`KIVO-A2-ACCEPTANCE-QUALITY-205`, `KIVO-A2-ACCEPTANCE-AUDITOR-206`,
`KIVO-A2-RECOVERY-PCSB-207`, `KIVO-A2-RECOVERY-PCSB-208`, `KIVO-A2-EXECUTOR-200`,
`KIVO-A2-POSTVERIFY-201`, or any prior KIV-174/175/176/177, KIV-185/186/187/188, KIV-198/199,
or other Builder/Engineering/Quality/Auditor/production-executor context named ineligible by
KIV-212.

### 3.2 Roles for **later recovery-evidence execution** (only after this procedure is terminally accepted)

Procedure review is **not** execution evidence.

After PM terminal acceptance of **these bytes**, PM must issue **separate fresh work orders**
with separate fresh contexts for:

1. **Query/driver-package preparer (package author)** — no-production authoring of the complete
   pre-pinned PCSB package required by §5.8–§5.9. This role **may not authenticate to
   production**, **may not** perform the independent package review, **may not** capture, and
   **may not** act as the independent recovery reviewer.
2. **Independent query/driver-package reviewer** — did not author the package; independently
   confirms alias/column visibility, output shape, ordering, non-mutating semantics, Class A /
   Class B classification under §5.9, topology sufficiency, and hash pins. This role **may not
   authenticate to production**, **may not** capture, and **may not** act as the independent
   recovery reviewer.
3. **Prospective baseline capturer** — read-only production capture of the next unused PCSB-n
   (§5), only after (1) and (2) PASS and only under a separately issued capture work order.
   This role did **not** author the package and did **not** perform the independent package
   review.
4. **Live current-state verifier** — read-only / rollback-only production verification (§6)
   against the **operative** PCSB-n designated under §5.6. This role may not proceed if no
   operative designation currently exists.
5. **Fixture executor** — disposable PostgreSQL 17.x only (§7). Never production. Never a
   substitute for §5.9 tooling validation.
6. **Independent recovery reviewer** — did not capture, did not live-verify, did not
   fixture-execute, did not author this procedure, did not author the query/driver package, and
   did not perform the independent query/driver-package review. This role is distinct from the
   package author, the independent package reviewer, and the capturer.
7. **Founder residual-risk decision** — §9, only after `ACCEPTANCE RECOVERY EVIDENCE PASS — FOUNDER DISPOSITION REQUIRED`.
8. **PM current-state acceptance** — only after (7) records the exact bounded Founder decision.

Each of those contexts is ineligible to reuse any of the others, and ineligible to reuse the
procedure-review contexts.

PM creates each downstream issue only after intake of the preceding gate. No parallel /
pre-created execution chain. **No PCSB-n production authentication may be released until
steps (1) and (2) have independently PASS and PM has created the capture work order.**

### 3.3 Authority this document does **not** create

This document authorizes **no**:

* production/Supabase authentication or SQL;
* GRANT / REVOKE / role / RLS / policy / schema / owner change;
* member, MIV, conversation, or test-user mutation;
* migration-ledger write;
* credential creation, reset or rotation;
* `0109` reapplication or any second forward attempt;
* §5.7 / KIV-190 reversal;
* KIV-25, deployment, Meta/WhatsApp, restaurant or Alpha action;
* PR or merge of this candidate;
* PCSB-3 or any later capture window;
* standing authentication authority of any kind.

Any future live verification or capture authority must be **separately issued** after this
procedure is terminally accepted **and** after the required query/driver package is independently
reviewed and hash-pinned.

---

## 4. FORBIDDEN SHORTCUTS

The candidate, and every later execution under it, **explicitly rejects**:

1. reconstructing or inferring historical B-11 from current grants;
2. calling any PCSB-n, PS-GRANT, or any later grant listing **"recovered B-11"**,
   **"reconstructed B-11"**, or **"the missing pre-state"**;
3. relabeling KIV-201 BLOCK as PASS;
4. claiming exact `0109` having no table/function GRANT DDL proves the missing pre-state;
5. using production GRANT/REVOKE, member/MIV edits, role widening, RLS/policy changes, test-user
   creation or data mutation merely to exercise a case;
6. using a direct owner/superuser invocation of `kv_control_assert_actor` as the **positive
   authenticated member-path** test;
7. treating a disposable fixture as **production** evidence, or omitting the pinned
   source-equivalence bridge in §7.4;
8. treating KIV-202 MAY STAND as KIV-14 acceptance;
9. using KIV-190 or Revision 6 §5.7 as an automatic response to a future recovery BLOCK;
10. changing accepted KIV-146 Revision 6 or KIV-25 semantics inside this candidate;
11. creating new production authority by wording;
12. overwriting, renaming or editing KIV-200 / KIV-201 evidence;
13. presenting `new prospective chain complete` as `old execution chain repaired`;
14. overwriting, renaming, completing later, or upgrading incomplete **PCSB-1** or **PCSB-2**
    to PASS, or treating either as the operative prospective baseline;
15. silently promoting a later PCSB-n into every historical literal `PCSB-1` reference without
    an explicit PM operative-baseline designation under §5.6;
16. authoring or improvising new composed SQL after production authentication;
17. relying on an unreviewed psql `\\if`, shell conditional, alias/order expression, or
    evidence-packaging step as a load-bearing continuation control;
18. correcting a failed query in the same work order or session and continuing;
19. silently restarting or opening a second authentication after a client, query, or evidence
    failure;
20. authenticating for a PCSB capture without a complete pre-pinned query/driver package that
    covers every required §5 artifact through PS-TIME end;
21. using a **complete but invalidated / stale** designated baseline as the operative
    prospective baseline after material drift or package invalidation;
22. using a client that cannot prove backend identity without helper SQL before P-0, or treating
    unproved same-connection / same-backend continuity as a complete capture;
23. inventing schemas, roles, functions, types, policies, extensions, or request-GUC semantics
    solely so a §5.9 tooling-validation query will parse.

Any of the above = `ACCEPTANCE RECOVERY BLOCK`.

---

## 5. R1 — PROSPECTIVE CURRENT-STATE BASELINE (PCSB-n)

### 5.1 Name and prohibition

A timestamped prospective baseline identity is named:

**`PCSB-n` — Prospective Current-State Baseline n**

`n` is a positive integer, assigned **monotonically** by separately released work orders.
Historical identities already used:

* **`PCSB-1`** — KIV-207; permanently incomplete; append-only failure evidence.
* **`PCSB-2`** — KIV-208; permanently incomplete; append-only failure evidence.

Those labels remain factual. They are **not** renamed. They are **not** the operative
prospective baseline.

Individual captures are named **`PS-*`**. They are **not** `B-*`.

**It is forbidden to call any PCSB-n, PS-GRANT, or any subset of them recovered B-11.** They are
a **new prospective baseline captured after commit**, used only to detect drift during the
recovery-verification window and to feed the new evidence chain. They have **no** power to close
the historical E-2 → E-4 → E-7 → E-8 gap in the KIV-200 chain.

### 5.2 When a PCSB-n may be captured

Only after:

* this procedure is terminally accepted;
* the complete query/driver package for that PCSB-n has been prepared and independently
  reviewed / hash-pinned under §5.8–§5.9;
* a separately issued read-only capture work order exists for that exact `PCSB-n` identity;
* the capturer has independently recomputed §2 custody and found MATCH;
* the capturer has independently recomputed the query/driver-package pins and found MATCH;
* P-0 has passed **first** in that live window (Revision 6 HS-41 law).

If P-0 fails: **do not interpret P-6/P-7**; record HS-41; return `ACCEPTANCE RECOVERY BLOCK`.
No GRANT, membership, BYPASSRLS, policy, `row_security`, `SET ROLE`, or substitute query may be
used to make P-0 pass.

**Persistent-connection host-driver contract (normative).** Later packages and capturers may
**not** invent a different session mechanic.

1. The capturer uses **one persistent PostgreSQL client connection object** for the entire
   capture window, from authentication through PS-TIME end.
2. **P-0 is the first SQL statement** on that authenticated connection. **No SQL of any kind**
   precedes P-0 on that connection — no `SELECT 1`, `SHOW`, `SET`, count, helper identity
   query, catalog probe, or other SQL.
3. Before P-0 is dispatched, the host process records backend identity from **client connection
   metadata that exposes the server backend PID without issuing SQL** (libpq-equivalent
   `PQbackendPID` / equivalent driver metadata). If the chosen client cannot expose that
   metadata without helper SQL before P-0, **that client is ineligible**.
4. The **host process** receives and evaluates the returned P-0 result row **in process**. The
   load-bearing continuation gate is **not** psql `\\if` / `\\elif`, a shell continuation test,
   a second psql invocation, an unreviewed meta-command, or any other client conditional that
   is not the independently reviewed host-row inspection named in the package.
5. **Only observed P-0 PASS** permits any later statement. Observed FAIL, missing row, parse
   failure, or inability to inspect the row = stop.
6. Every later statement through PS-TIME end is sent on that **same client connection object**.
   A later psql invocation, reconnect, second authentication, or new backend is forbidden.
7. At PS-TIME end the capturer reconciles backend identity from the same connection with the
   identity recorded before P-0. Inability to prove same-connection / same-backend continuity
   = incomplete PCSB-n / `ACCEPTANCE RECOVERY BLOCK`. There is no hedge of "as far as the
   capturer can prove."
8. Any connection, client, query, or evidence-writer failure ends that work order. No
   correction, reconnect, second authentication, restart, or continuation.

### 5.3 Required contents of a **complete** PCSB-n

Capture with statement timestamps, non-disclosing methods, and SHA-256 / byte count / line count
for every artifact. Use byte-identical Revision 6 query forms where Revision 6 ships them.
Every non-shipped statement must come from the pre-pinned package in §5.8.

| ID | Content | Notes |
|---|---|---|
| **PS-0** | P-0 first: executor identity, `row_security`, `_present` / `_select` / `_rls_active` for the three governed data-bearing tables | Admissibility gate for any later count |
| **PS-P1 … PS-P8** | P-1 … P-8 as applicable, P-0-gated for P-6/P-7; P-8a/b/c evidence only; **no** executor `has_0108_row` / `has_0109_row` assertion | P-4 must record current body MD5, owner, SECURITY DEFINER, empty `search_path`, signature, result shape, ACL, `still_unrepaired=false` |
| **PS-PF4** | PF-4a2, PF-4b2 plus byte-identical detail listing, PF-4c, A2 PF-4f (exactly 21 functions, all `kivo_control_owner`), `pg_has_role(..., USAGE)=false`, `SET ROLE kivo_control_owner` denied `42501` | Topology expected `1/0/0/0/0/0` unless a reasoned current-state finding says otherwise — any other topology is BLOCK, not repair |
| **PS-G** | G1/G2/G3 live `auth.uid()` capture and semantic determination against accepted V4 | Evidence for G5; G2 is never an adaptation point |
| **PS-GRANT** | Current grant set for every governed table and function: grantee, privilege type, column scope, non-disclosing | **Prospective only. Never recovered B-11.** Reconcile against KIV-201 current-capture hashes as drift detection, not as historical pre-state |
| **PS-OWN** | Owner, `relrowsecurity`, `relforcerowsecurity` for governed tables (B-10-equivalent current state) | Named `PS-OWN`, not B-10 |
| **PS-ROLE** | Role inventory for `postgres`, `service_role`, `authenticated`, `anon`, `kivo_control_owner` | Non-secret flags only |
| **PS-COUNT** | Non-disclosing members / conversations / CAE counts and member fingerprint/count method | Do not disclose emails, phones, message bodies or member rows |
| **PS-BODY** | Current repaired function body identity: `body_md5`, and whether it equals `00a73f86a902ff222760ff8fcab8abf1` | A third body is BLOCK |
| **PS-LEDGER** | Complete P-8c enumeration | Evidence only |
| **PS-TIME** | Capture window start/end timestamps and backend pid class (no secrets) | Same-connection / same-backend identity **must** be proved: non-SQL client backend-PID metadata recorded **before** P-0, then reconciled at PS-TIME end on that same connection object. Inability to prove = incomplete PCSB-n / BLOCK. PS-TIME start SQL, if any, occurs **after** P-0 |

A PCSB-n is **complete** only if every row above is captured, hashed, and accepted by PM as a
complete package. A passing P-0, or any proper subset of PS-*, does **not** make the PCSB-n
complete.

### 5.4 Hashing and custody

Every PS-* artifact:

* SHA-256 of the redacted artifact bytes;
* byte count and line count;
* statement timestamp(s);
* query-text hash where a Revision 6 query form was reused **or** where a pre-pinned
  non-shipped statement was used.

The **internal complete-PCSB digest list** hashes every PS-* digest for that PCSB-n and is
posted to the governing Linear issue. That internal list lives **inside AR-E-4** when the
PCSB-n is the operative complete baseline, or **inside AR-E-4F** when the PCSB-n is incomplete
failure evidence. It is **not** AR-E-11. AR-E-11 remains only the final overall chain
hash-of-hashes in §14.2.

**Append-only.** A failed or incomplete capture remains its original `PCSB-n` forever. A
re-capture is a new `PCSB-(n+1)`, never an overwrite of any earlier PCSB-n, including PCSB-1
and PCSB-2.

### 5.5 Drift rule during the recovery window

Live verification (§6) and Founder disposition (§9) must occur against the **operative
prospective baseline** designated under §5.6 — not against an incomplete historical PCSB-n,
not against a later undesignated recapture, and **not** against a complete baseline that has
become **non-operative** under §5.6 because material drift or package invalidation was
established. If no operative designation currently exists, §6, independent recovery review,
Founder §9, and AR-E-4 **must not proceed**.

Material unexplained drift in body identity, PF-4 topology, P-5 privilege flags, PS-GRANT,
membership counts, or owner/RLS flags = `ACCEPTANCE RECOVERY BLOCK`. When that drift, or
package invalidation, is established as the reason a recapture is required, the prior
operative designation becomes **non-operative immediately** under §5.6 — before / as a
precondition of PM releasing the recapture work order. Legitimate inter-window activity may
be separated from mutation-window drift only with evidence, never by guessing. Current grants
still **cannot** be used to infer the missing historical B-11.

### 5.6 PCSB-n lifecycle and operative-baseline promotion

This subsection is load-bearing. PM will not silently infer that a later PCSB-n substitutes
for every historical literal `PCSB-1` reference.

**Lifecycle**

1. Every capture window is a distinct `PCSB-n` identity assigned **before** authentication by
   the capturing work order.
2. `n` increases monotonically. The next unused identity after incomplete PCSB-1 and
   incomplete PCSB-2 would historically be **PCSB-3**. This document does **not** release
   PCSB-3.
3. If the window fails, is incomplete, loses its session, or hits any AR-HS / client / query /
   evidence failure, that `PCSB-n` is permanently incomplete. It remains append-only failure
   evidence. It **never becomes complete later**.
4. Recapture requires all of: a new separately released work order; a fresh context; a fresh
   authentication and session; a new `PCSB-(n+1)` identity; and a complete pre-pinned
   query/driver package for that new identity. Same-work-order restart is forbidden.
5. Incomplete prior PCSBs remain preserved failure evidence and **cannot** be used as the
   operative baseline.

**Operative prospective baseline**

Exactly one PCSB-n may be designated the **operative prospective baseline** for downstream
§6 live verification, independent recovery review, Founder §9, and AR-E-4 linkage.

Designation requires **all** of:

* the PCSB-n is **complete** under §5.3;
* PM has terminally accepted that complete package;
* PM has explicitly recorded the designation in the capture work order's terminal intake.

Until that designation exists, there is **no** operative prospective baseline. §6, independent
recovery review, §9, and AR-E-4 must not proceed by inference.

**Invalidation and replacement after an operative baseline already exists**

When **material drift** or **package invalidation** is established as the reason a recapture is
required:

* that establishment **itself** makes the current operative designation **non-operative**,
  **before / as a precondition of** PM releasing the recapture work order;
* PM may **not** release the recapture work order while leaving the invalidated baseline
  designated operative;
* from that invalidation until a replacement PCSB-n is **complete**, **PM-terminally accepted**,
  and **explicitly designated**, there is **no operative prospective baseline**;
* during that interval, §6 live verification, independent recovery review, Founder §9, and
  AR-E-4 use of the invalidated baseline are **prohibited**;
* the old complete baseline remains **append-only historical evidence only**. It is not
  overwritten, not renamed, and is **not** an automatic fallback if the replacement capture
  fails, is incomplete, or is never designated;
* absence of a replacement designation leaves **no** operative baseline — never the
  invalidated one;
* incomplete PCSB-1 and incomplete PCSB-2 still can **never** be promoted.

The replacement, when captured, is a new `PCSB-(n+1)` under a new work order and a new
pre-pinned package. Promotion of the replacement requires a new complete capture, a new PM
terminal acceptance, and an explicit new designation. There is **no** automatic restoration of
the invalidated baseline.

If a later recapture is required for a reason **other than** material drift or package
invalidation (for example, an incomplete capture of a never-designated window), that incomplete
capture remains append-only under its original identity, and there is still no operative
baseline until a complete + PM-designated PCSB-n exists.

**Historical labels**

Literal historical names `PCSB-1` and `PCSB-2` remain the names of those two incomplete
windows. Downstream clauses in this document that previously said `PCSB-1` when they meant
the baseline used for §6 / §9 / AR-E-4 now mean the **operative prospective baseline**.

### 5.7 Reserved — collision avoidance with Revision 6

This document does **not** define a recovery-procedure §5.7. Accepted Revision 6 §5.7 remains
the Change Class A2 post-commit reversal path. KIV-190 remains UNUSED. Numbering jumps from
§5.6 to §5.8 so that no later worker can confuse a recovery-procedure clause with Revision 6
§5.7.

### 5.8 Pre-reviewed / hash-pinned PCSB query and client package

**Normative rule.** All non-shipped / composed SQL, psql meta-commands / client control flow,
ordering, output-shaping, evidence-writer logic, and the exact statement sequence for a future
PCSB capture **must be prepared before production authentication** and **independently reviewed
and hash-pinned before the capture work order is released**.

The package must be complete through **PS-TIME end**. A package that stops at P-0, or at
table/column grants, or that leaves function-grant / PS-OWN / PS-ROLE / PS-COUNT / PS-BODY /
PS-TIME-end statements to be invented in-window, is ineligible.

**The package must include, as hashed artifacts:**

1. exact ordered statement sequence from session start through PS-TIME end;
2. exact text of every SQL statement — Revision-6-shipped forms by pin; every non-shipped
   composed statement in full;
3. exact output-column contract per statement;
4. deterministic `ORDER BY` wherever hashing requires ordering, using only names that exist in
   that statement's select-list or an independently proved underlying catalog column;
5. exact client/driver control flow implementing the §5.2 persistent-connection host-driver
   contract, including: one persistent client connection object; P-0 as first SQL with **no SQL
   of any kind** preceding it; host-process inspection of the returned P-0 row; continuation
   only after observed PASS; every later statement through PS-TIME end on that **same
   connection object**; no unreviewed `\\if` / `\\elif` / shell continuation test / second
   psql invocation as the gate;
6. exact driver / library / runtime / version of the client that will open that connection;
7. exact backend-identity method: libpq-equivalent non-SQL backend-PID metadata recorded
   **before** P-0 dispatch, and the PS-TIME-end reconciliation method against that identity;
8. evidence-writer steps and artifact names for every required PS-*;
9. SHA-256 of every query text and of the package manifest;
10. independent-review record covering §5.9, including each non-shipped query's Class A or
    Class B classification.

If the named client cannot prove backend identity without helper SQL before P-0, the package
is **ineligible**.

**The package and the later capturer are prohibited from:**

* authoring or improvising new composed SQL after production authentication;
* relying on an unreviewed psql `\\if`, shell conditional, alias/order expression, or
  evidence-packaging step as a load-bearing continuation control;
* inventing session mechanics that differ from the §5.2 contract;
* correcting a failed query in the same work order or session and continuing;
* silently restarting, reconnecting, or opening a second authentication after a client, query,
  connection, or evidence failure.

If any statement, client control, connection, or evidence-writer step fails after
authentication: **stop**. That PCSB-n is incomplete AR-E-4F evidence. Return
`ACCEPTANCE RECOVERY BLOCK`. Do not repair, reconnect, or continue in-window.

### 5.9 Validation standard for non-shipped queries

Every non-Revision-6-shipped query used in a PCSB package must satisfy **all** of the following
**before** production release of that package:

* exact query text and output-column contract;
* deterministic ordering where ordering is required for hashing;
* PostgreSQL **17.x** compatibility, with **17.6 preferred** and recorded;
* static / source review for catalog and object assumptions, including that every `ORDER BY`
  / output alias names an actual select-list entry or proved catalog column;
* an independent reviewer confirmation of alias / column visibility, output shape, ordering,
  and non-mutating semantics;
* query-text SHA-256 recorded before production release;
* **no** validation claim that requires production mutation or production test data.

**Builder decision — preflight tooling validation method.** Syntax and catalog-object
validation of every non-Revision-6-shipped PCSB query **must** be performed against a
**disposable non-production PostgreSQL 17.6** environment before the query package may be
released for production authentication.

That validation is **preflight tooling validation only**. It is **not** §7 fixture evidence
and **not** production evidence. It must use no production credentials, no production PII, and
no connection to `zlighrbsjexrozrmuwpw`. A later worker may **cite** §7.2 source inputs and
bootstrap methods for Class B topology construction where technically applicable; that citation
does **not** convert tooling validation into FX-* evidence, F-MIV / F-KIND semantic proof, or
production evidence.

**Query classification (mandatory; independently re-performed by the package reviewer).**

Every non-shipped query is classified as exactly one of:

* **Class A — built-in / catalog-only.** The query's object dependencies are only PostgreSQL
  17.6 built-ins and `pg_catalog` (plus any explicitly recorded PostgreSQL built-in extension
  prerequisite). It references **no** Kivo schema, **no** Supabase schema, **no** project role
  other than the built-in connect role, **no** project function / table / type / policy, and
  **no** request-GUC / request-context object.
* **Class B — Kivo / Supabase-dependent.** Any other non-shipped query: any reference to
  Kivo or Supabase schemas, roles, functions, tables, types, policies, non-built-in
  extensions, request-GUC / request-context semantics, or any other non-built-in object.

The package preparer classifies every non-shipped query before validation. The independent
package reviewer independently re-classifies every query. Classification mismatch = HOLD.
A query that cannot be classified without invention = HOLD.

**Class A validation topology.**

Class A queries may validate on a **clean disposable PostgreSQL 17.6** cluster. The package
must record the exact prerequisites actually used (`server_version` / `server_version_num`,
any built-in extension). No Kivo / Supabase object may be created for Class A validation.

**Class B validation topology.**

Class B queries **must** validate on a disposable PostgreSQL 17.6 cluster bootstrapped from an
**explicitly pinned / source-derived topology**. They may **not** validate against a bare
PostgreSQL cluster, and they may **not** become "validated" by ad-hoc DDL invented solely so
the query will parse.

Pinned source inputs are those already governed by §7.2:

* PostgreSQL **17.6** (tooling validation does **not** use the §7.2 17.x latitude; the
  recorded `server_version` must be 17.6);
* `0108` blob `7b500626331dd4eaf4620d29c95953740f6e5541` / SHA-256
  `00cd7b7fe2ee581df7b9d038301123db45a80962fe8a6ad3c0435e2893dea9ee`;
* `0109` blob `8923ed066d21a5cbac5f6ffc47606aee9b5c9c07` / SHA-256
  `e1a185e3a38b41fe1c5c9e8f9ebbedaefd88b9151cf390cf0cf22aa9123fa9e3`.

Default construction method (**method 1**): apply the accepted integration parent order first
`d5b4b1dd0925964ae44d55e125893081afddc651` then `cc74e14c16a8b5e02d9ea9668976b83de7aeb872`.

Alternate construction (**method 2**) is permitted **only if** every applied blob through
`0107` is independently recomputed and recorded, then exact `0108` then exact `0109` are
applied in that order, before any Class B query is called validated.

Before any Class B query is called validated, the package must record and the independent
reviewer must confirm:

* exact source inputs / blobs / SHA-256s actually used;
* migration / bootstrap order actually applied;
* required roles, schemas, extensions, and objects that those Class B queries reference;
* topology checks proving those objects exist **from the pinned method**, not from ad-hoc DDL.

**Forbidden in §5.9:** creating schemas, roles, functions, tables, types, policies, extensions,
or request-GUC semantics solely to make a query validate. If a Class B query depends on
request-context GUCs (`request.jwt.claim.sub`, `request.jwt.claims`, or equivalent) or any
other object the pinned / source-derived bootstrap does not produce, the package must record a
**source-derived** method to present that object in the disposable 17.6 environment. If no
such method exists without invention, **that query is not validated** and the package remains
**HOLD**.

If the required topology cannot be reproduced from the pinned / source-derived method without
invention, the package remains **HOLD**.

If a disposable PostgreSQL 17.6 environment cannot be created lawfully at package-prep time,
the package remains **unreleased (HOLD)** until it can. Static review and independent review
remain additional mandatory gates; they are **not** a substitute for proving that an alias
used in `ORDER BY` actually exists, and they are **not** a substitute for Class A / Class B
topology validation.

Revision-6-shipped query forms remain pinned by Revision 6 identity. They do not require
re-invention. They still require package-level sequencing, hashing, and the §5.2
persistent-connection host-driver contract.

---

## 6. R2 — LIVE PRODUCTION VERIFICATION BOUNDARY

### 6.1 Purpose

Re-prove, from the **current** committed state, every Revision 6 §7.1.1 / §7.4 assertion that
can be safely proved **without** manufacturing production state and **without** committed
mutation. KIV-201's successful techniques are the permitted method class. KIV-201's **results
are historical**; the new chain must re-run the live battery under its own work order.

Live verification occurs only against the **operative prospective baseline**. Incomplete
PCSB-1 and incomplete PCSB-2 are not that baseline. A complete but invalidated / stale
baseline (material drift or package invalidation under §5.6) is also not that baseline.
If no operative designation currently exists, §6 **must not proceed**.

### 6.2 Permitted live methods

Only after a separately issued verification work order:

* read-only production/catalog SQL using Revision 6 query forms where specified;
* PostgreSQL authentication through an already-existing governed session-mode path named by PM
  in that later work order — **this document names no path and issues no credentials**;
* transaction-scoped probes using `BEGIN` / `SET LOCAL ROLE` / `SET LOCAL` request-context
  values / existing governed application entry points **only when the verifier has first
  proved** that all database effects are transaction-contained, that the functions have no
  external/non-transactional side effect, and that the transaction will unconditionally
  `ROLLBACK`;
* local/source inspection and read-only Git/GitHub custody checks;
* non-disclosing local evidence artifacts.

### 6.3 Absolute live prohibitions

* zero committed production mutation;
* no `0109` reapplication;
* no §5.7;
* no GRANT/REVOKE/role/RLS/policy/schema/owner repair;
* no ledger write;
* no credential reset/rotation;
* no creating a production test user/member or altering MIV/member state merely to manufacture
  a fail-closed case;
* no messaging a real customer or restaurant;
* no KIV-25 / deployment / Meta / WhatsApp / Alpha action.

If a required live assertion cannot be exercised under these rules, record it **NOT PROVED**.
NOT PROVED is blocking for that assertion **unless** §7 supplies a lawful fixture route for
exactly that assertion.

### 6.4 Live assertions that must be re-proved (KIV-201 showed they are exercisable)

P-0 first. Then, at minimum:

* P-1…P-7 against the operative prospective baseline, with P-6/P-7 only after P-0 PASS;
* P-4 `still_unrepaired=false`, body MD5 equals the operative baseline / accepted repaired
  identity, owner / SECURITY DEFINER / empty `search_path` / signature / result shape /
  owner-only ACL;
* PF-4b2 `1/0/0/0/0/0` plus detail listing; no inherited/SET residue;
* `pg_has_role(..., USAGE)=false`; `SET ROLE kivo_control_owner` denied `42501`;
* P-5 all false;
* G1/G2/G3 V4 semantics;
* **intended authenticated member path** (not direct `kv_control_assert_actor`):
  `request.jwt.claim.sub`; `request.jwt.claims` JSON `sub`; claim.sub wins when both present;
* fail-closed cases that have a natural live path: no subject / empty subject / claims without
  sub; subject not a member of the resolved tenant; non-manager on manager-required path;
  manager on manager-required path succeeds through the actor check; malformed claims → `22P02`;
* system/service path unchanged (existing `service_role` wrapper only; no external call);
* authenticated direct resolver separation: `42501 permission denied for function kv_control_assert_actor`.

A live assertion that **fails** (as opposed to not being exercisable) is `ACCEPTANCE RECOVERY BLOCK`
and is **not** automatically D-1/D-2/D-3/D-4. Report and stop. Do not reverse.

### 6.5 Live assertions that remain NOT PROVED unless §7 passes

* actor with no open MIV row;
* invalid actor kind as the **internal raise** `KIV14 actor_kind must be member or system`.

Live public-path isolation for invalid kind (authenticated cannot call the resolver; wrappers
hardcode valid kinds; `kv_control_transition` is owner-only → `42501`) **may** be re-proved live
and recorded as **public-path isolation PASS**. That isolation PASS is **not** a substitute for
the internal raise, which §7 must prove.

---

## 7. R3 — LAWFUL EVIDENCE ROUTE FOR THE TWO NOT PROVED CASES

### 7.1 Design choice

The lawful route is a **disposable PostgreSQL 17.x fixture** built from pinned exact
source/custody, plus an explicit **source-equivalence bridge** to the live repaired body.

The fixture is **never production evidence**. It is fixture evidence of function/wrapper
semantics, transferable to the current-state acceptance question **only** through §7.4.

No other method is authorized by this candidate. A later reviewer may reject the fixture
design as insufficient; they may not replace it in-window with production state manufacture.

§5.9 disposable PostgreSQL 17.6 validation of a PCSB query package is **not** this §7 fixture
and must never be filed as FX-* or cited as semantic proof of F-MIV / F-KIND. Class B §5.9
topology construction may **cite** the §7.2 source inputs and bootstrap methods; that citation
does not convert tooling validation into fixture evidence.

### 7.2 Fixture source inputs (exact)

Independently recompute before build:

| Input | Identity |
|---|---|
| PostgreSQL | **17.x**, with the exact `server_version` recorded. Production at KIV-201 was **17.6**. A different 17.x is permitted only if recorded and if no observed semantic divergence is attributed to version skew |
| `0108` | blob `7b500626331dd4eaf4620d29c95953740f6e5541` / SHA-256 `00cd7b7fe2ee581df7b9d038301123db45a80962fe8a6ad3c0435e2893dea9ee` |
| `0109` | blob `8923ed066d21a5cbac5f6ffc47606aee9b5c9c07` / SHA-256 `e1a185e3a38b41fe1c5c9e8f9ebbedaefd88b9151cf390cf0cf22aa9123fa9e3` |
| Integration parent order if a lineage tree is built | first `d5b4b1dd…` then `cc74e14c…` — **or** apply the two exact files in order `0108` then `0109` onto a disposable cluster that already contains the repository `0001…0107` stack. Either method must end with the exact `0109` blob identity and the repaired body |

The fixture executor must also hash the exact files used. Mismatch = fixture BLOCK.

### 7.3 Material equivalence required in the fixture

The fixture is **not** a copy of production data. It **must** be materially equivalent for the
assertions under test:

* `kivo_control_owner` exists with the governed safe attribute set (NOLOGIN, non-superuser,
  non-BYPASSRLS, no INHERIT, no CREATEROLE/CREATEDB/REPLICATION as required by Revision 6
  PF-4a2);
* executor cannot `SET ROLE kivo_control_owner`;
* SECURITY DEFINER `kv_control_assert_actor` owned by `kivo_control_owner`, empty `search_path`,
  exact signature/result shape, owner-only ACL;
* intended authenticated member wrappers exist and are the **positive member-path** entry
  points; at minimum `kv_control_create_conversation` as the member-path probe used by KIV-201;
* `authenticated` EXECUTE on the member wrappers and **not** on `kv_control_assert_actor`;
* `service_role` EXECUTE on system wrappers;
* RLS (+ FORCE RLS on the 0108-owned tables) such that member/MIV lookup semantics of the
  resolver are real;
* a fixture member **with** an open v1 MIV row (control);
* a fixture member **without** an open MIV row (the missing production case);
* no production credentials, no production PII, no connection to `zlighrbsjexrozrmuwpw`.

### 7.4 Source-equivalence bridge (mandatory)

Before any fixture behavioural result may be cited:

1. Live operative-baseline / live verification records current `body_md5`.
2. Fixture records fixture `body_md5` of `public.kv_control_assert_actor(uuid,text,boolean)`.
3. Require **live `body_md5` = fixture `body_md5`**. Historical KIV-201 value
   `00a73f86a902ff222760ff8fcab8abf1` is the expected identity unless a later independently
   accepted body exists — **no third unexplained body**.
4. Independently recompute exact `0109` blob/SHA-256 used to build the fixture and require MATCH
   to §2.2.
5. Record the call graph used: intended wrapper → `kv_control_assert_actor(..., 'member', false)`
   for the no-open-MIV case.

If any step fails, fixture results are **inadmissible**. They must not be presented as
current-state evidence.

**Forbidden claim:** "the fixture is production." The permitted claim is: "the fixture proved
these exact semantics on a body whose fingerprint equals the live repaired body, which equals
the accepted `0109` source."

### 7.5 Exact fixture cases

#### Case F-MIV — actor with no open MIV row

* **Path:** intended authenticated member wrapper (`kv_control_create_conversation` or another
  wrapper independently shown to call `kv_control_assert_actor(..., 'member', false)` **before**
  any persistent write). Direct resolver call is **not** the positive test.
* **Fixture state:** a subject that is a member of the resolved tenant and has **no** open MIV
  row. Manufacturing this state is permitted **only in the disposable fixture**.
* **Expected:** exception `KIV12 actor has no open member identity version` (exact `0109` line
  292 text). Record SQLSTATE (expected `P0001` unless independently observed otherwise; the
  **message text** is the load-bearing contract).
* **Control:** the same wrapper with an otherwise identical member **with** an open v1 MIV row
  must **not** raise that exception (it may fail later on fixture-local FK/state rules, which
  must be shown to occur **after** actor success, as KIV-201 did with `23503` / illegal
  transition).
* **Production:** remain NOT PROVED live. Do not close or delete production MIV rows.

#### Case F-KIND — invalid actor kind

This case has **two** required sub-proofs. Neither substitutes for the other.

**F-KIND-A — public-path isolation (also re-provable live):**

* `authenticated` direct `kv_control_assert_actor` → `42501 permission denied for function kv_control_assert_actor`;
* callable member/system wrappers hardcode `'member'` or `'system'` and therefore cannot supply
  an invalid kind without source change;
* `kv_control_transition` remains owner-only, so an `authenticated` call with invalid
  `p_actor_kind` is `42501`, not the KIV14 raise.

F-KIND-A is **isolation**, not the internal raise.

**F-KIND-B — internal function semantics (fixture only):**

* This assertion **specifically concerns the internal function**, not the public path. Exact
  `0109` raises `KIV14 actor_kind must be member or system` when
  `p_actor_kind not in ('member','system')` **before** member/subject resolution.
* In the fixture, invoke `public.kv_control_assert_actor(<restaurant>, 'not-a-kind', false)`
  **as the function owner** (or another fixture role that is independently shown to hold
  EXECUTE on that owner-only function). This is **not** a substitute for the authenticated
  member path and must never be reported as one.
* **Expected:** `KIV14 actor_kind must be member or system`.
* Transfer to current-state acceptance is lawful **only** via the §7.4 body-fingerprint bridge.

Owner/superuser invocation is **forbidden** as a substitute for the intended authenticated
path. It is **permitted solely for F-KIND-B**, and only because the §7.1.1 invalid-kind
assertion is an internal-argument guard that the public path cannot lawfully supply.

### 7.6 Independent reproducibility

A **second independent fixture context** that did not run the first fixture must be able to:

* rebuild from the same pinned blobs;
* recompute the same body MD5;
* obtain the same F-MIV message and the same F-KIND-B message.

If the second independent fixture disagrees, both results are BLOCK until resolved by a new
work order. Do not pick the passing one.

### 7.7 Fixture evidence artifacts

Named `FX-*`, hashed, append-only, non-disclosing. They enter the **new** chain as
`AR-E-FX`. They must cite live `body_md5` and exact `0109` blob. They must **not** be filed
under KIV-200 / KIV-201 evidence names.

---

## 8. R4 — KIV-165 HISTORICAL ACCEPTANCE FACTS

### 8.1 What remains after current runtime repair

KIV-165 independently BLOCKed Release 4 on:

1. **HS-12** — unexpected `WARNING: no privileges were granted for "auth"`; live
   `kivo_control_owner` `auth` USAGE remained false; the intended 0108 additive auth-schema
   USAGE grant did not take;
2. **ledger contract** — no 0108 migration-ledger row; Revision 5's forward ledger clauses
   were irreconcilable for the authorized raw `psql` runner.

Those facts are **historical 0108 execution/acceptance defects**. They were **not** made clean
by `0109`. KIV-201 independently found KIV-165 **not fully discharged for KIV-14 acceptance**.

### 8.2 What current-state repair changed, and what it did not

| Historical KIV-165 fact | Current-state classification after KIV-201 / this procedure |
|---|---|
| Member-path runtime failure caused by missing `auth` USAGE plus `auth.uid()` in the SECURITY DEFINER resolver (later proved by KIV-173) | **Technically discharged** as to member-actor runtime by exact `0109` + KIV-201 live proof. Not KIV-14 acceptance |
| HS-12 unexpected auth warning on the 0108 run | **Remains historical.** The 0108 execution window stays HS-12. Current P-5 `auth_usage=false` is **now the intended 0109 design**, not proof that the 0108 grant succeeded |
| Absent 0108 ledger row | **Remains historical.** Revision 6 already treats A2 ledger as evidence-only and forbids retroactive 0108/0109 ledger writes. Absence of a 0109 row is expected. Absence of a 0108 row remains a historical 0108-window fact, not an A2 after-state failure |
| Committed M-1 objects, MIV N=20, role/membership/RLS inventory | **Current-state objects may be re-proved prospectively.** That does not rewrite the 0108 execution record |

### 8.3 May these historical facts coexist with current-state acceptance?

**Yes, but only as disclosed historical residual risk**, never as a claim that Release 4 became
a clean run.

Current-state acceptance under this procedure **requires** the §9 Founder residual-risk
decision to name, at minimum:

* the irrecoverable KIV-200 HS-8 / B-11 gap; **and**
* the surviving KIV-165 historical HS-12 and 0108-ledger facts.

If Founder is willing to accept KIV-14 **as a current-state outcome** while those historical
facts remain on the record, that decision may proceed **after** the new evidence chain PASSes.
If Founder is not willing, the terminal result is not current-state acceptance, and KIV-14
remains blocked. **Neither choice retroactively cleans 0108 or 0109 execution history.**

---

## 9. R5 — ACCEPTANCE AUTHORITY AND RESIDUAL-RISK DECISION

### 9.1 Who may **not** declare KIV-14 accepted

* the KIV-203 Builder, the KIV-209 Builder, or the KIV-212 Builder;
* any procedure reviewer;
* any recovery-evidence capturer, live verifier, fixture executor, or query-package author/reviewer;
* KIV-200 / KIV-201 / KIV-207 / KIV-208 historical contexts;
* PM acting **without** the §9.3 Founder decision and **without** a complete new evidence chain.

Executor or reviewer silence is not a waiver of HS-8.

### 9.2 Why a Founder residual-risk decision is required

The historical B-11 / HS-8 gap is **irrecoverable from authoritative evidence**. Revision 6 §8.2
makes a gap in E-2 → E-4 → E-7 → E-8 a **substantive independent-review finding**. KIV-201
already independently judged that finding **acceptance-blocking under Revision 6** for the
**historical execution chain**.

This procedure does **not** overrule that judgment for the historical chain. The only remaining
lawful question is whether Founder will accept **current-state KIV-14** despite that permanent
historical non-compliance, after a **new** internally complete prospective chain exists.

Builder's conclusion: such a Founder decision **can** be sufficient **for current-state
acceptance only**. It would be **insufficient** to:

* declare the KIV-200 window compliant;
* reconstruct B-11;
* convert KIV-201 BLOCK to PASS;
* release KIV-25, deployment, or Alpha GO;
* release KIV-190.

If a later Auditor of **these bytes** disagrees and holds that Founder still cannot accept
KIV-14 under the governing law, that is an `AUDITOR BLOCK` on this candidate, not a licence
for Builder to invent a quieter waiver.

### 9.3 Exact Founder decision point

**Prerequisites, all of them, before the decision issue may be opened:**

1. this procedure terminally accepted by PM after Builder → Engineering → Quality → Auditor;
2. a complete query/driver package independently reviewed and hash-pinned under §5.8–§5.9;
3. a **complete + PM-terminally-accepted** PCSB-n designated as the operative prospective
   baseline under §5.6; incomplete PCSB-1 and incomplete PCSB-2 remain failure evidence and do
   not satisfy this prerequisite; a complete but invalidated / stale baseline does **not**
   satisfy this prerequisite;
4. live §6 battery complete against that operative baseline: every exercisable assertion PASS;
   the two §7 cases not claimed live-PASS;
5. fixture §7 complete: F-MIV PASS, F-KIND-A PASS, F-KIND-B PASS, §7.4 bridge PASS, independent
   fixture reproduction PASS;
6. independent recovery reviewer PASS on the **new** chain, with explicit restatement that the
   **old** chain remains broken;
7. zero committed production mutation in the recovery-evidence windows;
8. KIV-189 still CONSUMED; KIV-190 still UNUSED; D-4 still not satisfied unless a **later**
   separate `must not stand` decision exists — this path does not create one.

**Decision issue authorizes no SQL.** Founder records exactly one of:

`DECISION — CURRENT-STATE KIV-14 ACCEPTANCE MAY PROCEED DESPITE PERMANENT HISTORICAL HS-8/B-11 GAP AND DISCLOSED KIV-165 HISTORICAL FACTS; THOSE GAPS ARE NOT REPAIRED; KIV-190 REMAINS UNUSED; KIV-25/ALPHA REMAIN SEPARATE.`

or

`DECISION — CURRENT-STATE KIV-14 ACCEPTANCE MUST NOT PROCEED. KIV-14 REMAINS BLOCKED. KIV-190 REMAINS UNUSED UNLESS A SEPARATE MUST-NOT-STAND DECISION IS RECORDED UNDER REVISION 6 D-4.`

or

`HOLD — NO CURRENT-STATE ACCEPTANCE DISPOSITION YET.`

PM will not infer a choice from discussion.

### 9.4 Bounded meaning of a MAY PROCEED decision

If Founder records the first option, **and only then**, PM may declare:

`KIV-14 CURRENT-STATE ACCEPTANCE PASS`

Meaning:

* KIV-14 is accepted **as a current-state outcome** of the repaired exact-`0109` production
  state plus the new prospective chain plus the named residual-risk decision;
* historical KIV-200 / KIV-201 / KIV-165 findings remain on the record as history;
* incomplete PCSB-1 and incomplete PCSB-2 remain incomplete historical recovery-failure evidence;
* G5 remains in force;
* KIV-25, deployment, Meta/WhatsApp, restaurant action and Alpha GO remain **not** authorized
  by this declaration.

### 9.5 What the decision does **not** retroactively change

It does not:

* repair or recover B-11;
* close the historical E-2 → E-4 → E-7 → E-8 chain;
* convert KIV-201 BLOCK into PASS;
* make the 0108 HS-12 run clean;
* insert a ledger row;
* consume or release KIV-190;
* create a second forward attempt;
* complete or upgrade PCSB-1 or PCSB-2.

---

## 10. R6 — INDEPENDENT ROLE CHAIN

### 10.1 Procedure-artifact chain (this candidate)

**Builder → Engineering → Quality → Auditor → PM terminal acceptance.**

Exact bytes must be unchanged across that chain. Any byte change restarts it. PM creates each
fresh review issue only after terminal intake of the preceding gate. Reviewers must not
pre-create or self-run the next gate.

### 10.2 Recovery-evidence chain (after procedure acceptance)

Separate fresh contexts, separately released, none reused from §10.1 or from
KIV-200/201/207/208:

**query/driver-package preparer → independent query/driver-package reviewer → PCSB capturer →
live verifier → fixture executor → independent recovery reviewer → (second fixture reproducer,
required by §7.6) → PM evidence intake → Founder §9 decision → PM current-state acceptance.**

§7.6 is the operative independent-reproduction requirement. A later worker who treats
reproduction as skippable **cannot complete the path** to current-state acceptance, because
§9.3 requires independent fixture reproduction PASS before the Founder decision issue may be
opened.

Procedure review is not execution evidence. Execution evidence is not procedure acceptance.
Query-package review is not production capture. An incomplete PCSB-n is not the operative
baseline. A complete but invalidated / stale baseline is not the operative baseline.

---

## 11. R7 — CLOSED TERMINAL OUTCOMES

Exactly one terminal classification is used at each stage below. BLOCK does **not**
automatically route to KIV-190. KIV-202 chose MAY STAND. D-4 is not satisfied. Any future
reversal still requires a new deciding-authority determination that the committed state
**must not stand** under accepted Revision 6, plus a separately released §5.7 executor.

### 11.1 Procedure-artifact outcomes (KIV-212 review chain)

* `A2 ACCEPTANCE-RECOVERY PROCEDURE REMEDIATION CANDIDATE READY FOR ENGINEERING RE-REVIEW` — Builder handback only.
* later Engineering / Quality / Auditor PASS or BLOCK on **these bytes**, as those work orders
  define.
* PM terminal **procedure accepted** or **procedure rejected**. Procedure acceptance ≠ KIV-14
  acceptance and ≠ PCSB-3 release.

### 11.2 Recovery-evidence outcomes (later execution)

| Outcome | Meaning |
|---|---|
| **`ACCEPTANCE RECOVERY EVIDENCE PASS — FOUNDER DISPOSITION REQUIRED`** | New prospective chain is internally complete. Historical chain remains broken. Founder §9 decision is now the remaining gate. |
| **`KIV-14 CURRENT-STATE ACCEPTANCE PASS`** | Only after the §9 MAY PROCEED decision **and** PM declaration. Current-state acceptance only. |
| **`ACCEPTANCE RECOVERY BLOCK`** | Any failed, missing, or NOT PROVED mandatory assertion in the new chain; any forbidden shortcut; any custody mismatch; any committed mutation in a recovery window; any attempt to relabel history; any incomplete PCSB-n treated as operative; any complete but invalidated / stale baseline treated as operative. KIV-14 remains blocked. KIV-190 remains UNUSED. |
| **`NO LAWFUL CURRENT-STATE ACCEPTANCE PATH`** | Available if a later independent reviewer of **operative** procedure bytes, or Founder under §9, concludes that current-state acceptance is impossible under the governing law even with residual-risk disclosure. This is **not** D-4 and **not** a reversal order. |
| **`FOUNDER HOLDS CURRENT-STATE ACCEPTANCE`** | Founder recorded HOLD. Committed `0109` remains. KIV-14 remains blocked. No reversal. |

An incomplete capture such as PCSB-1 or PCSB-2 is `ACCEPTANCE RECOVERY BLOCK` for **that
window**. It is not, by itself, `NO LAWFUL CURRENT-STATE ACCEPTANCE PATH`.

---

## 12. R8 — KIV-25 / ALPHA BOUNDARY

**Procedure acceptance does not authorize KIV-25.**

**`KIV-14 CURRENT-STATE ACCEPTANCE PASS` does not authorize KIV-25.**

Neither event authorizes:

* production security hardening;
* deployment;
* Meta / WhatsApp action;
* restaurant action;
* Alpha GO.

Those remain separately governed. Change Class B semantics in accepted Revision 6 remain
untouched by this document. KIV-25 remains **Backlog + blocked + not-authorized** until its
own later chain exists.

---

## 13. R9 — STANDING `auth.uid()` DRIFT OBLIGATION (G5)

Revision 6 §9.5 G5 remains in force. The durable **Kivo PM role** owns the post-`0109`
`auth.uid()` semantic re-check.

A future acceptance-recovery PASS, and even `KIV-14 CURRENT-STATE ACCEPTANCE PASS`, **does not
cancel** the re-check triggers already established:

1. any Supabase or Auth platform upgrade affecting the target project;
2. any migration or vendor change affecting `auth.uid()`;
3. any observed change to the live `auth.uid()` definition;
4. any future release that relies on this identity path, including KIV-25 and later
   control-plane work.

A G5 divergence remains a finding for PM/Founder adjudication and a new governed change, never
an in-window adaptation and never a reason to edit the applied function outside a full source
chain.

---

## 14. R10 — EVIDENCE CUSTODY

### 14.1 Two chains, never one

| Chain | Status | May be edited? |
|---|---|---|
| **Historical execution chain** — KIV-200 E-* / handback + KIV-201 independent BLOCK + PM intakes | **Permanently incomplete** (missing B-11 / E-4). Preserved as history | **No.** Do not overwrite, rename, or relabel |
| **Prospective acceptance-recovery chain** — AR-E-* defined below | Must be **internally complete** before Founder §9 | Append-only. Corrections are new artifacts that cite the old ones |

**It must be impossible for a later PM to confuse `new prospective chain complete` with `old
execution chain repaired`.** The AR-E-0 artifact below exists to make that confusion a
procedure violation.

Incomplete PCSB-1 and incomplete PCSB-2 are **new-chain recovery-failure evidence**. They do
not repair the old chain and they do not become AR-E-4.

### 14.2 AR-E set (new chain)

| Artifact | Content |
|---|---|
| **AR-E-0 Historical non-closure record** | Verbatim: KIV-200 `A2 FORWARD COMMITTED — POST-COMMIT HOLD`; HS-8; `B-11 grant-set listing not captured`; KIV-201 `INDEPENDENT A2 POST-REMEDIATION BLOCK`; `B-11 PRE-STATE GAP UNRECOVERABLE FROM AUTHORITATIVE EVIDENCE`; KIV-202 MAY STAND text; KIV-189 CONSUMED; KIV-190 UNUSED; D-4 NOT satisfied. Statement: **this new chain does not repair the old one** |
| **AR-E-1 Authority record** | This procedure's PM acceptance; later package/capture/verify/fixture work-order IDs; named contexts; Founder §9 record when it exists |
| **AR-E-2 Source pin** | Recomputed §2 identities at each recovery window |
| **AR-E-3 Query text** | Hashed query text actually used live and in fixture |
| **AR-E-QP Query/driver package** | Complete pre-reviewed / hash-pinned PCSB statement sequence, non-shipped SQL, client control flow, output contracts, and independent-review record, prepared **before** authentication |
| **AR-E-4 Operative complete PCSB-n** | Full §5 capture of the **operative** complete + PM-accepted PCSB-n, including **PS-GRANT explicitly labeled not-B-11**. This is **not** necessarily historical PCSB-1. A complete but invalidated / stale baseline is **not** AR-E-4 |
| **AR-E-4F Incomplete / failed PCSB-n evidence** | Separately fingerprinted recovery-failure evidence for each incomplete PCSB-n, including historical PCSB-1 and PCSB-2. Not AR-E-4. Cannot be promoted, overwritten, renamed, or upgraded to PASS |
| **AR-E-5 Live verification** | §6 assertion by assertion: PASS / FAIL / NOT PROVED, against the operative baseline |
| **AR-E-6 Fixture pack** | FX-* plus §7.4 bridge (live MD5, fixture MD5, `0109` blob) |
| **AR-E-7 Independent recovery review** | Reviewer identity, ineligibility statement, verdict |
| **AR-E-8 Founder residual-risk record** | Exact §9 sentence recorded, or HOLD, or decline |
| **AR-E-9 Mutation/side-effect counts** | Production committed writes, ledger writes, repo writes, credential mutations, external side effects — required **zero** in recovery-evidence windows |
| **AR-E-10 Outcome** | Exactly one §11.2 classification |
| **AR-E-11 Manifest** | SHA-256, byte count, line count of every AR-E / PS / FX / QP artifact; **final overall hash-of-hashes** of the new chain; manifest hash posted to Linear. AR-E-11 is **only** this overall manifest, never a PCSB-n identity and never an incomplete-capture digest list |

### 14.3 Custody rules

* Fingerprint everything.
* Append-only. No prior transcript, capture or manifest is overwritten, renamed or edited.
* Non-disclosure: no connection strings, credentials, JWTs, message bodies, customer PII,
  member emails or phone numbers.
* Two-place record: redacted artifacts under a separately authorized documentation path if PM
  so requires; Linear carries digests and the outcome. Neither alone is the whole record.
* **New-chain closure:** AR-E-QP → AR-E-2 → AR-E-4 → AR-E-5 → AR-E-6 → AR-E-7 must be
  fingerprint-linkable as one **new** unbroken chain. AR-E-4F artifacts are cited by the chain
  and must remain distinct from AR-E-4. A gap in the **new** chain is BLOCK. Completeness of
  the new chain is **not** completeness of the old chain. AR-E-0 exists specifically so that
  statement cannot be lost.
* Failure is evidence. BLOCK, HOLD and Founder decline are packaged with the same custody
  standard as PASS.
* Incomplete PCSB-1 and incomplete PCSB-2 remain AR-E-4F. They are never silently filed as
  AR-E-4 and never become AR-E-11.

---

## 15. HARD STOPS FOR LATER RECOVERY EXECUTION

These stop later recovery-evidence work. They do **not** exist until this procedure is
terminally accepted and a later work order is issued. Numbered for scanability; they do **not**
renumber Revision 6 HS-1…HS-41.

| ID | Stop |
|---|---|
| **AR-HS-1** | Custody mismatch against §2 |
| **AR-HS-2** | P-0 failure / HS-41 in any recovery window that would interpret P-6/P-7 |
| **AR-HS-3** | Any committed production mutation in a recovery-evidence window |
| **AR-HS-4** | Any attempt to reconstruct B-11 or to name PS-GRANT recovered B-11 |
| **AR-HS-5** | Relabeling KIV-201 BLOCK as PASS |
| **AR-HS-6** | Manufacturing production MIV/member/kind state to force a §7.1.1 case |
| **AR-HS-7** | Fixture cited as production, or §7.4 bridge missing/failing |
| **AR-HS-8** | Direct resolver call used as the positive member-path test |
| **AR-HS-9** | Owner/superuser invocation used except for F-KIND-B as scoped in §7.5 |
| **AR-HS-10** | Treating KIV-202 MAY STAND as KIV-14 acceptance |
| **AR-HS-11** | Auto-routing BLOCK to KIV-190 / §5.7 |
| **AR-HS-12** | Editing accepted Revision 6, exact `0109`, or KIV-200/201 evidence |
| **AR-HS-13** | Declaring `KIV-14 CURRENT-STATE ACCEPTANCE PASS` without the exact §9 MAY PROCEED sentence |
| **AR-HS-14** | Any KIV-25 / deployment / Meta / WhatsApp / restaurant / Alpha action from this path |
| **AR-HS-15** | Cancelling G5 because recovery PASSed |
| **AR-HS-16** | Using an incomplete PCSB-n, including PCSB-1 or PCSB-2, as the operative prospective baseline |
| **AR-HS-17** | In-window improvised SQL, unreviewed client control flow, or unreviewed alias/order expression after authentication |
| **AR-HS-18** | Same-work-order query correction and continuation after a client, query, or evidence failure |
| **AR-HS-19** | Second authentication, reconnect, or silent restart after a client, query, session, connection, or evidence failure in the same work order |
| **AR-HS-20** | PCSB-n production authentication without terminally accepted procedure bytes **and** an independently reviewed hash-pinned query/driver package covering every required §5 artifact through PS-TIME end |
| **AR-HS-21** | Overwriting, renaming, or upgrading incomplete PCSB-1 / PCSB-2, or any later incomplete PCSB-n, to PASS |
| **AR-HS-22** | Treating §5.9 query-package tooling validation as §7 fixture evidence or as production evidence |
| **AR-HS-23** | Using a **complete but invalidated / stale** designated baseline as operative for §6, independent recovery review, Founder §9, or AR-E-4 after material drift or package invalidation |
| **AR-HS-24** | Using a client that cannot prove backend identity without helper SQL before P-0; or treating unproved same-connection / same-backend continuity as a complete PCSB-n |
| **AR-HS-25** | Inventing schemas, roles, functions, types, policies, extensions, or request-GUC semantics solely so a §5.9 tooling-validation query will parse; or calling a Class B query validated against a bare PostgreSQL cluster |

Any AR-HS = `ACCEPTANCE RECOVERY BLOCK`.

---

## 16. REQUIRED LATER SEQUENCE (AFTER THIS PROCEDURE IS ACCEPTED)

Informative only. **This section authorizes none of these steps.** It creates **no** standing
authentication authority and does **not** release PCSB-3.

1. PM pins these exact procedure bytes and records terminal procedure acceptance.
2. Fresh no-production query/driver-package preparation work order (§5.8–§5.9).
3. Fresh independent query/driver-package review and hash-pin.
4. Only then may PM consider a fresh read-only capture work order for the next unused PCSB-n
   identity. Historically that next unused identity after incomplete PCSB-1 and incomplete
   PCSB-2 would be PCSB-3. **This document does not create that work order.**
5. Fresh live §6 verification work order against the operative baseline (zero committed
   mutation). If no operative designation currently exists, this step **must not** be released.
6. Fresh disposable §7 fixture work order (no production).
7. Independent recovery review of the new chain, including AR-E-0 and AR-E-4F.
8. If evidence PASS: Founder §9 decision issue (no SQL).
9. If Founder MAY PROCEED: PM may record `KIV-14 CURRENT-STATE ACCEPTANCE PASS`.
10. KIV-25 / Alpha remain separately gated.

If any step BLOCKs: stop. Do not reverse from the BLOCK. Do not retry `0109`. Do not complete
an incomplete PCSB-n in a later window under the same identity.

---

## 17. BUILDER CANDIDATE BOUNDARY

This file is the **only** intended changed path of the KIV-212 candidate.

Accepted Revision 6 bytes remain byte-identical. Exact `0109`, `0108`, `0107`, runtime,
migrations, tests, config and package files are not edited by this work order.

PCSB-1 and PCSB-2 remain incomplete historical recovery evidence. No PCSB-3, production SQL,
fixture, tooling-validation execution, KIV-190, KIV-25, or Alpha action is authorized by these
bytes.

`Authorizes: Nothing.`
