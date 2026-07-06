-- ============================================================================
-- MaitreAI — WO-MEDIA-GUARD (0070) — ADDITIVE, PREPARE-ONLY (not applied until GO).
--
-- Two additive concerns, no destructive change, all columns nullable or defaulted
-- so existing rows and code stay byte-identical until the feature reads them:
--
-- 1. conversations media counters — the per-conversation budget the deterministic
--    media guard (lib/messaging/media-guard.ts) reads/writes:
--      • images_sent   — running count of images sent in the conversation
--      • last_media_at  — timestamp of the last image sent (for future rate/decay)
--
-- 2. menu_items selling-context + send-approval fields (console editing lands later
--    on the GATED-tier Knowledge page):
--      • approved_for_send — an image may only be sent when explicitly approved
--        (default FALSE — fail-closed: nothing auto-sends until a human approves it)
--      • spice_level       — 0..5 heat scale (nullable; unset = unknown)
--      • best_for          — free-text selling context ("عزومات", "أطفال", …)
--      • not_suitable_for  — free-text ("نباتيين", …); DISTINCT from the allergen
--        gate — this is soft selling context, never a safety signal.
-- ============================================================================

-- 1. conversation media counters
alter table public.conversations
  add column if not exists images_sent integer not null default 0,
  add column if not exists last_media_at timestamptz;

-- 2. menu_items selling-context + send approval
alter table public.menu_items
  add column if not exists approved_for_send boolean not null default false,
  add column if not exists spice_level smallint,
  add column if not exists best_for text,
  add column if not exists not_suitable_for text;

-- Value guard: keep spice_level a sane 0..5 heat scale if ever set (nullable = unknown).
alter table public.menu_items
  drop constraint if exists menu_items_spice_level_range;
alter table public.menu_items
  add constraint menu_items_spice_level_range
  check (spice_level is null or (spice_level >= 0 and spice_level <= 5));
