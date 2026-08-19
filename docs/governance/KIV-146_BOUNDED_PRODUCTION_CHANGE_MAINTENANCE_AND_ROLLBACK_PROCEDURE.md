# KIV-146 — BOUNDED PRODUCTION-CHANGE MAINTENANCE AND ROLLBACK PROCEDURE

**One-restaurant WhatsApp-first controlled alpha · KIV-142 rebaseline**

| Field | Value |
|---|---|
| Issue | KIV-146 — Define bounded production-change maintenance and rollback procedure for alpha |
| Milestone | G2 — Security, order truth, WhatsApp & safety |
| Authored | 17 August 2026 |
| Revision | **REVISION 6** — discharges KIV-178 R6-1 … R6-13: consciously re-instantiates the Class A ceremony for the exact terminally source-cleared KIV-174 additive `0109` remediation of the already-committed-but-unaccepted post-`0108` production state, and leaves the KIV-25 Change Class B contract unchanged |
| Supersedes | Revision 5, commit `8691d60a8141f470fe974641eccebd96f3a7e000` (**terminally accepted**; remains historical accepted evidence and the operative procedure until this revision is terminally accepted — see §0.4) · Revision 4, commit `a8d675b80f3af041b1db32c7f9344c64d74adac4` (**terminally accepted**) · Revision 3, `5ea300040565378c317fe9188d415e5370d68be8` (BLOCKED by KIV-160 Attempt 3) · Revision 2, `af1567b49a50e138ff3ba464cb2fe470c9ef1f96` (BLOCKED by Attempt 2) · Revision 1, `369faa747c48b10a01749b092e50a65e15f4d159` (BLOCKED by Attempt 1) |
| Status | **DRAFT CANDIDATE — awaiting the KIV-178 review chain (fresh independent Engineering → separate Quality → separate Auditor) and external Linear PM terminal acceptance of this exact revision.** Not accepted. Not self-approved. Builder does not self-approve. Until external PM terminal acceptance, **Revision 5 (`8691d60a`) remains the operative accepted procedure**, and no Change Class A2 step in this document may be performed. |
| Governs | KIV-14 (Change Class **A1** — historical `0108` first application; and Change Class **A2** — the exact `0109` remediation, new in Revision 6) and KIV-25 (Change Class **B**) only |
| Replaces | The standalone full P0-MAINT / M2 maintenance-interleave program as an alpha milestone (KIV-142 §"Maintenance/control-plane simplification") |
| Authorizes | **Nothing.** This document is a procedure/evidence gate. |
| Authority status as at | **2026-08-17T18:02:46Z** for the Revision-5 Class A1 / Class B authorities (§2.1). **Change Class A2 forward authority and Class A2 post-commit reversal authority do not exist and are not requested by this document** (§2.1, §5.1, §0.4) |

### Revision 6 change log — KIV-178, the exact `0109` remediation ceremony

Revision 6 exists because **Revision 5 cannot govern the change that is actually next.** Revision 5
instantiates Change Class A as the *first application of `0108` to a database that does not yet have
it*. Production is no longer in that state: Release 4 committed exact `0108`, KIV-165 returned
BLOCK, and KIV-173 proved the authenticated member-control runtime is broken. The next Class A
forward action is the **exact additive `0109` remediation of an already-committed state**, which is
a different change against a different entry world. Revision 5's Class A preflight would in fact
**HARD STOP that run at HS-4** (§2.5, A5/Q-A), and its PF-3/HS-3 runner rule names `0108` by
filename and so does not textually bind a `0109` run at all.

Revision 6 therefore **splits Change Class A into A1 and A2** and gives every Revision-5 Class A
rule an explicit, recorded disposition for A2 — *retained*, *superseded for A2*, or *not applicable
to A2*. Nothing carries over by assumption. The complete rule-by-rule inventory is **§9.4**.

| Finding | Disposition | Sections changed |
|---|---|---|
| **R6-1** — revision identity and conscious scope transition. Auditor A-OBS-3: Revision 5 names `0108` 44 times and `0109` once — in §5.6, as an unauthorized "fix". Patching only PF-3/HS-3 and PF-4a/PF-4b would leave the rest of the Class A instantiation silently mis-scoped | **Change Class A1 / A2 split** introduced (§2.1, §0.4). Every Revision-5 Class A rule is dispositioned for A2 in **§9.4**, and each governing section carries an explicit A1/A2 scope line. Revision 5 remains historical accepted evidence and stays operative until this candidate is terminally accepted | **§0.4 (new)**, **§2.1**, §2.3, §2.4, §2.5, §2.6, §2.7, §3.2, §4.2, §5.1, §5.2, §5.6, §6, §7.1, §8.1, **§9.4 (new)** |
| **R6-2** — exact current production entry boundary. The A2 entry world is the committed post-`0108` state, not the pre-`0108` world | New **§2.6.5 Class A2 presence probes P-1 … P-8** (the exact polar opposite of the §2.6.3 absence probes, which are **not applicable to A2**), plus the recorded A2 entry facts in **§2.1.1**. Divergence or ambiguity = **HS-32** | **§2.1.1 (new)**, **§2.6.5 (new)**, §2.6.3 (scope line only), §3.2 |
| **R6-3** — PF-4a/PF-4b are inverted for A2 (Quality Q-A, Auditor A5, both binding). They expect `kivo_control_owner` and its membership to be **absent**; the committed post-`0108` state necessarily contains both, and `0109`'s own P1 requires the role to exist | **Consciously superseded for Change Class A2 only** by new **PF-4a2 / PF-4b2** (§2.5), which assert the correctly polarised post-`0108` topology and reject drift. The Revision-5 **R5-3 byte-identity rule and PF-4a/PF-4b themselves are left byte-identical and remain authoritative for A1** — the supersession is by scope, stated and reasoned, never by silent textual edit | **§2.5 (PF-4a2/PF-4b2 added; PF-4a/PF-4b unedited)**, §6 (HS-31), §9.2, §9.4 |
| **R6-4** — whole-file transaction. Revision 5 §2.4/PF-3 names `0108_kiv13_m1_additive_scope1.sql` by filename, so **as written it does not bind a `0109` run** | New **PF-3.A2** binds the exact `0109` runner, and **HS-3 is extended to A2** as a HARD STOP *before mutation*. The Auditor's stronger evidence is carried verbatim: under autocommit a **reported failure** leaves both the replaced function and a standing `INHERIT TRUE` residue, and the Auditor used that residue to redefine a governed function the executor does not own. **No statement-by-statement or autocommit escape hatch exists** | **§2.4 (PF-3.A2)**, §6 (HS-3 extended), §5.7 |
| **R6-5** — live `auth.uid()` semantic guard G1 … G5. After `0109` the governed resolver no longer calls `auth.uid()`, so its semantics must be proved *before* the swap and its future drift must be owned | New **PF-4g (G1 … G3)** read-only fail-closed guard in the same target and same maintenance window; **G4** re-capture immediately before the forward transaction (§3.2 B-17); **G5** standing owner — the **durable Kivo PM role** — with an explicit re-check trigger (§7.1.1, §9.5). **G2 is never an adaptation point**; comparison is semantic, not raw-whitespace text | **§2.5 (PF-4g)**, §3.2 (B-17), §6 (HS-33/HS-34), §7.1.1, **§9.5 (new)** |
| **R6-6** — true request-GUC security model. The comment inside the cleared `0109` source implying the request GUCs are not caller-settable SQL state is **false at the PostgreSQL layer**, independently proved by both Quality and the Auditor | The true model is recorded in **§2.6.4**: these GUCs *are* caller-settable at the database layer; the effective identity boundary is the request/PostgREST layer plus the unchanged actor/member/MIV/manager checks; exact `0109` introduces **no new identity source and no new authority path**. The source comment correction is a **separately gated later source pass** — this document does not modify `0109` and forbids folding the fix silently into integration | **§2.6.4 (new)**, §2.3, §9.1 |
| **R6-7** — no authorized `0109` post-commit reversal path exists (Quality Q-B, Auditor A6, both binding). KIV-167 authorizes **only** the exact Revision-4/5 §5.3 path, which is a broad `0108` teardown that would **drop** `kv_control_assert_actor` rather than reverse `0109` | New **§5.7 — Tier R-B2**, an exact `0109`-specific post-commit reversal that restores the exact accepted `0108` definition of that one function and nothing else. **§5.3 is left byte-identical** so KIV-167's authority is neither altered nor stretched. R-B2 requires its **own fresh separate Founder authorization, held unused before the forward run**, which **does not exist** and is not claimed here | **§5.7 (new)**, §5.1, §5.6 (clarification), §6 (HS-35 … HS-38), §2.7 |
| **R6-8** — dangerous-window residue incident guidance (Auditor A-OBS-2) | New **§5.8**: HARD STOP all mutation; read-only inspection; no automatic cleanup; no plain-superuser `REVOKE` assumption — a plain superuser revoke **fails** with `dependent privileges exist`; the correct prepared cleanup is a **grantor-issued bounded revoke** after exact state verification and explicit PM/Founder release; **`CASCADE` is forbidden** unless separately reviewed and authorized because it would also remove the governed standing membership `0108`/`0109` assert; full re-read before any further decision | **§5.8 (new)**, §6 (HS-39) |
| **R6-9** — the KIV-165 / KIV-173 migration-ledger contradiction | Resolved truthfully for the actual runner in **§7.1.1**: exact `0109` writes **no** ledger row; **absence of a `0109` row is not evidence the transaction failed**; ledger state is captured and reported as evidence only; **no retroactive `0108` row** and **no invented out-of-band `0109` ledger mutation**. Revision 5 §2.6/§7.1's unconditional `0108` ledger expectation is **not applicable to A2** | **§7.1.1**, §3.2 (B-12 scope), §9.4 |
| **R6-10** — forward success / post-commit verification for A2 | New **§7.1.1** after-state contract: exact repaired body semantics; owner, SECURITY DEFINER, empty `search_path`, signature, result shape and ACL unchanged; temporary capability fully returned; executor `SET ROLE` still unavailable; no unintended auth-schema privilege; both request-subject transports working; every fail-closed path intact; service path unchanged; HS-12-clean run; second application refuses; truthful ledger evidence; zero unrelated drift. **Separate independent post-remediation verification remains mandatory — executor evidence cannot self-close KIV-14** | **§7.1.1 (new)**, §7.4 |
| **R6-11** — integration custody I1 … I5 | Recorded in **§2.3.1**. The reviewed source artifact is exact `cc74e14c…`; it must **not** be rebased, cherry-picked or re-materialized, because that would silently transfer three independent reviews to bytes nobody reviewed. **This document authorizes no integration and no PR** | **§2.3.1 (new)**, §9.1 |
| **R6-12** — KIV-25 Change Class B no-regression | **Class B is untouched.** §5.4, §7.2, §7.3, §7.3.1, §7.5, PF-5/PF-5a/PF-5b, IS-1/IS-2, the four hold transitions, RM-VERIFY and HS-25 … HS-30 are **byte-identical to Revision 5**. §9.2.3 records the proof | §9.2.3 (new) — **no Class B section edited** |
| **R6-13** — authority / status precision | **§0.4** and **§5.1** make the four separations impossible to misread: source acceptance ≠ merge authority; procedure acceptance ≠ production authority; forward production authority and `0109` reversal authority are **two separate Founder decisions**; no KIV-159/KIV-167 authority may be widened by inference; Alpha GO remains a separate G4 Founder decision; and the in-file status stays **DRAFT** until external Linear PM terminal acceptance | **§0.4 (new)**, **§0.2**, **§1**, §2.1, §5.1, §9.3 |

**Everything Revision 6 did *not* touch stays closed.** F-1 … F-7 remain CLOSED; the Revision 3,
4 and 5 fixes remain intact; **§5.3 is byte-identical to Revision 5 and Revision 4** (full-section
SHA-256 `4e9fa2e2855d378becffdae2fa261f59f952ab677a9af2a252aae0cc21aa3e2a`, unchanged), so KIV-167's
separately approved reversal path is not silently altered; **PF-4a and PF-4b are byte-identical**;
and every Change Class B rule is byte-identical. §9.2 records the re-verification, §9.2.3 the
Revision 5 carry-forward, and §9.4 the complete Class A disposition inventory.

Revision 6 is documentation-only. No migration, source, runtime or production artifact was changed.
`0109`, `0108` and `0107` are untouched, and no PR, merge, integration or production action was
performed.

### Revision 5 change log — KIV-168 Release 3 procedure defects — historical, retained

| Finding | Disposition | Sections changed |
|---|---|---|
| **R5-1** — Class A could not lawfully satisfy §2.7 item 8 / §3.2 B-14: both-class wording required reading "the governed alpha ingress control named in the KIV-25 authorization", while §2.5 PF-5 makes that exact control a **Change Class B / KIV-25** requirement and KIV-25 — downstream of KIV-14 and KIV-165 — names none yet. KIV-14 Production Execution Release 3 correctly HARD STOPPED before mutation on exactly this circular dependency | Fixed without inventing a control and without weakening Class B: **PF-5 / IS-1 / IS-2 / hold-transition evidence is now explicitly Class B-only**, and Class A records the **fixed B-15 ingress-applicability statement** tied to §4.2 — no ingress read, no ingress mutation, no KIV-25 naming decision awaited, no inference from alpha GO/NO-GO status, and no deployment/Meta/account/restaurant action required to satisfy a read-only entry check | **§2.5 (class applicability)**, **§2.7 item 8**, **§3.2 (B-14, new B-15)**, **§4.2**, §4.3, §7.3.1, §8.1 (E-6) |
| **R5-2** — §3.2 B-9 sent the both-class before-state capture to the §2.6.2 C-1 … C-4 assertions, whose `::regclass` casts cannot resolve in the intended Class A before-state — the three `0108` tables correctly absent — so a **correct** production state would error the capture. §5.2 already acknowledged the same technical fact for residue checking | Fixed. New **§2.6.3 catalog-safe absence probes A-1 … A-4** (`to_regclass` / `to_regtype` / allow-listed name reads that return NULL or zero rows instead of erroring; never a raw total) define the executable Class A before-state; **C-1 … C-4 are not run while the tables are absent and keep their authoritative after-state role unchanged (§7.1)**; any unexpected presence is **HS-11**. §5.2's by-table-absence residue rule now cites the same executable probe form | **§2.6.3 (new)**, **§3.2 (B-9, lead-in)**, §5.2 (cross-reference only) |
| **R5-3** — KIV-168's no-regression / authority-preservation obligations | Proven on the artifact and recorded: **§5.3 Class A post-commit reversal byte-identical to Revision 4** (KIV-167's separately approved reversal path is not silently changed); **PF-4a/PF-4b byte-identical**; PF-4f intact; §5.2 behavior unchanged in substance; Class B **PF-5 same-control / finite-smoke-bound / objective-read-back** rules and every §7.5 hold rule intact and not weakened; §5.4 restoration, §6 HARD STOPs and the exact source/target/whole-file-transaction/contemporaneous-N/role/evidence rules untouched; `0108`, `0107`, runtime code and production untouched | §9.1, **§9.2 (Revision 5 re-verification)**, **§9.2.2 (new carry-forward)** |

**F-1 … F-7 (Attempt 1) remain CLOSED, and the Revision 3 and Revision 4 fixes remain
intact.** Revision 5 does not reopen, weaken or redesign any of them; §9.2 records the
re-verification, §9.2.1 the Revision 3 carry-forward, and §9.2.2 the Revision 4 carry-forward.

Revision 5 is documentation-only. No migration, source, runtime or production artifact was
changed. `0108` and `0107` are untouched.

