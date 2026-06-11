-- ============================================================================
-- MaitreAI — Sprint 7 — 0002 Row Level Security
-- Every domain table is readable/writable only by members of its restaurant.
-- Server code uses the service-role key (which bypasses RLS) for trusted
-- operations like the WhatsApp webhook and tenant seeding.
-- ============================================================================

-- Membership check. SECURITY DEFINER so it can read `members` without tripping
-- the members RLS policy (avoids infinite recursion in policy evaluation).
create or replace function public.is_member_of(p_restaurant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.restaurant_id = p_restaurant_id
      and m.user_id = auth.uid()
  );
$$;

-- Manager-role check (Amendment 01 A5). manager = full access; operation =
-- day-to-day only. SECURITY DEFINER for the same anti-recursion reason.
create or replace function public.is_manager_of(p_restaurant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.restaurant_id = p_restaurant_id
      and m.user_id = auth.uid()
      and m.role = 'manager'
  );
$$;

-- Enable RLS everywhere -----------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'restaurants','members','branches','menu_categories','menu_items','modifiers',
    'menu_item_modifiers','delivery_zones','policies','faqs','promotions','customers',
    'conversations','messages','orders','order_events','payment_sessions',
    'agent_runs','onboarding_state'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- restaurants: any member reads; only a manager edits (settings = manager) ----
drop policy if exists restaurants_rw on public.restaurants;
drop policy if exists restaurants_read on public.restaurants;
drop policy if exists restaurants_write on public.restaurants;
create policy restaurants_read on public.restaurants
  for select using (public.is_member_of(id));
create policy restaurants_write on public.restaurants
  for update using (public.is_manager_of(id)) with check (public.is_manager_of(id));

-- members: a user sees their own row; a manager sees + manages the team -------
drop policy if exists members_self on public.members;
drop policy if exists members_read on public.members;
drop policy if exists members_write on public.members;
create policy members_read on public.members
  for select using (user_id = auth.uid() or public.is_manager_of(restaurant_id));
create policy members_write on public.members
  for all using (public.is_manager_of(restaurant_id))
  with check (public.is_manager_of(restaurant_id));

-- Config tables (Amendment 01 A5): readable by any member, writable by manager
-- only. (operation's narrow exception — toggling menu item availability — is
-- enforced at the server-route + UI layer per A5's three-layer rule.)
do $$
declare t text;
begin
  foreach t in array array[
    'branches','menu_categories','menu_items','modifiers','menu_item_modifiers',
    'delivery_zones','policies','faqs','promotions'
  ] loop
    execute format('drop policy if exists %1$s_rw on public.%1$s;', t);
    execute format('drop policy if exists %1$s_read on public.%1$s;', t);
    execute format('drop policy if exists %1$s_write on public.%1$s;', t);
    execute format(
      'create policy %1$s_read on public.%1$s
         for select using (public.is_member_of(restaurant_id));', t);
    execute format(
      'create policy %1$s_write on public.%1$s
         for all using (public.is_manager_of(restaurant_id))
         with check (public.is_manager_of(restaurant_id));', t);
  end loop;
end $$;

-- Operational tables: any member (manager OR operation) may read + write,
-- since day-to-day work (conversations, order statuses, etc.) is operation's job.
do $$
declare t text;
begin
  foreach t in array array[
    'customers','conversations','messages','orders','order_events',
    'payment_sessions','agent_runs','onboarding_state'
  ] loop
    execute format('drop policy if exists %1$s_rw on public.%1$s;', t);
    execute format(
      'create policy %1$s_rw on public.%1$s
         using (public.is_member_of(restaurant_id))
         with check (public.is_member_of(restaurant_id));', t);
  end loop;
end $$;
