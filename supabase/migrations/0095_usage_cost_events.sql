-- ============================================================================
-- WO-S0-LEDGER: canonical usage-cost events for LLM calls not fully covered by
-- the legacy agent_runs row. PREPARE ONLY: PM applies this in the migration lane.
-- ============================================================================

create table if not exists public.usage_cost_events (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  tenant_id uuid not null references public.restaurants(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  surface text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_creation_tokens integer not null default 0,
  cost_usd numeric(12,6) not null default 0,
  latency_ms integer,
  trigger text not null,
  meta jsonb not null default '{}'::jsonb,
  constraint usage_cost_events_input_tokens_nonnegative check (input_tokens >= 0),
  constraint usage_cost_events_output_tokens_nonnegative check (output_tokens >= 0),
  constraint usage_cost_events_cache_read_tokens_nonnegative check (cache_read_tokens >= 0),
  constraint usage_cost_events_cache_creation_tokens_nonnegative check (cache_creation_tokens >= 0),
  constraint usage_cost_events_cost_usd_nonnegative check (cost_usd >= 0),
  constraint usage_cost_events_latency_ms_nonnegative check (latency_ms is null or latency_ms >= 0)
);

create index if not exists usage_cost_events_tenant_ts_idx
  on public.usage_cost_events(tenant_id, ts desc);

create index if not exists usage_cost_events_conversation_idx
  on public.usage_cost_events(conversation_id)
  where conversation_id is not null;

create index if not exists usage_cost_events_order_idx
  on public.usage_cost_events(order_id)
  where order_id is not null;

create index if not exists usage_cost_events_surface_idx
  on public.usage_cost_events(surface, ts desc);

alter table public.usage_cost_events enable row level security;

drop policy if exists usage_cost_events_read on public.usage_cost_events;
create policy usage_cost_events_read on public.usage_cost_events
  for select using (public.is_member_of(tenant_id));
