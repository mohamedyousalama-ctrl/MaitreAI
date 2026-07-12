-- ============================================================================
-- WO-COST-1 (PREPARE-ONLY): the honest-ledger cache-WRITE meter on agent_runs.
--
-- The ledger already logs input_tokens, output_tokens, cache_read_tokens, cost_usd
-- (migration 0009). This adds the fourth meter — tokens WRITTEN to the prompt cache
-- (Anthropic cache_creation_input_tokens) — so cache_hit_rate and the true per-turn
-- cost are observable from the row, not just recomputable.
--
-- PREPARE-ONLY: nullable, additive, deploy-safe. The pricing code writes it best-effort
-- and tolerates its absence until this is applied in the ceremony lane; cost_usd is
-- already correct without it (it prices the meter from the in-memory usage). Idempotent.
-- ============================================================================

alter table agent_runs
  add column if not exists cache_creation_tokens int;

comment on column agent_runs.cache_creation_tokens is
  'WO-COST-1: tokens written to the prompt cache this turn (Anthropic cache_creation_input_tokens), priced at the cache-write rate. Nullable; populated best-effort by the turn writer.';
