-- ============================================================================
-- 0045 — enable Realtime for public.restaurants (LIVE0 Phase L1)
--
-- Adds `public.restaurants` to the supabase_realtime publication + sets
-- REPLICA IDENTITY FULL, so authenticated postgres_changes subscriptions receive
-- (RLS-respecting) UPDATE events carrying the changed row — the shared ops store
-- (agent_mode / is_open / slug) uses this to stay live across same-page AND
-- devices. Mirrors 0006_realtime.sql exactly (same idempotent shape).
--
-- Additive: publication membership + replica identity ONLY. No table/column/data
-- change, no RLS change. The restaurants RLS already lets a member read their own
-- restaurant (the /api/settings/ops GET + order-sources route read it via the
-- member client), so the member realtime subscription is authorized.
--
-- PREPARE-ONLY — review before prod apply. Validated via BEGIN…ROLLBACK.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'restaurants'
  ) then
    execute 'alter publication supabase_realtime add table public.restaurants';
  end if;
  -- Full replica identity so Realtime can evaluate RLS (restaurants.id / member
  -- membership) on the changed row for authenticated postgres_changes subscribers.
  execute 'alter table public.restaurants replica identity full';
end $$;

-- Rollback (manual; not auto-run):
--   alter publication supabase_realtime drop table public.restaurants;
--   alter table public.restaurants replica identity default;
