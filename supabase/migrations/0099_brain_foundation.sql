-- ============================================================================
-- WO-BRAIN-G0 (PREPARE-ONLY): KTDK foundation tables.
--
-- Empty, unused-by-app schema for the future Kivo Transactional Dialogue Kernel.
-- Do NOT apply until PM/founder approval. This migration creates no live engine
-- behavior, touches no legacy engine tables, and performs no data migration.
--
-- Controls:
--   - every table is tenant-scoped with tenant_id NOT NULL
--   - money is integer minor units only (bigint)
--   - BRAIN-to-BRAIN references use composite tenant FKs
--   - RLS enabled + forced, default-deny for writes
--   - member read policy uses public.is_member_of(tenant_id)
--   - ordinary BRAIN runtime must not use service_role
-- ============================================================================

create table if not exists public.channel_inbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurants(id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'web', 'phone')),
  channel_message_id text not null,
  thread_key text not null,
  verified_channel_ref text not null,
  customer_channel_id text not null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  acked_at timestamptz,
  processed_at timestamptz,
  processing_state text not null default 'received'
    check (processing_state in ('received', 'acked', 'assembled', 'processed', 'duplicate', 'failed')),
  duplicate_of_inbox_id uuid,
  created_at timestamptz not null default now(),
  constraint channel_inbox_tenant_id_id_key unique (tenant_id, id),
  constraint channel_inbox_message_key unique (tenant_id, channel, channel_message_id),
  constraint channel_inbox_duplicate_fk
    foreign key (tenant_id, duplicate_of_inbox_id)
    references public.channel_inbox(tenant_id, id)
);

create index if not exists channel_inbox_tenant_received_idx
  on public.channel_inbox(tenant_id, received_at);
create index if not exists channel_inbox_thread_state_idx
  on public.channel_inbox(tenant_id, thread_key, processing_state, received_at);

create table if not exists public.conversation_threads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurants(id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'web', 'phone')),
  thread_key text not null,
  customer_id uuid,
  customer_channel_id text not null,
  owner text not null default 'AI' check (owner in ('AI', 'HUMAN')),
  ownership_generation bigint not null default 0,
  hold_reasons text[] not null default '{}',
  state text not null default 'open' check (state in ('open', 'closed', 'incident_hold')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversation_threads_tenant_id_id_key unique (tenant_id, id),
  constraint conversation_threads_key unique (tenant_id, channel, thread_key)
);

create index if not exists conversation_threads_tenant_customer_idx
  on public.conversation_threads(tenant_id, customer_id);

create table if not exists public.order_episodes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurants(id) on delete cascade,
  thread_id uuid not null,
  customer_id uuid,
  lifecycle_state text not null default 'collecting'
    check (lifecycle_state in (
      'collecting',
      'quoted',
      'awaiting_confirmation',
      'committed',
      'abandoned',
      'cancelled',
      'human_controlled',
      'expired'
    )),
  active_mutable boolean not null default true,
  owner text not null default 'AI' check (owner in ('AI', 'HUMAN')),
  ownership_generation bigint not null default 0,
  episode_revision bigint not null default 0,
  current_quote_id uuid,
  committed_order_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint order_episodes_tenant_id_id_key unique (tenant_id, id),
  constraint order_episodes_thread_fk
    foreign key (tenant_id, thread_id)
    references public.conversation_threads(tenant_id, id)
    on delete cascade,
  constraint order_episodes_active_state_check
    check (
      (active_mutable and lifecycle_state in ('collecting', 'quoted', 'awaiting_confirmation', 'human_controlled'))
      or
      (not active_mutable and lifecycle_state in ('committed', 'abandoned', 'cancelled', 'expired'))
    )
);

create unique index if not exists order_episodes_one_active_per_thread_idx
  on public.order_episodes(tenant_id, thread_id)
  where active_mutable;

create index if not exists order_episodes_tenant_state_idx
  on public.order_episodes(tenant_id, lifecycle_state, updated_at);

create table if not exists public.episode_turn_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurants(id) on delete cascade,
  thread_id uuid not null,
  episode_id uuid not null,
  source_inbox_id uuid,
  turn_index bigint not null,
  actor text not null check (actor in ('CUSTOMER', 'AI', 'HUMAN', 'SYSTEM')),
  event_type text not null,
  untrusted_input jsonb not null default '{}'::jsonb,
  validated_act_batch jsonb,
  decision_proposal jsonb,
  committed_turn jsonb,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint episode_turn_events_tenant_id_id_key unique (tenant_id, id),
  constraint episode_turn_events_episode_index_key unique (tenant_id, episode_id, turn_index),
  constraint episode_turn_events_thread_fk
    foreign key (tenant_id, thread_id)
    references public.conversation_threads(tenant_id, id)
    on delete cascade,
  constraint episode_turn_events_episode_fk
    foreign key (tenant_id, episode_id)
    references public.order_episodes(tenant_id, id)
    on delete cascade,
  constraint episode_turn_events_inbox_fk
    foreign key (tenant_id, source_inbox_id)
    references public.channel_inbox(tenant_id, id)
);

