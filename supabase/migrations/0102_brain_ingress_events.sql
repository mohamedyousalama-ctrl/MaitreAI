-- ============================================================================
-- MaitreAI — 0102: WO-BRAIN-0A channel ingress events (PREPARE-ONLY).
--
-- Corrective/additive schema for BRAIN shadow ingress. This does not alter the
-- live webhook, the live engine, or already-applied migrations 0099/0100/0101.
--
-- Why not reuse channel_inbox alone?
--   channel_inbox is keyed by (tenant_id, channel, channel_message_id), which is
--   correct for customer inbound messages but insufficient for webhook envelopes
--   and outbound status callbacks. WhatsApp can send several logical status
--   events with the same provider message id. This migration splits:
--     1. authenticated webhook envelopes
--     2. atomic channel events with event-specific dedupe keys
--     3. raw-message ingress safety scans recorded before coalescing
--
-- PREPARE ONLY. Do not apply from builder sessions.
-- ============================================================================

create table if not exists public.webhook_envelopes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null check (provider in ('whatsapp')),
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  app_id text,
  received_at timestamptz not null default now(),
  payload_hash text not null,
  signature_verified boolean not null default false,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'normalized', 'rejected', 'failed')),
  raw_payload jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  constraint webhook_envelopes_tenant_id_id_key unique (tenant_id, id)
);

create index if not exists webhook_envelopes_tenant_received_idx
  on public.webhook_envelopes(tenant_id, received_at desc);
create index if not exists webhook_envelopes_payload_hash_idx
  on public.webhook_envelopes(tenant_id, provider, payload_hash);

create table if not exists public.channel_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurants(id) on delete cascade,
  envelope_id uuid not null,
  provider text not null check (provider in ('whatsapp')),
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  event_kind text not null check (event_kind in ('customer_inbound', 'outbound_status', 'other')),
  event_dedupe_key text not null,
  event_index integer not null default 0 check (event_index >= 0),
  provider_message_id text,
  provider_timestamp timestamptz,
  customer_channel_id text,
  thread_key text,
  status text,
  status_rank integer not null default 0 check (status_rank between 0 and 100),
  message_type text,
  raw_event jsonb not null default '{}'::jsonb,
  normalized_event jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint channel_events_tenant_id_id_key unique (tenant_id, id),
  constraint channel_events_dedupe_key unique (tenant_id, provider, event_dedupe_key),
  constraint channel_events_envelope_fk
    foreign key (tenant_id, envelope_id)
    references public.webhook_envelopes(tenant_id, id)
    on delete cascade
);

create index if not exists channel_events_tenant_received_idx
  on public.channel_events(tenant_id, received_at desc);
create index if not exists channel_events_provider_message_idx
  on public.channel_events(tenant_id, provider, provider_message_id, status_rank desc, provider_timestamp desc);
create index if not exists channel_events_thread_idx
  on public.channel_events(tenant_id, channel, thread_key, received_at desc);

create table if not exists public.ingress_safety_scans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurants(id) on delete cascade,
  channel_event_id uuid not null,
  provider text not null check (provider in ('whatsapp')),
  source_message_id text not null,
  raw_text_hash text,
  triage_class text check (triage_class in (
    'SAFETY_INFORMATION_QUERY',
    'EXPLICIT_CUSTOMER_DISCLOSURE',
    'THIRD_PARTY_DISCLOSURE',
    'PROBABLE_DISCLOSURE',
    'UNCERTAIN_SAFETY_SIGNAL',
    'CROSS_CONTAMINATION_QUERY',
    'NON_MEDICAL_PREFERENCE'
  )),
  safety_candidate boolean not null default false,
  explicit_stop boolean not null default false,
  human_takeover_requested boolean not null default false,
  fast_path_markers text[] not null default '{}',
  matched_spans jsonb not null default '[]'::jsonb,
  scanner_version text not null,
  scanned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint ingress_safety_scans_tenant_id_id_key unique (tenant_id, id),
  constraint ingress_safety_scans_event_key unique (tenant_id, channel_event_id),
  constraint ingress_safety_scans_event_fk
    foreign key (tenant_id, channel_event_id)
    references public.channel_events(tenant_id, id)
    on delete cascade
);

create index if not exists ingress_safety_scans_tenant_class_idx
  on public.ingress_safety_scans(tenant_id, triage_class, scanned_at desc);
create index if not exists ingress_safety_scans_tenant_candidate_idx
  on public.ingress_safety_scans(tenant_id, safety_candidate, scanned_at desc);

do $$
declare
  t text;
begin
  foreach t in array array[
    'webhook_envelopes',
    'channel_events',
    'ingress_safety_scans'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
    execute format('revoke all on table public.%I from public;', t);
    execute format('revoke all on table public.%I from anon, authenticated;', t);
    execute format('grant select on table public.%I to authenticated;', t);
    execute format('grant all on table public.%I to service_role;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_member_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_member_of(tenant_id));',
      t || '_member_read',
      t
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
