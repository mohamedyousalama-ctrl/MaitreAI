-- ============================================================================
-- Kivo — WO-5: WhatsApp template registry (per-tenant, DB-backed).
-- PREPARE-ONLY: NOT applied.
--
-- Upgrades the code-only registry (lib/messaging/templates.ts) to a per-tenant
-- table that tracks each approved/known template's Meta lifecycle: category
-- (utility | marketing | authentication), Meta approval status, quality rating,
-- language, and variant. Populated by the sync route (Meta WABA message_templates
-- API) with a documented MANUAL fallback when the WABA id / access token is
-- absent or the API is unreachable.
--
-- CATEGORY-TRUTH LAW (enforced in app code at write time, NOT here): a template
-- whose CONTENT carries an offer / discount / purchase-nudge is refused as
-- 'utility' — content decides the category, not the author's intent. This table
-- only stores the resolved category; the guard lives in lib/messaging/
-- template-registry.ts so it applies on every write path (sync + manual).
--
-- Financial/messaging artifact: members READ their tenant's templates; writes
-- happen via the service role (sync/manual routes), which bypasses RLS. Additive
-- + idempotent.
-- ============================================================================

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  -- Exact template name as registered in Meta (snake_case).
  name text not null,
  -- BCP-47 language of the approved template (e.g. 'ar', 'en').
  language text not null default 'ar',
  -- A template can exist in several shapes under one name (e.g. an A/B body or a
  -- localized rewrite submitted separately); `variant` disambiguates them within
  -- (restaurant, name, language). Defaults to 'default'.
  variant text not null default 'default',
  -- Meta category. UTILITY = transactional; MARKETING = anything promotional;
  -- AUTHENTICATION = OTP. Enforced by the category-truth guard at write time.
  category text not null default 'utility'
    check (category in ('utility','marketing','authentication')),
  -- Meta approval lifecycle (mapped from the WABA API `status`). 'unknown' until
  -- first synced or manually set.
  meta_status text not null default 'unknown'
    check (meta_status in ('unknown','pending','approved','rejected','paused','disabled')),
  -- Meta quality rating (GREEN/YELLOW/RED) → lowercased; 'unknown' until synced.
  quality_rating text not null default 'unknown'
    check (quality_rating in ('unknown','green','yellow','red')),
  -- Human-readable body with {{n}} placeholders — the source of truth the
  -- category-truth guard scans, and the Meta submission/docs text.
  body_text text not null default '',
  -- When this row last reflected a real Meta sync (null = manual-only / never).
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, name, language, variant)
);

create index if not exists message_templates_restaurant_idx
  on public.message_templates(restaurant_id);
create index if not exists message_templates_status_idx
  on public.message_templates(restaurant_id, meta_status);

-- RLS: members read their tenant's templates; the service role (sync/manual
-- routes) bypasses RLS for writes. No client write policy.
alter table public.message_templates enable row level security;
drop policy if exists message_templates_read on public.message_templates;
create policy message_templates_read on public.message_templates
  for select using (public.is_member_of(restaurant_id));

notify pgrst, 'reload schema';
