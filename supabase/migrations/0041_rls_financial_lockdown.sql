-- ============================================================================
-- MaitreAI — 0041 RLS financial/integrity lockdown (M1.7)
--
-- ⚠️  NOT YET APPLIED. This migration runs against LIVE Wesaya production and
--     requires Mohamed's explicit sign-off BEFORE it is applied. Do not apply on
--     merge. Apply manually only after approval.
--
-- Makes the 7 money/integrity tables READ-ONLY for the member role: members keep
-- SELECT; the permissive `<table>_rw` (FOR ALL) write policy is dropped and
-- replaced with a SELECT-only policy. The service-role key BYPASSES RLS, so the
-- admin server routes (COD settle/collect/capture-delivered, /api/orders/[id]/
-- status|payment|cancel, /api/payments/[sessionId], agent_runs logging) keep
-- writing unaffected. This is the migration step of the M1.7 sequence; the
-- code-first PRs (#205 COD, #206 orders, #207 payment_sessions, #208 agent_runs)
-- moved every live write off the member/browser client first.
--
-- PRECONDITION VERIFIED (2026-06-27):
--   • All 7 tables currently have exactly ONE policy: `<table>_rw` cmd=ALL
--     roles={public} using=is_member_of(restaurant_id) with_check=same.
--   • No separate SELECT policy exists → we MUST create one or members lose read.
--   • RLS is already enabled on all 7 (relrowsecurity=true).
--   • Every live write path is service-role admin (code audit).
--
-- Idempotent: drop-if-exists guards + enable-RLS make a re-run a no-op.
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'orders','order_events','payment_sessions','agent_runs',
    'cod_collections','cod_settlements','cod_cash_events'
  ] loop
    -- RLS is already on; assert it (idempotent, deny-by-default for non-bypass roles).
    execute format('alter table public.%I enable row level security;', t);
    -- Remove the permissive read+write FOR ALL policy (the member write capability).
    execute format('drop policy if exists %1$s_rw on public.%1$s;', t);
    -- Members KEEP read. service_role bypasses RLS, so it still writes; the member
    -- role now has SELECT only (no INSERT/UPDATE/DELETE policy → those are denied).
    execute format('drop policy if exists %1$s_read on public.%1$s;', t);
    execute format(
      'create policy %1$s_read on public.%1$s
         for select using (public.is_member_of(restaurant_id));', t);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK (run manually to instantly revert — restores member read+write).
-- Recreates the exact prior `<table>_rw` FOR ALL policy on all 7 tables.
-- ============================================================================
-- do $$
-- declare t text;
-- begin
--   foreach t in array array[
--     'orders','order_events','payment_sessions','agent_runs',
--     'cod_collections','cod_settlements','cod_cash_events'
--   ] loop
--     execute format('drop policy if exists %1$s_read on public.%1$s;', t);
--     execute format('drop policy if exists %1$s_rw on public.%1$s;', t);
--     execute format(
--       'create policy %1$s_rw on public.%1$s
--          using (public.is_member_of(restaurant_id))
--          with check (public.is_member_of(restaurant_id));', t);
--   end loop;
-- end $$;
-- notify pgrst, 'reload schema';
