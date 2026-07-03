-- ============================================================================
-- MaitreAI — WO-1: conversation_outcomes (the keystone structured-truth table)
-- One WRITTEN-ONCE row per conversation at its terminal state. Powers the
-- Outcomes page, the weekly owner report, and every future module.
--
-- Two clearly separated halves (like conversation_reports, but written-once and
-- purpose-built for the outcomes funnel):
--   • DETERMINISTIC SPINE — system-known facts only: conversation_id, customer_id,
--     order_id, order_value (the ENGINE order total, never recomputed here),
--     duration, handled_by + human_names (from messages.sender + operator identity),
--     ad_source (from the stored referral). TRUE, free, never inferred.
--   • MODEL-CLASSIFIED LAYER — one cheap LLM read fills outcome, intent,
--     lost_reason, objection_quote, items_mentioned, sentiment. LABELED as
--     model-classified via the `classifier` column ('llm_v1'). A read, never a
--     measurement.
--
-- WRITTEN-ONCE LAW: unique(conversation_id) + the application never UPDATEs an
-- existing row (insert-only; on conflict do nothing + log). `outcome` is NOT NULL
-- with a checked enum, so a null/invented outcome can never be stored — a missing
-- classification is a GAP (logged to system_alerts), never a fabricated row.
--
-- Flag-gated at the application layer (conversation_outcomes, default OFF for ALL
-- tenants): this table simply stays empty until a tenant is explicitly enabled.
-- Additive + idempotent (safe to re-run).
-- ============================================================================

create table if not exists public.conversation_outcomes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  -- WRITTEN-ONCE key: exactly one outcome row per conversation, forever.
  conversation_id uuid not null unique references public.conversations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,

  -- ---- MODEL-CLASSIFIED (labeled via `classifier`) ----
  -- NOT NULL: a null/invented outcome is never allowed — a missing classification
  -- is a logged gap, not a row.
  outcome text not null
    check (outcome in ('confirmed','lost','abandoned','complaint','info_only')),
  intent text,
  lost_reason text
    check (lost_reason in ('price','out_of_stock','delivery_time','zone_unavailable','payment','no_response','other')),
  objection_quote text,
  items_mentioned text[] not null default '{}',
  sentiment text
    check (sentiment in ('positive','neutral','negative')),
  -- Which classifier produced the model-labeled fields above (never presented as fact).
  classifier text not null default 'llm_v1',

  -- ---- DETERMINISTIC SPINE (system-sourced, true) ----
  order_id uuid references public.orders(id) on delete set null,
  order_value numeric(12,2),
  ad_source text,
  handled_by text not null default 'karim'
    check (handled_by in ('karim','human','mixed')),
  human_names text[] not null default '{}',
  duration_seconds integer,

  created_at timestamptz not null default now()
);

create index if not exists conversation_outcomes_restaurant_idx  on public.conversation_outcomes(restaurant_id);
create index if not exists conversation_outcomes_customer_idx    on public.conversation_outcomes(customer_id);
create index if not exists conversation_outcomes_outcome_idx     on public.conversation_outcomes(outcome);
create index if not exists conversation_outcomes_created_idx     on public.conversation_outcomes(created_at);
-- (conversation_id already has a unique index from the UNIQUE constraint.)

-- RLS: per-tenant, read-only for members (an analytics artifact). Writes happen
-- ONLY via the service role (the emitter), which bypasses RLS — so there is no
-- client write policy, mirroring conversation_reports.
alter table public.conversation_outcomes enable row level security;
drop policy if exists conversation_outcomes_read on public.conversation_outcomes;
create policy conversation_outcomes_read on public.conversation_outcomes
  for select using (public.is_member_of(restaurant_id));

-- ---- COVERAGE VIEW: closed conversations vs outcome rows, per restaurant per day.
-- Gap = a closed conversation with no outcome row (a classification the emitter
-- never managed to write). security_invoker so the querying member's RLS on the
-- underlying tables applies — a member sees ONLY their own tenant's coverage.
create or replace view public.outcome_coverage
  with (security_invoker = on) as
select
  c.restaurant_id,
  date(c.updated_at) as day,
  count(*)                                   as closed_conversations,
  count(o.id)                                as outcomes_recorded,
  count(*) - count(o.id)                     as gaps
from public.conversations c
left join public.conversation_outcomes o on o.conversation_id = c.id
where c.ownership_state = 'CLOSED'
group by c.restaurant_id, date(c.updated_at);

grant select on public.outcome_coverage to authenticated, service_role;