create index if not exists episode_turn_events_tenant_episode_idx
  on public.episode_turn_events(tenant_id, episode_id, turn_index);

create table if not exists public.pending_prompts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurants(id) on delete cascade,
  thread_id uuid not null,
  episode_id uuid not null,
  prompt_kind text not null,
  required_field text,
  token_hash text not null,
  token_generation bigint not null,
  episode_revision bigint not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'consumed', 'expired', 'revoked')),
  created_at timestamptz not null default now(),
  constraint pending_prompts_tenant_id_id_key unique (tenant_id, id),
  constraint pending_prompts_token_key unique (tenant_id, token_hash),
  constraint pending_prompts_thread_fk
    foreign key (tenant_id, thread_id)
    references public.conversation_threads(tenant_id, id)
    on delete cascade,
  constraint pending_prompts_episode_fk
    foreign key (tenant_id, episode_id)
    references public.order_episodes(tenant_id, id)
    on delete cascade
);

create index if not exists pending_prompts_tenant_status_idx
  on public.pending_prompts(tenant_id, status, expires_at);

create table if not exists public.safety_disclosures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurants(id) on delete cascade,
  thread_id uuid not null,
  episode_id uuid not null,
  source_turn_event_id uuid,
  disclosure_kind text not null
    check (disclosure_kind in (
      'ingredient_request',
      'explicit_allergy',
      'unknown_ingredient',
      'cross_contamination',
      'low_confidence_voice',
      'historical_memory'
    )),
  canonical_terms text[] not null default '{}',
  raw_evidence jsonb not null default '{}'::jsonb,
  confidence_basis_points integer not null default 10000
    check (confidence_basis_points between 0 and 10000),
  requires_kitchen_note boolean not null default true,
  kitchen_note_text text,
  requires_human_escalation boolean not null default false,
  consent_captured_at timestamptz,
  created_at timestamptz not null default now(),
  constraint safety_disclosures_tenant_id_id_key unique (tenant_id, id),
  constraint safety_disclosures_thread_fk
    foreign key (tenant_id, thread_id)
    references public.conversation_threads(tenant_id, id)
    on delete cascade,
  constraint safety_disclosures_episode_fk
    foreign key (tenant_id, episode_id)
    references public.order_episodes(tenant_id, id)
    on delete cascade,
  constraint safety_disclosures_turn_fk
    foreign key (tenant_id, source_turn_event_id)
    references public.episode_turn_events(tenant_id, id)
);

create index if not exists safety_disclosures_tenant_episode_idx
  on public.safety_disclosures(tenant_id, episode_id, created_at);

create table if not exists public.order_quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurants(id) on delete cascade,
  episode_id uuid not null,
  quote_revision bigint not null,
  episode_revision bigint not null,
  currency_code text not null,
  line_items jsonb not null default '[]'::jsonb,
  catalog_snapshot jsonb not null default '{}'::jsonb,
  availability_snapshot jsonb not null default '{}'::jsonb,
  subtotal_minor_units bigint not null check (subtotal_minor_units >= 0),
  delivery_fee_minor_units bigint not null default 0 check (delivery_fee_minor_units >= 0),
  discount_minor_units bigint not null default 0 check (discount_minor_units >= 0),
  tax_minor_units bigint not null default 0 check (tax_minor_units >= 0),
  total_minor_units bigint not null check (total_minor_units >= 0),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  superseded_by_quote_id uuid,
  committed_order_id uuid,
  created_at timestamptz not null default now(),
  constraint order_quotes_tenant_id_id_key unique (tenant_id, id),
  constraint order_quotes_episode_revision_key unique (tenant_id, episode_id, quote_revision),
  constraint order_quotes_episode_fk
    foreign key (tenant_id, episode_id)
    references public.order_episodes(tenant_id, id)
    on delete cascade,
  constraint order_quotes_superseded_fk
    foreign key (tenant_id, superseded_by_quote_id)
    references public.order_quotes(tenant_id, id),
  constraint order_quotes_total_check
    check (total_minor_units = subtotal_minor_units + delivery_fee_minor_units + tax_minor_units - discount_minor_units)
);

