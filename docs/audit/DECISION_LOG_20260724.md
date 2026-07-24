# KIVO governed decision log — 24 July 2026

Auditor/PM window. Documentation only — this branch contains no application
code, no migrations and no test fixtures.

All facts below were read directly from GitHub, the production Supabase project
`zlighrbsjexrozrmuwpw` and Vercel project `prj_zQZv30J54UEHoCzctfTkfQsIZsjj`.
Nothing here is carried over on trust from a prior window.

**Pilot status: NO-GO.**

---

## 1. Verified state

| Fact | Value | Source |
| --- | --- | --- |
| GitHub `main` | `935afaf42a6e7912f842aa2b6fed9140de806648` | `git rev-parse origin/main` |
| Production application SHA | `935afaf…` — identical to `main` | Vercel `dpl_DQUFdCaLp3UN28rCKfiac71UBFdW`, READY, target=production |
| Production migration ledger | 65 rows | `supabase_migrations.schema_migrations` |
| Latest migration | `20260724034339 / 0104_safety_ingress_evidence` | same |
| Four ingress tables | all empty (0 rows) | direct count |
| E0 application integration | not merged | branch inspection |

Branch SHAs confirmed: `transfer/e0-verification-corrected` @ `eb7652c`,
`wo-e0-safety-ingress` @ `e1e0cc9`, `wo-evidence-1-detector-corpus` @ `9359fee`,
`wo-eng-4-payment-defects-20260723` @ `617de81`. 446 remote heads total.

`transfer/e0-verification-corrected` was verified clean: exactly one commit on
top of `935afaf`, adding exactly one file. Not stale, correctly based.

---

## 2. Corrections to the inherited checkpoint

### 2.1 `wo-proof-3` disposition was wrong

