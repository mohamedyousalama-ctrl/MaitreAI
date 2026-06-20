-- ============================================================================
-- MaitreAI — Karim Pro P1 fix: ONE CURRENT report per conversation (supersede)
-- A conversation can re-reach a terminal state (abandon → resume → escalate).
-- The earlier record must NOT survive alongside the later one, or the conversion
-- funnel double-counts a single thread (counts it as BOTH abandoned and
-- escalated). The truth is the LATEST terminal: the thread truly escalated.
--
-- Fix: collapse the uniqueness from (conversation_id, terminal_trigger) to
-- conversation_id alone, so the emitter's upsert REPLACES the prior record
-- instead of inserting a sibling. created_at stays the first-seen time;
-- ended_at/updated_at advance to the latest terminal.
--
-- Application-layer gating is unchanged: only tenants with the
-- conversation_intelligence feature ever write here, so standard tenants keep an
-- empty table. Additive + idempotent (safe to re-run).
-- ============================================================================

-- 1) Collapse any existing duplicates BEFORE adding the stricter constraint:
--    keep the most recent row per conversation (latest created_at, id as a
--    deterministic tiebreak), delete the rest. (created_at, id) is a strict total
--    order, so exactly one row survives per conversation_id.
delete from public.conversation_reports a
using public.conversation_reports b
where a.conversation_id = b.conversation_id
  and (a.created_at, a.id) < (b.created_at, b.id);

-- 2) Drop the old per-(conversation, trigger) uniqueness — it is exactly what
--    permitted a second row when the SAME thread hit a DIFFERENT terminal state.
alter table public.conversation_reports
  drop constraint if exists conversation_reports_conversation_id_terminal_trigger_key;

-- 3) Enforce ONE current report per conversation (the upsert supersede target).
alter table public.conversation_reports
  drop constraint if exists conversation_reports_conversation_id_key;
alter table public.conversation_reports
  add constraint conversation_reports_conversation_id_key unique (conversation_id);

-- 4) Row-write time of the latest terminal (distinct from created_at = first
--    terminal seen). Useful to confirm a supersede happened (update vs insert).
alter table public.conversation_reports
  add column if not exists updated_at timestamptz not null default now();
