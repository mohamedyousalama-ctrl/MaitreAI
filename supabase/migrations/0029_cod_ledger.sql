-- ============================================================================
-- MaitreAI — COD Cash Ledger (basic). ADDITIVE ONLY.
-- Track cash-on-delivery per driver: expected vs collected, who hasn't settled.
-- COD is the Egypt spine; cash reconciliation is the near-term value.
--
-- Composes with the delivery module (PR #6): a COD collection optionally links to
-- a `deliveries` row + `drivers` row. Those are referenced as SOFT uuids (no hard
-- FK) so this migration applies on any branch and the two modules compose once
-- delivery merges — same decoupling the order session uses for menu item ids.
-- Hard FKs only to always-present parents (restaurants, orders).
--
-- Money guardrail: expected_cash is copied from the order's tool-computed total
-- (orders.total — incl. delivery fee + VAT). The model never authors a cash figure.
-- Every cash event (collected / settled / adjusted) writes an append-only audit row.
-- Idempotent. NOTE: this schema is ALREADY APPLIED to production (re-ported from the
-- pre-divergence PR #8 onto current main); kept in-repo for parity and the IF NOT
-- EXISTS guards make a re-run a no-op. The auto capture-on-delivered hook (driver
-- link via `deliveries`/`drivers`) wires in when PR #6 (delivery) is re-ported.
-- ============================================================================

-- 1. Payment method on the order (additive) -----------------------------------
-- 'cod' marks a cash-on-delivery order; null/other = online/unknown. Status stays
-- the order's existing payment_status; this only records the METHOD.
alter table public.orders add column if not exists payment_method text;

-- 2. cod_collections — one cash record per COD order --------------------------
create table if not exists public.cod_collections (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  delivery_id uuid,                              -- soft ref → deliveries(id) (PR #6)
  driver_id uuid,                                -- soft ref → drivers(id): who holds the cash
  driver_name text,                              -- snapshot for the ledger view
  expected_cash numeric(12,2) not null,          -- = orders.total (tool-computed)
  cash_collected numeric(12,2),                  -- actual received; null until delivered
  collected_at timestamptz,
  -- pending (awaiting delivery) | held_by_driver (collected, unsettled) | settled
  settlement_status text not null default 'pending',
  settlement_id uuid,                            -- soft ref → cod_settlements(id)
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id)
);
create index if not exists cod_collections_restaurant_idx on public.cod_collections(restaurant_id);
create index if not exists cod_collections_driver_idx     on public.cod_collections(driver_id);
create index if not exists cod_collections_status_idx      on public.cod_collections(restaurant_id, settlement_status);

-- 3. cod_settlements — one row per "driver handed cash in" action --------------
create table if not exists public.cod_settlements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  driver_id uuid,                                -- soft ref → drivers(id)
  driver_name text,
  total_amount numeric(12,2) not null default 0, -- sum of cash_collected settled
  order_count int not null default 0,
  settled_by uuid,                               -- operator auth user id
  settled_by_role text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists cod_settlements_restaurant_idx on public.cod_settlements(restaurant_id, created_at desc);
create index if not exists cod_settlements_driver_idx     on public.cod_settlements(driver_id);

-- 4. cod_cash_events — append-only audit of every cash event -------------------
create table if not exists public.cod_cash_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  cod_collection_id uuid,                        -- soft ref → cod_collections(id)
  driver_id uuid,
  type text not null,                            -- collected | settled | adjusted
  amount numeric(12,2),                          -- cash amount for this event
  expected numeric(12,2),                        -- expected at the time (discrepancy trail)
  actor_user_id uuid,
  actor_role text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cod_cash_events_restaurant_idx on public.cod_cash_events(restaurant_id, created_at desc);
create index if not exists cod_cash_events_collection_idx  on public.cod_cash_events(cod_collection_id);

-- RLS — members read/write their tenant's COD rows; the service role (the
-- delivery driver-link capture hook) bypasses RLS.
alter table public.cod_collections enable row level security;
drop policy if exists cod_collections_rw on public.cod_collections;
create policy cod_collections_rw on public.cod_collections
  using (public.is_member_of(restaurant_id)) with check (public.is_member_of(restaurant_id));

alter table public.cod_settlements enable row level security;
drop policy if exists cod_settlements_rw on public.cod_settlements;
create policy cod_settlements_rw on public.cod_settlements
  using (public.is_member_of(restaurant_id)) with check (public.is_member_of(restaurant_id));

alter table public.cod_cash_events enable row level security;
drop policy if exists cod_cash_events_rw on public.cod_cash_events;
create policy cod_cash_events_rw on public.cod_cash_events
  using (public.is_member_of(restaurant_id)) with check (public.is_member_of(restaurant_id));

notify pgrst, 'reload schema';
