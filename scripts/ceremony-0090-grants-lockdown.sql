-- ============================================================================
-- WO-GRANTS-LOCKDOWN — 0090 ceremony VALIDATION script (STAGING / EPHEMERAL ONLY).
--
-- ⚠️  NEVER run against the production DB. This is the behavioral proof the founder
--     runs on a throwaway/staging copy DURING the apply ceremony, wrapped in
--     BEGIN…ROLLBACK so it mutates nothing. It is NOT a migration (lives in scripts/,
--     not supabase/migrations/, so the runner never picks it up).
--
-- It proves, with SET ROLE, that AFTER 0090:
--   • anon              CANNOT execute reset_restaurant / seed_demo_restaurant (permission denied)
--   • authenticated non-member → reset's internal guard RAISES "not authorized"
--   • authenticated MANAGER → reset succeeds (the legit resetAll() path is preserved)
--   • service_role      → both succeed (server path intact)
--
-- Usage (staging):
--   psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=0 -f scripts/ceremony-0090-grants-lockdown.sql
-- Replace the :ids below with real staging rows first, or seed them inside the txn.
-- ============================================================================

begin;

-- 0. Apply the lockdown inside the transaction (mirrors 0090_grants_lockdown.sql).
revoke execute on function public.reset_restaurant(uuid) from public;
revoke execute on function public.reset_restaurant(uuid) from anon;
grant  execute on function public.reset_restaurant(uuid) to authenticated;
grant  execute on function public.reset_restaurant(uuid) to service_role;
revoke execute on function public.seed_demo_restaurant(uuid) from public;
revoke execute on function public.seed_demo_restaurant(uuid) from anon, authenticated;
grant  execute on function public.seed_demo_restaurant(uuid) to service_role;

-- Pick a real staging restaurant + its manager's user_id, and a non-member user_id.
\set staging_restaurant_id '00000000-0000-0000-0000-000000000000'
\set manager_user_id       '00000000-0000-0000-0000-000000000000'
\set nonmember_user_id     '11111111-1111-1111-1111-111111111111'

-- --- ANON: both functions must be DENIED at the grant layer -------------------------
set role anon;
-- EXPECT: ERROR permission denied for function reset_restaurant
do $$ begin
  perform public.reset_restaurant(:'staging_restaurant_id'::uuid);
  raise notice 'FAIL: anon executed reset_restaurant (should have been denied)';
exception when insufficient_privilege then raise notice 'PASS: anon denied reset_restaurant';
end $$;
-- EXPECT: ERROR permission denied for function seed_demo_restaurant
do $$ begin
  perform public.seed_demo_restaurant(:'nonmember_user_id'::uuid);
  raise notice 'FAIL: anon executed seed_demo_restaurant (should have been denied)';
exception when insufficient_privilege then raise notice 'PASS: anon denied seed_demo_restaurant';
end $$;
reset role;

-- --- AUTHENTICATED NON-MEMBER: reset reaches the body, guard RAISES ------------------
-- (Simulate the authenticated JWT context: request.jwt.claim.sub = a non-member uid.)
set role authenticated;
select set_config('request.jwt.claim.sub', :'nonmember_user_id', true);
do $$ begin
  perform public.reset_restaurant(:'staging_restaurant_id'::uuid);
  raise notice 'FAIL: non-member reset succeeded (guard did not fire)';
exception
  when insufficient_privilege then raise notice 'NOTE: non-member denied at grant layer (also acceptable)';
  when others then raise notice 'PASS: non-member reset RAISED (%）', sqlerrm;  -- expect "not authorized to reset this restaurant"
end $$;
-- authenticated must ALSO be denied seed_demo_restaurant (server-only)
do $$ begin
  perform public.seed_demo_restaurant(:'nonmember_user_id'::uuid);
  raise notice 'FAIL: authenticated executed seed_demo_restaurant (should be server-only)';
exception when insufficient_privilege then raise notice 'PASS: authenticated denied seed_demo_restaurant';
end $$;
reset role;

-- --- AUTHENTICATED MANAGER: the legit resetAll() path still works --------------------
set role authenticated;
select set_config('request.jwt.claim.sub', :'manager_user_id', true);
do $$ begin
  perform public.reset_restaurant(:'staging_restaurant_id'::uuid);
  raise notice 'PASS: authenticated MANAGER reset succeeded (resetAll preserved)';
exception when others then raise notice 'FAIL: manager reset failed (%）', sqlerrm;
end $$;
reset role;

-- --- SERVICE_ROLE: server path intact for the seeder --------------------------------
set role service_role;
do $$ begin
  perform public.seed_demo_restaurant(:'nonmember_user_id'::uuid);
  raise notice 'PASS: service_role seed_demo_restaurant succeeded (server path intact)';
exception when others then raise notice 'FAIL: service_role seed failed (%）', sqlerrm;
end $$;
reset role;

-- Mutate NOTHING — this is validation only.
rollback;
