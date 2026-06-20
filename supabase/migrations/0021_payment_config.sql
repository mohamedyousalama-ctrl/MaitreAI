-- ============================================================================
-- MaitreAI — Payment Sprint 1: manual-wallet payment configuration (config only)
-- Adds a per-tenant payment_config JSONB to restaurants holding the manual
-- payment setup: cash-on-delivery toggle (default ON — COD path unchanged),
-- two manual wallets (Vodafone Cash, InstaPay) each with enable/handle/
-- instructions, and a wallet_policy knob (default "strict"). Existing rows are
-- backfilled with the default by the NOT NULL DEFAULT. Idempotent.
--
-- NOTE: this migration is ALREADY APPLIED to production Supabase; this file
-- documents that schema in-repo. The IF NOT EXISTS guard makes a re-run a no-op.
-- This sprint is configuration storage only — no checkout/order-flow wiring.
-- ============================================================================

alter table public.restaurants
  add column if not exists payment_config jsonb not null default '{
    "cod_enabled": true,
    "wallet_policy": "strict",
    "vodafone_cash": { "enabled": false, "number": "", "instructions": "" },
    "instapay": { "enabled": false, "handle": "", "instructions": "" }
  }'::jsonb;
