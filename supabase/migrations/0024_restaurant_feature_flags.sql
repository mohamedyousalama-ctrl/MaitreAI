-- ============================================================================
-- MaitreAI — Karim Pro: per-tenant feature flags (narrow, default-off opt-in)
-- A standard tenant can be granted a SINGLE Pro capability (e.g. P1 conversation
-- intelligence) WITHOUT being flipped to tier='pro'. This keeps the broad Pro
-- gate (isProTenant) closed by default, so future customer-facing Pro features
-- (P2–P7) never auto-enable on a tenant just because one internal capability was
-- turned on. A feature is ON when the tenant explicitly enables it here OR the
-- tenant is full 'pro'. Default '{}' ⇒ nothing extra is enabled. Additive +
-- idempotent.
-- ============================================================================

alter table public.restaurants
  add column if not exists feature_flags jsonb not null default '{}'::jsonb;

-- Explicit column grants — migration 0020 revoked the table-level grants, so each
-- new non-secret column needs its own (mirrors the tier/payment_config columns).
grant select (feature_flags) on public.restaurants to anon;
grant select (feature_flags) on public.restaurants to authenticated;
grant update (feature_flags) on public.restaurants to anon;
grant update (feature_flags) on public.restaurants to authenticated;
