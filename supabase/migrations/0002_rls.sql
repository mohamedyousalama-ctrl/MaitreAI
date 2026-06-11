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

-- restaurants: members of the restaurant ------------------------------------
drop policy if exists restaurants_rw on public.restaurants;
create policy restaurants_rw on public.restaurants
  using (public.is_member_of(id))
  with check (public.is_member_of(id));

-- members: a user can see/manage their own membership rows -------------------
drop policy if exists members_self on public.members;
create policy members_self on public.members
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- All other tenant tables: scoped by restaurant_id ---------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'branches','menu_categories','menu_items','modifiers','menu_item_modifiers',
    'delivery_zones','policies','faqs','promotions','customers','conversations',
    'messages','orders','order_events','payment_sessions','agent_runs','onboarding_state'
  ] loop
    execute format('drop policy if exists %1$s_rw on public.%1$s;', t);
    execute format(
      'create policy %1$s_rw on public.%1$s
         using (public.is_member_of(restaurant_id))
         with check (public.is_member_of(restaurant_id));', t);
  end loop;
end $$;
