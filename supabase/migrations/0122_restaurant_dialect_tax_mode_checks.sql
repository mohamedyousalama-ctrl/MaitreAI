-- ============================================================================
-- 0122 — CHECK constraints for restaurants.dialect and restaurants.tax_mode.
--
-- WHY. Both columns are NOT NULL with a default, which reads as safe and is not.
-- Neither had a CHECK, and `PricingTaxMode` is declared as
-- `"inclusive" | "added" | string`, which TypeScript collapses to `string` — so
-- nothing anywhere, in the database or in the types, rejected a wrong value.
--
-- Both columns then FAIL TO A WRONG-BUT-PLAUSIBLE DEFAULT, which is the worst
-- possible failure shape because it is silent:
--
--   * dialect   — DEFAULT 'egyptian'. lib/ai/dialect.ts `dialectProfile()` falls
--     back to `saudi` for an unrecognised value while lib/ai/customer-turn.ts
--     falls back to the string 'egyptian'. A typo ('ksa', 'saudia', 'Saudi')
--     therefore splits the agent in half: an Egyptian system prompt rendered with
--     Saudi Western digits. Nothing errors; the customer just gets the wrong
--     country's Arabic.
--
--   * tax_mode  — DEFAULT 'inclusive'. lib/order-pricing.ts `computeTax()` adds
--     VAT only on an exact `=== "added"` match, so ANY unrecognised value silently
--     means "prices already include tax". On a KSA tenant that charges 15% on top,
--     a typo makes the agent tell the customer the price includes VAT when it does
--     not. That is a false statement about money, made confidently, with no error
--     anywhere.
--
-- Both constraints are validated against live data before being added: all 13
-- rows are already within the allowed sets ({egyptian, saudi} × {inclusive,
-- added}), so this cannot reject an existing tenant.
--
-- Consistent with restaurants_tier_valid / restaurants_wa_phone_quality_chk,
-- which already constrain their columns this way. These two were simply missed.
-- ============================================================================

alter table public.restaurants
  drop constraint if exists restaurants_dialect_valid;

alter table public.restaurants
  add constraint restaurants_dialect_valid
  check (dialect = any (array['saudi'::text, 'egyptian'::text]));

alter table public.restaurants
  drop constraint if exists restaurants_tax_mode_valid;

alter table public.restaurants
  add constraint restaurants_tax_mode_valid
  check (tax_mode = any (array['inclusive'::text, 'added'::text]));
