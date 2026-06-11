-- ============================================================================
-- MaitreAI — Sprint 7 — 0005 Amendment 02 upgrade (idempotent, in-place)
-- Brings an existing DB (that already ran 0001-0004) up to the Promotion Machine
-- + customer-experience schema: promotions C7 model, segments / redemptions /
-- campaigns, customer marketing consent, order discounts, menu image governance.
-- Safe to run more than once. On a truly fresh DB, just run the amended 0001-0003.
-- AFTER this, RE-RUN 0002_rls.sql (policies for the new tables) and 0003_seed.sql.
-- ============================================================================

-- B4: menu image governance ------------------------------------------------
alter table public.menu_items add column if not exists image_kind text not null default 'card';
alter table public.menu_items drop constraint if exists menu_items_image_kind_check;
alter table public.menu_items add constraint menu_items_image_kind_check
  check (image_kind in ('real','illustrative','card'));
alter table public.menu_items add column if not exists image_status text not null default 'approved';
alter table public.menu_items drop constraint if exists menu_items_image_status_check;
alter table public.menu_items add constraint menu_items_image_status_check
  check (image_status in ('approved','pending','rejected'));

-- C7: customers marketing consent ------------------------------------------
alter table public.customers add column if not exists marketing_opt_in boolean not null default false;
alter table public.customers add column if not exists opt_in_source text;
alter table public.customers add column if not exists opt_in_at timestamptz;
alter table public.customers add column if not exists opted_out_at timestamptz;
alter table public.customers add column if not exists last_marketing_at timestamptz;

-- C7: order discounts -------------------------------------------------------
alter table public.orders add column if not exists discount_total numeric(10,2) not null default 0;
alter table public.orders add column if not exists applied_promotions jsonb not null default '[]'::jsonb;

-- C7: promotions → full model (ALTER in place; old columns dropped) --------
alter table public.promotions drop column if exists items;
alter table public.promotions drop column if exists bundle_price;
alter table public.promotions drop column if exists discount_pct;
alter table public.promotions drop column if exists starts_at;
alter table public.promotions drop column if exists ends_at;
alter table public.promotions drop column if exists days_of_week;
alter table public.promotions drop column if exists active;

alter table public.promotions add column if not exists config jsonb not null default '{}'::jsonb;
alter table public.promotions add column if not exists code text;
alter table public.promotions add column if not exists segment_ids uuid[] not null default '{}';
alter table public.promotions add column if not exists custom_filter jsonb;
alter table public.promotions add column if not exists schedule jsonb not null default '{}'::jsonb;
alter table public.promotions add column if not exists caps jsonb not null default '{}'::jsonb;
alter table public.promotions add column if not exists budget_cap numeric(12,2);
alter table public.promotions add column if not exists spent numeric(12,2) not null default 0;
alter table public.promotions add column if not exists eligibility jsonb not null default '{}'::jsonb;
alter table public.promotions add column if not exists stacking text not null default 'exclusive';
alter table public.promotions add column if not exists state text not null default 'draft';
alter table public.promotions add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.promotions alter column type set default 'percent_off';
alter table public.promotions drop constraint if exists promotions_type_check;
alter table public.promotions add constraint promotions_type_check
  check (type in ('percent_off','amount_off','combo','bogo','free_item_over_threshold',
                  'free_delivery','first_order','promo_code','happy_hour'));
alter table public.promotions drop constraint if exists promotions_stacking_check;
alter table public.promotions add constraint promotions_stacking_check
  check (stacking in ('exclusive','stackable'));
alter table public.promotions drop constraint if exists promotions_state_check;
alter table public.promotions add constraint promotions_state_check
  check (state in ('draft','scheduled','active','paused','ended','archived'));
create unique index if not exists promotions_code_uniq
  on public.promotions(restaurant_id, code) where code is not null;

-- C7: new tables ------------------------------------------------------------
create table if not exists public.segments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  kind text not null default 'custom' check (kind in ('builtin','custom')),
  definition jsonb not null default '{}'::jsonb,
  last_count int not null default 0,
  refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists segments_restaurant_idx on public.segments(restaurant_id);

create table if not exists public.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  amount_discounted numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists promotion_redemptions_restaurant_idx on public.promotion_redemptions(restaurant_id);
create index if not exists promotion_redemptions_promotion_idx on public.promotion_redemptions(promotion_id);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  promotion_id uuid references public.promotions(id) on delete set null,
  segment_id uuid references public.segments(id) on delete set null,
  template_name text,
  scheduled_at timestamptz,
  state text not null default 'draft' check (state in ('draft','scheduled','sending','done','cancelled')),
  sent_count int not null default 0,
  delivered_count int not null default 0,
  read_count int not null default 0,
  opted_out_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists campaigns_restaurant_idx on public.campaigns(restaurant_id);
create index if not exists campaigns_promotion_idx on public.campaigns(promotion_id);

-- updated_at triggers for the new config tables.
do $$
declare t text;
begin
  foreach t in array array['segments','campaigns'] loop
    execute format(
      'drop trigger if exists trg_touch_%1$s on public.%1$s;
       create trigger trg_touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at();', t);
  end loop;
end $$;
