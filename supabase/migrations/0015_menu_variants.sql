-- ============================================================================
-- MaitreAI — Menu variants + choice groups
-- Adds option-driven menu pricing storage. Data is seeded separately.
-- ============================================================================

create table if not exists public.menu_item_variants (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  item_id uuid not null references public.menu_items(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists menu_item_variants_restaurant_idx on public.menu_item_variants(restaurant_id);
create index if not exists menu_item_variants_item_idx on public.menu_item_variants(item_id);

create table if not exists public.menu_item_choice_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  item_id uuid not null references public.menu_items(id) on delete cascade,
  name text not null,
  min_select int not null default 1,
  max_select int not null default 1,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists menu_item_choice_groups_restaurant_idx on public.menu_item_choice_groups(restaurant_id);
create index if not exists menu_item_choice_groups_item_idx on public.menu_item_choice_groups(item_id);

create table if not exists public.menu_item_choice_options (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  group_id uuid not null references public.menu_item_choice_groups(id) on delete cascade,
  label text not null,
  price_delta numeric(10,2) not null default 0,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists menu_item_choice_options_restaurant_idx on public.menu_item_choice_options(restaurant_id);
create index if not exists menu_item_choice_options_group_idx on public.menu_item_choice_options(group_id);

do $$
declare t text;
begin
  foreach t in array array[
    'menu_item_variants','menu_item_choice_groups','menu_item_choice_options'
  ] loop
    execute format(
      'drop trigger if exists trg_touch_%1$s on public.%1$s;
       create trigger trg_touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at();', t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'menu_item_variants','menu_item_choice_groups','menu_item_choice_options'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
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
