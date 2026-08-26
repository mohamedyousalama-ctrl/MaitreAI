# Database ↔ repository divergence — reconciliation record

**Date:** 2026-08-26 · **Project:** `zlighrbsjexrozrmuwpw` · **Repo `main`:** `14ace390`

Read this before writing any migration or touching the control plane.

## The finding

The production database and this repository had diverged **in both directions**.
Neither was simply "behind" the other, which is why the state was hard to reason
about and why a defect survived in the console for weeks.

### Live in production, absent from the repository

| Object | Origin | Ledger row |
|---|---|---|
| 21 functions: `kv_control_*`, `kv_sys_control_*`, `kv_tg_*` | migration `0108`, in **open PR #571** | none until `0112` |
| type `kv_control_result` | `0108` | — |
| tables `control_operations`, `member_identity_versions` | `0108` | — |
| role `kivo_control_owner` | `0108` | — |
| table `tenant_data_class` | unknown — no repo migration defines it | `20260825132220` |

### In the repository, never applied to production

| Migration | Effect | Status |
|---|---|---|
| `0076_printer_config.sql` | `restaurants.printer_config` | backfilled by `0110` |
| `0077_voice_budget.sql` | 3 voice-budget columns on `conversations` | backfilled by `0110` |

`0076` would have caused an **outage** if applied as written — see `0110`'s header.

### Removed from production, still called by application code

`0108` dropped the `control_*` family that `0099` created. Five call sites in
`lib/console/conversation-control.ts` still named them. One — `claimConversation` —
had production callers, so **staff takeover returned 502**. Fixed in `3993845`;
the other four wrappers are documented as unported in that module's header.

## Why it happened

There is no migration runner in this project. Repository labels (`0001`–`0112`)
and Supabase's ledger versions (14-digit) are independent namespaces, and
`DEPLOYMENT.md` already warned they do not correspond. Nothing enforced that a
migration in the repo was applied, or that an applied migration existed in the repo.

## What is now true

- Every change made on 2026-08-26 (`0109`–`0112`) exists in **both** the ledger
  and this directory.
- `0108` has a ledger row recording that it is applied and where its source lives.

## The one thing still open

**`0108`'s SQL is not in the repository.** It is in PR #571, which is open and has
no human approval. Until that merges, anyone reading this repo cannot see the
definition of the control plane their code must call.

Merging #571 carries no runtime risk — its migrations are already live — but it
is a branch decision, not a technical one, and is left to the owner.

## Rule going forward

A schema change is not done when it runs. It is done when it is **in the ledger
and in this directory**. If those two disagree, the database wins as fact and the
repository must be corrected to match.
