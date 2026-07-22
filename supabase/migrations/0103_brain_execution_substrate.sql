-- ============================================================================
-- MaitreAI - 0103: WO-BRAIN-0B durable execution substrate (PREPARE-ONLY).
--
-- Additive schema for shadow-only BRAIN durable execution. This migration:
--   - declares logged PGMQ queues for turn processing and dead-letter handling
--   - adds per-thread processing lease fields to BRAIN conversation_threads
--   - records shadow execution effects, dead letters, and throttle decisions
--   - exposes a member-scoped dead-letter inspection function
--
-- PREPARE ONLY. Do not apply from builder sessions.
-- ============================================================================

create extension if not exists pgmq;

do $$
begin
  if not exists (
    select 1
    from pgmq.list_queues() q
    where q.queue_name = 'brain_turn_processing'
  ) then
    perform pgmq.create('brain_turn_processing');
  end if;

  if not exists (
    select 1
    from pgmq.list_queues() q
    where q.queue_name = 'brain_turn_dead_letter'
  ) then
    perform pgmq.create('brain_turn_dead_letter');
  end if;

  if exists (
    select 1
    from pgmq.list_queues() q
    where q.queue_name in ('brain_turn_processing', 'brain_turn_dead_letter')
      and q.is_unlogged
  ) then
    raise exception 'BRAIN queues must be logged durable queues, not unlogged queues';
  end if;
end $$;

alter table public.conversation_threads
  add column if not exists processing_token uuid,
  add column if not exists processing_lease_until timestamptz,
  add column if not exists next_expected_sequence bigint not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversation_threads_processing_lease_pair_check'
      and conrelid = 'public.conversation_threads'::regclass
  ) then
    alter table public.conversation_threads
      add constraint conversation_threads_processing_lease_pair_check
      check (
        (processing_token is null and processing_lease_until is null)
        or
        (processing_token is not null and processing_lease_until is not null)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversation_threads_next_expected_sequence_check'
      and conrelid = 'public.conversation_threads'::regclass
  ) then
    alter table public.conversation_threads
      add constraint conversation_threads_next_expected_sequence_check
      check (next_expected_sequence >= 1);
  end if;
end $$;

create index if not exists conversation_threads_processing_lease_idx
  on public.conversation_threads(tenant_id, processing_lease_until)
  where processing_token is not null;

create index if not exists conversation_threads_sequence_idx
  on public.conversation_threads(tenant_id, id, next_expected_sequence);

create table if not exists public.brain_execution_effects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurants(id) on delete cascade,
  thread_id uuid not null,
  channel_event_id uuid,
  queue_name text not null default 'brain_turn_processing',
  queue_message_id bigint,
  operation_key text not null,
  attempt_kind text not null check (attempt_kind in ('deterministic', 'llm_bound')),
  requested_by text not null check (requested_by in ('brain_ingress_shadow', 'operator_replay', 'system_recovery')),
  lease_token uuid not null,
  ownership_generation bigint not null,
  episode_revision bigint,
  effect_kind text not null default 'shadow_turn_processing'
    check (effect_kind in ('shadow_turn_processing', 'duplicate_suppressed', 'stale_rejected')),
  effect_metadata jsonb not null default '{}'::jsonb,
  committed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint brain_execution_effects_tenant_id_id_key unique (tenant_id, id),
  constraint brain_execution_effects_operation_key unique (tenant_id, operation_key),
  constraint brain_execution_effects_thread_fk
    foreign key (tenant_id, thread_id)
    references public.conversation_threads(tenant_id, id)
    on delete cascade,
  constraint brain_execution_effects_channel_event_fk
    foreign key (tenant_id, channel_event_id)
    references public.channel_events(tenant_id, id)
);

create index if not exists brain_execution_effects_thread_idx
  on public.brain_execution_effects(tenant_id, thread_id, committed_at desc);

create index if not exists brain_execution_effects_channel_event_idx
  on public.brain_execution_effects(tenant_id, channel_event_id)
  where channel_event_id is not null;

