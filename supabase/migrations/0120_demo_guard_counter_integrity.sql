-- ============================================================================
-- 0120 — demo spend guard: count only turns we actually served, and fail CLOSED.
--
-- Replaces kv_demo_try_consume from 0119. Same signature and same return shape, so
-- no application code changes. Three defects, all found in the pre-deploy audit:
--
--  1. DENIAL OF DEMO. The GLOBAL counter was incremented on the way in and never
--     rolled back when the per-IP check then rejected the turn. Combined with the
--     routes consuming the guard before validating the body, a junk request burned
--     one of the day's slots for free. Roughly a thousand of them — trivially spread
--     across an IPv6 /64, so no per-IP cap ever engages — took the demo dark until
--     00:00 UTC with no auto-recovery. The routes now validate first; this makes the
--     counter itself honest, so neither half relies on the other.
--
--  2. THE KILL SWITCH FAILED OPEN. `coalesce(v_enabled, 1) = 0` treats a MISSING
--     controls row as enabled. Delete the row and `update demo_controls set
--     enabled = false` reports "UPDATE 0" while the demo keeps serving — the operator
--     believes it is stopped and it is not. A stop switch must fail closed.
--
--  3. THE COUNTER DID NOT MEAN WHAT IT SAYS. It counted requests seen, not turns
--     served, so anyone reading it to decide whether to raise the cap was reading
--     the wrong number. Rejections are now refunded.
--
-- Order matters: per-IP is checked FIRST because it is the cheap, self-limiting one;
-- the global counter — the one that actually protects the card — is only touched once
-- a request has cleared every other check.
-- ============================================================================

create or replace function public.kv_demo_try_consume(
  p_ip_bucket text,
  p_global_bucket text,
  p_ip_limit bigint,
  p_global_limit bigint
)
returns table (allowed boolean, reason text, global_turns bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_ip bigint;
  v_global bigint;
begin
  select c.enabled into v_enabled from public.demo_controls c where c.id = true;

  -- FAIL CLOSED: NULL here means the controls row is absent, not that the demo is on.
  if v_enabled is null or v_enabled = false then
    return query select false, 'disabled'::text, 0::bigint;
    return;
  end if;

  insert into public.demo_usage_counters as i (bucket, turns)
  values (p_ip_bucket, 1)
  on conflict (bucket) do update set turns = i.turns + 1, updated_at = now()
  returning i.turns into v_ip;

  if v_ip > p_ip_limit then
    -- Refund: this turn was not served, so it must not inflate the bucket either.
    update public.demo_usage_counters set turns = turns - 1 where bucket = p_ip_bucket;
    select coalesce(g.turns, 0) into v_global
      from public.demo_usage_counters g where g.bucket = p_global_bucket;
    return query select false, 'ip_cap'::text, coalesce(v_global, 0::bigint);
    return;
  end if;

  insert into public.demo_usage_counters as g (bucket, turns)
  values (p_global_bucket, 1)
  on conflict (bucket) do update set turns = g.turns + 1, updated_at = now()
  returning g.turns into v_global;

  if v_global > p_global_limit then
    -- Refund BOTH: the global slot and the per-IP slot taken moments ago.
    update public.demo_usage_counters set turns = turns - 1 where bucket = p_global_bucket;
    update public.demo_usage_counters set turns = turns - 1 where bucket = p_ip_bucket;
    return query select false, 'global_cap'::text, v_global;
    return;
  end if;

  return query select true, null::text, v_global;
end;
$$;

-- Grants: BOTH revokes are required. ALTER DEFAULT PRIVILEGES grants EXECUTE on new
-- public functions DIRECTLY to anon/authenticated, so revoking from PUBLIC alone does
-- not touch them — that was the live hole 0113 shipped and 0114 closed. Neither revoke
-- implies the other. (create or replace preserves existing grants; restated so this
-- file is correct standalone.)
revoke all on function public.kv_demo_try_consume(text, text, bigint, bigint) from public;
revoke all on function public.kv_demo_try_consume(text, text, bigint, bigint) from anon, authenticated;
grant execute on function public.kv_demo_try_consume(text, text, bigint, bigint) to service_role;
