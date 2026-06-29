-- ============================================================================
-- 0054 — conversations: a STAGE-ONLY edit must not move the SLA/wait clock (WB2 fix)
--
-- BUG (Codex): the generic touch_updated_at() trigger bumps conversations.
-- updated_at on EVERY update. stuck-detection (lib/intelligence/stuck-detection.ts)
-- keys on conversations.updated_at for:
--   • Condition A — SYSTEM_HOLD (safety/allergy) timeout
--   • Condition C — human-no-response timeout
-- So a label-only WB2 stage edit reset that clock and could postpone or SUPPRESS a
-- stuck/unattended alert — INCLUDING a SYSTEM_HOLD safety alert. (Condition B keys
-- on orders.updated_at, so it was unaffected.)
--
-- FIX: replace ONLY the conversations trigger with a conversations-specific
-- function that skips the updated_at bump when the ONLY change is `stage` (the
-- sales-funnel label). EVERY other change — a reply, a takeover, an
-- ownership/status/safety transition — still bumps updated_at exactly as before,
-- so real activity moves the clock and stuck-detection is UNCHANGED and unweakened.
-- The shared touch_updated_at() (used by 16 other tables) is left untouched.
--
-- No column change, no RLS change, no data touched. PREPARE-ONLY — review first.
-- ============================================================================

create or replace function public.touch_conversations_updated_at()
returns trigger language plpgsql as $fn$
declare
  masked public.conversations;
begin
  -- Compare the incoming row to the old row with `stage` (and updated_at itself)
  -- masked out. If anything ELSE changed, it's real activity → bump the clock.
  -- If only `stage` changed (or nothing did), preserve the existing updated_at so
  -- the stuck/SLA wait clock is not reset by a metadata-only stage edit.
  masked := new;
  masked.stage := old.stage;
  masked.updated_at := old.updated_at;
  if masked is distinct from old then
    new.updated_at := now();          -- a genuine (non-stage) change → move the clock
  else
    new.updated_at := old.updated_at; -- stage-only / no-op → keep the wait clock
  end if;
  return new;
end
$fn$;

-- Re-point ONLY the conversations trigger at the new function (other tables keep
-- the shared touch_updated_at()).
drop trigger if exists trg_touch_conversations on public.conversations;
create trigger trg_touch_conversations
  before update on public.conversations
  for each row execute function public.touch_conversations_updated_at();

-- Rollback (manual; not auto-run) — restore the generic trigger:
--   drop trigger if exists trg_touch_conversations on public.conversations;
--   create trigger trg_touch_conversations before update on public.conversations
--     for each row execute function public.touch_updated_at();
--   drop function if exists public.touch_conversations_updated_at();
