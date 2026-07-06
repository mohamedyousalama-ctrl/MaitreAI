-- ============================================================================
-- MaitreAI — WO-CALLBACK «اطلب مكالمة» (0073) — ADDITIVE, PREPARE-ONLY (unapplied
-- until the off-peak batch). A customer who wants a phone conversation gets a HUMAN
-- callback; this table is the single source of truth for its status (Khalid never
-- claims a call happened — the status here does).
--
-- RLS: member SELECT via is_member_of; ALL WRITES are service-role only (the agent
-- capture path + the console status route), mirroring standing_instructions /
-- knowledge_change_requests. Feature-gated by feature_flags.callback_requests (OFF
-- by default; pilot = Dry-Run + Sweet Shop only, propose→GO).
-- ============================================================================

create table if not exists public.callback_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  customer_phone text not null,
  preferred_window text not null,            -- 'now' | 'within_hour' | 'evening'
  reason text not null default '',
  status text not null default 'open',       -- 'open' | 'called' | 'no_answer' | 'cancelled'
  created_at timestamptz not null default now(),
  handled_by uuid references public.members(id) on delete set null,
  handled_at timestamptz,
  constraint callback_requests_status_chk
    check (status in ('open', 'called', 'no_answer', 'cancelled')),
  constraint callback_requests_window_chk
    check (preferred_window in ('now', 'within_hour', 'evening'))
);

-- Open callbacks per tenant, newest first (the console rail + the agent capture read).
create index if not exists callback_requests_open_idx
  on public.callback_requests (restaurant_id, created_at desc)
  where status = 'open';

alter table public.callback_requests enable row level security;

-- Members of the tenant may READ their callbacks (console rail).
create policy callback_requests_read on public.callback_requests
  for select using (public.is_member_of(restaurant_id));
-- No INSERT/UPDATE/DELETE policy: all writes are service-role only (capture +
-- status route), mirroring standing_instructions. The service role bypasses RLS.
