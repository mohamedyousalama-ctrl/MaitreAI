# 0104_safety_ingress_evidence — application record

**This migration is ALREADY APPLIED to production. Do not apply it again.**

This file exists because the migration was applied to the production database
before its source landed on `main`. The accompanying `.sql` file is a
source-of-truth reconciliation: it records what already ran. It is not a
pending change.

## Production facts

| Field | Value |
| --- | --- |
| Production migration version | `20260724034339` |
| Production migration name | `0104_safety_ingress_evidence` |
| Approved file SHA-256 | `560e060351c793990daa8f61bbdad95e998d508977e1610478881d7582c38b80` |
| Application status | Applied. Must not be applied again. |

## Frozen source status

The SQL header still says `PREPARE-ONLY`. That wording predates the production
application and is superseded by the production ledger entry
`20260724034339 / 0104_safety_ingress_evidence`.

Do not correct the SQL header. The applied source is byte-frozen to SHA-256
`560e060351c793990daa8f61bbdad95e998d508977e1610478881d7582c38b80`;
editing even that stale wording would destroy the approved byte identity.

## Byte verification

The live database cannot prove the original file bytes — it stores parsed
objects, not the text that produced them. The bytes are therefore established
by the approved SHA-256 above, which is the sole authority for file integrity.

Verify before relying on this file:

```
sha256sum supabase/migrations/0104_safety_ingress_evidence.sql
# must equal 560e060351c793990daa8f61bbdad95e998d508977e1610478881d7582c38b80
```

If the hash does not match, this file is not the artefact that was applied.
Stop and escalate.

## Why reapplication is not a harmless no-op

The committed SQL contains schema-mutating operations whose exact line ranges
are:

- `ingress_safety_scans_event_fk`: lines 163–164 drop the constraint and lines
  166–170 add it again. The add does not use `NOT VALID`, so PostgreSQL
  revalidates existing rows while recreating the constraint.
- `ingress_safety_scans_monotonic`: lines 259–262 drop and recreate the trigger.
- `ingress_safety_evidence_immutable`: lines 276–279 drop and recreate the
  trigger.
- `ingress_safety_evidence_parent_guard`: lines 314–317 drop and recreate the
  trigger.
- Schema-reload notification: line 995 runs
  `notify pgrst, 'reload schema';`.

Rerunning the file would therefore drop and recreate a foreign key, revalidate
the table, replace three triggers and request a PostgREST schema reload. Even
if the final object definitions appeared unchanged, those operations are real
DDL and must not be replayed.

## Object correspondence

Separately from the byte check, every object the `.sql` declares was verified
against the live production database. This establishes that the file describes
the applied schema; it does not establish the file's bytes.

Constraints, indexes and row-level security:

- `webhook_envelopes_payload_idempotency_key` — UNIQUE (tenant_id, provider, payload_hash)
- `channel_events_source_event_fk` — FK (tenant_id, source_channel_event_id) → channel_events ON DELETE RESTRICT
- `channel_events_source_not_self_check`
- `channel_events_source_event_idx` — partial index WHERE source_channel_event_id IS NOT NULL
- `ingress_safety_scans_outcome_check` — pending | completed_signal | completed_no_signal | failed
- `ingress_safety_scans_error_category_check`
- `ingress_safety_scans_result_fingerprint_check`
- `ingress_safety_scans_event_fk` — ON DELETE RESTRICT
- `ingress_safety_evidence_scan_idx`
- `public.ingress_safety_evidence` — RLS enabled and FORCED, with no read policy

Function bodies — each compared to `pg_proc.prosrc` by MD5 and byte length,
all matching exactly:

| Function | Body MD5 | Bytes |
| --- | --- | --- |
| `enforce_ingress_safety_scan_transition` | `c6632f9173fb049d83cc44895c74bf08` | 776 |
| `reject_ingress_safety_evidence_mutation` | `f8936abaead8a8d0dcf3ee721a3de454` | 98 |
| `guard_ingress_safety_evidence_insert` | `4c27b2fa03577dc79cababccb970cfd8` | 650 |
| `brain_record_webhook_envelope` | `9ca1f97550c8498d8fe5327f791598d9` | 1192 |
| `brain_record_channel_event` | `a2adcf4a4bc0a5d79b96183378dfc53c` | 3676 |
| `brain_complete_ingress_safety_scan` | `c458c076252d44fe73157c31b5ead2dc` | 7873 |
| `brain_fail_ingress_safety_scan` | `90c99cc6ec9747fdf1b6ab7e9119aa65` | 2430 |

Triggers `ingress_safety_scans_monotonic`, `ingress_safety_evidence_immutable`
and `ingress_safety_evidence_parent_guard` are present and enabled.

Privileges: `service_role` holds `SELECT` only on `webhook_envelopes`,
`channel_events`, `ingress_safety_scans` and `ingress_safety_evidence` — no
direct INSERT, UPDATE or DELETE. All writes must pass through the four
`brain_*` RPCs, on which `service_role` holds EXECUTE. The three trigger
functions are executable by `postgres` only.

`authenticated` retains `SELECT` on `webhook_envelopes`, `channel_events` and
`ingress_safety_scans` under their existing tenant-scoped member-read RLS
policies. Migration 0104 revokes direct write privileges on those tables; it
does not remove their existing authenticated member-read access.

`ingress_safety_evidence` is different: RLS is enabled and forced, it has no
read policy, and ordinary roles are revoked. `authenticated` therefore cannot
read `ingress_safety_evidence`.

## Scope

This change adds files only. It contains no application code and executes no
DDL. Merging it changes no runtime behaviour and no database state.
