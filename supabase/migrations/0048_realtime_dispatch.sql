-- ============================================================================
-- 0048 — enable Realtime for dispatch tables (LIVE0 Phase L4 — deliveries+drivers)
--
-- Adds `deliveries` + `drivers` to the supabase_realtime publication + REPLICA
-- IDENTITY FULL, so a driver assignment / delivery status change / roster change
-- by one operator reflects on every dispatch console instantly — replacing the
-- 6s poll on التوصيل (which let two operators see an order unassigned for up to
-- 6s → double-dispatch).
--
-- ⚠️ delivery_locations is INTENTIONALLY NOT INCLUDED. It's high-churn GPS pings
--    (an update storm); live driver location stays on the existing throttled poll
--    for open tracking maps only. This migration is dispatch state ONLY.
--
-- SECURITY: deliveries + drivers each have a member policy (FOR ALL via
-- is_member_of(restaurant_id)) — operational tables, not under the M1.7 financial
-- lockdown — so members already read them; realtime postgres_changes respects that
-- read policy and a member-client subscription receives only its own tenant's rows
-- (is_member_of is SECURITY DEFINER). No RLS policy is touched here.
--
-- Additive: publication membership + replica identity ONLY. No table/column/data
-- change, no RLS change. Mirrors 0006/0045/0046/0047 (idempotent).
--
-- PREPARE-ONLY — review before prod apply. Validated via BEGIN…ROLLBACK.
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array['deliveries','drivers'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
    -- Full replica identity so Realtime can evaluate RLS (restaurant_id) on the
    -- changed row for authenticated postgres_changes subscriptions.
    execute format('alter table public.%I replica identity full;', t);
  end loop;
end $$;

-- Rollback (manual; not auto-run):
--   alter publication supabase_realtime drop table public.deliveries;
--   alter publication supabase_realtime drop table public.drivers;
--   alter table public.deliveries replica identity default;
--   alter table public.drivers replica identity default;
