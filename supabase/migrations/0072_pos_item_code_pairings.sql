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
-- The composite FKs below reference menu_items(restaurant_id, id), which needs an
-- explicit UNIQUE constraint on those columns (id alone is the PK, so this is a
-- trivially-satisfied redundant unique — but a FK target must be a real unique/PK
-- CONSTRAINT, not just an index). Idempotent add.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'menu_items_restaurant_id_id_key'
  ) then
    alter table public.menu_items
      add constraint menu_items_restaurant_id_id_key unique (restaurant_id, id);
  end if;
end $$;

create table if not exists public.item_pairings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  item_id uuid not null,
  paired_item_id uuid not null,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  -- One pairing per ordered (item → paired_item) within a tenant; no self-pairing.
  unique (restaurant_id, item_id, paired_item_id),
  constraint item_pairings_no_self check (item_id <> paired_item_id),
  -- TENANT-OWNERSHIP enforced at the DB (Codex P2): a single-column FK to
  -- menu_items(id) would only prove the item EXISTS, not that it belongs to THIS
  -- row's restaurant. Composite FKs to menu_items(restaurant_id, id) guarantee
  -- both endpoints are the SAME tenant's items — so a cross-tenant pairing can
  -- never be inserted (even by the service role) and leaked via the read policy.
  -- ON DELETE CASCADE: removing a menu item drops its pairings (no dangling row).
  constraint item_pairings_item_fk foreign key (restaurant_id, item_id)
    references public.menu_items(restaurant_id, id) on delete cascade,
  constraint item_pairings_paired_fk foreign key (restaurant_id, paired_item_id)
    references public.menu_items(restaurant_id, id) on delete cascade
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
