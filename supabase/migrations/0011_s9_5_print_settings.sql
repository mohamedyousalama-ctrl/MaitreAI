-- ============================================================================
-- MaitreAI — Sprint 9 S9-5: per-tenant print settings (§O #5, Amendment A3).
-- auto_print: auto-open the kitchen ticket for printing when a new order lands
-- (operator device does the actual device-OS print). Default OFF.
-- print_width: paper size the restaurant owns — 58mm / 80mm thermal or standard.
-- Idempotent.
-- ============================================================================

alter table public.restaurants add column if not exists auto_print boolean not null default false;
alter table public.restaurants add column if not exists print_width text not null default 'standard';
