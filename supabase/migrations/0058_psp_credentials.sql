-- ============================================================================
-- Kivo (KSA) — WO-3a: per-tenant PSP (Moyasar) credentials (design §3)
--
-- PREPARE-ONLY: this file is NOT applied to production. It documents the five
-- additive `psp_*` columns the Moyasar adapter will use once the `psp_payments`
-- feature flag is turned on for a tenant. All columns are nullable and additive,
-- guarded by IF NOT EXISTS, so applying it later is a safe no-op-on-rerun and
-- changes NO existing row or behavior (mirrors the wa_* credential columns).
--
-- Secrets are stored ENCRYPTED (encryptSecret / AES-256-GCM) in the *_enc
-- columns, service-role-only. The publishable key is plaintext by design.
--
-- GRANTS: 0020 replaced restaurants' table-level browser grants with per-column
-- grants, so NEW columns receive no anon/authenticated grant automatically — a
-- browser `select *` would fail on them. We therefore mirror 0020: grant the
-- non-secret psp_* columns to the browser roles and lock the two `_enc` secret
-- columns to service_role only.
--
-- Wesaya impact: none. Unapplied; and even once applied, every column defaults
-- to NULL and is only read behind the default-OFF `psp_payments` flag.
--
-- Validation (run manually, NOT applied) — additive DDL inside BEGIN…ROLLBACK.
-- ============================================================================

alter table public.restaurants
  add column if not exists psp_provider text,
  add column if not exists psp_publishable_key text,
  add column if not exists psp_secret_key_enc text,
  add column if not exists psp_webhook_secret_enc text,
  add column if not exists psp_configured_at timestamptz;

-- Non-secret psp columns: browser-readable/updatable (parity with 0020's
-- per-column grant model, so a `select *` from anon/authenticated keeps working).
grant select (psp_provider, psp_publishable_key, psp_configured_at) on public.restaurants to anon;
grant select (psp_provider, psp_publishable_key, psp_configured_at) on public.restaurants to authenticated;
grant update (psp_provider, psp_publishable_key, psp_configured_at) on public.restaurants to anon;
grant update (psp_provider, psp_publishable_key, psp_configured_at) on public.restaurants to authenticated;

-- Secret ciphertext columns: NEVER granted to browser roles; service_role only.
revoke select (psp_secret_key_enc, psp_webhook_secret_enc) on public.restaurants from anon;
revoke select (psp_secret_key_enc, psp_webhook_secret_enc) on public.restaurants from authenticated;
revoke update (psp_secret_key_enc, psp_webhook_secret_enc) on public.restaurants from anon;
revoke update (psp_secret_key_enc, psp_webhook_secret_enc) on public.restaurants from authenticated;
grant select (psp_secret_key_enc, psp_webhook_secret_enc) on public.restaurants to service_role;
grant update (psp_secret_key_enc, psp_webhook_secret_enc) on public.restaurants to service_role;
