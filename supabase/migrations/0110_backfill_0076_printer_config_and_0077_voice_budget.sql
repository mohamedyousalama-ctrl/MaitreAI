-- 0110 — backfill of two migrations that were never applied to production
-- APPLIED to production 2026-08-26 via Supabase apply_migration.
--
--   supabase/migrations/0077_voice_budget.sql   -> public.conversations (3 cols)
--   supabase/migrations/0076_printer_config.sql -> public.restaurants   (1 col)
--
-- Additive and idempotent. Neither source migration defines an index or
-- constraint, so none is created here. Row counts when applied: conversations
-- 29, restaurants 13 — every default is a non-volatile constant, so each
-- ADD COLUMN was metadata-only.

alter table public.conversations
  add column if not exists voice_notes_day  date,
  add column if not exists voice_notes_sent integer       not null default 0,
  add column if not exists voice_cost_usd   numeric(10,6) not null default 0;

alter table public.restaurants
  add column if not exists printer_config jsonb;

-- Column grants that 0076 omits.
--
-- 0076's header asserts "No new grant needed — restaurants uses table-level
-- grants". That is FALSE against this database. Verified live: relacl for
-- public.restaurants is anon=adDxtm/postgres, authenticated=adDxtm/postgres —
-- no 'r' (SELECT) and no 'w' (UPDATE) at table level. Migration 0020 revoked
-- the table-level browser grants in favour of per-column grants, so a newly
-- added column inherits no browser grant and a PostgREST `select *` from
-- anon/authenticated fails with 42501 "permission denied for column
-- printer_config". 0058_psp_credentials.sql documents the same hazard.
--
-- Applying 0076 verbatim would therefore have caused an outage.
--
-- These grants match the established treatment of every other non-secret
-- column (verified against tier, feature_flags, psp_provider, currency, name,
-- active — all anon+authenticated SELECT and UPDATE). Secret columns such as
-- psp_secret_key_enc carry neither. printer_config is not a secret
-- ({name, width, auto_print}). RLS remains the row authority: public.restaurants
-- has rowsecurity = on with 3 policies.

grant select (printer_config) on public.restaurants to anon;
grant select (printer_config) on public.restaurants to authenticated;
grant update (printer_config) on public.restaurants to anon;
grant update (printer_config) on public.restaurants to authenticated;

notify pgrst, 'reload schema';
