-- ============================================================================
-- 0093 — KVO-007/008/009: atomic COD capture on delivered.
--
-- THREAT: lib/db/cod.ts previously captured delivered COD cash with separate,
-- unchecked writes: cod_collections insert/update, orders.payment_method update,
-- then cod_cash_events audit insert. A mid-way failure could leave cash booked
-- without order metadata, or without an audit row, and Supabase write errors could
-- be mistaken for success.
--
-- FIX: capture_cod_on_delivered_atomic() performs the cash-row insert/update,
-- order payment_method update, and audit insert in one Postgres function body.
-- Any raised error rolls back the entire function transaction. The function locks
-- the tenant-scoped order row first, preserves idempotency on cod_collections.order_id,
-- and verifies every expected write count.
--
-- PREPARE-ONLY: live function/grant change. Review and apply only in the founder
-- migration ceremony. Do NOT auto-apply from the app build.
-- ============================================================================

create or replace function public.capture_cod_on_delivered_atomic(
  p_restaurant_id   uuid,
  p_order_id        uuid,
  p_delivery_id     uuid default null,
  p_driver_id       uuid default null,
  p_driver_name     text default null,
  p_expected        numeric default null,
  p_collected       numeric default null,
  p_actor_user_id   uuid default null,
  p_actor_role      text default null
) returns table (
  collected     numeric,
  expected      numeric,
  collection_id uuid,
  event_type    text
)
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_order_id        uuid;
  v_collection_id   uuid;
  v_existing_status text;
  v_event_type      text;
  v_updated_count   integer;
  v_expected        numeric(12,2);
  v_collected       numeric(12,2);
begin
  v_expected := round(coalesce(p_expected, 0), 2)::numeric(12,2);
  v_collected := round(coalesce(p_collected, p_expected, 0), 2)::numeric(12,2);

  -- Tenant guard + concurrency guard: SECURITY DEFINER bypasses RLS, so every
  -- statement pins p_restaurant_id. Lock the order before touching money rows.
  select id
  into v_order_id
  from public.orders
  where id = p_order_id
    and restaurant_id = p_restaurant_id
  for update;

  if v_order_id is null then
    raise exception '[cod] capture order not found for restaurant %, order %',
      p_restaurant_id, p_order_id;
  end if;

  -- Fast path: create the collection row if none exists. If a concurrent capture
  -- wins the unique(order_id) race, do nothing here, then lock/update the row below.
  insert into public.cod_collections (
    restaurant_id,
    order_id,
    delivery_id,
    driver_id,
    driver_name,
    expected_cash,
    cash_collected,
    collected_at,
    settlement_status,
    updated_at
  )
  values (
    p_restaurant_id,
    p_order_id,
    p_delivery_id,
    p_driver_id,
    p_driver_name,
    v_expected,
    v_collected,
    now(),
    'held_by_driver',
    now()
  )
  on conflict (order_id) do nothing
  returning id into v_collection_id;

  if v_collection_id is not null then
    v_event_type := 'collected';
  else
    select id, settlement_status
    into v_collection_id, v_existing_status
    from public.cod_collections
    where restaurant_id = p_restaurant_id
      and order_id = p_order_id
    for update;

    if v_collection_id is null then
      raise exception '[cod] capture collection upsert lost row for restaurant %, order %',
        p_restaurant_id, p_order_id;
    end if;

    v_event_type := case when v_existing_status = 'pending' then 'collected' else 'adjusted' end;

    update public.cod_collections
    set
      delivery_id = p_delivery_id,
      driver_id = p_driver_id,
      driver_name = p_driver_name,
      expected_cash = v_expected,
      cash_collected = v_collected,
      collected_at = now(),
      settlement_status = 'held_by_driver',
      updated_at = now()
    where id = v_collection_id
      and restaurant_id = p_restaurant_id
      and order_id = p_order_id;

    get diagnostics v_updated_count = row_count;
    if v_updated_count <> 1 then
      raise exception '[cod] capture collection update mismatch for restaurant %, order %: updated %',
        p_restaurant_id, p_order_id, v_updated_count;
    end if;
  end if;

  update public.orders
  set payment_method = 'cod'
  where id = p_order_id
    and restaurant_id = p_restaurant_id;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception '[cod] capture order update mismatch for restaurant %, order %: updated %',
      p_restaurant_id, p_order_id, v_updated_count;
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
    v_collection_id,
    p_driver_id,
    v_event_type,
    v_collected,
    v_expected,
    p_actor_user_id,
    p_actor_role,
    jsonb_build_object('orderId', p_order_id, 'deliveryId', p_delivery_id)
  );

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception '[cod] capture audit insert mismatch for restaurant %, order %: inserted %',
      p_restaurant_id, p_order_id, v_updated_count;
  end if;

  return query select v_collected::numeric, v_expected::numeric, v_collection_id, v_event_type;
end;
$$;

-- Lock from birth: the only application caller is server-side
-- captureCodOnDelivered() through createAdminClient() / service_role. No browser
-- or authenticated caller needs EXECUTE on this SECURITY DEFINER function.
revoke execute on function public.capture_cod_on_delivered_atomic(uuid, uuid, uuid, uuid, text, numeric, numeric, uuid, text) from public;
revoke execute on function public.capture_cod_on_delivered_atomic(uuid, uuid, uuid, uuid, text, numeric, numeric, uuid, text) from anon;
revoke execute on function public.capture_cod_on_delivered_atomic(uuid, uuid, uuid, uuid, text, numeric, numeric, uuid, text) from authenticated;
grant  execute on function public.capture_cod_on_delivered_atomic(uuid, uuid, uuid, uuid, text, numeric, numeric, uuid, text) to service_role;
