-- ============================================================================
-- MaitreAI — Per-tenant WhatsApp credential storage
-- Stores non-secret WhatsApp identifiers and app-encrypted credential ciphertext.
-- Existing tenants continue using env-var fallback until these fields are set.
-- ============================================================================

alter table public.restaurants
  add column if not exists wa_phone_number_id text,
  add column if not exists wa_waba_id text,
  add column if not exists wa_verify_token text,
  add column if not exists wa_access_token_enc text,
  add column if not exists wa_app_secret_enc text,
  add column if not exists wa_configured_at timestamptz;

create unique index if not exists restaurants_wa_phone_number_id_key
  on public.restaurants (wa_phone_number_id)
  where wa_phone_number_id is not null;
