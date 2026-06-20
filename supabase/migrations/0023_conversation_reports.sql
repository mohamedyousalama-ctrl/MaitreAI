-- ============================================================================
-- MaitreAI — Karim Pro P1: conversation-intelligence record
-- At every TERMINAL state of a Pro tenant's conversation we emit ONE structured
-- record. Two clearly separated halves:
--   • DETERMINISTIC SPINE — columns built ONLY from system-known facts (the
--     order, the escalation, the conversation row, message counts, timestamps).
--     These are TRUE: order_total/order_id come from the committed order, never
--     from model narration; order_placed is true ONLY if an order row exists.
--   • INFERRED SOFT LAYER — the single `inferred` jsonb, produced by ONE cheap
--     LLM read of the transcript. EXPLICITLY labeled as inference (its own column
--     + confidence + model + timestamp); downstream must treat it as a read, not
--     a measurement. inferred.allergy_notes is a hint ONLY — it NEVER changes the
--     live allergy-safety behavior.
--
-- Pro-gated at the application layer: standard tenants emit nothing, so this
-- table simply stays empty for them. Additive + idempotent (safe to re-run).
-- ============================================================================

create table if not exists public.conversation_reports (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  channel text not null default 'whatsapp',

  -- ---- DETERMINISTIC SPINE (system-sourced, true) ----
  primary_intent text,
  outcome text not null
    check (outcome in ('order_placed','escalated','abandoned','answered','no_outcome')),
  terminal_trigger text not null
    check (terminal_trigger in ('finalized','escalated','abandoned')),
  order_placed boolean not null default false,
  order_total numeric(12,2),
  fulfillment text check (fulfillment in ('delivery','pickup')),
  payment_method text,
  escalated boolean not null default false,
  escalation_reason text,
  turn_count integer not null default 0,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,

  -- ---- INFERRED SOFT LAYER (labeled — never treated as fact) ----
  inferred jsonb,
  inferred_model text,
  inferred_at timestamptz,

  created_at timestamptz not null default now(),

  -- One record per conversation terminal state (idempotency guard — re-emitting
  -- the same terminal state is a no-op upsert, never a duplicate).
  unique (conversation_id, terminal_trigger)
);

create index if not exists conversation_reports_restaurant_idx on public.conversation_reports(restaurant_id);
create index if not exists conversation_reports_customer_idx   on public.conversation_reports(customer_id);
create index if not exists conversation_reports_conversation_idx on public.conversation_reports(conversation_id);
create index if not exists conversation_reports_outcome_idx    on public.conversation_reports(outcome);
create index if not exists conversation_reports_created_idx    on public.conversation_reports(created_at);

-- RLS: per-tenant, read-only for members (an analytics/intelligence artifact).
-- Writes happen ONLY via the service role (the emitter), which bypasses RLS —
-- so there is no client write policy, mirroring promotion_redemptions.
alter table public.conversation_reports enable row level security;
drop policy if exists conversation_reports_read on public.conversation_reports;
create policy conversation_reports_read on public.conversation_reports
  for select using (public.is_member_of(restaurant_id));
