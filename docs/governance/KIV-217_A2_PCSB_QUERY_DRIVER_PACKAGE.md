# KIV-217 A2 PCSB query/driver package — KIV-224 package-commit binding operator contract

**Context:** `KIVO-A2-RECOVERY-PACKAGE-COMMIT-BUILDER-224`  
**Package id:** `KIV-217-A2-PCSB-QUERY-DRIVER-PACKAGE`  
**Package version:** `0.1.3-kiv224-package-commit-binding-candidate`  
**KIV-221 blocked parent (capture-binding candidate, not hash-pinned):** commit `886fbf580a1f51c5e1354459919d21d7477e4968`  
**KIV-220 accepted parent (unchanged SQL / hash-of-hashes):** commit `8cc7331aa19eb90f3cf5c7625e074ccd5c134638`  
**KIV-217 published custody (unchanged grandparent object):** branch `claude/kiv-217-a2-pcsb-query-driver-package` commit `37836b0b3ec22c7d8190aa39168f21641c0067ff`

**This document is the operator contract for the no-production candidate package plus the KIV-221 authorization-bound capture invocation seam as remediated by KIV-224 fail-closed package-commit identity.** It is not KIV-14 acceptance, not PCSB-3 capture authority, not KIV-224 governance authority, and not §7 fixture evidence.

## Capture-binding seam (KIV-221 + KIV-224)

Default behavior remains fail-closed and no-production:

* `PersistentCaptureSession.connect()` without a `CaptureAuthority` still calls `assert_not_production_target`.
* `allow_remote=True` remains an unconditional refusal.
* `python -m kiv14_pcsb capture` remains **hard-refused** (exit 2).

The reviewed production-capable path is **disabled until** a later separately released Linear work order supplies **all** of:

1. a JSON `CaptureAuthority` document (non-secret fields only);
2. matching explicit CLI invocation bindings (`--work-order`, `--pcsb`, `--evidence-dir`);
3. a runtime-only `--conninfo-file` whose non-secret identity matches `authorized_target`.

Required authority bindings: work-order id, `PCSB-n` identity (not PCSB-1/2), this package id, exact package commit, live `package_manifest.json` SHA-256, live statement hash-of-hashes, authorized target non-secret identity, evidence directory, and the exact governance disclaimer that **possession of runtime parameters does not create Linear/PM authority**.

Package Git identity is **fail-closed before authentication**:

* repository discovery walks from the package directory until it finds a `.git` directory or a `.git` worktree file — it does not use a fixed ancestor index;
* exact current `HEAD` must resolve to a 40-character lowercase commit SHA;
* that SHA must equal `CaptureAuthority.package_commit`;
* missing/exported/unprovable repository identity, Git executable/invocation failure, timeout, malformed/unavailable HEAD, or a zero-SHA sentinel is a pre-auth refusal;
* detached HEAD may pass only when that exact SHA is proved and matches;
* manifest SHA / hash-of-hashes remain independent additional bindings, not substitutes for commit identity;
* a wrong or unavailable package commit never reaches `reviewed_psycopg_connect`.

This package does **not** encode KIV-224 as capture/governance authority. Only a later separately released Linear capture work order creates capture authority.

Target authorization is checked **before** `reviewed_psycopg_connect` and without SQL. Mismatched/missing/malformed authority refuses before authentication. Direct `db.<ref>.supabase.co` and transaction-mode port `6543` cannot be authorized. There is no environment-only switch, monkey-patch, or `allow_remote` bypass.

`AuthorizedCaptureRunner` is single-shot: no retry parameter, no reconnect, no second `connect`, no same-runner restart. It reuses `PersistentCaptureSession` + the unchanged statement sequence through PS-TIME end.

This Builder gate does **not** invoke the authorized path against production.

## Governing pins (recomputed at package prep)

| Item | Value |
| --- | --- |
| Operative procedure commit | `d5d223068e8033c7c72e65ba9b26154264b5c764` |
| Path | `docs/governance/KIV-14_A2_ACCEPTANCE_RECOVERY_PROCEDURE.md` |
| Git blob | `27a85182bc8acb79c525daec03d4aa3a262fcc51` |
| SHA-256 | `48864cbcefb62b13bb61296933d655dffbf171ca10dad1b7dbb91342bff5cd8a` |
| Revision-6 blob (must not change) | `c16f2bdc84173faefb98a065b02f9fe3b5e24d2a` |
| Exact `0109` source blob (must not change) | `8923ed066d21a5cbac5f6ffc47606aee9b5c9c07` |
| Statement hash-of-hashes (must not change from KIV-220) | `6aa459bc0b31e13f6ff62cdc1aa51c73ca481da30db8928d0d303c4377d5f845` |

This package **does not edit** those protected bytes or any statement SQL.