*(The two paragraphs above are Revision 5's own record, retained verbatim as historical evidence.
Revision 6's equivalent statements are in the Revision 6 change log above.)*

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
* Not production authority. Founder authority for Change Class **A1** lives in KIV-159 and for
  Change Class **B** in KIV-144. **Change Class A2 has no forward authority and no reversal
  authority: neither exists, and KIV-159 and KIV-167 confer nothing on it** (§0.4, §2.1, §5.1).
  **§2.1 is the single place this document states their status, as at one timestamp** — do not
  restate it elsewhere. Completion and independent acceptance of KIV-146 is a
  **precondition** of those authorities being exercised, never a substitute for them.
* Not a licence to touch anything outside the exact boundary in §2.

### 0.3 Deliberately excluded (do not build to satisfy this issue)

Maintenance-mode toggles or a maintenance control plane; generic connection draining or
request-queue infrastructure; multi-restaurant cohort or backup-substitution machinery;
printing/retry/reprint architecture; M6–M9 control-plane stages; KIV-88 advisory repair;
order-truth implementation; WhatsApp/Meta configuration; deployment tooling; monitoring or
alerting build-out. Each is either deferred by KIV-142 or owned by a different issue.


### 0.4 Revision 6 identity, and exactly what is and is not authorized (R6-1, R6-13)

**Revision 5 remains historical accepted evidence, and remains the operative accepted procedure
until this candidate is terminally accepted.** Revision 6 is a **DRAFT candidate**. It becomes
operative only after a fresh independent Engineering → Quality → Auditor chain and **external
Linear PM terminal acceptance**. The in-file status line is candidate metadata; the Linear PM
record is the acceptance event, exactly as it was for Revision 5. Nothing in this document may be
executed before that acceptance.

**Why a new revision was unavoidable.** KIV-14's next Class A forward action is **the exact `0109`
remediation of an already-committed-but-unaccepted `0108` state** — *not* the first application of
`0108`. Revision 5's Class A instantiation is written for the pre-`0108` world throughout: its
PF-4a/PF-4b expect the governed role and its membership to be absent, its PF-3 names the `0108`
filename, its §2.6 boundary describes creating the whole control plane, and its §5.3 reversal is a
full `0108` teardown. **None of that may be silently reused for `0109`.** Revision 6 splits Class A
into **A1** (historical `0108` first application) and **A2** (the exact `0109` remediation), and
§9.4 records a disposition for every Revision-5 Class A rule: *retained*, *superseded for A2*, or
*not applicable to A2*.

**The four authority separations, stated once, here.**

1. **Source acceptance ≠ merge authority.** KIV-177 `AUDITOR CLEARED` and PM's terminal source
   acceptance cover the exact unchanged `0109` **bytes** only. They authorize **no** PR, merge,
   rebase or cherry-pick. §2.3.1 governs integration, and **this document authorizes none**.
2. **Procedure acceptance ≠ production authority.** Terminal acceptance of Revision 6 would make
   this the governing procedure. It would **not** authorize applying `0109` to production. That
   requires a **new, separate, exact Founder forward authorization for Change Class A2**, which
   does not exist. **KIV-159's forward authority was for the exact `0108` M-1 retry and is
   consumed and spent; it confers nothing on A2 and must not be widened by inference.**
3. **Forward production authority and `0109` reversal authority are two separate Founder
   decisions.** The A2 post-commit reversal path of §5.7 requires its **own fresh separate Founder
   authorization, obtained before the forward run and held unused** (§2.7 item 5, §5.1).
   **KIV-167 confers zero `0109` reversal authority**: it authorizes only the exact already-reviewed
   §5.3 path, which is a `0108` teardown, and KIV-172 additionally found that path not safely
   executable against the observed committed state. **Neither authority may be widened by
   inference, and this document does not claim either exists.**
4. **Alpha GO remains a separate G4 Founder decision** and is not implied by any of the above.

**Current program state, for the avoidance of doubt.** KIV-14 is **blocked and not accepted**.
KIV-25 is **blocked and not authorized**. Release 4 is **consumed**. Alpha/Pilot remains **NO-GO**.

---

## 1. ROLES AND SEPARATION

| Role | Holds | May not |
|---|---|---|
| **Founder** | Production authority for the named change — Class A1 KIV-159, Class B KIV-144. **For Change Class A2 there is none: a new, separate, exact forward authorization is required and does not exist, and the §5.7 reversal requires its own fresh separate authorization that also does not exist** (§0.4, §2.1, §5.1) | — |
| **PM** | Fresh-reads custody, pins the exact source bytes, releases exactly one executor, receives HARD STOP reports | Execute the mutation |
| **Executor** | Runs preflight, before-state capture, the one authorized mutation, after-state read-back, evidence packaging | Approve its own result; adapt, repair or improvise; widen scope; run a second attempt; **be the sole approver of the materialized restoration text (§5.4.2)** |
| **Restoration verifier** (Class B only) | Independently verifies **every per-group materialized restoration artifact `RM-G-1 … RM-G-n` and `RM-MANIFEST`, issuing a PASS or BLOCK per artifact against its own SHA-256**, before the forward mutation — **RM-VERIFY**, §5.4.2 | Be the executor; have authored the restoration skeletons; execute anything |
| **Independent reviewer** | Accepts or blocks the result (KIV-145 for Class B; KIV-159 condition 5 for Class A1; **for Class A2, the separate mandatory independent post-remediation verification of §7.4** — executor evidence can never self-close KIV-14) | Have participated in execution |

The **restoration verifier** is separately released by PM. It may come from the same independent
Engineering lane as the acceptance reviewer, and the two may be the same window provided that
window is neither the executor nor the skeleton's author. RM-VERIFY is a short read-only check
of a short mechanical text (§5.4.2) — it is not new maintenance infrastructure, and nothing in
this procedure requires building any.

**Standing semantic-drift owner (Change Class A2, G5).** The **durable Kivo PM role** owns the
post-`0109` `auth.uid()` semantic re-check obligation defined in §9.5. This is a standing role
obligation, not a person and not a new lane: after `0109` the governed resolver no longer calls
`auth.uid()`, so vendor changes to it stop propagating and someone must own noticing. The owner is
named here so the obligation cannot become nobody's.

**Single-executor rule.** Exactly one executor, one session, one authorized attempt.
Concurrent or successive executors on the same authorization is a HARD STOP (§6, HS-19).

**No self-acceptance rule.** The executor's own after-state read-back is evidence, never
acceptance. Downstream G2 work may not rely on a production result until the independent
reviewer accepts it.

---

## 2. PREFLIGHT AND THE EXACT AFFECTED BOUNDARY

### 2.1 The change classes this procedure governs (R6-1)

Revision 6 splits the former single Change Class A into **A1** and **A2**. They are different
changes against different entry states and they do **not** share a preflight, a runner, a boundary,
an after-state or a reversal path. Change Class B is unchanged.

| | **Change Class A1** | **Change Class A2** | **Change Class B** |
|---|---|---|---|
| Issue | KIV-14 — M-1 / `0108` first production application | KIV-14 — exact `0109` member-actor runtime remediation of the committed `0108` state | KIV-25 — minimum alpha security hardening |
| Status of the class | **Historical / consumed.** Release 4 applied it; KIV-165 returned BLOCK | **The next Class A forward action**, and the reason Revision 6 exists | Unchanged, not started |
| Authority issue | KIV-159 | **None. A new, separate, exact Founder forward authorization is required and does not exist** (§0.4) | KIV-144 |
| Authority status | **Done** — recorded 2026-08-17T15:59:34Z; **consumed by Release 4 and spent** | **DOES NOT EXIST.** KIV-159 is `0108`-specific and must not be widened by inference | **Done** — recorded 2026-08-17T15:59:19Z |
| Entry world | Pre-`0108`: governed role, control plane and MIV all **absent** | Post-`0108`: governed role, control plane and MIV all **present**; member runtime broken at `42501` (§2.1.1) | Live objects named by KIV-25 |
| Nature | Additive DDL + one insert into a new table | **One `CREATE OR REPLACE FUNCTION`** — exactly one function body, nothing else (§2.6.4) | Mutating owner / RLS / grant change on existing objects |
| Reversible by transaction alone | **Yes** (§5.2) | **Yes** (§5.2, A2 form) | **No** — needs the §3.3 before-state to restore (§5.4) |
| Post-commit reversal path | §5.3 — authorized by KIV-167 | **§5.7 (R-B2)** — new, unreviewed, and requiring its **own fresh separate Founder authorization held unused**, which does not exist. **§5.3 does not apply and KIV-167 confers nothing here** (§5.1, §0.4) | §5.4 bounded restoration |
| Block/drain required | **No** (§4.2) | **No** (§4.2) | **Conditional** (§4.3) |
| Post-execution acceptance | KIV-159 condition 5 — separately released independent reviewer (§7.4) | **Separate independent post-remediation verification, mandatory. Executor evidence cannot self-close KIV-14** (§7.1.1, §7.4) | KIV-145 (§7.4) |

**Where this document says "Class A" without a qualifier**, it is Revision-5 text that was written
for A1. §9.4 gives every such rule an explicit A2 disposition, and each governing section carries a
scope line. **A2 never inherits an A1 rule by default.**

### 2.1.1 Change Class A2 — the exact entry state (R6-2)

These are the recorded facts about the world A2 starts from. They are the reason A1's preflight
cannot be reused. Every one of them must be **re-proved read-only at execution time** by the §2.6.5
presence probes — none may be assumed from this table.

1. **Exact `0108` is committed in production**, and **KIV-14 is not accepted**. Release 4 is
   consumed; no second `0108` attempt exists or is authorized.
2. **KIV-165 BLOCK remains operative** — HS-12 fired on the unexpected `WARNING: no privileges were
   granted for "auth"`, and the migration-ledger contract was irreconcilable.
3. **KIV-172 found the exact §5.3 reversal not safely applicable** to the observed committed state.
4. **KIV-173 proved the authenticated member-control runtime is broken.** Every authenticated
   member entry point fails closed with **SQLSTATE `42501`, `permission denied for schema auth`**,
   because `public.kv_control_assert_actor(uuid,text,boolean)` is SECURITY DEFINER and executes as
   `kivo_control_owner`, which **lacks `USAGE` on schema `auth`** — `0108` line 175 could not grant
   it and emitted only a warning. Service-role system paths return before that resolver and are
   unaffected.
5. **Exact `0109` is terminally source-cleared but not integrated, not merged and not applied**
   (KIV-174 Builder → KIV-175 Engineering PASS → KIV-176 Quality PASS → KIV-177 `AUDITOR CLEARED` →
   PM terminal source acceptance).
6. **No `0108` migration-ledger row exists** under the raw `psql` execution that was used. This is
   a true fact about the runner, not evidence of failure (§7.1.1, R6-9).
7. **KIV-25 remains blocked and not authorized**, and Alpha/Pilot remains **NO-GO**.

**Fail-closed rule.** Any divergence from, or ambiguity about, this expected post-`0108` state at
A2 preflight time is **HARD STOP (HS-32)**. Record the exact observation verbatim and report to PM.
Do not adapt, repair, re-grant, retry `0108`, or proceed on a "close enough" reading.

**Authority status is stated as at 2026-08-17T18:02:46Z**, the single timestamp for every
authority fact in this document. Both **Class A1 and Class B** authorities existed when Revision 2
was written; neither is pending. **Change Class A2 carries no timestamp because it has no authority
to timestamp** — its forward authorization and its §5.7 reversal authorization are absences, not
pending items, and an absence needs no as-at date. Anyone re-reading this document later must
re-read KIV-159 and KIV-144 rather than rely on this table.

**What those authorities do and do not do.** Each creates authority only. Neither executes
production, and neither substitutes for the §2.7 entry checklist — KIV-159 condition 1 makes
independent acceptance of *this procedure* a precondition of Class A execution, and PM must
separately release the exact executor. A change that is not Class A or Class B is out of scope;
do not stretch this procedure to cover it, and do not treat KIV-144 as covering Class A
(KIV-159 says so explicitly). **Equally, do not treat KIV-159 as covering Change Class A2**: its
forward authority was for the exact `0108` M-1 retry, it was consumed by Release 4, and it is
spent. Widening it by inference is exactly the failure §0.4 exists to prevent.

### 2.2 Target identity — PF-1

The only permitted production target is the Supabase project confirmed by KIV-75:

```
project name : MaitreAi
project ref  : zlighrbsjexrozrmuwpw
```

The executor must state the connected project ref back from the live session before any other
step. Any other ref, any ambiguity, any inability to display it = **HARD STOP (HS-1)**.

### 2.3 Source pin — PF-2 (Change Class A1)

> **Scope (R6-1).** This section is **Change Class A1**. The Class A2 pin is **PF-2.A2** below;
> it is a different artifact and does not replace this one. `0108`'s identities remain recorded
> here because A2's preconditions and its §5.7 reversal both assert against them.

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

**PF-2.A2 — source pin (Change Class A2), the exact `0109` artifact (R6-1, R6-11).**

PM pins the A2 execution to these exact bytes. As with PF-2, **the executor must recompute every
identity below at pin time and compare — never trust this table.**

| Item | Value |
|---|---|
| Repository | `mohamedyousalama-ctrl/MaitreAI` |
| Reviewed source commit | `cc74e14c16a8b5e02d9ea9668976b83de7aeb872` — **sole** parent `14ace390b865d1e436fec0eab5c47eb7a2d8424b` |
| Branch carrying it | `claude/kiv-174-additive-0109-uleey7` |
| `supabase/migrations/0109_kiv174_member_actor_runtime_repair.sql` | git blob `8923ed066d21a5cbac5f6ffc47606aee9b5c9c07` · 22,161 bytes · 425 lines · SHA-256 `e1a185e3a38b41fe1c5c9e8f9ebbedaefd88b9151cf390cf0cf22aa9123fa9e3` |
| Source-clearance chain | KIV-174 Builder → KIV-175 `ENGINEERING PASS` → KIV-176 `QUALITY PASS` → KIV-177 `AUDITOR CLEARED` → PM terminal source acceptance |
| Already-committed baseline it repairs | `0108`, blob `7b500626331dd4eaf4620d29c95953740f6e5541`, SHA-256 `00cd7b7fe2ee581df7b9d038301123db45a80962fe8a6ad3c0435e2893dea9ee`, at lineage commit `d5b4b1dd0925964ae44d55e125893081afddc651` |

Three facts PM must carry into the A2 pin decision, none of which this procedure authorizes anyone
to "fix":

1. **The reviewed `0109` bytes are terminally source-cleared and must not be modified by anyone,
   for any reason, under this procedure.** Any change to those bytes voids the KIV-175/176/177
   chain and requires a **new** source chain (§2.3.1 I4).
2. **The inaccurate security comment inside `0109` section 3 is a known, adjudicated, non-blocking
   documentation defect** with a binding correction obligation (§2.6.4, R6-6). Its correction is a
   **separately gated later source pass**. It must **not** be fixed in this window, and it must
   **not** be folded silently into integration.
3. **`0109`'s own closing comment sketches a manual reversal.** That sketch is **not** a reviewed
   or authorized procedure and confers no authority. The governed A2 reversal is **§5.7**, and it
   needs its own review and its own Founder authorization.

Fingerprint mismatch of any kind, or an A2 pin taken from any other commit, branch or blob =
**HARD STOP (HS-2)**.

### 2.3.1 Integration custody I1 … I5 (Change Class A2) (R6-11)

**This document authorizes no integration, no PR and no merge.** I1 … I5 are recorded so that a
future, separately authorized integration cannot silently break the source chain. They were
verified read-only at Revision 6 authoring time and **must be re-verified live at integration
time** — never assumed from this table.

| | Rule |
|---|---|
| **I1** | The integration base must contain the exact `d5b4b1dd0925964ae44d55e125893081afddc651` `0107`/`0108` lineage, or a **freshly verified descendant** of it. Verify ancestry at merge time. |
| **I2** | **Current `main` is forbidden as an integration target while it lacks that lineage.** At Revision 6 authoring time `main` was `14ace390b865d1e436fec0eab5c47eb7a2d8424b` and its `supabase/migrations/` tree contained neither `0107` nor `0108`; `d5b4b1dd…` was **not** an ancestor of `main`. |
| **I3** | Immediately before integration, **reverify** that the base still resolves `0108` to blob `7b500626331dd4eaf4620d29c95953740f6e5541` and that the `0109` slot is still **free**. |
| **I4** | The integrated result must preserve the exact `0109` blob **`8923ed066d21a5cbac5f6ffc47606aee9b5c9c07`**, add **no** unexpected paths, contain **zero** deletions, and retain `0107` → `0108` → `0109` ordering. **Any changed `0109` byte voids the KIV-175/176/177 review chain and requires a new source chain.** |
| **I5** | If PR #571 lands on `main` first, `main` becomes an **eligible** target only after fresh ancestry and blob verification. Eligibility is never assumed from the fact that the PR merged. |

**Do not rebase, cherry-pick or re-materialize the accepted `0109` commit.** Doing so would
materialize a *different* commit and silently transfer three independent reviews to bytes nobody
reviewed. The reviewed artifact is exact `cc74e14c16a8b5e02d9ea9668976b83de7aeb872`, and it stays
that commit.

### 2.4 Runner proof — PF-3 (Change Class A1)

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

**PF-3.A2 — runner proof (Change Class A2). This is the rule that actually binds a `0109` run
(R6-4).**

PF-3 above names `0108_kiv13_m1_additive_scope1.sql` **by filename**, so as written it does **not**
textually bind a `0109` run. That gap is closed here rather than by editing PF-3. For Change Class
A2 the executor must use:

```
psql --single-transaction -v ON_ERROR_STOP=1 -f 0109_kiv174_member_actor_runtime_repair.sql
```

or a runner **independently proved** to wrap the entire file in one transaction. Exact `0109`
carries no top-level `BEGIN`/`COMMIT` of its own, exactly as `0108` does not, so the transaction
must come from the runner.

**Inability to prove whole-file single-transaction wrapping is a HARD STOP (HS-3) *before any
mutation*.** Not after. Not "proceed carefully". Before.

**Why this is not a formality — the exact evidence, carried forward.** KIV-175 Engineering,
KIV-176 Quality and KIV-177 Auditor each independently built a scaffold that fails *after* `0109`
section 2 takes the temporary capability and *after* section 3 replaces the function, but before
section 4 restores. The results:

* **Under the required wrapper**, the injected failure rolled back **byte-identically** to the
  pre-`0109` state across a full property snapshot — including the function body hash and the
  complete membership topology — and the pre-`0109` `42501` defect was still present afterwards,
  proving the rollback was genuine and not a silent repair.
* **Under autocommit, the migration reports failure while having already changed behaviour**: the
  function is left **already replaced**, and a standing membership
  `kivo_migrator/kivo_migrator/admin=false/set=false/inherit=true` **survives**.
* **The Auditor went further and exercised what that residue confers.** With it in place, the
  Auditor successfully executed `CREATE OR REPLACE FUNCTION` against `public.kv_control_mgr` — a
  governed function owned by `kivo_control_owner` **that the executor does not own**. `SET` stays
  false throughout, but **`INHERIT` alone is exactly the capability that permits redefining every
  governed control function**, which is the entire mechanism of this migration. A *reported
  failure* therefore leaves the executor able to rewrite the control plane.

**There is no statement-by-statement or autocommit escape hatch, under any circumstance.** Not to
"see how far it gets", not to isolate a failing statement, not to work around a runner limitation.
If the wrapper cannot be proved, the change does not run. Cleanup of residue from an unauthorized
or misconfigured non-transactional run is **§5.8**, and it is an incident, not a step.

### 2.5 SELECT-only production preflight — PF-4

Read-only, separately Founder-authorized, run immediately before the mutation, in the same
session and against the same pinned target. **Recording these here does not authorize running
them.**

> **Scope (R6-1, R6-3).** PF-4a … PF-4f below are **Change Class A1** as written: they assert the
> **pre-`0108`** world. **PF-4a and PF-4b are inverted for Change Class A2** and would HARD STOP the
> very run A2 requires — see the supersession at **PF-4a2 / PF-4b2** below, which is a conscious,
> reasoned, scope-limited replacement, **not** an edit of the mandated text. **PF-4a and PF-4b
> themselves are left byte-identical and remain authoritative for A1.** PF-4c, PF-4d, PF-4f and the
> new PF-4g each carry their own A2 disposition below. §9.4 records all of them.

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

**PF-5 (Change Class B) — the two values KIV-25 must name, or nothing runs (R3-4).**

Revision 3 assumed these existed. Assuming is not fail-closed: a missing smoke bound would leave
the executor to invent one in-window, or to run an unbounded smoke check. Both are now
impossible.

**PF-5a — the exact governed ingress/hold control.** The KIV-25 authorization must name it
precisely enough that all four are true:

1. its state can be **read read-only** by the executor;
2. reading it is **inside this procedure's read-only boundary** — no deployment, no Meta or
   account action, no restaurant action (§0.2). A control that can only be inspected by an
   out-of-boundary action does not qualify;
3. it is the **same control** engaged at L-1, released at L-5, re-engaged at L-8 and reverted at
   L-12 (§4.3 same-control rule);
4. exactly **one** control is named — two candidates, an alias, or a description that could
   match more than one mechanism is ambiguity, not a name.

**PF-5b — a finite wall-clock smoke bound.** The KIV-25 authorization must name an explicit,
finite duration bounding the L-6 / Q-4 smoke check. **"At the executor's discretion", "as long
as needed", an open-ended value, zero, a negative value, or no value at all is invalid.**

**Failure of either = HARD STOP (HS-30), before any Class B mutation.** Missing, unreadable,
ambiguous, out-of-boundary or invalid all fail the same way. The executor does not supply,
infer, default or negotiate either value: they are KIV-25's to state, and until KIV-25 states
them Class B does not start.

**Objective read-back after every hold transition.** After **each** of L-1, L-5, L-8 and L-12
the executor **reads the PF-5a control's state back** and records the observed value beside the
intended one. A timestamp records *when* something was attempted; only the read-back records
*what the state actually is*. An observed value that does not equal the intended post-transition
value is **HS-29** — except at L-12, where §7.5.4 routes it to the holding state.

**Class applicability (R5-1).** PF-5, PF-5a/PF-5b, IS-1/IS-2 and the four hold transitions
exist **only for Change Class B**. Change Class A neither satisfies nor is gated on any of
them: it reads no ingress control, requires none to be named by KIV-25, and records the fixed
**B-15** statement instead (§3.2, §4.2). No Class A step waits on, or is failed for, a KIV-25
naming decision. Nothing in this paragraph relaxes any PF-5 obligation for Class B.

### 2.5.1 Change Class A2 preflight — the conscious supersession (R6-3, Q-A, A5)

**Why PF-4a/PF-4b cannot be reused, stated plainly.** PF-4a asserts `kivo_control_owner` does not
exist. PF-4b asserts it carries no standing membership. Both expect **zero rows**, and any returned
row is **HS-4**. After Release 4 committed exact `0108`, the role **exists** and PostgreSQL's
automatic `CREATE ROLE` membership record **exists** — so PF-4a and PF-4b would each return a row
and **hard-stop the `0109` run at HS-4**. Worse, exact `0109`'s own precondition **P1 requires that
role to exist** and aborts if it does not. The two contracts are directly contradictory: satisfying
Revision 5's Class A preflight and satisfying `0109` are mutually exclusive.

Revision 5 additionally records PF-4a/PF-4b under **R5-3** as *byte-identical to Revision 4* and
*"KIV-14 mandated text, verbatim"*, with divergence being **HS-2**. **That rule is therefore
consciously superseded for Change Class A2 and for Change Class A2 only.**

**The reason for the supersession, on the record:** the mandated text is correct for the change it
was mandated for — the *first application of `0108`* — and remains authoritative there. It is not
correct for a *remediation of the already-applied state*, because it asserts the absence of exactly
the objects that remediation requires to be present. **This is a change of change-class, not a
change of the rule.** PF-4a, PF-4b and the R5-3 byte-identity obligation are left **byte-identical**
and continue to govern A1 unchanged. Nothing below weakens any A1 obligation, and **no silent
textual edit was made.**

**Cardinality rule (R6-3).** Every A2 assertion below returns **exactly one row**. That is
deliberate. A1's assertions are satisfied by an empty result, so under A2's inverted polarity an
empty result — a typo, a permission error swallowed by tooling, a query run against the wrong
session — could be misread as clean. Under A2, **zero rows returned from any check below is itself
a failure**, not a pass. Every check in this section is also catalog-safe: PF-4a2, PF-4b2 and PF-4g
read `pg_catalog` through aggregates, so a missing object yields zero counts and NULLs rather than
an error — and under the rule above those are failures. (§2.6.5's P-6 and P-7 are the deliberate
exception, for the reason stated there.)

**PF-4a2 — `kivo_control_owner` must exist, with exactly the governed safe attribute set**
(supersedes PF-4a for A2):

```sql
select
  count(*)                                          as role_rows,
  bool_and(not r.rolsuper)                          as ok_not_super,
  bool_and(not r.rolcanlogin)                       as ok_no_login,
  bool_and(not r.rolbypassrls)                      as ok_no_bypassrls,
  bool_and(not r.rolcreatedb)                       as ok_no_createdb,
  bool_and(not r.rolcreaterole)                     as ok_no_createrole,
  bool_and(not r.rolinherit)                        as ok_no_inherit,
  bool_and(not r.rolreplication)                    as ok_no_replication
from pg_catalog.pg_roles r
where r.rolname = 'kivo_control_owner';
```

Expected: **exactly one row**, `role_rows = 1`, and **every** `ok_*` column **true**. Anything else
— `role_rows = 0` (the role is absent, so `0108` is not in the state this change repairs),
`role_rows > 1` (impossible for `pg_roles`, therefore a catalog or query fault), any `ok_*` false or
NULL, or no row returned at all — is **HARD STOP (HS-31)**. Do not create, alter, grant, revoke or
repair the role.

**PF-4b2 — the standing membership topology must be exactly the governed one, and nothing wider**
(supersedes PF-4b for A2):

```sql
select
  count(*)                                                  as membership_rows,
  count(*) filter (where m.set_option)                      as rows_with_set,
  count(*) filter (where m.inherit_option)                  as rows_with_inherit,
  count(*) filter (where not m.admin_option)                as rows_without_admin,
  count(*) filter (where not grantor_role.rolsuper)         as rows_with_nonsuperuser_grantor,
  count(*) filter (where member_role.rolname <> current_user) as rows_not_held_by_executor
from pg_catalog.pg_auth_members m
join pg_catalog.pg_roles member_role  on member_role.oid  = m.member
join pg_catalog.pg_roles target_role  on target_role.oid  = m.roleid
join pg_catalog.pg_roles grantor_role on grantor_role.oid = m.grantor
where target_role.rolname = 'kivo_control_owner';
```

Expected: **exactly one row**, with

```
membership_rows = 1
rows_with_set = 0
rows_with_inherit = 0
rows_without_admin = 0
rows_with_nonsuperuser_grantor = 0
rows_not_held_by_executor = 0
```

— that is, **exactly one** standing membership, held by **the governed non-superuser executor
itself**, granted by a **superuser**, with `admin_option = true`, `set_option = false`,
`inherit_option = false`. This is the inert `ADMIN`-only record PostgreSQL creates automatically
during `CREATE ROLE`, and it is precisely the topology §2.6, §7.1 and `0108` section 16 already
require. Alongside it the executor records the full detail listing using the **byte-identical
PF-4b query text**, run purely as evidence, so the exact rows reach PM verbatim.

**Any other shape is HARD STOP (HS-31)**, specifically including: `membership_rows = 0` (no
membership at all, which contradicts the recorded Release-4 state); `membership_rows > 1` (an
extra or widened membership); any row carrying `set_option` (SET ROLE capability the executor must
not have); any row carrying `inherit_option` (standing inherited capability — and the exact
signature of the autocommit residue in PF-3.A2 and §5.8); any row lacking `admin_option`; a
non-superuser grantor; or a member that is not the executing role.

**The authoritative source of the expected topology is the Release-4 / KIV-165 production evidence,
not a disposable fixture.** The reviewers' PostgreSQL 17.11 fixtures used a fixture executor role
name; **that name is a fixture artifact and must never be pasted into a production assertion.**
PF-4b2 is written against `current_user` and role *attributes* precisely so that it asserts the
governed shape without hard-coding an identity. If the live executor identity does not match the
identity in the Release-4 evidence, that is a **HARD STOP (HS-32)** for PM, not something to
reconcile in-window.

**PF-4c (Change Class A2) — retained, unchanged.** `PUBLIC` must not hold `CREATE` on schema
`public`. Exact `0109` grants no schema privilege to anyone and asserts this itself in its
section 4. **HS-5** applies unchanged.

**PF-4d (Change Class A2) — not applicable.** PF-4d asserts `0107`'s dependency because `0108`
aborts on its own header check without it. `0109` has no `0107` dependency and makes no such check.
Its dependency on the committed `0108` state is asserted directly and far more precisely by the
§2.6.5 presence probes and by `0109`'s own P1 … P7 preconditions. **Recording PF-4d for A2 would
assert the wrong thing; it is deliberately not run.**

**PF-4f (Change Class A2) — retained and re-polarised, expectation `21`, not `0`.** PF-4f's
zero-row expectation is a *pre-`0108`* assertion (HS-24). In the A2 entry world the 21 governed
functions exist by design. The A2 form is the **§7.1 pattern-closure query, run as a preflight**:
re-run the exact PF-4f query text and require **exactly 21 rows, all owned by `kivo_control_owner`**
— the 21 functions of §2.6 and no others. A 22nd match means an unrelated function was captured by
`0108`'s wildcard scan and is outside the declared boundary; fewer than 21 means the control plane
is not in the state `0109` repairs. **Either is HARD STOP (HS-32).** The executor records the
verbatim signature list.

**PF-4g — the live `auth.uid()` semantic guard, G1 … G3 (R6-5).**

Exact `0109` replaces a call to `auth.uid()` with an inline expression that resolves the request
subject from the same two GUCs, in the same precedence. That substitution is only safe if the live
`auth.uid()` really does have the semantics the candidate was proved equivalent to. **The live
definition must therefore be proved, in the same target and the same maintenance window, before any
mutation.** This guard is read-only and fail-closed. It belongs here and **not** inside `0109`,
because putting it in the migration would require the migration to reach schema `auth` — precisely
the dependency this repair exists to remove.

**G1 — capture the live definition through `pg_catalog`, with no schema `auth` USAGE required:**

```sql
select
  count(*)                                    as uid_rows,
  min(p.prosrc)                               as prosrc,
  min(pg_catalog.md5(p.prosrc))               as prosrc_md5,
  min(pg_catalog.pg_get_functiondef(p.oid))   as functiondef,
  min(pg_catalog.pg_get_function_arguments(p.oid)) as arg_list
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'auth' and p.proname = 'uid';
```

Reading `pg_catalog` requires no privilege on schema `auth`; this was independently proved by
Engineering, Quality and the Auditor with a role holding
`has_schema_privilege(...,'auth','USAGE') = false`, non-superuser, not owning schema `auth`. The
executor records `prosrc`, `prosrc_md5`, `functiondef`, `arg_list` and the statement timestamp.

**G2 — fail closed unless the semantics are the accepted V4 two-GUC COALESCE behaviour.** The
required semantics are exactly those of the current upstream Supabase definition, which is what the
exact `0109` candidate was proved equivalent to across 26 independent cases by the Auditor and 24
by Quality:

```sql
coalesce(
  nullif(current_setting('request.jwt.claim.sub', true), ''),
  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
)::uuid
```

**Compare semantics, not raw text.** A whitespace-only or formatting-only difference is **not** a
semantic change, and an over-literal `md5(prosrc)` equality would fail closed on cosmetics. The
required evidence is a reasoned semantic determination — same two GUC sources, same precedence,
same inner `nullif` empty-string handling, same JSON `sub` extraction, same `::uuid` cast, same
short-circuit so that a present `claim.sub` means a malformed `claims` blob is never evaluated —
recorded beside the captured text and its hash. The hash is custody evidence; the determination is
the gate.

**G2 is never an adaptation point.** If the live definition is a V1/V2/V3 variant, a locally
modified body, or anything whose semantics are not V4-equivalent, the outcome is **HARD STOP
(HS-33)** and a **new adjudication** — never an in-window decision, and **never** a rewrite or
adjustment of `0109` to match what was found. The divergence is real and material: against a V1
single-GUC target the candidate would resolve subjects that the live resolver rejects, so
"adapting" would silently widen the authenticated surface. **`0109`'s bytes are terminally cleared
and are not modified by this procedure under any circumstance.**

**G3 — exactly one unambiguous zero-argument binding.** Require `uid_rows = 1` and `arg_list = ''`
(an empty argument list). More than one row means overload ambiguity and the governed resolver's
zero-argument call site cannot be proved to bind the function that was captured; zero rows means
there is nothing to compare against. **Either is HARD STOP (HS-34).**

**G4** — re-capture and re-verify immediately before the forward transaction — is **§3.2 B-17**.
**G5** — the standing post-`0109` drift obligation, its named owner and its re-check trigger — is
**§9.5**. All five are mandatory before any `0109` production application.


---

### 2.6 Exact affected boundary

> **Scope (R6-1).** The "Change Class A" boundary in this section is **Change Class A1** — what
> `0108` creates on a database that does not yet have it. It is **not** the A2 boundary. Change
> Class A2 creates nothing: its complete boundary is **§2.6.4**, one function body. This section is
> retained unchanged because A2's preconditions, its §2.6.5 presence probes and its §5.7 reversal
> all assert against the state described here.

**Change Class A1 — objects this change may create or write. Nothing else.**

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

*New triggers (**11**), all on the three new tables* — **9 ordinary triggers and 2 constraint
triggers**: `tg_miv_close_only`, `tg_miv_no_delete`, `tg_miv_no_truncate`, `tg_a0_no_update`,
`tg_a0_no_delete`, `tg_a0_no_truncate`, **`tg_a0_audit_exclusivity`**, `tg_a2_no_update`,
`tg_a2_no_delete`, `tg_a2_no_truncate`, **`tg_a2_parent_guard`**. The two bolded objects are
created by `CREATE CONSTRAINT TRIGGER ... AFTER INSERT ... DEFERRABLE INITIALLY DEFERRED`, which
means they appear in **both** `pg_trigger` and `pg_constraint` — see §2.6.2, which is why no raw
constraint total may be asserted.

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
Corrected against exact `0108` (blob `7b500626…`), the full inventory is **41 structural
constraints and 9 standalone indexes**. `0108` contains no `ALTER TABLE ... ADD CONSTRAINT`;
every constraint below is declared inline in its `CREATE TABLE`.

**These structural figures were independently confirmed by KIV-160 Attempt 3 and are retained
unchanged.** What Revision 4 corrects is not the arithmetic but the **catalog treatment**: the
word "constraints" here means the **41 structural table constraints**, which is a different
population from the rows `pg_constraint` actually returns for these tables. The two
`CREATE CONSTRAINT TRIGGER` objects add two further `pg_constraint` rows that are **not**
structural constraints. §2.6.2 is the authoritative counting rule; this section is the named
inventory it asserts over.

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

**Structural type breakdown**, which is what §2.6.2's assertion checks:

| `contype` | Meaning | Count |
|---|---|---|
| `p` | primary key | **3** — `miv_pkey`, `control_operations_pkey`, `conversation_audit_failures_pkey` |
| `u` | unique | **4** — `miv_identity_key`, `a0_1_operation_identity`, `a0_2_transition_unique`, `a2_1_transition_unique` |
| `c` | check | **28** — 3 MIV + 16 A0 + 9 A2 |
| `f` | foreign key | **6** — the six listed above |
| | **Structural total** | **41** |

**Reversal note.** All 41 structural constraints, both constraint-trigger catalog rows, all 11
triggers and all 16 index relations are dropped implicitly with their tables at §5.3 step 4.
None is dropped separately, and none may be dropped separately.

### 2.6.2 Filtered, version-robust catalog assertions (R3-5)

Revision 3 told the executor to "query `pg_constraint` for the 41". That assertion is unsafe.
`CREATE CONSTRAINT TRIGGER` records a row in `pg_constraint` with `contype = 't'` in addition to
its `pg_trigger` row, so `tg_a0_audit_exclusivity` and `tg_a2_parent_guard` add two rows. A raw
table-scoped count therefore returns **43**, not 41, and would produce a **false HARD STOP** on a
correct application. The same hazard exists for triggers: the 6 foreign keys create internal
referential-integrity triggers, so a raw `pg_trigger` count is far greater than 11.

Both are fixed the same way — **assert over an explicit allow-list, never over a raw total.**

**C-1 — structural constraints.** Expected: `c=28, f=6, p=3, u=4`, total **41**.

```sql
select con.contype, count(*) as n
from pg_constraint con
where con.conrelid in (
        'public.member_identity_versions'::regclass,
        'public.control_operations'::regclass,
        'public.conversation_audit_failures'::regclass)
  and con.contype in ('p','u','c','f')
group by con.contype
order by con.contype;
```

**C-2 — constraint-trigger catalog rows.** Expected: exactly **2**, named
`tg_a0_audit_exclusivity` and `tg_a2_parent_guard`.

```sql
select con.conname, con.conrelid::regclass as on_table
from pg_constraint con
where con.conrelid in (
        'public.member_identity_versions'::regclass,
        'public.control_operations'::regclass,
        'public.conversation_audit_failures'::regclass)
  and con.contype = 't'
order by con.conname;
```

**C-3 — triggers.** Expected: exactly **11**, matching the §2.6 name list. `NOT tgisinternal`
excludes the foreign keys' internal RI triggers, which are not `0108` objects.

```sql
select tg.tgname, tg.tgrelid::regclass as on_table, tg.tgconstraint <> 0 as is_constraint_trigger
from pg_trigger tg
where tg.tgrelid in (
        'public.member_identity_versions'::regclass,
        'public.control_operations'::regclass,
        'public.conversation_audit_failures'::regclass)
  and not tg.tgisinternal
order by tg.tgrelid::regclass::text, tg.tgname;
```

Expected shape: 11 rows; exactly 2 with `is_constraint_trigger = true`, and those two are the
A0 and A2 objects named in §2.6.

**C-4 — index relations.** Expected: exactly **16** — the 9 standalone indexes plus the 7
backing indexes of the `p` and `u` constraints.

```sql
select i.indexrelid::regclass as index_name, i.indrelid::regclass as on_table
from pg_index i
where i.indrelid in (
        'public.member_identity_versions'::regclass,
        'public.control_operations'::regclass,
        'public.conversation_audit_failures'::regclass)
order by i.indrelid::regclass::text, i.indexrelid::regclass::text;
```

#### Version assumption, pinned

* **Every assertion above uses an explicit allow-list** (`contype in ('p','u','c','f')`,
  `contype = 't'`, `NOT tgisinternal`) precisely so that it does **not** depend on which
  additional catalog rows a given PostgreSQL server records. Two such variations are already
  known: constraint triggers add `contype = 't'` on every supported version, and newer
  PostgreSQL versions catalogue `NOT NULL` constraints as `contype = 'n'`. Neither can disturb
  C-1 … C-4, because neither value is in any allow-list.
* **No raw or untyped total may be asserted anywhere** — not `count(*) from pg_constraint`, not
  `count(*) from pg_trigger`. An assertion phrased that way is itself a defect, not a check.
* **The executor records the exact server version** — `version()` and
  `current_setting('server_version_num')` — in capture B-1, and states it beside the C-1 … C-4
  results in evidence. The governed proof environment for `0108` was **PostgreSQL 17.11**; the
  production target is Supabase's PostgreSQL. If the observed production `server_version_num`
  differs from the proof environment's major version, that is **recorded as a fact for PM**, not
  adapted around, and C-1 … C-4 still apply unchanged because they are allow-list based.
* **The two system-named primary keys are asserted by table and `contype`**, never by guessing
  a name, since PostgreSQL — not `0108` — assigns them.

### 2.6.3 Class A1 before-state absence probes (R5-2)

> **Scope (R6-1, R6-2). NOT APPLICABLE to Change Class A2.** A-1 … A-4 assert that the `0108`
> objects are **absent**. In the A2 entry world they are all **present** by design, so running
> A-1 … A-4 for A2 would fail on a **correct** production state — the exact mirror of the defect
> R5-2 fixed for A1. The A2 before-state uses the **presence** probes of **§2.6.5** instead.

§3.2 B-9's Class A before-state expects every §2.6 object to be **absent**. The §2.6.2
C-1 … C-4 assertions cannot express that state: their `::regclass` casts fail to resolve when
the three tables are — correctly — not there, so running them before a first Class A
application would error on a **correct** production state. §5.2 already records the same
technical fact for post-rollback residue checking. This section gives the Class A before-state
(and, by reference, that residue check) the same treatment as exact executable read-only
queries, with no executor interpretation.

**Scope rule.** A-1 … A-4 are the only catalog form the Class A before-state existence check
uses. **C-1 … C-4 are not run while the three tables are absent**; they remain the
authoritative structural assertions wherever the three tables exist — their §7.1 after-state
role is unchanged, and nothing here weakens it. Nothing below asserts a raw or untyped catalog
total (§2.6.2 version rule).

**A-1 — the three tables, catalog-safe.** `to_regclass()` returns NULL instead of erroring
when a relation does not exist:

```sql
select
  to_regclass('public.member_identity_versions')    as miv,
  to_regclass('public.control_operations')          as a0,
  to_regclass('public.conversation_audit_failures') as a2;
```

Expected: one row, **all three columns NULL**.

**A-2 — the type, catalog-safe:**

```sql
select to_regtype('public.kv_control_result') as kv_control_result;
```

Expected: one row, **NULL**.

**A-3 — the 15 policies, by allow-listed name over the policy catalog** (returns rows only
for policies that exist; never errors, whether or not any table exists):

```sql
select p.schemaname, p.tablename, p.policyname
from pg_policies p
where p.policyname in (
  'miv_control_owner_ins','miv_control_owner_sel','miv_control_owner_upd','miv_member_sel',
  'a0_control_owner_ins','a0_control_owner_sel','a2_control_owner_ins','a2_control_owner_sel',
  'conversations_control_owner_rw','members_control_owner_sel',
  'restaurants_control_owner_sel','customers_control_owner_sel','messages_control_owner_sel',
  'a1_control_owner_ins','a1_control_owner_sel')
order by 1, 2, 3;
```

Expected: **zero rows**. The query reports the table each match sits on, so an unexpected
presence reaches PM with its exact location rather than being adjudicated in-window.

**A-4 — the eight A1 columns, catalog-safe:**

```sql
select a.attname
from pg_attribute a
where a.attrelid = to_regclass('public.conversation_assignment_events')
  and a.attnum > 0
  and not a.attisdropped
  and a.attname in ('transition_id','operation_id','actor_kind','is_canonical',
                    'actor_member_version','actor_user_id','actor_label','actor_role')
order by a.attname;
```

Expected: **zero rows**. A-4 is meaningful only beside a successful B-5: if A1 itself were
missing, `to_regclass` would yield NULL and A-4 would return zero rows — falsely clean — but
B-5's `count(public.conversation_assignment_events)` errors first in that state (HS-12), so
an absent A1 cannot read as a pass.

**Covered without their own probes, by construction and by existing preflights:**

* the **41 structural constraints, 2 constraint-trigger catalog rows, 11 triggers and 16
  index relations** of §2.6.1 exist only on the three tables, so A-1's three NULLs establish
  their absence — the §5.2 by-table-absence rule, now in executable form;
* the **role** `kivo_control_owner` — PF-4a and B-6/B-7 (expected zero rows; HS-4 otherwise);
* the **21 functions** — every one matches a PF-4f pattern, so PF-4f's zero-row expectation
  covers them (HS-24 otherwise);
* the **`0108` migration-ledger row** — B-12.

**Fail-closed rule.** Any non-NULL value from A-1 or A-2, or any row from A-3 or A-4,
contradicts the recorded production baseline (**M-0 applied / M-1 not applied**) and is a
**HARD STOP (HS-11)**: record the exact observation verbatim and report to PM. Do not drop,
rename, re-own or otherwise "clean up" anything found, and do not run C-1 … C-4 to
investigate a partially present state — adjudicating an unexpected presence is PM's, not the
executor's. The executor records the server version beside the A-1 … A-4 results, exactly as
§2.6.2 requires beside C-1 … C-4.

### 2.6.4 Change Class A2 exact affected boundary, and the true security model (R6-6)

**Change Class A2 may change exactly one thing: the body of one function.**

*The one permitted change:* the definition of
`public.kv_control_assert_actor(uuid,text,boolean)` (F16), replaced by exact `0109`'s
`CREATE OR REPLACE FUNCTION`. The exact `0109` file contains **one** DDL statement in total and
**zero** DML statements of any kind. Diffed against the exact `0108` definition of the same
function, the replacement is **one hunk**, confined to the member branch's request-subject
resolution and its comment. Signature, language, `SECURITY DEFINER`, `set search_path = ''`, the
`RETURNS TABLE` shape, the `actor_kind` guard, the system branch, the member and manager checks,
the MIV lookup and every fail-closed `raise` are **byte-identical** to `0108`.

*The only transaction-scoped state:* a strictly minimal temporary membership of the executor in
`kivo_control_owner` `WITH INHERIT TRUE, SET FALSE`, taken by `0109` section 2 only if the executor
cannot already act with the owner's privileges, and removed by section 4, which fails closed on
incomplete restoration. **`SET ROLE` is never conferred at any point**, and this is strictly less
capability than `0108` section 1B took. Three transaction-local `kivo.kiv174_*` settings are set
with `set_config(..., true)` and leave no residue at either `COMMIT` or `ROLLBACK`.

**Change Class A2 explicitly does not, and must not be allowed to:** create or drop any role,
table, type, trigger, policy, index or constraint; change any object's owner; change any ACL or
`EXECUTE` grant; enable, disable or force RLS anywhere; grant `kivo_control_owner` — or anyone —
`USAGE` on schema `auth` or `CREATE` on any schema; confer `SET ROLE`; write, update or delete any
row in any table, including MIV, A0, A1 and A2; write, repair or backfill any migration-ledger row;
redefine any other governed function; or touch `0107`, `0108`, `public.members`, orders, safety
state or any other control-plane object. **A2 is additive to nothing and destructive of nothing: it
is a single in-place body replacement.**

**Out of boundary for A2, as for every class:** customer, message, order, menu or member row data;
Meta/WhatsApp configuration; application deployment; restaurant activation; the Khalid project;
alpha/Pilot GO; KIV-88 advisories; M-2/R-3/R-4/M-5+.

**The true request-GUC security model, stated accurately (R6-6, N2, A4).**

Exact `0109` section 3 carries a comment stating that the request GUCs are *"populated by the
request layer and not by the caller's SQL."* **That comment is false at the PostgreSQL layer**, and
was independently proved false by both Quality and the Auditor: connecting through a
PostgREST-faithful path, the `authenticated` role successfully executed **both**
`set_config('request.jwt.claim.sub', …, true)` and `SET LOCAL request.jwt.claims = '{"sub":"…"}'`,
reading each back verbatim. Custom two-part GUCs carry **no intrinsic PostgreSQL permission
boundary**.

The accurate model, which this procedure records as binding:

1. **`request.jwt.claim.sub` and `request.jwt.claims` are caller-settable custom GUCs at the
   PostgreSQL layer.** Any role that can execute SQL in the session can set them.
2. **The effective identity and trust boundary is the request/PostgREST layer**, together with the
   unchanged actor / member / MIV / manager checks inside the governed resolver. A resolved subject
   is **not** authority: it must still match `public.members.user_id` for the tenant, hold an open
   MIV row, and pass the same manager/member checks — all byte-identical to `0108`.
3. **Exact `0109` introduces no new identity source and no new authority path** relative to current
   V4 `auth.uid()` semantics. It reads the same two GUCs, in the same precedence, that
   `auth.uid()` itself reads. Any caller able to set them could equally have steered `auth.uid()`
   before `0109`. The exposure is pre-existing and vendor-inherent, not introduced here. The
   before/after property snapshots taken by Quality and the Auditor are byte-identical apart from
   the target function body: no grant, no entry point, no ownership change, no ACL change, and the
   internal resolver remains unreachable by `authenticated`.
4. The empty `search_path` plus `pg_catalog.`-qualification is **effective against shadowing** —
   both reviewers installed attacker-controlled `public.current_setting` and
   `public.jsonb_extract_path_text` and the hostile value never appeared.

**The source comment is a separately gated later documentation correction.** It is a
release-quality documentation defect, not a security defect. **Do not modify `0109` under this
procedure, and do not fold the comment fix silently into integration** — either would change the
terminally cleared bytes and void the KIV-175/176/177 chain (§2.3, §2.3.1 I4).

### 2.6.5 Change Class A2 presence probes P-1 … P-8 (R6-2)

These define the executable A2 before-state. They are the **exact polar opposite** of §2.6.3's
absence probes and replace them entirely for A2. Every probe is **read-only** and returns
**exactly one row**, so a missing result is a detectable fault rather than a silent pass (§2.5.1
cardinality rule). The executor records the server version beside the results, exactly as §2.6.2
requires beside C-1 … C-4.

**How far catalog-safety extends, stated precisely.** **P-1 … P-5 and P-8 are catalog-safe by
construction**: they read `pg_catalog` through aggregates, `to_regtype` and `has_schema_privilege`,
so they return a row with zero counts or NULLs rather than erroring when an expected object is
absent — and under the cardinality rule those zeros and NULLs are failures, not passes. **P-6 and
P-7 are not, and deliberately so**: they read `public.conversation_assignment_events`,
`public.members` and `public.member_identity_versions` directly, because a count of actual rows is
the only thing that can answer what they ask. In the A2 entry world all three necessarily exist, so
if one of those reads errors, the error **is** the finding — **HS-12**, and **HS-32** — which is the
correct fail-closed outcome. This mirrors §2.6.3's treatment of A-4 beside B-5 exactly: a probe is
allowed to error when erroring is the only honest answer, provided the procedure says so in
advance.

**P-1 — the three governed tables exist, owned and protected as `0108` left them:**

```sql
select
  count(*)                                                   as table_rows,
  count(*) filter (where pg_catalog.pg_get_userbyid(c.relowner) = 'kivo_control_owner') as owned_ok,
  count(*) filter (where c.relrowsecurity)                    as rls_on,
  count(*) filter (where c.relforcerowsecurity)               as force_rls_on
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('member_identity_versions','control_operations','conversation_audit_failures');
```

Expected: one row, all four values **3**.

**P-2 — the governed type exists:**

```sql
select pg_catalog.to_regtype('public.kv_control_result') is not null as type_present;
```

Expected: one row, **true**.

**P-3 — the governed control plane is complete and correctly owned.** Run the **PF-4f query text
byte-identically** and require **exactly 21 rows, all owned by `kivo_control_owner`** — the A2 form
of PF-4f defined in §2.5.1. Record the verbatim signature list.

**P-4 — the exact repair target is present, at the exact `0108` identity, and is still
un-repaired.** This is the single most important A2 probe: it proves the target is exactly what
`0109` expects, and that `0109` has not already been applied.

```sql
select
  count(*)                                                        as fn_rows,
  min(pg_catalog.pg_get_userbyid(p.proowner))                     as fn_owner,
  bool_and(p.prosecdef)                                           as is_security_definer,
  min(coalesce(p.proconfig::text, '<null>'))                      as proconfig,
  bool_and(p.proretset)                                           as returns_setof,
  min(pg_catalog.pg_get_function_result(p.oid))                   as result_shape,
  min(pg_catalog.pg_get_function_arguments(p.oid))                as arg_list,
  min(coalesce(p.proacl::text, '<null>'))                         as acl,
  min(pg_catalog.md5(p.prosrc))                                   as body_md5,
  bool_and(pg_catalog.strpos(p.prosrc, 'auth.uid()') > 0)         as still_unrepaired
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'kv_control_assert_actor'
  and pg_catalog.pg_get_function_arguments(p.oid) = 'p_restaurant_id uuid, p_actor_kind text, p_require_manager boolean';
```

Expected: one row, with `fn_rows = 1`; `fn_owner = kivo_control_owner`;
`is_security_definer = true`; `proconfig = {"search_path=\"\""}`; `returns_setof = true`;
`result_shape = TABLE(member_id uuid, member_version integer, member_role text, actor_user_id uuid)`;
`arg_list = p_restaurant_id uuid, p_actor_kind text, p_require_manager boolean`;
`acl = {kivo_control_owner=X/kivo_control_owner}`; and **`still_unrepaired = true`**.

`still_unrepaired = false` means the target is **not** the un-repaired `0108` definition — `0109`
has already been applied, or the function was changed by something else. Exact `0109` would refuse
that state itself at its precondition P7, but the executor must **not** discover it by attempting
the migration. `fn_rows` other than 1, or any value differing from the above, is **HARD STOP
(HS-32)**. **`body_md5` is recorded as custody evidence for §5.7 and §7.1.1, not as a pass/fail
gate**, since a body hash is environment- and formatting-sensitive.

**P-5 — the defect being repaired is actually present.** `0109` exists because
`kivo_control_owner` cannot reach schema `auth`:

```sql
select
  pg_catalog.has_schema_privilege('kivo_control_owner','auth','USAGE')   as auth_usage,
  pg_catalog.has_schema_privilege('kivo_control_owner','auth','CREATE')  as auth_create,
  pg_catalog.has_schema_privilege('kivo_control_owner','public','CREATE') as public_create;
```

Expected: one row, **all three false**. `auth_usage = true` would mean the runtime defect KIV-173
proved is **not** present and A2's premise does not hold — **HARD STOP (HS-32)**. It is also the
signature of an unauthorized in-place grant repair, which is forbidden. **Do not grant, revoke or
repair any of these.**

**P-6 — the eight A1 evidence columns exist and are still entirely NULL:**

```sql
select
  (select count(*) from pg_catalog.pg_attribute a
    where a.attrelid = pg_catalog.to_regclass('public.conversation_assignment_events')
      and a.attnum > 0 and not a.attisdropped
      and a.attname in ('transition_id','operation_id','actor_kind','is_canonical',
                        'actor_member_version','actor_user_id','actor_label','actor_role')) as a1_columns,
  (select count(*) from public.conversation_assignment_events
    where transition_id is not null or operation_id is not null
       or actor_kind is not null or is_canonical is not null
       or actor_member_version is not null or actor_user_id is not null
       or actor_label is not null or actor_role is not null)                                 as a1_nonnull_rows;
```

Expected: one row, `a1_columns = 8` and `a1_nonnull_rows = 0`. Recorded because the §5.3 A1
reversal guard depends on it and because a non-zero value would mean a later stage began
populating canonical evidence — a material change of state PM must adjudicate.

**P-7 — MIV is in the state `0108` left it:**

```sql
select
  (select count(*) from public.members)                                          as members_n,
  (select count(*) from public.member_identity_versions)                         as miv_rows,
  (select count(*) from public.member_identity_versions where valid_to is null)   as miv_open_rows,
  (select count(*) from public.member_identity_versions where version <> 1)       as miv_non_v1_rows;
```

Expected: one row, `miv_rows = members_n`, `miv_open_rows = members_n`, `miv_non_v1_rows = 0`.
`members_n` is read **contemporaneously** and is never assumed from any historical figure.

**P-8 — migration-ledger state, captured truthfully as evidence only.** Record `max(version)` and
whether a `0108` row and a `0109` row exist. **This probe has no pass/fail expectation** — see
§7.1.1 (R6-9) for why. **No ledger row may be inserted, corrected or backfilled.**

**Fail-closed rule.** Any divergence from, or ambiguity about, the expectations above is **HARD
STOP (HS-32)**: record the exact observation verbatim and report to PM. Do not grant, revoke,
create, drop, re-own, retry `0108`, or "clean up" anything found. Adjudicating an unexpected state
is PM's, not the executor's.

**Builder validation note.** Every query in §2.5.1 and §2.6.5 was executed as written on a
disposable PostgreSQL 17.11 fixture built from the exact `0108` Git bytes. **PF-4a2, PF-4b2, P-1,
P-2, P-4, P-5 and P-7 each returned exactly one row**, and PF-4a2 and P-4 were additionally
confirmed to return **one row with zero counts and NULL flags** — never zero rows and never an
error — when their target object is absent, so an absent object fails closed under the cardinality
rule rather than reading as clean. **P-6 errored when its table was absent**, exactly as this
section says it should. **PF-4b2 was proved to detect dangerous-window residue on three independent
counters at once** (`membership_rows = 2`, `rows_with_inherit = 1`, `rows_without_admin = 1`). This
is Builder evidence for review, not acceptance, and it is a fixture — **it is not evidence about
production state**, which must be read contemporaneously at execution time.

### 2.7 Entry checklist — all must be true, in order

1. The change is Change Class A1, A2 or B, named in a recorded Founder authorization.
   **For A2 that authorization does not exist** — a new, separate, exact Founder forward
   authorization for the exact `0109` remediation is required (§0.4, §2.1). KIV-159 is `0108`-
   specific, consumed and spent, and confers nothing on A2.
2. **KIV-146 is complete and independently accepted** (KIV-159 condition 1). **For A2 this means
   Revision 6 has passed a fresh independent Engineering → Quality → Auditor chain and carries
   external Linear PM terminal acceptance** (§0.4). Revision 6 as written is a **DRAFT candidate**
   and does not satisfy this item.
3. For Class B: KIV-14 has completed and been independently verified (KIV-25 is blocked by it).
4. PM has fresh-read custody and pinned the exact bytes (§2.3).
5. The reversal path for this exact change already exists, per §5.1:
   * **Class A1** — the post-commit reversal script of §5.3 is authored, independently reviewed
     and carries its **own separate Founder authorization**, held unused.
   * **Class A2** — the exact `0109`-specific post-commit reversal of **§5.7** is authored,
     **independently reviewed as part of the Revision 6 chain**, and carries its **own fresh
     separate Founder authorization, held unused before the forward run**. **That authorization
     does not exist, and KIV-167 does not supply it** (§0.4, §5.1). §5.3 is a `0108` teardown that
     would **drop** the very function `0109` repairs, and must never be substituted for §5.7.
     Absent, unreviewed or unauthorized = **HARD STOP (HS-35)**, before the forward change.
   * **Class B** — all five of: the restoration group boundaries **G-1 … G-n are identical to
     the forward-change invariant groups**; the per-group skeletons `SK-G-1 … SK-G-n` are
     authored and independently reviewed; the §3 capture is complete; **every** group is
     materialized into its own literal artifact `RM-G-i` with its own SHA-256, together with
     `RM-MANIFEST`; and **every** `RM-G-i` plus `RM-MANIFEST` carries a recorded **RM-VERIFY
     PASS from the restoration verifier at the same SHA-256 the executor holds** (§5.4.2).
     Groups mismatched, or any group not materialized = **HARD STOP (HS-26)**. Any missing,
     mismatched or BLOCKed PASS = **HARD STOP (HS-28)**. Both stop *before* the forward change.
6. PF-1 through PF-4 pass, PF-4f included for Class A1, **and PF-5 passes for Class B**.
   **For Class A2 instead:** PF-1, PF-2.A2, **PF-3.A2**, PF-4a2, PF-4b2, PF-4c, the A2 form of
   PF-4f, **PF-4g (G1 … G3)** and the §2.6.5 presence probes **P-1 … P-8** all pass. PF-4a, PF-4b
   and PF-4d are **not run for A2** (§2.5.1), and §2.6.3's A-1 … A-4 are **not applicable**.
7. PM has released exactly one named executor for exactly one attempt.
8. **Class B:** alpha WhatsApp ingress state is known and recorded as **IS-1** — an objective
   read-back of the PF-5a-validated control (§3.2 B-14, §4.3), never an inference from alpha
   GO/NO-GO status. **Class A1 and Class A2:** the fixed ingress-applicability record **B-15** is
   captured (§3.2, §4.2) — no ingress control is read, mutated or required to exist, and no KIV-25
   naming decision is awaited (R5-1).
9. **Class A2 only:** **G4** is satisfied — the PF-4g capture is **re-run and re-verified
   immediately before the forward transaction**, in the same session and against the same target,
   and its evidence and fingerprint are custodied (§3.2 B-17). A G4 re-check that diverges from the
   G1 capture is **HARD STOP (HS-33)**.

Any item unsatisfied = do not start.

**Change Class A2 cannot currently satisfy this checklist**, and this document does not pretend
otherwise. At minimum items 1, 2 and 5 are unmet: Revision 6 is an unaccepted DRAFT candidate, no
A2 forward authority exists, and no A2 reversal authority exists. Recording the checklist now is
what makes those gaps visible and countable; it is not a claim that they are closed.

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

One capture set serves both classes, with the class-specific lines marked (R5-1, R5-2):
**B-14 (IS-1) is captured only for Class B**, **B-15 only for Class A**, and **B-9's
executable form differs by class**. Every other line is captured identically for both
classes.

> **Change Class A2 (R6-1, R6-2).** A2 captures **B-1 … B-13 and B-15** as written, plus the two
> new A2-only lines **B-16** and **B-17**. Three lines take their A2 form: **B-9** runs the §2.6.5
> presence probes **P-1 … P-8** — never §2.6.3's A-1 … A-4, which assert the opposite state and are
> not applicable; **B-2** recomputes the **PF-2.A2** `0109` identities as well as `0108`'s; and
> **B-12** is captured for A2 as **truthful evidence with no pass/fail expectation** (§7.1.1,
> R6-9). **B-14 is never captured for A2.**

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
| B-9 | Existence check for every §2.6 object: role, 3 tables, the complete §2.6.1 inventory — **41 structural constraints, 2 constraint-trigger catalog rows, 11 triggers, 16 index relations** — 15 policies, type, 21 functions, 8 A1 columns | **Class A** — expected: all absent. Run the **§2.6.3 catalog-safe absence probes A-1 … A-4** (PF-4a, PF-4f and B-12 cover role, functions and ledger); **C-1 … C-4 are not run in this state** — their `::regclass` casts cannot resolve while the tables are correctly absent (R5-2); any presence = **HS-11**. **Class B** — the three tables exist (§2.7 item 3): run the **§2.6.2 C-1 … C-4 filtered assertions** with their §2.6.2 expected shapes. Both classes: **never a raw `pg_constraint` or `pg_trigger` total.** Record the server version alongside |
| B-10 | Owner, `relrowsecurity`, `relforcerowsecurity` for every governed table | the pre-change values Class B must be able to restore |
| B-11 | Grant set for every governed table and function: grantee, privilege type, column scope | the pre-change values Class B must be able to restore |
| B-12 | Migration ledger: `max(version)` and whether a `0108` row exists | |
| B-13 | Non-disclosing member fingerprint evidence consistent with the KIV-14 baseline method | proves `public.members` was not mutated, without disclosing it |
| B-16 | **Change Class A2 only (R6-2).** The complete §2.6.5 **P-1 … P-8** presence-probe results verbatim, with the server version and one statement timestamp — including the **P-4** target-function identity and its `body_md5`, and the **P-5** proof that `kivo_control_owner` still lacks `auth` USAGE | this is A2's before-state. **P-4's `body_md5` is the exact pre-`0109` fingerprint §5.7 must restore to and §7.1.1 must show changed.** Never captured for A1 or B |
| B-17 | **Change Class A2 only — G4 (R6-5).** The **PF-4g / G1 … G3** capture re-run **immediately before the forward transaction**, in the same session against the same target: `prosrc`, `prosrc_md5`, `functiondef`, `arg_list`, `uid_rows`, the recorded semantic determination against V4, and the statement timestamp | closes the capture-to-mutation window at no risk, because the capture is read-only and cheap. **Divergence from the G1 capture, or any non-V4-equivalent semantics, is HS-33 — never an adaptation point.** Never captured for A1 or B |
| B-14 | **IS-1 — ingress-state evidence point (Class B only; OBS-2, R5-1).** The objectively read-back enabled/disabled state of the governed alpha ingress control named in the KIV-25 authorization and validated at PF-5a, plus `count(public.messages)`, recorded together with the B-4 and B-5 counts and one statement timestamp | the pre-change half of the Class B whole-window ingress proof; its end-of-window counterpart is **IS-2** (§7.3.1). **Never captured for Class A**, which reads no ingress control and records B-15 instead |
| B-15 | **Class A ingress-applicability record (Class A only; R5-1).** Recorded verbatim, with one statement timestamp: `CLASS A — ALPHA INGRESS CONTROL NOT APPLICABLE PER §4.2: NO BLOCK, NO DRAIN, NO INGRESS READ, NO INGRESS MUTATION. NO KIV-25-NAMED CONTROL IS REQUIRED TO EXIST FOR THIS CHANGE.` | satisfies §2.7 item 8 for Class A (§4.2). A fixed statement, not an observation: it claims nothing about technical ingress state, which is **not** inferred from alpha GO/NO-GO status; no deployment, Meta/account or restaurant action may be taken — or required — to observe ingress for it (§0.2). PF-5, IS-1/IS-2 and hold transitions remain Class B-only (§2.5) |

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

> **Scope (R6-1).** The lock analysis below is **Change Class A1**. The conclusion — no block, no
> drain — holds for **Change Class A2** as well, but for different reasons and with a different
> lock profile; see **A2 lock profile** at the end of this section. The **B-15** ingress-
> applicability record applies to A1 and A2 identically.

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

**A2 lock profile (R6-1).** Exact `0109` is a single `CREATE OR REPLACE FUNCTION` plus catalog
reads and a transaction-scoped role grant/revoke. It performs **no** `ALTER TABLE`, so it takes
**no `ACCESS EXCLUSIVE` lock on A1 or on any other table** — the specific contention §4.2 was
written for does not arise. It does take a lock on the one function being replaced, held to commit
like everything else in the single transaction, so a concurrent in-flight call to that function can
briefly contend. The correct control is the same one, and for the same reason — **fail-fast, not
drain**: set `lock_timeout` and `statement_timeout` at session start exactly as above, so that a
contended replace **errors and rolls back completely** rather than waiting. That is a clean abort
(**HS-13**), not a partial change. **Do not** cancel or terminate other backends to obtain the
lock, split the file, or apply any statement outside the single transaction (**HS-3**, §2.4
PF-3.A2). A low-traffic window is still chosen; a window choice is not authority to proceed
without §2.7.

Note that A2 is being applied to a path that is **already failing closed with `42501`** for every
authenticated member entry point (§2.1.1). There is no working live member path to protect, which
is a further reason no block or drain is permitted: blocking would add an outage to a path that is
already down, and a recovery step the change does not need.

**Ingress applicability (R5-1).** For the same reasons there is no block or drain, Class A
**neither reads nor mutates any alpha ingress control**, and no such control is required to
exist for it: PF-5, IS-1/IS-2 and every hold transition are Class B constructs under the
KIV-25 authorization (§2.5, §7.3.1, §7.5). Class A's entry/capture record for §2.7 item 8 is
the fixed **B-15** statement (§3.2), recorded verbatim with its timestamp. Technical ingress
state is **not** inferred from alpha GO/NO-GO status, and no deployment, Meta/account or
restaurant action may be taken — or required — to observe ingress for a Class A entry check
(§0.2).

### 4.3 Change Class B — conditional, reversible, minimal

Class B revokes grants and transfers ownership on **live** objects. It therefore *can* break
the alpha application path mid-change.

* **If alpha WhatsApp ingress is not live**: no block or drain is required or permitted.
  Record the ingress state as evidence — the not-live finding is the objectively read-back
  **IS-1** value of the PF-5a control (B-14), never an inference from Pilot/alpha GO/NO-GO
  status (which was NO-GO at authoring time).
* **If alpha ingress is live**: the only permitted block is a **reversible pause of ingress
  using the exact governed safety ingress/hold control named by the KIV-25 authorization and
  validated at PF-5a** (the alpha-critical safety control of KIV-142 item 8), engaged
  immediately after the §3 capture. **Its engage, release, re-engage and revert points are
  fixed by §7.5 — L-1, L-5, L-8 and L-12 — and §7.5 is authoritative for all of them.** Record
  the exact control identifier used, and for **every** transition record both the timestamp and
  the **objectively read-back observed state** (R3-4; a timestamp alone is not evidence).

**Prohibited as a "drain" or block, in every case:** disabling RLS or dropping policies;
granting `BYPASSRLS`; revoking from `postgres`; deleting or renaming credentials; pausing the
Supabase project; terminating client backends; taking the application offline by deployment or
configuration change (deployment is out of boundary); any change not named in the
authorization. If the only way to protect a path is one of these, the change is not ready —
**HARD STOP (HS-9)**.

**Revert rule.** Every block engaged must be reverted, and the revert must be verified, not
assumed. An unreverted block at end of window is an incomplete change.

**Ordering is fixed by §7.5, not by this section.** Engaging a hold here commits the change to
the live-ingress sequence §7.5.1, in which the hold is engaged at **L-1**, released at **L-5**
under the L-4 gate, re-engaged at **L-8** on failure, and reverted at **L-12** on the §7.5.4
restoration terminal path. Those four are the **only** authorized transitions. Which branch
applies is decided by the recorded IS-1 ingress state (capture line B-14) before any mutation,
never in-window.

**Same-control rule (R3-4).** The control engaged and reverted here must be **the same control**
whose state is read at IS-1 and IS-2 (§7.3.1) and validated at PF-5a. If §4.3's engage mechanism
and the IS-read mechanism are not the same identifiable control, the ingress evidence describes
something other than the thing that was held: **HARD STOP (HS-30) before any mutation.**

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
| **Class A1** | R-A transactional rollback (§5.2) — the database performs it | **Yes.** It is the migration's own designed failure behaviour, not a further action |
| **Class A1** | R-B post-commit reversal (§5.3) | **No.** Requires its own separate Founder authorization, obtained before the forward run and held unused. **Supplied for A1 by KIV-167, and by nothing else** |
| **Class A2** | R-A transactional rollback (§5.2, A2 form) — the database performs it | **Yes.** Same reasoning: it is exact `0109`'s own designed failure behaviour under the mandatory §2.4 PF-3.A2 wrapper, not a further action |
| **Class A2** | **R-B2 post-commit reversal (§5.7)** | **No.** Requires its **own fresh separate Founder authorization**, obtained before the forward run and held unused. **It does not exist.** KIV-167 supplies **nothing** here (see below) |
| **Class B** | Bounded restoration to the captured before-state (§5.4) | **Yes**, strictly within the §5.4 bounds |
| **Class B** | Anything beyond bounded restoration | **No.** New Founder authorization required; until it exists, the §5.4 holding state applies |

**§5.3 is not a `0109` reversal, and KIV-167 confers no `0109` reversal authority (R6-7, Q-B, A6).**
This is stated here because it is the single easiest mistake to make in this whole document, and
because it would be destructive:

* **KIV-167's Founder decision is textually bounded** to *"only the exact already-reviewed KIV-146
  Revision 4 §5.3 Class A post-commit reversal path"*, satisfying *"only KIV-146 Revision 4 §2.7
  item 5 / §5.1"*. PM carried it forward to Revision 5 **solely** because §5.3 was proved
  byte-identical Rev4 → Rev5 (full-section SHA-256
  `4e9fa2e2855d378becffdae2fa261f59f952ab677a9af2a252aae0cc21aa3e2a`), recording explicitly that
  *"KIV-167 is not reissued or widened."* **§5.3 is byte-identical in Revision 6 too**, at that same
  hash, so KIV-167's applicability to **A1** is preserved exactly and is neither altered nor
  extended.
* **§5.3 is the wrong operation for `0109` — it is not merely insufficient, it is destructive.**
  Its own scope line reads *"Applies **only** if `0108` committed"*, and its content is a full
  teardown of the `0108` control plane: drop 7 policies, drop 8 A1 columns, **drop 16 control
  functions including `public.kv_control_assert_actor(uuid,text,boolean)` itself**, drop 3 tables,
  drop 5 trigger functions, drop the type, revoke the grants, drop the role. A `0109` reversal is
  the **opposite** operation: restoring one function's prior body. **§5.3 would destroy the object
  `0109` repairs.**
* **KIV-172 additionally found §5.3 not safely executable** against the observed committed state:
  its step 7 `REVOKE USAGE ON SCHEMA auth FROM kivo_control_owner` emits `WARNING` SQLSTATE `01006`
  under the actual privilege topology, and warnings do not trip `ON_ERROR_STOP=1`, so the
  destructive transaction could commit and only afterwards be recognised as HS-12.

**Therefore: §5.3 must never be entered for a Class A2 reversal, under any reading, and no A2
reversal may proceed on KIV-167's authority.** The governed A2 path is **§5.7**, which needs its
own review and its own Founder authorization. Attempting §5.3 against a post-`0109` state, or
invoking KIV-167 for A2, is **HARD STOP (HS-36)**.

### 5.2 Tier R-A — transactional rollback (primary; the *only* rollback for Class A)

> **Scope (R6-1).** The residue checklist below is **Change Class A1**: it lists the `0108` objects
> that must be absent after a rollback. Change Class A2 creates none of them, so that checklist
> asserts the wrong things for A2. The **A2 residue checklist** is at the end of this section. The
> executor actions 1, 2 and 4 — do not retry, do not repair, capture verbatim, report to PM, any
> residue at all is **HS-14** — apply to **A1 and A2 identically**.

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
   * all 21 functions absent; **all 11 triggers absent** — the 9 ordinary plus
     `tg_a0_audit_exclusivity` and `tg_a2_parent_guard`; all 15 policies absent;
   * **all 41 structural constraints, both constraint-trigger catalog rows and all 16 index
     relations of §2.6.1 absent** (they fall with their tables, so this is a check that the
     tables really are gone, not a separate cleanup). With the tables absent, the §2.6.2
     `::regclass` casts will not resolve, so the residue check is by table absence —
     executable as the §2.6.3 A-1 probe (R5-2) — do not report a cast failure as a HARD
     STOP here;
   * all eight A1 columns absent;
   * no `0108` migration-ledger row;
   * `count(public.members)` = `N` from B-3, with no evidence of mutation;
   * `count(public.conversations)` = B-4; `count(public.conversation_assignment_events)` = B-5;
   * `has_schema_privilege('kivo_control_owner','public','CREATE')` not applicable (role absent).
4. Report to PM. **Any residue at all = HARD STOP (HS-14)** and an incident, because it means
   the transaction wrapper did not hold.

**Change Class A2 residue checklist (R6-1, R6-4).** Exact `0109` creates no role, table, type,
trigger, policy, index or row, so there is nothing of that kind to check for. What a failed A2 run
must prove is that the **function body** and the **membership topology** both returned exactly to
their pre-`0109` values. Run read-only and record every result:

* **The target function is un-repaired again.** Re-run the §2.6.5 **P-4** probe byte-identically.
  Require `fn_rows = 1`, **`still_unrepaired = true`**, and `fn_owner`, `is_security_definer`,
  `proconfig`, `returns_setof`, `result_shape`, `arg_list`, `acl` and **`body_md5` all equal to the
  B-16 pre-state values**. A `body_md5` that matches the repaired body while the run reported
  failure is the **exact autocommit signature of §2.4 PF-3.A2** and is an incident.
* **The membership topology is byte-equal to before.** Re-run **PF-4b2** byte-identically and
  require the identical single-row result recorded at preflight: `membership_rows = 1`,
  `rows_with_set = 0`, **`rows_with_inherit = 0`**, `rows_without_admin = 0`,
  `rows_with_nonsuperuser_grantor = 0`, `rows_not_held_by_executor = 0`. **Any surviving
  `inherit_option = true` membership is the dangerous-window residue: go to §5.8 immediately and
  mutate nothing.**
* **The executor cannot act as the owner.** `pg_has_role(current_user,'kivo_control_owner','USAGE')`
  is **false**, and `SET ROLE kivo_control_owner` is still denied.
* **No privilege appeared.** Re-run **P-5**: `auth_usage`, `auth_create` and `public_create` all
  still **false**.
* **The pre-`0109` defect is still present** — the authenticated member path still fails closed
  with `42501`. Its presence is what proves the rollback was genuine and not a silent repair.
* **Nothing else moved.** The §2.6.5 **P-1, P-2, P-3, P-6, P-7** results equal their B-16 values,
  and `count(public.members)` = B-3, `count(public.conversations)` = B-4,
  `count(public.conversation_assignment_events)` = B-5, with no evidence of mutation (B-13).
* **The ledger is unchanged**, and **no `0109` row was written** — recorded truthfully as evidence,
  never repaired (§7.1.1).

**Rolled back is not repaired.** A successful A2 transactional rollback returns production to the
**known broken state** of §2.1.1, in which every authenticated member entry point still fails with
`42501`. That is the correct outcome of a failed attempt, not a partial success, and KIV-14 remains
blocked. Do not retry, do not repair the grant in place, and do not attempt a second forward run:
the authorization is consumed (**HS-19**).

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
   `public.control_operations`, then `public.member_identity_versions`. **All 41 structural
   constraints, both constraint-trigger catalog rows, all 11 triggers, all 16 index relations of
   §2.6.1 and the eight policies on these tables** go with them and are **never dropped
   separately** — including the two constraint triggers, which must not be dropped with
   `DROP TRIGGER` ahead of their tables. No `CASCADE`: if a drop needs `CASCADE`, something
   outside the boundary depends on it — stop instead.
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

##### 5.4.1.1 The state map — mutually exclusive by construction (R3-3)

Class B runs **one transaction per invariant group** (§5.4.3), so "committed" is not binary
across the change.

**Why Revision 3's map failed.** It classified partly by *outcome* (full commit, partial
commit) and partly by *which HARD STOP fired* (a catch-all "any HARD STOP after at least one
group committed"). Those axes overlap: a §7 verification failure **is** HS-22, and a later-group
SQL error **is** HS-12, so the canonical rows also matched the catch-all, and the default-deny
rule then sent every real case to the holding state.

**The fix is structural.** Classification now uses **one axis only — the observed outcome —
resolved by three ordered discriminant questions that partition the space.**

> **The HARD STOP that fired is recorded as the trigger. It is never a classifier.**
> This single rule is what removes the overlap. Which HS fired determines *nothing* about the
> route; it is evidence, written to E-9, and no more.

**The mandatory read-only determination runs first, always** (§5.4.1.3), and its output is what
the questions are asked of.

**Answer the three questions in this order. The first that resolves fixes the state. Exactly
one row can match, because the three answers partition every possible outcome.**

| Q | Question, asked of the read-only determination | Answer | State |
|---|---|---|---|
| **Q1** | Was the commit outcome of **every** invariant group established? | **No** | **S-4** |
| | | Yes → ask Q2 | |
| **Q2** | Is the resulting state **within boundary and fully determined per object** — no object outside the authorized named set modified, and every named object's actual owner / RLS / FORCE RLS / grant state established? | **No** | **S-3E** |
| | | Yes → ask Q3 | |
| **Q3** | **How many of the n invariant groups committed?** | **0** | **S-0** |
| | | **n (all)** | **S-1** |
| | | **≥1 and <n** | **S-2** |

Q3's three answers are exhaustive and disjoint over the integers `0 … n`, so once Q1 and Q2
answer "yes", exactly one of S-0, S-1, S-2 applies. There is no catch-all row and none is needed.

**The five states and their verdicts:**

| State | Definition (from the questions above — not from any HS) | Bounded restoration authorized? | Holding state? |
|---|---|---|---|
| **S-4** | Commit outcome of one or more groups **could not be established** read-only (typically after session or connectivity loss, HS-15) | **No** | **Yes — §5.4.5.** S-4 is terminal as observed: it is not "try again until it resolves". If a **later** read-only determination, performed under a **new** PM release, does establish every group's outcome, the questions are re-asked from Q1 under that new authority |
| **S-3E** | Outcome known, but **out of boundary or not fully determined**: an object outside the authorized named set was modified (HS-20), or per-object state could not be established | **No.** Restoration is bounded to the named object set, so a breach of that set cannot be repaired inside this authority | **Yes — §5.4.5 immediately** |
| **S-0** | Outcome known, in boundary, **zero groups committed** | **Not applicable — nothing committed, so there is nothing to restore.** No restoration statement may be run | **No.** Ordinary §6 stop-and-report applies. Any ingress hold is reverted via §7.5.4 |
| **S-1** | Outcome known, in boundary, **all n groups committed** | **Yes** — every group's `RM-G-i` artifact, scoped by §5.4.3 | Only if the restoration itself fails |
| **S-2** | Outcome known, in boundary, **≥1 and <n groups committed** | **Yes** — the `RM-G-i` artifacts of the **committed groups only**. Groups that did not commit have nothing to restore and must not be touched | Only if the restoration itself fails |

**Recorded trigger, for evidence only.** Alongside the state, the executor records what ended
the change — a §7 verification failure (HS-22 / HS-25 / the §7.5 L-7 mismatch), an unexpected
SQL error (HS-12), a timeout (HS-13), a baseline mismatch (HS-10 / HS-11), or a completed run
whose verification then failed. **None of these changes the route.** A full commit whose
verification failed and a full commit ended by an unexpected error are both **S-1**; a
later-group SQL error and any other post-commit stop with some groups committed are both
**S-2**.

##### 5.4.1.2 Default-deny — narrowed to genuine gaps

Because Q1–Q3 partition the space, a correctly determined outcome always lands on exactly one
row, and default-deny no longer competes with the canonical verdicts.

**Default-deny now applies only to a genuine gap or genuine indeterminacy:**

* a discriminant question **cannot be answered** — which is not a gap at all but is already
  routed: an unanswerable Q1 **is** S-4, an unanswerable Q2 **is** S-3E; or
* the facts somehow satisfy **none** of S-0 … S-4 — a case the partition says should be
  impossible, and whose occurrence is itself an incident.

In either case the **holding state (§5.4.5)** applies. What default-deny must **never** do is
override a cleanly determined S-1 or S-2 verdict. The executor does not pick a "closest" row,
does not blend rows, and does not read a recorded HS trigger as a competing classification.

##### 5.4.1.3 Rules that hold in every state

* The **read-only determination always comes first**. No mutating statement — not restoration,
  not cleanup, not a retry — may be issued before it is complete and written to E-9. This is
  what makes an unknown outcome safe rather than a guess.
* Entering bounded restoration under **S-1 or S-2** is **still not a second attempt under
  HS-19**, and may run **only** the per-group RM-VERIFY-PASSed artifacts of §5.4.2, each matched
  to its own fingerprint.
* Any ingress hold engaged under §7.5.1 **stays engaged** through determination and restoration,
  and is reverted only by the §7.5.4 terminal path.

##### 5.4.1.4 Class A has no equivalent

Class A applies `0108` as **one whole-file transaction** (PF-3), so it has no partial-commit
state: it either committed entirely or rolled back entirely (§5.2). The S-0 … S-4 map is a
Class B construct and must not be read across to Class A. Class A's post-commit reversal remains §5.3,
under its own separate Founder authorization (§5.1).

#### 5.4.2 Per-group skeletons, materialization, and independent verification (N-2, R3-2)

Revision 2 left the executor as the only reader of the literal SQL that could run against
production. Revision 3 fixed that with RM-VERIFY but froze **one whole-plan artifact** by a
single SHA-256 — which S-2 then contradicted, because a committed-groups-only subset can never
equal the full-plan hash, and running an unverified subset would defeat N-2 entirely.

**Revision 4 removes the conflict by construction: the restoration is materialized, verified and
frozen one artifact per invariant group. There is no full-plan SHA-256, so there is nothing for
a subset to be falsely compared against.**

##### 5.4.2.1 Invariant groups are the unit

The KIV-25 authorization defines the ordered invariant groups **G-1 … G-n** used by the forward
change (§5.4.3, one transaction per group). **The restoration group boundaries must be identical
to the forward-change group boundaries** — same objects, same order, same partition. If they
cannot be made identical, "restore the committed groups only" has no well-defined meaning:
**HARD STOP (HS-26) before the forward mutation.**

##### 5.4.2.2 The six steps

1. **Per-group skeletons — authored and independently reviewed.** Before the forward change the
   executor authors **SK-G-1 … SK-G-n**: for each group, the exact ordered statement forms
   naming that group's authorized objects, with captured values left as named placeholders. The
   independent reviewer reviews the whole set.
2. **Capture.** The §3 before-state capture is taken, including §3.3 per named object.
3. **Materialization — one artifact per group.** The executor binds each placeholder to the
   concrete value read from the §3.3 capture, producing **RM-G-1 … RM-G-n**, each the literal
   statement text that would be run for exactly that group. For **each** artifact the executor
   computes its **own SHA-256, byte count and line count**. It also produces **RM-MANIFEST**,
   listing `n`, the group order, and each group's SHA-256 — itself fingerprinted.
4. **RM-VERIFY — an independent PASS per group.** The **restoration verifier** (§1), who is not
   the executor and did not author the skeletons, receives every `RM-G-i` **and** RM-MANIFEST by
   fingerprint, and checks each artifact, read-only, against all eight:
   1. every statement is an instance of a statement in that group's reviewed skeleton — **no
      statement exists without a skeleton counterpart**;
   2. statement **count and order** match that group's skeleton;
   3. every bound value equals the corresponding value in the **§3.3 capture artifact itself**,
      not in any executor summary of it;
   4. every object named appears in the **KIV-25 authorization's named-object set** *and* belongs
      to **this group** — an object from another group in this artifact is a BLOCK;
   5. every statement restores only owner, `relrowsecurity`, `relforcerowsecurity` or a captured
      grant — **nothing else**;
   6. **no statement grants `BYPASSRLS`**, touches an unnamed object, creates or drops anything,
      or writes row data;
   7. the SHA-256 the verifier computed **equals** the one the executor holds for that group;
   8. RM-MANIFEST lists exactly `n` groups, in the forward-change order, with each SHA-256
      matching the artifact it names — so a swapped, missing or extra artifact cannot pass.

   The verifier records **PASS or BLOCK per group, against that group's exact SHA-256**, plus a
   PASS or BLOCK for RM-MANIFEST. **All n group PASSes and the manifest PASS are required before
   the forward mutation. A single BLOCK anywhere means nothing runs at all.**
5. **Freeze — independently, per group.** Each `RM-G-i` is frozen by its own fingerprint.
6. **Only then may the forward change run.**

##### 5.4.2.3 Execution rules — what makes a subset safe

* **S-1** runs `RM-G-1 … RM-G-n` — every group.
* **S-2** runs **only** the `RM-G-i` of the groups the §5.4.1 determination found committed.
* In both cases, **immediately before running each artifact the executor recomputes that
  artifact's SHA-256 and compares it to that artifact's own recorded PASS.** Each group is
  matched to its own fingerprint — never to a plan-wide one.
* **A group artifact is run whole or not at all.** It is never split, trimmed, merged with
  another, edited, or partially executed.
* **A group whose determination says it did not commit is skipped whole**, and the skip is
  recorded in E-9.

##### 5.4.2.4 Four things this makes impossible

1. **Executing a subset that has no independent PASS** — every group carries its own PASS, so
   any executable unit is verified or it does not run.
2. **Comparing a subset against a full-plan SHA-256** — no full-plan SHA-256 exists.
3. **Re-materializing or editing text in-window** — a changed artifact fails its own frozen
   fingerprint at step 3 of §5.4.2.3.
4. **Silently dropping, swapping or adding an artifact** — RM-MANIFEST pins the set, its order
   and its members' hashes.

##### 5.4.2.5 Fail-closed conditions, all before the forward mutation

* restoration groups do not match the forward-change groups, or materialization cannot be
  completed for **every** group, or the capture is incomplete → **HARD STOP (HS-26)**;
* any `RM-G-i` lacks a PASS, any PASS is recorded against a different SHA-256 than the executor
  holds, RM-MANIFEST lacks a PASS or disagrees with the artifacts, or the verifier BLOCKed
  anything → **HARD STOP (HS-28)**;
* at restoration time a recomputed artifact fingerprint differs from that artifact's verified
  value → **HARD STOP (HS-28)**; the drifted artifact is never run and never re-materialized
  in-window.

So: the plan is pre-reviewed per group, the values are captured before execution, **and every
statement set that could ever hit production — full or partial — carries its own independent
PASS at its own matching fingerprint**, before there is anything to restore. Executor self-read
is explicitly **not** sufficient.

#### 5.4.3 Bounds on the restoration

* **Objects:** only the objects named in the original KIV-25 authorization. An object not named
  there may not be touched even to restore it — that is HS-20.
* **State:** only owner, `relrowsecurity`, `relforcerowsecurity`, and the captured grant set
  (same grantees, same privilege types, same column scopes). Revoke exactly what the forward
  change added; restore exactly what it removed.
* **Text:** only the **RM-VERIFY-PASSed per-group artifacts** of §5.4.2, each identified by its
  own exact SHA-256 and re-fingerprinted against its own PASS immediately before use. **No
  adaptation, no newly invented SQL, no in-window authoring, no re-materialization in-window.**
  A statement that is not in a verified artifact is not run.
* **Scope under S-2:** when §5.4.1 resolves to a partial commit, only the `RM-G-i` artifacts of
  the **committed groups** are run, each whole. Groups that never committed are skipped whole,
  not adapted or trimmed; skipping them is recorded in E-9.
* **Ingress:** in the live branch the hold engaged at L-1 and re-engaged at L-8 **stays engaged
  for the whole of determination and restoration**. It is reverted only by the §7.5.4 terminal
  path, at step **L-12**, after the §5.4.4 verification passes — never by this section acting on
  its own, and never as part of a restoration statement.
* **No privilege** is restored that the capture does not show. **`BYPASSRLS` is never granted**
  as part of a restoration, whatever the capture appears to show — if the capture shows the
  prior owner held it, that is a finding for PM, not a value to restore silently.
* **Transaction:** one transaction per invariant group, `ON_ERROR_STOP=1`.
* **Ingress:** any §4.3 ingress hold stays engaged throughout the restoration and is reverted
  only after §5.4.4 verification passes.

#### 5.4.4 Mandatory obligations, all three

1. **Full transcript** of the restoration, to the §8 E-7/E-9 standard, naming each `RM-G-i`
   executed and each skipped.
2. **Verification — the restoration-success gate.** Re-run the §3.2 capture set with
   byte-identical query text and require equality to the recorded before-state, **per object and
   per privilege**, across every restored group.
   * **PASS** → in the live branch this is **§7.5.4 step L-11**, and it is what authorizes the
     L-12 hold revert. In the not-live branch it is **Q-8**.
   * **FAIL** → the restoration did not complete: **holding state (§5.4.5), HS-27**. Any ingress
     hold **stays engaged**. Do not retry, do not re-materialize, do not revert the hold.
3. **PM notification** the moment restoration is entered — not at the end of the window. The
   notification states which objects, which §5.4.1 state was matched, which verification failed,
   and the `RM-G-i` / `RM-MANIFEST` fingerprints involved.

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

**Clarification for Change Class A2 (R6-1).** The list above is unchanged and remains binding.
The phrase *"creating a `0109` fix"* means exactly what it has always meant: **an executor must
never author SQL in-window to escape a HARD STOP or to repair a failure.** That prohibition is
absolute and applies to A2 with full force — there is no in-window invented SQL, ever.

The exact `0109` this document governs is a **different thing entirely**, and confusing the two in
either direction would be an error. It is not an escape from a HARD STOP: it is a separately
authored, separately reviewed source artifact that passed KIV-174 Builder → KIV-175 Engineering →
KIV-176 Quality → KIV-177 Auditor and PM terminal source acceptance **before** this procedure was
written, and it is applied — if it is ever applied — only under a **new, separate, exact Founder
forward authorization that does not yet exist** (§0.4). Equally, **the fact that a governed `0109`
exists confers no licence to author a `0110`, or any other SQL, in a maintenance window.** Adding
one more governed migration through the full chain is a programme decision made outside a window;
inventing SQL inside a window is the thing this section forbids.

**Also explicitly not a rollback mechanism for A2:** repairing the missing `auth`-schema grant in
place; retrying `0108`; inserting, correcting or backfilling a migration-ledger row; a second
forward attempt of any kind; and §5.3, which is a `0108` teardown that would **drop** the function
`0109` repairs (§5.1). The **only** governed A2 reversal is **§5.7**.


### 5.7 Tier R-B2 — post-commit reversal (Change Class A2 / exact `0109`), governed and manual (R6-7)

> **Authority (R6-13). This path is NOT authorized.** §5.7 requires its **own fresh separate
> Founder authorization for this exact Revision-6 reversal**, obtained **after** Revision 6 is
> terminally accepted, **before** any forward run, and **held unused** (§2.7 item 5, §5.1).
> **That authorization does not exist and is not claimed to exist.** **KIV-167 confers nothing
> here** — it is textually bounded to the exact §5.3 `0108` teardown (§5.1). The text below is
> authored so that it *can* be independently reviewed as part of the Revision 6 chain; **review is
> not authority, and acceptance of Revision 6 is not authority either.**

**Applies only if — all of these, and nothing less.** R-B2 is entered **only** when every one of
the following is true. Any doubt about any of them means it is not entered:

1. **Exact `0109` committed.** The forward transaction reported success and committed. If it
   failed before commit, the governed path is §5.2 (A2 form), **not** this section. If the outcome
   is unknown — connectivity or session loss — the governed path is **HS-15**: determine
   committed-or-not by read-only read-back **first**, and enter nothing until that is settled.
2. **A recorded post-commit decision to reverse exists**, taken by PM/Founder outside the window,
   under one of the conditions enumerated below — never by the executor, and never in-window.
3. **The fresh separate Founder authorization for this exact §5.7 text exists and is unused.**
4. **The §7.1.1 after-state read-backs have been run and their results are on record**, so the
   decision to reverse is made against observed state rather than assumption.

**The enumerated post-commit decision conditions.** R-B2 may be authorized **only** to address one
of these, and the deciding authority must name which:

* **D-1** — a §7.1.1 after-state assertion **failed** after commit, so the committed state is not
  the state `0109` was cleared to produce.
* **D-2** — the repaired member path is observed **not** to behave as the accepted `0109` semantics
  require, including any divergence attributable to a live `auth.uid()` semantic difference that
  PF-4g/G1 … G4 did not catch.
* **D-3** — an **HS-12** condition (any unexpected error, warning or `SQLSTATE`) was recognised
  after the transaction had already committed — the precise shape of the KIV-165 finding on `0108`.
* **D-4** — independent post-remediation verification (§7.4) **returned BLOCK** and the deciding
  authority determines the committed state must not stand.

**D-1 … D-4 are the complete list.** "We would prefer the old body", schedule pressure, a desire to
retry differently, or any reason not on this list is **not** a reversal condition. And R-B2 is
never automatic: a §7.1.1 failure obliges the executor to **stop and report**, not to reverse.

**What R-B2 does, and the one thing it must not be confused with.** R-B2 restores **the exact
accepted `0108` definition of one function** —
`public.kv_control_assert_actor(uuid,text,boolean)` — and **nothing else**. It drops nothing. It
does **not** touch the control plane, the three governed tables, the type, the 20 other functions,
the policies, the A1 columns, the MIV rows, the role, or any grant. **It is the exact inverse of
§2.6.4's forward boundary, and it is emphatically not §5.3.**

**Pre-reversal verification — mandatory, read-only, all of it, before any mutation.** Record every
result verbatim:

* **V-1 — the target is the committed `0109` body.** Re-run the §2.6.5 **P-4** probe
  byte-identically. Require `fn_rows = 1` and **`still_unrepaired = false`** (the `auth.uid()`
  dependency is gone, i.e. `0109` really is in place), and require `fn_owner`,
  `is_security_definer`, `proconfig`, `returns_setof`, `result_shape`, `arg_list` and `acl` to equal
  their **B-16 pre-state values**. Record `body_md5` and compare it to the value recorded at
  §7.1.1. **`still_unrepaired = true` means `0109` is not in place and there is nothing to reverse:
  HARD STOP (HS-37).** A `body_md5` matching neither the recorded pre-`0109` nor the recorded
  post-`0109` value means the function is a third thing nobody governs: **HARD STOP (HS-37)**.
* **V-2 — the surrounding topology is intact.** Re-run **PF-4a2**, **PF-4b2**, **P-1**, **P-2**,
  **P-3**, **P-5**, **P-6** and **P-7** byte-identically and require their recorded values. In
  particular `membership_rows = 1` with `rows_with_set = 0` and `rows_with_inherit = 0`, and
  `auth_usage = false`. **Any drift is HARD STOP (HS-37)**: reversing into a state that has already
  moved would compound the problem, not undo it.
* **V-3 — the restoration target text is on record.** The exact `0108` definition below is present
  in the reviewed reversal artifact and its fingerprint matches the value recorded in evidence.
  **The executor never types this function from memory, from `0108` at execution time, or from
  anywhere but the reviewed artifact.**
* **V-4 — the runner is proved.** Whole-file single-transaction wrapping is proved for the reversal
  runner exactly as **PF-3.A2** requires for the forward run. **HS-3** applies identically. R-B2
  takes the same temporary capability as `0109` and therefore carries the same dangerous window.

**The exact restoration target — the accepted `0108` definition, verbatim.** These are exact
`0108` (blob `7b500626331dd4eaf4620d29c95953740f6e5541`) lines 715 – 766: **52 lines, 1,755 bytes,
SHA-256 `36e79e6e872acf2586da0ba24768b1d8df8a64e30d37c242cd2f4c74587d8da0`**. The reviewer must recompute
that fingerprint against exact `0108` independently rather than trust this file.

```sql
create or replace function public.kv_control_assert_actor(
  p_restaurant_id uuid,
  p_actor_kind text,
  p_require_manager boolean)
returns table (member_id uuid, member_version integer, member_role text, actor_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid;
  v_id   uuid;
  v_role text;
  v_ver  integer;
begin
  if p_actor_kind not in ('member','system') then
    raise exception 'KIV14 actor_kind must be member or system';
  end if;

  -- 'system': one row, all four values NULL, satisfying A0-13, A1-6 and A2-8 uniformly.
  if p_actor_kind = 'system' then
    member_id := null; member_version := null; member_role := null; actor_user_id := null;
    return next;
    return;
  end if;

  -- 'member': SA4 — auth.uid() must resolve, else fail closed.
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'KIV12 member actor requires an authenticated subject';
  end if;
  select m.id, m.role into v_id, v_role
    from public.members m
   where m.user_id = v_uid and m.restaurant_id = p_restaurant_id;
  if v_id is null then
    raise exception 'KIV12 actor is not a member of the resolved tenant';
  end if;
  if p_require_manager and v_role <> 'manager' then
    raise exception 'KIV12 operation requires the manager role';
  end if;

  -- member_version is the version of that member's OPEN MIV row (unique by ux_miv_open_version).
  select v.version into v_ver
    from public.member_identity_versions v
   where v.member_id = v_id and v.valid_to is null;
  if v_ver is null then
    raise exception 'KIV12 actor has no open member identity version';
  end if;

  member_id := v_id; member_version := v_ver; member_role := v_role; actor_user_id := v_uid;
  return next;
end $$;
```

**Exact reversal, one whole transaction, `ON_ERROR_STOP=1`, in this order.** The capability model is
**identical to `0109`'s and no wider**: temporary `INHERIT TRUE, SET FALSE` membership only, taken
only if needed, returned before the transaction can succeed, with `SET ROLE` never available at any
point.

1. **Preconditions, fail-closed.** Assert, and raise on any failure: `kivo_control_owner` exists
   with the governed safe attribute set; the target exists at the exact signature
   `public.kv_control_assert_actor(uuid,text,boolean)`; it is owned by `kivo_control_owner`; it is
   `SECURITY DEFINER` with `proconfig = {"search_path=\"\""}`; its result shape and argument list
   are the exact `0108` ones; **its body does *not* contain `auth.uid()`** — i.e. it is the
   committed `0109` body and not something else. Capture owner, `proacl`, `proconfig`, result
   shape, argument list and the full membership topology into transaction-local settings, exactly
   as `0109` section 1 does, so step 4 can prove byte-equal restoration rather than assert it.
2. **Minimal temporary capability.** If and only if
   `pg_has_role(current_user,'kivo_control_owner','USAGE')` is false, execute
   `grant kivo_control_owner to <executor> with inherit true, set false`, then **fail closed** if
   the grant did not confer inherited privileges, or if it conferred `SET` despite `SET FALSE`.
   A superuser or already-inheriting executor takes nothing, and step 4 then removes nothing.
3. **Replace the function with the exact `0108` definition above**, byte-for-byte from the reviewed
   artifact. `CREATE OR REPLACE` preserves ownership and the `EXECUTE` matrix; step 5 proves both
   rather than trusting them.
4. **Capability return, verified.** Revoke exactly what step 2 granted. Then fail closed unless:
   the executor no longer inherits `kivo_control_owner`; **no** surviving membership on
   `kivo_control_owner` carries `set_option` **or** `inherit_option`; the membership topology is
   **byte-equal** to the step 1 capture; and `kivo_control_owner` holds no `CREATE` on schema
   `public`.
5. **Post-assertions, fail-closed.** The body **now contains** the `0108` request-subject
   dependency `auth.uid()`; owner, `SECURITY DEFINER`, `proconfig`, result shape, argument list and
   `proacl` are **unchanged from the step 1 capture**; and **every** governed `public` function
   matching `kv_control_%`, `kv_sys_control_%` or `kv_tg_%` is still owned by `kivo_control_owner`
   — proving no other governed function was disturbed.

**Explicitly forbidden inside R-B2, without exception:** granting `kivo_control_owner` — or anyone
— `USAGE` on schema `auth` or any other privilege ("the reversal would work better if…" is the
exact failure mode this forbids); `CASCADE` in any form; dropping, renaming or re-owning **any**
object; touching the three governed tables, the type, the policies, the A1 columns, the MIV rows or
the role; a second forward attempt of `0109`; retrying `0108`; any migration-ledger insert,
correction or deletion; and **any SQL invented in-window**. If the reviewed reversal text does not
cover the observed state, the answer is **stop and report**, never improvise (**HS-21**).

**Reversal read-backs and evidence — mandatory after commit.** Re-run byte-identically and record:
**P-4** (require `fn_rows = 1`, **`still_unrepaired = true`**, and `body_md5` **equal to the B-16
pre-`0109` value** — this is the single strongest proof the restoration was exact); **PF-4a2**;
**PF-4b2** (require the identical single-row topology, `rows_with_inherit = 0`); **P-1, P-2, P-3,
P-5, P-6, P-7** unchanged; `pg_has_role(current_user,'kivo_control_owner','USAGE')` **false** and
`SET ROLE` still denied; `count(public.members)` = B-3, `count(public.conversations)` = B-4,
`count(public.conversation_assignment_events)` = B-5 with no evidence of mutation (B-13); and the
ledger state recorded truthfully with **no** row written or removed. Any assertion failing is
**HARD STOP (HS-38)** and an incident.

**What successful reversal actually achieves — say this out loud, because it is the point.**
A successful R-B2 returns production to the **known pre-`0109` degraded state**: the authenticated
member-control runtime is **broken again**, failing closed with **SQLSTATE `42501`,
`permission denied for schema auth`**, at every authenticated member entry point, exactly as
KIV-173 proved. **Reversal restores prior state; it does not restore healthy service, and it is not
a fix.** Service-role system paths are unaffected either way.

**Terminal holding state after reversal.** On a successful R-B2 the run terminates. Record the
verbatim marking:

```
CLASS A2 NOT COMPLETE — REVERSED TO PRE-0109 DEGRADED STATE
```

and then: **KIV-14 remains blocked and not accepted; KIV-25 remains blocked; the project remains on
HOLD; Alpha/Pilot remains NO-GO.** The A2 forward authorization is **consumed** and no second
attempt exists (**HS-19**). No further mutation of any kind is authorized. The next step is a fresh
PM/Founder adjudication of what the D-1 … D-4 condition actually revealed — which may require a new
source chain, a new procedure revision, or both. **The executor's own reversal evidence is evidence,
never acceptance** (§1, §7.4).

### 5.8 Dangerous-window residue — incident guidance (R6-8, A-OBS-2)

This section governs one situation only: **an unauthorized or misconfigured non-transactional run
has left residue** — most characteristically a standing membership on `kivo_control_owner` carrying
`inherit_option = true`, and possibly a function already replaced while the run reported failure.
**This is an incident, not a step.** Reaching this section means §2.4 PF-3.A2 was violated.

Why it matters, precisely: `INHERIT` alone — even with `SET` false — **is the capability that
permits redefining every governed control function owned by `kivo_control_owner`**. That is the
entire mechanism of both `0109` and §5.7. The Auditor demonstrated this directly: with such residue
in place, they successfully executed `CREATE OR REPLACE FUNCTION` against a governed function the
executor **does not own**, after a run had reported failure.

**The rules, in order:**

1. **HARD STOP all further mutation immediately (HS-39).** No cleanup, no retry, no reversal, no
   forward attempt, no "just put it back". The authorization is consumed.
2. **Inspect read-only, and record verbatim.** Capture the complete membership state including
   **grantor** for every row — re-run **PF-4b2** and the byte-identical PF-4b detail listing — plus
   the **P-4** function-body state, **P-5**, and the full §2.6.5 probe set. The grantor identity is
   load-bearing for step 5 and is the field most often omitted.
3. **No automatic cleanup.** Nothing is revoked, granted, dropped or replaced on the executor's
   own judgement. Residue is reported and adjudicated, not tidied.
4. **Do not assume a plain superuser `REVOKE` will work.** It generally will not. With this residue
   in place, `REVOKE kivo_control_owner FROM <executor>` issued **as superuser** fails with
   `ERROR: dependent privileges exist / HINT: Use CASCADE to revoke them too.` An executor who
   assumes the superuser route is available will hit that error under incident pressure and be
   tempted toward `CASCADE`. **Record this expectation in advance so that failure is anticipated,
   not surprising.**
5. **The correct prepared cleanup is a grantor-issued bounded revoke** — the revoke issued by the
   **original grantor** recorded at step 2 — performed **only after** exact state verification and
   **only after** explicit PM/Founder release for this specific incident. It is bounded: it removes
   exactly the residue membership and nothing else.
6. **`CASCADE` is forbidden.** It may not be used unless separately reviewed and explicitly
   authorized for the incident, because `CASCADE` would **also remove the governed standing
   membership record** — the inert `admin=true / set=false / inherit=false` row — thereby changing
   the exact topology that `0108` section 16, `0109` section 4, **PF-4b2**, §7.1 and §5.7 all
   assert. Using `CASCADE` to clean up residue would silently break the state every other check in
   this document depends on.
7. **Re-read completely before any further decision.** After any authorized cleanup, re-read the
   **complete** role membership topology (**PF-4b2** plus the detail listing) **and** the
   function-body state (**P-4**), and record both, before any further decision is taken by anyone.
   Cleanup does not restore the authorization and does not license a retry.

**If a function was left replaced by the failed run**, that is a committed change nobody authorized,
and it is adjudicated by PM/Founder as its own incident. **Do not** treat it as a successful
application, and **do not** treat §5.7 as the automatic answer: §5.7 has its own entry conditions
(a *committed* `0109` under a granted authorization) which a residue incident does not satisfy.

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
| HS-3 | Single-transaction wrapping cannot be proved for the runner — **for Class A1 (`0108`, §2.4 PF-3), for Class A2 (exact `0109`, §2.4 PF-3.A2) and for the §5.7 reversal runner (V-4) alike**. A HARD STOP **before any mutation**; there is no statement-by-statement or autocommit escape hatch (R6-4) |
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
| HS-26 | The Class B restoration groups do not match the forward-change invariant groups, or **any** group is not materialized into its own `RM-G-i` artifact against the §3.3 capture, or the capture is incomplete — **before** the forward mutation (§5.4.2.1, §5.4.2.2 steps 1–3). Stop before the forward change, not after |
| HS-27 | §5.4.1 routes to the holding state — S-3E, S-4, the §5.4.1.2 default-deny rule, a bounded restoration that failed part-way, an L-11/Q-9 verification FAIL, or an L-12/L-13 revert or read-back failure → enter §5.4.5; further action needs new Founder authorization |
| HS-28 | Any `RM-G-i` or `RM-MANIFEST` has **no RM-VERIFY PASS**, or a PASS is recorded against a different SHA-256 than the executor holds, or `RM-MANIFEST` disagrees with the artifacts it names, or the verifier BLOCKed anything, or an artifact's fingerprint recomputed immediately before use differs from that artifact's verified value (§5.4.2). Executor self-read is never sufficient; never re-materialize, split, trim, merge or edit an artifact in-window |
| HS-29 | The §7.5 sequence is violated: the ingress hold is released without all four L-4 gate conditions; the hold is engaged, released, re-engaged, reverted or otherwise altered at any point other than **L-1, L-5, L-8 or L-12**; L-12 is performed without an L-11 PASS; a hold-transition state read-back does not equal the intended post-transition value (except at L-12/L-13, which route to §5.4.5); a step is reordered, skipped, merged or repeated; **IS-2 is not recorded**; a block is engaged anywhere in the Q branch; or the smoke set or its PF-5b bound is changed in-window |
| HS-30 | **Before any Class B mutation**, the KIV-25 authorization fails PF-5: it does not name the exact governed ingress/hold control, or that control's state is not readable read-only, or reading it falls outside this procedure's read-only boundary, or more than one control could match, or it is not the same control §4.3/§7.5 engages and reverts; **or** it names no finite wall-clock smoke bound, or the bound is open-ended, zero, negative, invalid, or left to the executor's discretion. The executor never supplies, infers or defaults either value |
| HS-31 | **Class A2.** PF-4a2 or PF-4b2 fails: `kivo_control_owner` is absent, carries any unsafe attribute, or its standing membership topology is anything other than **exactly one** inert record held by the executor with a superuser grantor and `admin=true / set=false / inherit=false`. Includes zero rows returned, more than one membership, any `set_option`, any `inherit_option`, any missing `admin_option`, a non-superuser grantor, and a member that is not the executing role. **Do not create, alter, grant, revoke or repair anything** (§2.5.1, R6-3) |
| HS-32 | **Class A2.** The observed entry state diverges from, or is ambiguous against, §2.1.1: any §2.6.5 presence probe **P-1 … P-7** fails its expectation; the A2 form of PF-4f returns other than exactly 21 correctly-owned rows; **P-4** shows the target is not the un-repaired `0108` definition at the exact `0108` identity (`still_unrepaired = false`, or any owner / `SECURITY DEFINER` / `search_path` / result-shape / argument-list / ACL difference); **P-5** shows `kivo_control_owner` unexpectedly holds `auth` USAGE — which would also be the signature of an unauthorized in-place grant repair; or the live executor identity does not match the Release-4 evidence. **Record verbatim and report; do not adapt, repair, re-grant, retry `0108` or clean anything up** (§2.1.1, §2.6.5, R6-2) |
| HS-33 | **Class A2.** The **G2** semantic guard fails, at PF-4g or at the **G4** re-check (§3.2 B-17): the live `auth.uid()` body is not semantically the accepted V4 two-GUC COALESCE behaviour, or the G4 capture diverges from the G1 capture. **G2 is never an adaptation point**: this requires a new adjudication, and **`0109` is never rewritten or adjusted to match a divergent live definition** (§2.5.1, R6-5) |
| HS-34 | **Class A2.** The **G3** binding requirement fails: `auth.uid` does not resolve to **exactly one** `pg_proc` row with an empty argument list, so the governed resolver's zero-argument call site cannot be proved to bind the function that was captured (§2.5.1, R6-5) |
| HS-35 | **Class A2.** The §5.7 post-commit reversal is absent, unreviewed, or lacks its **own fresh separate Founder authorization held unused** before the forward run. Stops **before** the forward change (§2.7 item 5, §5.1, R6-7) |
| HS-36 | **Class A2.** §5.3 is entered, proposed or prepared for a `0109` reversal, or KIV-167's authority is invoked for anything other than the exact §5.3 `0108` path. §5.3 is a `0108` teardown that would **drop** `public.kv_control_assert_actor(uuid,text,boolean)` — the function `0109` repairs — and KIV-167 confers **zero** `0109` authority (§5.1, §0.4, R6-7) |
| HS-37 | **Class A2.** A §5.7 pre-reversal verification fails: **V-1** shows `0109` is not in place (`still_unrepaired = true`, so there is nothing to reverse) or the body matches neither the recorded pre-`0109` nor the recorded post-`0109` fingerprint; **V-2** shows any surrounding-topology drift; **V-3** shows the restoration text is missing or its fingerprint does not match the reviewed artifact; or **V-4** cannot prove the reversal runner's whole-file transaction. **Reversing into a state that has already moved compounds the problem rather than undoing it** (§5.7) |
| HS-38 | **Class A2.** A §5.7 post-reversal read-back fails — most importantly **P-4** not showing `still_unrepaired = true` with `body_md5` **equal to the B-16 pre-`0109` value**, or **PF-4b2** not showing the identical single-row topology with `rows_with_inherit = 0`. An incident (§5.7) |
| HS-39 | **Dangerous-window residue.** A non-transactional or misconfigured run has left residue — characteristically a standing membership on `kivo_control_owner` with `inherit_option = true`, and possibly a function already replaced while the run reported failure. **HARD STOP all further mutation and enter §5.8.** No automatic cleanup; no assumption that a plain superuser `REVOKE` will succeed (it fails with `dependent privileges exist`); **`CASCADE` forbidden** unless separately reviewed and authorized, because it would also remove the governed standing membership every other assertion depends on (§5.8, R6-8, A-OBS-2) |
| HS-40 | **Class A2.** Any attempt to modify the terminally source-cleared exact `0109` bytes, to fold the known section-3 security-comment correction into integration, or to rebase, cherry-pick or re-materialize the reviewed commit `cc74e14c16a8b5e02d9ea9668976b83de7aeb872`. Any changed `0109` byte voids the KIV-175/176/177 chain and requires a **new** source chain (§2.3, §2.3.1 I4, §2.6.4, R6-6, R6-11) |

**Which Class A1 HARD STOPs do not apply to Change Class A2 (R6-1).** Four of the conditions above
are written with A1's polarity and would fire on a **correct** A2 state. They must not be applied to
A2, and their A2 counterparts are named here so nothing is left to inference:

| A1 condition | Why it cannot apply to A2 | A2 counterpart |
|---|---|---|
| **HS-4** — PF-4a or PF-4b returns any row | In the A2 entry world `kivo_control_owner` and its inert membership record **exist by design**, and exact `0109`'s own precondition P1 requires the role to exist. HS-4 would hard-stop the very run A2 requires | **HS-31**, via PF-4a2 / PF-4b2 (§2.5.1) |
| **HS-6** — `0107`'s `conversations_restaurant_id_id_key` is absent | PF-4d is **not applicable** to A2: `0109` has no `0107` dependency and makes no header check on it (§2.5.1) | none needed; A2's dependency on the committed `0108` state is asserted by **P-1 … P-8** and by `0109`'s own P1 … P7 |
| **HS-11** — an observed count contradicts the recorded baseline *M-0 applied / M-1 not applied* | That baseline is A1's. A2's baseline is the **committed post-`0108`** state of §2.1.1, in which the M-1 objects are present and populated | **HS-32**, against §2.1.1 and §2.6.5 |
| **HS-24** — PF-4f returns any row | For A2, PF-4f is re-polarised: **exactly 21** correctly-owned rows are required, and **zero** rows would mean the control plane is not in the state `0109` repairs (§2.5.1) | **HS-32**, via the A2 form of PF-4f |

**Every other HARD STOP above applies to A2 unchanged**, including HS-1, HS-2, HS-3 (§2.4 PF-3.A2),
HS-5, HS-8, HS-10, HS-12, HS-13, HS-14, HS-15, HS-19, HS-20, HS-21, HS-22 and HS-23. HS-7, HS-9,
HS-16, HS-17, HS-18 and HS-25 … HS-30 are Class-B or A1-reversal conditions and are unchanged.
§9.4 records the complete disposition.

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

**HS-12 and Change Class A2 (R6-1).** HS-12 — *any SQL error, warning or `SQLSTATE` not explicitly
expected, including `42501`* — applies to A2 **unchanged and in full**. Two consequences are worth
stating, because A2's history makes both live:

* **A successful exact-`0109` run is diagnostic-silent.** Engineering, Quality and the Auditor each
  independently observed stdout `DO DO DO CREATE FUNCTION DO DO` with **zero bytes on stderr** —
  no `ERROR`, `WARNING`, `NOTICE` or `INFO`. So HS-12 is **not** tripped by a correct run, and this
  is materially better than `0108`, whose own line-175 `WARNING: no privileges were granted for
  "auth"` would itself have been an HS-12 condition — which is exactly what KIV-165 found. **Any**
  diagnostic output from an A2 run is therefore unexpected by definition.
* **An HS-12 recognised only *after* the transaction has committed** is precisely the KIV-165 shape.
  It does not license repair or retry. It is reported to PM and, if the deciding authority so
  determines, becomes reversal condition **D-3** under §5.7 — under a fresh separate Founder
  authorization, and never by the executor's own decision.

---

## 7. AFTER-STATE VERIFICATION AND APPLICATION RECOVERY

### 7.1 Change Class A1 after-state read-backs

> **Scope (R6-1).** This section is **Change Class A1** — the after-state of a `0108` first
> application. **It is not applicable to Change Class A2**, which creates none of these objects and
> whose ledger expectation is different and explicitly resolved. The A2 after-state contract is
> **§7.1.1**. The **HS-22** consequence, the *"assert with C-1 … C-4 only, never a raw total"* rule,
> and the record-the-server-version rule apply to both.

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

**Objects:** the **complete §2.6.1 inventory** — **41 structural constraints** (C-1: `c=28,
f=6, p=3, u=4`), **2 constraint-trigger catalog rows** (C-2), **11 triggers** of which exactly 2
are constraint triggers (C-3), and **16 index relations** (C-4) — plus 15 policies, the type,
and all 21 functions present. **Assert with the §2.6.2 C-1 … C-4 filtered queries only; a raw
`pg_constraint` total returns 43 and a raw `pg_trigger` total exceeds 11, and either would be a
false HARD STOP.** Record the server version beside the results. Every function owned by
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

### 7.1.1 Change Class A2 after-state read-backs, and the truthful ledger contract (R6-9, R6-10)

Run with byte-identical query text to the §2.6.5 / §2.5.1 preflight forms. Every assertion must
hold; any failure is **HS-22**, and the executor **stops and reports** — a §7.1.1 failure does not
license reversal, repair or retry (§5.7 is entered only on a recorded PM/Founder decision under
D-1 … D-4).

**The repair happened, and it is the accepted semantics.** Re-run **P-4**. Require `fn_rows = 1`
and **`still_unrepaired = false`** — the executable `auth.` dependency is gone. Record the new
`body_md5` beside the B-16 pre-`0109` value; **the two must differ, and the difference must be the
only body change anywhere.** The repaired body must correspond to the accepted `0109` semantics:
the member branch resolves the request subject from `request.jwt.claim.sub`, falling back to
`request.jwt.claims` JSON `sub`, with the same precedence, the same empty-string and NULL handling
and the same invalid-value behaviour as the V4 definition captured at PF-4g/G1 and re-verified at
G4 — and it is `pg_catalog`-qualified throughout.

**Everything about that function except its body is unchanged.** From the same **P-4** row:
`fn_owner = kivo_control_owner`; `is_security_definer = true`; `proconfig` still
`{"search_path=\"\""}` (empty `search_path`); `returns_setof = true`;
`result_shape = TABLE(member_id uuid, member_version integer, member_role text, actor_user_id uuid)`;
`arg_list` the exact `0108` list; and **`acl` byte-identical to the B-16 value** — `CREATE OR
REPLACE` must not have disturbed the SA1 grant separation, and `0109` adds and removes no `EXECUTE`
privilege.

**The temporary capability was completely returned.** Re-run **PF-4b2** byte-identically and
require the identical single-row topology recorded at preflight: `membership_rows = 1`,
`rows_with_set = 0`, **`rows_with_inherit = 0`**, `rows_without_admin = 0`,
`rows_with_nonsuperuser_grantor = 0`, `rows_not_held_by_executor = 0`. Record the byte-identical
PF-4b detail listing beside it. **Any surviving `inherit_option` membership is the §2.4 PF-3.A2
dangerous-window residue: go to §5.8 and mutate nothing.**

**The executor still cannot act as the owner.**
`pg_has_role(current_user,'kivo_control_owner','USAGE')` is **false**, and `SET ROLE
kivo_control_owner` is still **denied** (`42501`). Confirm before, during-window intent and after —
`SET ROLE` must never have become available at any point.

**No unintended privilege appeared.** Re-run **P-5**: `auth_usage`, `auth_create` and
`public_create` **all still false**. `0109` deliberately does **not** take the elevated
`auth`-schema route, and a `true` here would mean someone repaired the grant in place — forbidden,
and **HS-22**.

**Both supported request-subject transports work through the intended authenticated member path.**
Verify, through the intended authenticated path and not by calling the internal resolver directly:
a subject carried in **`request.jwt.claim.sub`** resolves; a subject carried in
**`request.jwt.claims`** JSON `sub` resolves; and when **both** are present, `claim.sub` wins —
the V4 precedence.

**Every fail-closed path still fails closed.** No subject, empty subject, and claims-without-`sub`
→ `KIV12 member actor requires an authenticated subject`; a subject that is not a member of the
resolved tenant → `KIV12 actor is not a member of the resolved tenant`; a non-manager on a
manager-required path → `KIV12 operation requires the manager role`; a manager on that path →
succeeds; an actor with no open MIV row → `KIV12 actor has no open member identity version`; an
invalid actor kind → `KIV14 actor_kind must be member or system`; malformed claims → `22P02`.

**The service/system path is unchanged.** The `system` actor path returns exactly one row with all
four values NULL, identical before and after — it returns before the request-subject resolution and
is not affected by this change.

**Internal resolver separation is preserved.** A direct call to
`public.kv_control_assert_actor(...)` as `authenticated` is still denied (`42501 permission denied
for function kv_control_assert_actor`), and its ACL remains owner-only.

**The run was diagnostic-silent.** No unexpected `ERROR`, `WARNING`, `NOTICE`, `INFO` or `SQLSTATE`
was emitted, under the **HS-12** contract as it applies to A2 (§6). A correct exact-`0109` run
produces stdout `DO DO DO CREATE FUNCTION DO DO` and **empty stderr**; any diagnostic output is
unexpected by definition.

**A second application would refuse.** This is asserted from the observed state, **not** by
attempting a second run — `0109`'s precondition P7 raises `KIV174 precondition failed: … target is
not the un-repaired 0108 definition` once `still_unrepaired = false`. HS-19 forbids a second
attempt regardless.

**No unrelated drift anywhere.** Re-run **P-1, P-2, P-3, P-6, P-7** byte-identically and require
their B-16 values: the three governed tables still present, owned by `kivo_control_owner`, with RLS
**and** FORCE RLS on; the type present; **exactly 21** governed functions, all owned by
`kivo_control_owner` (the PF-4f pattern-closure form — a 22nd match or a 20th is **HS-22**); the
eight A1 columns present and still entirely NULL; MIV rows = open rows = `count(public.members)`
with no non-version-1 rows. Plus `count(public.members)` = B-3 with no evidence of mutation
(B-13), `count(public.conversations)` = B-4, `count(public.conversation_assignment_events)` = B-5.
**No owner, RLS, FORCE-RLS, policy, MIV, A0, A1, A2, order, safety or control-plane state may have
changed.** Exactly one thing changed in the entire database: one function body.

**The migration-ledger contract, resolved truthfully (R6-9).** KIV-165 blocked in part on an
irreconcilable ledger contract: Revision 5 §2.6 says a `0108` row is added *"if the runner records
it"*, while §7.1 says the Class A after-state is *"exactly one new row, for `0108`, and no other"*
— and exact `0108` contains no ledger insert. For Change Class A2 that ambiguity is removed
outright:

* **Exact `0109` writes no migration-ledger row.** The file contains **zero** DML statements of any
  kind; its only two `ledger` occurrences are comment lines disclaiming a row. Under the currently
  intended raw `psql` runner, **no `0109` ledger row will exist after a successful commit.**
* **The absence of a `0109` ledger row is therefore expected, and must never be treated as evidence
  that the SQL transaction failed.** Commit-or-rollback is determined from the runner transcript
  and from the **P-4** body state, never from the ledger.
* **Capture and report ledger state truthfully as evidence** — **P-8**: `max(version)`, whether a
  `0108` row exists, whether a `0109` row exists. **This has no pass/fail expectation for A2.**
* **Do not retroactively insert a `0108` ledger row.** Not now, not as tidying, not as part of any
  reversal. It was never authorized and is not authorized here.
* **Do not invent an out-of-band `0109` ledger mutation.** Any ledger write would need its own
  explicit source, review and authority path, and has none.
* **If a future revision proposes a different governed runner that does record ledger state**, it
  must pin the exact mechanism and the exact authority, and it **may not** silently change the
  source artifact or the production mutation boundary to do so.

**Baseline consequence.** On a full pass the authenticated member-control runtime is repaired and
the recorded state advances to *`0108` committed + `0109` applied*. **That advance is provisional,
confers no downstream authority, and does not close KIV-14.** Specifically: **separate independent
post-remediation verification remains mandatory** before KIV-14 can be accepted or KIV-25 can
start, and **the executor's own after-state evidence can never self-close KIV-14** (§1 no-self-
acceptance rule, §7.4). KIV-165's BLOCK, KIV-172's HOLD and KIV-173's `RUNTIME REPAIR REQUIRED`
remain operative historical findings until that independent verification says otherwise. KIV-25
remains blocked, and Alpha/Pilot remains **NO-GO**.

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

**Evidencing "the whole window" (OBS-2, as narrowed by KIV-160 Attempt 3 cleanup 1).** A
pre-change record alone evidences nothing about a window. What is required — and what is
claimed — is **objective bracketing evidence**, not a mathematical proof of continuous
non-live state:

> **What this evidence is.** Two objective endpoint reads of the same named control, bracketing
> every mutating statement, plus zero movement in three inbound row counts across the bracket.
>
> **What it is not.** It is **not** a continuous audit of the ingress control between the two
> endpoints. This procedure has no continuous audit source, and none is built for it (§0.3). A
> transient enable-and-disable between IS-1 and IS-2 that produced **no** inbound row would not
> be detected by this evidence.
>
> **Why it is nevertheless sufficient here.** The read-back being protected is *whether the
> alpha application paths still work*. Its deferral is permitted only when nothing arrived to
> exercise them; the three counts are the objective test of that, and any inbound activity
> breaks the bracket. The evidence is also **never accepting**: a permitted deferral leaves
> Class B incomplete and blocks KIV-145 and alpha GO regardless (§7.3.1 below).

The bracket requires all of the following:

| | Point | Content |
|---|---|---|
| **IS-1** | At §3 capture, **before** the change (capture line **B-14**) | The objectively read-back enabled/disabled state of the **PF-5a-validated** control, plus `count(public.messages)`, `count(public.conversations)` (B-4) and `count(public.conversation_assignment_events)` (B-5), with one statement timestamp |
| **IS-2** | At **end of window**, before evidence packaging — recorded **unconditionally** at whichever terminus the run reaches: **L-7** (live clean), **L-13** (live restoration), **Q-5** (not-live clean, whether or not Q-4 passed) or **Q-10** (not-live restoration) | The same four values, read with **byte-identical query text**, with its own statement timestamp |

**IS-1 and IS-2 are always recorded, in every Class B run.** They are the sequence's bracket, not a
deferral artifact — §7.5.5 requires both regardless of branch, terminus or read-back-6 outcome.
The deferral question below simply consults them.

A deferral is permitted **only if all of the following hold together**:

1. IS-1 shows the PF-5a control **not enabled**;
2. IS-2 shows the PF-5a control **not enabled**;
3. all three counts are **identical** between IS-1 and IS-2 — no inbound message, conversation
   or assignment event arrived across the bracket;
4. the IS-1 and IS-2 timestamps **bracket** every mutating statement in the transcript.

Any delta in any count, either endpoint showing the control enabled, a missing or ambiguous
endpoint, or timestamps that do not bracket the work, means ingress was live or its state is
unevidenced. The deferral is then unavailable and the condition is **HARD STOP (HS-25)**.

If PF-5a was not satisfied, the run never started (**HS-30**), so an unnamed or unreadable
control can never reach this question.

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

* **Class A1** — KIV-159 condition 5: separate independent post-execution verification, required
  before any downstream G2 work may rely on the production result. The executor's own §7.1
  read-back is that reviewer's input, never a substitute for them. **KIV-165 was that verification
  for Release 4 and it returned BLOCK** (§2.1.1).
* **Class A2 (R6-10)** — **separate independent post-remediation verification is mandatory**,
  released by PM to a fresh context that neither executed A2 nor authored this revision. It is
  required **before KIV-14 can be accepted and before KIV-25 can start**. The executor's own
  §7.1.1 read-back is that reviewer's input, never a substitute for them, and **executor evidence
  can never self-close KIV-14**. That verifier must also reconcile: the **G1 / G4** live
  `auth.uid()` evidence; the truthful **P-8** ledger state, without treating a missing `0109` row
  as failure (§7.1.1, R6-9); and whether KIV-165's BLOCK, KIV-172's HOLD and KIV-173's
  `RUNTIME REPAIR REQUIRED` are now discharged or still standing.
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

Each sequence has **two possible termini**: a clean terminus, and — if §5.4.1 is entered — a
**restoration terminus** defined in §7.5.4. Revision 3 had no restoration terminus, which is
what left a successful restoration with no lawful way to revert the hold.

#### 7.5.1 Live-ingress sequence — L-0 … L-9 (clean path)

| Step | Action | Pre-decided outcome |
|---|---|---|
| **L-0** | §2.7 entry checklist complete, including **PF-5**, all per-group RM-VERIFY PASSes of §5.4.2, and the §3 capture with **IS-1 recorded as enabled** | Any item unsatisfied → do not start |
| **L-1** | **Engage the reversible ingress hold** (§4.3) using the PF-5a control only. Record the timestamp **and read the control's state back**; observed state must be *engaged* | Prohibited block methods (§4.3) are never used. Read-back mismatch → **HS-29** |
| **L-2** | **Execute the forward change** — one transaction per invariant group, `ON_ERROR_STOP=1` | Any error → §5.4.1, then **§7.5.4**. **Hold stays engaged** |
| **L-3** | **Held-state read-backs: run read-backs 1–5 only** (§7.2 items 1–5 — intended owner; owner `rolbypassrls=false`; RLS enabled; FORCE RLS enabled; service-role grants revoked as designed). Catalog reads; no traffic needed. Record every value | **All five must pass.** Any failure → §5.4.1, then **§7.5.4**. **Hold stays engaged.** Read-back 6 is **not** attempted here |
| **L-4** | **Release gate.** The hold may be released if and only if **all four** hold: (a) read-backs 1–5 all passed at L-3; (b) the hold is the only block engaged per E-6; (c) no HARD STOP is outstanding; (d) §5.4.1 has not been entered | Any one false → **do not release**. Releasing outside this gate is **HS-29** |
| **L-5** | **Release the ingress hold.** Record the timestamp **and read the control's state back**; observed state must be *released* | **Release is a recovery step, not an acceptance signal.** It never means the change passed. Read-back mismatch → **HS-29** |
| **L-6** | **Read-back 6 / bounded smoke**, now runnable because ingress is up. The fixed smoke set of §7.3 item 2, test-marked and non-destructive, run **once**, within the **PF-5b wall-clock bound** | Pass → L-7. Fail, error, or bound exceeded → **L-8**. An inconclusive result **is a failure** (§7.3.1) |
| **L-7** | **Post-release re-verification, mandatory.** Immediately re-run read-backs **1–5** with byte-identical query text, and record **IS-2** | Every value must **equal L-3 exactly**. Any difference → **L-8**. This is the step that catches a security invariant disturbed by real traffic after release |
| **L-8** | **Failure branch for L-6 or L-7.** **Immediately re-engage the ingress hold**; record the timestamp **and read the control's state back** (observed: *engaged*). Then apply §5.4.1, then **§7.5.4** | Re-engaging is a **recovery action, not a new mutation**, and is **not** a second attempt under HS-19. **§7.3.1 deferral is unavailable in this branch** — ingress was live |
| **L-9** | **Clean terminus. Completion for executor purposes only.** Reached only when L-3 passed, L-6 passed and L-7 matched L-3 exactly. Hold remains released. Package evidence | Acceptance remains KIV-145's under §7.4. The executor reports completion of the sequence, never acceptance of the change |

**Why this is not circular.** The release gate (L-4) depends only on read-backs 1–5, which do
not need traffic. Read-back 6 depends only on the release (L-5), which has already happened.
Nothing waits on itself.

**Why it cannot produce a false pass.** Release is explicitly not a pass (L-5); the security
invariants are re-read *after* traffic (L-7) and must match exactly; and completion (L-9)
requires all three of L-3, L-6 and L-7. Passing L-3 alone completes nothing.

#### 7.5.2 Not-live-ingress sequence — Q-0 … Q-7 (clean path)

| Step | Action | Pre-decided outcome |
|---|---|---|
| **Q-0** | §2.7 entry checklist complete, including **PF-5** and all per-group RM-VERIFY PASSes, and the §3 capture with **IS-1 recorded as not enabled** | Any item unsatisfied → do not start |
| **Q-1** | **No block is engaged and none is permitted** (§4.1, §4.3). Record that finding in E-6 | Engaging a block here is out of boundary → **HS-29** |
| **Q-2** | **Execute the forward change** — one transaction per invariant group, `ON_ERROR_STOP=1` | Any error → §5.4.1, then **§7.5.4** |
| **Q-3** | **Run read-backs 1–5** (§7.2) | Any failure → §5.4.1, then **§7.5.4** |
| **Q-4** | **Attempt read-back 6 / bounded smoke** within the **PF-5b bound**, same set as L-6 | Pass → Q-5. Fail or inconclusive → §5.4.1, then §7.5.4. Genuinely not runnable → Q-5 |
| **Q-5** | **Record IS-2. Unconditional** — it runs whether Q-4 passed, was not runnable, or was skipped, because IS-1/IS-2 must bracket the sequence in every outcome (§7.5.5) | Never conditional on Q-4's result. Omitting it is **HS-29** |
| **Q-6** | **Deferral question — asked only if read-back 6 was not executed.** Evaluate §7.3.1 against the recorded IS-1/IS-2 | All four §7.3.1 conditions hold → a **permitted deferral**, recorded as `READ-BACK 6 NOT EXECUTED — DEFERRED`, **Class B incomplete**, blocking on KIV-145 and alpha GO. Any condition fails → **HS-25**. If read-back 6 *was* executed and passed, this step records "not applicable" |
| **Q-7** | **Clean terminus.** Package evidence | Acceptance remains KIV-145's. A standing deferral is surfaced as an open blocking item, never as completion |

#### 7.5.4 Restoration terminus — the lawful exit after §5.4.1 (R3-1)

Entered whenever §5.4.1 is reached from either sequence. **This is the only path by which a hold
engaged at L-1 or re-engaged at L-8 may lawfully be reverted, and L-12 is a fourth authorized
hold transition alongside L-1, L-5 and L-8.**

**Live branch — L-10 … L-14:**

| Step | Action | Pre-decided outcome |
|---|---|---|
| **L-10** | **Determination and restoration, hold engaged throughout.** Before beginning, **read the hold control's state back and record it; observed state must be *engaged***. Perform the §5.4.1 mandatory read-only determination, classify by Q1–Q3, then act on that state's verdict — for **S-1** run every `RM-G-i`; for **S-2** run the committed groups' `RM-G-i` only; for **S-0** run nothing | **S-3E and S-4 → §5.4.5 holding state, hold stays engaged, do not proceed to L-11.** If the state read-back shows the hold not engaged → **holding state**, not a re-engage |
| **L-11** | **Restoration-success gate — §5.4.4 obligation 2.** Re-run the §3.2 capture set byte-identically; require equality to the recorded before-state **per object and per privilege** across every restored group | **PASS → L-12.** **FAIL → §5.4.5 holding state (HS-27), hold stays engaged.** No retry, no re-materialization |
| **L-12** | **Authorized hold revert — the fourth and final transition.** Revert the PF-5a control to **the state IS-1 recorded**, since restoration returned the system to the before-state. Record the timestamp | Permitted **only** after an L-11 PASS. Performing it at any other point, or after S-0 without an L-11 PASS, is **HS-29** |
| **L-13** | **Objective post-revert read-back.** Read the control's state back; it must equal **IS-1's recorded value**. Record **IS-2**. Re-run read-backs **1–5**; they must equal the **captured before-state (B-10/B-11)** — not the L-3 values, because the system was restored, not changed | Any mismatch, or an unreadable control → **§5.4.5 holding state immediately.** **Do not retry the revert** |
| **L-14** | **Terminal evidence step.** Package E-1 … E-11 including the restoration transcript, the `RM-G-i` fingerprints run and skipped, the §5.4.4 PM notification, and both hold read-backs. Record the outcome verbatim as **`CLASS B NOT COMPLETE — RESTORED TO BEFORE-STATE`** | This is the terminal state. **KIV-25 remains unexecuted**, KIV-145 stays blocked, and no part of the change may be reported as done. Re-attempting the forward change requires a **new** Founder authorization and PM release |

**Not-live branch — Q-8 … Q-10:** identical in substance, minus every hold step, since the Q
branch never engages one. **Q-8** determination and restoration per §5.4.1; **Q-9** the §5.4.4
verification gate, PASS → Q-10, FAIL → §5.4.5; **Q-10** record IS-2 and package terminal
evidence as `CLASS B NOT COMPLETE — RESTORED TO BEFORE-STATE`. Engaging a hold anywhere in this
branch, including "to be safe" during restoration, is **HS-29**.

**No executor choice exists on this path.** Each step has exactly one successor: a PASS advances,
anything else routes to §5.4.5. There is no point at which the executor weighs §5.4.3 against
HS-29 — §5.4.3 requires the hold to stay engaged through L-10 and L-11, and HS-29 authorizes
its revert at L-12. The two now agree.

#### 7.5.5 Rules binding both sequences

* **No step may be reordered, skipped, merged or repeated.** Doing so is **HS-29**.
* **The ingress hold is touched at exactly four points — L-1 engage, L-5 release, L-8 re-engage,
  L-12 revert — and nowhere else, in either sequence or on either terminus.** Any other change to
  it is **HS-29**.
* **Every hold transition is evidenced by an objective state read-back**, not by a timestamp
  alone (PF-5, R3-4). Timestamps are recorded too, but they are not the evidence of state.
* **The smoke set and its wall-clock bound are fixed** by §7.3 item 2 and **PF-5b** respectively.
  The executor does not choose, extend, retry or narrow either.
* **Deferral exists only at Q-6.** There is no deferral anywhere in the L sequence, and none on
  either restoration terminus.
* **IS-1 and IS-2 are both recorded in every outcome** — clean or restoration, live or not-live,
  read-back 6 passed or not — so the two endpoints bracket all mutating statements (§7.3.1).
  IS-2 is recorded at L-7, L-13, Q-5 or Q-10 depending on which terminus is reached; **exactly
  one of those applies to a given run.**

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
| E-6 Block and ingress record | What was blocked, why it was necessary — or the recorded finding that no block was necessary. **For Class A1 and Class A2 alike it carries exactly the fixed B-15 ingress-applicability statement with its timestamp (§3.2, §4.2); no control identifier, no IS-1/IS-2 and no hold transition exists for either Class A form (R5-1, R6-1).** For Class B it also carries: the **PF-5a control identifier** and the **PF-5b wall-clock bound** as named by KIV-25; which §7.5 sequence applied and the IS-1 value that selected it; **IS-1 and IS-2 in full** (§7.3.1), the objective bracketing evidence, recorded in every run; and for **every** hold transition — **L-1 engage, L-5 release, L-8 re-engage, L-12 revert** — both the timestamp **and the objectively read-back observed state**, since a timestamp alone is not evidence of state (R3-4) |
| E-7 Execution transcript | The full runner transcript: command line, every statement outcome, all warnings, all errors, `SQLSTATE`s, start/end timestamps, and the commit-or-rollback outcome stated explicitly |
| E-8 After-state | Full §7 read-back, assertion by assertion, pass/fail each |
| E-9 Residue / reversal / restoration record | §5.2 residue checklist if rolled back; §5.3 record if reversed post-commit. For Class B: the reviewed **per-group skeletons `SK-G-1 … SK-G-n`**; **every `RM-G-i` artifact with its own SHA-256, byte count and line count**, plus **`RM-MANIFEST`**; the **RM-VERIFY record** — verifier identity and a **PASS/BLOCK per artifact against that artifact's SHA-256**, all of which must match the executor's; the **§5.4.1 read-only determination**, the Q1–Q3 answers, and which of **S-0 … S-4** was matched, with the HARD STOP that fired recorded as **trigger only**; and — if restoration ran — its full transcript, each artifact's fingerprint recomputed immediately before use, **which groups were run and which were skipped whole**, the §5.4.4 verification, and the PM notification. If the holding state was entered, the §5.4.5 record instead |
| E-10 Path-check record | §7.3 / §7.5 result: which sequence and which terminus ran; the L-3 read-back values; the L-6/Q-4 smoke outcome against the PF-5b bound; and the **L-7 post-release re-verification compared value-by-value against L-3**. On a restoration terminus: the **L-11/Q-9 verification**, the **L-13 post-revert read-back compared against IS-1 and against the captured before-state**, and the verbatim terminal marking `CLASS B NOT COMPLETE — RESTORED TO BEFORE-STATE`. If read-back 6 was not executed: the verbatim `READ-BACK 6 NOT EXECUTED — DEFERRED` marking, the IS-1/IS-2 bracketing evidence and count deltas permitting it (§7.3.1), and the statement that KIV-25 is incomplete and KIV-145 / alpha GO carry a blocking precondition |
| E-12 Change Class A2 evidence (R6-2, R6-4, R6-5, R6-7, R6-9, R6-11) | **A2 only.** The **PF-2.A2** recomputed `0109` identities (commit, sole parent, path, blob, SHA-256, bytes, lines) and the recomputed `0108` identities; the **PF-3.A2** whole-file single-transaction runner proof, stated as proof and not as intent; **PF-4a2**, **PF-4b2** and the byte-identical PF-4b detail listing; the A2 form of **PF-4f** with its verbatim 21-signature list; **PF-4g / G1 … G3** — captured `prosrc`, `prosrc_md5`, `functiondef`, `arg_list`, `uid_rows` and the recorded **semantic determination** against V4; **B-16** (the complete **P-1 … P-8** presence-probe results with server version, including P-4's pre-`0109` `body_md5`); **B-17** (the **G4** immediate-pre-forward re-capture and its fingerprint); the §7.1.1 after-state assertion by assertion; the truthful **P-8** ledger evidence with the explicit statement that a missing `0109` row is expected and is **not** evidence of failure; the §5.2 A2 residue checklist if rolled back; and — if §5.7 was lawfully entered — the fresh Founder authorization reference, the named **D-1 … D-4** condition, the reversal artifact with its own SHA-256, **V-1 … V-4**, the reversal transcript, the post-reversal read-backs, and the verbatim terminal marking `CLASS A2 NOT COMPLETE — REVERSED TO PRE-0109 DEGRADED STATE`. If §5.8 was entered, the residue incident record instead: the complete membership state **including grantor**, the P-4 body state, and the PM/Founder release under which any cleanup was performed. **Integration evidence (I1 … I5) belongs to a separate authorization and is not produced by an execution window.** |
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
   which reversal (§5.1), the mutually exclusive post-commit state map S-0 … S-4 (§5.4.1),
   per-group independent verification of every executable restoration artifact (§5.4.2), the
   named-object drop order (§5.3), and a defined holding state (§5.4.5);
5. states closed failure and abort conditions (§6);
6. defines after-state verification and service/application recovery, including the six PF-R1
   read-backs, the two non-circular execution sequences with their clean and restoration
   termini (§7.5.1–§7.5.4), and the single closed deferral condition for read-back 6 with
   objective bracketing ingress evidence (§7.3.1);
7. defines evidence custody (§8);
8. is specific enough to govern KIV-14 and KIV-25 without recreating the old broad maintenance
   program (§0.3);
9. creates no authority and authorizes no mutation.

**Revision 6 adds five acceptance criteria specific to Change Class A2.** The reviewer should
confirm that this revision:

10. **consciously re-instantiates the whole Class A ceremony for A2** rather than patching selected
    rules — the A1/A2 split (§2.1), the recorded entry state (§2.1.1), and a disposition for
    **every** Revision-5 Class A rule in **§9.4** (R6-1, R6-2, A-OBS-3);
11. **supersedes PF-4a/PF-4b for A2 openly and only by scope** — PF-4a2/PF-4b2 with correctly
    polarised, catalog-safe, unambiguous-cardinality assertions, while PF-4a, PF-4b and the R5-3
    byte-identity rule are left **byte-identical** and still govern A1 (R6-3, Q-A, A5);
12. **binds the exact `0109` whole-file single transaction as a HARD STOP before mutation**
    (§2.4 PF-3.A2, HS-3) and requires the **G1 … G5** fail-closed live `auth.uid()` semantic guard
    with G2 never an adaptation point and a **named standing owner** for post-`0109` drift
    (§2.5.1, §3.2 B-17, §9.5) (R6-4, R6-5);
13. **gives A2 its own exact post-commit reversal path** that restores one function rather than
    dismantling the control plane, states plainly that success returns to the **known degraded
    state**, and leaves **§5.3 byte-identical** so KIV-167 is neither altered nor stretched
    (§5.7, §5.1) (R6-7, Q-B, A6); and
14. **preserves the KIV-25 Change Class B contract entirely unchanged** (§9.2.3) (R6-12), while
    making the authority separations impossible to misread (§0.4) (R6-13).

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
* **The §7.5 sequences still require the KIV-25 authorization to supply two values this
  procedure must not invent** — the exact governed ingress/hold control and the finite
  wall-clock smoke bound. Revision 3 assumed both; **Revision 4 makes both a fail-closed entry
  requirement at PF-5, with HS-30 firing before any mutation if either is absent, unreadable,
  ambiguous, out-of-boundary or invalid.** The reviewer should confirm that requiring these of
  KIV-25 — rather than specifying them here, which would mean designing KIV-25's object scope
  from this window — is now sufficiently fail-closed.
* **RM-VERIFY (§5.4.2) adds `n + 1` independent read-only checks to the Class B critical path**
  — one per invariant group plus the manifest — where Revision 3 had one. That is the cost of
  making S-2 partial restoration verifiable; the artifacts remain short mechanical texts and the
  mechanism is still the existing independent-reviewer lane, building no infrastructure. The
  reviewer should confirm the trade-off, and that §1, §2.7 item 5, §5.4.1, §5.4.2, §5.4.3, E-9,
  HS-26 and HS-28 agree exactly, since R3-2 required those to be aligned.
* **§7.3.1's ingress evidence is objective bracketing evidence, not a continuous audit**, and
  §7.3.1 now says so in terms. The reviewer should confirm that the stated residual — a
  transient enable/disable between endpoints producing zero inbound rows — is acceptable given
  that the deferral is never accepting and always blocks KIV-145 and alpha GO, or route it back
  if a continuous audit source is required.
* **§2.6.2's catalog assertions are allow-list based and therefore version-robust**, and the
  executor records the observed server version. The reviewer should confirm the four expected
  shapes (C-1 `c=28, f=6, p=3, u=4`; C-2 = 2; C-3 = 11 with exactly 2 constraint triggers;
  C-4 = 16) against exact `0108` independently rather than from this file.
* **OBS-6 is preserved as non-blocking, unchanged.** Its substance is not stated in the KIV-160
  Attempt 3 intake or the Revision 4 release available to this Builder window — both reference
  it only as a wording ambiguity to leave alone unless it can be removed without weakening the
  Q-branch fail-closed rules. Rather than guess at which wording was meant and risk relaxing a
  fail-closed rule, **no change was made**. If OBS-6's substance is stated, it can be addressed
  in a later narrow revision.
* **F-7 was adopted as PF-4f without touching `0108`.** PF-4f is a read-only assertion about
  production state; it neither narrows the migration's wildcard nor claims to. If the reviewer
  judges the wildcard itself unacceptable, that is a source finding against `0108` under
  separate authority, not something this procedure may fix.
* Revision 2 changed only this file. `0108`, `0107`, the proof harness and every runtime path
  are untouched, and Revision 1's commit was not amended or rewritten.
* **The Class A ingress-applicability record (B-15) is a fixed statement, not an observation
  (R5-1).** It asserts only that §4.2's no-block/no-drain/no-ingress-mutation rule applies to
  Class A and that no KIV-25-named control is required to exist for it; it makes no claim
  about technical ingress state, which is exactly why it can never be inferred from — or
  contradicted by — alpha GO/NO-GO status. The reviewer should confirm it cannot be read as
  ingress-state evidence, and that every Class B obligation — PF-5, IS-1/IS-2, the four hold
  transitions, HS-25/HS-29/HS-30 — is untouched by it.
* **§2.6.3's absence probes are catalog-safe by construction (R5-2)** — `to_regclass`,
  `to_regtype` and allow-listed name reads that return NULL or zero rows rather than erroring
  — assert named objects only, never a raw total, and fail closed to HS-11 on any presence.
  The reviewer should confirm A-1 … A-4 against exact `0108` independently, and that
  C-1 … C-4's §7.1 after-state authority is unchanged.
* Revision 5, like every revision before it, changed only this file. `0108`, `0107`, the proof
  harness and every runtime path are untouched, and Revision 4's terminally accepted commit
  `a8d675b8` was not amended, rewritten or force-pushed.
* **The A1/A2 split is the load-bearing structural choice, and the reviewer should attack it
  directly (R6-1).** The alternative — rewriting the existing Class A rules in place to mean
  `0109` — was rejected because it would have silently changed PF-4a/PF-4b (KIV-14 mandated text
  protected by R5-3) and put §5.3 at risk, and because a reader could no longer tell which rule had
  been reasoned about and which had merely been find-and-replaced. The cost is a longer document
  with two Class A instantiations to keep straight. **The reviewer should test that §9.4 really is
  complete** — that no Revision-5 Class A rule is missing a disposition — since the split is only
  as safe as that inventory.
* **PF-4a2/PF-4b2 are Builder-authored text, not KIV-14 mandated text (R6-3).** PF-4a/PF-4b carry
  the authority of KIV-14 having mandated them verbatim; their A2 replacements carry no such
  provenance and rest only on this revision's review chain. The reviewer should independently
  confirm the expected post-`0108` topology — **exactly one** inert `admin=true / set=false /
  inherit=false` record held by the executor with a superuser grantor — against the **Release-4 /
  KIV-165 production evidence**, not against this file and **not** against any reviewer's disposable
  fixture, whose executor role name is a fixture artifact.
* **§5.7's restoration mechanism was Builder-proved on a disposable fixture; §5.7 as a governed
  procedure remains unexercised (R6-7).** On disposable PostgreSQL 17.11 the Builder reproduced the
  post-`0108` topology from the exact Git bytes and ran the round trip: pre-`0109` body md5
  `a5d906876b3b70fa60db3b75ae356595` → exact `0109` applied under temporary `INHERIT TRUE, SET
  FALSE` → `00a73f86a902ff222760ff8fcab8abf1` → §5.7's restoration of the exact `0108` definition →
  **back to `a5d906876b3b70fa60db3b75ae356595`, byte-exactly**, with owner, `SECURITY DEFINER`,
  `search_path`, result shape, argument list and ACL unchanged throughout, the membership topology
  byte-equal at every step, `SET ROLE` denied throughout, and the `42501` member-path failure
  correctly present again afterwards. (Both body hashes independently match the values Quality and
  the Auditor reported, which corroborates that all three windows tested the same function bytes.)
  **That proves the mechanism, not the procedure.** §5.7's guards, its D-1 … D-4 entry conditions,
  its V-1 … V-4 pre-checks and its read-back set have been reviewed by nobody, and the reviewer
  should test them as fresh text: that the preconditions are genuinely fail-closed, that the
  capability model is exactly `0109`'s and no wider, that the restoration target is byte-exact
  `0108`, and that it cannot be confused with §5.3. **Executing §5.7 additionally requires its own
  fresh Founder authorization that does not exist.**
* **The exact `0108` function text embedded in §5.7 was extracted mechanically from the `0108` Git
  blob, not transcribed.** The reviewer should independently recompute its fingerprint — `0108`
  lines 715 – 766, 52 lines, 1,755 bytes, SHA-256
  `36e79e6e872acf2586da0ba24768b1d8df8a64e30d37c242cd2f4c74587d8da0` — against exact `0108` blob
  `7b500626331dd4eaf4620d29c95953740f6e5541` rather than trusting this file.
* **G2 compares semantics, not raw text, and that is a deliberate trade (R6-5).** An over-literal
  `md5(prosrc)` equality would fail closed on a whitespace-only vendor reformat, which is safe but
  operationally brittle; a semantic determination is more useful and slightly more judgement-bound.
  The determination is the gate and the hash is custody evidence. **This is not theoretical:** the
  Builder's own disposable PostgreSQL 17.11 fixture, carrying a semantically identical V4
  `auth.uid()`, produced `md5(prosrc) = 6d775b7776f0d484368fe522aba18c6c`, while the KIV-177 Auditor
  independently reported `5aa72ff79b5768517f482bb6da05396b` from theirs. **Same semantics, different
  whitespace, different hash** — a raw-hash gate would have hard-stopped on formatting, which is
  safe but useless. The reviewer should confirm that the semantic route cannot instead become a
  route to accepting a genuinely different definition — **G2 is never an adaptation point, and
  `0109` is never adjusted to match what is found.**
* **G5's owner is a role, not a person (R6-5).** §9.5 names the durable **Kivo PM role** because a
  named individual would decay. The reviewer should confirm the re-check triggers are concrete
  enough to fire, and that the obligation is genuinely permanent: after `0109` the governed
  resolver no longer calls `auth.uid()`, so vendor changes stop propagating **forever**, not until
  the next release.
* **The A2 ledger contract is a truthful statement about the runner, not a fix (R6-9).** It removes
  the KIV-165 contradiction by saying plainly that exact `0109` writes no row and that a missing row
  is not failure. It does **not** give the programme a ledger. The reviewer should confirm that no
  reading of §7.1.1 licenses a ledger write, and that the `0108` row is still absent and still not
  to be backfilled.
* **The known-false `0109` security comment is carried as a binding correction obligation, not
  waived (R6-6).** §2.6.4 records the true model. The reviewer should confirm that the correction
  is genuinely gated to a separate later source pass and cannot be folded into integration
  (HS-40), and that §2.6.4's model is accurate rather than merely reassuring.
* **This revision was written against a live GitHub read taken at authoring time (R6-11).** `main`
  was `14ace390b865d1e436fec0eab5c47eb7a2d8424b` with no `0107`/`0108`; PR #571 was open, draft and
  unmerged at head `d5b4b1dd…`; the `0109` branch tip was exactly `cc74e14c…` with blob
  `8923ed06…`; the `0109` slot was free on the `0108` lineage; and no PR existed for the `0109`
  branch in any state. **Those are facts as at authoring, not standing facts** — §2.3.1 requires
  fresh verification at integration time, and the reviewer should re-read GitHub independently
  rather than trust this paragraph.
* **Revision 6, like every revision before it, changed only this file.** `0109`, `0108`, `0107`,
  the proof harness and every runtime path are untouched; no PR, merge, integration, production
  access or SQL execution occurred; and Revision 5's terminally accepted commit `8691d60a` was not
  amended, rewritten or force-pushed.

### 9.2 F-1 … F-7 no-regression record

KIV-160 Attempt 1's findings are closed. Revision 3 touched four sections that carry an F-fix;
in each case it **extends** the fix. The reviewer can check each in one step:

| Closed finding | Its Revision 2 fix | What Revision 3 did | Still closed because |
|---|---|---|---|
| **F-1** deferral fail-open | §7.3.1 narrows deferral to recorded not-live ingress; not KIV-25 completion; blocking on KIV-145 and alpha GO; no self-certification | Added the IS-1/IS-2 whole-window proof (OBS-2) and located deferral at exactly one step, Q-5 | The permitted condition got **strictly harder**, never easier; the L branch has no deferral at all |
| **F-2** restoration authority ambiguous | §5.4 single rule; restoration ≠ second attempt; bounded to captured values; transcript + verification + PM notification; holding state | N-2 added independent verification of the exact text; N-3 added the post-commit state map. R3-2 then made that verification per-group; R3-3 made the map mutually exclusive; R3-1 gave restoration a lawful terminus | Every §5.4 bound is retained verbatim and further gates were added ahead of the forward mutation; none was relaxed |
| **F-3** membership state | §2.6 corrected to the governed non-superuser case | Untouched. §7.1 gained the OBS-3 clarification only | §2.6's text is unchanged; the clarification explains why `≤1` and `exactly 1` coexist and adds an HS-22 trigger |
| **F-4** stale authority wording | §2.1 single-timestamp table | Timestamp refreshed to the Revision 3 release; both statuses re-read and unchanged (Done) | Still exactly one timestamp, still one place |
| **F-5** cross-reference | §2.6 cites §7.1 | Untouched | — |
| **F-6** verbatim PF-4a/PF-4b | Byte-identical to KIV-14; executor re-copies and diffs; KIV-14 authoritative | **Not edited.** Byte identity re-verified by diff against the KIV-14 text during Revision 3 | The two code blocks are unchanged from Revision 2 |
| **F-7** wildcard preflight | PF-4f read-only; §7.1 pattern closure; §5.3 no-wildcard drops; `0108` untouched | Untouched, except that §2.6.1 now makes the object inventory it guards complete | PF-4f, the §7.1 counterpart and the §5.3 prohibition are unchanged; `0108` remains untouched |

No Revision 3 change relaxes a Revision 2 constraint. Where Revision 3 changes ordering (§7.5)
it removes an impossibility rather than a safeguard: the live branch previously could not
complete at all.

**Revision 4 re-verified all seven.** F-6's byte identity was re-checked by diff against the
KIV-14 mandated text and against the Revision 3 blocks — unchanged. PF-4f, its §7.1 pattern
counterpart and the §5.3 no-wildcard-drop prohibition are unchanged. §2.6's membership
statement and §7.1's OBS-3 clarification are unchanged. §2.6's EXECUTE cross-reference still
reads §7.1. §2.1 still carries exactly one authority timestamp. §7.3.1's deferral condition was
made **harder** again, never easier. `0108` and `0107` remain untouched.

**Revision 5 re-verified all seven.** F-6's byte identity holds: **PF-4a and PF-4b were not
edited and are byte-identical to Revision 4**, which had re-verified them against the KIV-14
mandated text. PF-4f, its §7.1 pattern counterpart and the §5.3 no-wildcard-drop prohibition
are unchanged — **§5.3 is byte-identical to Revision 4 in full**, so the exact post-commit
reversal path separately approved under KIV-167 is not silently changed. §2.6's membership
statement and §7.1's OBS-3 clarification are unchanged, and §2.6's EXECUTE cross-reference
still reads §7.1. §2.1 still carries exactly one authority timestamp, deliberately
unrefreshed: Revision 5 re-read no authority issue and adds no authority fact. §7.3.1's
deferral condition is unchanged in substance — its wording gains only the explicit Class B
scope it already had in context. `0108` and `0107` remain untouched.

### 9.2.1 Revision 3 carry-forward — what Revision 4 did not implicate

The Revision 3 fixes outside R3-1 … R3-5 are retained intact:

| Revision 3 fix | Revision 4 treatment |
|---|---|
| **N-1** two-branch §7.5 ordering, L-4 release gate on read-backs 1–5, L-7 post-release re-verification, release-is-not-a-pass | **Retained in full and extended** with the §7.5.4 restoration terminus. No gate was relaxed; L-4's four conditions are unchanged |
| **N-2** independent verification of executable restoration text before forward mutation | **Retained and strengthened** — verification is now per artifact rather than once for a whole plan, so strictly more text is independently verified, not less |
| **N-3** mandatory read-only determination first; restoration is not a second attempt under HS-19; Class A excluded from the state map | **Retained verbatim** in §5.4.1.3 and §5.4.1.4; only the classification axis changed |
| **OBS-1** structural arithmetic 39 + 2 = 41, 9 standalone indexes, 6 FKs, 16 index relations, complete named inventory | **Retained unchanged** — independently confirmed by KIV-160 Attempt 3. R3-5 corrects the trigger count and the catalog *assertion*, not the structural figures |
| **OBS-2** two objective ingress endpoints and zero inbound deltas | **Retained**, with the claim narrowed to bracketing evidence and IS-2 now unconditional in every run |
| **OBS-3** `at most one` vs `exactly one` membership clarification | **Unchanged** |
| §5.4.5 holding state, §5.4.4 obligations, §5.1 authority split, §5.3 drop order, §8 custody chain | **Retained**, with §5.4.4 gaining its explicit PASS/FAIL routing and §5.4.5 its additional entry conditions |

**No broad or deferred maintenance scope is introduced.** Revision 4 adds no infrastructure: PF-5
validates two values KIV-25 already owes, RM-VERIFY reuses the existing independent-reviewer
lane, and §2.6.2 replaces unsafe assertions with safe ones. §0.3's exclusion list is unchanged.

### 9.2.2 Revision 4 carry-forward — what Revision 5 did not implicate

The Revision 4 fixes are retained intact:

| Revision 4 fix | Revision 5 treatment |
|---|---|
| **R3-1** restoration termini L-10 … L-14 / Q-8 … Q-10, L-12 as the fourth authorized hold transition | **Untouched** — §7.5.1, §7.5.2, §7.5.4 and §7.5.5 are unchanged |
| **R3-2** per-group `RM-G-i` artifacts, `RM-MANIFEST`, per-artifact RM-VERIFY | **Untouched** — §5.4.2, §2.7 item 5 and HS-26/HS-28 are unchanged |
| **R3-3** ordered three-discriminant S-0 … S-4 partition | **Untouched** — §5.4.1 is unchanged |
| **R3-4** PF-5 named control + finite smoke bound, same-control rule, objective read-back after every hold transition, HS-30 | **Retained in full for Class B and not weakened.** Revision 5 changes only its *class applicability*: the implicitly both-class wording at §2.7 item 8 / §3.2 B-14 is now explicitly Class B-only — which is what PF-5's own heading already said. Every PF-5a condition, the PF-5b bound rule, every hold-transition read-back and the HS-30 trigger are unchanged |
| **R3-5** 11-trigger inventory, allow-list catalog assertions C-1 … C-4, version pinning | **Retained.** C-1 … C-4, their expected shapes and the §2.6.2 version assumptions are unchanged; §2.6.3 adds the before-state absence form beside them without altering any expected shape or their §7.1 after-state role |
| Cleanups 1–3 — IS-1/IS-2 as objective bracketing evidence, IS-2 unconditional at Q-5, §4.3 revert pointer to §7.5 | **Untouched** on the Class B path; the IS-1/IS-2 wording gains only its explicit Class B qualifier |

No Revision 5 change relaxes a Revision 4 constraint. Where Revision 5 changes applicability
(Class A), it removes an impossibility — an entry requirement to read a control that the
governing Class A authority chain can never name — rather than a safeguard, exactly as
Revision 3's §7.5 removed the live-branch impossibility. Revision 5 likewise adds no
infrastructure and no new scope: B-15 is one fixed evidence sentence, and §2.6.3 replaces
erroring casts with safe reads. §0.3's exclusion list is unchanged.

### 9.2.3 Revision 5 carry-forward — what Revision 6 did not implicate, and the Class B no-regression proof (R6-12)

**Change Class B is byte-identical.** Revision 6 edited **no** Change Class B rule. Specifically
unchanged, in full and in substance:

| Class B material | Revision 6 treatment |
|---|---|
| **§5.4** in its entirety — §5.4.1 the S-0 … S-4 state map, §5.4.1.1 … §5.4.1.4, §5.4.2 per-group skeletons / `RM-G-i` / `RM-MANIFEST` / RM-VERIFY, §5.4.3 bounds, §5.4.4 obligations, §5.4.5 holding state | **Byte-identical. Not edited.** |
| **§7.2** the six PF-R1 read-backs and the 1–5 vs 6 asymmetry; **§7.3** application recovery; **§7.3.1** the single closed deferral condition; **§7.5** in its entirety — §7.5.1, §7.5.2, §7.5.4, §7.5.5 | **Byte-identical. Not edited.** |
| **PF-5, PF-5a, PF-5b**, the same-control rule, the objective read-back after every hold transition, and the §2.5 *"Class applicability (R5-1)"* paragraph | **Byte-identical. Not edited.** |
| **IS-1 / IS-2**, capture line **B-14**, and §4.3 in its entirety | **Byte-identical. Not edited.** B-14 remains Class B-only and is explicitly never captured for A2 |
| **HS-7, HS-9, HS-25, HS-26, HS-27, HS-28, HS-29, HS-30** | **Byte-identical. Not edited.** |
| **§1** restoration-verifier role and RM-VERIFY separation; **§3.3** Class B additional requirement; **E-9**, **E-10** | **Byte-identical. Not edited.** §1 changes in three other places, none of which touches a Class B obligation: the G5 standing owner is **added** (§9.5); the **Founder** row and the **Independent reviewer** row each gain an **A2 clause alongside** their existing text, with `KIV-145 for Class B` left exactly as written and Class A1's KIV-159 references intact |
| **§2.7 item 5 Class B branch**, **item 3**, **item 8 Class B branch** | **Unchanged in substance.** Item 6 and item 8 gain an **A2 clause alongside** the Class B text, which is not modified; item 8's Class A wording becomes "Class A1 and Class A2" for the B-15 record |

**Class B sections changed by Revision 6: NONE.** The only places where Class B text appears
alongside new material are the §2.7 entry checklist and the §8.1 evidence table, where an **A2
clause was added beside** the Class B clause without altering it. No Class B obligation was
weakened, relaxed, reordered or removed.

**The Revision 5 fixes are retained intact.**

| Revision 5 fix | Revision 6 treatment |
|---|---|
| **R5-1** — Class A ingress applicability, PF-5/IS-1/IS-2/hold transitions explicitly Class B-only, fixed **B-15** record, §4.2 | **Retained and extended to A2 unchanged in substance.** B-15 now covers Class A1 and Class A2 identically; PF-5 and the hold transitions remain Class B-only. No Class B obligation altered |
| **R5-2** — §2.6.3 catalog-safe absence probes **A-1 … A-4**; C-1 … C-4 not run while the tables are absent; their §7.1 after-state role unchanged | **Retained for A1, unchanged.** Marked **not applicable to A2** with the reason stated (the A2 entry world is the mirror image), and given an A2 counterpart in §2.6.5 that follows the same catalog-safe design principle |
| **R5-3** — §5.3 byte-identical to Revision 4; PF-4a/PF-4b byte-identical; PF-4f intact; §5.2 unchanged in substance; every Class B rule intact | **Honoured in full.** **§5.3 is byte-identical in Revision 6** at full-section SHA-256 `4e9fa2e2855d378becffdae2fa261f59f952ab677a9af2a252aae0cc21aa3e2a`, so KIV-167's approved path is unchanged. **PF-4a and PF-4b are byte-identical.** PF-4f is unedited. §5.2's A1 content is unchanged and gains an A2 checklist beside it. Every Class B rule is byte-identical. The **only** deliberate departure is the openly reasoned, scope-limited supersession of PF-4a/PF-4b **for Change Class A2 only** (§2.5.1), which R5-3 could not have anticipated because the A2 change class did not exist |

**F-1 … F-7 remain closed. Revision 6 re-verified all seven.** F-6's byte identity holds — PF-4a
and PF-4b were **not edited**. PF-4f, its §7.1 pattern counterpart and the §5.3 no-wildcard-drop
prohibition are unchanged, and **§5.3 is byte-identical in full**. §2.6's membership statement and
§7.1's OBS-3 clarification are unchanged, and §2.6's EXECUTE cross-reference still reads §7.1. §2.1
still carries exactly one authority timestamp for the Revision-5 authorities, and Revision 6 adds
**no** authority fact — it records that the two A2 authorities **do not exist**. §7.3.1's deferral
condition is untouched.

**No Revision 6 change relaxes a Revision 5 constraint.** Where Revision 6 changes applicability
it removes an impossibility — an entry preflight that asserts the absence of exactly the objects
the change requires to be present — rather than a safeguard, exactly as Revision 5's R5-1 removed
the ingress circular dependency and Revision 3's §7.5 removed the live-branch impossibility.
Revision 6 adds **no** infrastructure and no new scope: §0.3's exclusion list is unchanged.

### 9.4 Complete Change Class A disposition inventory for `0109` (R6-1, A-OBS-3)

Auditor observation **A-OBS-3** established that Revision 5 is `0108`-scoped throughout — 44
mentions of `0108`, one of `0109` — so re-scoping only PF-3/HS-3 and PF-4a/PF-4b would leave the
rest of the Class A instantiation silently mis-scoped. **This table is the answer to that: every
Revision-5 Class A rule, with an explicit disposition for Change Class A2.** Nothing carries over
by assumption, and nothing is left undispositioned.

| Revision-5 Class A rule | Disposition for Change Class A2 | Where |
|---|---|---|
| **§2.1** Change Class A definition, nature, authority (KIV-159) | **Superseded by the A1/A2 split.** A2 is a different change with a different nature (one `CREATE OR REPLACE FUNCTION`, not additive DDL) and **no** forward authority — KIV-159 is `0108`-specific, consumed and spent | §2.1 |
| **§2.2** PF-1 target identity `zlighrbsjexrozrmuwpw` | **Retained unchanged.** Same target, same HS-1 | §2.2 |
| **§2.3** PF-2 source pin to `0108` / custody commit `d5b4b1dd…` | **Retained as historical for A1**, and retained as the *baseline the A2 change repairs*. A2 pins a different artifact via **PF-2.A2** | §2.3 |
| **§2.4** PF-3 runner, naming `0108_kiv13_m1_additive_scope1.sql` | **Superseded for A2 by PF-3.A2**, which names the exact `0109` file. PF-3 as written is `0108`-specific and does **not** textually bind an A2 run. **HS-3 applies to both** | §2.4 |
| **§2.5** PF-4a — role must not pre-exist | **Superseded for A2 by PF-4a2** (correctly polarised). **Byte-identical and still authoritative for A1** | §2.5.1 |
| **§2.5** PF-4b — no standing membership | **Superseded for A2 by PF-4b2** (correctly polarised, exact permitted topology, drift rejected). **Byte-identical and still authoritative for A1.** Its query text is still run for A2 as an evidence detail listing | §2.5.1 |
| **§2.5** PF-4a/PF-4b **byte-identity rule** (R5-3, HS-2) | **Consciously superseded for Change Class A2 only**, with the reason stated. Unchanged for A1 | §2.5.1 |
| **§2.5** PF-4c — `PUBLIC` has no `CREATE` on `public` | **Retained unchanged for A2.** HS-5 applies; `0109` asserts it too | §2.5.1 |
| **§2.5** PF-4d — `0107` dependency present | **Not applicable to A2.** `0109` has no `0107` dependency and makes no such header check. **Deliberately not run** — recording it would assert the wrong thing | §2.5.1 |
| **§2.5** PF-4e | **Not applicable** — Class B only, unchanged | §2.5 |
| **§2.5** PF-4f — zero pre-existing wildcard matches | **Retained and re-polarised for A2: exactly 21 correctly-owned rows**, using the §7.1 pattern-closure form as a preflight. HS-24's zero-row polarity is **A1 only** | §2.5.1, §6 |
| **§2.5** PF-5 / PF-5a / PF-5b, same-control rule, hold read-backs | **Not applicable** — Class B only, byte-identical | §2.5 |
| **§2.5** — *(new for A2)* | **PF-4g / G1 … G3** live `auth.uid()` semantic guard, fail-closed, read-only, same target and window | §2.5.1 |
| **§2.6** Class A affected boundary — role, 3 tables, 41 constraints, 9 indexes, 11 triggers, type, 21 functions, 15 policies, 8 A1 columns, grants, MIV writes | **Not applicable to A2 as a boundary** — A2 creates none of it. **Retained as the state A2 asserts against.** A2's complete boundary is **one function body** | §2.6, §2.6.4 |
| **§2.6** expected membership state at success | **Retained as the exact topology PF-4b2 asserts and §5.7/§5.8 protect** | §2.5.1 |
| **§2.6** *"Plus, if the runner records it: exactly one migration-ledger row for `0108`"* | **Not applicable to A2**, and its ambiguity is resolved for A2: exact `0109` writes **no** ledger row and its absence is **not** failure | §7.1.1 |
| **§2.6** Class A explicit prohibitions (revoke nothing, re-own nothing, no RLS change, no pre-existing row write) | **Retained and tightened for A2** — A2's prohibition list is strictly narrower still | §2.6.4 |
| **§2.6.1** constraint / index named inventory | **Retained.** A2 creates none of it; the inventory is the reference the **P-1** presence probe and §7.1.1's no-drift assertion rest on | §2.6.1 |
| **§2.6.2** C-1 … C-4 filtered catalog assertions and the version-robustness rule | **Retained, and not run by A2** — A2 changes no table, constraint, trigger or index, so there is nothing for them to assert about this change. Their §7.1 after-state authority for A1 is unchanged. **A2 inherits the design rule**: never a raw total, always allow-listed, always record the server version | §2.6.2, §2.6.5 |
| **§2.6.3** A-1 … A-4 absence probes | **NOT APPLICABLE to A2** — they assert the `0108` objects are absent, which is the exact opposite of the A2 entry world. Replaced for A2 by **§2.6.5 P-1 … P-8** | §2.6.3, §2.6.5 |
| **§2.7** entry checklist items 1 … 8 | **Extended for A2**, with items 1, 2, 5 and 6 carrying explicit A2 clauses and a new **item 9** (G4). Item 3 and every Class B branch are unchanged | §2.7 |
| **§3.1** capture rules — parity, non-disclosure, append-only, timestamps, HS-8 | **Retained unchanged for A2** | §3.1 |
| **§3.2** B-1 … B-8, B-10, B-11, B-13 | **Retained unchanged for A2** | §3.2 |
| **§3.2** B-2 source fingerprints | **Extended for A2** to recompute the PF-2.A2 `0109` identities as well as `0108`'s | §3.2 |
| **§3.2** B-9 before-state existence check | **A2 form: the §2.6.5 presence probes P-1 … P-8.** Never A-1 … A-4 | §3.2, §2.6.5 |
| **§3.2** B-12 ledger capture | **Retained for A2 as truthful evidence with no pass/fail expectation** | §3.2, §7.1.1 |
| **§3.2** B-14 (IS-1) | **Never captured for A2** — Class B only, unchanged | §3.2 |
| **§3.2** B-15 fixed ingress-applicability record | **Retained and applies to A2 identically** | §3.2, §4.2 |
| **§3.2** — *(new for A2)* | **B-16** presence-probe before-state; **B-17** G4 immediate-pre-forward re-capture | §3.2 |
| **§4.1 / §4.2** necessity test; no block, no drain; fail-fast `lock_timeout` / `statement_timeout`; low-traffic window | **Retained for A2, with the same conclusion for different reasons.** A2 takes no `ACCESS EXCLUSIVE` table lock — it performs no `ALTER TABLE` — and there is no working live member path to protect, since every authenticated member entry point already fails `42501` | §4.2 |
| **§5.1** authority split; reversal must pre-exist and be reviewed | **Retained and extended** with the two A2 rows, and with the explicit statement that **KIV-167 confers nothing for A2** | §5.1 |
| **§5.2** R-A transactional rollback — do not retry, do not repair, capture verbatim, report, HS-14 | **Retained unchanged for A2.** The **residue checklist** is `0108`-object-specific and is therefore **A1 only**; A2 has its own checklist asserting function body and membership topology | §5.2 |
| **§5.3** R-B post-commit reversal (`0108` teardown), KIV-167-approved | **NOT APPLICABLE to A2, and forbidden for it (HS-36).** It would **drop** the function `0109` repairs. **Byte-identical, so KIV-167's A1 authority is preserved exactly and not widened.** A2's path is **§5.7** | §5.1, §5.3, §5.7 |
| **§5.4** Class B bounded restoration | **Not applicable** — Class B only, byte-identical | §5.4 |
| **§5.4.1.4** *"Class A has no equivalent"* (no partial-commit states, because the file is one transaction) | **Retained and true for A2 for the same reason** — PF-3.A2 makes A2 one whole-file transaction | §5.4.1.4 |
| **§5.5** reversal is not recovery of downstream effects | **Retained and applies to A2**, with the sharper A2 statement that reversal returns to a **known degraded state**, not to health | §5.5, §5.7 |
| **§5.6** explicitly-not-rollback-mechanisms list | **Retained unchanged**, with a clarification distinguishing *in-window invented SQL* (forbidden, always) from the separately governed exact `0109` | §5.6 |
| **§6** HS-1, HS-2, HS-3, HS-5, HS-8, HS-10, HS-12, HS-13, HS-14, HS-15, HS-19, HS-20, HS-21, HS-22, HS-23 | **Retained and apply to A2 unchanged** | §6 |
| **§6** HS-4, HS-6, HS-11, HS-24 | **A1 polarity — must not be applied to A2**, with A2 counterparts named (HS-31, HS-32) | §6 |
| **§6** HS-7, HS-9, HS-16, HS-17, HS-18, HS-25 … HS-30 | **Class B or A1-reversal conditions — unchanged and not applicable to A2** | §6 |
| **§6** — *(new for A2)* | **HS-31 … HS-40** | §6 |
| **§7.1** Class A after-state read-backs (role, membership, tables, C-1 … C-4, policies, functions, pattern closure, A1 columns, MIV, baselines, ledger, baseline consequence) | **A1 only.** A2 has its own contract, which asserts *no change* to almost everything §7.1 asserts *creation* of | §7.1, §7.1.1 |
| **§7.1** *"Ledger: exactly one new row, for `0108`, and no other"* | **Not applicable to A2** and explicitly resolved: no `0109` row is written and its absence is not failure | §7.1.1 |
| **§7.3** item 1 — revert every block, verified | **Retained and trivially satisfied for A2** — no block is engaged, exactly as for A1 | §7.3 |
| **§7.4** independent verification, no executor self-acceptance | **Retained and strengthened for A2**: separate independent post-remediation verification is mandatory before KIV-14 acceptance or KIV-25 start, and executor evidence can never self-close KIV-14 | §7.4 |
| **§7.5** Class B sequences | **Not applicable** — Class B only, byte-identical | §7.5 |
| **§8.1** E-1 … E-11, §8.2 custody rules | **Retained unchanged for A2.** E-6 covers A1 and A2 identically; **E-12** is added for A2 | §8.1 |
| **§9.3** non-authority | **Retained and updated to the true current state** | §9.3 |

### 9.5 G5 — the standing post-`0109` `auth.uid()` drift obligation (R6-5)

This section exists because **G5 is the only obligation in this document that outlives the
maintenance window.**

**The obligation.** Before `0109`, `public.kv_control_assert_actor(uuid,text,boolean)` resolved the
request subject by **calling** `auth.uid()`, so any vendor change to that function propagated into
the governed resolver automatically. **After `0109` it does not call it at all.** The equivalent
expression is inlined. Vendor changes to `auth.uid()` therefore **stop propagating — permanently**.
That is not a defect of `0109`; it is the necessary consequence of removing a dependency on a schema
the governed owner cannot reach. But it means the equivalence proved at PF-4g/G1 … G4 is a **point-
in-time** fact, and someone must own re-establishing it.

**The named standing owner is the durable Kivo PM role** (§1). A role rather than an individual,
because an individual decays out of the programme and the obligation does not.

**Re-check triggers — any one of these fires a fresh semantic re-check:**

1. **any Supabase or Auth platform upgrade** affecting the target project;
2. **any migration or vendor change affecting `auth.uid()`**, whether ours or Supabase's;
3. **any observed change to the live `auth.uid()` definition**, however noticed;
4. **any future release that relies on this identity path** — including, but not limited to, KIV-25
   and any later control-plane work.

**What a re-check is.** Exactly the read-only **G1 / G3** capture and the **G2** semantic
determination against the accepted V4 two-GUC COALESCE behaviour (§2.5.1). It requires no
production mutation, no `auth`-schema privilege and no maintenance window — it is a `pg_catalog`
read and a reasoned comparison.

**What a divergence means.** A live definition whose semantics are no longer V4-equivalent means the
inlined expression in `public.kv_control_assert_actor(...)` and the vendor's own resolver have
**diverged**, so authenticated subjects may resolve differently through the two paths. That is a
**finding for PM/Founder adjudication and a new governed change**, never an in-window adaptation,
and **never** a reason to edit the applied function outside a full source chain. Record it, report
it, and stop.

### 9.3 Non-authority

This document authorizes nothing. It does not authorize production or Supabase access, SQL or
migration execution, source or runtime change, deployment, Meta/account action, restaurant
action, Khalid-project action, or alpha/Pilot GO.

**Revision 6 additionally authorizes none of:** any PR, merge, rebase, cherry-pick or integration
of the exact `0109` artifact; any application of `0109` to any database; any use of §5.7; any
migration-ledger mutation; any repair of the missing `auth`-schema grant; any retry of `0108`; any
KIV-25 work; or any Meta/WhatsApp/order/restaurant/M2 action. **It is a procedure candidate and an
evidence gate, and it is not yet even accepted as that** (§0.4).

**Current true production state (R6-2), superseding the Revision-5 statement above.** Release 4
committed exact `0108`, and **KIV-165 returned BLOCK**, so that state is **committed but not
accepted** and supports no downstream reliance. **The authenticated member-control runtime is
broken**, failing closed with `42501` at every authenticated member entry point (KIV-173). Exact
`0109` is **terminally source-cleared but not integrated, not merged and not applied**. **No
`0108` migration-ledger row exists.** `public.members` `N` is whatever a contemporaneous read
returns and is **never assumed** — the historical `N = 20` figure is evidence from an earlier
window, not an execution invariant. **KIV-14 remains blocked and not accepted; KIV-25 remains
blocked and not authorized; Release 4 is consumed; Pilot/alpha remains NO-GO.**
