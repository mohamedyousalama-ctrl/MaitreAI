-- ============================================================================
-- MaitreAI — 0032: explicit conversation ownership state (Never-stuck spine, Step 1)
-- Formalizes scattered ownership fields (`owner`, free-text `status`, `is_safety_hold`)
-- into ONE explicit state column with legal transitions, so Step 2 (stuck detection)
-- has a solid foundation. The 5 states:
--   AI_ACTIVE     — Karim owns + replies normally          (today: owner='ai')
--   HUMAN_ACTIVE  — a staff member took over, Karim silent (today: owner='human')
--   HUMAN_IDLE    — handed to a human, human not acting, customer waiting
--                   (today: implicit in the idle/auto-return timer — runtime-computed,
--                    so NOT backfilled here)
--   SYSTEM_HOLD   — safety hold (allergy); only a deliberate human action releases it
--                   (today: is_safety_hold=true) — NEVER auto-returns to AI (#87)
--   CLOSED        — conversation finished/closed
--
-- Additive + dual-write: the legacy columns (owner/status/is_safety_hold) are KEPT and
-- still written alongside this column, so anything that still reads them keeps working.
-- This column is the source of truth going forward. NOT NULL DEFAULT 'AI_ACTIVE' →
-- existing rows are safe; the code only writes it via setOwnershipState (lib/db/ownership.ts).
--
-- The live DB applies migrations out-of-band (history table is empty). This file is
-- written to be safe to run idempotently (add-if-not-exists, guarded constraint,
-- deterministic backfill that only touches not-yet-classified rows).
-- ============================================================================

alter table public.conversations
  add column if not exists ownership_state text not null default 'AI_ACTIVE';

-- Legal-value CHECK constraint (idempotent: only add if absent).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'conversations_ownership_state_check'
  ) then
    alter table public.conversations
      add constraint conversations_ownership_state_check
      check (ownership_state in ('AI_ACTIVE', 'HUMAN_ACTIVE', 'HUMAN_IDLE', 'SYSTEM_HOLD', 'CLOSED'));
  end if;
end $$;

-- Backfill from the existing fields. Deterministic, and idempotent: only rows still at
-- the column default ('AI_ACTIVE' = not yet classified) are evaluated, so a re-run never
-- clobbers a runtime-set state (e.g. a HUMAN_IDLE the timer wrote). Priority: a safety
-- hold wins over a human takeover wins over a closed status.
update public.conversations
set ownership_state = case
  when is_safety_hold = true then 'SYSTEM_HOLD'
  when owner = 'human' then 'HUMAN_ACTIVE'
  when status in ('طلب مكتمل', 'مغلق', 'مكتمل') then 'CLOSED'
  else 'AI_ACTIVE'
end
where ownership_state = 'AI_ACTIVE';
