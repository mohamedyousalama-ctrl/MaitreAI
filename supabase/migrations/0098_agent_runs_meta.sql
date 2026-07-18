-- ============================================================================
-- WO-S0-OBS (PREPARE-ONLY): agent_runs.meta for per-turn observability.
--
-- Adds a durable JSONB bucket for additive run metadata such as:
--   { "calls_used": 2, "cap_shadow": { ... } }
--
-- PREPARE-ONLY: nullable/defaulted, additive, idempotent. Runtime writes are
-- best-effort and tolerate this column being absent until PM applies the migration.
-- ============================================================================

alter table public.agent_runs
  add column if not exists meta jsonb not null default '{}'::jsonb;

comment on column public.agent_runs.meta is
  'WO-S0-OBS: additive per-turn observability metadata, including calls_used and shadow-cap state. No customer-facing behavior depends on this column.';