create index if not exists order_quotes_tenant_episode_idx
  on public.order_quotes(tenant_id, episode_id, quote_revision desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_episodes_current_quote_fk'
      and conrelid = 'public.order_episodes'::regclass
  ) then
    alter table public.order_episodes
      add constraint order_episodes_current_quote_fk
      foreign key (tenant_id, current_quote_id)
      references public.order_quotes(tenant_id, id);
  end if;
end $$;

create table if not exists public.outbox_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurants(id) on delete cascade,
  thread_id uuid not null,
  episode_id uuid,
  turn_event_id uuid,
  quote_id uuid,
  idempotency_key text not null,
  destination_channel text not null check (destination_channel in ('whatsapp', 'web', 'staff')),
  destination_ref text not null,
  response_plan jsonb not null default '{}'::jsonb,
  customer_response jsonb not null default '{}'::jsonb,
  ownership_generation bigint not null,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'failed', 'suppressed', 'cancelled')),
  send_after timestamptz not null default now(),
  sent_at timestamptz,
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  constraint outbox_messages_tenant_id_id_key unique (tenant_id, id),
  constraint outbox_messages_idempotency_key unique (tenant_id, idempotency_key),
  constraint outbox_messages_thread_fk
    foreign key (tenant_id, thread_id)
    references public.conversation_threads(tenant_id, id)
    on delete cascade,
  constraint outbox_messages_episode_fk
    foreign key (tenant_id, episode_id)
    references public.order_episodes(tenant_id, id),
  constraint outbox_messages_turn_fk
    foreign key (tenant_id, turn_event_id)
    references public.episode_turn_events(tenant_id, id),
  constraint outbox_messages_quote_fk
    foreign key (tenant_id, quote_id)
    references public.order_quotes(tenant_id, id)
);

create index if not exists outbox_messages_tenant_status_idx
  on public.outbox_messages(tenant_id, status, send_after);

create table if not exists public.customer_memories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid,
  thread_id uuid,
  source_episode_id uuid,
  source_turn_event_id uuid,
  memory_kind text not null
    check (memory_kind in (
      'explicit_preference',
      'confirmed_address',
      'reconfirmed_safety_disclosure',
      'structured_prior_confirmed_order'
    )),
  memory_fingerprint text not null,
  value jsonb not null default '{}'::jsonb,
  explicit_consent_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint customer_memories_tenant_id_id_key unique (tenant_id, id),
  constraint customer_memories_thread_fk
    foreign key (tenant_id, thread_id)
    references public.conversation_threads(tenant_id, id),
  constraint customer_memories_episode_fk
    foreign key (tenant_id, source_episode_id)
    references public.order_episodes(tenant_id, id),
  constraint customer_memories_turn_fk
    foreign key (tenant_id, source_turn_event_id)
    references public.episode_turn_events(tenant_id, id)
);

create unique index if not exists customer_memories_active_fingerprint_idx
  on public.customer_memories(tenant_id, customer_id, memory_kind, memory_fingerprint)
  where revoked_at is null;

create table if not exists public.brain_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurants(id) on delete cascade,
  thread_id uuid,
  episode_id uuid,
  turn_event_id uuid,
  run_kind text not null check (run_kind in ('sensor', 'understanding', 'validator', 'decision', 'committer', 'dispatcher', 'shadow')),
  pipeline_stage integer not null check (pipeline_stage between 0 and 9),
  status text not null default 'started' check (status in ('started', 'succeeded', 'failed', 'suppressed')),
  model text,
  input_trace jsonb not null default '{}'::jsonb,
  output_trace jsonb not null default '{}'::jsonb,
  deterministic_decision jsonb not null default '{}'::jsonb,
  internal_diagnostics jsonb not null default '{}'::jsonb,
  error_class text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  latency_ms integer,
  constraint brain_runs_tenant_id_id_key unique (tenant_id, id),
  constraint brain_runs_thread_fk
    foreign key (tenant_id, thread_id)
    references public.conversation_threads(tenant_id, id),
  constraint brain_runs_episode_fk
    foreign key (tenant_id, episode_id)
    references public.order_episodes(tenant_id, id),
  constraint brain_runs_turn_fk
    foreign key (tenant_id, turn_event_id)
    references public.episode_turn_events(tenant_id, id)
);

create index if not exists brain_runs_tenant_stage_idx
  on public.brain_runs(tenant_id, pipeline_stage, started_at);

do $$
declare
  t text;
begin
  foreach t in array array[
    'channel_inbox',
    'conversation_threads',
    'order_episodes',
    'episode_turn_events',
    'pending_prompts',
    'safety_disclosures',
    'order_quotes',
    'outbox_messages',
    'customer_memories',
    'brain_runs'
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
