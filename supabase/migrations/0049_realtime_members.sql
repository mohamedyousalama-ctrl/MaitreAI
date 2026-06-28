-- ============================================================================
-- 0049 — enable Realtime for members (LIVE0 Phase L5a — team live)
--
-- Adds `members` to the supabase_realtime publication + REPLICA IDENTITY FULL, so
-- a role change / invite by one manager reflects on other managers' Team screens
-- (and conversation assignee-name labels stay current) without a refresh — the
-- shared members store re-pulls /api/members on change.
--
-- SECURITY (Step-0, verified on prod): members has RLS enabled with
--   members_read [SELECT]: (user_id = auth.uid()) OR is_manager_of(restaurant_id)
--   members_write [ALL]:   is_manager_of(restaurant_id)
-- Realtime postgres_changes RESPECTS members_read, so:
--   • a MANAGER subscriber receives the whole tenant roster's change events
--     (is_manager_of true) — Team is manager-only, so cross-manager updates work;
--   • an OPERATION subscriber receives only its OWN row's events.
-- The roster NAME data is served by /api/members (admin client) to everyone, so
-- operators still load complete assignee names; only live-refresh of OTHER members'
-- changes is manager-scoped. This is acceptable (names are near-static) and needs
-- NO RLS change — the existing read policy already authorizes the subscription.
-- is_manager_of is SECURITY DEFINER, so the RLS check evaluates under the
-- authenticated role. The members write-gate (manager-only) is UNCHANGED.
--
-- Additive: publication membership + replica identity ONLY. No table/column/data
-- change, no RLS change. Mirrors 0006/0045-0048 (idempotent).
--
-- PREPARE-ONLY — review before prod apply. Validated via BEGIN…ROLLBACK.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'members'
  ) then
    execute 'alter publication supabase_realtime add table public.members';
  end if;
  execute 'alter table public.members replica identity full';
end $$;

-- Rollback (manual; not auto-run):
--   alter publication supabase_realtime drop table public.members;
--   alter table public.members replica identity default;
