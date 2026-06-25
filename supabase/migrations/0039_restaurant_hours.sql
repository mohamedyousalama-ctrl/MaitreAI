-- ============================================================================
-- MaitreAI — Restaurant-level operating hours
--
-- The onboarding "hours" step and the go-live readiness checklist both treat
-- operating hours as a RESTAURANT-level column:
--   • app/api/onboarding/config/hours/route.ts  — GET selects `hours`,
--     PUT writes `hours` onto public.restaurants.
--   • app/api/onboarding/go-live/route.ts        — selects `restaurants.hours`
--     and marks the "hours" checklist item complete when it is != '{}'.
--   • The config/hours route header documents `hours jsonb` as one of the
--     restaurants columns "since 0001_init.sql".
--
-- But no migration ever added it: `hours jsonb` only exists on public.branches
-- (0001_init.sql). As a result every one of those three code paths fails at
-- runtime with Postgres 42703 "column restaurants.hours does not exist":
--   - GET  /api/onboarding/config/hours  -> read_failed
--   - PUT  /api/onboarding/config/hours  -> update_failed
--   - GET  /api/onboarding/go-live       -> checklist read fails
--
-- This migration adds the missing column. The shape mirrors branches.hours
-- (jsonb, default '{}') so split shifts + prayer pauses are representable, and
-- the empty-object default is exactly what go-live reads as "hours not yet
-- configured" — existing tenants therefore see the hours checklist item as
-- incomplete until a manager sets a schedule, which is the intended behaviour.
-- ============================================================================

alter table public.restaurants
  add column if not exists hours jsonb not null default '{}'::jsonb;