The inherited roadmap ruled `wo-proof-3` @ `52387ca` an unmerged candidate with
a stale base requiring rebase. It was in fact **already merged** as PR #552 and
**is** `main`'s tip. `c38c6b6` is `main`'s parent (PR #551), not a stale base.
The remote branch no longer exists.

Consequence: the instruction to "choose one canonical safety-evidence branch"
was moot — the choice was made when #552 merged.

### 2.2 The shadow ingress route is authenticated

`app/api/brain/ingress/whatsapp/route.ts` verifies `x-hub-signature-256`
against the tenant's decrypted app secret. It is **not** an unauthenticated
route. The correct objection is different and stronger: it is a second
independent writer into the same four ingress tables, carrying its own copy of
tenant resolution, signature verification and store logic — the "second private
definition" pattern forbidden elsewhere in the remediation contract. It is live
in production at `935afaf`.

### 2.3 Tenant fixtures

The tenant table is `public.restaurants`, not `public.tenants` (the E0
verification artefact's comments say "tenants"). Both fixture UUIDs exist.
Tenant A = وصاية `5acbc72f…`, `active=true`. Tenant B = Sweet Shop
`9244d8ef…`, `active=false`.

---

## 3. Finding: migration 0104 had no source on any merged ref (RESOLVED)

`0104_safety_ingress_evidence` was applied to the production database while its
source existed only on the unmerged branch `wo-e0-safety-ingress`. Production
code and `main` were at `0103`; the production database was at `0104`. The
applied DDL had no reviewable artefact on `main` and could not be reproduced in
a fresh environment. Had that branch been force-pushed or deleted, the applied
production schema would have had no source at all.

**Resolution:** PR #553, branch `chore/0104-source-of-truth`, branched from
`935afaf`. Two added files, 1074 insertions, no application code, no DDL
execution. Held for independent review; not merged.

### 3.1 Byte verification

The live database cannot prove the original file bytes — it stores parsed
objects, not the text that produced them. Integrity was established by the
approved SHA-256, matched three times (source blob at `e1e0cc9`, file as
written into the worktree, and again immediately before push):

```
560e060351c793990daa8f61bbdad95e998d508977e1610478881d7582c38b80
```

### 3.2 Object correspondence — verified separately

All seven function bodies compared to `pg_proc.prosrc` by MD5 and byte length;
all seven matched exactly. All constraints, indexes, triggers and privileges
present and matching. `ingress_safety_evidence` has RLS enabled and forced with
no read policy. `service_role` holds `SELECT` only on the four ingress tables
and `EXECUTE` on the four `brain_*` RPCs.

---

## 4. E0 verification artefact — corrected defect register

Artefact: `scripts/proof/e0_production_verification_rollback_only.sql` at
`eb7652c`. **Must not be executed against production.** Returned to its
originating builder for correction. The auditor window does not author it.

### 4.1 Defect 0 — the script cannot exit nonzero (NEW, most severe)

`\set ON_ERROR_STOP on` is fully defeated. Every failure is swallowed by a broad
`WHEN others` handler, and the pre-rollback assertion emits `RAISE NOTICE`
rather than raising. A total failure produces exit code 0. Any operator or gate
reading the exit status sees success. This was absent from the inherited defect
list and subsumes the weaker inherited items "`v_failed > 0` does not fail the
script" and "a zero pre-rollback count only prints a notice".

### 4.2 Verified role boundary

`service_role` holds **`SELECT` only** on `webhook_envelopes`, `channel_events`,
`ingress_safety_scans` and `ingress_safety_evidence` — no INSERT, UPDATE or
DELETE. Cases 13, 14, **15 and 16** therefore all fail on `42501
insufficient_privilege` before reaching any trigger or foreign key, and all four
are counted PASS by the broad handler. The inherited list treated 15 and 16 as
merely mis-roled; they are false positives on identical grounds to 13 and 14.

### 4.3 Verified evidence-key mismatch and its cascade

`brain_complete_ingress_safety_scan` canonicalizes on `matched_excerpt`,
`start_offset`, `end_offset`, `customer_authored`. The artefact supplies
`excerpt_start`, `excerpt_end` and `authored_by`. `(item->>'start_offset')::integer`
yields NULL against a NOT NULL column, raising `23502`.

The inherited list stopped at the key mismatch. The cascade was not traced:

- Case 6a fails, leaving `v_scan` NULL.
- Cases 13, 14 and 15 then operate on a NULL `scan_id` — so even with roles and
  columns corrected they would assert nothing.
- Case 7 is unreachable as specified: because 6a never completed the scan, the
  "conflicting retry" is actually a *first* completion and will succeed,
  reporting FAIL. It cannot test conflict detection until 6a passes.
- Cases 5 and 17 pass for reasons unrelated to evidence handling — the outcome
  check and the tenant/event ownership check both fire before evidence
  canonicalization. Neither is evidence-path coverage.

### 4.4 Retained inherited defects

Broad `WHEN others` handlers throughout; case 7 counting a non-`KIV01` error as
`PASS(partial)`; post-rollback zero counts displayed but not mechanically
asserted; counts relying on whole-table emptiness rather than being tied to the
`E0VERIFY-ROLLBACK` marker or a baseline delta. The envelope return shape is
correct and must not be changed again.

---

## 5. Finding: live production WhatsApp outage (P0, ACTIVE)

Discovered during the read-only WhatsApp investigation. This is an active
incident, not a historical artefact.

- **Every WhatsApp webhook POST in the last 24 hours returned 401.** Zero 200s.
  Over the preceding 7 days the same route served 4796 × 200 against 72 × 401,
  so this is a regime change, not baseline noise.
- Wesaya's last successfully persisted message: **2026-07-23 20:40:33 UTC**.
  Roughly 26 hours of total inbound failure at time of writing.
- `monitor_webhook_events` holds **118** `invalid_signature` rows (the inherited
  figure of 114 was already stale), first `2026-07-12 12:41:02 UTC`, most recent
  `2026-07-24 22:49:50 UTC` — 13 in the final hour observed.
- **All 118 carry the same `phone_number_id` `1204305262760496`**, and all carry
  `restaurant_id = NULL`.

### 5.1 What this proves

`1204305262760496` is not stored against any tenant. The only tenant row with a
phone number id is Sweet Shop (`1141332049069236`, and it is inactive). Wesaya
holds no WhatsApp columns at all, so it is served exclusively by the global
environment path.

Because `restaurant_id` is NULL on every rejection, no per-tenant secret was in
play; the only secret applied was the global one. The 401 branch is reachable
only when at least one signing secret is configured — an unset secret returns
503, not 401. Therefore `WHATSAPP_APP_SECRET` **is set in production and does
not match what Meta is signing with.**

### 5.2 Nature of the traffic

Real Meta traffic, not tests and not random scanning. The payloads parse as JSON
and carry a well-formed Meta envelope (`entry[].changes[].value.metadata.phone_number_id`),
which is required to extract the identifier at all. A single consistent
identifier persists across twelve days, and requests arrive in tight clusters
(22:49:38, :39, :41, :50) characteristic of Meta's retry-on-non-2xx behaviour.

### 5.3 Environment variable presence (names only, no values read)

| Variable | Status | Basis |
| --- | --- | --- |
| `WHATSAPP_APP_SECRET` | set | 401 branch requires a configured secret; unset would return 503 |
| `WHATSAPP_ACCESS_TOKEN` | set | outbound sends succeeded |
| `WHATSAPP_PHONE_NUMBER_ID` | set | outbound sends succeeded |
| `WHATSAPP_RESTAURANT_ID` | set to `5acbc72f…` (Wesaya) | in production `resolveWebhookRestaurantId` returns only this env var; 1550 Wesaya messages were persisted |
| `WHATSAPP_VERIFY_TOKEN` | presumed set | Meta GET handshake must have passed at setup; no current direct evidence |

### 5.4 Open question — not resolvable from permitted evidence

Whether `1204305262760496` is Wesaya's own number could not be settled. Its
traffic was rejected on 2026-07-23 at 18:00 while a Wesaya message was persisted
successfully at 20:40 the same day, which is consistent either with a second
misconfigured Meta app or with a secret rotation between those times. Successful
requests do not record a phone number id anywhere, so the comparison cannot be
made from stored data.

**One check settles it:** compare `1204305262760496` against the Vercel
production `WHATSAPP_PHONE_NUMBER_ID`. Equal ⇒ Wesaya's own number and the
global app secret is broken. Not equal ⇒ a foreign Meta app is pointed at this
webhook and Wesaya's own inbound has separately gone silent, which is then its
own incident.

### 5.5 Answer to the standing question

**Wesaya cannot currently receive or reply to a signed WhatsApp message.** Every
inbound POST is rejected at 401 before persistence, before the Brain and before
any reply. No safety scanning, no evidence, no acknowledgment — the failure is
upstream of all of it.

---

## 6. Standing rulings

1. Pilot remains **NO-GO**.
2. The E0 verification artefact must not be executed against production in any
   form until the corrected defect register above is fully addressed.
3. `transfer/e0-verification-corrected` is a transport branch and is never
   merged.
4. The corrected artefact returns to its originating builder. The auditor window
   verifies and does not author. If the originating builder is unavailable, a
   new independent builder must author it — the correction does not fall to the
   verifier.
5. The public shadow ingress route must be disabled or removed before the pilot,
   on second-writer grounds rather than authentication grounds.
6. No pilot gate may be considered while the WhatsApp ingress outage in §5 is
   open. It precedes every E0/E1/E2 gate: none of them can be exercised while
   inbound is rejected at the edge.
