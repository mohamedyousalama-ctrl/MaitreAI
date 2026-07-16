-- MaitreAI / Kivo — Week-1 orchestration deflection metrics
-- Read-only analytics. No schema changes, no writes, no temp tables.
--
-- How to use:
--   1. Edit the params CTE at the top of EACH query:
--        restaurant_id: tenant to measure
--        start_at/end_at: inclusive lower bound, exclusive upper bound
--   2. Run the desired query in the Supabase SQL editor or psql.
--
-- Customer-turn scope:
--   agent_runs.trigger = 'customer' is the ordering-text rail that goal-logic gates.
--   Voice ('voice') and image perception ('image_perception') are separate rails and
--   intentionally excluded from the deflection-rate denominator.
--
-- Short-circuit definition:
--   agent_runs.model = 'deterministic_goal_interpreter'
--
-- Completed-order definition:
--   For Week-1/Week-2 measurement, "completed order" means an order reached the
--   system/order queue, not necessarily delivered. Wesaya currently has many
--   pending_confirmation rows while it is not fully selling live, so this predicate
--   intentionally includes pending_confirmation. Tighten this single editable line
--   later if the business question changes to delivered-only economics.

-- ---------------------------------------------------------------------------
-- 1) DEFLECTION RATE
-- Measures the share of customer text turns short-circuited by goal-logic.
-- Week-2 decision use: baseline the current deflection tax and verify the
-- annotation pivot drives this toward the <2-3% target.
-- ---------------------------------------------------------------------------
with params as (
  select
    '00000000-0000-0000-0000-000000000000'::uuid as restaurant_id,
    '2026-07-01 00:00:00+00'::timestamptz as start_at,
    '2026-08-01 00:00:00+00'::timestamptz as end_at
),
customer_turns as (
  select ar.*
  from public.agent_runs ar
  join params p on p.restaurant_id = ar.restaurant_id
  where ar.created_at >= p.start_at
    and ar.created_at < p.end_at
    and ar.trigger = 'customer'
)
select
  count(*) as customer_turns,
  count(*) filter (where model = 'deterministic_goal_interpreter') as short_circuits,
  round(
    100.0 * count(*) filter (where model = 'deterministic_goal_interpreter')
    / nullif(count(*), 0),
    2
  ) as deflection_rate_pct
from customer_turns;

-- ---------------------------------------------------------------------------
-- 2) DEFLECTION BREAKDOWN BY KIND
-- Breaks short-circuits into unclear/referent/bare_assent using the persisted
-- conversation_signals detail payload.
-- Week-2 decision use: isolate the perception-read "unclear" bucket from
-- referent/bare-assent cases so the annotation pivot is measured against the
-- defect class it is meant to reduce.
-- ---------------------------------------------------------------------------
with params as (
  select
    '00000000-0000-0000-0000-000000000000'::uuid as restaurant_id,
    '2026-07-01 00:00:00+00'::timestamptz as start_at,
    '2026-08-01 00:00:00+00'::timestamptz as end_at
),
short_circuits as (
  select ar.id, ar.restaurant_id, ar.conversation_id, ar.created_at
  from public.agent_runs ar
  join params p on p.restaurant_id = ar.restaurant_id
  where ar.created_at >= p.start_at
    and ar.created_at < p.end_at
    and ar.trigger = 'customer'
    and ar.model = 'deterministic_goal_interpreter'
),
matched_signals as (
  select
    sc.id as agent_run_id,
    coalesce(cs.detail->>'kind', 'unknown') as kind
  from short_circuits sc
  left join lateral (
    select cs.detail
    from public.conversation_signals cs
    where cs.restaurant_id = sc.restaurant_id
      and cs.conversation_id = sc.conversation_id
      and cs.detail->>'reason' = 'goal_clarify'
      and cs.created_at >= sc.created_at - interval '5 seconds'
      and cs.created_at <= sc.created_at + interval '5 seconds'
    order by abs(extract(epoch from (cs.created_at - sc.created_at)))
    limit 1
  ) cs on true
)
select
  kind,
  count(*) as short_circuits,
  round(100.0 * count(*) / nullif(sum(count(*)) over (), 0), 2) as share_of_short_circuits_pct
from matched_signals
group by kind
order by short_circuits desc, kind;

