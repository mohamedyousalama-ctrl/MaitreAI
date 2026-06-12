-- ============================================================================
-- MaitreAI — Sprint 8 (the real Brain): foundation
-- 1. Per-message LLM token/cost observability on agent_runs (cost visibility
--    for the overage pricing model — owner requirement).
-- 2. conversation_signals (Amendment 03 §J1): unknown questions, off-menu,
--    money mismatches, escalations, etc. — the learning/insight substrate.
-- 3. System mode + autonomy on restaurants (§F system modes, §G autonomy):
--    agent_mode = setup|test|live|paused; auto_accept_orders defaults FALSE
--    (manual restaurant confirm by default; auto-accept is opt-in per tenant).
-- Idempotent.
-- ============================================================================

-- 1. agent_runs — per-call LLM cost/observability ----------------------------
alter table public.agent_runs
  add column if not exists model             text,
  add column if not exists adapter           text,            -- 'claude' | 'mock'
  add column if not exists input_tokens      int,
  add column if not exists output_tokens     int,
  add column if not exists cache_read_tokens int,
  add column if not exists cost_usd          numeric(12,6);

-- 2. conversation_signals (§J1) ---------------------------------------------
create table if not exists public.conversation_signals (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  type text not null,            -- unknown_question | off_menu | money_mismatch
                                 -- | low_confidence | escalation | closed_attempt
                                 -- | missing_data
  detail jsonb not null default '{}'::jsonb,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists conversation_signals_restaurant_idx
  on public.conversation_signals(restaurant_id);
create index if not exists conversation_signals_type_idx
  on public.conversation_signals(restaurant_id, type);

-- 3. System mode + autonomy on restaurants (§F, §G) --------------------------
alter table public.restaurants
  add column if not exists agent_mode         text not null default 'setup',  -- setup | test | live | paused
  add column if not exists auto_accept_orders boolean not null default false;  -- manual accept by default (§G)

-- RLS for the new table — operational: any member reads/writes; the engine
-- writes via the service role (which bypasses RLS).
alter table public.conversation_signals enable row level security;
drop policy if exists conversation_signals_rw on public.conversation_signals;
create policy conversation_signals_rw on public.conversation_signals
  using (public.is_member_of(restaurant_id))
  with check (public.is_member_of(restaurant_id));
