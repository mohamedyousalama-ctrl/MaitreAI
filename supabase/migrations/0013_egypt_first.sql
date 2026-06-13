-- ============================================================================
-- MaitreAI — Egypt-first (owner decision, 2026-06-13). Egypt is the launch
-- market: customer-facing defaults flip to Egyptian. Saudi stays fully
-- supported per-tenant. Idempotent.
--   • new-tenant defaults: dialect → egyptian, currency → ج.م (EGP)
--   • pilot tenant مطعم الذواقة: saudi/خالد/ر.س → egyptian/كريم/ج.م
-- ============================================================================

alter table public.restaurants alter column currency set default 'ج.م';
alter table public.restaurants alter column dialect set default 'egyptian';

update public.restaurants
   set dialect = 'egyptian', agent_persona_name = 'كريم', currency = 'ج.م'
 where name = 'مطعم الذواقة' and dialect = 'saudi';
