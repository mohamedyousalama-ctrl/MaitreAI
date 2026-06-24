-- ============================================================================
-- MaitreAI — Allergen-flag safe default
--
-- deterministic_allergen_safety MUST be ON for every tenant. Leaving it off
-- means the allergen euphemism gate (#87) is inactive — a child-safety failure
-- mode (e.g. «بيتعب من البندق» goes undetected without the word «حساسية»).
--
-- This migration does two things:
--   1. Changes the column default so every future INSERT that omits feature_flags
--      starts with the allergen gate already ON.
--   2. Backfills all existing restaurants that are missing the key — merging the
--      flag into whatever flags they already have (cadence, perception, etc.),
--      never dropping existing keys.
--
-- The provision-tenant API route was also updated to set the flag explicitly at
-- insert time, so this default is belt-and-suspenders for any direct DB inserts.
-- ============================================================================

-- 1. New column default: always ON for the allergen gate; all other flags still
--    explicit per-tenant (not forced by the default).
alter table public.restaurants
  alter column feature_flags
    set default '{"deterministic_allergen_safety": true}'::jsonb;

-- 2. Backfill all restaurants that are missing the key (value false or absent).
--    Uses || (jsonb merge) so existing flags are preserved.
update public.restaurants
set feature_flags = feature_flags || '{"deterministic_allergen_safety": true}'::jsonb
where not (feature_flags ? 'deterministic_allergen_safety')
   or (feature_flags->>'deterministic_allergen_safety')::boolean is distinct from true;
