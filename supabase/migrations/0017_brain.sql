-- ============================================================================
-- MaitreAI — Learning System Piece 1: the Restaurant Brain (shared memory).
-- ADDITIVE ONLY. Structured, tenant-scoped memory both agents READ and the owner
-- agent (later the analysis job) WRITES. This is KNOWLEDGE — learned facts,
-- preferences, policies — NOT a source of prices or live availability (those
-- stay in the menu/tools). Pieces 2 (analysis job) + 3 (owner loop) fill the
-- insights/QA tables; here they're created empty and ready. Idempotent.
-- (0016 is reserved for the stacked delivery module branch.)
-- ============================================================================

-- 1. brain_facts — durable "things we know about this restaurant" -------------
create table if not exists public.brain_facts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  -- menu_gap | delivery | customer_preference | policy | operations | other
  category text not null default 'other',
  fact text not null,
  -- analysis | owner_answer | manual
  source text not null default 'manual',
  confidence numeric(5,2),
  status text not null default 'active',  -- active | archived
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists brain_facts_restaurant_idx on public.brain_facts(restaurant_id);
create index if not exists brain_facts_active_idx on public.brain_facts(restaurant_id, status);

-- 2. brain_insights — what the analysis job (Piece 2) will write ---------------
create table if not exists public.brain_insights (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  type text not null,
  summary text not null,
  evidence jsonb not null default '{}'::jsonb,   -- counts, sample conversation ids, …
  status text not null default 'pending',        -- pending | surfaced | answered | dismissed
  created_at timestamptz not null default now()
);
create index if not exists brain_insights_restaurant_idx on public.brain_insights(restaurant_id, status);

-- 3. brain_owner_qa — the owner Q&A loop's record (Piece 3) --------------------
create table if not exists public.brain_owner_qa (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  question text not null,
  answer text,
  asked_at timestamptz not null default now(),
  answered_at timestamptz,
  resulting_fact_id uuid references public.brain_facts(id) on delete set null
);
create index if not exists brain_owner_qa_restaurant_idx on public.brain_owner_qa(restaurant_id);

-- RLS — members read/write their tenant; the service role (engine/analysis job)
-- bypasses RLS.
alter table public.brain_facts enable row level security;
drop policy if exists brain_facts_rw on public.brain_facts;
create policy brain_facts_rw on public.brain_facts
  using (public.is_member_of(restaurant_id)) with check (public.is_member_of(restaurant_id));

alter table public.brain_insights enable row level security;
drop policy if exists brain_insights_rw on public.brain_insights;
create policy brain_insights_rw on public.brain_insights
  using (public.is_member_of(restaurant_id)) with check (public.is_member_of(restaurant_id));

alter table public.brain_owner_qa enable row level security;
drop policy if exists brain_owner_qa_rw on public.brain_owner_qa;
create policy brain_owner_qa_rw on public.brain_owner_qa
  using (public.is_member_of(restaurant_id)) with check (public.is_member_of(restaurant_id));

notify pgrst, 'reload schema';
