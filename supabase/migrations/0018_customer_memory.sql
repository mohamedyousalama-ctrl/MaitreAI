-- ============================================================================
-- MaitreAI — Learning System Piece 4: Customer Memory (ADDITIVE ONLY).
-- Per-customer, tenant-scoped memory so «كريم» recognizes a returning diner.
-- REUSES the existing customers table (phone, name, language, notes, ltv,
-- orders_count, last_seen_at already there) — we add only what's missing — and
-- DERIVES order history from the existing orders table (no duplication). A small
-- preferences child table captures observed/stated traits. Idempotent.
-- Privacy: tenant-scoped + RLS; allergies are stored but the agent still verifies
-- allergen facts from the menu, never from memory. (0016 delivery / 0017 brain.)
-- ============================================================================

-- 1. Profile fields the customers table doesn't already have -------------------
alter table public.customers add column if not exists last_order_at  timestamptz;
alter table public.customers add column if not exists usual_address  text;
-- (orders_count, ltv, name, language, notes, last_seen_at already exist — reused.)

-- 2. customer_preferences — observed/stated traits ----------------------------
create table if not exists public.customer_preferences (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  -- favorite_item | modifier | spice | allergy | dietary | no_onion | other
  type text not null,
  value text not null,
  source text not null default 'observed',  -- observed | stated | owner_note
  confidence int not null default 1,         -- how many times observed (truthful weighting)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, type, value)
);
create index if not exists customer_preferences_customer_idx on public.customer_preferences(customer_id);
create index if not exists customer_preferences_restaurant_idx on public.customer_preferences(restaurant_id);

-- RLS — members read/write their tenant's customer preferences; the service role
-- (the order-finalize populator + the agent read) bypasses RLS.
alter table public.customer_preferences enable row level security;
drop policy if exists customer_preferences_rw on public.customer_preferences;
create policy customer_preferences_rw on public.customer_preferences
  using (public.is_member_of(restaurant_id)) with check (public.is_member_of(restaurant_id));

notify pgrst, 'reload schema';