## What this package is

A complete PCSB query/driver candidate required by operative procedure §§5.2, 5.8, 5.9 **before any future production authentication**.

It may be used later by a **separately authorized** capturer only after:

1. KIV-220 independent PASS / PM hash-pin of exact parent `8cc7331…` (already recorded);
2. independent reviewer PASS / hash-pin of this KIV-224 successor package-commit binding;
3. a later, separately governed PCSB-n capture work order that supplies matching `CaptureAuthority`.

Until then: **zero** production/Supabase authentication and **zero** production SQL.

## Driver identity (P1)

| Field | Pin |
| --- | --- |
| Runtime | Python 3.13.x (3.11+ required) |
| Package | `psycopg[binary]==3.2.9` |
| Backend PID method | `psycopg.Connection.info.backend_pid` → libpq `PQbackendPID` (BackendKeyData). **No SQL.** |
| Connect flags | `autocommit=True`, `prepare_threshold=None`, `client_encoding=UTF8` in conninfo / startup packet |
| Ineligible sole driver | raw interactive `psql` |

The bundled libpq in `psycopg[binary]==3.2.9` reports `170005` (17.5) while talking to server **17.6**. That is recorded; it is not a reason to emit helper SQL before P-0.

Server version on the capture connection is read from `Connection.info.parameter_status("server_version")` (startup ParameterStatus), **not** `SHOW` / `SELECT version()`.

## Capture contract (P2)

Implemented by `PersistentCaptureSession`:

1. One persistent connection object.
2. Record backend PID from client metadata **before** any SQL.
3. **P-0 is the first SQL.** No `SELECT 1`, `SHOW`, `SET`, timeout GUC, or helper identity SQL precedes it.
4. Host process inspects the P-0 row in process (`evaluate_p0_row`). PASS = all `_present` true, all `_select` true, all `_rls_active` false, exactly one row.
5. Only observed PASS allows later SQL on that same object.
6. Disconnect, reconnect, PID drift, or direct `Connection.execute` / `cursor.execute` is fail-closed.
7. No psql `\if`, shell gate, second invocation, or retry.

`python -m kiv14_pcsb capture` is **hard-refused** in this package. The reviewed seam is `python -m kiv14_pcsb authorized-capture` and still refuses unless every authority/invocation/target/package pin matches.

## Statement sequence (P3)

Exact order is `kiv14_pcsb.statements.STATEMENTS` / `package_manifest.json`:

P-0 → PS-TIME-START → P-1 … P-8a → P-8b/P-8c (host-side skip when ledger is not readable; **not** psql `\if`) → PF-4a2 → PF-4b2 → PF-4b-detail → PF-4c → PF-4-USAGE → PF-4-SET-ROLE (expected SQLSTATE `42501`; success is fail-closed) → G1 → G2 (host V4 coalesce semantics vs `G1.prosrc`) → G3 (host: `uid_rows==1` and empty `arg_list`) → PS-GRANT-TABLE / COLUMN / FUNCTION → PS-OWN → PS-ROLE → PS-COUNT → PS-BODY → PS-TIME-END (reconcile `sql_backend_pid` with pre-P-0 `PQbackendPID`).

KIV-208 close: composed `PS-GRANT-FUNCTION` selects `p.oid::pg_catalog.regprocedure::text as function_signature` **and** `ORDER BY function_signature, …`. Static validation rejects `ORDER BY` names that are not a select-list alias, a positional index, or a proved `table.column`.

Shipped SQL is extracted byte-identical from Revision-6 fences. Composed SQL lives under `tools/governance/kiv14_acceptance_recovery/statements/composed/`.

### Non-shipped classification (§5.9)

**Class A (built-in / catalog-only):** `PS-TIME-START`, `PS-TIME-END`.

**Class B (Kivo / Supabase-dependent):** `PF-4-USAGE`, `PF-4-SET-ROLE`, `PS-GRANT-TABLE`, `PS-GRANT-COLUMN`, `PS-GRANT-FUNCTION`, `PS-OWN`, `PS-ROLE`, `PS-COUNT`, `PS-BODY`.

Revision-6 shipped forms are pinned by Revision-6 identity. They are sequenced and hashed here; they are not re-invented. G2/G3 are host-side determinations, not dispatched SQL.

## Evidence writer (P4)

`python -m kiv14_pcsb manifest` writes deterministic `package_manifest.json` (sorted keys, no live timestamps). `hash_of_hashes` is SHA-256 of newline-joined `{id} {query_sha256|NO-SQL}` in capture order.

Live preflight outputs may include timestamps/PIDs and are labeled **tooling validation only**. Evidence tooling does not write `supabase_migrations.schema_migrations` and does not mutate production.

## Local commands

From `tools/governance/kiv14_acceptance_recovery/`:

