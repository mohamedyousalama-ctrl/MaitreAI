-- ============================================================================
-- WO-RACE-1 FIX 1 (PREPARE-ONLY): enforce ≥1 manager at the DB — closes the last-manager
-- demotion TOCTOU (report FR-013-stress). The API route guards demotion with a SEPARATE
-- `select count(*) where role='manager'` then a later `.update({role})` — not atomic. With
-- exactly 2 managers, two concurrent "demote to operation" requests both read count=2 (>1 →
-- allowed) and both write → ZERO managers (the self-lockout the guard exists to prevent).
-- A bare conditional UPDATE can't serialize them under READ COMMITTED (they touch different
-- rows, and the count subquery isn't re-evaluated for the second writer).
--
-- This BEFORE UPDATE trigger is the DB-level guarantee for EVERY path (route, RLS-direct,
-- future callers): on a manager→non-manager transition it LOCKS the tenant's manager rows
-- FOR UPDATE (so concurrent demotions serialize on them), re-counts, and REJECTS a demotion
-- that would leave zero managers. The blocked second demotion re-reads count=1 → raises.
--
-- PREPARE-ONLY: applied in a later ceremony. Idempotent. The route keeps its friendly 409
-- pre-check for UX and maps this exception → 409 last_manager (deploy-safe: inert until applied).
-- ============================================================================

create or replace function public.enforce_min_one_manager()
returns trigger
language plpgsql
as $$
declare
  v_mgr_count int;
begin
  -- Only a manager → non-manager transition can drop the manager count.
  if old.role = 'manager' and new.role is distinct from 'manager' then
    -- Lock the tenant's manager rows so concurrent demotions serialize (the 2nd blocks
    -- on the 1st's row lock, then re-reads the post-commit count below).
    perform 1
      from public.members
     where restaurant_id = old.restaurant_id and role = 'manager'
     for update;

    -- The row being demoted is still 'manager' until this txn commits, so the LAST
    -- manager is exactly count = 1.
    select count(*) into v_mgr_count
      from public.members
     where restaurant_id = old.restaurant_id and role = 'manager';

    if v_mgr_count <= 1 then
      raise exception 'last_manager: a restaurant must keep at least one manager'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_min_one_manager on public.members;
create trigger trg_enforce_min_one_manager
  before update on public.members
  for each row
  execute function public.enforce_min_one_manager();

-- Rollback (manual; not auto-run):
--   drop trigger if exists trg_enforce_min_one_manager on public.members;
--   drop function if exists public.enforce_min_one_manager();
