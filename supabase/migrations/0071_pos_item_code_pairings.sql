-- ============================================================================
-- Kivo — WO-7: POS item-code mapping + tenant-owned item pairings.
-- PREPARE-ONLY: NOT applied (joins the off-peak apply batch).
--
-- (1) menu_items.pos_item_code — maps a Kivo menu item to the external POS
--     (Deyafa) item code, for the kitchen cutover / POS hand-off. Nullable,
--     additive; unique PER TENANT when set so a POS code can't map to two items
--     in the same restaurant (nulls allowed, cross-tenant independent). No grant
--     needed — menu_items uses table-level grants, so the new column is covered.
--
-- (2) item_pairings — turns the AI "pairing" suggestion into TENANT-OWNED DATA
--     (the market-knowledge ≠ menu-truth law): a pairing is a real (item →
--     paired_item) row the tenant owns, not model knowledge. Members READ their
--     tenant's pairings; writes are service-role only (no client write policy).
--
-- All additive + idempotent. No behavior change until code reads these.
-- ============================================================================

-- (1) POS item-code mapping ---------------------------------------------------
alter table public.menu_items
  add column if not exists pos_item_code text;

-- A POS code is unique within a tenant (when present); nulls are allowed and a
-- code may repeat across tenants (each restaurant maps its own POS independently).
create unique index if not exists menu_items_pos_item_code_key
  on public.menu_items(restaurant_id, pos_item_code)
  where pos_item_code is not null;

-- (2) tenant-owned item pairings ----------------------------------------------
create table if not exists public.item_pairings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  -- Both endpoints are REAL menu items of this tenant; a deleted item cascades
  -- its pairings away (a pairing to a gone item is never a dangling suggestion).
  item_id uuid not null references public.menu_items(id) on delete cascade,
  paired_item_id uuid not null references public.menu_items(id) on delete cascade,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  -- One pairing per ordered (item → paired_item) within a tenant; no self-pairing.
  unique (restaurant_id, item_id, paired_item_id),
  constraint item_pairings_no_self check (item_id <> paired_item_id)
);

create index if not exists item_pairings_item_idx
  on public.item_pairings(restaurant_id, item_id);

-- RLS: members read their tenant's pairings (audit/surface); the service role
-- (menu tooling) bypasses RLS for writes. No client write policy.
alter table public.item_pairings enable row level security;
drop policy if exists item_pairings_read on public.item_pairings;
create policy item_pairings_read on public.item_pairings
  for select using (public.is_member_of(restaurant_id));

notify pgrst, 'reload schema';
