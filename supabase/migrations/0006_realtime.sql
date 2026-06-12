-- ============================================================================
-- MaitreAI — Sprint 7 Pass 2 — 0006 enable Realtime
-- Add the cross-device tables to the supabase_realtime publication so the app
-- receives postgres_changes (RLS-respecting). Idempotent.
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array['conversations','messages','orders','order_events','payment_sessions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
    -- Full replica identity so Realtime can evaluate RLS (e.g. restaurant_id) on
    -- the changed row for authenticated postgres_changes subscriptions.
    execute format('alter table public.%I replica identity full;', t);
  end loop;
end $$;
