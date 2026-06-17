-- ============================================================================
-- MaitreAI — Restaurant storefront slug
-- Adds an optional, globally unique slug used by public storefront routes such
-- as /order/wesaya. Existing tenants are left unchanged except Wesaya, which is
-- backfilled to the requested launch slug.
-- ============================================================================

alter table public.restaurants
  add column if not exists slug text;

create unique index if not exists restaurants_slug_lower_unique_idx
  on public.restaurants (lower(slug))
  where slug is not null;

update public.restaurants
set slug = 'wesaya'
where id = '5acbc72f-def3-46cd-ad6c-bf0ff4a23642'
  and slug is distinct from 'wesaya';
