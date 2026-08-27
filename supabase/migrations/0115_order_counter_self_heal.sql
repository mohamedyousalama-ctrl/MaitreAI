-- 0115 — make the order-number counter self-healing at the seams.
-- APPLIED to production 2026-08-27 via Supabase apply_migration.
--
-- Two defects found reviewing 0113, both at the boundary between the counter and
-- the table it is meant to be authoritative over. Neither is in the allocator
-- itself, which is correct.
--
-- 1. THE COUNTER WAS A ONE-SHOT SNAPSHOT. 0113 seeded it at apply time and
--    nothing ever re-synced it. The application code that calls the RPC is not
--    deployed yet, so every order created in the meantime goes through the old
--    scan, advancing max(order_number) while next_number stands still. On deploy
--    the RPC would hand back numbers that already exist, the unique index from
--    0113 would refuse the insert, and the order would NOT be persisted — the
--    customer gets no confirmation. Measured before writing this: no tenant had
--    drifted yet (وصاية 1129/1129, Sweet Shop 1008/1008, الذواقة 1049/1049,
--    التجربة برو 27/22), so this closes the window rather than repairing damage.
--
-- 2. A TENANT WITH NO COUNTER ROW COLLIDED DETERMINISTICALLY. The application
--    fallback returns max+1 without creating a counter row. 0113's INSERT branch
--    then started any missing counter at a blind 1001. So: fallback issues 1001,
--    the order persists, the next RPC call takes the INSERT branch and returns
--    1001 again. No race needed.
--
-- The fix for both is the same: never trust the counter to be ahead of reality.
-- The INSERT branch now seeds from the tenant's true max instead of a constant,
-- so a missing counter cannot collide; and existing counters are pulled up to
-- the true max here. The per-call cost is unchanged for the hot path — the scan
-- runs only when a counter row does not yet exist, i.e. once per tenant.
--
-- Verified after applying, in a rolled-back transaction: with وصاية's counter
-- row deleted (true max 1129) the allocator returned 1130, where 0113 returned
-- 1001. A tenant with zero orders still starts at 1001.
--
-- The 1000 floor is preserved deliberately: the old code did `let max = 1000`,
-- so a tenant's first order was #1001. 0113's seed dropped that floor, which
-- would have started a low-numbered tenant at #6 where the app previously
-- emitted #1001.
--
-- NOTE: this fixes a MISSING counter. A counter that drifts below the true max
-- while it EXISTS is fixed by 0116, whose trigger makes the counter a
-- high-water mark; the DO UPDATE branch here is still `+1` only.

-- ── 1. pull every existing counter up to its tenant's true max ──────────────
update public.order_number_counters c
set next_number = greatest(c.next_number, m.true_max),
    updated_at  = now()
from (
  select o.restaurant_id,
         max((nullif(regexp_replace(o.order_number, '\D', '', 'g'), ''))::bigint) as true_max
  from public.orders o
  where o.order_number is not null
    and nullif(regexp_replace(o.order_number, '\D', '', 'g'), '') is not null
  group by o.restaurant_id
) m
where m.restaurant_id = c.restaurant_id
  and m.true_max > c.next_number;

-- ── 2. seed a MISSING counter from reality, not from a constant ─────────────
create or replace function public.next_order_number(p_restaurant_id uuid)
returns bigint
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.order_number_counters as c (restaurant_id, next_number)
  values (
    p_restaurant_id,
    greatest(
      1000,
      coalesce((
        select max((nullif(regexp_replace(o.order_number, '\D', '', 'g'), ''))::bigint)
        from public.orders o
        where o.restaurant_id = p_restaurant_id
          and o.order_number is not null
          and nullif(regexp_replace(o.order_number, '\D', '', 'g'), '') is not null
      ), 1000)
    ) + 1
  )
  on conflict (restaurant_id) do update
    set next_number = c.next_number + 1,
        updated_at  = now()
  returning c.next_number;
$$;

-- CREATE OR REPLACE resets nothing about ownership, but the grants must be
-- restated defensively. Both halves are required and neither implies the other:
-- `from public` does not reach anon/authenticated (they hold DIRECT grants from
-- Supabase's ALTER DEFAULT PRIVILEGES), and revoking those two by name leaves a
-- PUBLIC grant intact — verified in a rolled-back transaction, where a by-name
-- revoke left has_function_privilege() still true because PUBLIC still held it.
revoke all on function public.next_order_number(uuid) from public;
revoke all on function public.next_order_number(uuid) from anon, authenticated;
grant execute on function public.next_order_number(uuid) to service_role;
