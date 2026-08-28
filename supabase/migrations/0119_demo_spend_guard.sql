-- ============================================================================
-- 0119 — spend guard + kill switch for the PUBLIC Khalid demo.
--
-- WHY THIS TABLE EXISTS
-- ---------------------
-- /api/demo/turn is unauthenticated by design: the Founder needs a link he can
-- send to a restaurant owner with no login. The route already caps input length,
-- which is what bounds the cost of any SINGLE turn. Nothing bounds the NUMBER of
-- turns.
--
-- lib/rate-limit.ts cannot be that bound. Its own header says it is "explicitly
-- NOT a distributed rate limiter": it is a process-local Map that resets on every
-- cold start and is not shared between concurrent lambdas. On Vercel an attacker
-- gets roughly (limit x warm instances) and can force fresh ones. It is a useful
-- pre-filter and it is not a cap.
--
-- A cap has to be durable and shared, which means the database.
--
-- TWO CAPS, DELIBERATELY
--   - per-IP hourly: stops one person hammering it.
--   - GLOBAL daily: stops a botnet. This is the one that protects the card. A
--     per-IP limit alone is defeated by any number of source addresses, so the
--     global ceiling is the real control and the per-IP one is courtesy.
--
-- KILL SWITCH
-- `demo_controls.enabled` is read on every turn, so the demo can be stopped in
-- seconds by flipping one boolean — no redeploy, no env change, no build. That
-- matters because every other stop mechanism available here needs a deploy.
--
-- GRANTS — READ THIS BEFORE COPYING
-- The grant idiom is taken from 0114, NOT from 0113. 0113 said
-- `revoke all ... from public` and that LOOKED exclusive and was not: Supabase
-- ships ALTER DEFAULT PRIVILEGES that grant EXECUTE on every new function in
-- `public` DIRECTLY to anon and authenticated, so revoking from PUBLIC never
-- touches them. That gap shipped as a live security hole and was closed in 0114.
-- Both revokes are required and neither implies the other.
-- ============================================================================

-- ── counters ────────────────────────────────────────────────────────────────
create table if not exists public.demo_usage_counters (
  bucket     text        primary key,   -- 'global:YYYY-MM-DD' | 'ip:<addr>:YYYY-MM-DDTHH'
  turns      bigint      not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.demo_usage_counters enable row level security;
-- No policy, deliberately: service-role only. RLS-on-with-no-policy denies every
-- anon/authenticated SELECT/INSERT/UPDATE/DELETE. Note RLS does NOT gate TRUNCATE,
-- which is why the explicit revoke below is not redundant.

-- ── kill switch ─────────────────────────────────────────────────────────────
create table if not exists public.demo_controls (
  id         boolean     primary key default true check (id),  -- single-row table
  enabled    boolean     not null default true,
  reason     text,
  updated_at timestamptz not null default now()
);

alter table public.demo_controls enable row level security;

insert into public.demo_controls (id, enabled) values (true, true)
on conflict (id) do nothing;

-- ── atomic consume ──────────────────────────────────────────────────────────
-- Returns whether this turn may proceed, and why not when it may not.
--
-- The kill switch is checked FIRST and returns without incrementing: a disabled
-- demo should not accumulate counts, so re-enabling does not start mid-quota.
--
-- Each counter uses INSERT ... ON CONFLICT DO UPDATE ... RETURNING, which takes a
-- row lock, so concurrent callers serialise on the bucket rather than racing a
-- read-then-write. Same shape as next_order_number in 0113.
create or replace function public.kv_demo_try_consume(
  p_ip_bucket     text,
  p_global_bucket text,
  p_ip_limit      bigint,
  p_global_limit  bigint
)
returns table (allowed boolean, reason text, global_turns bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_enabled bigint;
  v_global  bigint;
  v_ip      bigint;
begin
  select case when c.enabled then 1 else 0 end into v_enabled
  from public.demo_controls c where c.id = true;

  if coalesce(v_enabled, 1) = 0 then
    return query select false, 'disabled'::text, 0::bigint;
    return;
  end if;

  insert into public.demo_usage_counters as g (bucket, turns)
  values (p_global_bucket, 1)
  on conflict (bucket) do update set turns = g.turns + 1, updated_at = now()
  returning g.turns into v_global;

  if v_global > p_global_limit then
    return query select false, 'global_cap'::text, v_global;
    return;
  end if;

  insert into public.demo_usage_counters as i (bucket, turns)
  values (p_ip_bucket, 1)
  on conflict (bucket) do update set turns = i.turns + 1, updated_at = now()
  returning i.turns into v_ip;

  if v_ip > p_ip_limit then
    return query select false, 'ip_cap'::text, v_global;
    return;
  end if;

  return query select true, null::text, v_global;
end;
$$;

-- ── grants: BOTH revokes, per 0114 ──────────────────────────────────────────
revoke all on function public.kv_demo_try_consume(text, text, bigint, bigint) from public;
revoke all on function public.kv_demo_try_consume(text, text, bigint, bigint) from anon, authenticated;
grant execute on function public.kv_demo_try_consume(text, text, bigint, bigint) to service_role;

revoke all on table public.demo_usage_counters from public;
revoke all on table public.demo_usage_counters from anon, authenticated;
revoke all on table public.demo_controls        from public;
revoke all on table public.demo_controls        from anon, authenticated;
