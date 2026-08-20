# KIV-217 A2 PCSB query/driver package — candidate manifest / operator contract

**Context:** `KIVO-A2-RECOVERY-PACKAGE-BUILDER-217`  
**Package id:** `KIV-217-A2-PCSB-QUERY-DRIVER-PACKAGE`  
**This document is the operator contract for the no-production candidate package.** It is not KIV-14 acceptance, not PCSB-3 capture authority, and not §7 fixture evidence.

## Governing pins (recomputed at package prep)

| Item | Value |
| --- | --- |
| Operative procedure commit | `d5d223068e8033c7c72e65ba9b26154264b5c764` |
| Path | `docs/governance/KIV-14_A2_ACCEPTANCE_RECOVERY_PROCEDURE.md` |
| Git blob | `27a85182bc8acb79c525daec03d4aa3a262fcc51` |
| SHA-256 | `48864cbcefb62b13bb61296933d655dffbf171ca10dad1b7dbb91342bff5cd8a` |
| Revision-6 blob (must not change) | `c16f2bdc84173faefb98a065b02f9fe3b5e24d2a` |
| Exact `0109` source blob (must not change) | `8923ed066d21a5cbac5f6ffc47606aee9b5c9c07` |

This package **does not edit** those protected bytes.

## What this package is

A complete PCSB query/driver candidate required by operative procedure §§5.2, 5.8, 5.9 **before any future production authentication**.

It may be used later by a **separately authorized** capturer only after:

1. PM terminal intake of KIV-217;
2. independent reviewer PASS / hash-pin of the **unchanged** package;
3. a later, separately governed PCSB-3 capture work order.

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

`python -m kiv14_pcsb capture` is **hard-refused** in this package.

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
```

Disposable PostgreSQL **17.6** is expected at `$KIVO_KIV217_PG176_PREFIX` or `/tmp/kivo-kiv217-pg176/prefix` (`postgres (PostgreSQL) 17.6`). Clusters listen on `127.0.0.1` only.

## Preflight (P5–P7)

Class A and Class B preflight is **tooling/query validation only**. It is not §7 F-MIV / F-KIND / FX evidence and not production evidence.

**Class A:** clean disposable 17.6, no Kivo/Supabase objects created. (1) Capture-contract session: P-0 first, expected FAIL/SQL error on absent tables, later SQL blocked. (2) Separate tooling connection labeled `class_a_tooling_validation_not_capture` executes only Class A SQL and checks output columns. That second connection is **not** a PCSB capture.

**Class B:** method 1 only — apply the accepted integration merge tree `585d340c6b7ec28618b22c6fec49fd271aa47813` (parents `d5b4b1dd…` then `cc74e14c…`) in filename order via `psql` as **bootstrap**, never as the capture driver. Exact `0108` blob `7b500626331dd4eaf4620d29c95953740f6e5541` and exact `0109` blob `8923ed066d21a5cbac5f6ffc47606aee9b5c9c07` are recomputed from that tree before apply.

`0001_init.sql` both (1) `CREATE EXTENSION pgcrypto` and (2) references `auth.users(id)`. This disposable 17.6 prefix does not ship pgcrypto contrib (openssl headers were not present to build it from the same tarball), and bare PostgreSQL does not provide Supabase `auth`. Inventing `pgcrypto`, `auth.users`, request-GUCs, or platform roles is forbidden (§5.9 / AR-HS-25). Method-1 apply therefore fails closed. The package **does not validate Class B queries** and remains **HOLD** for Class B topology. Class B SQL is still fully packaged for independent review.

No third bootstrap recipe. No dump shortcut. No ad-hoc DDL.

## Safety (P9)

Default conninfo is loopback only. The package refuses `supabase.co` / pooler hosts, project ref `zlighrbsjexrozrmuwpw`, and any non-loopback host. There is no production DSN, password, token, or `.pgpass` in this package. KIV-198/199 credentials must not be inspected or reused.

## Terminal law

KIV-217 completion does **not** authorize PCSB-3. Leave KIV-217 In Progress for PM intake. Do not self-review. Do not create the independent reviewer issue from this gate.
