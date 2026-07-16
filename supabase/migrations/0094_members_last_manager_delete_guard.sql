-- ============================================================================
-- FR-026 (PREPARE-ONLY): extend the last-manager guard to member DELETE.
--
-- Migration 0089 protects manager demotion with a BEFORE UPDATE trigger, but a
-- DELETE of the last manager bypasses that path. This companion trigger is the
-- DB-level guarantee for member removals: on a manager DELETE it locks the
-- tenant's manager rows FOR UPDATE, re-counts the managers excluding the row
-- being deleted, and rejects the delete if it would leave zero managers.
--
-- PREPARE-ONLY: application is a founder/PM ceremony. Do not apply from the app
-- branch.
-- ============================================================================

create or replace function public.enforce_min_one_manager_on_delete()
returns trigger
language plpgsql
as $$
declare
  v_remaining_mgr_count int;
begin
  -- Only deleting a manager can drop the tenant's manager count.
  if old.role = 'manager' then
    -- Lock the tenant's manager rows so concurrent manager deletes serialize.
    perform 1
      from public.members
     where restaurant_id = old.restaurant_id and role = 'manager'
     for update;

    -- OLD is still visible in this BEFORE DELETE trigger, so exclude it to ask
    -- whether any manager would remain after the delete commits.
    select count(*) into v_remaining_mgr_count
      from public.members
     where restaurant_id = old.restaurant_id
       and role = 'manager'
       and id <> old.id;

    if v_remaining_mgr_count <= 0 then
      raise exception 'last_manager: a restaurant must keep at least one manager'
        using errcode = 'check_violation';
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_enforce_min_one_manager_on_delete on public.members;
create trigger trg_enforce_min_one_manager_on_delete
  before delete on public.members
  for each row
  execute function public.enforce_min_one_manager_on_delete();

-- Rollback (manual; not auto-run):
--   drop trigger if exists trg_enforce_min_one_manager_on_delete on public.members;
--   drop function if exists public.enforce_min_one_manager_on_delete();
