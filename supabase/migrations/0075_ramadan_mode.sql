-- ============================================================================
-- Kivo (KSA) — WO-RAMADAN-MODE (0075). Seasonal hours override.
-- Additive + idempotent. PREPARE-ONLY: NOT applied (joins an off-peak batch).
--
-- ramadan_mode + ramadan_hours let a tenant flip to Ramadan operating hours for
-- the month without overwriting their regular hours (so it flips back cleanly).
--   • ramadan_mode  — the switch (default false → regular hours in force).
--   • ramadan_hours — the SAME shape as restaurants.hours (WeeklyHours:
--       { [day]: {closed:true} | {open:"HH:MM", close:"HH:MM"} }). Null until set.
--
-- The single read-path helper effectiveHours(restaurant) (lib/settings/
-- effective-hours.ts) resolves which set is in force: ramadan_mode ON AND
-- ramadan_hours present → ramadan_hours; otherwise regular hours. No reader
-- touches these columns directly.
--
-- No new grant needed — restaurants uses table-level grants; the console reads
-- these via the same settings surface as `hours`.
-- ============================================================================

alter table public.restaurants
  add column if not exists ramadan_mode boolean not null default false,
  add column if not exists ramadan_hours jsonb;

notify pgrst, 'reload schema';
