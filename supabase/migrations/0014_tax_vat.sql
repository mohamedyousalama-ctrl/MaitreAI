-- ============================================================================
-- MaitreAI — Tax/VAT (Sprint 10). VAT-ready, default tax-INCLUSIVE (no pilot
-- behavior change): the menu price IS the final price, no VAT line. Flipping a
-- tenant to tax_mode='added' + a rate (e.g. 14 for Egypt) makes the order math
-- add a VAT line and the receipt show it. Idempotent.
-- ============================================================================

alter table public.restaurants add column if not exists tax_mode text not null default 'inclusive';
alter table public.restaurants add column if not exists tax_rate numeric(5,2) not null default 0;
alter table public.restaurants add column if not exists tax_registration_no text;

-- Per-order snapshot so the receipt/totals stay correct regardless of later changes.
alter table public.orders add column if not exists tax_amount numeric(12,2) not null default 0;
alter table public.orders add column if not exists tax_rate numeric(5,2) not null default 0;
