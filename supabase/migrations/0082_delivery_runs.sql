-- ============================================================================
-- MaitreAI — WO-DELIVERY-D2: multi-order delivery RUNS (additive).
--
-- Spec §3 (multi-order drivers) + §5 (data). A RUN is a GROUPING over existing
-- deliveries rows — NOT a rewrite: each delivery keeps its own driver_token /
-- customer_token / status chain / COD ledger row. A driver carries up to 3
-- deliveries per run (cap enforced in the assign engine, not here).
--
--   1. delivery_runs — one row per run: its driver, status, and a run_token that
--      authenticates the /d run stop-list PAGE (per-stop ACTIONS still carry each
--      delivery's own existing driver_token — the existing auth model is untouched).
--
--   2. deliveries gains run_id + stop_order (the grouping + stop sequence) and
--      cod_collected (the per-stop «حصّلت» UI/audit flag). ALL nullable / defaulted,
--      so a single-delivery row (no run) is byte-identical to today. cod_collected
--      COMPLEMENTS the cod_collections ledger (0029) — it is the driver-tapped UI
--      state, never the money record; captureCodOnDelivered + the ledger are
--      untouched and remain the source of truth for cash.
--
-- Additive — touches no existing rows. RLS: delivery_runs is member-scoped like the
-- other delivery tables (0031). Token endpoints write via the service role (bypasses
-- RLS), exactly as the per-delivery token paths do today.
--
-- ⚠️ PREPARE ONLY — PM reserves 0082; apply is a separate approved event. Not
-- auto-applied. Validate via BEGIN…ROLLBACK on dev before any prod (Wesaya) apply.
-- ============================================================================

-- 1. delivery_runs — a driver's multi-stop run (grouping over deliveries) ------
create table if not exists public.delivery_runs (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  driver_id     uuid references public.drivers(id) on delete set null,
  status        text not null default 'active',   -- active | completed | cancelled
  -- Authenticates the /d run stop-list page (same one-time-link pattern as the
  -- per-delivery driver_token). Time-bound via expires_at (12h, mirrors deliveries).
  run_token     text unique,
  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists delivery_runs_restaurant_idx on public.delivery_runs(restaurant_id);
create index if not exists delivery_runs_driver_idx on public.delivery_runs(driver_id);

-- 2. deliveries gains the run grouping + per-stop COD flag --------------------
alter table public.deliveries add column if not exists run_id uuid references public.delivery_runs(id) on delete set null;
alter table public.deliveries add column if not exists stop_order int;
alter table public.deliveries add column if not exists cod_collected boolean not null default false;
create index if not exists deliveries_run_idx on public.deliveries(run_id, stop_order);

-- RLS: member-scoped read+write (mirrors deliveries/drivers in 0031_delivery.sql).
alter table public.delivery_runs enable row level security;
drop policy if exists delivery_runs_rw on public.delivery_runs;
create policy delivery_runs_rw on public.delivery_runs
  using (public.is_member_of(restaurant_id))
  with check (public.is_member_of(restaurant_id));

-- ── Rollback (commented) ────────────────────────────────────────────────────
-- alter table public.deliveries drop column if exists cod_collected;
-- alter table public.deliveries drop column if exists stop_order;
-- alter table public.deliveries drop column if exists run_id;
-- drop table if exists public.delivery_runs;
