-- ============================================================================
-- Kivo (KSA) — WO-3c: processed payment webhook events (event-dedup layer).
-- PREPARE-ONLY: NOT applied.
--
-- The Moyasar webhook is at-least-once AND can deliver out of order. WO-3b gave
-- us the settlement-layer idempotency (markPaymentSessionPaid is atomic; a repeat
-- is a no-op) + a terminal-state no-op in app code. This table adds the EVENT
-- layer: a UNIQUE (restaurant_id, event_id) guard so a re-delivered provider event
-- is recognized and processed exactly once (insert-first; a 23505 → already
-- processed → 200 no-op). Both layers together cover retries AND reordering.
--
-- Financial artifact: members may READ their tenant's processed-events (audit);
-- writes happen ONLY via the service role (the webhook), which bypasses RLS — no
-- client write policy (mirrors the financial-lockdown posture). Additive +
-- idempotent.
-- ============================================================================

create table if not exists public.processed_payment_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null default 'moyasar',
  -- The provider's own event id (Moyasar webhook top-level `id`; falls back to a
  -- composed key when absent). The dedup key is (restaurant_id, event_id).
  event_id text not null,
  -- The session this event settled (for traceability); SET NULL if the session is
  -- later removed.
  session_id uuid references public.payment_sessions(id) on delete set null,
  -- The mapped status this event carried (paid|failed|expired|…), for audit.
  event_status text,
  created_at timestamptz not null default now(),
  unique (restaurant_id, event_id)
);

create index if not exists processed_payment_events_restaurant_idx
  on public.processed_payment_events(restaurant_id, created_at desc);
create index if not exists processed_payment_events_session_idx
  on public.processed_payment_events(session_id);

-- RLS: members read their tenant's events; the service role (webhook) bypasses
-- RLS for writes. No client write policy (financial artifact).
alter table public.processed_payment_events enable row level security;
drop policy if exists processed_payment_events_read on public.processed_payment_events;
create policy processed_payment_events_read on public.processed_payment_events
  for select using (public.is_member_of(restaurant_id));

notify pgrst, 'reload schema';
