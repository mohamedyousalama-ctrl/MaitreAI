-- ============================================================================
-- MaitreAI — PRD Amendment 03 (K6): dialect enum is saudi | egyptian
-- The original schema defaulted dialect to 'gulf'. Amendment 03 binds the
-- dialect values to saudi | egyptian. Re-point the default and migrate any
-- existing 'gulf' rows. Idempotent. (seed/reset functions updated in 0003/0007.)
-- ============================================================================

alter table public.restaurants alter column dialect set default 'saudi';
update public.restaurants set dialect = 'saudi' where dialect = 'gulf';
