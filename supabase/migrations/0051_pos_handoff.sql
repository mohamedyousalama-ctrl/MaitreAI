-- ============================================================================
-- 0051 — orders POS-handoff tracking (WB1, Deyafa cutover safety)
--
-- During the gradual Kivo cutover, Wesaya staff still RE-ENTER Kivo-confirmed
-- orders into the Deyafa POS for the kitchen/accounting. Nothing tracked that
-- step, so a Kivo-confirmed order could read as "done" while the kitchen never
-- got it — the #1 cutover danger. These columns make the POS hand-off VISIBLE
-- and separate from the order's own status.
--
-- pos_status is a SEPARATE state from orders.order_status (do not conflate):
--   not_entered      — confirmed in Kivo but NOT yet entered in Deyafa (kitchen
--                      doesn't have it) — the warning state.
--   entered          — staff entered it in Deyafa (pos_reference = Deyafa order #).
--   sent_to_kitchen  — optionally marked as handed to the kitchen.
--
-- Additive + NOT NULL DEFAULT 'not_entered' → every existing AND future order
-- starts not_entered (no backfill, no data touched). The actor + time + Deyafa
-- reference are stamped SERVER-SIDE via an authenticated staff action
-- (POST /api/orders/[id]/pos); never client-trusted. A CHECK constrains the three
-- valid values at the DB layer. No money/status/totals touched.
--
-- No RLS change: orders' existing tenant policies already govern these columns.
-- PREPARE-ONLY — review before prod apply.
-- ============================================================================

alter table public.orders add column if not exists pos_status text not null default 'not_entered';
alter table public.orders add column if not exists pos_reference text;          -- Deyafa order #, nullable
alter table public.orders add column if not exists pos_entered_by uuid;          -- acting member/user id (soft ref), nullable
alter table public.orders add column if not exists pos_entered_at timestamptz;   -- when entered, nullable

-- Constrain to the three valid states (additive; every existing row is the
-- default 'not_entered', so this validates instantly with no violation).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_pos_status_chk'
  ) then
    alter table public.orders
      add constraint orders_pos_status_chk
      check (pos_status in ('not_entered', 'entered', 'sent_to_kitchen'));
  end if;
end $$;

-- Rollback (manual; not auto-run):
--   alter table public.orders drop constraint if exists orders_pos_status_chk;
--   alter table public.orders drop column if exists pos_entered_at;
--   alter table public.orders drop column if exists pos_entered_by;
--   alter table public.orders drop column if exists pos_reference;
--   alter table public.orders drop column if exists pos_status;
