-- 0117 — make the order-number uniqueness index TOTAL, not partial.
-- APPLIED to production 2026-08-27 via Supabase apply_migration.
--
-- 0113 created it as:
--   create unique index … on public.orders (restaurant_id, order_number)
--     where order_number is not null;
--
-- public.orders.order_number is `text NOT NULL` (0001_init). The predicate is
-- therefore always true and buys nothing — but it is not merely cosmetic:
-- Postgres will not use a PARTIAL index as an ON CONFLICT arbiter unless the
-- statement repeats the same predicate. So the partial form quietly forecloses
-- the obvious future handling of a collision:
--
--   insert into orders (…) values (…)
--   on conflict (restaurant_id, order_number) do nothing;
--
-- which raised 42P10 "there is no unique or exclusion constraint matching the
-- ON CONFLICT specification" rather than doing what it reads like.
--
-- Create the replacement FIRST, then drop the old one, so the table is never
-- without a uniqueness backstop — not even for the microseconds a
-- drop-then-create would open on a table that takes live orders.
--
-- Verified before applying: 141 rows, 0 null order_numbers, 0 duplicate
-- (restaurant_id, order_number) pairs — so the new index could not fail to build.
--
-- Verified after applying, all rolled back: a duplicate (restaurant_id,
-- order_number) is still refused with 23505; `on conflict (restaurant_id,
-- order_number)` now resolves instead of raising 42P10; and the same number is
-- still free for a different tenant, so uniqueness stayed per-tenant.

create unique index if not exists orders_restaurant_order_number_uniq
  on public.orders (restaurant_id, order_number);

drop index if exists public.orders_restaurant_order_number_key;
