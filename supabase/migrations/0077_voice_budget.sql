-- ============================================================================
-- MaitreAI — WO-VOICE-2 outbound voice-note budget (0077) — ADDITIVE, PREPARE-ONLY
-- (unapplied until an off-peak batch). Per-conversation DAILY voice-note counter +
-- cost accumulator, mirroring the media_guard counters (0070) but with a DATE column
-- so the budget resets each day. All columns nullable/defaulted → deploy-safe: the
-- outbound path treats a missing column as budget-inert (feature is flag-OFF anyway).
--
-- voice_notes_day   — the date the counter belongs to; a new day zeroes it (the
--                     reader compares to today and treats a stale day as 0 sent).
-- voice_notes_sent  — voice notes sent to this conversation on voice_notes_day.
-- voice_cost_usd    — cumulative TTS synthesis cost logged for this conversation
--                     (per-note cost also lands in agent_runs, like STT/LLM).
-- ============================================================================

alter table public.conversations
  add column if not exists voice_notes_day date,
  add column if not exists voice_notes_sent integer not null default 0,
  add column if not exists voice_cost_usd numeric(10,6) not null default 0;

notify pgrst, 'reload schema';
