-- ============================================================================
-- MaitreAI — WO-LIVE4-F2 inbound coalescing watermark (0085) — ADDITIVE, PREPARE-ONLY
-- (unapplied until an off-peak batch). ONE nullable timestamp per conversation: the
-- created_at of the newest customer message the Brain has already answered. It lets a
-- burst of rapid inbound messages (each delivered by Meta as its OWN webhook) coalesce
-- into a single Brain turn — the turn gathers every customer message newer than this
-- watermark, merges them, answers once, then advances the watermark to the newest one
-- it covered. A later webhook for a message at/under the watermark finds nothing new
-- and stays silent (no double reply); a message that lands mid-turn is strictly newer
-- than the watermark and is never dropped.
--
-- Nullable, no default → deploy-safe: the reader treats a missing column (42703) as
-- coalescing-inert (single-message behavior, byte-identical) and NULL as "nothing
-- answered yet" (gather the whole burst). The feature is flag-OFF (inbound_coalescing)
-- until enabled per tenant regardless.
-- ============================================================================

alter table public.conversations
  add column if not exists last_answered_inbound_at timestamptz;

notify pgrst, 'reload schema';
