-- ============================================================================
-- 0044 — orders.is_test (UI4 test/synthetic-order marker)
--
-- Adds a single boolean that lets staff mark an order as a TEST/synthetic one so
-- rehearsal orders never inflate real reports (revenue, order counts, source
-- breakdown, COD). Additive + NOT NULL DEFAULT false → every existing and future
-- order is non-test unless a manager explicitly marks it. The flag is set ONLY
-- server-side via an authenticated manager action (POST /api/orders/[id]/test);
-- a customer-placed order is never test.
--
-- No RLS change: orders' existing tenant policies already govern this column.
-- No backfill, no data touched. PREPARE-ONLY — review before prod apply.
-- ============================================================================

alter table public.orders add column if not exists is_test boolean not null default false;

-- Rollback (manual; not auto-run):
--   alter table public.orders drop column if exists is_test;
