-- ============================================================================
-- MaitreAI — Karim Pro P2: customer memory (DATA + operator-read half only)
-- A durable, per-customer memory record assembled from the P1 conversation_reports
-- stream. Memory is the cure for the #1 bot-tell (amnesia). This migration builds
-- the DATA layer ONLY; customer-facing surfacing (greeting-by-name, "the usual?")
-- is a SEPARATE later step behind its OWN gate.
--
-- Two clearly separated halves (the honesty convention, same as conversation_reports):
--   • DERIVED FROM FACTS — recomputed from real orders/system state, never narrated
--     by an LLM. order_count/total_spent/favorites/etc. are TRUE.
--   • LABELED INFERENCE — carried from a report's `inferred` read, kept under the
--     `inferred` jsonb, NEVER promoted to fact. allergy_notes here are OPERATOR
--     HINTS ONLY — they never change live allergy-safety behavior.
--
-- Gating is at the APPLICATION layer on a NEW, narrow `customer_memory` feature
-- flag — NOT implied by tier='pro' and NOT by the conversation_intelligence flag.
-- So a tenant with P1 on (e.g. Wesaya) gets NOTHING here until P2 is explicitly
-- enabled. Additive + idempotent. RLS per tenant, mirroring conversation_reports.
-- ============================================================================

create table if not exists public.customer_memory (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,

  -- ---- DERIVED FROM FACTS (durable, true — recomputed from orders) ----
  order_count integer not null default 0,
  total_spent numeric(12,2) not null default 0,
  avg_order_value numeric(12,2),
  first_seen timestamptz,
  last_seen timestamptz,
  last_order_id uuid references public.orders(id) on delete set null,
  fulfillment_pref text check (fulfillment_pref in ('delivery','pickup')),
  favorite_items jsonb not null default '[]'::jsonb,     -- [{ "name": ..., "qty": n }] ranked
  channels_used text[] not null default '{}',
  -- VIP / at-risk DERIVED from facts (count + recency), never an invented label.
  value_tier text check (value_tier in ('vip','regular','new','at_risk')),

  -- ---- LABELED INFERENCE (carried from P1 `inferred` — never treated as fact) ----
  -- { preferences:[], allergy_notes:[], sentiment_history:[{conversation_id,sentiment,at}],
  --   notable_flags:[], last_summary: "" }
  inferred jsonb not null default '{}'::jsonb,
  inferred_updated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One memory record per customer per tenant (the upsert target). Per-tenant by
  -- construction → no cross-tenant leakage.
  unique (restaurant_id, customer_id)
);

create index if not exists customer_memory_restaurant_idx on public.customer_memory(restaurant_id);
create index if not exists customer_memory_customer_idx    on public.customer_memory(customer_id);
create index if not exists customer_memory_value_tier_idx  on public.customer_memory(value_tier);

-- RLS: per-tenant, read-only for members (an internal operator-intelligence
-- artifact). Writes happen ONLY via the service role (the updater), which bypasses
-- RLS — so there is no client write policy, mirroring conversation_reports.
alter table public.customer_memory enable row level security;
drop policy if exists customer_memory_read on public.customer_memory;
create policy customer_memory_read on public.customer_memory
  for select using (public.is_member_of(restaurant_id));
