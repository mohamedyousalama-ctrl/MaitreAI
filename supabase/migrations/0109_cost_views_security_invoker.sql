-- 0109 — cost views: enforce the querying role's RLS
-- APPLIED to production 2026-08-26 via Supabase apply_migration.
--
-- Supabase security advisor ERROR 0010 "Security Definer View".
--
-- public.v_cost_per_order and public.v_cost_per_tenant_day are owned by
-- `postgres` (rolbypassrls = true) and carried no security_invoker reloption,
-- so they ran with DEFINER semantics and bypassed RLS on their base tables
-- (orders, agent_runs, usage_cost_events — each RLS-enabled with a single
-- tenant-scoped SELECT policy via is_member_of()).
--
-- Both `anon` and `authenticated` hold SELECT on both views and public is
-- exposed through PostgREST, so an anon-key GET returned every tenant's cost
-- and token data, ignoring is_member_of() entirely.
--
-- security_invoker makes each read enforce the RLS of the querying role: anon
-- gets 0 rows, a member gets only their own tenant, service_role and postgres
-- are unaffected (both carry rolbypassrls).
--
-- Verified before applying: no application code reads either view. A repo-wide
-- search returns only 0096_cost_views.sql (which creates them) and a test that
-- regex-matches that file's text without opening a connection.

alter view public.v_cost_per_order      set (security_invoker = on);
alter view public.v_cost_per_tenant_day set (security_invoker = on);