```text
PYTHONPATH=. python -m kiv14_pcsb selftest
PYTHONPATH=. python -m kiv14_pcsb manifest
PYTHONPATH=. python -m kiv14_pcsb preflight
PYTHONPATH=. python -m kiv14_pcsb capture   # always exit 2 / REFUSED
PYTHONPATH=. python -m kiv14_pcsb authorized-capture \
  --authority FILE --work-order KIV-n --pcsb PCSB-n \
  --conninfo-file FILE --evidence-dir DIR
# authorized-capture still refuses unless a later Linear work order supplies
# matching non-secret authority. KIV-224 does not invoke it against production.
```

Disposable PostgreSQL **17.6** is expected at `$KIVO_KIV218_PG176_PREFIX` or `/tmp/kivo-kiv218-supabase-pg176/work-prefix`, which must be the official `supabase-postgres-v17.6.1.150-cli-darwin-arm64` extract (SHA-256 `e8586bfa2ba41fba390378ff2183e1bf3781208d7ff31223859a8331888c7ec6`, tag commit `a97b439c4a9033f9d40080623a688ddcda2961ff`). Clusters listen on `127.0.0.1` only. Never mix Homebrew/system PostgreSQL into the Class B cluster.

Exact source pins: `tools/governance/kiv14_acceptance_recovery/topology/SOURCE_PIN.json`.

## Preflight (P5–P7)

Class A and Class B preflight is **tooling/query validation only**. It is not §7 F-MIV / F-KIND / FX evidence and not production evidence.

**Class A:** clean disposable 17.6, no Kivo/Supabase objects created. (1) Capture-contract session: P-0 first, expected FAIL/SQL error on absent tables, later SQL blocked. (2) Separate tooling connection labeled `class_a_tooling_validation_not_capture` executes only Class A SQL and checks output columns. That second connection is **not** a PCSB capture.

**Class B:** official Supabase CLI 17.6 platform baseline (prerequisite presentation only) **then** method 1 — apply the accepted integration merge tree `585d340c6b7ec28618b22c6fec49fd271aa47813` (parents `d5b4b1dd…` then `cc74e14c…`) in filename order via `psql` as **bootstrap** (`supabase_admin`), never as the capture driver. Exact `0108` blob `7b500626331dd4eaf4620d29c95953740f6e5541` and exact `0109` blob `8923ed066d21a5cbac5f6ffc47606aee9b5c9c07` are recomputed from that tree before apply. `0108`/`0109` are applied with `psql --single-transaction` as those files require; `0059` is not transaction-wrapped because it uses `CREATE INDEX CONCURRENTLY`. Class B query validation then uses the demoted official `postgres` role so `PF-4-SET-ROLE` is the expected `42501` denial.

The CLI tarball already ships `pgcrypto` and the official `migrate.sh` / init-scripts that create `auth`, `auth.users`, platform roles, `auth.uid()`, and request-GUC helpers (`current_setting('request.jwt.claim.sub', true)`). `pgmq` is omitted from the CLI variant receipt; the same `supabase/postgres` pin's `nix/ext/pgmq` installs SQL-only `pgmq` 1.5.1 from `tembo-io/pgmq` `7fd411d8…`. Those exact control/SQL bytes are vendored under `topology/pgmq/` and copied into the prefix if missing. That is source-derived platform presentation, not Kivo DDL invention and not a third bootstrap. On darwin, official `libiconv.dylib` may need an adhoc `codesign --force --sign -` repair when AMFI rejects the tarball signature; that is host codesign repair, not SQL invention.

Bare PostgreSQL (no official CLI `migrate.sh`) still HOLDs on `auth.users` / missing platform objects. Homebrew/other PG builds are not mixed in.

No third Kivo bootstrap recipe. No dump shortcut. No ad-hoc DDL.

## Safety (P9)

Default conninfo is loopback only. Without a matching `CaptureAuthority`, the package refuses `supabase.co` / pooler hosts, project ref `zlighrbsjexrozrmuwpw`, any non-loopback host, and `allow_remote=True`. There is no production DSN, password, token, or `.pgpass` in this package. KIV-198/199 credentials must not be inspected or reused.

The authorized seam compares non-secret conninfo identity to `authorized_target` **before** connection creation. Secrets must not appear in the authority JSON or in written evidence.

## Terminal law

KIV-224 completion does **not** authorize PCSB-3. Leave KIV-224 In Progress for PM intake. Do not self-review. Do not create the independent reviewer issue from this gate.

READY line: `A2 ACCEPTANCE-RECOVERY PACKAGE-COMMIT BINDING REMEDIATION READY FOR INDEPENDENT REVIEW`  
HOLD line: `A2 ACCEPTANCE-RECOVERY PACKAGE-COMMIT BINDING REMEDIATION HOLD`
