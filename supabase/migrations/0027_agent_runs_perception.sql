-- ============================================================================
-- MaitreAI — Karim Pro P3: per-turn perception read on agent_runs
-- Adds agent_runs.perception jsonb — the per-turn PERCEPTION object (intent,
-- confidence/confusion, understood, sentiment, risk) computed by a cheap Haiku
-- read when a tenant has the narrow `perception` feature flag on. It is a
-- LABELED INFERENCE (a read, never a fact) and is null for every turn where
-- perception is off (standard tenants + Pro-without-perception) — so this column
-- simply stays null for them. agent_runs keeps its table-level grants (migration
-- 0020 only revoked restaurants' grants), so no column grant is needed. Additive
-- + idempotent.
-- ============================================================================

alter table public.agent_runs
  add column if not exists perception jsonb;
