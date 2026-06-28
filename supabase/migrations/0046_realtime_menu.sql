-- ============================================================================
-- 0046 — enable Realtime for the brain tables (LIVE0 Phase L2 — menu/86 live)
--
-- Adds the menu/brain tables to the supabase_realtime publication + REPLICA
-- IDENTITY FULL, so an availability (86) flip — or any menu/category/variant/
-- modifier/zone/faq/policy/promotion change — by one operator reflects on every
-- operator's console (the shared useRestaurantStore reloads the brain on change).
--
-- Scope = the FULL brain set loadBrain() reads (lib/db/brain.ts:169-206), EXCEPT
-- `restaurants` which is already in the publication (0045). Chosen over a 86-only
-- subset because refreshBrain() reloads the whole brain anyway and these are all
-- low-churn config tables — one subscription keeps the entire console-side brain
-- fresh with no extra cost.
--
-- Additive: publication membership + replica identity ONLY. No table/column/data
-- change, no RLS change. Member-read RLS already exists on every table here (the
-- console loads the brain via the member client), so the member realtime
-- subscription is authorized. Mirrors 0006/0045 (idempotent).
--
-- PREPARE-ONLY — review before prod apply. Validated via BEGIN…ROLLBACK.
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'branches',
    'menu_categories',
    'menu_items',
    'menu_item_variants',
    'menu_item_choice_groups',
    'menu_item_choice_options',
    'modifiers',
    'menu_item_modifiers',
    'delivery_zones',
    'policies',
    'faqs',
    'promotions'
  ] loop
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
--   do $$ declare t text; begin
--     foreach t in array array['branches','menu_categories','menu_items',
--       'menu_item_variants','menu_item_choice_groups','menu_item_choice_options',
--       'modifiers','menu_item_modifiers','delivery_zones','policies','faqs',
--       'promotions'] loop
--       execute format('alter publication supabase_realtime drop table public.%I;', t);
--       execute format('alter table public.%I replica identity default;', t);
--     end loop;
--   end $$;
