-- ============================================================================
-- MaitreAI — Delivery dispatch + driver flow + live tracking (ADDITIVE ONLY).
-- Self-contained module, gated in the app behind ENABLE_DELIVERY_TRACKING — these
-- tables sit unused until the flag is on, changing no existing behavior. Drivers
-- onboard with just name+phone (no account). Each delivery mints a one-time
-- driver token (/d/<token>) and a customer tracking token (/t/<token>). Location
-- is a latest-point + breadcrumb trail. Idempotent.
-- ============================================================================

-- 1. drivers — dead-simple, high-churn onboarding (name + WhatsApp phone) -------
create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  phone text not null,                 -- WhatsApp number for the one-time link
  vehicle text,                        -- optional
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists drivers_restaurant_idx on public.drivers(restaurant_id);

-- 2. deliveries — one per finalized delivery order -----------------------------
create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  -- pending | assigned | picked_up | on_the_way | delivered | failed | cancelled
  status text not null default 'pending',
  driver_token text unique,            -- one-time driver link (/d/<token>)
  customer_token text unique,          -- customer tracking link (/t/<token>)
  token_used boolean not null default false,
  assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  expires_at timestamptz,              -- link/token time-bound
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists deliveries_order_idx on public.deliveries(order_id);
create index if not exists deliveries_restaurant_idx on public.deliveries(restaurant_id);
create index if not exists deliveries_driver_idx on public.deliveries(driver_id);
create index if not exists deliveries_status_idx on public.deliveries(restaurant_id, status);

-- 3. delivery_locations — latest point + breadcrumb trail ----------------------
create table if not exists public.delivery_locations (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  recorded_at timestamptz not null default now()
);
create index if not exists delivery_locations_delivery_idx on public.delivery_locations(delivery_id, recorded_at desc);

-- 4. delivery_events — append-only status/observability timeline ---------------
create table if not exists public.delivery_events (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists delivery_events_delivery_idx on public.delivery_events(delivery_id);

-- RLS — members read/write their tenant's rows; the token endpoints write via the
-- service role (which bypasses RLS). Child tables gate through the parent.
alter table public.drivers enable row level security;
drop policy if exists drivers_rw on public.drivers;
create policy drivers_rw on public.drivers
  using (public.is_member_of(restaurant_id)) with check (public.is_member_of(restaurant_id));

alter table public.deliveries enable row level security;
drop policy if exists deliveries_rw on public.deliveries;
create policy deliveries_rw on public.deliveries
  using (public.is_member_of(restaurant_id)) with check (public.is_member_of(restaurant_id));

alter table public.delivery_locations enable row level security;
drop policy if exists delivery_locations_rw on public.delivery_locations;
create policy delivery_locations_rw on public.delivery_locations
  using (exists (select 1 from public.deliveries d where d.id = delivery_id and public.is_member_of(d.restaurant_id)))
  with check (exists (select 1 from public.deliveries d where d.id = delivery_id and public.is_member_of(d.restaurant_id)));

alter table public.delivery_events enable row level security;
drop policy if exists delivery_events_rw on public.delivery_events;
create policy delivery_events_rw on public.delivery_events
  using (exists (select 1 from public.deliveries d where d.id = delivery_id and public.is_member_of(d.restaurant_id)))
  with check (exists (select 1 from public.deliveries d where d.id = delivery_id and public.is_member_of(d.restaurant_id)));

notify pgrst, 'reload schema';
