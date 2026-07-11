-- ============================================================================
-- MaitreAI — WO-T1-PAYMENTS: canonical payment-method model. ADDITIVE ONLY.
--
-- PREPARE-ONLY: this file is NOT applied to production. A separate ceremony
-- window applies it on the owner's word (mirrors 0041/0058/0059). Every object
-- is guarded by IF NOT EXISTS / CREATE OR REPLACE, so applying it later is a safe
-- no-op-on-rerun and changes NO existing row or behavior. Even once applied it is
-- inert until the STRICT per-tenant flag `canonical_payment_methods` is turned on
-- for a tenant: the resolver (lib/payments/resolve) reads these tables ONLY behind
-- that flag, and returns the legacy normalizePaymentConfig(payment_config) result
-- otherwise. Wesaya + every current tenant are byte-identical until Mohamed flips it.
--
-- Manual methods only (cod / vodafone_cash / instapay). The online-card / PSP
-- (Moyasar) stack is deliberately untouched — a separate follow-up WO.
--
-- Guardrails live in app code (write + resolve): never-all-off (a tenant can never
-- have zero enabled methods; safe default cash/COD) and snapshot immutability.
-- The snapshot table additionally enforces write-once via a BEFORE UPDATE trigger.
-- ============================================================================

-- 1. restaurant_payment_methods — one row per (restaurant, method). Canonical
--    per-tenant store of which methods a restaurant offers + each method's config
--    (vodafone_cash.number, instapay.handle, instructions). ---------------------
create table if not exists public.restaurant_payment_methods (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  method text not null check (method in ('cod','vodafone_cash','instapay')),
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, method)
);
create index if not exists restaurant_payment_methods_restaurant_idx
  on public.restaurant_payment_methods(restaurant_id);

-- 2. order_payment_snapshot — immutable per-order record of what was OFFERED and
--    what the customer CHOSE at order time, immune to later config changes. -----
create table if not exists public.order_payment_snapshot (
  order_id uuid primary key references public.orders(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  offered jsonb not null,              -- array of methods offered at order time
  chosen text,                         -- the method recorded on the order
  created_at timestamptz not null default now()
);
create index if not exists order_payment_snapshot_restaurant_idx
  on public.order_payment_snapshot(restaurant_id, created_at desc);

-- Immutability: the snapshot is write-once. Block every UPDATE at the DB level so a
-- later config edit (or any code) can never rewrite the historical selection.
create or replace function public.order_payment_snapshot_block_update()
returns trigger language plpgsql as $$
begin
  raise exception 'order_payment_snapshot is immutable (order %)', old.order_id;
end;
$$;
drop trigger if exists order_payment_snapshot_no_update on public.order_payment_snapshot;
create trigger order_payment_snapshot_no_update
  before update on public.order_payment_snapshot
  for each row execute function public.order_payment_snapshot_block_update();

-- 3. Backfill — today's IMPLICIT payment_config defaults become EXPLICIT rows,
--    losslessly. COD's implicit "on unless literally false" mirrors
--    normalizePaymentConfig (cod_enabled !== false). Idempotent (on conflict do
--    nothing) so a re-run never clobbers rows edited after the first apply. ------
insert into public.restaurant_payment_methods (restaurant_id, method, enabled, config)
select r.id, 'cod',
       coalesce((r.payment_config->>'cod_enabled') is distinct from 'false', true),
       '{}'::jsonb
from public.restaurants r
on conflict (restaurant_id, method) do nothing;

insert into public.restaurant_payment_methods (restaurant_id, method, enabled, config)
select r.id, 'vodafone_cash',
       coalesce((r.payment_config->'vodafone_cash'->>'enabled')::boolean, false),
       jsonb_build_object(
         'number', coalesce(r.payment_config->'vodafone_cash'->>'number', ''),
         'instructions', coalesce(r.payment_config->'vodafone_cash'->>'instructions', '')
       )
from public.restaurants r
on conflict (restaurant_id, method) do nothing;

insert into public.restaurant_payment_methods (restaurant_id, method, enabled, config)
select r.id, 'instapay',
       coalesce((r.payment_config->'instapay'->>'enabled')::boolean, false),
       jsonb_build_object(
         'handle', coalesce(r.payment_config->'instapay'->>'handle', ''),
         'instructions', coalesce(r.payment_config->'instapay'->>'instructions', '')
       )
from public.restaurants r
on conflict (restaurant_id, method) do nothing;

-- 4. RLS — members read/write their tenant's method rows (manager settings write
--    via the authenticated client). The snapshot is member-READ-ONLY: it is written
--    by the service role (server order-creation routes) and never editable by a
--    member — the immutability trigger blocks updates for everyone regardless. ---
alter table public.restaurant_payment_methods enable row level security;
drop policy if exists restaurant_payment_methods_rw on public.restaurant_payment_methods;
create policy restaurant_payment_methods_rw on public.restaurant_payment_methods
  using (public.is_member_of(restaurant_id)) with check (public.is_member_of(restaurant_id));

alter table public.order_payment_snapshot enable row level security;
drop policy if exists order_payment_snapshot_read on public.order_payment_snapshot;
create policy order_payment_snapshot_read on public.order_payment_snapshot
  for select using (public.is_member_of(restaurant_id));

notify pgrst, 'reload schema';
