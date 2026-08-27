-- 0114 — close the hole 0113 left open.
-- APPLIED to production 2026-08-27 via Supabase apply_migration (version 20260827040722).
--
-- 0113 said `revoke all on function public.next_order_number(uuid) from public`
-- and granted service_role. That LOOKED exclusive and was not. Supabase ships
-- ALTER DEFAULT PRIVILEGES that grant EXECUTE on every new function in `public`
-- directly to `anon` and `authenticated` — not via the PUBLIC pseudo-role — so
-- revoking from PUBLIC does not touch them. A `revoke … from public` on a
-- Supabase project is close to a no-op for these two roles.
--
-- Verified exploitable BEFORE this migration:
--   begin; set local role anon;
--   select public.next_order_number('<wesaya-uuid>');  -- returned 1130
--   select public.next_order_number('<wesaya-uuid>');  -- returned 1131
--   rollback;                                          -- counter confirmed back at 1129
-- PostgREST exposes /rest/v1/rpc/<name>, so anyone holding the publishable
-- browser key could burn another tenant's order numbers without limit. Pushed
-- far enough it is worse than noise: the unique index from 0113 means a counter
-- driven below a tenant's real max makes order creation fail outright.
--
-- Verified closed AFTER: as anon, `42501: permission denied for function
-- next_order_number`; as service_role, two calls still returned 1130 and 1131.
--
-- The function is SECURITY DEFINER and a MUTATOR. Only the server may call it.
--
-- LESSON, worth carrying to every future migration in this repo: on Supabase,
-- `revoke … from public` does not imply anon/authenticated. Name them.

revoke all on function public.next_order_number(uuid) from anon, authenticated;

-- Defence in depth on the counter itself. RLS-on-with-no-policy already denies
-- anon/authenticated for SELECT/INSERT/UPDATE/DELETE, but RLS does not gate
-- TRUNCATE, and the stock Supabase grant includes it. Nothing reaches this table
-- except the definer function, which runs as its owner and is unaffected.
revoke all on table public.order_number_counters from anon, authenticated;
