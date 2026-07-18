-- ============================================================================
-- WO-S0-LEDGER: cost rollups over both ledgers.
-- PREPARE ONLY: PM applies this in the migration lane.
-- ============================================================================

create or replace view public.v_cost_per_order as
with usage_costs as (
  select
    o.id as order_id,
    o.restaurant_id as tenant_id,
    coalesce(sum(u.cost_usd), 0)::numeric(12,6) as usage_event_cost_usd,
    coalesce(sum(u.input_tokens), 0)::integer as usage_event_input_tokens,
    coalesce(sum(u.output_tokens), 0)::integer as usage_event_output_tokens,
    coalesce(sum(u.cache_read_tokens), 0)::integer as usage_event_cache_read_tokens,
    coalesce(sum(u.cache_creation_tokens), 0)::integer as usage_event_cache_creation_tokens
  from public.orders o
  left join public.usage_cost_events u
    on u.tenant_id = o.restaurant_id
   and (
      u.order_id = o.id
      or (u.order_id is null and u.conversation_id is not null and u.conversation_id = o.conversation_id)
   )
  group by o.id, o.restaurant_id
),
agent_run_costs as (
  select
    o.id as order_id,
    o.restaurant_id as tenant_id,
    coalesce(sum(ar.cost_usd), 0)::numeric(12,6) as agent_runs_cost_usd,
    coalesce(sum(ar.input_tokens), 0)::integer as agent_runs_input_tokens,
    coalesce(sum(ar.output_tokens), 0)::integer as agent_runs_output_tokens,
    coalesce(sum(ar.cache_read_tokens), 0)::integer as agent_runs_cache_read_tokens,
    coalesce(sum(ar.cache_creation_tokens), 0)::integer as agent_runs_cache_creation_tokens
  from public.orders o
  left join public.agent_runs ar
    on ar.restaurant_id = o.restaurant_id
   and ar.conversation_id = o.conversation_id
   and ar.trigger = 'customer'
  group by o.id, o.restaurant_id
)
select
  o.restaurant_id as tenant_id,
  o.id as order_id,
  o.conversation_id,
  o.order_number,
  o.order_status,
  o.created_at as order_created_at,
  arc.agent_runs_cost_usd,
  uc.usage_event_cost_usd,
  (arc.agent_runs_cost_usd + uc.usage_event_cost_usd)::numeric(12,6) as total_cost_usd,
  arc.agent_runs_input_tokens + uc.usage_event_input_tokens as input_tokens,
  arc.agent_runs_output_tokens + uc.usage_event_output_tokens as output_tokens,
  arc.agent_runs_cache_read_tokens + uc.usage_event_cache_read_tokens as cache_read_tokens,
  arc.agent_runs_cache_creation_tokens + uc.usage_event_cache_creation_tokens as cache_creation_tokens
from public.orders o
join agent_run_costs arc on arc.order_id = o.id
join usage_costs uc on uc.order_id = o.id;

create or replace view public.v_cost_per_tenant_day as
with agent_run_days as (
  select
    ar.restaurant_id as tenant_id,
    date_trunc('day', ar.created_at)::date as day,
    coalesce(sum(ar.cost_usd), 0)::numeric(12,6) as agent_runs_cost_usd,
    coalesce(sum(ar.input_tokens), 0)::integer as agent_runs_input_tokens,
    coalesce(sum(ar.output_tokens), 0)::integer as agent_runs_output_tokens,
    coalesce(sum(ar.cache_read_tokens), 0)::integer as agent_runs_cache_read_tokens,
    coalesce(sum(ar.cache_creation_tokens), 0)::integer as agent_runs_cache_creation_tokens
  from public.agent_runs ar
  where not (
    ar.trigger = 'owner'
    and ar.model is not null
    and coalesce(ar.tokens, 0) > 0
  )
  group by ar.restaurant_id, date_trunc('day', ar.created_at)::date
),
usage_event_days as (
  select
    u.tenant_id,
    date_trunc('day', u.ts)::date as day,
    coalesce(sum(u.cost_usd), 0)::numeric(12,6) as usage_event_cost_usd,
    coalesce(sum(u.input_tokens), 0)::integer as usage_event_input_tokens,
    coalesce(sum(u.output_tokens), 0)::integer as usage_event_output_tokens,
    coalesce(sum(u.cache_read_tokens), 0)::integer as usage_event_cache_read_tokens,
    coalesce(sum(u.cache_creation_tokens), 0)::integer as usage_event_cache_creation_tokens
  from public.usage_cost_events u
  group by u.tenant_id, date_trunc('day', u.ts)::date
),
days as (
  select tenant_id, day from agent_run_days
  union
  select tenant_id, day from usage_event_days
)
select
  d.tenant_id,
  d.day,
  coalesce(a.agent_runs_cost_usd, 0)::numeric(12,6) as agent_runs_cost_usd,
  coalesce(u.usage_event_cost_usd, 0)::numeric(12,6) as usage_event_cost_usd,
  (coalesce(a.agent_runs_cost_usd, 0) + coalesce(u.usage_event_cost_usd, 0))::numeric(12,6) as total_cost_usd,
  coalesce(a.agent_runs_input_tokens, 0) + coalesce(u.usage_event_input_tokens, 0) as input_tokens,
  coalesce(a.agent_runs_output_tokens, 0) + coalesce(u.usage_event_output_tokens, 0) as output_tokens,
  coalesce(a.agent_runs_cache_read_tokens, 0) + coalesce(u.usage_event_cache_read_tokens, 0) as cache_read_tokens,
  coalesce(a.agent_runs_cache_creation_tokens, 0) + coalesce(u.usage_event_cache_creation_tokens, 0) as cache_creation_tokens
from days d
left join agent_run_days a on a.tenant_id = d.tenant_id and a.day = d.day
left join usage_event_days u on u.tenant_id = d.tenant_id and u.day = d.day;
