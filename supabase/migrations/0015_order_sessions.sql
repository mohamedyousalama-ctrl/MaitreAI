-- ============================================================================
-- MaitreAI — Step 1: persistent order session (the keystone). ADDITIVE ONLY.
-- A durable, per-conversation order session so the Customer Agent holds an order
-- across multiple messages instead of rebuilding an empty draft every turn.
-- Money columns are a tool-computed snapshot (the model never writes them).
-- Server (service-role) writes these; members may read/write their tenant's rows.
-- Idempotent: only CREATE ... IF NOT EXISTS / additive indexes + policies.
-- ============================================================================

-- 1. order_sessions — one live session per conversation -----------------------
create table if not exists public.order_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  -- building → live draft · confirmed → finalized this turn (awaiting order row)
  -- finalized → converted to a real order · cancelled → abandoned
  status text not null default 'building',
  fulfillment_type text,                         -- delivery | pickup | null
  delivery_zone text,
  delivery_fee numeric(12,2) not null default 0,
  address text,
  currency text not null default 'ج.م',
  -- tool-computed money snapshot (verbatim from the order tools)
  subtotal numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  total numeric(12,2) not null default 0,
  -- conversational state for resuming a turn
  pending_question text,
  last_presented_options jsonb not null default '[]'::jsonb,
  last_interactive_ids jsonb not null default '[]'::jsonb,
  confirmation_status text not null default 'none', -- none | awaiting | confirmed
  order_id uuid references public.orders(id) on delete set null, -- set on finalize
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists order_sessions_conversation_idx on public.order_sessions(conversation_id);
create index if not exists order_sessions_restaurant_idx on public.order_sessions(restaurant_id);
-- At most ONE active (building) session per conversation (lifecycle §1C).
create unique index if not exists order_sessions_one_active_idx
  on public.order_sessions(conversation_id) where (status = 'building');

-- 2. order_session_lines — the draft's line items -----------------------------
create table if not exists public.order_session_lines (
  id uuid primary key default gen_random_uuid(),
  order_session_id uuid not null references public.order_sessions(id) on delete cascade,
  item_id text not null,                         -- menu item id (decoupled; no FK)
  name text not null,
  qty integer not null default 1,
  unit_price numeric(12,2) not null default 0,   -- base + modifiers, tool-computed
  modifiers jsonb not null default '[]'::jsonb,  -- [{name, priceImpact}]
  line_total numeric(12,2) not null default 0,   -- tool-computed
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists order_session_lines_session_idx on public.order_session_lines(order_session_id);

-- 3. order_session_events — append-only timeline (observability) --------------
create table if not exists public.order_session_events (
  id uuid primary key default gen_random_uuid(),
  order_session_id uuid not null references public.order_sessions(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists order_session_events_session_idx on public.order_session_events(order_session_id);

-- RLS — members read/write their tenant's sessions; the engine writes via the
-- service role (which bypasses RLS). Lines/events are gated through the parent.
alter table public.order_sessions enable row level security;
drop policy if exists order_sessions_rw on public.order_sessions;
create policy order_sessions_rw on public.order_sessions
  using (public.is_member_of(restaurant_id))
  with check (public.is_member_of(restaurant_id));

alter table public.order_session_lines enable row level security;
drop policy if exists order_session_lines_rw on public.order_session_lines;
create policy order_session_lines_rw on public.order_session_lines
  using (exists (select 1 from public.order_sessions s
                 where s.id = order_session_id and public.is_member_of(s.restaurant_id)))
  with check (exists (select 1 from public.order_sessions s
                      where s.id = order_session_id and public.is_member_of(s.restaurant_id)));

alter table public.order_session_events enable row level security;
drop policy if exists order_session_events_rw on public.order_session_events;
create policy order_session_events_rw on public.order_session_events
  using (exists (select 1 from public.order_sessions s
                 where s.id = order_session_id and public.is_member_of(s.restaurant_id)))
  with check (exists (select 1 from public.order_sessions s
                      where s.id = order_session_id and public.is_member_of(s.restaurant_id)));

-- Refresh PostgREST's schema cache so the new tables are queryable immediately.
notify pgrst, 'reload schema';
