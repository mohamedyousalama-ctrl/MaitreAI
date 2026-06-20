-- ============================================================================
-- MaitreAI — Karim Pro P0: per-tenant tier flag (platform foundation)
-- Adds restaurants.tier ('standard' | 'pro') so later Pro features can gate on
-- a tenant's tier. Plumbing only — default 'standard' means NO behavior change
-- (every existing tenant stays standard; nothing reads the flag yet).
--
-- NOTE: this schema is ALREADY APPLIED to production Supabase (applied directly
-- by the foundation build; verified: both tenants = 'standard', constraint
-- restaurants_tier_valid present). This file documents it in-repo and reproduces
-- it on a fresh DB. Every statement is guarded (IF NOT EXISTS / DO-block) so a
-- re-run against prod is a no-op and never errors.
-- ============================================================================

-- The tier column. NOT NULL DEFAULT 'standard' backfills existing rows.
alter table public.restaurants
  add column if not exists tier text not null default 'standard';

-- Allowed values, named exactly as in prod (restaurants_tier_valid). Guarded so
-- adding it again (already present in prod) is a no-op rather than an error.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'restaurants_tier_valid'
      and conrelid = 'public.restaurants'::regclass
  ) then
    alter table public.restaurants
      add constraint restaurants_tier_valid check (tier in ('standard', 'pro'));
  end if;
end $$;

-- Explicit column grants. Migration 0020 revoked the table-level grants on
-- restaurants and replaced them with per-column grants, so each column added
-- after it (like tier) needs its own grant for the browser roles to read/write
-- it. tier is non-secret — mirror the non-secret-column treatment from 0020.
-- (Re-granting is idempotent; service_role keeps its full table access.)
grant select (tier) on public.restaurants to anon;
grant select (tier) on public.restaurants to authenticated;
grant update (tier) on public.restaurants to anon;
grant update (tier) on public.restaurants to authenticated;
