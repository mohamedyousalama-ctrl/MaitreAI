-- ============================================================================
-- MaitreAI — Real-time 86ing (ADDITIVE ONLY).
-- Let the kitchen/operator mark a menu item out-of-stock ("86" it) so «كريم»
-- stops selling it instantly. The availability flag already exists
-- (menu_items.available, 0001_init) and already flows through the agent's tools
-- (add_to_order / present_menu / prompt all honor it, loaded fresh every turn).
-- This migration adds only:
--   1. menu_items.unavailable_until — an optional timed window ("back tomorrow");
--      while set in the future the item reads as unavailable, then auto-returns.
--   2. menu_availability_events — an append-only audit row per toggle (who/when/
--      item/new state/source), so 86ing is observable and accountable.
-- Tenant-scoped + RLS consistent with the app. Idempotent. (0016 delivery /
-- 0017 brain / 0018 customer memory.)
-- ============================================================================

-- 1. Optional timed-out-of-stock window on the existing menu item table --------
alter table public.menu_items add column if not exists unavailable_until timestamptz;

-- 2. menu_availability_events — append-only audit of every 86/un-86 toggle ------
create table if not exists public.menu_availability_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  item_name text not null,                       -- snapshot (survives later renames)
  available boolean not null,                    -- the NEW state after this toggle
  unavailable_until timestamptz,                 -- the NEW timed window, if any
  source text not null default 'operator',       -- operator | admin_agent | kitchen | system
  actor_user_id uuid,                            -- who toggled (auth user id; nullable for system)
  actor_role text,                               -- manager | operation | null
  reason text,                                   -- optional free-text note
  created_at timestamptz not null default now()
);
create index if not exists menu_availability_events_item_idx       on public.menu_availability_events(menu_item_id);
create index if not exists menu_availability_events_restaurant_idx on public.menu_availability_events(restaurant_id, created_at desc);

-- RLS — members read/write their tenant's availability audit; the service role
-- (the agent/admin paths) bypasses RLS.
alter table public.menu_availability_events enable row level security;
drop policy if exists menu_availability_events_rw on public.menu_availability_events;
create policy menu_availability_events_rw on public.menu_availability_events
  using (public.is_member_of(restaurant_id)) with check (public.is_member_of(restaurant_id));

-- Refresh PostgREST's schema cache so the new column/table are queryable immediately.
notify pgrst, 'reload schema';
