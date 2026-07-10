-- ============================================================================
-- MaitreAI — WO-DELIVERY-D1: zone geography + branch routing (additive).
--
-- Spec §1 (zones get geography) + §2 (branch routing) + §5 (data). Two changes,
-- both additive, both flag-independent at the DATA layer (the delivery_geo_routing
-- flag gates only the agent-conversation code, not these columns):
--
--   1. delivery_zones gains a CENTER POINT + RADIUS so a zone is a real circle on
--      the map, not just a name+fee. Radius-first V1 (polygons = V2 — the existing
--      unused `polygon jsonb` column, 0001_init.sql, is the natural V2 home and is
--      left untouched). branch_id + eta_minutes already exist (0001_init.sql:131,
--      :133), so this migration does NOT re-add them.
--
--   2. zone_misses — one row per delivery attempt that fell OUTSIDE every zone
--      (spec §2 "log the miss"; §4 console "zone misses surface"; §5 "insight
--      feed"). Carries enough to drive zone-expansion decisions later — the pin
--      coords + straight-line distance to the nearest zone — and a conversation
--      ref, but NO customer PII beyond that ref (per PM ruling: no phone, no name,
--      no address text of the customer; area_text is only the area WORD the
--      customer typed when there was no pin).
--
-- Nullable, no defaults on the new zone columns, NO backfill: existing zones stay
-- name+fee only until an operator draws them on the map editor. Additive — touches
-- no existing rows. Branches already exist and orders already carry
-- branch_id/zone_id/lat/lng (see docs/DELIVERY_MODULE_SPEC.md STEP-1 DELTAS).
--
-- RLS: delivery_zones is already governed (0002_rls.sql — member read, manager
-- write); adding columns needs no policy change. zone_misses follows the
-- promotion_redemptions posture: members may READ (the console misses surface),
-- writes happen only via the service role on the ordering path (no client write
-- policy).
--
-- ⚠️ PREPARE ONLY — PM reserves 0081; apply is a separate approved event. Not
-- auto-applied. Validate via BEGIN…ROLLBACK on dev before any prod (Wesaya) apply.
-- ============================================================================

-- 1. Zone geometry: center point + radius (km) ------------------------------
alter table public.delivery_zones add column if not exists center_lat double precision;
alter table public.delivery_zones add column if not exists center_lng double precision;
alter table public.delivery_zones add column if not exists radius_km numeric(6,3);

-- 2. Zone misses: outside-all-zones attempts (insight feed) ------------------
create table if not exists public.zone_misses (
  id                 uuid primary key default gen_random_uuid(),
  restaurant_id      uuid not null references public.restaurants(id) on delete cascade,
  -- The ONLY link back to the customer — deliberately no phone/name/address here.
  conversation_id    uuid references public.conversations(id) on delete set null,
  -- Pin coords when the miss came from a location pin; null for a text-area miss.
  pin_lat            double precision,
  pin_lng            double precision,
  -- The area WORD the customer typed (text-address fallback miss); null for a pin.
  area_text          text,
  -- Nearest existing zone + straight-line km to it — feeds "expand which zone?".
  nearest_zone_id    uuid references public.delivery_zones(id) on delete set null,
  nearest_distance_km numeric(8,3),
  created_at         timestamptz not null default now()
);
-- Console surface lists recent misses per tenant, newest first.
create index if not exists zone_misses_restaurant_at_idx
  on public.zone_misses (restaurant_id, created_at desc);

-- RLS: members read (misses surface); service-role writes only (no client write).
alter table public.zone_misses enable row level security;
drop policy if exists zone_misses_read on public.zone_misses;
create policy zone_misses_read on public.zone_misses
  for select using (public.is_member_of(restaurant_id));

-- ── Rollback (commented) ────────────────────────────────────────────────────
-- drop table if exists public.zone_misses;
-- alter table public.delivery_zones drop column if exists radius_km;
-- alter table public.delivery_zones drop column if exists center_lng;
-- alter table public.delivery_zones drop column if exists center_lat;