-- ---------------------------------------------------------------------------
-- 3) TURN-TAX / RECOVERY RATE
-- Looks at the next customer turn in the same conversation after a short-circuit.
-- Week-2 decision use: quantify "pointless deflections" where the customer
-- rephrased and the real model ran next, double-deflection loops, and possible
-- abandonment when no next turn exists in the window.
-- ---------------------------------------------------------------------------
with params as (
  select
    '00000000-0000-0000-0000-000000000000'::uuid as restaurant_id,
    '2026-07-01 00:00:00+00'::timestamptz as start_at,
    '2026-08-01 00:00:00+00'::timestamptz as end_at
),
ordered_turns as (
  select
    ar.id,
    ar.restaurant_id,
    ar.conversation_id,
    ar.created_at,
    ar.model,
    lead(ar.model) over (
      partition by ar.restaurant_id, ar.conversation_id
      order by ar.created_at, ar.id
    ) as next_model,
    lead(ar.created_at) over (
      partition by ar.restaurant_id, ar.conversation_id
      order by ar.created_at, ar.id
    ) as next_created_at
  from public.agent_runs ar
  join params p on p.restaurant_id = ar.restaurant_id
  where ar.created_at >= p.start_at
    and ar.created_at < p.end_at
    and ar.trigger = 'customer'
    and ar.conversation_id is not null
),
short_circuits as (
  select *
  from ordered_turns
  where model = 'deterministic_goal_interpreter'
),
classified as (
  select
    case
      when next_model is null then 'last_turn_possible_abandonment'
      when next_model = 'deterministic_goal_interpreter' then 'double_deflection_loop'
      else 'recovered_next_turn_real_model'
    end as outcome,
    next_created_at - created_at as time_to_next_turn
  from short_circuits
)
select
  outcome,
  count(*) as short_circuits,
  round(100.0 * count(*) / nullif(sum(count(*)) over (), 0), 2) as share_pct,
  percentile_cont(0.5) within group (order by time_to_next_turn) as p50_time_to_next_turn
from classified
group by outcome
order by short_circuits desc, outcome;

-- ---------------------------------------------------------------------------
-- 4) COST PER COMPLETED ORDER
-- Measures Sonnet/model spend in the window against orders that reached the
-- restaurant system. Also includes cost per customer turn for contrast.
-- Week-2 decision use: deflection fixes should reduce turn-tax without pushing
-- cost per completed order in the wrong direction.
--
-- Cost caveat:
--   agent_runs.cost_usd currently does not price cache_creation_tokens. Treat
--   cost-per-order as a lower bound until cache-write pricing is included.
-- ---------------------------------------------------------------------------
with params as (
  select
    '00000000-0000-0000-0000-000000000000'::uuid as restaurant_id,
    '2026-07-01 00:00:00+00'::timestamptz as start_at,
    '2026-08-01 00:00:00+00'::timestamptz as end_at
),
completed_order_statuses as (
  -- EDIT THIS LINE when the business definition changes.
  select unnest(array[
    'pending_confirmation',
    'pending_payment',
    'paid',
    'preparing',
    'ready',
    'out_for_delivery',
    'delivered'
  ]) as order_status
),
costs as (
  select
    coalesce(sum(ar.cost_usd), 0)::numeric as total_cost_usd,
    count(*) filter (where ar.trigger = 'customer') as customer_turns,
    count(*) filter (where ar.trigger = 'customer' and ar.model <> 'deterministic_goal_interpreter') as real_model_customer_turns,
    coalesce(sum(ar.input_tokens), 0) as input_tokens,
    coalesce(sum(ar.output_tokens), 0) as output_tokens,
    coalesce(sum(ar.cache_read_tokens), 0) as cache_read_tokens,
    coalesce(sum(ar.cache_creation_tokens), 0) as cache_creation_tokens_unpriced
  from public.agent_runs ar
  join params p on p.restaurant_id = ar.restaurant_id
  where ar.created_at >= p.start_at
    and ar.created_at < p.end_at
    and ar.trigger = 'customer'
),
orders_reached_system as (
  select count(*) as completed_orders
  from public.orders o
  join params p on p.restaurant_id = o.restaurant_id
  join completed_order_statuses cos on cos.order_status = o.order_status
  where o.created_at >= p.start_at
    and o.created_at < p.end_at
)
select
  costs.total_cost_usd,
  orders_reached_system.completed_orders,
  round(costs.total_cost_usd / nullif(orders_reached_system.completed_orders, 0), 6) as cost_per_completed_order_usd,
  costs.customer_turns,
  round(costs.total_cost_usd / nullif(costs.customer_turns, 0), 6) as cost_per_customer_turn_usd,
  costs.real_model_customer_turns,
  costs.input_tokens,
  costs.output_tokens,
  costs.cache_read_tokens,
  costs.cache_creation_tokens_unpriced
from costs
cross join orders_reached_system;

-- ---------------------------------------------------------------------------
-- 5) p50/p95 LATENCY PER CUSTOMER TURN
-- Measures turn latency for the same text-ordering rail.
-- Week-2 decision use: prove orchestration changes reduce deflection without
-- introducing unacceptable latency.
-- ---------------------------------------------------------------------------
with params as (
  select
    '00000000-0000-0000-0000-000000000000'::uuid as restaurant_id,
    '2026-07-01 00:00:00+00'::timestamptz as start_at,
    '2026-08-01 00:00:00+00'::timestamptz as end_at
)
select
  count(*) filter (where ar.latency_ms is not null) as turns_with_latency,
  percentile_cont(0.5) within group (order by ar.latency_ms) as p50_latency_ms,
  percentile_cont(0.95) within group (order by ar.latency_ms) as p95_latency_ms,
  round(avg(ar.latency_ms), 2) as avg_latency_ms
from public.agent_runs ar
join params p on p.restaurant_id = ar.restaurant_id
where ar.created_at >= p.start_at
  and ar.created_at < p.end_at
  and ar.trigger = 'customer'
  and ar.latency_ms is not null;
