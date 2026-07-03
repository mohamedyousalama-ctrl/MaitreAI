-- ============================================================================
-- MaitreAI — WO-2: STAFF COMMAND CHANNEL (staff registry) — ADDITIVE ONLY.
-- A second lane: registered staff phone numbers control Karim from their OWN
-- WhatsApp, NEVER touching the customer lane. This migration adds only the
-- registry the webhook router consults.
--
-- Why a dedicated table (not members.wa_phone): public.members requires a
-- user_id → auth.users (a console login), but a staff WhatsApp number is not
-- necessarily a login. staff_numbers registers a phone per tenant with an
-- OPTIONAL member_id link (for audit attribution when the staffer IS a member),
-- so WhatsApp-only staff can be registered too.
--
-- Tenant-scoped + unique per tenant (same phone may be registered in TWO tenants
-- independently — commands are always scoped to the RESOLVED tenant). RLS lets
-- members manage their tenant's registry; the webhook writes via the service role
-- (bypasses RLS). The feature is gated at the app layer by the
-- `staff_command_channel` feature flag (default OFF) — this table simply stays
-- empty/ignored until a tenant is enabled. Idempotent.
-- ============================================================================

create table if not exists public.staff_numbers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  -- Optional link to a console member for audit attribution; SET NULL so the
  -- registry survives a member being removed.
  member_id uuid references public.members(id) on delete set null,
  -- Canonical WhatsApp number (E.164 digits, no '+'), same normalization the
  -- customer path uses (lib/messaging/phone.ts normalizePhone).
  wa_phone text not null,
  label text,
  active boolean not null default true,
  -- Pending fuzzy-match confirmation (the «تقصد: X؟ رد بنعم» flow): the proposed
  -- action awaiting a «نعم» from THIS number, with a timestamp for TTL. Cleared
  -- after apply / on any other command.
  pending_command jsonb,
  pending_at timestamptz,
  created_at timestamptz not null default now(),
  -- One registration per (tenant, number). Cross-tenant collisions are allowed
  -- and independent — the router only ever queries within the resolved tenant.
  unique (restaurant_id, wa_phone)
);

create index if not exists staff_numbers_restaurant_idx on public.staff_numbers(restaurant_id);
create index if not exists staff_numbers_lookup_idx on public.staff_numbers(restaurant_id, wa_phone) where active;

-- RLS: members read/write their own tenant's registry; the service role (the
-- webhook router) bypasses RLS. Mirrors menu_availability_events.
alter table public.staff_numbers enable row level security;
drop policy if exists staff_numbers_rw on public.staff_numbers;
create policy staff_numbers_rw on public.staff_numbers
  using (public.is_member_of(restaurant_id)) with check (public.is_member_of(restaurant_id));

notify pgrst, 'reload schema';