create table if not exists public.brain_execution_dead_letters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurants(id) on delete cascade,
  thread_id uuid,
  channel_event_id uuid,
  inbox_id uuid,
  turn_event_id uuid,
  queue_name text not null,
  original_queue_message_id bigint,
  operation_key text not null,
  attempt_kind text not null check (attempt_kind in ('deterministic', 'llm_bound')),
  attempt_count integer not null check (attempt_count >= 1),
  first_failure_at timestamptz not null,
  last_failure_at timestamptz not null default now(),
  last_error_class text not null,
  last_error_message text not null,
  business_effect_committed boolean not null default false,
  required_operator_action text not null,
  payload_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint brain_execution_dead_letters_tenant_id_id_key unique (tenant_id, id),
  constraint brain_execution_dead_letters_operation_key unique (tenant_id, operation_key),
  constraint brain_execution_dead_letters_thread_fk
    foreign key (tenant_id, thread_id)
    references public.conversation_threads(tenant_id, id),
  constraint brain_execution_dead_letters_channel_event_fk
    foreign key (tenant_id, channel_event_id)
    references public.channel_events(tenant_id, id),
  constraint brain_execution_dead_letters_inbox_fk
    foreign key (tenant_id, inbox_id)
    references public.channel_inbox(tenant_id, id),
  constraint brain_execution_dead_letters_turn_fk
    foreign key (tenant_id, turn_event_id)
    references public.episode_turn_events(tenant_id, id),
  constraint brain_execution_dead_letters_payload_shape_check
    check (jsonb_typeof(payload_metadata) = 'object')
);

create index if not exists brain_execution_dead_letters_tenant_created_idx
  on public.brain_execution_dead_letters(tenant_id, created_at desc);

create index if not exists brain_execution_dead_letters_thread_idx
  on public.brain_execution_dead_letters(tenant_id, thread_id, created_at desc)
  where thread_id is not null;

create table if not exists public.brain_execution_throttle_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurants(id) on delete cascade,
  thread_id uuid,
  channel_event_id uuid,
  customer_channel_hash text,
  throttle_scope text not null check (throttle_scope in ('global', 'tenant', 'thread', 'phone')),
  throttle_reason text not null check (throttle_reason in (
    'queue_backlog',
    'oldest_message_age',
    'tenant_rate',
    'phone_rate',
    'thread_queue_depth',
    'retry_limit',
    'database_unavailable',
    'provider_outage',
    'cost_budget_exhausted'
  )),
  metric_name text not null,
  metric_value bigint not null check (metric_value >= 0),
  threshold_value bigint not null check (threshold_value >= 0),
  action text not null check (action in ('shed_shadow', 'defer', 'dead_letter', 'alert_only')),
  alert_required boolean not null default true,
  alerted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint brain_execution_throttle_events_tenant_id_id_key unique (tenant_id, id),
  constraint brain_execution_throttle_events_thread_fk
    foreign key (tenant_id, thread_id)
    references public.conversation_threads(tenant_id, id),
  constraint brain_execution_throttle_events_channel_event_fk
    foreign key (tenant_id, channel_event_id)
    references public.channel_events(tenant_id, id)
);

create index if not exists brain_execution_throttle_events_tenant_created_idx
  on public.brain_execution_throttle_events(tenant_id, created_at desc);

create index if not exists brain_execution_throttle_events_scope_idx
  on public.brain_execution_throttle_events(tenant_id, throttle_scope, throttle_reason, created_at desc);

create or replace function public.brain_list_execution_dead_letters(
  p_tenant_id uuid,
  p_limit integer default 50
)
returns table (
  id uuid,
  tenant_id uuid,
  thread_id uuid,
  channel_event_id uuid,
  inbox_id uuid,
  turn_event_id uuid,
  queue_name text,
  original_queue_message_id bigint,
  operation_key text,
  attempt_kind text,
  attempt_count integer,
  first_failure_at timestamptz,
  last_failure_at timestamptz,
  last_error_class text,
  last_error_message text,
  business_effect_committed boolean,
  required_operator_action text,
  created_at timestamptz
)
language sql
security invoker
stable
set search_path = public
as $$
  select
    dl.id,
    dl.tenant_id,
    dl.thread_id,
    dl.channel_event_id,
    dl.inbox_id,
    dl.turn_event_id,
    dl.queue_name,
    dl.original_queue_message_id,
    dl.operation_key,
    dl.attempt_kind,
    dl.attempt_count,
    dl.first_failure_at,
    dl.last_failure_at,
    dl.last_error_class,
    dl.last_error_message,
    dl.business_effect_committed,
    dl.required_operator_action,
    dl.created_at
  from public.brain_execution_dead_letters dl
  where dl.tenant_id = p_tenant_id
    and public.is_member_of(p_tenant_id)
  order by dl.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

revoke all on function public.brain_list_execution_dead_letters(uuid, integer) from public;
grant execute on function public.brain_list_execution_dead_letters(uuid, integer) to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'brain_execution_effects',
    'brain_execution_dead_letters',
    'brain_execution_throttle_events'
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
