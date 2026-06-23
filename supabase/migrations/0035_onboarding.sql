-- ============================================================================
-- MaitreAI — Onboarding timestamps
-- Tracks when a tenant completes self-serve onboarding (Embedded Signup done,
-- credentials stored, webhook subscribed). Separate from wa_configured_at which
-- only marks "credentials are present"; onboarding_completed_at marks "the full
-- Embedded Signup flow finished successfully."
-- ============================================================================

alter table public.restaurants
  add column if not exists onboarding_completed_at timestamptz;
