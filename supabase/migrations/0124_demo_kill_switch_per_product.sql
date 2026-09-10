-- ============================================================================
-- 0124 — one kill switch per demo, so stopping Faysal does not stop Khalid.
--
-- app/api/faysal/_engine/guard.ts says, in its own header, that the two demos
-- "must not share a daily budget or a kill switch". The COUNTERS honour that —
-- Faysal's buckets are `faysal:<day>` and `<ip>:<hour>`, Khalid's are
-- `global:<day>` and `ip:<ip>:<hour>`, and they cannot collide. The SWITCH did
-- not: `demo_controls` is a single row (0119:52-53, `id boolean primary key
-- check (id)`) read inside kv_demo_try_consume, so `update demo_controls set
-- enabled = false` to pull one demo pulled the other with it.
--
-- That is the wrong failure mode on precisely the day it gets used: a public
-- link is out, one demo has to come down mid-sales-cycle, and taking it down
-- takes the other client's demo down too.
--
-- SHAPE, chosen to be additive so the parked Khalid path cannot regress:
--
--   • a new table, one row per product, seeded enabled;
--   • the 5-argument kv_demo_try_consume is the real one and takes p_product;
--   • the 4-argument form is KEPT as a thin wrapper passing NULL, so any caller
--     not yet updated behaves exactly as it does today.
--
-- The two overloads differ in ARITY and neither has a default parameter. That is
-- deliberate: a `p_product text default null` on the 5-arg form would make every
-- existing 4-arg call ambiguous ("function is not unique") rather than resolving
-- to the old behaviour. Distinct arities, no defaults, no ambiguity.
--
-- `demo_controls` keeps its meaning: the global switch that stops EVERYTHING.
-- The product switch is the scalpel, not a replacement for the big red button.
-- ============================================================================

-- ── the per-product switch ──────────────────────────────────────────────────
create table if not exists public.demo_product_controls (
  product    text        primary key,
  enabled    boolean     not null default true,
  reason     text,
  updated_at timestamptz not null default now()
);

alter table public.demo_product_controls enable row level security;
-- No policy, deliberately: service-role only, same as demo_controls and
-- demo_usage_counters. RLS-on-with-no-policy denies every anon/authenticated
-- statement; the explicit revokes below are still required because RLS does not
-- gate TRUNCATE, and because Supabase's default privileges grant to anon and
-- authenticated directly (the 0113 trap, closed by 0114).

insert into public.demo_product_controls (product, enabled) values ('kivo', true)
on conflict (product) do nothing;
insert into public.demo_product_controls (product, enabled) values ('faysal', true)
on conflict (product) do nothing;

-- ── the real function, now product-aware ────────────────────────────────────
-- Body is 0120's verbatim, plus the product gate. Everything 0120 established is
-- preserved: per-IP is checked first because it is the cheap self-limiting one;
-- the global counter is only touched once every other check has cleared; a
-- rejected turn is REFUNDED so the counter means turns served, not requests seen;
-- and a missing controls row is treated as STOPPED, never as running.
create or replace function public.kv_demo_try_consume(
  p_ip_bucket text,
  p_global_bucket text,
  p_ip_limit bigint,
  p_global_limit bigint,
  p_product text
)
returns table (allowed boolean, reason text, global_turns bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_product_enabled boolean;
  v_ip bigint;
  v_global bigint;
begin
  select c.enabled into v_enabled from public.demo_controls c where c.id = true;

  -- FAIL CLOSED: NULL here means the controls row is absent, not that the demo is on.
  if v_enabled is null or v_enabled = false then
    return query select false, 'disabled'::text, 0::bigint;
    return;
  end if;

  -- The per-product switch. A NULL p_product means "no product scoping" and is the
  -- pre-0124 behaviour, reached through the 4-argument wrapper below. A NAMED
  -- product with no row fails CLOSED for the same reason the global switch does:
  -- an operator who deletes a row and then disables it must not be told the demo
  -- stopped while it keeps serving.
  if p_product is not null then
    select c.enabled into v_product_enabled
      from public.demo_product_controls c where c.product = p_product;
    if v_product_enabled is null or v_product_enabled = false then
      return query select false, 'disabled'::text, 0::bigint;
      return;
    end if;
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

-- ── the 4-argument form, kept as a wrapper ──────────────────────────────────
-- Not dropped: dropping it would break any caller mid-deploy, and keeping it is
-- what makes this migration safe to apply before the application is updated.
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
begin
  return query select * from public.kv_demo_try_consume(
    p_ip_bucket, p_global_bucket, p_ip_limit, p_global_limit, null::text);
end;
$$;

-- ── grants ──────────────────────────────────────────────────────────────────
-- BOTH revokes are required on every object. ALTER DEFAULT PRIVILEGES grants
-- EXECUTE on new public functions DIRECTLY to anon/authenticated, so revoking
-- from PUBLIC alone does not touch them — that was the live hole 0113 shipped
-- and 0114 closed. Neither revoke implies the other.
revoke all on table public.demo_product_controls from public;
revoke all on table public.demo_product_controls from anon, authenticated;
grant select, insert, update, delete on table public.demo_product_controls to service_role;

revoke all on function public.kv_demo_try_consume(text, text, bigint, bigint, text) from public;
revoke all on function public.kv_demo_try_consume(text, text, bigint, bigint, text) from anon, authenticated;
grant execute on function public.kv_demo_try_consume(text, text, bigint, bigint, text) to service_role;

revoke all on function public.kv_demo_try_consume(text, text, bigint, bigint) from public;
revoke all on function public.kv_demo_try_consume(text, text, bigint, bigint) from anon, authenticated;
grant execute on function public.kv_demo_try_consume(text, text, bigint, bigint) to service_role;
