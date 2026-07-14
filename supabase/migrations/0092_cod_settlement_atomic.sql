-- ============================================================================
-- 0092 — WO-COD-SETTLEMENT-ATOMIC (S1 money integrity): atomic driver settlement.
--
-- THREAT: lib/db/cod.ts previously settled a driver's COD cash with separate,
-- unchecked writes: read held collections, insert cod_settlements, update
-- cod_collections, then append cod_cash_events. A mid-way failure could leave a
-- settlement/audit row without the collections being marked settled, or miss the
-- audit trail entirely.
--
-- FIX: settle_cod_driver_atomic() performs the settlement insert, locked collection
-- update, and audit insert in one Postgres function body. Any raised error rolls
-- back the entire function transaction. The function locks the target held rows at
-- the start, scopes every statement by p_restaurant_id, and verifies the update
-- count matches the locked set.
--
-- PREPARE-ONLY: live function/grant change. Review and apply only in the founder
-- migration ceremony. Do NOT auto-apply from the app build.
-- ============================================================================

create or replace function public.settle_cod_driver_atomic(
  p_restaurant_id    uuid,
  p_driver_id        uuid,
  p_settled_by       uuid default null,
  p_settled_by_role  text default null,
  p_note             text default null
) returns table (
  total         numeric,
  order_count   integer,
  settlement_id uuid
)
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_collection_ids uuid[];
  v_driver_name    text;
  v_total          numeric(12,2);
  v_order_count    integer;
  v_settlement_id  uuid;
  v_updated_count  integer;
begin
  -- Lock exactly the currently held rows for this tenant+driver. A concurrent
  -- settle waits here, then sees no held rows after the first transaction commits.
  select
    array_agg(held.id order by held.id),
    coalesce(round(sum(coalesce(held.cash_collected, 0)), 2), 0)::numeric(12,2),
    count(*)::integer,
    (array_agg(held.driver_name) filter (where held.driver_name is not null))[1]
  into v_collection_ids, v_total, v_order_count, v_driver_name
  from (
    select id, driver_name, cash_collected
    from public.cod_collections
    where restaurant_id = p_restaurant_id
      and driver_id = p_driver_id
      and settlement_status = 'held_by_driver'
    for update
  ) as held;

  if coalesce(v_order_count, 0) = 0 then
    return query select 0::numeric, 0::integer, null::uuid;
    return;
  end if;

  insert into public.cod_settlements (
    restaurant_id,
    driver_id,
    driver_name,
    total_amount,
    order_count,
    settled_by,
    settled_by_role,
    note
  )
  values (
    p_restaurant_id,
    p_driver_id,
    v_driver_name,
    v_total,
    v_order_count,
    p_settled_by,
    p_settled_by_role,
    p_note
  )
  returning id into v_settlement_id;

  update public.cod_collections
  set
    settlement_status = 'settled',
    settlement_id = v_settlement_id,
    settled_at = now(),
    updated_at = now()
  where restaurant_id = p_restaurant_id
    and driver_id = p_driver_id
    and settlement_status = 'held_by_driver'
    and id = any(v_collection_ids);

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_order_count then
    raise exception '[cod] settlement update mismatch for restaurant %, driver %: expected %, updated %',
      p_restaurant_id, p_driver_id, v_order_count, v_updated_count;
  end if;

  insert into public.cod_cash_events (
    restaurant_id,
    cod_collection_id,
    driver_id,
    type,
    amount,
    expected,
    actor_user_id,
    actor_role,
    payload
  )
  values (
    p_restaurant_id,
    null,
    p_driver_id,
    'settled',
    v_total,
    null,
    p_settled_by,
    p_settled_by_role,
    jsonb_build_object('settlementId', v_settlement_id, 'orderCount', v_order_count)
  );

  return query select v_total::numeric, v_order_count, v_settlement_id;
end;
$$;

-- Lock from birth: the only application caller is server-side settleDriver()
-- through createAdminClient() / service_role. No browser/authenticated caller needs
-- EXECUTE on this SECURITY DEFINER function.
revoke execute on function public.settle_cod_driver_atomic(uuid, uuid, uuid, text, text) from public;
revoke execute on function public.settle_cod_driver_atomic(uuid, uuid, uuid, text, text) from anon;
revoke execute on function public.settle_cod_driver_atomic(uuid, uuid, uuid, text, text) from authenticated;
grant  execute on function public.settle_cod_driver_atomic(uuid, uuid, uuid, text, text) to service_role;
