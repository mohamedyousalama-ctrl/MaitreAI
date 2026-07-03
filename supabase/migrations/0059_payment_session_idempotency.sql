-- ============================================================================
-- Kivo (KSA) — WO-3b: payment-session idempotency (partial unique index)
--
-- PREPARE-ONLY: NOT applied. Enforces AT MOST ONE active payment session per
-- (restaurant_id, order_id) so retries / double-clicks / at-least-once callers
-- can never mint duplicate Moyasar invoices for one order. The application does
-- insert-first and, on the resulting unique_violation (23505), reuses the
-- winning active session — this index is what makes that race-safe (the DB, not
-- a read-then-write check, arbitrates the winner).
--
-- The WHERE predicate set MUST equal ACTIVE_STATUSES in lib/payments.ts
-- ('created','link_sent','opened') — a unit test parses this file and asserts
-- the two match, so they can't drift. Terminal statuses (paid/failed/expired/
-- cancelled/refunded) are deliberately EXCLUDED so a NEW session is allowed once
-- a prior one resolves (e.g. after expiry); "already paid" is handled in app
-- code, not by this index.
--
-- APPLY (when eventually applied, off-peak, propose→approve), run MANUALLY —
-- built with CREATE UNIQUE INDEX CONCURRENTLY so the build does NOT take a write
-- lock on the live payment_sessions table. Notes for the operator:
--   • CONCURRENTLY cannot run inside a transaction block — apply it on its own,
--     NOT wrapped in BEGIN…COMMIT (and not via a migration runner that wraps
--     each file in a transaction).
--   • PRECONDITION: first verify no existing (restaurant_id, order_id) has >1
--     active session, or the unique build fails (leaving an INVALID index that
--     IF NOT EXISTS would then skip — drop it before retrying). See the apply
--     plan for the exact dedup check.
--   • This index also constrains legacy mock sessions on the same table; that is
--     intended (one active session per order, globally).
-- ============================================================================

create unique index concurrently if not exists payment_sessions_active_order_uniq
  on public.payment_sessions (restaurant_id, order_id)
  where status in ('created', 'link_sent', 'opened');
