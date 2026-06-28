-- ============================================================================
-- MaitreAI — DLV6b: real web-order coordinates on the order (additive).
-- The web storefront LocationPicker captures a genuine lat/lng, but there was no
-- column to store it (orders.lat/lng never existed — the DLV6 audit conflated them
-- with branches.lat/lng). These two nullable columns hold the picked coordinates
-- so the driver page can navigate to an EXACT pin (query=lat,lng) instead of a
-- text-search on the address string.
--
-- Nullable, no default, NO backfill: only web orders placed via the location
-- picker populate them; WhatsApp orders and typed-address web orders stay null and
-- fall back to the address text-search. The address text stays authoritative for
-- display/receipts. Additive — touches no existing data. RLS unchanged: orders is
-- already governed (orders_read SELECT for members; writes via the service-role
-- storefront route), so two nullable columns need no policy change.
--
-- ⚠️ PREPARE ONLY — review before applying to prod (Wesaya). Not auto-applied.
-- Validated via BEGIN…ROLLBACK on dev (both columns create as double precision, a
-- coord write is accepted, nothing persisted).
-- ============================================================================

alter table public.orders add column if not exists lat double precision;
alter table public.orders add column if not exists lng double precision;

-- ── Rollback (commented) ────────────────────────────────────────────────────
-- alter table public.orders drop column if exists lng;
-- alter table public.orders drop column if exists lat;
