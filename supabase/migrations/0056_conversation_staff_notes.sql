-- ============================================================================
-- 0056 — conversations.staff_notes (WB-FIX-1, internal staff note)
--
-- A STAFF-ONLY private note on a conversation, distinct from handover_note (which
-- is the return-to-Karim summary and IS read into Karim's prompt). staff_notes is
-- internal: it is NEVER sent to the customer and NEVER read into the agent prompt
-- (the agent's restaurant/conversation reads select explicit columns and do not
-- include it). Any member (manager or operation) may add/edit it.
--
-- Additive, nullable, no backfill, no RLS change.
--
-- ALSO: a staff_notes-only edit must NOT reset the SLA/wait clock that stuck-
-- detection keys on (same concern as the WB2 stage fix, 0054). So this extends the
-- conversations updated_at trigger to mask `staff_notes` as well as `stage`: a
-- note-only OR stage-only edit preserves updated_at; any OTHER change still bumps
-- it. Stuck-detection is unchanged.
--
-- PREPARE-ONLY — review before apply. Validated via BEGIN…ROLLBACK.
-- ============================================================================

alter table public.conversations add column if not exists staff_notes text;

create or replace function public.touch_conversations_updated_at()
returns trigger language plpgsql as $fn$
declare
  masked public.conversations;
begin
  -- Mask the pure-metadata columns (stage, staff_notes) + updated_at itself; if
  -- anything ELSE changed it's real activity → bump the wait clock, otherwise
  -- preserve it so a label/note-only edit never resets stuck/SLA timers.
  masked := new;
  masked.stage := old.stage;
  masked.staff_notes := old.staff_notes;
  masked.updated_at := old.updated_at;
  if masked is distinct from old then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end
$fn$;

-- Rollback (manual; not auto-run):
--   -- restore the 0054 function body (mask `stage` only):
--   (re-apply 0054_conversations_stage_no_clock.sql)
--   alter table public.conversations drop column if exists staff_notes;
