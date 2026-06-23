-- ============================================================================
-- MaitreAI — Per-tenant escalation timeout config (Settings gap fix)
--
-- Adds escalation_timeout_minutes to restaurants so the operator can configure
-- how long a human-owned conversation sits idle before the stuck-detection
-- alert fires. Mirrors the existing hardcoded STUCK_THRESHOLDS.humanNoResponseMinutes
-- value (10 minutes) as the default — so existing behaviour is unchanged until
-- a tenant explicitly changes it via the settings API.
--
-- Wiring the stuck-detection engine to read this column instead of the
-- hardcoded constant is a separate task (touching respond-and-send.ts carries
-- spine risk; the column + API are added here independently). Until wired,
-- this column is operator-visible config that the engine will read in a
-- follow-up. Idempotent.
-- ============================================================================

alter table public.restaurants
  add column if not exists escalation_timeout_minutes integer not null default 10;

-- Non-secret config column — expose to browser roles exactly like other non-secret
-- columns (see migration 0020 for the column-grant pattern).
grant select (escalation_timeout_minutes) on public.restaurants to anon;
grant select (escalation_timeout_minutes) on public.restaurants to authenticated;
