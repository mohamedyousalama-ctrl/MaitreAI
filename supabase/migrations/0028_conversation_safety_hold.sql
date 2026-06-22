-- ============================================================================
-- MaitreAI — 0028: structured safety-hold flag on conversations
-- Allergen-safety (Fix 2). A DETERMINISTIC source of truth for the #84 auto-return
-- carve-out: when an allergen/safety escalation fires (the deterministic input gate
-- OR a model escalation read as allergy/safety), is_safety_hold is set true at
-- escalation time — so a safety hold can NEVER wrongly auto-return regardless of how
-- the model phrased its free-text escalation reason.
--
-- Additive, NOT NULL DEFAULT false → existing rows backfill to false and behavior is
-- UNCHANGED for every tenant until the `deterministic_allergen_safety` feature flag
-- is explicitly enabled (the code only reads/writes this column when that flag is on,
-- so this migration is safe to apply independently of the deploy). Idempotent.
-- ============================================================================

alter table public.conversations
  add column if not exists is_safety_hold boolean not null default false;
