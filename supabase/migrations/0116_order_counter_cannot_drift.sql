-- 0116 — the counter can never fall behind the table again.
-- APPLIED to production 2026-08-27 via Supabase apply_migration.
--
-- 0115 repaired the counters that existed and stopped a MISSING counter from
-- colliding. It did not stop drift RECURRING: the allocator's DO UPDATE branch
-- is `+1` only, so if anything other than the RPC writes a higher order_number,
-- the counter stays behind and the next N allocations collide with the unique
-- index — and a collision there means the order is not persisted at all.
--
-- Verified in a rolled-back transaction: with the counter forced to 1050 on a
-- tenant whose true max is 1129, next_order_number() returned 1051.
--
-- That is not hypothetical. Two allocators coexist: the RPC, and the
-- application's fallback scan for environments without 0113. Anything that
-- inserts an order without going through the RPC — the fallback, a backfill, a
-- manual insert, a restored dump — reopens the gap.
--
-- So stop relying on every writer to remember. Make the TABLE maintain its own
-- counter: on insert, pull the counter up to at least the number just used. The
-- counter is then a high-water mark by construction, and next_order_number's
-- fast `+1` is correct no matter who else wrote.
--
-- Cost is one upsert on a primary-key row per order insert. The allocator
-- already locks that row, and within the RPC's own transaction the value is
-- unchanged (greatest(n, n) = n), so this adds no contention to the hot path.
--
-- Verified after applying, all rolled back: counter forced to 1050, a non-RPC
-- insert of order 1130 pulled it to 1130, and the next allocation returned 1131
-- instead of the colliding 1051. An order_number with no digits left it at 1131.

create or replace function public.kv_sync_order_number_counter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n bigint;
begin
  -- Non-numeric or absent order numbers cannot advance a numeric counter.
  n := nullif(regexp_replace(coalesce(new.order_number, ''), '\D', '', 'g'), '')::bigint;
  if n is null then
    return new;
  end if;

  insert into public.order_number_counters as c (restaurant_id, next_number)
  values (new.restaurant_id, n)
  on conflict (restaurant_id) do update
    set next_number = greatest(c.next_number, excluded.next_number),
        updated_at  = case when excluded.next_number > c.next_number then now() else c.updated_at end;

  return new;
end;
$$;

revoke all on function public.kv_sync_order_number_counter() from public;
revoke all on function public.kv_sync_order_number_counter() from anon, authenticated;

drop trigger if exists trg_sync_order_number_counter on public.orders;
create trigger trg_sync_order_number_counter
  after insert or update of order_number on public.orders
  for each row
  execute function public.kv_sync_order_number_counter();
