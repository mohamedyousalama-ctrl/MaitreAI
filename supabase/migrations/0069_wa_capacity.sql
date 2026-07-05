-- ============================================================================
-- Kivo — WO-6: WhatsApp messaging CAPACITY (per-tenant tier + quality) and the
-- business-initiated template-send ledger that backs the honest "remaining" est.
-- PREPARE-ONLY: NOT applied.
--
-- Capacity is Meta's per-number messaging-limit TIER + phone QUALITY rating,
-- synced from the Graph API (using the tenant's own wa_waba_id / wa_phone_number_id
-- + decrypted token — ONE source of truth, we do NOT add a second WABA column) or
-- entered MANUALLY. Every value is stamped with its source ('meta_sync' | 'manual')
-- + fetched_at so the UI can render a truth chip.
--
-- "remaining today" is an ESTIMATE we own: tier_limit − our count of
-- business-initiated template sends in the last 24h. Meta's counter is
-- authoritative; ours is the honest approximation (always labelled `est.`). The
-- template_sends ledger is what makes that count truthful — it is written
-- best-effort whenever we actually send a template (recordTemplateSend).
--
-- All additive + idempotent. Non-secret capacity columns are browser-granted
-- (0020 per-column model); the ledger is service-role-write / member-read.
-- ============================================================================

-- ── per-tenant capacity snapshot (nullable; null = not yet known) ────────────
alter table public.restaurants
  add column if not exists wa_messaging_tier text,
  add column if not exists wa_phone_quality text,
  add column if not exists wa_capacity_source text,
  add column if not exists wa_capacity_fetched_at timestamptz;

-- Value guards (all allow NULL = unknown/unset).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'restaurants_wa_phone_quality_chk') then
    alter table public.restaurants add constraint restaurants_wa_phone_quality_chk
      check (wa_phone_quality is null or wa_phone_quality in ('green','yellow','red','unknown'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'restaurants_wa_capacity_source_chk') then
    alter table public.restaurants add constraint restaurants_wa_capacity_source_chk
      check (wa_capacity_source is null or wa_capacity_source in ('meta_sync','manual'));
  end if;
end $$;

-- Non-secret → browser-readable (mirror 0020/0058 per-column grant model so a
-- `select *` from anon/authenticated keeps working). No secret material here.
grant select (wa_messaging_tier, wa_phone_quality, wa_capacity_source, wa_capacity_fetched_at)
  on public.restaurants to anon;
grant select (wa_messaging_tier, wa_phone_quality, wa_capacity_source, wa_capacity_fetched_at)
  on public.restaurants to authenticated;

-- ── business-initiated template-send ledger (the truthful basis for sent_24h) ─
create table if not exists public.template_sends (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  -- The template name sent (matches message_templates.name); free text so a send
  -- is never dropped just because the template isn't in the registry yet.
  template_name text not null default '',
  sent_at timestamptz not null default now()
);
create index if not exists template_sends_recent_idx
  on public.template_sends(restaurant_id, sent_at desc);

-- RLS: members read their tenant's send ledger (audit); the service role (the
-- send path) bypasses RLS for writes. No client write policy.
alter table public.template_sends enable row level security;
drop policy if exists template_sends_read on public.template_sends;
create policy template_sends_read on public.template_sends
  for select using (public.is_member_of(restaurant_id));

notify pgrst, 'reload schema';
